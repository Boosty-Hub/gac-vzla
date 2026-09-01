-- Permite desvincular un vehiculo de su cliente SIN borrarlo (pedido explicito del admin:
-- "no uiero eliminarlo uiero simplemente desvincularlo"). Hasta ahora vehicles.client_id era
-- NOT NULL -- un vehiculo no podia existir sin dueno -- asi que la unica forma de "sacarle" un
-- vehiculo a un cliente era transferirlo a otro cliente o borrarlo (cascada real, se pierde el
-- historial). Ninguna de las dos es lo que se pidio.
--
-- vehicles.driver_id ya es nullable (ON DELETE SET NULL) para el mismo tipo de relacion
-- opcional -- mismo patron, aca aplicado a client_id.
--
-- Se guarda de donde vino (unlinked_from_client_id/at/by) directo en la fila del vehiculo en
-- vez de forzarlo dentro de integration_logs (esa tabla es especificamente de eventos Kommo --
-- kommo_lead_id, prospect_id -- nada de esto tiene que ver con Kommo) o de crear una tabla
-- nueva para una sola accion. Como client_id pasa a NULL, sin esto el "de donde vino" se
-- perderia para siempre y no quedaria rastro de quien desvinculo que ni cuando.
ALTER TABLE public.vehicles
  ALTER COLUMN client_id DROP NOT NULL,
  ADD COLUMN unlinked_from_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN unlinked_at timestamptz,
  ADD COLUMN unlinked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- No se toca ninguna policy de RLS sobre vehicles: vehicles_select ya hace
-- `client_id = ANY(current_user_client_ids())`, que con client_id NULL simplemente no matchea
-- (no es un error) -- un vehiculo desvinculado deja de aparecerle al cliente que ya no lo tiene,
-- que es exactamente el comportamiento esperado. Las policies de concesionario/vendedor filtran
-- por reservations.vehicle_id, no por client_id, asi que tampoco cambian.
CREATE OR REPLACE FUNCTION public.admin_unlink_vehicle_from_client(p_vehicle_id uuid)
RETURNS public.vehicles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_vehicle public.vehicles;
BEGIN
  -- Pedido explicito: "SOLO PARA ADMIN". Sin excepcion para concesionario/vendedor ni siquiera
  -- sobre sus propios vehiculos atendidos -- a diferencia de assign_vehicle_driver, que si les
  -- da alcance sobre eso.
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_vehicle FROM public.vehicles WHERE vehicles.id = p_vehicle_id;
  IF v_vehicle.id IS NULL THEN
    RAISE EXCEPTION 'vehicle_not_found';
  END IF;

  -- Ya desvinculado (doble click, dos pestanas abiertas): responde con exito idempotente en
  -- vez de un error que no describe nada raro.
  IF v_vehicle.client_id IS NULL THEN
    RETURN v_vehicle;
  END IF;

  UPDATE public.vehicles
     SET client_id = NULL,
         unlinked_from_client_id = v_vehicle.client_id,
         unlinked_at = now(),
         unlinked_by = auth.uid(),
         updated_at = now()
   WHERE vehicles.id = p_vehicle_id
   RETURNING * INTO v_vehicle;

  RETURN v_vehicle;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_unlink_vehicle_from_client(uuid) TO authenticated, service_role;
