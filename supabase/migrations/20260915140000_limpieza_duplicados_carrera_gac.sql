-- APLICADA EN PRODUCCION el 2026-09-15.
-- Limpieza de duplicados fabricados por la carrera entre la app y la inyeccion de GAC.
--
-- Mecanismo: cuando la venta se registra en la app antes que en el sistema de GAC, la app crea
-- ficha SIN cedula y vehiculo CON placa y SIN VIN. GAC empareja vehiculos por VIN: no encuentra
-- el nuestro, le borra la placa para esquivar vehicles_plate_key e inserta cliente y vehiculo
-- nuevos. Queda la misma persona y el mismo auto dos veces sin que ningun unique lo detecte.
--
-- Regla aplicada: la ficha de GAC (con cedula y VIN) es la verdadera. Se le mueven citas,
-- encuestas, prospectos y decisiones de envio de la copia; la copia del vehiculo se borra y la
-- ficha copia se desactiva si quedo vacia. 10 personas, 4 contactos (5 vehiculos) y la ficha
-- J159715066 de JOSE DOMINGO DIAZ CHIARINE, que la sincronizacion del 13/09 habia reactivado.
--
-- El trigger WebhookReservas (n8n) se apaga solo dentro de la transaccion: mover una cita de
-- ficha no es un evento de negocio y no debe notificar a nadie.

BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '10s';

-- Respaldo en un esquema que la API no expone.
CREATE TABLE IF NOT EXISTS forensics.clients_20260915        AS SELECT * FROM public.clients;
CREATE TABLE IF NOT EXISTS forensics.vehicles_20260915       AS SELECT * FROM public.vehicles;
CREATE TABLE IF NOT EXISTS forensics.reservations_20260915   AS SELECT id, client_id, vehicle_id, status, reservation_date FROM public.reservations;
CREATE TABLE IF NOT EXISTS forensics.prospects_20260915      AS SELECT id, client_id, sold_plate, status FROM public.prospects;
CREATE TABLE IF NOT EXISTS forensics.surveys_20260915        AS SELECT id, client_id, vehicle_id, prospect_id, sold_plate FROM public.satisfaction_surveys;
CREATE TABLE IF NOT EXISTS forensics.send_decisions_20260915 AS SELECT id, client_id, prospect_id FROM public.survey_send_decisions;

CREATE TEMP TABLE conteo_antes ON COMMIT DROP AS
SELECT (SELECT count(*) FROM public.vehicles) AS vehiculos,
       (SELECT count(*) FROM public.reservations) AS reservas,
       (SELECT count(*) FROM public.satisfaction_surveys) AS encuestas,
       (SELECT count(*) FROM public.prospects) AS prospectos,
       (SELECT count(*) FROM public.survey_send_decisions) AS decisiones;

