-- APLICADA EN PRODUCCION el 2026-09-15.
-- Criterio: la base que manda GAC es la verdadera y la mas actualizada.
--
-- 1. ROXIBEL JOSE GELVEZ HERNANDEZ: GAC manda hoy la ficha V208594857; la V20859485 dejo de
--    llegar despues de la sincronizacion del 26/08. Se conserva la de GAC con los dos vehiculos.
-- 2. JOSE DOMINGO DIAZ CHIARINE: la ficha J159715066 esta vacia pero la sincronizacion de GAC la
--    reactiva cada vez que corre. Se marca como fusionada en la V159715066 y un trigger impide que
--    un proceso externo la vuelva a activar.
-- 3. ENRIQUE SULTAN (sin cedula, creada por la app) es la misma persona que ENRIQUE SULTAN COHEN
--    (V147750745, mismo telefono) y su GLORY 500 sin placa es el AH958OD que manda GAC. Su cita
--    pasa al vehiculo real y la copia se borra.
-- 4. JEAN CARLOS BATMAN: no existe en GAC y sus dos vehiculos no tienen placa ni VIN. Se borran los
--    vehiculos; sus dos servicios completados quedan en el historial del cliente sin vehiculo.
--
-- merged_into_client_id va sin FK a proposito: una segunda relacion hacia clients es lo que
-- rompio PostgREST con PGRST201 el 2026-09-01.

BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '10s';
SET LOCAL gac.allow_vehicle_owner_change = 'clientes:merge';
SET LOCAL gac.vehicle_owner_reason = 'Fusion de ROXIBEL GELVEZ hacia la ficha que manda GAC (V208594857)';

CREATE TABLE IF NOT EXISTS forensics.clients_20260915b      AS SELECT * FROM public.clients;
CREATE TABLE IF NOT EXISTS forensics.vehicles_20260915b     AS SELECT * FROM public.vehicles;
CREATE TABLE IF NOT EXISTS forensics.reservations_20260915b AS SELECT id, client_id, vehicle_id, status, reservation_date FROM public.reservations;
CREATE TABLE IF NOT EXISTS forensics.surveys_20260915b      AS SELECT id, client_id, vehicle_id, prospect_id, reservation_id FROM public.satisfaction_surveys;

CREATE TEMP TABLE conteo_antes ON COMMIT DROP AS
SELECT (SELECT count(*) FROM public.vehicles) AS vehiculos,
       (SELECT count(*) FROM public.reservations) AS reservas,
       (SELECT count(*) FROM public.satisfaction_surveys) AS encuestas,
       (SELECT count(*) FROM public.prospects) AS prospectos;

-- ===== CANDADO: una ficha fusionada no revive =====
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS merged_into_client_id uuid;

CREATE OR REPLACE FUNCTION public.tg_clients_keep_merged_inactive()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF OLD.merged_into_client_id IS NOT NULL AND NEW.is_active AND NOT OLD.is_active THEN
    -- Un admin que la reactiva desde el panel lo hace a proposito: se respeta y se quita la marca.
    -- Cualquier otro proceso (la sincronizacion de GAC) no la puede revivir, y no se lanza error
    -- para no tumbarle el lote entero.
    IF public.is_admin_user() THEN
      NEW.merged_into_client_id := NULL;
    ELSE
      NEW.is_active := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_keep_merged_inactive ON public.clients;
CREATE TRIGGER trg_clients_keep_merged_inactive
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.tg_clients_keep_merged_inactive();

-- admin_merge_clients deja la marca en el duplicado.
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.admin_merge_clients(uuid,uuid,text)'::regprocedure) INTO d;
  IF position('merged_into_client_id' in d) = 0 THEN
    d := replace(d,
      'SET is_active = false WHERE id = p_dup_id',
      'SET is_active = false, merged_into_client_id = p_keep_id WHERE id = p_dup_id');
    IF position('merged_into_client_id' in d) = 0 THEN
      RAISE EXCEPTION 'ABORTADO: no se encontro el punto de desactivacion en admin_merge_clients';
    END IF;
    EXECUTE d;
  END IF;
