-- APLICADA EN PRODUCCION el 2026-09-08.
-- Fusion de 8 pares de fichas duplicadas que entraron con la CARGA INICIAL de clientes
-- (1.074 fichas importadas el 2026-02-12 04:09, por fuera de git). El patron es siempre el
-- mismo: mismo nombre y mismo telefono, cedula/RIF mal tipeada. La deteccion por cedula no
-- los veia justamente porque la cedula esta mal.
--
-- Bloque 1 (5 pares): personas naturales cargadas con prefijo J (empresas) ademas de con su
-- V real. Se conserva SIEMPRE la ficha con la V, que es la cedula correcta de una persona.
-- Bloque 2 (3 pares): la ficha gemela estaba vacia (0 vehiculos, 0 reservas); se conserva la
-- que tiene la cartera. Lleva un guard que aborta si alguna resulta no estar vacia.
--
-- Queda SIN TOCAR el par ROXIBEL JOSE GELVEZ HERNANDEZ (V20859485 / V208594857): las dos
-- fichas tienen un vehiculo distinto cada una, asi que fusionarlas junta carteras y necesita
-- una decision humana. Se resuelve desde la pestana Duplicados de /admin/clientes.

BEGIN;
SET LOCAL gac.allow_vehicle_owner_change = 'clientes:merge';
SET LOCAL gac.vehicle_owner_reason = 'Fusion de duplicados de la carga inicial 2026-02-12 (cedula tipeada con J en vez de V)';

CREATE TABLE IF NOT EXISTS public.backup_clients_20260908 AS SELECT * FROM public.clients;
CREATE TABLE IF NOT EXISTS public.backup_vehicles_20260908 AS
  SELECT id, client_id, plate, updated_at FROM public.vehicles;

CREATE TEMP TABLE plan_merge (keep_id uuid, dup_id uuid, etiqueta text) ON COMMIT DROP;
INSERT INTO plan_merge VALUES
 ('f856b3b4-28c2-4684-ab0a-542a7fef2aff','aa47dbf8-28f6-4c32-a64f-c1a6772c0f4d','EDUARDO ANTONIO ALCANTARA DURAN'),
 ('dae2440b-a75a-4dde-9433-59b34883487a','c83239c1-70c8-4999-8a6f-7930d8f2f673','JOSE DOMINGO DIAZ CHIARINE'),
 ('fae51f20-62a3-46e9-ba75-963447474aee','c4a4481f-a7aa-477f-b9df-e7a4689b6c9d','KINEN KHIR KHIR'),
 ('09864f23-2421-4ece-9692-05829d102655','e0848d74-9828-435a-8d77-7d9db4360a19','MEDARDO ANGEL VILLALVA PALMA'),
 ('e7ae04a5-4fd3-423f-8a7f-d596445b4cb8','559a304a-cc43-44f5-9303-5dcb77bbab10','PATRICIA VALENTINA SIERRA ESCOBAR');

UPDATE public.vehicles                 v SET client_id = m.keep_id, updated_at = now() FROM plan_merge m WHERE v.client_id = m.dup_id;
UPDATE public.reservations             r SET client_id = m.keep_id FROM plan_merge m WHERE r.client_id = m.dup_id;
UPDATE public.drivers                  d SET client_id = m.keep_id FROM plan_merge m WHERE d.client_id = m.dup_id;
UPDATE public.client_users            cu SET client_id = m.keep_id FROM plan_merge m WHERE cu.client_id = m.dup_id;
UPDATE public.external_portal_sessions e SET client_id = m.keep_id FROM plan_merge m WHERE e.client_id = m.dup_id;
UPDATE public.prospects                p SET client_id = m.keep_id FROM plan_merge m WHERE p.client_id = m.dup_id;
UPDATE public.satisfaction_surveys     s SET client_id = m.keep_id FROM plan_merge m WHERE s.client_id = m.dup_id;
UPDATE public.survey_send_decisions   sd SET client_id = m.keep_id FROM plan_merge m WHERE sd.client_id = m.dup_id;

-- Rellena huecos del sobreviviente sin pisar lo que ya tiene.
UPDATE public.clients k
   SET email   = COALESCE(k.email, d.email),
       phone   = COALESCE(nullif(trim(k.phone),''), d.phone),
       city    = COALESCE(k.city, d.city),
       address = COALESCE(k.address, d.address),
       "IdContactKommo" = COALESCE(k."IdContactKommo", d."IdContactKommo")
  FROM plan_merge m JOIN public.clients d ON d.id = m.dup_id
 WHERE k.id = m.keep_id;

