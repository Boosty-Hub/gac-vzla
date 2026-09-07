-- APLICADA EN PRODUCCION el 2026-09-07. Se deja registrada para trazabilidad.
-- Reparacion de datos del incidente vehiculo-cliente (ver 20260907210000_blindaje_dueno_vehiculo.sql).

-- =====================================================================================
--  REPARACION "CARTERA DE CLIENTES" — GAC Venezuela (proyecto wsbuqiznddvxcwvpnbxm)
--  Fecha: 2026-09-07
--  ESTADO: **NO EJECUTADO**. Revisar, ejecutar en psql o en el SQL Editor de Supabase.
--          NO ejecutar por trozos sueltos por la Management API: es UNA transaccion.
--
--  ALCANCE: SOLO los casos con dueño correcto CONFIRMADO por >= 2 evidencias
--           independientes y que sobrevivieron a la verificacion adversarial.
--           Los casos dudosos NO SE TOCAN (ver seccion "unresolved").
--
--  TOCA: 12 vehiculos, 10 prospectos, 4 encuestas, 3 decisiones de envio,
--        4 clientes duplicados desactivados, 1 flag is_fleet.  Total 34 filas.
--
--  IDEMPOTENTE: correrlo dos veces toca 0 filas la segunda vez. Cada UPDATE exige
--               que el dueño actual sea EXACTAMENTE el esperado; si alguien ya movio
--               la fila, la salta en vez de pisarla.
-- =====================================================================================

BEGIN;

SET LOCAL statement_timeout = '180s';

-- Abre la ventana del blindaje (guard_sql). Si el trigger de guarda todavia no esta
-- instalado, estas dos lineas son inocuas. Asi el script funciona en cualquier orden.
SET LOCAL gac.allow_vehicle_owner_change = 'reparacion-incidente-20260907';
SET LOCAL gac.vehicle_owner_reason       = 'Incidente register_won_prospect 2026-08-27/31: devolucion de vehiculos y fusion de duplicados';


-- =====================================================================================
-- 0. RESPALDO
--    OJO: "CREATE TABLE IF NOT EXISTS ... AS SELECT" NO refresca la tabla si ya existe.
--    Eso es deliberado: en una segunda corrida se conserva el estado PRE-reparacion.
--    Si necesitas un respaldo nuevo, usa otro sufijo de fecha.
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.backup_vehicles_20260907 AS
  SELECT id, client_id, plate, vin, driver_id, updated_at,
         unlinked_from_client_id, unlinked_at, unlinked_by
    FROM public.vehicles;

CREATE TABLE IF NOT EXISTS public.backup_clients_20260907 AS
  SELECT * FROM public.clients;

CREATE TABLE IF NOT EXISTS public.backup_prospects_20260907 AS
  SELECT id, client_id, sold_plate, status, status_updated_at, updated_at
    FROM public.prospects;

CREATE TABLE IF NOT EXISTS public.backup_surveys_20260907 AS
  SELECT id, client_id, vehicle_id, sold_plate, prospect_id, reservation_id
    FROM public.satisfaction_surveys;

CREATE TABLE IF NOT EXISTS public.backup_send_decisions_20260907 AS
  SELECT id, client_id, prospect_id FROM public.survey_send_decisions;

CREATE TABLE IF NOT EXISTS public.backup_reservations_20260907 AS
  SELECT id, client_id, vehicle_id, status, reservation_date FROM public.reservations;


-- =====================================================================================
-- 1. PLAN EXPLICITO. Todos los ids son literales. Cero heuristica dentro de los UPDATE.
-- =====================================================================================

-- 1.a  Vehiculos robados a un cliente AJENO (personas/empresas distintas).
CREATE TEMP TABLE plan_veh (
  plate          text PRIMARY KEY,
  vehicle_id     uuid NOT NULL,
  old_client_id  uuid,            -- dueño equivocado esperado HOY
  new_client_id  uuid NOT NULL,   -- dueño correcto confirmado
  motivo         text NOT NULL
) ON COMMIT DROP;

