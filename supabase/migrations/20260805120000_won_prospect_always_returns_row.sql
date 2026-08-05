-- BUG: "No se pudo confirmar la venta" sobre una venta que SI se registro.
--
-- Sintoma reportado: se marca el prospecto como ganado, se ingresa la placa, se tilda
-- "Vincular este vehiculo" y la UI responde "No se pudo confirmar la venta. Intentalo de
-- nuevo." Pero el vehiculo YA se transfirio al comprador, el prospecto YA quedo en ganado y
-- el cliente YA se resolvio. Todo se escribio; lo unico que fallo fue el valor de retorno.
--
-- CAUSA: la ultima sentencia de register_won_prospect era
--
--     RETURN QUERY SELECT v_client_id, s.id, ... FROM public.satisfaction_surveys s
--      WHERE s.prospect_id = p_prospect_id ORDER BY s.created_at DESC LIMIT 1;
--
-- Si el prospecto no tiene encuesta, ese SELECT no devuelve filas, RETURN QUERY no agrega
-- nada y la funcion termina con un conjunto VACIO. PostgREST entrega `[]`, el dialogo lee
-- `data[0]` -> undefined y cae al mensaje generico de fallo (WonProspectDialog.tsx:336-339).
--
-- POR QUE HAY PROSPECTOS GANADOS SIN ENCUESTA: el trigger que la crea es
-- trg_create_satisfaction_survey_on_won, AFTER UPDATE OF status ... WHEN (new.status =
-- 'ganado' AND old.status IS DISTINCT FROM new.status). Es solo UPDATE y solo con cambio
-- real de estado. Un prospecto importado ya en 'ganado', o al que se le captura la placa
-- cuando ya estaba en 'ganado', nunca dispara ese trigger. En produccion hoy son 188 de 211
-- prospectos ganados (7 de los 9 de agosto), asi que esto no es un caso de borde.
--
-- CONSECUENCIA REAL: el vendedor ve un error, reintenta, y cada reintento vuelve a mover el
-- vehiculo de dueño. Con dos prospectos reclamando la misma placa el auto rebota entre
-- clientes, siempre mostrando "error". La venta nunca se ve confirmada aunque siempre lo
-- este.
--
-- NO se crea la encuesta faltante de forma retroactiva, a proposito. `eligible_at` se calcula
-- como status_updated_at + 20h, que para estas ventas ya paso: el barrido las despacharia de
-- inmediato y una compra de julio recibiria hoy una encuesta de satisfaccion. Si GAC quiere
-- encuestar esas ventas, es una decision explicita con un backfill controlado, no un efecto
-- secundario de corregir una placa.
--
-- Regenerado desde la definicion VIVA (verificada identica a
-- 20260803170000_won_prospect_link_existing_plate.sql); el unico cambio es el RETURN QUERY
-- final.

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
  v_existing_id     uuid;
  v_existing_client uuid;
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

    -- Case 1: already this client's vehicle. Idempotent dedup, unchanged.
    IF EXISTS (
      SELECT 1 FROM public.vehicles
      WHERE vehicles.client_id = v_client_id AND upper(vehicles.plate) = v_plate
    ) THEN
      CONTINUE;
    END IF;

    -- Case 2: the plate exists, but under ANOTHER client.
    --
    -- `vehicles.plate` carries a global UNIQUE index, so the INSERT below used to hit
    -- 23505 and abort the ENTIRE win with a raw Postgres error — the salesperson lost the
    -- sale registration over a plate typo or a car that had previously come in for
    -- service. Two such plates already exist in production.
    --
    -- Now it is an explicit decision. `link_existing` is set by the UI only after showing
    -- the user who currently owns that vehicle, so ownership never moves silently.
    -- Columns MUST be qualified: this function RETURNS TABLE(client_id uuid, ...), so the
    -- bare name resolves to the OUT parameter and Postgres raises 42702 (ambiguous). Same
    -- trap that broke this function once before.
    SELECT vehicles.id, vehicles.client_id INTO v_existing_id, v_existing_client
      FROM public.vehicles WHERE upper(vehicles.plate) = v_plate LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      IF coalesce((v_entry->>'link_existing')::boolean, false) THEN
        -- Transfer to the buyer and refresh the commercial data with what was just sold.
        UPDATE public.vehicles
           SET client_id       = v_client_id,
               model_id        = v_model_id,
               year            = v_year,
               warranty_active = NOT coalesce((SELECT vm.is_manual FROM public.vehicle_models vm WHERE vm.id = v_model_id), false),
               is_manual       = coalesce((SELECT vm.is_manual FROM public.vehicle_models vm WHERE vm.id = v_model_id), false),
               driver_id       = NULL,  -- the previous owner's driver does not follow the car
               updated_at      = now()
         WHERE id = v_existing_id;
        v_vehicle_id := v_existing_id;
        v_created := v_created + 1;
        IF v_first_vehicle IS NULL THEN v_first_vehicle := v_vehicle_id; END IF;
        CONTINUE;
      END IF;
      -- Not authorized to link: fail with a message the UI can translate, never a raw
      -- constraint violation.
      RAISE EXCEPTION 'plate_belongs_to_another_client: %', v_plate;
    END IF;

    -- Case 3: brand-new plate.
    INSERT INTO public.vehicles (client_id, model_id, year, plate, mileage, purchase_date, warranty_active, is_active, is_manual)
    VALUES (v_client_id, v_model_id, v_year, v_plate, 0, current_date,
            NOT coalesce((SELECT vm.is_manual FROM public.vehicle_models vm WHERE vm.id = v_model_id), false),
            true,
            coalesce((SELECT vm.is_manual FROM public.vehicle_models vm WHERE vm.id = v_model_id), false))
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

  -- Exactly UNA fila, SIEMPRE. Antes esto era un SELECT directo sobre satisfaction_surveys
  -- con LIMIT 1: sin encuesta no devolvia filas, la funcion terminaba vacia y la UI daba la
  -- venta por fallida aunque todo lo de arriba ya estuviera escrito. El LEFT JOIN LATERAL
  -- contra un ancla de una fila garantiza la fila de salida y deja los campos de encuesta en
  -- NULL cuando no hay ninguna. Los consumidores ya toleran survey_id NULL: el dialogo solo
  -- intenta el envio cuando row.survey_id existe (WonProspectDialog.tsx:345).
  --
  -- Los nombres van calificados con surv.: la funcion es RETURNS TABLE(client_id, ...,
  -- suppressed_reason, ...), asi que un nombre desnudo resuelve al parametro OUT y Postgres
  -- levanta 42702. Es la misma trampa que ya rompio esta funcion antes.
  RETURN QUERY
  SELECT v_client_id, surv.id, surv.token, surv.suppressed_reason, v_created
  FROM (SELECT 1) AS anchor
  LEFT JOIN LATERAL (
    SELECT s.id, s.token, s.suppressed_reason
      FROM public.satisfaction_surveys s
     WHERE s.prospect_id = p_prospect_id
     ORDER BY s.created_at DESC
     LIMIT 1
  ) AS surv ON true;
END;
$function$;
