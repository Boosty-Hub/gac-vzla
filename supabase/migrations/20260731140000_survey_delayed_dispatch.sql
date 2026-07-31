-- Delayed automatic dispatch of satisfaction surveys.
--
-- Requirement: "La encuesta se debe enviar 20 horas tras marcar ganado."
-- (The ticket said 24h; 20h was chosen deliberately to land inside WhatsApp's service
-- window rather than right at its edge.)
--
-- Until now `eligible_at` was computed and stored but NEVER READ: `deliver_satisfaction_survey`
-- was invoked immediately by kommo-webhook and by both portals at the moment of the win, so
-- the survey would have gone out instantly. This migration closes that gap with three pieces:
--
--   1. The delay becomes configurable (`survey_delay_hours`, default 20) and
--      `create_satisfaction_survey_on_won` uses it instead of a hardcoded 24 hours.
--   2. `fn_dispatch_eligible_surveys()` sweeps due surveys and calls the edge function.
--   3. pg_cron runs the sweep every 15 minutes.
--
-- The matching gate lives in kommo-api: a delivery whose survey is not yet eligible returns
-- `skipped: 'not_yet_eligible'` instead of sending. That single gate makes every caller
-- correct at once — the immediate win-time calls become no-ops, the cron passes naturally
-- because it only picks rows whose `eligible_at` has already passed, and a human 'resend'
-- bypasses it on purpose.
--
-- Repurchase is intentionally NOT delayed: `register_client_repurchase` sets
-- `eligible_at = now()` because that flow is a human clicking "Registrar y enviar encuesta".

-- ─── 1. Configurable delay ───────────────────────────────────────────────────
UPDATE public.integration_configs
SET config = jsonb_set(config, '{survey_delay_hours}', '20'::jsonb, true)
WHERE integration_name = 'kommo'
  AND NOT (config ? 'survey_delay_hours');

-- Faithful copy of the live definition with ONE change: the hardcoded `interval '24 hours'`
-- becomes the configured delay. Everything else — the SECURITY DEFINER, the empty
-- search_path, the single-argument fn_claim_survey_slot(NEW.client_id), the column list and
-- the ON CONFLICT — is preserved verbatim.
CREATE OR REPLACE FUNCTION public.create_satisfaction_survey_on_won()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_suppressed  text;
  v_delay_hours numeric;
BEGIN
  -- NEW.client_id is already resolved here: the BEFORE trigger trg_link_client_on_won (1.6)
  -- runs before this AFTER trigger and sets it in place on the very same statement/row.
  v_suppressed := public.fn_claim_survey_slot(NEW.client_id);

  -- Read the delay at fire time so it can be tuned without a migration. Falls back to 20
  -- when the key is absent or unparseable — a bad config value must never abort a sale.
  BEGIN
    SELECT coalesce((config->>'survey_delay_hours')::numeric, 20)
      INTO v_delay_hours
      FROM public.integration_configs
     WHERE integration_name = 'kommo' AND is_active
     LIMIT 1;
  EXCEPTION WHEN others THEN
    v_delay_hours := 20;
  END;
  v_delay_hours := coalesce(v_delay_hours, 20);

  INSERT INTO public.satisfaction_surveys (
    prospect_id, client_id, origin, kommo_lead_id, dealership_id, salesperson, client_name,
    client_phone, sold_plate, suppressed_reason, eligible_at
  ) VALUES (
    NEW.id, NEW.client_id, 'won', NEW.kommo_lead_id, NEW.dealership_id, NEW.salesperson,
    NEW.name, NEW.phone, NEW.sold_plate, v_suppressed,
    coalesce(NEW.status_updated_at, now()) + make_interval(secs => (v_delay_hours * 3600)::int)
  )
  ON CONFLICT (prospect_id) WHERE prospect_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$function$;

-- ─── 2. Dispatch bookkeeping ─────────────────────────────────────────────────
-- Without these, a survey that keeps being refused (a shared Kommo conversation lead, for
-- instance) never gets `delivered_at` set and would be retried by every single sweep,
-- forever, hitting the Kommo API each time.
ALTER TABLE public.satisfaction_surveys
  ADD COLUMN IF NOT EXISTS dispatch_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_dispatch_at   timestamptz;