INSERT INTO plan_veh (plate, vehicle_id, old_client_id, new_client_id, motivo) VALUES
 ('A23DC3J','de99a2db-54cc-4c66-821c-f16f39a06ff9','1e169ef0-cdc5-463d-8f95-3b91ebb9656b','9075cb85-ee72-400b-8264-ec5a6326a18a',
  'Co-creado al microsegundo con NETCOM PLUS C.A (unico cliente en 2026-08-18 21:00:49.160155) + prospecto ganado company_name "Netcom Plus, C.A." con sold_plate=A23DC3J + log Kommo 2,66s despues del UPDATE'),
 ('A23DC4J','5d35d2f8-7a59-43c7-8c45-fa0dd70c9abe','1e169ef0-cdc5-463d-8f95-3b91ebb9656b','9075cb85-ee72-400b-8264-ec5a6326a18a',
  'Mismo lote de importacion (3 vehiculos / 1 cliente) y mismo UPDATE en bloque 2026-08-31 18:58:23.178288 que A23DC3J. Venta de flota is_fleet=true'),
 ('A23DC5J','bb5e53f5-40b3-4a2d-a674-bbbad7f60a2a','1e169ef0-cdc5-463d-8f95-3b91ebb9656b','9075cb85-ee72-400b-8264-ec5a6326a18a',
  'Mismo lote y mismo UPDATE en bloque que A23DC3J/4J. Placas consecutivas, mismo modelo DFSK D1 2026'),
 ('A97AR0R','883a13a1-365e-43c8-9fef-a21b6bf8f863','1e169ef0-cdc5-463d-8f95-3b91ebb9656b','cf41d377-f9d3-418e-ab1e-1ab23e74f4ee',
  'Lote limpio 1 vehiculo / 1 cliente al microsegundo (2026-08-19 17:00:53.167314) + el prospecto que lo robo se llama IGUAL que el cliente + modelo K01S BOX coincide con model_interest "DFSK C31 (Box)"'),
 ('A34CV9J','aacb0449-f537-480f-8a8c-f596d243a213','1e169ef0-cdc5-463d-8f95-3b91ebb9656b','682d1963-d64e-4203-ae48-246aa92d09d8',
  'Prospecto ganado person_type=juridica con company_name="MULTISERVICIOS JAML 32, C.A" y sold_plate=A34CV9J (match literal, unico cliente con ese nombre) + lote de 2, el hermano AO690EA sigue con ALI RAMON RUIZ'),
 ('A44DC3J','931b520a-0086-4f75-bda3-80a05a78c709','1b8c2b47-1cb4-44e6-a5ec-893a495e90ab','902754a7-ff3d-477b-9ad1-44d36e879480',
  'Prospecto ganado person_type=JURIDICA company_name="VARFLEX EMPAQUES FLEXIBLES C.A" sold_plate=A44DC3J + co-creacion 1v/1c + el cliente ladron se creo en el mismo microsegundo del robo y su email es varflexca@gmai.com'),
 ('AP123MB','bb6dffaf-7fab-4700-b2db-26fd9996f589','72a91320-986f-447f-9374-b40f6f7c5140','d9aece66-9e30-4a2b-a606-f854815e30de',
  'Las 2 reservas historicas del vehiculo (2026-08-27 y 2026-08-28, creadas por 2 personas distintas) apuntan a IFX + prospecto company_name="IFX NETWORK, C.A." + cliente "Antonio" creado en el mismo microsegundo del robo'),
 ('AP592GB','8727d741-46cb-48aa-9c18-5f043db7b186','66689205-9c11-4f0d-bfb2-55e2b6113a1f','d9aece66-9e30-4a2b-a606-f854815e30de',
  'Reserva historica 2026-07-21 (6 semanas antes) apunta a IFX + prospecto company_name="IFX NETWORK, C.A." + el correo corporativo de IFX es reinaldo.b@ifxnw.com.ve, o sea Reinaldo es el contacto');

