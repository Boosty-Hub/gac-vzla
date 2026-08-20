-- Interruptor propio para la encuesta de ENTREGA DE VEHICULO, apagable desde el panel.
--
-- PEDIDO (2026-08-20): la misma llave que se le puso ayer a la de postventa / servicio, pero
-- para la de la venta, y apagada tambien. Con esto las DOS encuestas quedan apagadas y las
-- dos se prenden desde Configuracion -> Automatizaciones, sin tocar SQL.
--
-- POR QUE NO SE USA `survey_delivery_enabled`, QUE YA EXISTE: ese es el interruptor MAESTRO,
-- global. Apagarlo cortaria las dos de una sola vez y dejaria la llave de servicio sin
-- efecto, asi que prender una sola despues seria imposible sin acordarse de prender tambien
-- el maestro. La llave nueva es simetrica a `service_survey_enabled`: cada encuesta manda
-- sobre si misma, y el maestro sigue estando por encima de las dos.
--
-- DONDE SE RESPETA — cuatro puntos, no uno. La leccion del 2026-08-04 sigue vigente: una
-- pausa que depende de un solo punto se filtra por el punto que falta.
--   1. `create_satisfaction_survey_on_won`  — corta ANTES del INSERT (prospecto a ganado).
--   2. `register_client_repurchase`         — corta el INSERT de la recompra.
--   3. `fn_dispatch_eligible_surveys`       — el barrido excluye origin won/repurchase.
--   4. `kommo-api` (edge function)          — rechaza la entrega. Cubre el reenvio manual.
--
-- Igual que con servicio, apagada la encuesta NO SE CREA. No queda cola escondida esperando
-- para salir toda junta el dia que se reactive.
--
-- CONTRATO QUE NO SE ROMPE — verificado leyendo el codigo antes de tocar, no asumido:
--   * `register_won_prospect` devuelve SIEMPRE exactamente una fila, con los campos de
--     encuesta en NULL cuando no hay encuesta (LEFT JOIN LATERAL contra un ancla de una
--     fila, migracion 20260805120000). Sin encuesta la venta se confirma igual. Antes de
--     esa migracion esto habria dado "No se pudo confirmar la venta" sobre ventas que si se
--     registraban.
--   * `WonProspectDialog.tsx:359` solo intenta la entrega `if (!suppressed_reason &&
--     survey_id)`, y `RepurchaseDialog.tsx:249` `else if (row.survey_id)`. Con survey_id
--     NULL no se muestra ningun aviso de encuesta: se informa la venta y nada mas, que es
--     lo honesto.
--
-- `backfill_satisfaction_surveys` queda SIN candado a proposito: no se llama desde ninguna
-- pantalla, es una herramienta manual de administrador, y el barrido y la edge function
-- frenan igual la entrega de lo que llegue a crear.

-- ---------------------------------------------------------------------------------------
-- 1) La llave. Arranca apagada, como se pidio.
--    Solo se escribe si no existe: reaplicar la migracion no pisa lo que se decida despues
--    desde el panel.
-- ---------------------------------------------------------------------------------------
UPDATE public.integration_configs
   SET config = jsonb_set(config, '{sales_survey_enabled}', 'false'::jsonb, true),
       updated_at = now()
 WHERE integration_name = 'kommo'
   AND NOT (config ? 'sales_survey_enabled');

-- ---------------------------------------------------------------------------------------
-- 2) Lectura de configuracion. Se agregan `sales_enabled` y `sales_ready`, espejo de los de
--    servicio, para que el panel pueda decir POR QUE no esta saliendo: apagada a proposito,
--    o sin la configuracion de Kommo cargada.
--
--    DROP y no CREATE OR REPLACE: cambia el RETURNS TABLE.
-- ---------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_survey_delivery_config();

