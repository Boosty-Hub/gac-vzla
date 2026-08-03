-- Post-service (postventa) satisfaction survey.
--
-- Requirements covered:
--   R6  Trigger the postventa survey off the reservation being marked 'completada',
--       instead of computing elapsed time after the appointment date.
--   R7  Make each service's survey result reachable from the vehicle history.
--
-- What is REUSED vs what is NEW
--   Reused: the whole `satisfaction_surveys` delivery skeleton — token, status machine,
--   eligible_at/dispatch sweep, Kommo delivery, suppression. That machinery is origin-
--   agnostic and already battle-tested; a service survey is just another row with
--   origin='service'.
--   New: the ANSWERS. A sale asks about negotiation and financing; a service asks about
--   the workshop. Storing "how was the workshop" inside `q_financiamiento_tramites` would
--   make every existing dashboard aggregate silently wrong, so service answers get their
--   own table with their own columns.

-- ---------------------------------------------------------------------------
-- R6 — the survey row
-- ---------------------------------------------------------------------------
ALTER TABLE public.satisfaction_surveys
  ADD COLUMN IF NOT EXISTS reservation_id uuid REFERENCES public.reservations(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.satisfaction_surveys.reservation_id IS
  'Set only for origin = ''service''. The completed reservation this survey asks about.';

ALTER TABLE public.satisfaction_surveys DROP CONSTRAINT IF EXISTS satisfaction_surveys_origin_check;
ALTER TABLE public.satisfaction_surveys
  ADD CONSTRAINT satisfaction_surveys_origin_check
  CHECK (origin = ANY (ARRAY['won'::text, 'repurchase'::text, 'service'::text]));

-- One survey per completed service. Re-completing a reservation (a correction, a reopened
-- ticket) must not mint a second token for the same visit.
CREATE UNIQUE INDEX IF NOT EXISTS idx_satisfaction_surveys_reservation
  ON public.satisfaction_surveys (reservation_id) WHERE reservation_id IS NOT NULL;

-- R7 — the vehicle-history view looks up surveys by vehicle; without this it is a seq scan
-- per rendered vehicle.
CREATE INDEX IF NOT EXISTS idx_satisfaction_surveys_vehicle
  ON public.satisfaction_surveys (vehicle_id) WHERE vehicle_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- R6 — the answers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_survey_responses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id             uuid NOT NULL UNIQUE REFERENCES public.satisfaction_surveys(id) ON DELETE CASCADE,
  q_agendamiento        smallint NOT NULL CHECK (q_agendamiento        BETWEEN 1 AND 5),
  q_recepcion_asesor    smallint NOT NULL CHECK (q_recepcion_asesor    BETWEEN 1 AND 5),
  q_tiempo_entrega      smallint NOT NULL CHECK (q_tiempo_entrega      BETWEEN 1 AND 5),
  q_calidad_servicio    smallint NOT NULL CHECK (q_calidad_servicio    BETWEEN 1 AND 5),
  q_instalaciones       smallint NOT NULL CHECK (q_instalaciones       BETWEEN 1 AND 5),
  nps_recomienda        boolean,
  comment               text,
  -- Same generated-column contract as `satisfaction_responses`, so the dashboard can treat
  -- both shapes uniformly once it has read `overall_score` / `has_low_score`.
  overall_score numeric GENERATED ALWAYS AS (
    (q_agendamiento + q_recepcion_asesor + q_tiempo_entrega + q_calidad_servicio + q_instalaciones)::numeric / 5::numeric
  ) STORED,
  has_low_score boolean GENERATED ALWAYS AS (
    LEAST(q_agendamiento, q_recepcion_asesor, q_tiempo_entrega, q_calidad_servicio, q_instalaciones) < 3
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.service_survey_responses IS
  'Answers to a postventa (origin = ''service'') survey. Sale answers live in satisfaction_responses.';

ALTER TABLE public.service_survey_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_survey_responses_admin_all ON public.service_survey_responses;
CREATE POLICY service_survey_responses_admin_all ON public.service_survey_responses
  FOR ALL USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS service_survey_responses_staff_select ON public.service_survey_responses;
CREATE POLICY service_survey_responses_staff_select ON public.service_survey_responses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.satisfaction_surveys s
      WHERE s.id = service_survey_responses.survey_id
        AND public.get_user_role() = ANY (ARRAY['concesionario', 'Asesor de Servicio'])
        AND s.dealership_id = ANY (public.current_user_dealership_ids())
    )
  );

-- The service advisor owns this survey but was never covered by the sale-era policy, which
-- only knew about 'concesionario' and 'vendedor'. Without this they cannot read the results
-- of the services they themselves closed.
DROP POLICY IF EXISTS satisfaction_surveys_staff_select ON public.satisfaction_surveys;
CREATE POLICY satisfaction_surveys_staff_select ON public.satisfaction_surveys
  FOR SELECT USING (
    (public.get_user_role() = ANY (ARRAY['concesionario', 'Asesor de Servicio'])
      AND dealership_id = ANY (public.current_user_dealership_ids()))
    OR (public.get_user_role() = 'vendedor'
      AND salesperson = ANY (public.current_user_salesperson_names()))
  );

-- ---------------------------------------------------------------------------
-- R6 — the trigger
-- ---------------------------------------------------------------------------
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
  -- Resolve the recipient. A walk-in has no client row, only the two walkin_* fields.
  SELECT c.full_name, c.phone INTO v_client_name, v_client_phone
    FROM public.clients c WHERE c.id = NEW.client_id;

  v_client_name  := coalesce(v_client_name,  NEW.walkin_client_name);
  v_client_phone := coalesce(v_client_phone, NEW.walkin_client_phone);

  -- No phone means nothing to deliver to. Creating a permanently undeliverable survey
  -- would only inflate the "pending" queue that the dispatch sweep retries every 15 min.
  IF v_client_phone IS NULL OR btrim(v_client_phone) = '' THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(v.plate, NEW.walkin_plate) INTO v_plate
    FROM public.vehicles v WHERE v.id = NEW.vehicle_id;
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

