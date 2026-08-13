-- Dos correcciones sobre la encuesta postventa, ambas por observaciones de GAC (2026-08-13).
--
-- (1) "un cliente puede tener la encuesta de vehículo, la de experiencia, y posterior a eso
--     también puede tener encuesta por servicios".
--     Hoy NO puede: el freno de 24 h cuenta cualquier encuesta del cliente sin mirar el
--     origen, así que la de servicio nace suprimida detrás de la de venta y nunca sale.
--
-- (2) "en Kommo solo reemplazamos el campo de link encuesta".
--     Confirmado contra la API de Kommo: la etapa 109744268 "ENCUESTA ENVIADA" ya pertenece
--     al pipeline de POSTVENTA (13151339), no al de Ventas (13148719). No existen objetos
--     de Kommo separados que esperar, así que el bloqueo que puse ayer dejaría la postventa
--     en cola para siempre.

-- ---------------------------------------------------------------------------
-- 1) El freno de 24 h pasa a ser por TIPO de encuesta
-- ---------------------------------------------------------------------------
-- El propósito original se conserva: un cliente flota con seis unidades atendidas la misma
-- mañana recibe un mensaje, no seis. Lo que se corrige es que ese freno cruzaba familias
-- distintas — comprar un carro te silenciaba la encuesta del servicio del día siguiente.
CREATE OR REPLACE FUNCTION public.fn_claim_survey_slot(p_client_id uuid, p_kind text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_lock uuid; v_recent int;
BEGIN
  IF p_client_id IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_lock FROM public.clients WHERE id = p_client_id FOR UPDATE;  -- serializa
  IF v_lock IS NULL THEN RETURN NULL; END IF;

  SELECT count(*) INTO v_recent
    FROM public.satisfaction_surveys s
   WHERE s.client_id = p_client_id
     AND s.suppressed_reason IS NULL
     AND s.created_at > now() - interval '24 hours'
     -- Sólo cuentan las encuestas de la MISMA familia. 'won' y 'repurchase' preguntan por
     -- la compra; 'service' pregunta por el taller. Son cosas distintas y pueden convivir.
     AND (
       (p_kind = 'service' AND s.origin = 'service')
       OR (p_kind <> 'service' AND s.origin IN ('won', 'repurchase'))
     );

  IF v_recent > 0 THEN RETURN 'rate_limited_24h'; END IF;
  RETURN NULL;
END;
$function$;

-- La versión de un argumento queda como el camino de VENTA. Sus dos llamadores
-- (create_satisfaction_survey_on_won y register_client_repurchase) son exactamente eso, así
-- que delegar con 'sale' preserva su comportamiento sin tocarlos.
CREATE OR REPLACE FUNCTION public.fn_claim_survey_slot(p_client_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.fn_claim_survey_slot(p_client_id, 'sale');
$function$;

-- El trigger de servicio reclama su propio cupo.
CREATE OR REPLACE FUNCTION public.create_service_survey_on_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_client_name  text;
  v_client_phone text;
  v_plate        text;
  v_suppressed   text;
  v_sends        boolean;
BEGIN
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

  -- 'service': el cupo de postventa es independiente del de venta.
  v_suppressed := public.fn_claim_survey_slot(NEW.client_id, 'service');

  INSERT INTO public.satisfaction_surveys (
    reservation_id, client_id, vehicle_id, origin, dealership_id,
    client_name, client_phone, sold_plate, suppressed_reason, eligible_at
  ) VALUES (
    NEW.id, NEW.client_id, NEW.vehicle_id, 'service', NEW.dealership_id,
    v_client_name, v_client_phone, v_plate, v_suppressed,
    now()
  )
  ON CONFLICT (reservation_id) WHERE reservation_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2) La postventa deja de esperar objetos de Kommo que no existen
-- ---------------------------------------------------------------------------
-- Lo que necesita para salir es lo mismo que la de venta: la etapa de encuesta y el campo
-- del enlace, que ya están configurados y viven en el pipeline de Post Venta. Las claves
-- `*_service` quedan como override opcional por si algún día GAC crea objetos dedicados;
-- kommo-api ya las prefiere cuando están (index.ts, hasServiceRouting).
CREATE OR REPLACE FUNCTION public.fn_dispatch_eligible_surveys()
 RETURNS TABLE(dispatched integer, skipped_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_enabled  boolean;
  v_routable boolean;
  v_key      text;
  v_url      text;
  v_row      record;
  v_count    int := 0;
BEGIN
  SELECT (config->'survey_delivery_enabled')::text = 'true',
         -- Sin etapa o sin campo del enlace no hay a dónde escribir el link, para NINGÚN
         -- origen. Es la condición real de entrega, y aplica igual a venta y a postventa.
         nullif(btrim(coalesce(config->>'survey_stage_id', '')), '') IS NOT NULL
           AND nullif(btrim(coalesce(config->>'survey_link_field_id', '')), '') IS NOT NULL
    INTO v_enabled, v_routable
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
       AND s.origin IN ('won', 'repurchase', 'service')
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

-- `service_ready` pasa a reflejar la condición real de entrega, no la existencia de objetos
-- dedicados que GAC confirmó que no va a crear.
CREATE OR REPLACE FUNCTION public.get_survey_delivery_config()
RETURNS TABLE(
  delivery_enabled             boolean,
  survey_base_url              text,
  survey_stage_id              text,
  survey_link_field_id         text,
  survey_stage_id_service      text,
  survey_link_field_id_service text,
  service_ready                boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT
    coalesce((config->'survey_delivery_enabled')::text = 'true', false),
    config->>'survey_base_url',
    config->>'survey_stage_id',
    config->>'survey_link_field_id',
    config->>'survey_stage_id_service',
    config->>'survey_link_field_id_service',
    coalesce((config->'survey_delivery_enabled')::text = 'true', false)
      AND nullif(btrim(coalesce(config->>'survey_stage_id', '')), '') IS NOT NULL
      AND nullif(btrim(coalesce(config->>'survey_link_field_id', '')), '') IS NOT NULL
  FROM public.integration_configs
  WHERE integration_name = 'kommo' AND is_active
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_survey_delivery_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_survey_delivery_config() TO authenticated;