END $$;

-- ===== Candado de entrada =====
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = '8b880ec4-ea77-476f-abcd-5798f01c8da4' AND cedula = 'V208594857' AND is_active) THEN
    RAISE EXCEPTION 'ABORTADO: la ficha de GAC de ROXIBEL no esta como se diagnostico'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vehicles WHERE id = '8471bad5-c46a-4baf-925c-ba4612903d64' AND client_id = '464d310d-4008-4420-a481-d0defc26794b') THEN
    RAISE EXCEPTION 'ABORTADO: AB120IH ya no esta en la ficha vieja de ROXIBEL'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = 'dae2440b-a75a-4dde-9433-59b34883487a' AND cedula = 'V159715066' AND is_active) THEN
    RAISE EXCEPTION 'ABORTADO: la ficha V de JOSE DOMINGO no esta activa'; END IF;
  IF EXISTS (SELECT 1 FROM public.vehicles WHERE client_id = 'c83239c1-70c8-4999-8a6f-7930d8f2f673') THEN
    RAISE EXCEPTION 'ABORTADO: la ficha J de JOSE DOMINGO tiene vehiculos'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vehicles WHERE id = '46efc6da-a145-4ddc-92dd-518e83232816' AND client_id = 'c62d0644-85e3-475a-9217-13ea6572e083' AND plate = 'AH958OD') THEN
    RAISE EXCEPTION 'ABORTADO: AH958OD no esta en ENRIQUE SULTAN COHEN'; END IF;
  IF (SELECT count(*) FROM public.vehicles WHERE id IN ('15da8908-3ec3-47ce-98c1-3236f62dae00','0d5d9dda-1ad4-4a07-bc37-3fce2a9fd733','495c8255-300f-4fce-b63a-149808231536')
        AND nullif(trim(plate),'') IS NULL AND nullif(trim(vin),'') IS NULL) <> 3 THEN
    RAISE EXCEPTION 'ABORTADO: los 3 vehiculos fuera de GAC no estan como se diagnosticaron'; END IF;
END $$;

ALTER TABLE public.reservations DISABLE TRIGGER "WebhookReservas";

-- ===== 1. ROXIBEL =====
UPDATE public.vehicles SET client_id = '8b880ec4-ea77-476f-abcd-5798f01c8da4'
 WHERE client_id = '464d310d-4008-4420-a481-d0defc26794b';
UPDATE public.reservations          SET client_id = '8b880ec4-ea77-476f-abcd-5798f01c8da4' WHERE client_id = '464d310d-4008-4420-a481-d0defc26794b';
UPDATE public.prospects             SET client_id = '8b880ec4-ea77-476f-abcd-5798f01c8da4' WHERE client_id = '464d310d-4008-4420-a481-d0defc26794b';
UPDATE public.satisfaction_surveys  SET client_id = '8b880ec4-ea77-476f-abcd-5798f01c8da4' WHERE client_id = '464d310d-4008-4420-a481-d0defc26794b';
UPDATE public.survey_send_decisions SET client_id = '8b880ec4-ea77-476f-abcd-5798f01c8da4' WHERE client_id = '464d310d-4008-4420-a481-d0defc26794b';
UPDATE public.clients k
   SET "IdContactKommo" = COALESCE(k."IdContactKommo", d."IdContactKommo"),
       email = COALESCE(k.email, d.email),
       address = COALESCE(k.address, d.address)
  FROM public.clients d
 WHERE k.id = '8b880ec4-ea77-476f-abcd-5798f01c8da4' AND d.id = '464d310d-4008-4420-a481-d0defc26794b';
UPDATE public.clients SET is_active = false, merged_into_client_id = '8b880ec4-ea77-476f-abcd-5798f01c8da4'
 WHERE id = '464d310d-4008-4420-a481-d0defc26794b';

-- ===== 2. JOSE DOMINGO =====
UPDATE public.clients SET is_active = false, merged_into_client_id = 'dae2440b-a75a-4dde-9433-59b34883487a'
 WHERE id = 'c83239c1-70c8-4999-8a6f-7930d8f2f673';