CREATE FUNCTION public.get_survey_delivery_config()
 RETURNS TABLE(
   delivery_enabled boolean,
   survey_base_url text,
   survey_stage_id text,
   survey_link_field_id text,
   survey_stage_id_service text,
   survey_link_field_id_service text,
   service_enabled boolean,
   service_ready boolean,
   sales_enabled boolean,
   sales_ready boolean
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    coalesce((config->'survey_delivery_enabled')::text = 'true', false),
    config->>'survey_base_url',
    config->>'survey_stage_id',
    config->>'survey_link_field_id',
    config->>'survey_stage_id_service',
    config->>'survey_link_field_id_service',
    -- Ausente = prendida, para no cambiarle el significado a una config vieja.
    coalesce((config->'service_survey_enabled')::text <> 'false', true),
    coalesce((config->'service_survey_enabled')::text <> 'false', true)
      AND coalesce((config->'survey_delivery_enabled')::text = 'true', false)
      AND nullif(btrim(coalesce(config->>'survey_link_field_id_service', '')), '') IS NOT NULL,
    coalesce((config->'sales_survey_enabled')::text <> 'false', true),
    -- Venta necesita su etapa Y su campo: el bot arranca al ENTRAR a la etapa.
    coalesce((config->'sales_survey_enabled')::text <> 'false', true)
      AND coalesce((config->'survey_delivery_enabled')::text = 'true', false)
      AND nullif(btrim(coalesce(config->>'survey_stage_id', '')), '') IS NOT NULL
      AND nullif(btrim(coalesce(config->>'survey_link_field_id', '')), '') IS NOT NULL
  FROM public.integration_configs
  WHERE integration_name = 'kommo' AND is_active
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_survey_delivery_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_survey_delivery_config() TO authenticated;

-- ---------------------------------------------------------------------------------------
-- 3) Escritura del interruptor. Espejo exacto de `set_service_survey_enabled`.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_sales_survey_enabled(p_enabled boolean)
 RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'enabled_requerido';
  END IF;

  UPDATE public.integration_configs
     SET config = jsonb_set(config, '{sales_survey_enabled}', to_jsonb(p_enabled), true),
         updated_at = now()
   WHERE integration_name = 'kommo' AND is_active;

  INSERT INTO public.integration_logs (integration_name, event_type, status, details)
  VALUES ('kommo', 'sales_survey_toggle', 'success',
          jsonb_build_object('enabled', p_enabled, 'by', auth.uid()));

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_sales_survey_enabled(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_sales_survey_enabled(boolean) TO authenticated;

COMMENT ON FUNCTION public.set_sales_survey_enabled(boolean) IS
  'Prende/apaga la encuesta de entrega de vehiculo (origin won y repurchase). No toca la de postventa / servicio. Se maneja desde Configuracion -> Automatizaciones.';

-- ---------------------------------------------------------------------------------------
-- 4) Punto de corte 1: el trigger que crea la encuesta al pasar el prospecto a ganado.
--    Cuerpo identico al vigente salvo el bloque del interruptor, arriba de todo para no
--    hacer trabajo que igual se descarta.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_satisfaction_survey_on_won()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_suppressed  text;
  v_delay_hours numeric;
  v_sales_on    boolean;
BEGIN
  -- Interruptor general de la encuesta de entrega de vehiculo. Apagada no se crea la fila:
  -- la venta se registra igual y `register_won_prospect` devuelve survey_id NULL, caso que
  -- los dos dialogos ya toleran.
  SELECT coalesce((config->'sales_survey_enabled')::text <> 'false', true)
    INTO v_sales_on
    FROM public.integration_configs
   WHERE integration_name = 'kommo' AND is_active
   LIMIT 1;

  IF NOT coalesce(v_sales_on, true) THEN
    RETURN NEW;
  END IF;

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

