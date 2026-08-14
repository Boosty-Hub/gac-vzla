-- Corta el envío de encuestas de POSTVENTA hasta que tengan etapa propia en Kommo.
--
-- Qué pasó: venta y postventa comparten hoy el mismo campo (`Link Encuesta`, 3456839) y la
-- misma etapa (`ENCUESTA ENVIADA`, 109744268, pipeline Servicio 13151339). La entrega no
-- manda el mensaje: sólo escribe el link y rebota la etapa. Quien manda el mensaje es el
-- SalesBot que está enganchado a esa etapa — y ese bot es el de VENTAS. Resultado: cada
-- cliente de taller recibió el texto de compra de vehículo.
--
-- Yo mismo quité este gate en 20260813140000 leyendo "en kommo solo remplazamos el campo de
-- link encuesta" como que compartir el par era aceptable. No lo era: el campo se comparte
-- sin problema, la ETAPA no, porque la etapa es el disparador del bot.
--
-- El gate vuelve, ahora sobre la etapa dedicada: postventa no se despacha mientras
-- `survey_stage_id_service` y `survey_link_field_id_service` estén vacíos. Ventas sigue
-- intacto. Cuando se cree la etapa nueva y se cargue desde Configuración → Encuesta
-- postventa, el envío se reanuda solo, sin tocar código.
--
-- Las encuestas se siguen CREANDO al completar el servicio: no se pierde ningún registro,
-- sólo se queda en cola.

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
         -- Sin etapa o sin campo del enlace no hay a dónde escribir el link, para NINGÚN
         -- origen. Es la condición real de entrega, y aplica igual a venta y a postventa.
         nullif(btrim(coalesce(config->>'survey_stage_id', '')), '') IS NOT NULL
           AND nullif(btrim(coalesce(config->>'survey_link_field_id', '')), '') IS NOT NULL,
         -- Postventa necesita ADEMÁS su propia etapa. Compartir la de ventas despierta al
         -- bot de ventas y el cliente de taller recibe el mensaje de compra.
         nullif(btrim(coalesce(config->>'survey_stage_id_service', '')), '') IS NOT NULL
           AND nullif(btrim(coalesce(config->>'survey_link_field_id_service', '')), '') IS NOT NULL
    INTO v_enabled, v_routable, v_service_ready
    FROM public.integration_configs
   WHERE integration_name = 'kommo' AND is_active
   LIMIT 1;

  IF NOT coalesce(v_enabled, false) THEN
    RETURN QUERY SELECT 0, 'delivery_disabled'::text;
    RETURN;
  END IF;

  IF NOT coalesce(v_routable, false) THEN
    RETURN QUERY SELECT 0, 'survey_routing_not_configured'::text;
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
    SELECT s.id, s.origin
      FROM public.satisfaction_surveys s
     WHERE s.status = 'pending'
       AND s.delivered_at IS NULL
       AND s.suppressed_reason IS NULL
       AND s.client_id IS NOT NULL
       AND s.eligible_at <= now()
       AND s.dispatch_attempts < 5
       AND (s.last_dispatch_at IS NULL OR s.last_dispatch_at < now() - interval '6 hours')
       AND (
         s.origin IN ('won', 'repurchase')
         OR (s.origin = 'service' AND coalesce(v_service_ready, false))
       )
     ORDER BY s.eligible_at
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
                   -- El origen real, no el literal 'won' que mandaba toda la postventa por
                   -- el camino de ventas.
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