-- 1.b  Fusiones de cliente duplicado (MISMA persona, dos fichas).
CREATE TEMP TABLE plan_merge (
  dup_id   uuid PRIMARY KEY,
  keep_id  uuid NOT NULL,
  etiqueta text NOT NULL
) ON COMMIT DROP;

INSERT INTO plan_merge (dup_id, keep_id, etiqueta) VALUES
 ('68540985-e10c-4ccb-a7c0-6fc3ac90be3e','e2322e34-a4dc-4b62-bea8-cf4413e822e8','Derly Martinez De Polanco -> DERLY MARTINEZ DE POLANCO (V140581867). Mismo tel +584128068606 y mismo email'),
 ('0bcbfa95-b158-415f-89a7-600293dfe38a','3a08f442-b710-4295-865e-fc43e78be02f','Luis Guzman -> LUIS JOSE GUZMAN AVENDANO (V182416181). Telefono normalizado identico 4244555494'),
 ('00afee70-a0c8-49a7-a7a4-935877639055','d227e48c-c80a-486c-a923-9994b8806296','Oscar Casal -> OSCAR RAUL CASAL RODRIGUEZ (V150719298). Misma placa AP585GB en prospecto y reserva, mismo concesionario'),
 ('fd66493b-d80a-4cb2-ad15-81d8aba38c9a','c2d945b3-b27d-4ac6-a686-7b516863af81','Jose Miguel Lumbano Palma -> JOSE MIGUEL LUMBANO PALMA (V205117918). Telefonos 4144035024 / 4144035420 (transposicion)');

-- 1.c  Vehiculo huerfano.
CREATE TEMP TABLE plan_orphan (
  plate         text PRIMARY KEY,
  vehicle_id    uuid NOT NULL,
  new_client_id uuid NOT NULL,
  motivo        text NOT NULL
) ON COMMIT DROP;

INSERT INTO plan_orphan VALUES
 ('A84DU8M','4a797763-7147-4e3e-a711-b9d2b971db2b','e2322e34-a4dc-4b62-bea8-cf4413e822e8',
  'Co-creado al microsegundo (2026-08-24 19:00:47.703919) con la DERLY real, sin empate en toda la tabla. Fue desvinculado del DUPLICADO 68540985, no de la real');

-- 1.d  Repunte de prospectos (todos con id explicito).
CREATE TEMP TABLE plan_pros (prospect_id uuid PRIMARY KEY, old_client_id uuid, new_client_id uuid NOT NULL, nota text) ON COMMIT DROP;
INSERT INTO plan_pros VALUES
 ('9205cea4-6280-4262-8a1c-7eb9cbf0af1c','1e169ef0-cdc5-463d-8f95-3b91ebb9656b','9075cb85-ee72-400b-8264-ec5a6326a18a','Ramon Bascom / Netcom Plus C.A - A23DC3J'),
 ('539100ef-c307-446c-ae86-ea257699732f','1e169ef0-cdc5-463d-8f95-3b91ebb9656b','682d1963-d64e-4203-ae48-246aa92d09d8','Jona Millan / MULTISERVICIOS JAML 32 - A34CV9J'),
 ('5aad87a6-43a7-4d7c-92b8-62c98843a177','1e169ef0-cdc5-463d-8f95-3b91ebb9656b','cf41d377-f9d3-418e-ab1e-1ab23e74f4ee','LUIS GUILLERMO RUIZ ALVAREZ - A97AR0R'),
 ('7cd836e1-c2ad-41aa-865e-8242f3bff9fb','1b8c2b47-1cb4-44e6-a5ec-893a495e90ab','902754a7-ff3d-477b-9ad1-44d36e879480','ANDRES ARTEAGA / VARFLEX - A44DC3J'),
 ('29609879-ce44-4aad-8ff6-9cf81a897250','72a91320-986f-447f-9374-b40f6f7c5140','d9aece66-9e30-4a2b-a606-f854815e30de','Antonio / IFX NETWORK - AP123MB'),
 ('25977c80-a50f-4ee6-9bd5-40fd4a754175','66689205-9c11-4f0d-bfb2-55e2b6113a1f','d9aece66-9e30-4a2b-a606-f854815e30de','Reinaldo Battistella / IFX NETWORK - AP592GB'),
 ('aeb4d7a9-d168-4164-b371-5849443f62e0','68540985-e10c-4ccb-a7c0-6fc3ac90be3e','e2322e34-a4dc-4b62-bea8-cf4413e822e8','Derly - A84DU8M (fusion)'),
 ('d062c694-08d8-4f27-a49a-1b6ac74ca968','0bcbfa95-b158-415f-89a7-600293dfe38a','3a08f442-b710-4295-865e-fc43e78be02f','Luis Guzman - A99DD6J (fusion)'),
 ('c1a94bcc-67d0-4671-a639-52579ab50953','00afee70-a0c8-49a7-a7a4-935877639055','d227e48c-c80a-486c-a923-9994b8806296','Oscar Casal - AP585GB (fusion)'),
 ('fb1e12b5-1dcd-4bd0-a576-0c7516801b5a','fd66493b-d80a-4cb2-ad15-81d8aba38c9a','c2d945b3-b27d-4ac6-a686-7b516863af81','Lumbano - A84DEU9M (fusion)');

