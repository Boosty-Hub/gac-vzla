-- =============================================================================
-- Envio MANUAL de las encuestas de satisfaccion (2026-08-24)
-- =============================================================================
--
-- Pedido: "que el envio de las encuestas de satisfaccion se haga de forma manual
-- y no automatica".
--
--   * Encuesta de ENTREGA DE VEHICULO -> se dispara desde la ficha del cliente,
--     pestana "Encuestas", boton "Enviar encuesta".
--   * Encuesta de POSTVENTA / SERVICIO -> se decide al cerrar la cita, en el
--     dialogo "Completar Servicio", con una eleccion OBLIGATORIA de si/no.
--
-- Que NO cambia: los dos interruptores de encendido (`sales_survey_enabled` /
-- `service_survey_enabled`) siguen siendo el corte maestro por encuesta, y
-- `survey_delivery_enabled` sigue siendo el maestro de las dos. Manual/automatico
-- es una dimension distinta: COMO sale, no SI sale.
--
-- Matriz resultante, para no tener que deducirla:
--
--   enabled=false                  -> no se crea nada y no sale nada. Los botones
--                                     manuales explican que hay que prenderla en
--                                     Configuracion -> Automatizaciones.
--   enabled=true, auto_send=false  -> MODO MANUAL (el nuevo default). La fila se
--                                     crea, el barrido NO la manda, la manda una
--                                     persona con un boton.
--   enabled=true, auto_send=true   -> comportamiento historico: el barrido la
--                                     manda sola.
--
-- Default de `*_auto_send`: FALSE, y ausente tambien se lee como FALSE. Es el
-- unico default seguro: si alguien restaura una config vieja, lo peor que pasa
-- es que una encuesta espere a que la manden a mano. Al reves, un default
-- permisivo mandaria mensajes a clientes reales sin que nadie lo pidiera.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Claves de configuracion. Solo se escriben si faltan, para no pisar una
--    decision que alguien ya haya tomado desde el panel.
-- ---------------------------------------------------------------------------
UPDATE public.integration_configs
   SET config = config
         || CASE WHEN config ? 'sales_survey_auto_send'
                 THEN '{}'::jsonb
                 ELSE jsonb_build_object('sales_survey_auto_send', false) END
         || CASE WHEN config ? 'service_survey_auto_send'
                 THEN '{}'::jsonb
                 ELSE jsonb_build_object('service_survey_auto_send', false) END,
       updated_at = now()
 WHERE integration_name = 'kommo';

-- ---------------------------------------------------------------------------
-- 2) Lectura de configuracion para el panel. Cambia el RETURNS TABLE, asi que
--    Postgres no permite CREATE OR REPLACE: hay que DROP y volver a otorgar.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_survey_delivery_config();

