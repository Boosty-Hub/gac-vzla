-- A vehicle registered through `register_client_repurchase` with a HAND-TYPED model was
-- getting `warranty_active = true` and no `is_manual` flag, because the RPC hardcoded both.
--
-- That silently contradicted what the UI promises at the moment the user types it
-- ("se registrara sin garantia") and, worse, let a third-party unit into the brand
-- inventory listing, which R4 explicitly says must not happen.
--
-- Both values are now derived from `vehicle_models.is_manual`. Catalog models are
-- unaffected: they keep warranty_active = true and is_manual = false.
--
-- Regenerated from the LIVE definition; the only changes are the new v_model_is_manual
-- variable and the vehicle INSERT.

CREATE OR REPLACE FUNCTION public.register_client_repurchase(p_client_id uuid, p_vehicles jsonb DEFAULT '[]'::jsonb, p_send_survey boolean DEFAULT true, p_dealership_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(vehicles_created integer, survey_id uuid, survey_token text, suppressed_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_client        record;
  v_entry         jsonb;
  v_plate         text;
  v_model_id      uuid;
  v_year          int;
  v_model_is_manual boolean;
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
    -- A hand-typed model (vehicle_models.is_manual) is a third-party unit we did not sell.
    -- It must NOT carry our warranty, and it must be flagged so it stays out of the brand
    -- inventory listing (R4). Reading the flag off the MODEL keeps the rule in one place:
    -- every caller only ever sends a model_id, so no caller can get this wrong.
    SELECT coalesce(vm.is_manual, false) INTO v_model_is_manual
      FROM public.vehicle_models vm WHERE vm.id = v_model_id;

    INSERT INTO public.vehicles (client_id, model_id, year, plate, mileage, purchase_date, warranty_active, is_active, is_manual)
    VALUES (p_client_id, v_model_id, v_year, v_plate, 0, current_date, NOT v_model_is_manual, true, v_model_is_manual)
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
$function$
