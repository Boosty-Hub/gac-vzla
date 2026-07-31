-- Satisfaction Survey — Part 2: prospect-to-client identity resolution, fleet/repurchase
-- vehicle registration, and the shared 24h delivery gate.
-- See openspec/changes/satisfaction-survey/{proposal,requirements,design}.md.
--
-- ADDITIVE except for ONE deliberate, documented non-additive step (search
-- "NON-ADDITIVE STEP" below): satisfaction_surveys.prospect_id becomes nullable and its
-- UNIQUE constraint is replaced by a partial unique index, so a survey row can exist with
-- prospect_id = NULL (the repurchase flow — see design.md D1/D3). That step forces the two
-- existing `ON CONFLICT (prospect_id) DO NOTHING` call sites to be recreated in THIS SAME
-- migration with an explicit predicate (search "RECREATED" below) — otherwise the next won
-- prospect raises `42P10: there is no unique or exclusion constraint matching the ON
-- CONFLICT specification`.
--
-- A full, executable paired rollback for the non-additive step is at the bottom of this
-- file, entirely commented out (search "ROLLBACK BLOCK") so applying this migration can
-- never accidentally also run its own rollback.
--
-- Deploy order: (1) this file, (2) 20260729120100_satisfaction_delivery_config.sql,
-- (3) the frontend (Phase 2-4 of this change; it calls the RPCs added here).

-- ============================================================================
-- 1.1 — prospects.cedula (defensive column add).
-- ============================================================================
-- kommo-api:517 already reads a `prospects.cedula` column defensively; it predates this
-- migrations folder. This ADD COLUMN is a no-op if it already exists live.
--
-- CORRECTNESS NOTE (verified against the live frontend, not just existing row counts):
-- nothing in AdminProspectos.tsx, DealershipProspectos.tsx, or PublicProspectos.tsx ever
-- WRITES prospects.cedula — it is always NULL on every prospect today and will stay NULL
-- until a future change adds capture. Consequently the cedula branch of
-- fn_resolve_or_create_client_for_prospect (below) can never match on the prospect-win
-- path; phone is the effective first dedup key there today. The cedula branch is NOT dead
-- code in general — it is real and exercised on the repurchase path (register_client_
-- repurchase, below), which resolves against an already-known clients row whose cedula is
-- commonly populated for existing customers. Shipping this as designed, not silently: see
-- also design.md's Open Questions.
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS cedula text;

-- ============================================================================
-- 1.2 — prospects.client_id, satisfaction_surveys new columns.
-- ============================================================================
ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_prospects_client_id ON public.prospects(client_id);

