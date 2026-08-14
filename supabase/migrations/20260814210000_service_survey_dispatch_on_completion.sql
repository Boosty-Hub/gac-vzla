-- La encuesta de servicio sale al completar la cita, no en el barrido siguiente.
--
-- Hasta ahora el trigger sólo creaba la fila y el envío esperaba a pg_cron, que corre cada
-- 15 minutos. Para una encuesta de postventa esa demora no tiene ninguna razón de ser: el
-- disparador natural es que el asesor cierre el servicio.
--
-- `net.http_post` encola el request y lo manda DESPUÉS del commit, así que la fila ya existe
-- cuando kommo-api la va a buscar. Y `create_satisfaction_survey_on_won` sigue igual: la
-- encuesta de compra espera sus 20 horas a propósito.
--
-- El barrido no se elimina, queda como reintento: acá se marca `dispatch_attempts = 1` y
-- `last_dispatch_at = now()`, de modo que si esta llamada falla el cron la retoma recién a
-- las 6 horas, sin duplicar el envío.
--
-- El candado de ruteo se respeta igual que en el barrido: sin etapa propia de postventa no
-- se despacha nada, sólo se encola.

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
  -- Sin cliente no hay entrega posible. Es lo primero que se evalua para no hacer trabajo
  -- que igual se descarta.
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

  -- Ya existía una encuesta para esta reserva, o quedó suprimida por el límite de 24h.
  IF v_survey_id IS NULL OR v_suppressed IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT (config->'survey_delivery_enabled')::text = 'true',
         nullif(btrim(coalesce(config->>'survey_stage_id_service', '')), '') IS NOT NULL
           AND nullif(btrim(coalesce(config->>'survey_link_field_id_service', '')), '') IS NOT NULL
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