-- 1.e  Repunte de encuestas y de decisiones de envio (ids explicitos).
CREATE TEMP TABLE plan_surv (survey_id uuid PRIMARY KEY, old_client_id uuid, new_client_id uuid NOT NULL) ON COMMIT DROP;
INSERT INTO plan_surv VALUES
 ('3336b381-7afb-4573-ab0e-d3c7f0ee114e','1e169ef0-cdc5-463d-8f95-3b91ebb9656b','9075cb85-ee72-400b-8264-ec5a6326a18a'), -- A23DC3J
 ('a4f19bda-fab1-4326-aa0b-fc67f46ae68c','1b8c2b47-1cb4-44e6-a5ec-893a495e90ab','902754a7-ff3d-477b-9ad1-44d36e879480'), -- A44DC3J
 ('6db190fd-a1e5-4d85-a9d2-05aa0b9fdf04','68540985-e10c-4ccb-a7c0-6fc3ac90be3e','e2322e34-a4dc-4b62-bea8-cf4413e822e8'), -- A84DU8M
 ('39f2b335-c4ee-472b-9c80-cb680d590e8f','0bcbfa95-b158-415f-89a7-600293dfe38a','3a08f442-b710-4295-865e-fc43e78be02f'); -- A99DD6J

CREATE TEMP TABLE plan_dec (decision_id uuid PRIMARY KEY, old_client_id uuid, new_client_id uuid NOT NULL) ON COMMIT DROP;
INSERT INTO plan_dec VALUES
 ('644c4821-027b-425e-afb4-47ea2beb37e1','1e169ef0-cdc5-463d-8f95-3b91ebb9656b','682d1963-d64e-4203-ae48-246aa92d09d8'), -- Jona Millan / JAML
 ('1490cc23-27fd-4df5-af97-b5ea165c2d0c','68540985-e10c-4ccb-a7c0-6fc3ac90be3e','e2322e34-a4dc-4b62-bea8-cf4413e822e8'), -- Derly
 ('069af090-e8dc-4efd-81e8-636555a28d60','fd66493b-d80a-4cb2-ad15-81d8aba38c9a','c2d945b3-b27d-4ac6-a686-7b516863af81'); -- Lumbano


-- =====================================================================================
-- 2. SELECT DE CONTROL — QUE VA A PASAR. Leelo ANTES de dejar que llegue al COMMIT.
--    Si "van_a_cambiar" no coincide con "plan", ALGO CAMBIO desde el diagnostico:
--    hace ROLLBACK y volve a auditar.
-- =====================================================================================
SELECT '01 vehiculos robados'      AS bloque, count(*) AS plan,
       count(*) FILTER (WHERE v.client_id IS NOT DISTINCT FROM p.old_client_id
                          AND v.client_id IS DISTINCT FROM p.new_client_id) AS van_a_cambiar,
       count(*) FILTER (WHERE v.client_id IS NOT DISTINCT FROM p.new_client_id) AS ya_ok,
       count(*) FILTER (WHERE v.client_id IS DISTINCT FROM p.old_client_id
                          AND v.client_id IS DISTINCT FROM p.new_client_id) AS INESPERADO
  FROM plan_veh p JOIN public.vehicles v ON v.id = p.vehicle_id