ALTER TABLE public.satisfaction_surveys
  ADD COLUMN IF NOT EXISTS client_id         uuid REFERENCES public.clients(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vehicle_id        uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin            text NOT NULL DEFAULT 'won',
  ADD COLUMN IF NOT EXISTS suppressed_reason text,
  ADD COLUMN IF NOT EXISTS delivered_at      timestamptz;

ALTER TABLE public.satisfaction_surveys DROP CONSTRAINT IF EXISTS satisfaction_surveys_origin_check;
ALTER TABLE public.satisfaction_surveys ADD CONSTRAINT satisfaction_surveys_origin_check
  CHECK (origin IN ('won','repurchase'));

CREATE INDEX IF NOT EXISTS idx_satisfaction_surveys_client
  ON public.satisfaction_surveys(client_id, created_at DESC);

-- ============================================================================
-- 1.3 — NON-ADDITIVE STEP: prospect_id becomes nullable; UNIQUE constraint replaced by a
-- partial unique index, so repurchase-origin survey rows (prospect_id = NULL) can exist.
-- ============================================================================
ALTER TABLE public.satisfaction_surveys ALTER COLUMN prospect_id DROP NOT NULL;
ALTER TABLE public.satisfaction_surveys DROP CONSTRAINT IF EXISTS satisfaction_surveys_prospect_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_satisfaction_surveys_prospect
  ON public.satisfaction_surveys(prospect_id) WHERE prospect_id IS NOT NULL;

-- Load-bearing consequence — dropping the UNIQUE *constraint* for a *partial* unique index
-- breaks every `ON CONFLICT (prospect_id) DO NOTHING` in the codebase. Both call sites are
-- recreated immediately below with the predicate spelled out. Omitting the predicate
-- reproduces 42P10 on the very next prospect win.

-- ============================================================================
-- 1.4 — RECREATED: create_satisfaction_survey_on_won() and backfill_satisfaction_surveys(),
-- both fixed for the partial-index ON CONFLICT predicate. create_satisfaction_survey_on_won
-- additionally now populates client_id/origin/suppressed_reason (design.md data flow: the
-- AFTER trigger is a caller of fn_claim_survey_slot, defined in section 1.5 below — plpgsql
-- function bodies are resolved at call time, not at CREATE time, so this forward reference
-- is safe regardless of statement order).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_satisfaction_survey_on_won()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_suppressed text;
BEGIN
  -- NEW.client_id is already resolved here: the BEFORE trigger trg_link_client_on_won (1.6)
  -- runs before this AFTER trigger and sets it in place on the very same statement/row.
  v_suppressed := public.fn_claim_survey_slot(NEW.client_id);

  INSERT INTO public.satisfaction_surveys (
    prospect_id, client_id, origin, kommo_lead_id, dealership_id, salesperson, client_name,
    client_phone, sold_plate, suppressed_reason, eligible_at
  ) VALUES (
    NEW.id, NEW.client_id, 'won', NEW.kommo_lead_id, NEW.dealership_id, NEW.salesperson,
    NEW.name, NEW.phone, NEW.sold_plate, v_suppressed,
    coalesce(NEW.status_updated_at, now()) + interval '24 hours'
  )
  ON CONFLICT (prospect_id) WHERE prospect_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_satisfaction_survey_on_won ON public.prospects;
CREATE TRIGGER trg_create_satisfaction_survey_on_won
  AFTER UPDATE OF status ON public.prospects
  FOR EACH ROW
  WHEN (NEW.status = 'ganado' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.create_satisfaction_survey_on_won();

-- backfill_satisfaction_surveys: ON CONFLICT predicate fix ONLY. client_id/vehicle_id are
-- deliberately left unset (NULL) here — requirements.md R11 scopes this whole change
-- forward-only ("Nothing is done for clients that already exist... No backfill"), so this
-- pre-existing historical-survey backfill utility must not start resolving client identity
-- retroactively. Body otherwise identical to 20260720120000_satisfaction_surveys.sql:224-243.
CREATE OR REPLACE FUNCTION public.backfill_satisfaction_surveys()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'No autorizado'; END IF;

  INSERT INTO public.satisfaction_surveys (
    prospect_id, kommo_lead_id, dealership_id, salesperson, client_name, client_phone,
    sold_plate, eligible_at
  )
  SELECT p.id, p.kommo_lead_id, p.dealership_id, p.salesperson, p.name, p.phone,
         p.sold_plate, coalesce(p.status_updated_at, now()) + interval '24 hours'
  FROM public.prospects p
  WHERE p.status = 'ganado'
  ON CONFLICT (prospect_id) WHERE prospect_id IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================================
-- 1.5 — Shared functions every win/repurchase path must pass through (design.md D1).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_resolve_or_create_client_for_prospect(p_prospect_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE p record; v_client_id uuid; v_phone10 text;
BEGIN
  SELECT * INTO p FROM public.prospects WHERE id = p_prospect_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'prospect_not_found'; END IF;
  IF p.client_id IS NOT NULL THEN RETURN p.client_id; END IF;      -- 0) idempotent fast path

  v_phone10 := right(regexp_replace(coalesce(p.phone,''), '\D', '', 'g'), 10);

  -- 1) cedula  2) phone (last 10 digits)  3) email — MIRRORS findExistingContact
  --    (kommo-api:593-604, CI-RIF -> phone -> email) so DB and Kommo agree on identity.
  --    p.cedula is currently always NULL on this path (see the ALTER TABLE comment above
  --    for prospects.cedula) so this branch cannot match here today; phone is the effective
  --    first key until a future change adds cedula capture to the prospect forms.
  --    ORDER BY created_at: when the 62/60 existing duplicates match, always bind to the
  --    OLDEST row so this path is deterministic and never mints a third duplicate.
  SELECT c.id INTO v_client_id FROM public.clients c
   WHERE nullif(trim(p.cedula),'') IS NOT NULL
     AND upper(trim(c.cedula)) = upper(trim(p.cedula))
   ORDER BY c.created_at LIMIT 1;

  IF v_client_id IS NULL AND length(v_phone10) = 10 THEN
    SELECT c.id INTO v_client_id FROM public.clients c
     WHERE right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 10) = v_phone10
     ORDER BY c.created_at LIMIT 1;
  END IF;

  IF v_client_id IS NULL AND nullif(trim(p.email),'') IS NOT NULL THEN
    SELECT c.id INTO v_client_id FROM public.clients c
     WHERE lower(trim(c.email)) = lower(trim(p.email))
     ORDER BY c.created_at LIMIT 1;
  END IF;

  -- Name is DELIBERATELY NOT a dedup key: 7 duplicate full_names, free text, unsafe.
  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (full_name, cedula, phone, email, state, is_active)
    VALUES (coalesce(nullif(trim(p.name),''), 'Cliente'), nullif(trim(p.cedula),''),
            nullif(trim(p.phone),''), nullif(trim(p.email),''),
            nullif(trim(p."Estado de Vnzla"),''), true)
    RETURNING id INTO v_client_id;
  END IF;

  RETURN v_client_id;
