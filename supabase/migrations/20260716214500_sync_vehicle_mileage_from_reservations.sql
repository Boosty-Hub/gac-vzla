-- Keep vehicles.mileage in sync with the mileage reported on service reservations.
-- Whenever a reservation is created or its mileage edited (any entry point: admin,
-- dealership, client portal, Kommo webhook), the vehicle record advances to that
-- mileage. Odometers only move forward: the vehicle is never downgraded.

CREATE OR REPLACE FUNCTION public.sync_vehicle_mileage_from_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.vehicle_id IS NOT NULL AND NEW.current_mileage IS NOT NULL AND NEW.current_mileage > 0 THEN
    UPDATE public.vehicles
       SET mileage = NEW.current_mileage
     WHERE id = NEW.vehicle_id
       AND mileage < NEW.current_mileage;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_vehicle_mileage ON public.reservations;
CREATE TRIGGER trg_sync_vehicle_mileage
AFTER INSERT OR UPDATE OF current_mileage ON public.reservations
FOR EACH ROW
EXECUTE FUNCTION public.sync_vehicle_mileage_from_reservation();

-- One-time backfill: advance each vehicle to the highest mileage already
-- recorded across its reservations.
UPDATE public.vehicles v
   SET mileage = m.max_km
  FROM (
    SELECT vehicle_id, max(current_mileage) AS max_km
      FROM public.reservations
     WHERE current_mileage IS NOT NULL
       AND vehicle_id IS NOT NULL
     GROUP BY vehicle_id
  ) m
 WHERE v.id = m.vehicle_id
   AND v.mileage < m.max_km;