-- Misma persona: ficha de GAC (con cedula) + copia creada por la app (sin cedula).
CREATE TEMP TABLE plan_person (keep_id uuid, dup_id uuid, keep_vehicle uuid, dup_vehicle uuid, etiqueta text) ON COMMIT DROP;
INSERT INTO plan_person VALUES
 ('95e56243-6d04-4d0d-8ad8-c745f1843d51','0ad79e81-f656-49f9-93d0-e979ab1a0a98','0fa7b0b6-c5fa-4390-ac74-8b8a583d7f63','1dd64e6a-9273-4873-b132-775e6063c8c9','SKARLET VANESSA GODOY CHACON'),
 ('0a5d2d48-f792-43c7-953a-d223992bc56e','f4f660fb-88a7-4bc4-bc3e-c061acc060dd','29f83e5d-b8bd-40c6-8673-babaa016c607','a8d57590-9332-4307-87bd-2a72bfaa18dd','DANIEL GONZALEZ IGLESIAS'),
 ('a3086991-6022-4124-be01-f06f0ab86520','05af572d-4ecf-4062-82ab-f3c76613ed0f','ac0318c0-e664-4bac-b9e8-cfc05c9f403a','7e30beb7-21e6-414d-a401-1e76c7317b87','CARLOS JOSE ARAUJO MORAN'),
 ('f7906ad1-96c6-4a01-b66d-d6d93066146a','6a33ec55-ab03-4092-a614-6845c3d6c1e1','dfc61471-693f-4a12-8478-a326c0339687','3d44a472-efd8-487e-b144-4c5261136e8f','DANIEL MEI MO'),
 ('06ee6413-1584-4b25-b28c-9062043edb9c','ebe43898-b79c-4aa7-a815-ba1dc5805746','226a49f9-c8e3-44aa-9d3e-71b19a1c97a1','3b26a643-0c55-4696-ab16-0931ddd0eaf1','JOHAN JAVIER GONZALEZ MONTANEZ'),
 ('2215d118-b695-4934-8b0d-528f0915ea6c','2195d8a0-2558-48de-809e-66913469c335','83f746ef-a6b6-431a-aa7e-23bd91e4fdff','4880c817-3ef2-47e2-8fd4-805d81358554','LUIS ALEJANDRO CASTELLANO ALONSO'),
 ('5906527d-2cb5-4051-812f-c9480f3ae035','d9b410d7-a056-49a4-987b-d70063fa1dc2','af3aae2d-1fa3-43af-b0c7-03d76d5fb592','1a882824-2463-4c38-8dcb-eebd2f8c06af','GABRIEL DE JESUS BRITO MAITA'),
 ('9a077a3e-4a6c-4677-8275-84a97adfb180','36659701-477e-4cdd-96e8-cf397babcc7a','2e9aac61-164d-4c7e-babf-5919792a1096','07f77036-f7fa-4ee1-b615-a53532164741','MAYRA YOSMAR MORILLO MIRELLI'),
 ('c4661af8-d450-46b1-b7f7-27b391fcca4f','4738091f-93a5-43eb-bbdb-2acd411381ef','e2a2d5a6-7299-4c4e-9a40-624365ee6891','fcb2f3d6-fa54-4587-abd1-79909701b9fb','FELIX JOSE TRUJILLO FEBRES'),
 ('619a3cf2-0ece-4787-bc4b-ec36aeaa7391','955b85d8-edee-401c-bbb2-8439bb5786be','9109ec7e-33c1-4f70-9925-2cbc600f4ad5','fe961f75-ca75-42c6-81db-34e8c88e71a5','EMILIO ABOURAS HOSUS');

-- Ficha de un contacto con la copia del vehiculo que GAC asigna a otro titular.
CREATE TEMP TABLE plan_contact (contact_id uuid, copy_vehicle uuid, real_vehicle uuid, real_client uuid, prospect_id uuid, deactivate boolean, etiqueta text) ON COMMIT DROP;
INSERT INTO plan_contact VALUES
 ('be772a67-d4f7-463a-9939-9e8fdf82e02d','f8344fdb-c865-4886-9368-1b228a9402c5','3f3862cf-ec8a-4c5f-a22c-f15c9ffc7386','9582231f-5f7b-4abd-9ac2-04a8aa7d1ff0','3ee36d2b-d2af-4f67-833f-0df6d98c0cd6',false,'Tobias lefrenz a PEDRO JOSE DUARTE FERNANDEZ (A93DU8M)'),
 ('1e169ef0-cdc5-463d-8f95-3b91ebb9656b','04cd4135-21c9-49f2-aba4-5898e8fdd0ae','20ebe887-209e-437f-b757-5e21bbe367b2','29ebdd33-7c0f-42c5-8318-014702f2917a','ce1de1b0-c6fd-45f1-9d24-f783842eedf2',false,'Elio Vincent a GUILLERMO ENRIQUE MANOSALVA GARCIA (A92DU3M)'),
 ('a26c74f7-aca0-4176-91b8-364a233e4290','5813d4e7-9546-456f-a0b0-99784bd9a537','78ea8f0e-9f96-4ab1-b9ef-00c2c7198f91','19a21f1f-f2bd-48cd-a484-0ff71d34f50a','17dfedfa-7572-48e3-a28a-b83902334537',true,'Jose Bustamante a PROYECTOS DMS, C.A (A85DU3M)'),
 ('91a50639-b4f2-4ddc-81db-469c6ef7f346','ee32092b-bd92-42ff-9bdd-1d940a1e8eaa','02430c83-4cb6-419e-a2a9-2e2d07c42940','ec7db86e-6697-4bbc-9bbd-a6fb39e9649c','f331ab1f-81b9-49df-9b56-013cb30d9b0e',true,'PAUL CARRILLO a TECBYTEL, C.A (A94DU3M plata)'),
 ('91a50639-b4f2-4ddc-81db-469c6ef7f346','18b22cfd-7515-40e0-9c15-fe1620f19238','d0089a8e-cd5b-49dc-8dcb-15ffaa42c4e8','ec7db86e-6697-4bbc-9bbd-a6fb39e9649c','f331ab1f-81b9-49df-9b56-013cb30d9b0e',true,'PAUL CARRILLO a TECBYTEL, C.A (A94DU4M blanca)');