END; $$;

-- Rolling 24h gate. Serialized by a row lock on `clients`: concurrent triggering events for
-- the same client queue behind each other, so the second one sees the first's committed row.
-- Postgres cannot express a rolling window as a constraint, and a calendar-day unique index
-- is both too strict and too loose (23:00 + 01:00 = 2 surveys in 2h).
CREATE OR REPLACE FUNCTION public.fn_claim_survey_slot(p_client_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_lock uuid; v_recent int;
BEGIN
  IF p_client_id IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_lock FROM public.clients WHERE id = p_client_id FOR UPDATE;  -- serialize
  IF v_lock IS NULL THEN RETURN NULL; END IF;
  SELECT count(*) INTO v_recent
    FROM public.satisfaction_surveys s
   WHERE s.client_id = p_client_id
     AND s.suppressed_reason IS NULL
     AND s.created_at > now() - interval '24 hours';
  IF v_recent > 0 THEN RETURN 'rate_limited_24h'; END IF;
  RETURN NULL;
END; $$;

-- ============================================================================
-- 1.6 — BEFORE trigger: link (or create) the client in place on the won-transition.
-- design.md D2: a BEFORE trigger assigning NEW.client_id directly, NOT a second UPDATE from
-- an AFTER trigger (which would re-enter the prospect trigger stack). Because this runs
-- BEFORE the row is written, the AFTER trigger above (trg_create_satisfaction_survey_on_won)
-- already sees NEW.client_id populated in the same statement. Zero recursion surface.
--
-- No OLD.status IS DISTINCT FROM NEW.status guard here (unlike the AFTER survey trigger):
-- this must also re-run, harmlessly, when register_won_prospect (1.7) re-invokes on an
-- already-'ganado' prospect (the "Falta placa" backfill flow) — fn_resolve_or_create_client_
-- for_prospect's own idempotent fast path (p.client_id IS NOT NULL) makes every re-run a
-- cheap no-op.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.link_client_on_won()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF NEW.status = 'ganado' THEN
    NEW.client_id := public.fn_resolve_or_create_client_for_prospect(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_client_on_won ON public.prospects;
CREATE TRIGGER trg_link_client_on_won
  BEFORE UPDATE OF status ON public.prospects
  FOR EACH ROW
  WHEN (NEW.status = 'ganado')
  EXECUTE FUNCTION public.link_client_on_won();

-- ============================================================================
-- 1.7a — RPC: register_won_prospect. Single entry point for admin/dealership UI wins
-- (Phase 3). Performs the status UPDATE that fires 1.4/1.6's trigger pair, then registers
-- one `vehicles` row per entry in p_vehicles (fleet or not — the array simply has one entry
-- in the ordinary case) and stamps satisfaction_surveys.vehicle_id.
--
-- DEVIATION FROM design.md's originally stated signature
-- (register_won_prospect(prospect_id, plates[], is_fleet, model_id)): a single shared
-- p_model_id cannot work here. public.vehicles.model_id and public.vehicles.year are both
-- NOT NULL (confirmed against src/integrations/supabase/types.ts's generated Insert type —
-- `model_id: string` and `year: number`, neither optional), and `prospects` carries no
-- structured model/year at all — only free-text model_interest, which exact-matches
-- vehicle_models.name in 0 of 2929 rows (79.1% after normalization) and has no year source
-- whatsoever. Fuzzy mapping was explicitly refused: `vehicles` feeds the warranty module and
-- wrong data there corrupts warranty calculations. The approved fix (user-confirmed) is that
-- the salesperson supplies model_id and year EXPLICITLY, per plate, in the plate dialog.
-- p_vehicles is therefore a jsonb ARRAY of per-plate triples:
--   [{"plate": text, "model_id": uuid, "year": int}, ...]
-- one element per vehicle, fleet or not.
--
-- Every element is validated in a first pass, before any write, so a single bad entry inside
-- a 20-plate fleet aborts the whole call instead of leaving a partial vehicles insert:
--   - plate / model_id / year are all required and non-blank — RAISE EXCEPTION otherwise,
--     no silent defaults, no guessing
--   - model_id must reference an existing public.vehicle_models row
--   - year must fall inside [1980, extract(year from now())::int + 2]
-- Exactly one satisfaction_surveys row is still created per won prospect regardless of how
-- many vehicle entries are passed (R5) — the trigger pair fires once, off the single
-- `UPDATE prospects` statement below, same as before.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.register_won_prospect(
  p_prospect_id uuid,
  p_vehicles    jsonb   DEFAULT '[]'::jsonb,
  p_is_fleet    boolean DEFAULT false
)
RETURNS TABLE (client_id uuid, survey_id uuid, survey_token text, suppressed_reason text, vehicles_created int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_prospect      record;
  v_entry         jsonb;
  v_plate         text;
  v_model_id      uuid;
  v_year          int;
  v_min_year      int := 1980;
  v_max_year      int;
  v_first_plate   text;
  v_vehicle_id    uuid;
  v_first_vehicle uuid;
  v_created       int := 0;
  v_client_id     uuid;
BEGIN
  SELECT * INTO v_prospect FROM public.prospects WHERE id = p_prospect_id;
  IF v_prospect.id IS NULL THEN RAISE EXCEPTION 'prospect_not_found'; END IF;

  -- Authorization mirrors mark_survey_sent's role-gate LOGIC (20260720120000:206-210).
  -- Error codes in this migration's new functions are English snake_case (matching
  -- fn_resolve_or_create_client_for_prospect's own 'prospect_not_found' above and design.md's
  -- kommo-api error-code contract), not mark_survey_sent's older Spanish-sentence style.
  IF NOT (public.is_admin_user()
      OR (public.get_user_role() = 'concesionario' AND v_prospect.dealership_id = ANY(public.current_user_dealership_ids()))
      OR (public.get_user_role() = 'vendedor'      AND v_prospect.salesperson  = ANY(public.current_user_salesperson_names()))) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- "Plate Capture Remains Mandatory on UI-Driven Wins" / "Fleet win requires at least one
  -- plate" (prospect-to-client spec): enforced here too, not just client-side.
  IF p_vehicles IS NULL OR jsonb_typeof(p_vehicles) IS DISTINCT FROM 'array' OR jsonb_array_length(p_vehicles) = 0 THEN
    RAISE EXCEPTION 'at_least_one_vehicle_required';
  END IF;

  v_max_year := extract(year FROM now())::int + 2;

  -- Validation pass: every entry must carry plate + model_id + year, model_id must resolve to
  -- a real vehicle_models row, and year must be sane. All-or-nothing — nothing is written yet.
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_vehicles) LOOP
    IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'invalid_vehicle_entry: expected a JSON object, got %', v_entry;
    END IF;
    IF NOT (v_entry ? 'plate') OR nullif(btrim(v_entry->>'plate'), '') IS NULL THEN
      RAISE EXCEPTION 'plate_required_for_every_vehicle';
    END IF;
    IF NOT (v_entry ? 'model_id') OR nullif(btrim(v_entry->>'model_id'), '') IS NULL THEN
      RAISE EXCEPTION 'model_id_required_for_every_vehicle';
    END IF;
    IF NOT (v_entry ? 'year') OR nullif(btrim(v_entry->>'year'), '') IS NULL THEN
      RAISE EXCEPTION 'year_required_for_every_vehicle';
    END IF;

    BEGIN
      v_model_id := (v_entry->>'model_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid_model_id: %', v_entry->>'model_id';
    END;
    IF NOT EXISTS (SELECT 1 FROM public.vehicle_models m WHERE m.id = v_model_id) THEN
      RAISE EXCEPTION 'model_id_not_found: %', v_model_id;
    END IF;

    BEGIN
      v_year := (v_entry->>'year')::int;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid_year: %', v_entry->>'year';
    END;
    IF v_year < v_min_year OR v_year > v_max_year THEN
      RAISE EXCEPTION 'year_out_of_range: % (expected between % and %)', v_year, v_min_year, v_max_year;
    END IF;

    IF v_first_plate IS NULL THEN
      v_first_plate := upper(btrim(v_entry->>'plate'));
    END IF;
  END LOOP;

  -- Single UPDATE so the BEFORE trigger (1.6, client link) and the AFTER trigger (1.4,
  -- survey claim) both fire inside this one statement (design.md D2). status is set
  -- unconditionally, even when already 'ganado' (the "Falta placa" backfill
  -- re-invocation): the AFTER trigger's own WHEN clause (OLD.status IS DISTINCT FROM
  -- NEW.status) then correctly skips re-creating the survey, while this function backfills
  -- vehicle_id on the existing row below instead.
  UPDATE public.prospects
     SET status = 'ganado', sold_plate = v_first_plate, is_fleet = p_is_fleet
   WHERE id = p_prospect_id
  RETURNING client_id INTO v_client_id;

  -- vehicles: one row per validated entry, all under the resolved client. Idempotent: a plate
  -- already registered to this client (from an earlier call, or an earlier entry in this same
  -- array) is skipped rather than duplicated.
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_vehicles) LOOP
    v_plate    := upper(btrim(v_entry->>'plate'));
    v_model_id := (v_entry->>'model_id')::uuid;
    v_year     := (v_entry->>'year')::int;

    IF EXISTS (
      SELECT 1 FROM public.vehicles
      WHERE vehicles.client_id = v_client_id AND upper(vehicles.plate) = v_plate
    ) THEN
      CONTINUE; -- idempotent dedup: plate already registered to this client
    END IF;
    INSERT INTO public.vehicles (client_id, model_id, year, plate, mileage, purchase_date, warranty_active, is_active)
    VALUES (v_client_id, v_model_id, v_year, v_plate, 0, current_date, true, true)
    RETURNING id INTO v_vehicle_id;
    v_created := v_created + 1;
    IF v_first_vehicle IS NULL THEN v_first_vehicle := v_vehicle_id; END IF;
  END LOOP;
  -- No "zero created" guard here (unlike register_client_repurchase): this RPC's primary
  -- job is confirming the win (client resolution + survey claim), which must still succeed
  -- idempotently on a retry that reuses already-registered plates.

  -- Stamp vehicle_id on this prospect's survey if it does not have one yet — covers both
  -- the fresh-insert case (the AFTER trigger above just created it with vehicle_id NULL)
  -- and the "Falta placa" backfill case (an older no-plate survey row already exists, e.g.
  -- created by the Kommo webhook path per design.md section 4).
  IF v_first_vehicle IS NOT NULL THEN
    UPDATE public.satisfaction_surveys s
       SET vehicle_id = v_first_vehicle
     WHERE s.prospect_id = p_prospect_id AND s.vehicle_id IS NULL;
  END IF;

  RETURN QUERY
  SELECT v_client_id, s.id, s.token, s.suppressed_reason, v_created
  FROM public.satisfaction_surveys s
  WHERE s.prospect_id = p_prospect_id
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$;