UNION ALL
SELECT '02 vehiculos en duplicados', (SELECT count(*) FROM plan_merge),
       (SELECT count(*) FROM public.vehicles v JOIN plan_merge m ON m.dup_id = v.client_id), 0, 0
UNION ALL
SELECT '03 huerfano A84DU8M', 1,
       (SELECT count(*) FROM plan_orphan o JOIN public.vehicles v ON v.id = o.vehicle_id WHERE v.client_id IS NULL),
       (SELECT count(*) FROM plan_orphan o JOIN public.vehicles v ON v.id = o.vehicle_id WHERE v.client_id IS NOT DISTINCT FROM o.new_client_id), 0
UNION ALL
SELECT '04 prospectos', (SELECT count(*) FROM plan_pros),
       (SELECT count(*) FROM plan_pros p JOIN public.prospects x ON x.id = p.prospect_id
         WHERE x.client_id IS NOT DISTINCT FROM p.old_client_id),
       (SELECT count(*) FROM plan_pros p JOIN public.prospects x ON x.id = p.prospect_id
         WHERE x.client_id IS NOT DISTINCT FROM p.new_client_id), 0
UNION ALL
SELECT '05 encuestas', (SELECT count(*) FROM plan_surv),
       (SELECT count(*) FROM plan_surv s JOIN public.satisfaction_surveys x ON x.id = s.survey_id
         WHERE x.client_id IS NOT DISTINCT FROM s.old_client_id),
       (SELECT count(*) FROM plan_surv s JOIN public.satisfaction_surveys x ON x.id = s.survey_id
         WHERE x.client_id IS NOT DISTINCT FROM s.new_client_id), 0
UNION ALL
SELECT '06 decisiones de envio', (SELECT count(*) FROM plan_dec),
       (SELECT count(*) FROM plan_dec d JOIN public.survey_send_decisions x ON x.id = d.decision_id
         WHERE x.client_id IS NOT DISTINCT FROM d.old_client_id),
       (SELECT count(*) FROM plan_dec d JOIN public.survey_send_decisions x ON x.id = d.decision_id
         WHERE x.client_id IS NOT DISTINCT FROM d.new_client_id), 0
UNION ALL
SELECT '07 duplicados a desactivar', (SELECT count(*) FROM plan_merge),
       (SELECT count(*) FROM plan_merge m JOIN public.clients c ON c.id = m.dup_id WHERE c.is_active), 0, 0
ORDER BY 1;

-- Detalle placa por placa, para leerlo en voz alta con el admin.
SELECT p.plate,
       co.full_name AS dueno_hoy, co.cedula AS ced_hoy,
       cn.full_name AS dueno_correcto, cn.cedula AS ced_correcta,
       CASE WHEN v.client_id IS NOT DISTINCT FROM p.new_client_id THEN 'YA REPARADO'
            WHEN v.client_id IS NOT DISTINCT FROM p.old_client_id THEN 'SE REPARA AHORA'
            ELSE '*** INESPERADO: NO SE TOCA ***' END AS accion,
       p.motivo
  FROM plan_veh p
  JOIN public.vehicles v ON v.id = p.vehicle_id
  LEFT JOIN public.clients co ON co.id = v.client_id
  LEFT JOIN public.clients cn ON cn.id = p.new_client_id
 ORDER BY p.plate;


-- =====================================================================================
-- 3. BLOQUE A — DEVOLVER LOS VEHICULOS ROBADOS (8 filas)
--    Doble candado: solo si el dueño actual es EXACTAMENTE el esperado y distinto del
--    destino. Si alguien ya lo movio a otro lado, no lo pisa.
-- =====================================================================================
UPDATE public.vehicles v
   SET client_id = p.new_client_id
  FROM plan_veh p
 WHERE v.id = p.vehicle_id
   AND v.client_id IS NOT DISTINCT FROM p.old_client_id
   AND v.client_id IS DISTINCT FROM p.new_client_id;