DROP TRIGGER IF EXISTS trg_create_service_survey_on_completed ON public.reservations;
CREATE TRIGGER trg_create_service_survey_on_completed
  AFTER UPDATE OF status ON public.reservations
  FOR EACH ROW
  WHEN (NEW.status = 'completada' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.create_service_survey_on_completed();

-- ---------------------------------------------------------------------------
-- Public form — it must know WHICH question set to render before showing anything.
-- `RETURNS TABLE` cannot gain a column via CREATE OR REPLACE, hence DROP + re-grant.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_survey_by_token(text);
CREATE FUNCTION public.get_survey_by_token(p_token text)
RETURNS TABLE(
  survey_id uuid, client_name text, dealership_name text, status text,
  already_responded boolean, brand text, origin text, plate text, service_type text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT s.id,
         s.client_name,
         d.name,
         s.status,
         (s.status = 'responded'),
         vm.brand,
         s.origin,
         coalesce(v.plate, s.sold_plate),
         r.service_type
  FROM public.satisfaction_surveys s
  LEFT JOIN public.dealerships d     ON d.id  = s.dealership_id
  LEFT JOIN public.vehicles v        ON v.id  = s.vehicle_id
  LEFT JOIN public.vehicle_models vm ON vm.id = v.model_id
  LEFT JOIN public.reservations r    ON r.id  = s.reservation_id
  WHERE s.token = p_token
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_survey_by_token(text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Public form — submitting service answers. Deliberately a separate RPC rather than more
-- optional params on `submit_survey_response`: the two question sets have nothing in
-- common, and one function with ten half-used arguments is how validation gets skipped.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_service_survey_response(
  p_token text,
  p_agendamiento integer,
  p_recepcion_asesor integer,
  p_tiempo_entrega integer,
  p_calidad_servicio integer,
  p_instalaciones integer,
  p_nps boolean,
  p_comment text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_survey record;
BEGIN
  SELECT id, status, origin INTO v_survey
  FROM public.satisfaction_surveys WHERE token = p_token FOR UPDATE;

  IF v_survey.id IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF v_survey.status = 'responded' THEN RAISE EXCEPTION 'already_responded'; END IF;
  -- Guard against a sale token being posted to the service endpoint: the answers would
  -- land in the wrong table and the sale survey would never look answered.
  IF v_survey.origin IS DISTINCT FROM 'service' THEN RAISE EXCEPTION 'wrong_survey_type'; END IF;

  IF p_agendamiento     NOT BETWEEN 1 AND 5 OR p_recepcion_asesor NOT BETWEEN 1 AND 5
     OR p_tiempo_entrega NOT BETWEEN 1 AND 5 OR p_calidad_servicio NOT BETWEEN 1 AND 5
     OR p_instalaciones  NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'invalid_rating';
  END IF;

  INSERT INTO public.service_survey_responses (
    survey_id, q_agendamiento, q_recepcion_asesor, q_tiempo_entrega,
    q_calidad_servicio, q_instalaciones, nps_recomienda, comment
  ) VALUES (
    v_survey.id, p_agendamiento, p_recepcion_asesor, p_tiempo_entrega,
    p_calidad_servicio, p_instalaciones, p_nps, nullif(btrim(p_comment), '')
  );

  UPDATE public.satisfaction_surveys
    SET status = 'responded', responded_at = now(), updated_at = now()
    WHERE id = v_survey.id;

  RETURN 'ok';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.submit_service_survey_response(text, integer, integer, integer, integer, integer, boolean, text)
  TO anon, authenticated, service_role;

-- Symmetric guard on the sale RPC: a service token posted to the sale endpoint must fail
-- loudly instead of writing sale-shaped answers for a workshop visit.
CREATE OR REPLACE FUNCTION public.submit_survey_response(
  p_token text, p_atencion_digital integer, p_bienvenida_presencial integer,
  p_negociacion_asesoria integer, p_financiamiento_tramites integer,
  p_experiencia_entrega integer, p_nps boolean, p_comment text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_survey record;
BEGIN
  SELECT id, status, origin INTO v_survey
  FROM public.satisfaction_surveys WHERE token = p_token FOR UPDATE;

  IF v_survey.id IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF v_survey.status = 'responded' THEN RAISE EXCEPTION 'already_responded'; END IF;
  IF v_survey.origin = 'service' THEN RAISE EXCEPTION 'wrong_survey_type'; END IF;

  IF p_atencion_digital NOT BETWEEN 1 AND 5 OR p_bienvenida_presencial NOT BETWEEN 1 AND 5
     OR p_negociacion_asesoria NOT BETWEEN 1 AND 5 OR p_financiamiento_tramites NOT BETWEEN 1 AND 5
     OR p_experiencia_entrega NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'invalid_rating';
  END IF;

  INSERT INTO public.satisfaction_responses (
    survey_id, q_atencion_digital, q_bienvenida_presencial, q_negociacion_asesoria,
    q_financiamiento_tramites, q_experiencia_entrega, nps_recomienda, comment
  ) VALUES (
    v_survey.id, p_atencion_digital, p_bienvenida_presencial, p_negociacion_asesoria,
    p_financiamiento_tramites, p_experiencia_entrega, p_nps, nullif(btrim(p_comment), '')
  );

  UPDATE public.satisfaction_surveys
    SET status = 'responded', responded_at = now(), updated_at = now()
    WHERE id = v_survey.id;

  RETURN 'ok';
END;
$function$;
