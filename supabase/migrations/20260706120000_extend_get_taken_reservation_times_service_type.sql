-- re2 (bay capacity) x security reconciliation.
-- The security-definer RPC get_taken_reservation_times() was added by the hardening
-- migration so the public/portal calendars stop selecting public.reservations directly
-- (tenant isolation / no client-data exposure). It originally returned only the taken
-- time. Bay-capacity needs the service_type per taken slot to compute minute-by-minute
-- overlap against the dealership's bays. service_type is a non-sensitive category (no
-- client data), so it is safe to add to the RPC output while keeping the security model.
--
-- Changing the RETURNS TABLE signature requires dropping the function first.
-- Backward compatible for existing callers: they simply ignore the extra column.

DROP FUNCTION IF EXISTS public.get_taken_reservation_times(uuid, date);

CREATE OR REPLACE FUNCTION public.get_taken_reservation_times(p_dealership_id uuid, p_date date)
RETURNS TABLE (reservation_time time, service_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT r.reservation_time, r.service_type
  FROM public.reservations r
  WHERE r.dealership_id = p_dealership_id
    AND r.reservation_date = p_date
    AND r.status <> 'cancelada';
$$;

GRANT EXECUTE ON FUNCTION public.get_taken_reservation_times(uuid, date) TO anon, authenticated;