-- Candado de entrada: todo tiene que estar exactamente como se diagnostico.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM plan_person p JOIN public.vehicles v ON v.id = p.dup_vehicle
   WHERE v.client_id = p.dup_id AND nullif(trim(v.vin),'') IS NULL
     AND (nullif(trim(v.plate),'') IS NULL OR upper(v.plate) = 'AP750PM');
  IF n <> 10 THEN RAISE EXCEPTION 'ABORTADO: solo % de 10 copias de persona siguen como se diagnosticaron', n; END IF;

  SELECT count(*) INTO n FROM plan_person p JOIN public.vehicles v ON v.id = p.keep_vehicle
   WHERE v.client_id = p.keep_id AND nullif(trim(v.vin),'') IS NOT NULL;
  IF n <> 10 THEN RAISE EXCEPTION 'ABORTADO: solo % de 10 vehiculos de GAC siguen como se diagnosticaron', n; END IF;

  SELECT count(*) INTO n FROM plan_person p JOIN public.clients c ON c.id = p.keep_id
   WHERE c.is_active AND nullif(trim(c.cedula),'') IS NOT NULL;
  IF n <> 10 THEN RAISE EXCEPTION 'ABORTADO: solo % de 10 fichas de GAC estan activas y con cedula', n; END IF;

  SELECT count(*) INTO n FROM plan_contact p JOIN public.vehicles v ON v.id = p.copy_vehicle
   WHERE v.client_id = p.contact_id AND nullif(trim(v.vin),'') IS NULL AND nullif(trim(v.plate),'') IS NULL;
  IF n <> 5 THEN RAISE EXCEPTION 'ABORTADO: solo % de 5 copias de contacto siguen como se diagnosticaron', n; END IF;

  SELECT count(*) INTO n FROM plan_contact p JOIN public.vehicles v ON v.id = p.real_vehicle
   WHERE v.client_id = p.real_client AND nullif(trim(v.vin),'') IS NOT NULL;
  IF n <> 5 THEN RAISE EXCEPTION 'ABORTADO: solo % de 5 vehiculos de GAC (contactos) siguen como se diagnosticaron', n; END IF;
END $$;

-- El webhook de n8n se dispara con CUALQUIER update de una reserva. Mover una cita de ficha no
-- es un evento de negocio, asi que se apaga solo dentro de esta transaccion.
ALTER TABLE public.reservations DISABLE TRIGGER "WebhookReservas";

-- ===== PERSONAS =====
UPDATE public.reservations          r SET vehicle_id = p.keep_vehicle FROM plan_person p WHERE r.vehicle_id = p.dup_vehicle;
UPDATE public.reservations          r SET client_id  = p.keep_id      FROM plan_person p WHERE r.client_id  = p.dup_id;
UPDATE public.satisfaction_surveys  s SET vehicle_id = p.keep_vehicle FROM plan_person p WHERE s.vehicle_id = p.dup_vehicle;
UPDATE public.satisfaction_surveys  s SET client_id  = p.keep_id      FROM plan_person p WHERE s.client_id  = p.dup_id;
UPDATE public.prospects             x SET client_id  = p.keep_id      FROM plan_person p WHERE x.client_id  = p.dup_id;
UPDATE public.survey_send_decisions d SET client_id  = p.keep_id      FROM plan_person p WHERE d.client_id  = p.dup_id;
UPDATE public.drivers               d SET client_id  = p.keep_id      FROM plan_person p WHERE d.client_id  = p.dup_id;
UPDATE public.client_users          d SET client_id  = p.keep_id      FROM plan_person p WHERE d.client_id  = p.dup_id;
UPDATE public.external_portal_sessions d SET client_id = p.keep_id    FROM plan_person p WHERE d.client_id  = p.dup_id;