-- =====================================================================================
-- 4. BLOQUE B — FUSION DE CLIENTES DUPLICADOS
--    Orden obligatorio: PRIMERO se mueve todo lo que cuelga, DESPUES se desactiva la
--    ficha duplicada. NUNCA al reves: vehicles_client_id_fkey es ON DELETE CASCADE.
-- =====================================================================================

-- 4.1 Vehiculos del duplicado -> cliente real (3 filas: A99DD6J, AP585GB, A84DEU9M)
UPDATE public.vehicles v
   SET client_id = m.keep_id
  FROM plan_merge m
 WHERE v.client_id = m.dup_id;

-- 4.2 Reservas (hoy 0 filas; se deja por completitud e idempotencia)
UPDATE public.reservations r
   SET client_id = m.keep_id
  FROM plan_merge m
 WHERE r.client_id = m.dup_id;

-- 4.3 Choferes, accesos de portal y sesiones externas (hoy 0 filas, son ON DELETE CASCADE:
--     moverlos antes de tocar la ficha duplicada es lo que impide perderlos)
UPDATE public.drivers d
   SET client_id = m.keep_id
  FROM plan_merge m
 WHERE d.client_id = m.dup_id;

UPDATE public.client_users cu
   SET client_id = m.keep_id
  FROM plan_merge m
 WHERE cu.client_id = m.dup_id;

UPDATE public.external_portal_sessions e
   SET client_id = m.keep_id
  FROM plan_merge m
 WHERE e.client_id = m.dup_id;

-- 4.4 Enriquecer la ficha real con los datos que solo tenia el duplicado
--     (nunca pisa un dato existente: solo rellena NULL). Ids explicitos.
UPDATE public.clients k
   SET email            = COALESCE(k.email, d.email),
       "IdContactKommo" = COALESCE(k."IdContactKommo", d."IdContactKommo"),
       kommo_conversation_lead_id = COALESCE(k.kommo_conversation_lead_id, d.kommo_conversation_lead_id)
  FROM plan_merge m
  JOIN public.clients d ON d.id = m.dup_id
 WHERE k.id = m.keep_id
   AND (k.email IS NULL OR k."IdContactKommo" IS NULL OR k.kommo_conversation_lead_id IS NULL);


-- =====================================================================================
-- 5. BLOQUE C — DEVOLVER EL VEHICULO HUERFANO A84DU8M A LA DERLY REAL
--    Se limpia el rastro de desvinculacion porque ya cumplio su funcion.
-- =====================================================================================
UPDATE public.vehicles v
   SET client_id = o.new_client_id,
       unlinked_from_client_id = NULL,
       unlinked_at = NULL,
       unlinked_by = NULL
  FROM plan_orphan o
 WHERE v.id = o.vehicle_id
   AND v.client_id IS NULL;


-- =====================================================================================
-- 6. BLOQUE D — REPUNTAR PROSPECTOS, ENCUESTAS Y DECISIONES DE ENVIO
--    Hay que hacerlo: los backfills 10fe327 y c0eaf15 los dejaron apuntando al ladron.
-- =====================================================================================
UPDATE public.prospects x
   SET client_id = p.new_client_id
  FROM plan_pros p
 WHERE x.id = p.prospect_id
   AND x.client_id IS NOT DISTINCT FROM p.old_client_id
   AND x.client_id IS DISTINCT FROM p.new_client_id;

UPDATE public.satisfaction_surveys x
   SET client_id = s.new_client_id
  FROM plan_surv s
 WHERE x.id = s.survey_id
   AND x.client_id IS NOT DISTINCT FROM s.old_client_id
   AND x.client_id IS DISTINCT FROM s.new_client_id;