-- ============================================================================
-- 1.7b — RPC: register_client_repurchase. Entry point for the "Agregar vehículo" dialog on
-- an existing client (Phase 3, R6). Three outcomes are entirely a caller decision: this
-- function only ever runs when the caller decided to write something (p_send_survey merely
-- toggles whether a survey row is also created).
--
-- Symmetric with register_won_prospect (1.7a) for the same reason: public.vehicles.model_id
-- and public.vehicles.year are both NOT NULL and a single shared p_model_id/p_year across a
-- repurchase batch would stamp every vehicle in the batch with one model and one year even
-- when the client is repurchasing two different vehicles. p_vehicles is therefore the same
-- jsonb ARRAY of per-plate triples used by register_won_prospect:
--   [{"plate": text, "model_id": uuid, "year": int}, ...]
-- validated in the same first pass, before any write, with the same exception names, so the
-- frontend can handle both RPCs uniformly.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.register_client_repurchase(
  p_client_id     uuid,
  p_vehicles      jsonb   DEFAULT '[]'::jsonb,
  p_send_survey   boolean DEFAULT true,
  p_dealership_id uuid    DEFAULT NULL
)
RETURNS TABLE (vehicles_created int, survey_id uuid, survey_token text, suppressed_reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_client        record;
  v_entry         jsonb;
  v_plate         text;
  v_model_id      uuid;
  v_year          int;
  v_min_year      int := 1980;
  v_max_year      int;
  v_vehicle_id    uuid;
  v_first_vehicle uuid;
  v_first_plate   text;
  v_created       int := 0;
  v_suppressed    text;
  v_survey_id     uuid;
  v_survey_token  text;
BEGIN
  SELECT * INTO v_client FROM public.clients WHERE id = p_client_id;
  IF v_client.id IS NULL THEN RAISE EXCEPTION 'client_not_found'; END IF;

  -- Authorization: same SHAPE as mark_survey_sent's role gate (20260720120000:206-210), but
  -- checked against the caller-supplied p_dealership_id rather than a row's own column —
  -- clients carry no dealership_id at all (design.md D6: "clients has no dealership_id and
  -- no scoping policy for staff"), so there is nothing else on this table to scope against.
  -- This is an explicit interpretation of design.md's "authorize (same predicate as
  -- mark_survey_sent)" for a table that structurally cannot carry that predicate's own
  -- columns; flagged here for confirmation rather than silently assumed.
  IF NOT (public.is_admin_user()
      OR (public.get_user_role() IN ('concesionario','vendedor')
          AND p_dealership_id IS NOT NULL
          AND p_dealership_id = ANY(public.current_user_dealership_ids()))) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_vehicles IS NULL OR jsonb_typeof(p_vehicles) IS DISTINCT FROM 'array' OR jsonb_array_length(p_vehicles) = 0 THEN
    RAISE EXCEPTION 'at_least_one_vehicle_required';
  END IF;

  v_max_year := extract(year FROM now())::int + 2;

  -- Validation pass: identical shape/rules to register_won_prospect's (1.7a) — every entry
  -- must carry plate + model_id + year, model_id must resolve to a real vehicle_models row,
  -- year must be sane. All-or-nothing — nothing is written yet.
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_vehicles) LOOP
    IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'invalid_vehicle_entry: expected a JSON object, got %', v_entry;
    END IF;
    IF NOT (v_entry ? 'plate') OR nullif(btrim(v_entry->>'plate'), '') IS NULL THEN
      RAISE EXCEPTION 'plate_required_for_every_vehicle';
    END IF;
    IF NOT (v_entry ? 'model_id') OR nullif(btrim(v_entry->>'model_id'), '') IS NULL THEN
      RAISE EXCEPTION 'model_id_required_for_every_vehicle';
    END IF;
    IF NOT (v_entry ? 'year') OR nullif(btrim(v_entry->>'year'), '') IS NULL THEN
      RAISE EXCEPTION 'year_required_for_every_vehicle';
    END IF;

    BEGIN
      v_model_id := (v_entry->>'model_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid_model_id: %', v_entry->>'model_id';
    END;
    IF NOT EXISTS (SELECT 1 FROM public.vehicle_models m WHERE m.id = v_model_id) THEN
      RAISE EXCEPTION 'model_id_not_found: %', v_model_id;
    END IF;

    BEGIN
      v_year := (v_entry->>'year')::int;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid_year: %', v_entry->>'year';
    END;
    IF v_year < v_min_year OR v_year > v_max_year THEN
      RAISE EXCEPTION 'year_out_of_range: % (expected between % and %)', v_year, v_min_year, v_max_year;
    END IF;
  END LOOP;

  -- vehicles: one row per validated entry, all under this client. Idempotent: a plate already
  -- registered to this client (from an earlier call, or an earlier entry in this same array)
  -- is skipped rather than duplicated (design.md section 7).
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_vehicles) LOOP
    v_plate    := upper(btrim(v_entry->>'plate'));
    v_model_id := (v_entry->>'model_id')::uuid;
    v_year     := (v_entry->>'year')::int;

    IF EXISTS (
      SELECT 1 FROM public.vehicles
      WHERE vehicles.client_id = p_client_id AND upper(vehicles.plate) = v_plate
    ) THEN
      CONTINUE; -- skip plates already on this client (design.md section 7)
    END IF;
    INSERT INTO public.vehicles (client_id, model_id, year, plate, mileage, purchase_date, warranty_active, is_active)
    VALUES (p_client_id, v_model_id, v_year, v_plate, 0, current_date, true, true)
    RETURNING id INTO v_vehicle_id;
    v_created := v_created + 1;
    IF v_first_vehicle IS NULL THEN
      v_first_vehicle := v_vehicle_id;
      v_first_plate   := v_plate;
    END IF;
  END LOOP;

  IF v_created = 0 THEN
    RAISE EXCEPTION 'no_new_plates'; -- every given plate was already registered to this client
  END IF;

  IF p_send_survey THEN
    v_suppressed := public.fn_claim_survey_slot(p_client_id);
    INSERT INTO public.satisfaction_surveys (
      prospect_id, client_id, vehicle_id, origin, dealership_id, client_name, client_phone,
      sold_plate, suppressed_reason, eligible_at
    ) VALUES (
      NULL, p_client_id, v_first_vehicle, 'repurchase', p_dealership_id, v_client.full_name,
      v_client.phone, v_first_plate, v_suppressed, now()
    )
    RETURNING id, token INTO v_survey_id, v_survey_token;
  END IF;

  RETURN QUERY SELECT v_created, v_survey_id, v_survey_token, v_suppressed;
