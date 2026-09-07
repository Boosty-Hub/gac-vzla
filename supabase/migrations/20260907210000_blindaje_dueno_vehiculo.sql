-- APLICADA EN PRODUCCION el 2026-09-07 (capas 1 a 5).
-- La capa 6 (trigger de "Ganado sin placa") NO se aplico: requiere primero parchear
-- register_won_prospect con PERFORM set_config(gac.won_flow,...) y desplegar el frontend,
-- si no bloquea tambien la venta legitima.

-- =====================================================================================
--  BLINDAJE DE LA CARTERA DE CLIENTES — GAC Venezuela
--  Archivo sugerido: supabase/migrations/20260907210000_guard_vehicle_owner.sql
--  ESTADO: **NO EJECUTADO**.
--  ORDEN: correr DESPUES de repair_sql y JUNTO con el deploy de frontend.
-- =====================================================================================

BEGIN;

-- =====================================================================================
-- CAPA 3 (primero, porque el trigger de la capa 1 ya escribe aca) — HISTORIAL DE DUEÑOS
-- Lo que faltaba y volvio casi irreparable este incidente.
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.vehicle_owner_audit (
  id             bigserial PRIMARY KEY,
  vehicle_id     uuid        NOT NULL,
  plate          text,
  old_client_id  uuid,
  new_client_id  uuid,
  changed_at     timestamptz NOT NULL DEFAULT now(),
  changed_by     uuid,                 -- auth.uid(); NULL si vino de service_role o de un cron
  db_role        text        NOT NULL, -- authenticator / service_role / postgres
  app_source     text,                 -- valor de gac.allow_vehicle_owner_change
  reason         text                  -- valor de gac.vehicle_owner_reason
);

