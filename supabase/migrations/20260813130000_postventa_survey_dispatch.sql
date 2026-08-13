-- Envío de la encuesta postventa: qué citas la generan y cuándo sale.
--
-- Requerimiento: "que funcione igual que la de ventas, aplicada a servicios, que NO se envíe
-- a los casos que sean 'Falla o desperfecto', por el mismo canal, desde el número de post
-- venta, cuando el asesor cambie el estatus de la cita a 'Completada'".
--
-- Lo que ya existía y se reutiliza: el disparo al marcar 'completada'
-- (trg_create_service_survey_on_completed), el token, la máquina de estados, el barrido de
-- despacho, el tope de una encuesta por cliente cada 24 h y la entrega por Kommo.
-- Lo que se agrega acá: la exclusión por tipo de servicio, el despacho de origin='service'
-- con su razón correcta, y un seguro para que la postventa no vuelva a salir por el bot de
-- ventas.

-- ---------------------------------------------------------------------------
-- 1) La exclusión, configurable — no una lista quemada en el trigger
-- ---------------------------------------------------------------------------
-- Si 'Falla o Desperfecto' quedara escrito dentro de la función, cambiar de opinión o sumar
-- un tipo nuevo exigiría una migración. Es una decisión de negocio y vive donde el
-- administrador ya gestiona los servicios: Configuración > Tipos de Servicio.
ALTER TABLE public.service_types
  ADD COLUMN IF NOT EXISTS sends_postventa_survey boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.service_types.sends_postventa_survey IS
  'Si al completar una cita de este tipo se genera la encuesta de satisfacción postventa.';

-- 'Falla o Desperfecto' — pedido explícitamente por GAC. Una falla es un reclamo; encuestar
-- sobre la experiencia mientras el problema se atiende mide la molestia, no el servicio.
UPDATE public.service_types
   SET sends_postventa_survey = false
 WHERE name = 'Falla o Desperfecto';

-- 'Solicitud de Repuestos' — NO estaba en el pedido, se excluye por lectura del cuestionario.
-- Son 11 solicitudes en las que el vehículo nunca entró al taller: preguntar si "fue
-- entregado lavado y aspirado" o por el "costo de la mano de obra" no tiene respuesta posible.
-- Si GAC prefiere encuestarlas, es un switch en la pantalla de Tipos de Servicio.
UPDATE public.service_types
   SET sends_postventa_survey = false
 WHERE name = 'Solicitud de Repuestos';

-- ---------------------------------------------------------------------------
-- 2) El trigger: mismo disparo, ahora respetando la exclusión
-- ---------------------------------------------------------------------------
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
  -- Exclusión por tipo de servicio. Un tipo que ya no exista en el catálogo (texto libre
  -- heredado) se trata como encuestable: es el comportamiento de la venta y evita que un
  -- renombre silencie la encuesta sin que nadie se entere.
  SELECT st.sends_postventa_survey INTO v_sends
    FROM public.service_types st
   WHERE st.name = NEW.service_type
   LIMIT 1;

  IF coalesce(v_sends, true) = false THEN
    RETURN NEW;
  END IF;

  -- Destinatario. Una cita de mostrador no tiene fila en clients, sólo los campos walkin_*.
  SELECT c.full_name, c.phone INTO v_client_name, v_client_phone
    FROM public.clients c WHERE c.id = NEW.client_id;

  v_client_name  := coalesce(v_client_name,  NEW.walkin_client_name);
  v_client_phone := coalesce(v_client_phone, NEW.walkin_client_phone);

  -- Sin teléfono no hay a dónde entregar. Crear la encuesta igual sólo infla la cola que el
  -- barrido reintenta cada 15 minutos.
  IF v_client_phone IS NULL OR btrim(v_client_phone) = '' THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(v.plate, NEW.walkin_plate) INTO v_plate
    FROM public.vehicles v WHERE v.id = NEW.vehicle_id;
  v_plate := coalesce(v_plate, NEW.walkin_plate);

  -- Mismo tope de 24 h por cliente que usa la encuesta de venta: un cliente flota con seis
  -- unidades atendidas la misma mañana recibe un mensaje, no seis.
  v_suppressed := public.fn_claim_survey_slot(NEW.client_id);

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

-- Se reactiva: quedó apagado el 2026-08-04 por el ruteo incorrecto, que el punto (3) resuelve.
ALTER TABLE public.reservations ENABLE TRIGGER trg_create_service_survey_on_completed;