-- El vendedor tipeo AP750PM; la placa real (GAC, con VIN) es AP750PB.
UPDATE public.prospects            SET sold_plate = 'AP750PB' WHERE id = 'd7316e29-5492-4aaa-8bdd-a13a73c69ebd' AND upper(sold_plate) = 'AP750PM';
UPDATE public.satisfaction_surveys SET sold_plate = 'AP750PB' WHERE prospect_id = 'd7316e29-5492-4aaa-8bdd-a13a73c69ebd' AND upper(sold_plate) = 'AP750PM';

-- Solo rellena huecos de la ficha de GAC; nunca propaga un correo de relleno.
UPDATE public.clients k
   SET email = COALESCE(k.email, CASE WHEN EXISTS (SELECT 1 FROM public.identity_blocklist_emails b WHERE b.email = lower(trim(d.email))) THEN NULL ELSE d.email END),
       phone = COALESCE(nullif(trim(k.phone),''), d.phone),
       city = COALESCE(k.city, d.city),
       address = COALESCE(k.address, d.address),
       "IdContactKommo" = COALESCE(k."IdContactKommo", d."IdContactKommo"),
       kommo_conversation_lead_id = COALESCE(k.kommo_conversation_lead_id, d.kommo_conversation_lead_id)
  FROM plan_person p JOIN public.clients d ON d.id = p.dup_id
 WHERE k.id = p.keep_id;

-- ===== CONTACTOS =====
UPDATE public.reservations          r SET vehicle_id = c.real_vehicle, client_id = c.real_client FROM plan_contact c WHERE r.vehicle_id = c.copy_vehicle;
UPDATE public.satisfaction_surveys  s SET vehicle_id = c.real_vehicle FROM plan_contact c WHERE s.vehicle_id = c.copy_vehicle;
UPDATE public.prospects             x SET client_id = c.real_client FROM (SELECT DISTINCT prospect_id, real_client FROM plan_contact) c WHERE x.id = c.prospect_id;
UPDATE public.satisfaction_surveys  s SET client_id = c.real_client FROM (SELECT DISTINCT prospect_id, real_client FROM plan_contact) c WHERE s.prospect_id = c.prospect_id;
UPDATE public.survey_send_decisions d SET client_id = c.real_client FROM (SELECT DISTINCT prospect_id, real_client FROM plan_contact) c WHERE d.prospect_id = c.prospect_id;

-- ===== BORRAR LAS COPIAS DE VEHICULO =====
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.reservations r
   WHERE r.vehicle_id IN (SELECT dup_vehicle FROM plan_person UNION SELECT copy_vehicle FROM plan_contact);
  IF n > 0 THEN RAISE EXCEPTION 'ABORTADO: % reserva(s) todavia apuntan a una copia', n; END IF;
  SELECT count(*) INTO n FROM public.satisfaction_surveys s
   WHERE s.vehicle_id IN (SELECT dup_vehicle FROM plan_person UNION SELECT copy_vehicle FROM plan_contact);
  IF n > 0 THEN RAISE EXCEPTION 'ABORTADO: % encuesta(s) todavia apuntan a una copia', n; END IF;
END $$;

DELETE FROM public.vehicles v USING plan_person  p WHERE v.id = p.dup_vehicle;
DELETE FROM public.vehicles v USING plan_contact c WHERE v.id = c.copy_vehicle;

