-- Postventa se dispara por CAMPO, no por etapa. Se cae el requisito de etapa propia.
--
-- Decisión de GAC: el bot de postventa vive en la columna "Completada" del embudo Servicio y
-- arranca cuando se escribe el campo `Link Encuesta / Servicio` (3457883). No hay entrada de
-- etapa de por medio, así que el sistema escribe ese campo en el lead DE LA RESERVA — que ya
-- está parado en Completada — y no mueve nada.
--
-- Ventas queda exactamente igual: `Link Encuesta` (3456839) sobre el lead de conversación,
-- rebote hasta "ENCUESTA ENVIADA" (109744268), 20 horas después de la compra.
--
-- Con dos campos distintos las dos encuestas dejan de poder cruzarse por construcción: cada
-- bot escucha su propio campo sobre su propio lead. `survey_stage_id_service` queda sin uso.
--
-- La condición de entrega de postventa pasa a ser sólo el campo. kommo-api (v62) ya rechaza
-- una encuesta de servicio sin ese campo en vez de caer al camino de ventas.

CREATE OR REPLACE FUNCTION public.get_survey_delivery_config()
 RETURNS TABLE(delivery_enabled boolean, survey_base_url text, survey_stage_id text, survey_link_field_id text, survey_stage_id_service text, survey_link_field_id_service text, service_ready boolean)
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
    -- Postventa está lista con su campo propio. La etapa no interviene: el disparador del bot
    -- es la escritura del campo sobre el lead de la reserva, que ya está en "Completada".
    coalesce((config->'survey_delivery_enabled')::text = 'true', false)
      AND nullif(btrim(coalesce(config->>'survey_link_field_id_service', '')), '') IS NOT NULL
  FROM public.integration_configs
  WHERE integration_name = 'kommo' AND is_active
  LIMIT 1;
$function$;

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
         -- Ventas necesita su etapa y su campo: el bot arranca al entrar a la etapa.
         nullif(btrim(coalesce(config->>'survey_stage_id', '')), '') IS NOT NULL
           AND nullif(btrim(coalesce(config->>'survey_link_field_id', '')), '') IS NOT NULL,
         -- Postventa necesita sólo su campo: el bot arranca al escribirse el campo.
         nullif(btrim(coalesce(config->>'survey_link_field_id_service', '')), '') IS NOT NULL
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

-- El envío inmediato al completar la cita usa la misma condición: sólo el campo.
CREATE OR REPLACE FUNCTION public.create_service_survey_on_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_client_name   text;
  v_client_phone  text;
  v_plate         text;
  v_suppressed    text;
  v_sends         boolean;
  v_survey_id     uuid;
  v_service_ready boolean;
  v_enabled       boolean;
  v_key           text;
BEGIN
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT st.sends_postventa_survey INTO v_sends
    FROM public.service_types st
   WHERE st.name = NEW.service_type
   LIMIT 1;

  IF coalesce(v_sends, true) = false THEN
    RETURN NEW;
  END IF;

  SELECT c.full_name, c.phone INTO v_client_name, v_client_phone
    FROM public.clients c WHERE c.id = NEW.client_id;

  v_client_name  := coalesce(v_client_name,  NEW.walkin_client_name);
  v_client_phone := coalesce(v_client_phone, NEW.walkin_client_phone);

  IF v_client_phone IS NULL OR btrim(v_client_phone) = '' THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(v.plate, NEW.walkin_plate) INTO v_plate
    FROM public.vehicles v WHERE v.id = NEW.vehicle_id;
  v_plate := coalesce(v_plate, NEW.walkin_plate);

  v_suppressed := public.fn_claim_survey_slot(NEW.client_id, 'service');

  INSERT INTO public.satisfaction_surveys (
    reservation_id, client_id, vehicle_id, origin, dealership_id,
    client_name, client_phone, sold_plate, suppressed_reason, eligible_at
  ) VALUES (
    NEW.id, NEW.client_id, NEW.vehicle_id, 'service', NEW.dealership_id,
    v_client_name, v_client_phone, v_plate, v_suppressed,
    now()
  )
  ON CONFLICT (reservation_id) WHERE reservation_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_survey_id;

  IF v_survey_id IS NULL OR v_suppressed IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Sin lead de la reserva en Kommo no hay dónde escribir el campo, así que ni se intenta:
  -- queda en cola y el barrido la retoma cuando el lead exista.
  IF NEW.kommo_lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (config->'survey_delivery_enabled')::text = 'true',
         nullif(btrim(coalesce(config->>'survey_link_field_id_service', '')), '') IS NOT NULL
    INTO v_enabled, v_service_ready
    FROM public.integration_configs
   WHERE integration_name = 'kommo' AND is_active
   LIMIT 1;

  IF NOT (coalesce(v_enabled, false) AND coalesce(v_service_ready, false)) THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'kommo_api_service_key' LIMIT 1;

  IF v_key IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.satisfaction_surveys
     SET dispatch_attempts = 1, last_dispatch_at = now()
   WHERE id = v_survey_id;

  PERFORM net.http_post(
    url     := 'https://wsbuqiznddvxcwvpnbxm.supabase.co/functions/v1/kommo-api',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key),
    body    := jsonb_build_object(
                 'action',    'deliver_satisfaction_survey',
                 'survey_id', v_survey_id,
                 'reason',    'service'
               ),
    timeout_milliseconds := 20000
  );

  RETURN NEW;
END;
$function$;