-- ---------------------------------------------------------------------------
-- 3) El barrido de despacho
-- ---------------------------------------------------------------------------
-- Cambios frente a la versión en pausa:
--   a) vuelve a considerar origin='service';
--   b) `reason` deja de ser el literal 'won' y pasa a ser el origen real de cada fila. Ese
--      literal quemado es lo que mandó tres encuestas postventa al SalesBot de ventas y
--      terminó felicitando por un vehículo nuevo a dos clientes que sólo fueron a servicio;
--   c) una encuesta de servicio NO se despacha si falta la configuración de Kommo de
--      postventa. Sin ese seguro, kommo-api cae al par de venta a propósito y el incidente
--      se repite exactamente igual.
CREATE OR REPLACE FUNCTION public.fn_dispatch_eligible_surveys()
 RETURNS TABLE(dispatched integer, skipped_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_enabled        boolean;
  v_service_ready  boolean;
  v_key            text;
  v_url            text;
  v_row            record;
  v_count          int := 0;
BEGIN
  SELECT (config->'survey_delivery_enabled')::text = 'true',
         nullif(btrim(coalesce(config->>'survey_stage_id_service', '')), '') IS NOT NULL
           AND nullif(btrim(coalesce(config->>'survey_link_field_id_service', '')), '') IS NOT NULL
    INTO v_enabled, v_service_ready
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
         -- La postventa espera acá, sin gastar reintentos, hasta que exista su propio campo
         -- y su propia etapa en Kommo.
         OR (s.origin = 'service' AND coalesce(v_service_ready, false))
       )
     ORDER BY s.eligible_at
     LIMIT 50
  LOOP
    -- Se sella ANTES de llamar: pg_net es fire-and-forget y la respuesta nunca vuelve acá,
    -- así que una llamada que falle en silencio consume un intento en vez de reintentar
    -- para siempre.
    UPDATE public.satisfaction_surveys
       SET dispatch_attempts = dispatch_attempts + 1,
           last_dispatch_at  = now()
     WHERE id = v_row.id;

    -- El secreto va en `apikey`, NO en `Authorization: Bearer`. Las llaves `sb_secret_*` no
    -- son JWT y kommo-api corre con verify_jwt=true, así que el gateway rechaza un bearer no
    -- JWT con 401 antes de que la función llegue a ejecutarse.
    PERFORM net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'apikey',       v_key
                 ),
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
    VALUES ('kommo', 'survey_dispatch', 'success',
            jsonb_build_object('dispatched', v_count, 'service_ready', coalesce(v_service_ready, false)));
  END IF;

  RETURN QUERY SELECT v_count, NULL::text;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4) Lectura de la configuración de postventa para el panel de administración
-- ---------------------------------------------------------------------------
-- `integration_configs` guarda el access_token de Kommo en el mismo JSON, así que no puede
-- exponerse la fila entera al frontend. Esta función devuelve únicamente las claves de la
-- encuesta.
CREATE OR REPLACE FUNCTION public.get_survey_delivery_config()
RETURNS TABLE(
  delivery_enabled          boolean,
  survey_base_url           text,
  survey_stage_id           text,
  survey_link_field_id      text,
  survey_stage_id_service   text,
  survey_link_field_id_service text,
  service_ready             boolean
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
    nullif(btrim(coalesce(config->>'survey_stage_id_service', '')), '') IS NOT NULL
      AND nullif(btrim(coalesce(config->>'survey_link_field_id_service', '')), '') IS NOT NULL
  FROM public.integration_configs
  WHERE integration_name = 'kommo' AND is_active
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_survey_delivery_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_survey_delivery_config() TO authenticated;

-- Escritura de las dos claves de postventa. Sólo admin: definen a qué bot de Kommo se
-- entrega la encuesta, y equivocarlas es exactamente el incidente del 2026-08-03.
CREATE OR REPLACE FUNCTION public.set_postventa_survey_config(
  p_stage_id text,
  p_link_field_id text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_stage text; v_field text;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_stage := nullif(btrim(coalesce(p_stage_id, '')), '');
  v_field := nullif(btrim(coalesce(p_link_field_id, '')), '');

  -- Los dos son ids numéricos de Kommo. Un valor no numérico produciría un 400 silencioso
  -- dentro de una edge function que ya corre en segundo plano.
  IF v_stage IS NOT NULL AND v_stage !~ '^[0-9]+$' THEN RAISE EXCEPTION 'stage_id_invalido'; END IF;
  IF v_field IS NOT NULL AND v_field !~ '^[0-9]+$' THEN RAISE EXCEPTION 'field_id_invalido'; END IF;

  UPDATE public.integration_configs
     SET config = jsonb_set(
                    jsonb_set(config, '{survey_stage_id_service}',
                              CASE WHEN v_stage IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_stage) END, true),
                    '{survey_link_field_id_service}',
                    CASE WHEN v_field IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_field) END, true),
         updated_at = now()
   WHERE integration_name = 'kommo' AND is_active;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_postventa_survey_config(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_postventa_survey_config(text, text) TO authenticated;