CREATE FUNCTION public.get_survey_delivery_config()
RETURNS TABLE(
  delivery_enabled              boolean,
  survey_base_url               text,
  survey_stage_id               text,
  survey_link_field_id          text,
  survey_stage_id_service       text,
  survey_link_field_id_service  text,
  service_enabled               boolean,
  service_ready                 boolean,
  sales_enabled                 boolean,
  sales_ready                   boolean,
  sales_auto_send               boolean,
  service_auto_send             boolean
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
      AND nullif(btrim(coalesce(config->>'survey_link_field_id', '')), '') IS NOT NULL,
    -- Ausente = MANUAL. Al reves de los interruptores de encendido a proposito:
    -- ver el encabezado.
    coalesce((config->'sales_survey_auto_send')::text = 'true', false),
    coalesce((config->'service_survey_auto_send')::text = 'true', false)
  FROM public.integration_configs
  WHERE integration_name = 'kommo' AND is_active
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_survey_delivery_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_survey_delivery_config() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Interruptores automatico/manual, uno por encuesta.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_sales_survey_auto_send(p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'enabled_requerido';
  END IF;

  UPDATE public.integration_configs
     SET config = jsonb_set(config, '{sales_survey_auto_send}', to_jsonb(p_enabled), true),
         updated_at = now()
   WHERE integration_name = 'kommo' AND is_active;

  INSERT INTO public.integration_logs (integration_name, event_type, status, details)
  VALUES ('kommo', 'sales_survey_auto_send_toggle', 'success',
          jsonb_build_object('auto_send', p_enabled, 'by', auth.uid()));

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_sales_survey_auto_send(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_sales_survey_auto_send(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_service_survey_auto_send(p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'enabled_requerido';
  END IF;

  UPDATE public.integration_configs
     SET config = jsonb_set(config, '{service_survey_auto_send}', to_jsonb(p_enabled), true),
         updated_at = now()
   WHERE integration_name = 'kommo' AND is_active;

  INSERT INTO public.integration_logs (integration_name, event_type, status, details)
  VALUES ('kommo', 'service_survey_auto_send_toggle', 'success',
          jsonb_build_object('auto_send', p_enabled, 'by', auth.uid()));

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_service_survey_auto_send(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_service_survey_auto_send(boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) El barrido de pg_cron. En modo manual deja de mandar: es el punto donde
--    "automatico" realmente vive. Se agrega la condicion a los dos `ready`, no
--    se pone un return temprano, para que una encuesta pueda quedar en
--    automatico y la otra en manual sin bloquearse entre si.
-- ---------------------------------------------------------------------------
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
         -- Venta necesita su etapa, su campo, el interruptor prendido Y estar en
         -- modo automatico.
         nullif(btrim(coalesce(config->>'survey_stage_id', '')), '') IS NOT NULL
           AND nullif(btrim(coalesce(config->>'survey_link_field_id', '')), '') IS NOT NULL
           AND coalesce((config->'sales_survey_enabled')::text <> 'false', true)
           AND coalesce((config->'sales_survey_auto_send')::text = 'true', false),
         -- Postventa / servicio necesita su campo, su interruptor Y modo automatico.
         nullif(btrim(coalesce(config->>'survey_link_field_id_service', '')), '') IS NOT NULL
           AND coalesce((config->'service_survey_enabled')::text <> 'false', true)
           AND coalesce((config->'service_survey_auto_send')::text = 'true', false)
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
    RETURN QUERY SELECT 0, 'manual_or_not_configured'::text;
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

-- ---------------------------------------------------------------------------
-- 5) Trigger de cita completada. En modo manual no crea NADA: la fila la mina
--    el dialogo de "Completar Servicio" cuando el asesor elige "Si, enviar".
--
--    Crear la fila igual y no mandarla seria peor que no crearla: dejaria un
--    "enviada - sin responder" en el historial del vehiculo sobre una encuesta
--    que el asesor decidio no mandar.
-- ---------------------------------------------------------------------------
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
  v_auto           boolean;
  v_key            text;
BEGIN
  -- Interruptor general de la encuesta de postservicio + modo de envio.
  SELECT coalesce((config->'service_survey_enabled')::text <> 'false', true),
         coalesce((config->'service_survey_auto_send')::text = 'true', false)
    INTO v_survey_on, v_auto
    FROM public.integration_configs
   WHERE integration_name = 'kommo' AND is_active
   LIMIT 1;

  IF NOT coalesce(v_survey_on, true) THEN
    RETURN NEW;
  END IF;

  -- Modo manual: la decision la toma una persona en el dialogo de completar.
  IF NOT coalesce(v_auto, false) THEN
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

  -- Sin lead de la reserva en Kommo no hay donde escribir el campo, asi que ni se intenta:
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

-- ---------------------------------------------------------------------------
-- 6) Permiso propio para el envio manual, para que se administre desde
--    Configuracion -> Roles y no haya que tocar codigo.
--
--    Backfill: se otorga a los roles que HOY pueden editar clientes (los que ya
--    podian apretar el boton de reenvio) y a los que pueden editar reservas (los
--    que cierran una cita y ahora tienen que decidir si mandan la de postventa).
--    Nadie pierde nada que ya tuviera.
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions (name, module, description)
VALUES ('encuestas.send', 'encuestas', 'Enviar encuestas de satisfaccion manualmente')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, (SELECT id FROM public.permissions WHERE name = 'encuestas.send')
  FROM public.role_permissions rp
  JOIN public.permissions p ON p.id = rp.permission_id
 WHERE p.name IN ('clientes.edit', 'reservas.edit')
ON CONFLICT DO NOTHING;

-- Los dos roles de mando lo tienen siempre, aunque no tuvieran `clientes.edit`.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, (SELECT id FROM public.permissions WHERE name = 'encuestas.send')
  FROM public.roles r
 WHERE r.name IN ('superadmin', 'admin')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7) Alta manual de la encuesta de POSTVENTA / SERVICIO para una cita.
--
--    Devuelve SIEMPRE una fila (survey_id + reason) para que el frontend no
--    tenga que distinguir "no devolvio nada" de "devolvio un no". Ese fue el
--    bug de "No se pudo confirmar la venta" en agosto: una funcion que a veces
--    no devolvia fila.
--
--    NO entrega. Solo deja la fila lista; la entrega la hace la edge function
--    kommo-api, que es donde viven todos los cortes de seguridad.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_service_survey(p_reservation_id uuid)
RETURNS TABLE(survey_id uuid, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_res          record;
  v_survey_on    boolean;
  v_client_name  text;
  v_client_phone text;
  v_plate        text;
  v_suppressed   text;
  v_sends        boolean;
  v_existing     uuid;
  v_new          uuid;
BEGIN
  IF NOT (public.is_admin_user() OR public.has_permission('encuestas.send')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_reservation_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'reservation_requerida'::text;
    RETURN;
  END IF;

  SELECT coalesce((config->'service_survey_enabled')::text <> 'false', true)
    INTO v_survey_on
    FROM public.integration_configs
   WHERE integration_name = 'kommo' AND is_active
   LIMIT 1;

  IF NOT coalesce(v_survey_on, true) THEN
    RETURN QUERY SELECT NULL::uuid, 'service_survey_disabled'::text;
    RETURN;
  END IF;

  SELECT r.id, r.client_id, r.vehicle_id, r.dealership_id, r.status, r.service_type,
         r.walkin_client_name, r.walkin_client_phone, r.walkin_plate
    INTO v_res
    FROM public.reservations r
   WHERE r.id = p_reservation_id;

  IF v_res.id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'reserva_no_encontrada'::text;
    RETURN;
  END IF;

  -- Alcance por concesionario para todo el que no sea admin. Sin esto, un uuid de
  -- cita adivinado alcanzaria para mandarle un mensaje al cliente de otra sede:
  -- SECURITY DEFINER ya saltó las RLS que protegen esa lectura.
  IF NOT public.is_admin_user()
     AND NOT (v_res.dealership_id = ANY (public.current_user_dealership_ids())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Ya existe: no se duplica. El envio manual la reusa.
  SELECT s.id INTO v_existing
    FROM public.satisfaction_surveys s
   WHERE s.reservation_id = p_reservation_id
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT v_existing, 'ok'::text;
    RETURN;
  END IF;

  IF v_res.client_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'sin_cliente'::text;
    RETURN;
  END IF;

  SELECT st.sends_postventa_survey INTO v_sends
    FROM public.service_types st
   WHERE st.name = v_res.service_type
   LIMIT 1;

  IF coalesce(v_sends, true) = false THEN
    RETURN QUERY SELECT NULL::uuid, 'tipo_de_servicio_excluido'::text;
    RETURN;
  END IF;

  SELECT c.full_name, c.phone INTO v_client_name, v_client_phone
    FROM public.clients c WHERE c.id = v_res.client_id;

  v_client_name  := coalesce(v_client_name,  v_res.walkin_client_name);
  v_client_phone := coalesce(v_client_phone, v_res.walkin_client_phone);

  IF v_client_phone IS NULL OR btrim(v_client_phone) = '' THEN
    RETURN QUERY SELECT NULL::uuid, 'sin_telefono'::text;
    RETURN;
  END IF;

  SELECT coalesce(v.plate, v_res.walkin_plate) INTO v_plate
    FROM public.vehicles v WHERE v.id = v_res.vehicle_id;
  v_plate := coalesce(v_plate, v_res.walkin_plate);

  v_suppressed := public.fn_claim_survey_slot(v_res.client_id, 'service');

  IF v_suppressed IS NOT NULL THEN
    RETURN QUERY SELECT NULL::uuid, v_suppressed;
    RETURN;
  END IF;

  INSERT INTO public.satisfaction_surveys (
    reservation_id, client_id, vehicle_id, origin, dealership_id,
    client_name, client_phone, sold_plate, eligible_at
  ) VALUES (
    v_res.id, v_res.client_id, v_res.vehicle_id, 'service', v_res.dealership_id,
    v_client_name, v_client_phone, v_plate, now()
  )
  ON CONFLICT (reservation_id) WHERE reservation_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_new;

  -- La carrera con el trigger (modo automatico) o con otra pestana termina aca:
  -- el ON CONFLICT no devuelve fila, asi que se relee la que gano.
  IF v_new IS NULL THEN
    SELECT s.id INTO v_new
      FROM public.satisfaction_surveys s
     WHERE s.reservation_id = p_reservation_id
     LIMIT 1;
  END IF;

  RETURN QUERY SELECT v_new, CASE WHEN v_new IS NULL THEN 'no_creada' ELSE 'ok' END;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_service_survey(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_service_survey(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8) Alta manual de la encuesta de ENTREGA DE VEHICULO para un cliente.
--
--    Por que hace falta: con el interruptor apagado, marcar un prospecto como
--    ganado NO crea la fila. Sin esto, prender el interruptor mas tarde dejaria
--    el boton "Enviar encuesta" muerto para todas esas ventas -- que son todas
--    las de hoy. Esta funcion la mina en el momento del envio, a partir del
--    prospecto ganado mas reciente del cliente.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_sales_survey(p_client_id uuid)
RETURNS TABLE(survey_id uuid, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_sales_on   boolean;
  v_existing   uuid;
  v_scope      uuid;
  v_prospect   record;
  v_suppressed text;
  v_new        uuid;
BEGIN
  IF NOT (public.is_admin_user() OR public.has_permission('encuestas.send')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_client_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'cliente_requerido'::text;
    RETURN;
  END IF;

  SELECT coalesce((config->'sales_survey_enabled')::text <> 'false', true)
    INTO v_sales_on
    FROM public.integration_configs
   WHERE integration_name = 'kommo' AND is_active
   LIMIT 1;

  IF NOT coalesce(v_sales_on, true) THEN
    RETURN QUERY SELECT NULL::uuid, 'sales_survey_disabled'::text;
    RETURN;
  END IF;

  -- Si ya hay una encuesta de venta, se reusa: reenviar es el caso normal.
  SELECT s.id, s.dealership_id INTO v_existing, v_scope
    FROM public.satisfaction_surveys s
   WHERE s.client_id = p_client_id
     AND s.origin IN ('won', 'repurchase')
   ORDER BY s.created_at DESC
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    IF NOT public.is_admin_user()
       AND NOT (v_scope = ANY (public.current_user_dealership_ids())) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
    RETURN QUERY SELECT v_existing, 'ok'::text;
    RETURN;
  END IF;

  SELECT p.id, p.client_id, p.kommo_lead_id, p.dealership_id, p.salesperson,
         p.name, p.phone, p.sold_plate
    INTO v_prospect
    FROM public.prospects p
   WHERE p.client_id = p_client_id
     AND p.status = 'ganado'
   ORDER BY coalesce(p.status_updated_at, p.created_at) DESC
   LIMIT 1;

  IF v_prospect.id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'sin_venta_registrada'::text;
    RETURN;
  END IF;

  -- Mismo alcance que en postventa: SECURITY DEFINER ya saltó las RLS, asi que el
  -- concesionario se verifica a mano o no se verifica nunca.
  IF NOT public.is_admin_user()
     AND NOT (v_prospect.dealership_id = ANY (public.current_user_dealership_ids())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_prospect.phone IS NULL OR btrim(v_prospect.phone) = '' THEN
    RETURN QUERY SELECT NULL::uuid, 'sin_telefono'::text;
    RETURN;
  END IF;

  v_suppressed := public.fn_claim_survey_slot(p_client_id, 'sale');

  IF v_suppressed IS NOT NULL THEN
    RETURN QUERY SELECT NULL::uuid, v_suppressed;
    RETURN;
  END IF;

  INSERT INTO public.satisfaction_surveys (
    prospect_id, client_id, origin, kommo_lead_id, dealership_id, salesperson,
    client_name, client_phone, sold_plate, eligible_at
  ) VALUES (
    v_prospect.id, p_client_id, 'won', v_prospect.kommo_lead_id, v_prospect.dealership_id,
    v_prospect.salesperson, v_prospect.name, v_prospect.phone, v_prospect.sold_plate,
    now()
  )
  ON CONFLICT (prospect_id) WHERE prospect_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_new;

  IF v_new IS NULL THEN
    SELECT s.id INTO v_new
      FROM public.satisfaction_surveys s
     WHERE s.prospect_id = v_prospect.id
     LIMIT 1;
  END IF;

  RETURN QUERY SELECT v_new, CASE WHEN v_new IS NULL THEN 'no_creada' ELSE 'ok' END;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_sales_survey(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_sales_survey(uuid) TO authenticated;