CREATE INDEX IF NOT EXISTS idx_vehicle_owner_audit_vehicle ON public.vehicle_owner_audit (vehicle_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_owner_audit_when    ON public.vehicle_owner_audit (changed_at DESC);

ALTER TABLE public.vehicle_owner_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicle_owner_audit_select ON public.vehicle_owner_audit;
CREATE POLICY vehicle_owner_audit_select ON public.vehicle_owner_audit
  FOR SELECT TO authenticated USING (public.is_admin_user());
-- Sin politicas de INSERT/UPDATE/DELETE: nadie escribe por API. Solo el trigger
-- (SECURITY DEFINER, corre como dueño de la tabla) puede insertar.


-- =====================================================================================
-- CAPA 1 — EL CANDADO. Ningun modulo puede cambiar el dueño de un vehiculo.
-- Un trigger se dispara SIEMPRE: con RLS, sin RLS, desde SECURITY DEFINER y desde
-- service_role. Es el unico punto por el que pasa el 100% de las escrituras.
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.tg_vehicles_guard_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE v_ventana text;
BEGIN
  -- El UPDATE incluye client_id pero no lo cambia (caso de AdminClientes:801): pasa.
  IF NEW.client_id IS NOT DISTINCT FROM OLD.client_id THEN
    RETURN NEW;
  END IF;

  v_ventana := nullif(current_setting('gac.allow_vehicle_owner_change', true), '');

  IF v_ventana IS NULL THEN
    RAISE EXCEPTION
      'vehicle_owner_change_denied: el vehiculo % (placa %) NO puede cambiar de cliente desde este modulo. Usa el modulo de Clientes (admin_set_vehicle_client / admin_unlink_vehicle_from_client).',
      OLD.id, coalesce(OLD.plate, '(sin placa)')
      USING ERRCODE = '42501',
            HINT    = 'Si esto viene del flujo de prospecto ganado, es un BUG: ese flujo nunca debe reasignar un vehiculo existente.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vehicles_guard_owner ON public.vehicles;
CREATE TRIGGER trg_vehicles_guard_owner
  BEFORE UPDATE OF client_id ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.tg_vehicles_guard_owner();


CREATE OR REPLACE FUNCTION public.tg_vehicles_audit_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    INSERT INTO public.vehicle_owner_audit
      (vehicle_id, plate, old_client_id, new_client_id, changed_by, db_role, app_source, reason)
    VALUES
      (NEW.id, NEW.plate, OLD.client_id, NEW.client_id,
       auth.uid(), current_user,
       nullif(current_setting('gac.allow_vehicle_owner_change', true), ''),
       nullif(current_setting('gac.vehicle_owner_reason', true), ''));
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_vehicles_audit_owner ON public.vehicles;
CREATE TRIGGER trg_vehicles_audit_owner
  AFTER UPDATE OF client_id ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.tg_vehicles_audit_owner();


-- =====================================================================================
-- CAPA 2 — LA UNICA PUERTA LEGITIMA. Vive en el modulo de Clientes.
-- Resuelve ademas el hueco que dejo trancado al admin: hoy solo existe DESvincular.
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.admin_set_vehicle_client(
  p_vehicle_id uuid,
  p_client_id  uuid,
  p_reason     text DEFAULT NULL
)
RETURNS public.vehicles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE v_vehicle public.vehicles; v_client public.clients;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not_authorized' USING HINT = 'Solo superadmin/admin pueden cambiar el dueño de un vehiculo.';
  END IF;

  SELECT * INTO v_vehicle FROM public.vehicles WHERE id = p_vehicle_id;
  IF v_vehicle.id IS NULL THEN RAISE EXCEPTION 'vehicle_not_found'; END IF;

  SELECT * INTO v_client FROM public.clients WHERE id = p_client_id;
  IF v_client.id IS NULL     THEN RAISE EXCEPTION 'client_not_found'; END IF;
  IF NOT v_client.is_active  THEN RAISE EXCEPTION 'client_inactive'
    USING HINT = 'Ese cliente esta desactivado (posible duplicado fusionado). Elegi la ficha real.'; END IF;

  -- Idempotente: ya esta donde tiene que estar.
  IF v_vehicle.client_id IS NOT DISTINCT FROM p_client_id THEN RETURN v_vehicle; END IF;

  PERFORM set_config('gac.allow_vehicle_owner_change', 'clientes:set_owner', true);
  PERFORM set_config('gac.vehicle_owner_reason', coalesce(nullif(trim(p_reason), ''), 'sin motivo indicado'), true);

  UPDATE public.vehicles
     SET client_id = p_client_id,
         unlinked_from_client_id = NULL,
         unlinked_at = NULL,
         unlinked_by = NULL,
         updated_at  = now()
   WHERE id = p_vehicle_id
   RETURNING * INTO v_vehicle;

  RETURN v_vehicle;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_vehicle_client(uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_vehicle_client(uuid, uuid, text) TO authenticated;


-- Parche OBLIGATORIO: sin esto, el blindaje rompe el boton de desvincular que ya existe.
CREATE OR REPLACE FUNCTION public.admin_unlink_vehicle_from_client(p_vehicle_id uuid)
RETURNS public.vehicles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE v_vehicle public.vehicles;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT * INTO v_vehicle FROM public.vehicles WHERE vehicles.id = p_vehicle_id;
  IF v_vehicle.id IS NULL THEN RAISE EXCEPTION 'vehicle_not_found'; END IF;
  IF v_vehicle.client_id IS NULL THEN RETURN v_vehicle; END IF;   -- idempotente

  PERFORM set_config('gac.allow_vehicle_owner_change', 'clientes:unlink', true);
  PERFORM set_config('gac.vehicle_owner_reason', 'desvinculacion manual desde el modulo de Clientes', true);

  UPDATE public.vehicles
     SET client_id = NULL,
         unlinked_from_client_id = v_vehicle.client_id,
         unlinked_at = now(),
         unlinked_by = auth.uid(),
         updated_at  = now()
   WHERE vehicles.id = p_vehicle_id
   RETURNING * INTO v_vehicle;

  RETURN v_vehicle;
END;
$$;


-- Fusion de duplicados como FUNCION, no como script suelto. Regla del proyecto:
-- ninguna funcionalidad puede quedar dependiendo de que alguien corra SQL a mano.
CREATE OR REPLACE FUNCTION public.admin_merge_clients(
  p_keep_id uuid,
  p_dup_id  uuid,
  p_reason  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE v_keep public.clients; v_dup public.clients; v_moved jsonb;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_keep_id = p_dup_id THEN RAISE EXCEPTION 'same_client'; END IF;

  SELECT * INTO v_keep FROM public.clients WHERE id = p_keep_id;
  SELECT * INTO v_dup  FROM public.clients WHERE id = p_dup_id;
  IF v_keep.id IS NULL OR v_dup.id IS NULL THEN RAISE EXCEPTION 'client_not_found'; END IF;

  -- El sobreviviente tiene que ser el que porta la identidad dura.
  IF v_keep.cedula IS NULL AND v_dup.cedula IS NOT NULL THEN
    RAISE EXCEPTION 'keep_sin_cedula'
      USING HINT = 'El cliente a conservar no tiene cedula y el duplicado si. Invertí la direccion de la fusion.';
  END IF;

  PERFORM set_config('gac.allow_vehicle_owner_change', 'clientes:merge', true);
  PERFORM set_config('gac.vehicle_owner_reason',
                     coalesce(nullif(trim(p_reason),''), 'fusion de cliente duplicado ' || p_dup_id::text), true);

  -- ORDEN CRITICO: mover TODO antes de tocar la ficha duplicada.
  -- vehicles / drivers / client_users / external_portal_sessions son ON DELETE CASCADE.
  UPDATE public.vehicles                 SET client_id = p_keep_id, updated_at = now() WHERE client_id = p_dup_id;
  UPDATE public.reservations             SET client_id = p_keep_id WHERE client_id = p_dup_id;
  UPDATE public.drivers                  SET client_id = p_keep_id WHERE client_id = p_dup_id;
  UPDATE public.client_users             SET client_id = p_keep_id WHERE client_id = p_dup_id;
  UPDATE public.external_portal_sessions SET client_id = p_keep_id WHERE client_id = p_dup_id;
  UPDATE public.prospects                SET client_id = p_keep_id WHERE client_id = p_dup_id;
  UPDATE public.satisfaction_surveys     SET client_id = p_keep_id WHERE client_id = p_dup_id;
  UPDATE public.survey_send_decisions    SET client_id = p_keep_id WHERE client_id = p_dup_id;

  -- Rellenar huecos del sobreviviente sin pisar nada.
  UPDATE public.clients k
     SET email                      = COALESCE(k.email, v_dup.email),
         phone                      = COALESCE(nullif(trim(k.phone),''), v_dup.phone),
         city                       = COALESCE(k.city, v_dup.city),
         address                    = COALESCE(k.address, v_dup.address),
         "IdContactKommo"           = COALESCE(k."IdContactKommo", v_dup."IdContactKommo"),
         kommo_conversation_lead_id = COALESCE(k.kommo_conversation_lead_id, v_dup.kommo_conversation_lead_id)
   WHERE k.id = p_keep_id;

  -- Se desactiva, NO se borra: reversible y con rastro.
  UPDATE public.clients SET is_active = false WHERE id = p_dup_id;

  v_moved := jsonb_build_object('keep_id', p_keep_id, 'dup_id', p_dup_id, 'dup_desactivado', true);
  RETURN v_moved;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_merge_clients(uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_merge_clients(uuid, uuid, text) TO authenticated;


-- =====================================================================================
-- CAPA 4 — DESACTIVAR LA BOMBA DE CASCADA
-- Hoy borrar un cliente BORRA SUS VEHICULOS en silencio. Verificado en
-- information_schema: vehicles_client_id_fkey tiene delete_rule = CASCADE.
-- =====================================================================================
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_client_id_fkey;
ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.tg_clients_guard_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE v_veh int; v_res int; v_sur int;
BEGIN
  IF nullif(current_setting('gac.allow_client_delete', true), '') IS NOT NULL THEN
    RETURN OLD;   -- borrado deliberado y auditado
  END IF;

  SELECT count(*) INTO v_veh FROM public.vehicles            WHERE client_id = OLD.id;
  SELECT count(*) INTO v_res FROM public.reservations        WHERE client_id = OLD.id;
  SELECT count(*) INTO v_sur FROM public.satisfaction_surveys WHERE client_id = OLD.id;

  IF v_veh > 0 OR v_res > 0 OR v_sur > 0 THEN
    RAISE EXCEPTION
      'client_delete_denied: el cliente % (%) tiene % vehiculo(s), % reserva(s) y % encuesta(s). Desactivalo o fusionalo (admin_merge_clients) en vez de borrarlo.',
      OLD.id, OLD.full_name, v_veh, v_res, v_sur
      USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_guard_delete ON public.clients;
CREATE TRIGGER trg_clients_guard_delete
  BEFORE DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.tg_clients_guard_delete();


-- =====================================================================================
-- CAPA 5 — MATAR LAS LLAVES DE IDENTIDAD BASURA (la causa raiz que sigue viva)
-- Administrable desde la UI: es una tabla, no una constante en el codigo.
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.identity_blocklist_emails (
  email      text PRIMARY KEY,
  motivo     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.identity_blocklist_emails (email, motivo) VALUES
 ('na@na.com',        'Correo de relleno de Kommo. Origen del cliente-balde "Elio Vincent" (9 vehiculos de 6 dueños distintos).'),
 ('na.na@gmail.com',  'Variante del correo de relleno.'),
 ('n/a',              'Relleno.'),
 ('na',               'Relleno.'),
 ('no@no.com',        'Relleno.'),
 ('sincorreo@na.com', 'Relleno.')
ON CONFLICT (email) DO NOTHING;

ALTER TABLE public.identity_blocklist_emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS identity_blocklist_all ON public.identity_blocklist_emails;
CREATE POLICY identity_blocklist_all ON public.identity_blocklist_emails
  FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

-- Version endurecida del resolvedor de identidad.
-- Cambios respecto de la version viva: (a) el correo bloqueado NO es llave;
-- (b) un telefono compartido por 2+ clientes NO es llave (era el mecanismo exacto que
--     engancho VARFLEX->"ANDRES ARTEAGA" e IFX->"Antonio"/"Reinaldo"); (c) el correo solo
--     vale si es unico. La placa sigue siendo el primer criterio, como ya estaba.
CREATE OR REPLACE FUNCTION public.fn_resolve_or_create_client_for_prospect(
  p_prospect_id uuid,
  p_sold_plate  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE p record; v_client_id uuid; v_phone10 text; v_plate_norm text; v_force_new boolean; v_n int;
BEGIN
  PERFORM set_config('gac.client_just_created', '', true);

  SELECT * INTO p FROM public.prospects WHERE id = p_prospect_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'prospect_not_found'; END IF;
  IF p.client_id IS NOT NULL THEN RETURN p.client_id; END IF;

  -- 1) PLACA — criterio absoluto: es literalmente el vehiculo facturado.
  v_plate_norm := nullif(upper(trim(coalesce(p_sold_plate, ''))), '');
  IF v_plate_norm IS NOT NULL THEN
    SELECT v.client_id INTO v_client_id
      FROM public.vehicles v
     WHERE upper(trim(v.plate)) = v_plate_norm
     ORDER BY v.created_at LIMIT 1;
    IF v_client_id IS NOT NULL THEN RETURN v_client_id; END IF;
  END IF;

  v_force_new := coalesce(current_setting('gac.force_new_client', true), '') = 'true';

  IF NOT v_force_new THEN
    -- 2) CEDULA — unica llave dura.
    SELECT c.id INTO v_client_id FROM public.clients c
     WHERE nullif(trim(p.cedula),'') IS NOT NULL
       AND upper(trim(c.cedula)) = upper(trim(p.cedula))
     ORDER BY c.created_at LIMIT 1;

    -- 3) TELEFONO — solo si es INEQUIVOCO. Hoy hay 88 telefonos compartidos por 2+
    --    clientes (empresa + su contacto, familiares, intermediarios de Kommo).
    --    "El mas viejo gana" es exactamente lo que fabrico los contactos-hub.
    IF v_client_id IS NULL THEN
      v_phone10 := right(regexp_replace(coalesce(p.phone,''), '\D', '', 'g'), 10);
      IF length(v_phone10) = 10 THEN
        SELECT count(*) INTO v_n FROM public.clients c
         WHERE right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 10) = v_phone10;
        IF v_n = 1 THEN
          SELECT c.id INTO v_client_id FROM public.clients c
           WHERE right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 10) = v_phone10;
        END IF;
      END IF;
    END IF;

    -- 4) EMAIL — solo si NO esta bloqueado y ademas es unico.
    IF v_client_id IS NULL AND nullif(trim(p.email),'') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.identity_blocklist_emails b
                        WHERE b.email = lower(trim(p.email))) THEN
      SELECT count(*) INTO v_n FROM public.clients c WHERE lower(trim(c.email)) = lower(trim(p.email));
      IF v_n = 1 THEN
        SELECT c.id INTO v_client_id FROM public.clients c WHERE lower(trim(c.email)) = lower(trim(p.email));
      END IF;
    END IF;
  END IF;

  -- El nombre NO es llave de deduplicacion (texto libre, homonimos). Se mantiene.
  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (full_name, cedula, phone, email, state, is_active)
    VALUES (coalesce(nullif(trim(p.name),''), 'Cliente'),
            nullif(trim(p.cedula),''),
            nullif(trim(p.phone),''),
            CASE WHEN EXISTS (SELECT 1 FROM public.identity_blocklist_emails b
                               WHERE b.email = lower(trim(coalesce(p.email,''))))
                 THEN NULL ELSE nullif(trim(p.email),'') END,   -- no propagar el relleno
            nullif(trim(p."Estado de Vnzla"),''), true)
    RETURNING id INTO v_client_id;
    PERFORM set_config('gac.client_just_created', v_client_id::text, true);
  END IF;

  RETURN v_client_id;
END;
$$;

COMMIT;