UPDATE public.survey_send_decisions x
   SET client_id = d.new_client_id
  FROM plan_dec d
 WHERE x.id = d.decision_id
   AND x.client_id IS NOT DISTINCT FROM d.old_client_id
   AND x.client_id IS DISTINCT FROM d.new_client_id;


-- =====================================================================================
-- 7. BLOQUE E — DESACTIVAR (NO BORRAR) LOS 4 DUPLICADOS
--    Se desactivan, no se borran, por dos razones:
--      (a) vehicles_client_id_fkey es ON DELETE CASCADE: un DELETE mal puesto destruye
--          vehiculos en silencio;
--      (b) desactivar es reversible y deja rastro. Aparecen como "Inactivo" en
--          /admin/clientes. El borrado definitivo esta al final, opcional y blindado.
--    Guarda dura: solo desactiva si al duplicado ya no le cuelga NADA.
-- =====================================================================================
UPDATE public.clients c
   SET is_active = false
  FROM plan_merge m
 WHERE c.id = m.dup_id
   AND c.is_active
   AND NOT EXISTS (SELECT 1 FROM public.vehicles     WHERE client_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM public.reservations WHERE client_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM public.drivers      WHERE client_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM public.client_users WHERE client_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM public.external_portal_sessions WHERE client_id = c.id);


-- =====================================================================================
-- 8. BLOQUE F — CORRECCION DE FLOTA
--    NETCOM PLUS recupera 3 unidades: pasa a ser cliente de flota, como IFX.
-- =====================================================================================
UPDATE public.clients
   SET is_fleet = true
 WHERE id = '9075cb85-ee72-400b-8264-ec5a6326a18a'
   AND is_fleet IS DISTINCT FROM true;


-- =====================================================================================
-- 9. VERIFICACION FINAL. Todo tiene que dar 'OK'. Si algo da 'REVISAR' -> ROLLBACK.
-- =====================================================================================
SELECT p.plate,
       cn.full_name AS dueno_esperado,
       cr.full_name AS dueno_real_ahora,
       CASE WHEN v.client_id IS NOT DISTINCT FROM p.new_client_id THEN 'OK' ELSE 'REVISAR' END AS estado
  FROM plan_veh p
  JOIN public.vehicles v ON v.id = p.vehicle_id
  LEFT JOIN public.clients cn ON cn.id = p.new_client_id
  LEFT JOIN public.clients cr ON cr.id = v.client_id
UNION ALL
SELECT o.plate, cn.full_name, cr.full_name,
       CASE WHEN v.client_id IS NOT DISTINCT FROM o.new_client_id THEN 'OK' ELSE 'REVISAR' END
  FROM plan_orphan o
  JOIN public.vehicles v ON v.id = o.vehicle_id
  LEFT JOIN public.clients cn ON cn.id = o.new_client_id
  LEFT JOIN public.clients cr ON cr.id = v.client_id
ORDER BY 1;

-- Las victimas ya no pueden quedar en cero.
SELECT c.full_name, c.cedula, count(v.id) AS vehiculos,
       CASE WHEN count(v.id) > 0 THEN 'OK' ELSE 'REVISAR' END AS estado
  FROM public.clients c
  LEFT JOIN public.vehicles v ON v.client_id = c.id
 WHERE c.id IN ('9075cb85-ee72-400b-8264-ec5a6326a18a',  -- NETCOM PLUS (esperado 3)
                'cf41d377-f9d3-418e-ab1e-1ab23e74f4ee',  -- LUIS GUILLERMO RUIZ (1)
                '682d1963-d64e-4203-ae48-246aa92d09d8',  -- MULTISERVICIOS JAML 32 (1)
                '902754a7-ff3d-477b-9ad1-44d36e879480',  -- VARFLEX (1)
                'd9aece66-9e30-4a2b-a606-f854815e30de',  -- IFX (5)
                'e2322e34-a4dc-4b62-bea8-cf4413e822e8',  -- DERLY real (1)
                '3a08f442-b710-4295-865e-fc43e78be02f',  -- LUIS JOSE GUZMAN (1)
                'd227e48c-c80a-486c-a923-9994b8806296',  -- OSCAR RAUL CASAL (1)
                'c2d945b3-b27d-4ac6-a686-7b516863af81')  -- LUMBANO (2: incluye el fantasma)
 GROUP BY c.id, c.full_name, c.cedula ORDER BY c.full_name;