END;
$$;

-- ============================================================================
-- 1.7c — v_duplicate_clients: read-only maintainer worklist (prospect-to-client spec's
-- "Duplicate visibility without a merge action" requirement). No GRANT to authenticated —
-- read via the Management API / service role only. Least privilege, zero cost.
-- ============================================================================
CREATE OR REPLACE VIEW public.v_duplicate_clients AS
WITH k AS (
  SELECT 'IdContactKommo'::text AS dup_key, nullif(trim(c."IdContactKommo"),'') AS dup_value,
         c.id, c.full_name, c.phone, c.cedula, c.kommo_conversation_lead_id, c.created_at
    FROM public.clients c WHERE nullif(trim(c."IdContactKommo"),'') IS NOT NULL
  UNION ALL
  SELECT 'phone', right(regexp_replace(coalesce(c.phone,''),'\D','','g'),10),
         c.id, c.full_name, c.phone, c.cedula, c.kommo_conversation_lead_id, c.created_at
    FROM public.clients c WHERE length(regexp_replace(coalesce(c.phone,''),'\D','','g')) >= 10
  UNION ALL
  SELECT 'kommo_conversation_lead_id', c.kommo_conversation_lead_id::text,
         c.id, c.full_name, c.phone, c.cedula, c.kommo_conversation_lead_id, c.created_at
    FROM public.clients c WHERE c.kommo_conversation_lead_id IS NOT NULL
)
SELECT * FROM (
  SELECT k.*, count(*) OVER (PARTITION BY k.dup_key, k.dup_value) AS dup_count FROM k
) x WHERE x.dup_count > 1
ORDER BY dup_key, dup_value, created_at;