-- ===== 3. ENRIQUE SULTAN =====
UPDATE public.reservations SET vehicle_id = '46efc6da-a145-4ddc-92dd-518e83232816'
 WHERE vehicle_id = '15da8908-3ec3-47ce-98c1-3236f62dae00';
UPDATE public.reservations          SET client_id = 'c62d0644-85e3-475a-9217-13ea6572e083' WHERE client_id = '48ec0422-f763-4036-8721-ccf231f58c8f';
UPDATE public.prospects             SET client_id = 'c62d0644-85e3-475a-9217-13ea6572e083' WHERE client_id = '48ec0422-f763-4036-8721-ccf231f58c8f';
UPDATE public.satisfaction_surveys  SET client_id = 'c62d0644-85e3-475a-9217-13ea6572e083' WHERE client_id = '48ec0422-f763-4036-8721-ccf231f58c8f';
UPDATE public.survey_send_decisions SET client_id = 'c62d0644-85e3-475a-9217-13ea6572e083' WHERE client_id = '48ec0422-f763-4036-8721-ccf231f58c8f';
UPDATE public.satisfaction_surveys  SET vehicle_id = '46efc6da-a145-4ddc-92dd-518e83232816' WHERE vehicle_id = '15da8908-3ec3-47ce-98c1-3236f62dae00';

-- ===== 4. JEAN CARLOS BATMAN =====
UPDATE public.reservations SET vehicle_id = NULL
 WHERE vehicle_id IN ('0d5d9dda-1ad4-4a07-bc37-3fce2a9fd733','495c8255-300f-4fce-b63a-149808231536');

-- ===== Sacar los 3 vehiculos =====
DELETE FROM public.vehicles
 WHERE id IN ('15da8908-3ec3-47ce-98c1-3236f62dae00','0d5d9dda-1ad4-4a07-bc37-3fce2a9fd733','495c8255-300f-4fce-b63a-149808231536');

UPDATE public.clients c SET is_active = false, merged_into_client_id = 'c62d0644-85e3-475a-9217-13ea6572e083'
 WHERE c.id = '48ec0422-f763-4036-8721-ccf231f58c8f'
   AND NOT EXISTS (SELECT 1 FROM public.vehicles     WHERE client_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM public.reservations WHERE client_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM public.prospects    WHERE client_id = c.id);

ALTER TABLE public.reservations ENABLE TRIGGER "WebhookReservas";