CREATE INDEX IF NOT EXISTS idx_satisfaction_surveys_due
  ON public.satisfaction_surveys (eligible_at)
  WHERE delivered_at IS NULL AND status = 'pending';

-- ─── 3. The sweep ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_dispatch_eligible_surveys()
RETURNS TABLE (dispatched int, skipped_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_enabled   boolean;
  v_key       text;
  v_url       text;
  v_row       record;
  v_count     int := 0;
BEGIN
  -- Honor the kill switch HERE, not only in the edge function. If the sweep called out
  -- while delivery is disabled, every due survey would burn its retry budget against a
  -- guaranteed refusal and be exhausted by the time the switch is finally turned on.
  SELECT (config->'survey_delivery_enabled')::text = 'true'
    INTO v_enabled
    FROM public.integration_configs
   WHERE integration_name = 'kommo' AND is_active
   LIMIT 1;

  IF NOT coalesce(v_enabled, false) THEN
    RETURN QUERY SELECT 0, 'delivery_disabled'::text;
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'kommo_api_service_key' LIMIT 1;

  IF v_key IS NULL THEN
    INSERT INTO public.integration_logs (integration_name, event_type, status, details)
    VALUES ('kommo', 'survey_dispatch', 'error',
            jsonb_build_object('error', 'vault secret kommo_api_service_key missing'));
    RETURN QUERY SELECT 0, 'missing_service_key'::text;
    RETURN;
  END IF;

  v_url := 'https://wsbuqiznddvxcwvpnbxm.supabase.co/functions/v1/kommo-api';

  FOR v_row IN
    SELECT s.id
      FROM public.satisfaction_surveys s
     WHERE s.status = 'pending'
       AND s.delivered_at IS NULL
       AND s.suppressed_reason IS NULL
       -- No client means deliver_satisfaction_survey throws `survey_has_no_client`. The 17
       -- surveys created before the client-linking trigger existed are in exactly that
       -- state; they must not be swept.
       AND s.client_id IS NOT NULL
       AND s.eligible_at <= now()
       AND s.dispatch_attempts < 5
       AND (s.last_dispatch_at IS NULL OR s.last_dispatch_at < now() - interval '6 hours')
     ORDER BY s.eligible_at
     LIMIT 50
  LOOP
    -- Stamp BEFORE the call: pg_net is fire-and-forget, so the response never comes back
    -- here. Stamping first means a call that fails silently still consumes an attempt
    -- instead of looping forever.
    UPDATE public.satisfaction_surveys
       SET dispatch_attempts = dispatch_attempts + 1,
           last_dispatch_at  = now()
     WHERE id = v_row.id;

    -- The secret MUST go in `apikey`, not `Authorization: Bearer`. `sb_secret_*` keys are
    -- not JWTs, and kommo-api runs with the default verify_jwt=true, so the gateway rejects
    -- a non-JWT bearer with 401 "Invalid API key" before the function is ever reached —
    -- verified against production. kommo-api's own auth check accepts either header
    -- (index.ts:914-919); it is the gateway in front of it that is picky.
    PERFORM net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'apikey',       v_key
                 ),
      body    := jsonb_build_object(
                   'action',    'deliver_satisfaction_survey',
                   'survey_id', v_row.id,
                   'reason',    'won'
                 ),
      timeout_milliseconds := 20000
    );

    v_count := v_count + 1;
  END LOOP;

  IF v_count > 0 THEN
    INSERT INTO public.integration_logs (integration_name, event_type, status, details)
    VALUES ('kommo', 'survey_dispatch', 'success', jsonb_build_object('dispatched', v_count));
  END IF;

  RETURN QUERY SELECT v_count, NULL::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_dispatch_eligible_surveys() FROM PUBLIC, anon, authenticated;

-- ─── 4. Schedule ─────────────────────────────────────────────────────────────
-- Every 15 minutes. With a 20-hour delay the sweep granularity is irrelevant to the
-- customer, and a short period keeps a backlog from piling up after any downtime.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('dispatch-eligible-surveys')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch-eligible-surveys');

SELECT cron.schedule(
  'dispatch-eligible-surveys',
  '*/15 * * * *',
  $$SELECT public.fn_dispatch_eligible_surveys();$$
);
