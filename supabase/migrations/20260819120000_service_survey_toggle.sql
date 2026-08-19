-- Interruptor propio para la encuesta de POSTSERVICIO, apagable desde el frontend.
--
-- PEDIDO (Nakary, 2026-08-19): desactivar la encuesta de postservicio porque todavía no se
-- probó con público y no se sabe si funciona bien de punta a punta. La de POSTENTREGA DE
-- VEHÍCULO (origin 'won' / 'repurchase') queda EXACTAMENTE IGUAL, andando.
--
-- POR QUÉ HACE FALTA UNA LLAVE NUEVA Y NO ALCANZA CON LO QUE HAY:
--
--   * `survey_delivery_enabled` es global: apagarlo mata también la encuesta de compra.
--   * Vaciar `survey_link_field_id_service` corta el envío, pero (a) se pierde el id del
--     campo de Kommo y hay que volver a tipearlo para reactivar, (b) el tablero queda
--     mintiendo "En espera de configuración" cuando en realidad está apagada a propósito, y
--     sobre todo (c) el trigger SIGUE CREANDO las encuestas: se acumula una cola que el día
--     que se reactive sale toda junta, encuestas de servicios de hace semanas incluidas.
--   * `service_types.sends_postventa_survey` es por tipo de servicio, uno por uno. No es un
--     interruptor general y hay que acordarse de volver a prender cada uno.
--
-- Por eso: llave propia `service_survey_enabled`, con su switch en Configuración →
-- Automatizaciones. Apagarla y prenderla no vuelve a necesitar SQL nunca más.
--
-- DÓNDE SE RESPETA — en los tres puntos, no en uno. La lección del 2026-08-04 está escrita
-- en `20260804140000_pause_postventa_survey.sql`: "la pausa no puede depender de un solo
-- punto". Aquella vez el flag estaba apagado, alguien lo prendió para las encuestas de
-- venta, y la postventa se coló por el barrido hacia el bot equivocado.
--
--   1. `create_service_survey_on_completed` — corta ANTES del INSERT. No se crea la fila.
--   2. `fn_dispatch_eligible_surveys`       — el barrido excluye origin 'service'.
--   3. `kommo-api` (edge function)          — rechaza la entrega. Cubre el reenvío manual.
--
-- El corte del punto 1 es a propósito antes del INSERT y no después: apagada, la encuesta no
-- existe. Nada de cola escondida, y nada de "Encuesta de postventa enviada — sin responder"
-- en el historial del vehículo sobre una encuesta que nunca se mandó.

-- ---------------------------------------------------------------------------------------
-- 1) La llave. Arranca apagada por el pedido de Nakary.
--
-- Sólo se escribe si no existe: así reaplicar esta migración no pisa lo que el operador haya
-- decidido después desde el panel.
-- ---------------------------------------------------------------------------------------
UPDATE public.integration_configs
   SET config = jsonb_set(config, '{service_survey_enabled}', 'false'::jsonb, true),
       updated_at = now()
 WHERE integration_name = 'kommo'
   AND NOT (config ? 'service_survey_enabled');

-- ---------------------------------------------------------------------------------------
-- 2) Lectura de configuración.
--
-- `service_ready` pasa a incluir el interruptor. Es la bandera que ya consumen el tablero de
-- Automatizaciones y el botón "Reenviar encuesta" de la ficha del cliente, así que con esto
-- los dos se enteran solos de que la encuesta está apagada.
--
-- `service_enabled` se agrega aparte para poder distinguir los dos motivos por los que no
-- está lista: apagada a propósito, o sin el campo de Kommo cargado. Sin esa distinción el
-- cartel del reenvío diría "falta configurar" sobre algo que está configurado y apagado.
--
-- DROP y no CREATE OR REPLACE: cambia el RETURNS TABLE, y Postgres no reemplaza una función
-- cuyo tipo de retorno cambió.
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
   service_ready boolean
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
    -- Ausente = prendida. Una base sin la llave se comporta como antes de esta migración.
    coalesce((config->'service_survey_enabled')::text <> 'false', true),
    -- Lista = prendida Y con entrega global Y con su campo propio cargado.
    coalesce((config->'service_survey_enabled')::text <> 'false', true)
      AND coalesce((config->'survey_delivery_enabled')::text = 'true', false)
      AND nullif(btrim(coalesce(config->>'survey_link_field_id_service', '')), '') IS NOT NULL
  FROM public.integration_configs
  WHERE integration_name = 'kommo' AND is_active
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_survey_delivery_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_survey_delivery_config() TO authenticated;

