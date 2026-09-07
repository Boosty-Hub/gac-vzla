-- =====================================================================================
--  ESTADO: **NO EJECUTADO**. Aplicar con la Management API antes de dar por cerrado el
--  blindaje del 2026-09-07.
--
--  Dos huecos del blindaje que la UI sola no puede tapar:
--
--  1. `admin_merge_clients` valida not_authorized / same_client / client_not_found /
--     keep_sin_cedula, pero NUNCA `is_active` del sobreviviente. Fusionar hacia una ficha
--     desactivada (un duplicado ya fusionado sigue apareciendo en el buscador) mueve
--     vehiculos, reservas, accesos al portal y encuestas de la ficha viva a una muerta: el
--     cliente desaparece de todos los listados activos y `admin_set_vehicle_client` ya no
--     puede devolver esos vehiculos, porque rechaza `client_inactive`. Recuperarlo exigiria
--     reactivar por SQL a mano, que es exactamente lo que la regla del proyecto prohibe.
--
--  2. `identity_blocklist_emails` tiene una sola policy, FOR ALL con is_admin_user(). El
--     cartel de identidad de WonProspectDialog la lee para avisar que el comprador se esta
--     identificando con un correo de relleno (na@na.com, el que fabrico el cliente-balde
--     "Elio Vincent"), y ese dialogo tambien vive en el portal de concesionario, donde el rol
--     es concesionario/vendedor: la consulta vuelve VACIA sin error y la senal mas fuerte del
--     aviso se apaga en silencio, justo en el portal donde nacio el incidente. La lista son
--     direcciones basura, no hay nada sensible que proteger; la escritura sigue siendo solo
--     de admin.
-- =====================================================================================

BEGIN;

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

  -- El sobreviviente tiene que estar vivo: una ficha desactivada esconde toda la cartera de
  -- los listados y deja sus vehiculos fuera del alcance de admin_set_vehicle_client.
  IF NOT v_keep.is_active THEN
    RAISE EXCEPTION 'keep_inactive'
      USING HINT = 'El cliente a conservar esta desactivado. Reactivalo o invierte la direccion de la fusion.';
  END IF;

  -- El sobreviviente tiene que ser el que porta la identidad dura.
  IF v_keep.cedula IS NULL AND v_dup.cedula IS NOT NULL THEN
    RAISE EXCEPTION 'keep_sin_cedula'
      USING HINT = 'El cliente a conservar no tiene cedula y el duplicado si. Invierte la direccion de la fusion.';
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


-- Lectura para todo el staff; la escritura sigue con la policy FOR ALL admin-only.
DROP POLICY IF EXISTS identity_blocklist_select ON public.identity_blocklist_emails;
CREATE POLICY identity_blocklist_select ON public.identity_blocklist_emails
  FOR SELECT TO authenticated USING (true);

COMMIT;
