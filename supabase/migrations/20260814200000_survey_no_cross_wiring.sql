-- Que las dos encuestas no se pisen. Dos arreglos, una sola causa de fondo.
--
-- Causa: venta y postventa escriben el link en el MISMO campo del MISMO lead — el lead de
-- conversación del cliente (`clients.kommo_conversation_lead_id`), que es donde vive el chat
-- de WhatsApp. No en el lead de la reserva. Verificado: COLNETWORK tiene reserva 66034985
-- (etapa Completada, sin link) y conversación 64107829 (etapa ENCUESTA ENVIADA, con link).
-- Ambos en la pipeline 13151339 "Servicio".
--
-- 1) `service_ready` vuelve a significar lo que tiene que significar: postventa tiene SU
--    PROPIA etapa. La versión anterior lo daba por bueno con el par de ventas, que es
--    justamente lo que hizo que 30 clientes de taller recibieran el mensaje de compra.
--
-- 2) Un cliente, una encuesta por barrido. El loop dispara `net.http_post` sin esperar
--    respuesta, así que dos encuestas del mismo cliente en la misma vuelta corren en
--    paralelo contra el mismo lead: PATCH(link venta), PATCH(link servicio), etapa venta,
--    etapa servicio. En ese orden el bot de ventas lee el link de servicio y manda el
--    equivocado. `DISTINCT ON (client_id)` lo vuelve imposible: la segunda encuesta espera
--    al barrido siguiente, 15 minutos después, con el campo ya libre.

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
    -- Postventa está lista sólo con etapa y campo PROPIOS. Compartir la etapa de ventas
    -- despierta al bot de ventas: el disparador del bot es la etapa, no el campo.
    coalesce((config->'survey_delivery_enabled')::text = 'true', false)
      AND nullif(btrim(coalesce(config->>'survey_stage_id_service', '')), '') IS NOT NULL
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
    -- Una sola encuesta por cliente por barrido: las dos escriben el link en el mismo campo
    -- del mismo lead de conversación, y net.http_post no espera respuesta.
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
             s.origin IN ('won', 'repurchase')
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