ALTER VIEW public.v_duplicate_clients SET (security_invoker = on);
REVOKE ALL ON public.v_duplicate_clients FROM anon, authenticated;

-- ============================================================================
-- GRANTS — RPCs callable directly from the frontend. Internal helpers
-- (fn_resolve_or_create_client_for_prospect, fn_claim_survey_slot, link_client_on_won) are
-- deliberately NOT granted: they are reached only through the trigger pair or through the
-- two RPCs below, all SECURITY DEFINER, matching this codebase's existing least-privilege
-- pattern (compare: create_satisfaction_survey_on_won has never been granted either).
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.register_won_prospect(uuid, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_client_repurchase(uuid, jsonb, boolean, uuid) TO authenticated;

-- ============================================================================
-- ROLLBACK BLOCK (paired with this migration; task 1.8). Entirely commented out — copy the
-- statements below out of the comment and run them manually, top to bottom, only if this
-- slice must be reverted. Reverts the NON-ADDITIVE step (1.3) plus the two functions that
-- step forced to change (1.4's create_satisfaction_survey_on_won and backfill_satisfaction_
-- surveys — the latter is not in task 1.8's literal list but needs the same fix in reverse,
-- or it would raise 42P10 against the restored plain UNIQUE constraint; added here for
-- correctness/symmetry with the forward-migration bug this file exists to fix. Purely
-- additive pieces from 1.2/1.5/1.6/1.7 (new columns, view, the two RPCs) are intentionally
-- left in place — task 1.8 does not ask to remove them, and they are inert without the
-- schema shape this rollback restores).
-- ============================================================================
--
-- DO $$
-- DECLARE v_orphans int; v_responded int;
-- BEGIN
--   SELECT count(*) INTO v_orphans FROM public.satisfaction_surveys WHERE prospect_id IS NULL;
--   SELECT count(*) INTO v_responded
--     FROM public.satisfaction_surveys s
--     WHERE s.prospect_id IS NULL
--       AND (s.status = 'responded'
--            OR EXISTS (SELECT 1 FROM public.satisfaction_responses r WHERE r.survey_id = s.id));
--   IF v_responded > 0 THEN
--     RAISE EXCEPTION
--       'ROLLBACK ABORTED: % of % prospect_id IS NULL surveys carry customer responses. Escalate; do not delete.',
--       v_responded, v_orphans;
--   END IF;
--   DELETE FROM public.satisfaction_surveys WHERE prospect_id IS NULL;
-- END $$;
--
-- DROP INDEX IF EXISTS public.uq_satisfaction_surveys_prospect;
-- ALTER TABLE public.satisfaction_surveys ADD CONSTRAINT satisfaction_surveys_prospect_id_key UNIQUE (prospect_id);
-- ALTER TABLE public.satisfaction_surveys ALTER COLUMN prospect_id SET NOT NULL;
-- DROP TRIGGER IF EXISTS trg_link_client_on_won ON public.prospects;
-- DROP FUNCTION IF EXISTS public.link_client_on_won();
--
-- -- Restore create_satisfaction_survey_on_won() verbatim from
-- -- 20260720120000_satisfaction_surveys.sql:114-134:
-- CREATE OR REPLACE FUNCTION public.create_satisfaction_survey_on_won()
-- RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
-- BEGIN
--   INSERT INTO public.satisfaction_surveys (
--     prospect_id, kommo_lead_id, dealership_id, salesperson, client_name, client_phone,
--     sold_plate, eligible_at
--   ) VALUES (
--     NEW.id, NEW.kommo_lead_id, NEW.dealership_id, NEW.salesperson, NEW.name, NEW.phone,
--     NEW.sold_plate, coalesce(NEW.status_updated_at, now()) + interval '24 hours'
--   )
--   ON CONFLICT (prospect_id) DO NOTHING;
--   RETURN NEW;
-- END;
-- $$;
--
-- DROP TRIGGER IF EXISTS trg_create_satisfaction_survey_on_won ON public.prospects;
-- CREATE TRIGGER trg_create_satisfaction_survey_on_won
--   AFTER UPDATE OF status ON public.prospects
--   FOR EACH ROW
--   WHEN (NEW.status = 'ganado' AND OLD.status IS DISTINCT FROM NEW.status)
--   EXECUTE FUNCTION public.create_satisfaction_survey_on_won();
--
-- -- Restore backfill_satisfaction_surveys() verbatim from
-- -- 20260720120000_satisfaction_surveys.sql:224-243 (added for symmetry — see block header):
-- CREATE OR REPLACE FUNCTION public.backfill_satisfaction_surveys()
-- RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
-- DECLARE v_count int;
-- BEGIN
--   IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'No autorizado'; END IF;
--
--   INSERT INTO public.satisfaction_surveys (
--     prospect_id, kommo_lead_id, dealership_id, salesperson, client_name, client_phone,
--     sold_plate, eligible_at
--   )
--   SELECT p.id, p.kommo_lead_id, p.dealership_id, p.salesperson, p.name, p.phone,
--          p.sold_plate, coalesce(p.status_updated_at, now()) + interval '24 hours'
--   FROM public.prospects p
--   WHERE p.status = 'ganado'
--   ON CONFLICT (prospect_id) DO NOTHING;
--
--   GET DIAGNOSTICS v_count = ROW_COUNT;
--   RETURN v_count;
-- END;
-- $$;