UPDATE public.clients c SET is_active = false FROM plan_merge m WHERE c.id = m.dup_id;

SELECT m.etiqueta, k.cedula AS cedula_conservada,
       (SELECT count(*) FROM public.vehicles v WHERE v.client_id = m.keep_id) AS vehiculos,
       (SELECT count(*) FROM public.reservations r WHERE r.client_id = m.keep_id) AS reservas,
       (SELECT count(*) FROM public.vehicles v WHERE v.client_id = m.dup_id) AS quedo_colgando,
       CASE WHEN d.is_active THEN 'REVISAR' ELSE 'OK' END AS duplicado
  FROM plan_merge m JOIN public.clients k ON k.id = m.keep_id JOIN public.clients d ON d.id = m.dup_id
 ORDER BY m.etiqueta;
COMMIT;


BEGIN;
SET LOCAL gac.allow_vehicle_owner_change = 'clientes:merge';
SET LOCAL gac.vehicle_owner_reason = 'Fusion de duplicados de la carga inicial 2026-02-12: ficha gemela vacia con la cedula/RIF mal tipeada';

CREATE TEMP TABLE plan_merge (keep_id uuid, dup_id uuid, etiqueta text) ON COMMIT DROP;
INSERT INTO plan_merge VALUES
 ('5584c3a8-19e5-4f49-867e-b101b642d6dc','492b9eb3-b7b9-4202-9acb-da2ceb1c2f80','ALEXIS TEOBALDO ROMERO IGNACIO'),
 ('85b768b8-3b32-435c-862b-c5edde3a83dd','fe06b0e3-de67-41a9-9570-0e867dab7e97','TV. CABLE LITORAL C.A.'),
 ('093d09a4-43b5-460c-a07c-1226eb93cabe','f4c0aa16-de5a-41d8-a8a6-926bb326ee76','VELAS 3 N C.A');

-- Guarda: si alguna ficha "vacia" tuviera algo, aborta en vez de fusionar a ciegas.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM plan_merge m
   WHERE EXISTS (SELECT 1 FROM public.vehicles     WHERE client_id = m.dup_id)
      OR EXISTS (SELECT 1 FROM public.reservations WHERE client_id = m.dup_id);
  IF n > 0 THEN RAISE EXCEPTION 'ABORTADO: % ficha(s) marcadas como vacias tienen vehiculos o reservas', n; END IF;
END $$;

UPDATE public.drivers                  d SET client_id = m.keep_id FROM plan_merge m WHERE d.client_id = m.dup_id;
UPDATE public.client_users            cu SET client_id = m.keep_id FROM plan_merge m WHERE cu.client_id = m.dup_id;
UPDATE public.external_portal_sessions e SET client_id = m.keep_id FROM plan_merge m WHERE e.client_id = m.dup_id;
UPDATE public.prospects                p SET client_id = m.keep_id FROM plan_merge m WHERE p.client_id = m.dup_id;
UPDATE public.satisfaction_surveys     s SET client_id = m.keep_id FROM plan_merge m WHERE s.client_id = m.dup_id;
UPDATE public.survey_send_decisions   sd SET client_id = m.keep_id FROM plan_merge m WHERE sd.client_id = m.dup_id;

UPDATE public.clients k
   SET email   = COALESCE(k.email, d.email),
       phone   = COALESCE(nullif(trim(k.phone),''), d.phone),
       city    = COALESCE(k.city, d.city),
       address = COALESCE(k.address, d.address),
       "IdContactKommo" = COALESCE(k."IdContactKommo", d."IdContactKommo")
  FROM plan_merge m JOIN public.clients d ON d.id = m.dup_id
 WHERE k.id = m.keep_id;

UPDATE public.clients c SET is_active = false FROM plan_merge m WHERE c.id = m.dup_id;

SELECT m.etiqueta, k.cedula AS cedula_conservada,
       (SELECT count(*) FROM public.vehicles v WHERE v.client_id = m.keep_id) AS vehiculos,
       CASE WHEN d.is_active THEN 'REVISAR' ELSE 'OK' END AS duplicado
  FROM plan_merge m JOIN public.clients k ON k.id = m.keep_id JOIN public.clients d ON d.id = m.dup_id
 ORDER BY m.etiqueta;
COMMIT;
