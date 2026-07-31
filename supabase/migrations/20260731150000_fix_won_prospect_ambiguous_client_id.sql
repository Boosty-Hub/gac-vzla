-- Fix: register_won_prospect fallaba SIEMPRE con 42702 "column reference client_id is ambiguous".
--
-- La funcion declara RETURNS TABLE (client_id uuid, ...), y eso crea una variable de salida
-- llamada client_id. En la clausula RETURNING de la linea 90 ese nombre colisionaba con la
-- columna prospects.client_id, asi que PL/pgSQL abortaba antes de escribir nada.
--
-- Efecto real: el camino por el que un vendedor marca una venta como ganada desde el panel
-- estaba roto de punta a punta. No se habia notado porque las unicas ventas ganadas hasta
-- hoy entraron por el webhook de Kommo, que hace un UPDATE crudo del status y nunca pasa
-- por este RPC.
--
-- Se califica la columna con el nombre de la tabla. Es el unico cambio: el resto es la
-- definicion viva, copiada tal cual.
CREATE OR REPLACE FUNCTION public.register_won_prospect(p_prospect_id uuid, p_vehicles jsonb DEFAULT '[]'::jsonb, p_is_fleet boolean DEFAULT false)
 RETURNS TABLE(client_id uuid, survey_id uuid, survey_token text, suppressed_reason text, vehicles_created integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  RETURNING prospects.client_id INTO v_client_id;

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
$function$
;