-- ---------------------------------------------------------------------------------------
-- 5) Punto de corte 2: la recompra.
--    Reproducida desde su definicion viva en produccion, con DOS cambios y nada mas: la
--    variable `v_sales_on` y el `AND` en el IF que ya decidia si crear la encuesta.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_client_repurchase(p_client_id uuid, p_vehicles jsonb DEFAULT '[]'::jsonb, p_send_survey boolean DEFAULT true, p_dealership_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(vehicles_created integer, survey_id uuid, survey_token text, suppressed_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_sales_on      boolean;
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

  -- Interruptor general de la encuesta de entrega de vehiculo. El checkbox del dialogo
  -- sigue mandando p_send_survey, pero apagada no se crea la encuesta: sin cola escondida.
  -- La funcion devuelve survey_id NULL, que es el mismo caso que ya existia cuando el
  -- usuario destildaba el checkbox, y RepurchaseDialog ya lo tolera.
  SELECT coalesce((config->'sales_survey_enabled')::text <> 'false', true)
    INTO v_sales_on
    FROM public.integration_configs
   WHERE integration_name = 'kommo' AND is_active
   LIMIT 1;

  IF p_send_survey AND coalesce(v_sales_on, true) THEN
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
$function$;

-- ---------------------------------------------------------------------------------------
-- 6) Punto de corte 3: el barrido de pg_cron.
--    `v_routable` (venta) ahora tambien exige el interruptor, igual que `v_service_ready`.
--    Con eso cualquier encuesta de venta que ya exista queda quieta mientras este apagada.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_dispatch_eligible_surveys()
 RETURNS TABLE(dispatched integer, skipped_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_enabled       boolean;
  v_routable      boolean;
  v_service_ready boolean;
  v_key           text;
  v_url           text;
  v_row           record;
  v_count         int := 0;
BEGIN
  SELECT (config->'survey_delivery_enabled')::text = 'true',
         -- Venta necesita su etapa, su campo Y el interruptor prendido.
         nullif(btrim(coalesce(config->>'survey_stage_id', '')), '') IS NOT NULL
           AND nullif(btrim(coalesce(config->>'survey_link_field_id', '')), '') IS NOT NULL
           AND coalesce((config->'sales_survey_enabled')::text <> 'false', true),
         -- Postventa / servicio necesita su campo Y su interruptor.
         nullif(btrim(coalesce(config->>'survey_link_field_id_service', '')), '') IS NOT NULL
           AND coalesce((config->'service_survey_enabled')::text <> 'false', true)
    INTO v_enabled, v_routable, v_service_ready
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

  IF NOT coalesce(v_routable, false) AND NOT coalesce(v_service_ready, false) THEN
    RETURN QUERY SELECT 0, 'survey_routing_not_configured'::text;
    RETURN;
  END IF;

  v_url := 'https://wsbuqiznddvxcwvpnbxm.supabase.co/functions/v1/kommo-api';

  FOR v_row IN
    -- Una sola encuesta por cliente por barrido. Con campos y leads separados ya no pueden
    -- pisarse, pero el orden de los mensajes al cliente sigue importando: dos encuestas en el
    -- mismo minuto se leen como spam.
    SELECT q.id, q.origin
      FROM (
        SELECT DISTINCT ON (s.client_id) s.id, s.origin, s.eligible_at
          FROM public.satisfaction_surveys s
         WHERE s.status = 'pending'
           AND s.delivered_at IS NULL
           AND s.suppressed_reason IS NULL
           AND s.client_id IS NOT NULL
           AND s.eligible_at <= now()
           AND s.dispatch_attempts < 5
           AND (s.last_dispatch_at IS NULL OR s.last_dispatch_at < now() - interval '6 hours')
           AND (
             (s.origin IN ('won', 'repurchase') AND coalesce(v_routable, false))
             OR (s.origin = 'service' AND coalesce(v_service_ready, false))
           )
         ORDER BY s.client_id, s.eligible_at
      ) q
     ORDER BY q.eligible_at
     LIMIT 50
  LOOP
    UPDATE public.satisfaction_surveys
       SET dispatch_attempts = dispatch_attempts + 1,
           last_dispatch_at  = now()
     WHERE id = v_row.id;

    PERFORM net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key),
      body    := jsonb_build_object(
                   'action',    'deliver_satisfaction_survey',
                   'survey_id', v_row.id,
                   'reason',    v_row.origin
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
