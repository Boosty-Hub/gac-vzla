-- Correction to 20260803130000: a postventa survey must have a client, not just a phone.
--
-- `fn_dispatch_eligible_surveys` filters `client_id IS NOT NULL` because the edge function
-- raises `survey_has_no_client` without one, and `deliver_satisfaction_survey` resolves the
-- Kommo conversation lead from the CLIENT record, not from a loose phone number.
--
-- So a pure walk-in (only `walkin_client_name` / `walkin_client_phone`, no `clients` row)
-- would produce a survey that is permanently invisible to the sweep: forever `pending`,
-- never delivered, quietly padding the queue. Skip it at creation instead.
--
-- Note this excludes far less than it sounds: `reservationAssignment.ts` creates an
-- `is_manual` client row for third-party service, so those walk-ins DO have a client_id and
-- are still covered.

CREATE OR REPLACE FUNCTION public.create_service_survey_on_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_client_name  text;
  v_client_phone text;
  v_plate        text;
  v_suppressed   text;
BEGIN
  -- No client row means no deliverable recipient (see header). Nothing to do.
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.full_name, c.phone INTO v_client_name, v_client_phone
    FROM public.clients c WHERE c.id = NEW.client_id;

  -- The reservation's walk-in fields are a fallback for the SNAPSHOT only: a client row can
  -- exist with a blank phone while the appointment captured one at the counter.
  v_client_name  := coalesce(v_client_name,  NEW.walkin_client_name);
  v_client_phone := coalesce(nullif(btrim(v_client_phone), ''), NEW.walkin_client_phone);

  IF v_client_phone IS NULL OR btrim(v_client_phone) = '' THEN
    RETURN NEW;
  END IF;

  SELECT v.plate INTO v_plate FROM public.vehicles v WHERE v.id = NEW.vehicle_id;
  v_plate := coalesce(v_plate, NEW.walkin_plate);

  -- Same 24h-per-client guard the sale survey uses. This is what stops a fleet client with
  -- six units serviced the same morning from getting six survey messages (R8).
  v_suppressed := public.fn_claim_survey_slot(NEW.client_id);

  INSERT INTO public.satisfaction_surveys (
    reservation_id, client_id, vehicle_id, origin, dealership_id,
    client_name, client_phone, sold_plate, suppressed_reason, eligible_at
  ) VALUES (
    NEW.id, NEW.client_id, NEW.vehicle_id, 'service', NEW.dealership_id,
    v_client_name, v_client_phone, v_plate, v_suppressed,
    -- R6: the completion IS the trigger. No elapsed-time computation, no delay — the
    -- dispatch sweep picks it up on its next pass.
    now()
  )
  ON CONFLICT (reservation_id) WHERE reservation_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$function$;