-- ---------------------------------------------------------------------------------------
-- 3) Escritura del interruptor.
--
-- Función aparte y no un tercer parámetro de `set_postventa_survey_config`: agregarle un
-- argumento crearía una SOBRECARGA — la vieja de dos parámetros seguiría existiendo y
-- supabase-js, que manda los parámetros por nombre, seguiría resolviendo a la vieja. Una
-- función chica con una sola responsabilidad no tiene ese problema.
--
-- Mismo permiso que la configuración de ruteo: `is_admin_user()`. Decide si sale un mensaje
-- a todos los clientes de taller; no es una preferencia de pantalla.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_service_survey_enabled(p_enabled boolean)
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
     SET config = jsonb_set(config, '{service_survey_enabled}', to_jsonb(p_enabled), true),
         updated_at = now()
   WHERE integration_name = 'kommo' AND is_active;

  INSERT INTO public.integration_logs (integration_name, event_type, status, details)
  VALUES ('kommo', 'service_survey_toggle', 'success',
          jsonb_build_object('enabled', p_enabled, 'by', auth.uid()));

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_service_survey_enabled(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_service_survey_enabled(boolean) TO authenticated;

-- ---------------------------------------------------------------------------------------
-- 4) Punto de corte 1: el trigger que crea la encuesta al completar la cita.
--
-- Cuerpo idéntico al de `20260814220000_postventa_survey_field_trigger.sql` salvo el bloque
-- nuevo del interruptor, que va arriba de todo para no hacer trabajo que igual se descarta.
--
-- El trigger NO se deshabilita con ALTER TABLE ... DISABLE TRIGGER como en la pausa del
-- 2026-08-04. Aquella pausa sólo se podía deshacer por SQL, que es justo lo que esta
-- migración viene a sacar del medio.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_service_survey_on_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_client_name    text;
  v_client_phone   text;
  v_plate          text;
  v_suppressed     text;
  v_sends          boolean;
  v_survey_id      uuid;
  v_service_ready  boolean;
  v_enabled        boolean;
  v_survey_on      boolean;
  v_key            text;
BEGIN
  -- Interruptor general de la encuesta de postservicio. Apagada, no se crea la fila: no hay
  -- cola escondida esperando para salir toda junta el día que se reactive, ni un renglón
  -- "enviada — sin responder" en el historial del vehículo sobre algo que nunca se envió.
  SELECT coalesce((config->'service_survey_enabled')::text <> 'false', true)
    INTO v_survey_on
    FROM public.integration_configs
   WHERE integration_name = 'kommo' AND is_active
   LIMIT 1;

  IF NOT coalesce(v_survey_on, true) THEN
    RETURN NEW;
  END IF;

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

-- ---------------------------------------------------------------------------------------
-- 5) Punto de corte 2: el barrido de pg_cron.
--
-- Cuerpo idéntico al de `20260814220000_postventa_survey_field_trigger.sql` salvo que
-- `v_service_ready` ahora también exige el interruptor. Con eso, cualquier encuesta de
-- servicio que ya exista en la base queda quieta mientras esté apagado, venga de donde
-- venga: del trigger de antes de esta migración, de un insert a mano o de un replay.
--
-- Ventas no se toca: `v_routable` sigue mirando sólo su etapa y su campo.
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
         -- Ventas necesita su etapa y su campo: el bot arranca al entrar a la etapa.
         nullif(btrim(coalesce(config->>'survey_stage_id', '')), '') IS NOT NULL
           AND nullif(btrim(coalesce(config->>'survey_link_field_id', '')), '') IS NOT NULL,
         -- Postservicio necesita su campo Y el interruptor prendido. El bot arranca al
         -- escribirse el campo, así que apagar el interruptor tiene que cortar acá también:
         -- sin esto, una encuesta de servicio ya creada saldría igual en el próximo barrido.
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

COMMENT ON FUNCTION public.set_service_survey_enabled(boolean) IS
  'Prende/apaga la encuesta de postservicio (origin = service). No toca la de postentrega de vehiculo. Se maneja desde Configuracion -> Automatizaciones.';