-- ===== DESACTIVAR FICHAS QUE QUEDARON VACIAS =====
UPDATE public.clients c SET is_active = false
  FROM (SELECT dup_id AS id FROM plan_person
        UNION SELECT DISTINCT contact_id FROM plan_contact WHERE deactivate
        UNION SELECT 'c83239c1-70c8-4999-8a6f-7930d8f2f673'::uuid) x
 WHERE c.id = x.id AND c.is_active
   AND NOT EXISTS (SELECT 1 FROM public.vehicles     WHERE client_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM public.reservations WHERE client_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM public.prospects    WHERE client_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM public.satisfaction_surveys  WHERE client_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM public.survey_send_decisions WHERE client_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM public.drivers      WHERE client_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM public.client_users WHERE client_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM public.external_portal_sessions WHERE client_id = c.id);

ALTER TABLE public.reservations ENABLE TRIGGER "WebhookReservas";

-- Candado de salida: nada se perdio y todo quedo donde tiene que estar.
DO $$
DECLARE a record; n int;
BEGIN
  SELECT * INTO a FROM conteo_antes;
  IF (SELECT count(*) FROM public.vehicles) <> a.vehiculos - 15 THEN
    RAISE EXCEPTION 'ABORTADO: vehiculos % (esperado %)', (SELECT count(*) FROM public.vehicles), a.vehiculos - 15;
  END IF;
  IF (SELECT count(*) FROM public.reservations) <> a.reservas THEN RAISE EXCEPTION 'ABORTADO: cambio el total de reservas'; END IF;
  IF (SELECT count(*) FROM public.satisfaction_surveys) <> a.encuestas THEN RAISE EXCEPTION 'ABORTADO: cambio el total de encuestas'; END IF;
  IF (SELECT count(*) FROM public.prospects) <> a.prospectos THEN RAISE EXCEPTION 'ABORTADO: cambio el total de prospectos'; END IF;
  IF (SELECT count(*) FROM public.survey_send_decisions) <> a.decisiones THEN RAISE EXCEPTION 'ABORTADO: cambio el total de decisiones'; END IF;

  SELECT count(*) INTO n FROM plan_person p JOIN public.clients c ON c.id = p.dup_id WHERE c.is_active;
  IF n > 0 THEN RAISE EXCEPTION 'ABORTADO: % copia(s) de persona siguen activas', n; END IF;

  SELECT count(*) INTO n FROM (SELECT DISTINCT prospect_id, real_client FROM plan_contact) c
    JOIN public.prospects x ON x.id = c.prospect_id WHERE x.client_id IS DISTINCT FROM c.real_client;
  IF n > 0 THEN RAISE EXCEPTION 'ABORTADO: % prospecto(s) de contacto no quedaron en la ficha de GAC', n; END IF;

  IF (SELECT tgenabled FROM pg_trigger WHERE tgname = 'WebhookReservas') <> 'O' THEN
    RAISE EXCEPTION 'ABORTADO: el webhook de reservas no quedo habilitado';
  END IF;
END $$;

SELECT 'persona' AS tipo, p.etiqueta AS caso,
       (SELECT count(*) FROM public.vehicles     WHERE client_id = p.keep_id) AS vehiculos,
       (SELECT count(*) FROM public.reservations WHERE client_id = p.keep_id) AS citas,
       (SELECT count(*) FROM public.prospects    WHERE client_id = p.keep_id) AS prospectos,
       (SELECT is_active FROM public.clients WHERE id = p.dup_id) AS copia_activa
  FROM plan_person p
UNION ALL
SELECT 'contacto', c.etiqueta,
       (SELECT count(*) FROM public.vehicles     WHERE client_id = c.real_client),
       (SELECT count(*) FROM public.reservations WHERE client_id = c.real_client),
       (SELECT count(*) FROM public.prospects    WHERE client_id = c.real_client),
       (SELECT is_active FROM public.clients WHERE id = c.contact_id)
  FROM plan_contact c
UNION ALL
SELECT 'ficha J', 'JOSE DOMINGO DIAZ CHIARINE J159715066', 0, 0, 0,
       (SELECT is_active FROM public.clients WHERE id = 'c83239c1-70c8-4999-8a6f-7930d8f2f673')
ORDER BY 1, 2;
COMMIT;