-- Ya no puede quedar ningun huerfano ni ningun duplicado con datos colgando.
SELECT 'huerfanos' AS chequeo, count(*) AS n, CASE WHEN count(*)=0 THEN 'OK' ELSE 'REVISAR' END AS estado
  FROM public.vehicles WHERE client_id IS NULL
UNION ALL
SELECT 'duplicados con algo colgando', count(*), CASE WHEN count(*)=0 THEN 'OK' ELSE 'REVISAR' END
  FROM plan_merge m
 WHERE EXISTS (SELECT 1 FROM public.vehicles     WHERE client_id = m.dup_id)
    OR EXISTS (SELECT 1 FROM public.reservations WHERE client_id = m.dup_id)
    OR EXISTS (SELECT 1 FROM public.prospects    WHERE client_id = m.dup_id)
    OR EXISTS (SELECT 1 FROM public.satisfaction_surveys WHERE client_id = m.dup_id);

-- Elio Vincent debe quedar con SOLO los 4 vehiculos no resueltos:
-- AO693EA, AI384BD, A98AR6R y A92DU3M. Cualquier otro numero = REVISAR.
SELECT 'Elio Vincent (esperado 4)' AS chequeo, count(*) AS n,
       string_agg(plate, ', ' ORDER BY plate) AS placas,
       CASE WHEN count(*)=4 THEN 'OK' ELSE 'REVISAR' END AS estado
  FROM public.vehicles WHERE client_id = '1e169ef0-cdc5-463d-8f95-3b91ebb9656b';

COMMIT;
-- Si algo dio 'REVISAR' arriba: ROLLBACK; en vez de COMMIT;


-- =====================================================================================
-- BLOQUE OPCIONAL, **APARTE Y POSTERIOR** — BORRADO DEFINITIVO DE LOS 4 DUPLICADOS
-- Correr SOLO si el admin confirma que no quiere verlos ni siquiera como "Inactivo",
-- y SOLO despues de haber instalado el blindaje (guard_sql), que cambia
-- vehicles_client_id_fkey a ON DELETE RESTRICT. Hoy, con CASCADE vivo, un DELETE
-- aqui puede llevarse vehiculos por delante. El DO $$ aborta si queda cualquier
-- dependencia. NO EJECUTAR A CIEGAS.
-- =====================================================================================
-- BEGIN;
-- DO $$
-- DECLARE d uuid; n int;
-- BEGIN
--   FOREACH d IN ARRAY ARRAY['68540985-e10c-4ccb-a7c0-6fc3ac90be3e',
--                            '0bcbfa95-b158-415f-89a7-600293dfe38a',
--                            '00afee70-a0c8-49a7-a7a4-935877639055',
--                            'fd66493b-d80a-4cb2-ad15-81d8aba38c9a']::uuid[]
--   LOOP
--     SELECT (SELECT count(*) FROM public.vehicles WHERE client_id=d)
--          + (SELECT count(*) FROM public.reservations WHERE client_id=d)
--          + (SELECT count(*) FROM public.drivers WHERE client_id=d)
--          + (SELECT count(*) FROM public.client_users WHERE client_id=d)
--          + (SELECT count(*) FROM public.external_portal_sessions WHERE client_id=d)
--          + (SELECT count(*) FROM public.prospects WHERE client_id=d)
--          + (SELECT count(*) FROM public.satisfaction_surveys WHERE client_id=d)
--          + (SELECT count(*) FROM public.survey_send_decisions WHERE client_id=d) INTO n;
--     IF n > 0 THEN RAISE EXCEPTION 'ABORTADO: al cliente % todavia le cuelgan % filas', d, n; END IF;
--     DELETE FROM public.clients WHERE id = d;
--   END LOOP;
-- END $$;
-- COMMIT;