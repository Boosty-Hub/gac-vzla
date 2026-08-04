-- Pausa la encuesta de POSTVENTA (origin = 'service'). Solo la de venta ("paso a ganado")
-- sigue funcionando. La postventa pertenece a un proyecto mayor que aun no arranca.
--
-- INCIDENTE QUE MOTIVA ESTO (2026-08-03/04): se enviaron 3 encuestas postventa y las 3
-- entraron al SalesBot de VENTAS. `integration_configs` no tiene `survey_link_field_id_service`
-- ni `survey_stage_id_service`, y kommo-api cae al par de venta a proposito
-- (kommo-api/index.ts:2105-2108). Dos clientes que fueron a un servicio recibieron una
-- felicitacion por vehiculo nuevo.
--
-- El comentario original de ese fallback decia que nada llegaba al cliente porque
-- `survey_delivery_enabled` estaba apagado. Ese flag se encendio para las de venta y el
-- supuesto caduco. Por eso la pausa no puede depender de un solo punto.

-- 1) El trigger que crea la encuesta al completar una cita.
--    Se DESACTIVA, no se elimina: el proyecto grande lo va a necesitar tal cual.
--    Para reactivar: ALTER TABLE public.reservations ENABLE TRIGGER trg_create_service_survey_on_completed;
ALTER TABLE public.reservations DISABLE TRIGGER trg_create_service_survey_on_completed;

-- 2) El barrido. Esta era la falla real: filtraba por status y elegibilidad, pero NO por
--    origen, y mandaba `reason: 'won'` fijo. Cualquier encuesta postventa que llegue a
--    'pending' — por un trigger reactivado a medias, un insert manual o un replay de
--    migracion — se despachaba al bot de ventas.
--
--    El `reason: 'won'` hardcodeado de abajo es correcto SOLO por este filtro. Si algun dia
--    se amplia el origen aqui, hay que volver dinamico ese reason.
CREATE OR REPLACE FUNCTION public.fn_dispatch_eligible_surveys()
 RETURNS TABLE(dispatched integer, skipped_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_enabled   boolean;
  v_key       text;
  v_url       text;
  v_row       record;
  v_count     int := 0;
BEGIN
  -- Honor the kill switch HERE, not only in the edge function. If the sweep called out
  -- while delivery is disabled, every due survey would burn its retry budget against a
  -- guaranteed refusal and be exhausted by the time the switch is finally turned on.
  SELECT (config->'survey_delivery_enabled')::text = 'true'
    INTO v_enabled
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
    SELECT s.id
      FROM public.satisfaction_surveys s
     WHERE s.status = 'pending'
       AND s.delivered_at IS NULL
       AND s.suppressed_reason IS NULL
       -- Solo encuestas de VENTA. Ver el bloque (2) arriba: sin esto, una postventa
       -- pendiente termina en el bot de ventas felicitando por una compra que no existio.
       AND s.origin IN ('won', 'repurchase')
       -- No client means deliver_satisfaction_survey throws `survey_has_no_client`. The 17
       -- surveys created before the client-linking trigger existed are in exactly that
       -- state; they must not be swept.
       AND s.client_id IS NOT NULL
       AND s.eligible_at <= now()
       AND s.dispatch_attempts < 5
       AND (s.last_dispatch_at IS NULL OR s.last_dispatch_at < now() - interval '6 hours')
     ORDER BY s.eligible_at
     LIMIT 50
  LOOP
    -- Stamp BEFORE the call: pg_net is fire-and-forget, so the response never comes back
    -- here. Stamping first means a call that fails silently still consumes an attempt
    -- instead of looping forever.
    UPDATE public.satisfaction_surveys
       SET dispatch_attempts = dispatch_attempts + 1,
           last_dispatch_at  = now()
     WHERE id = v_row.id;

    -- The secret MUST go in `apikey`, not `Authorization: Bearer`. `sb_secret_*` keys are
    -- not JWTs, and kommo-api runs with the default verify_jwt=true, so the gateway rejects
    -- a non-JWT bearer with 401 "Invalid API key" before the function is ever reached —
    -- verified against production. kommo-api's own auth check accepts either header
    -- (index.ts:914-919); it is the gateway in front of it that is picky.
    PERFORM net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'apikey',       v_key
                 ),
      body    := jsonb_build_object(
                   'action',    'deliver_satisfaction_survey',
                   'survey_id', v_row.id,
                   'reason',    'won'
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

-- 3) Las 3 postventa que alcanzaron a salir quedan marcadas. No se borran: el mensaje se
--    envio de verdad y borrar el registro no lo desenvia. Marcarlas las saca del historial
--    del vehiculo, donde apareceria "encuesta enviada - sin responder" para siempre sobre
--    una funcion que esta en pausa.
UPDATE public.satisfaction_surveys
   SET suppressed_reason = 'postventa_pausada_ruteo_incorrecto'
 WHERE origin = 'service'
   AND suppressed_reason IS NULL;