-- Las fusiones ya hechas tambien quedan protegidas contra la reactivacion.
UPDATE public.clients c SET merged_into_client_id = m.keep_id
  FROM (VALUES
    ('68540985-e10c-4ccb-a7c0-6fc3ac90be3e'::uuid,'e2322e34-a4dc-4b62-bea8-cf4413e822e8'::uuid),
    ('0bcbfa95-b158-415f-89a7-600293dfe38a','3a08f442-b710-4295-865e-fc43e78be02f'),
    ('00afee70-a0c8-49a7-a7a4-935877639055','d227e48c-c80a-486c-a923-9994b8806296'),
    ('fd66493b-d80a-4cb2-ad15-81d8aba38c9a','c2d945b3-b27d-4ac6-a686-7b516863af81'),
    ('aa47dbf8-28f6-4c32-a64f-c1a6772c0f4d','f856b3b4-28c2-4684-ab0a-542a7fef2aff'),
    ('c4a4481f-a7aa-477f-b9df-e7a4689b6c9d','fae51f20-62a3-46e9-ba75-963447474aee'),
    ('e0848d74-9828-435a-8d77-7d9db4360a19','09864f23-2421-4ece-9692-05829d102655'),
    ('559a304a-cc43-44f5-9303-5dcb77bbab10','e7ae04a5-4fd3-423f-8a7f-d596445b4cb8'),
    ('492b9eb3-b7b9-4202-9acb-da2ceb1c2f80','5584c3a8-19e5-4f49-867e-b101b642d6dc'),
    ('fe06b0e3-de67-41a9-9570-0e867dab7e97','85b768b8-3b32-435c-862b-c5edde3a83dd'),
    ('f4c0aa16-de5a-41d8-a8a6-926bb326ee76','093d09a4-43b5-460c-a07c-1226eb93cabe'),
    ('0ad79e81-f656-49f9-93d0-e979ab1a0a98','95e56243-6d04-4d0d-8ad8-c745f1843d51'),
    ('f4f660fb-88a7-4bc4-bc3e-c061acc060dd','0a5d2d48-f792-43c7-953a-d223992bc56e'),
    ('05af572d-4ecf-4062-82ab-f3c76613ed0f','a3086991-6022-4124-be01-f06f0ab86520'),
    ('6a33ec55-ab03-4092-a614-6845c3d6c1e1','f7906ad1-96c6-4a01-b66d-d6d93066146a'),
    ('ebe43898-b79c-4aa7-a815-ba1dc5805746','06ee6413-1584-4b25-b28c-9062043edb9c'),
    ('2195d8a0-2558-48de-809e-66913469c335','2215d118-b695-4934-8b0d-528f0915ea6c'),
    ('d9b410d7-a056-49a4-987b-d70063fa1dc2','5906527d-2cb5-4051-812f-c9480f3ae035'),
    ('36659701-477e-4cdd-96e8-cf397babcc7a','9a077a3e-4a6c-4677-8275-84a97adfb180'),
    ('4738091f-93a5-43eb-bbdb-2acd411381ef','c4661af8-d450-46b1-b7f7-27b391fcca4f'),
    ('955b85d8-edee-401c-bbb2-8439bb5786be','619a3cf2-0ece-4787-bc4b-ec36aeaa7391')
  ) AS m(dup_id, keep_id)
 WHERE c.id = m.dup_id AND NOT c.is_active AND c.merged_into_client_id IS NULL;

-- ===== Candado de salida =====
DO $$
DECLARE a record;
BEGIN
  SELECT * INTO a FROM conteo_antes;
  IF (SELECT count(*) FROM public.vehicles) <> a.vehiculos - 3 THEN RAISE EXCEPTION 'ABORTADO: total de vehiculos inesperado'; END IF;
  IF (SELECT count(*) FROM public.reservations) <> a.reservas THEN RAISE EXCEPTION 'ABORTADO: cambio el total de reservas'; END IF;
  IF (SELECT count(*) FROM public.satisfaction_surveys) <> a.encuestas THEN RAISE EXCEPTION 'ABORTADO: cambio el total de encuestas'; END IF;
  IF (SELECT count(*) FROM public.prospects) <> a.prospectos THEN RAISE EXCEPTION 'ABORTADO: cambio el total de prospectos'; END IF;
  IF EXISTS (SELECT 1 FROM public.clients WHERE id IN ('464d310d-4008-4420-a481-d0defc26794b','c83239c1-70c8-4999-8a6f-7930d8f2f673','48ec0422-f763-4036-8721-ccf231f58c8f') AND is_active) THEN
    RAISE EXCEPTION 'ABORTADO: quedo activa una ficha duplicada'; END IF;
  IF (SELECT tgenabled FROM pg_trigger WHERE tgname = 'WebhookReservas') <> 'O' THEN
    RAISE EXCEPTION 'ABORTADO: el webhook de reservas no quedo habilitado'; END IF;
END $$;

SELECT c.full_name, c.cedula, c.is_active,
       (SELECT string_agg(coalesce(v.plate,'(sin placa)'), ', ' ORDER BY v.plate) FROM public.vehicles v WHERE v.client_id = c.id) AS vehiculos,
       (SELECT count(*) FROM public.reservations r WHERE r.client_id = c.id) AS citas
  FROM public.clients c
 WHERE c.id IN ('8b880ec4-ea77-476f-abcd-5798f01c8da4','dae2440b-a75a-4dde-9433-59b34883487a','c62d0644-85e3-475a-9217-13ea6572e083','25c0f1e9-57e0-469b-a556-afb18fcd003d')
 ORDER BY c.full_name;
COMMIT;
