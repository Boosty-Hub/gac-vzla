-- Formulario de captacion de eventos: acceso publico por link, sin iniciar sesion.
--
-- POR QUE ANTES PEDIA SESION. El lead de un evento tiene que subir a Kommo igual que uno
-- cargado desde el panel, y eso lo hacia el frontend llamando a la edge function `kommo-api`,
-- que exige JWT. Un visitante anonimo no lo tiene. Abrir `kommo-api` a `anon` no era opcion:
-- es el proxy completo del CRM.
--
-- COMO SE RESUELVE. El frontend deja de leer tablas y de llamar a la edge function. Todo pasa
-- por dos funciones SECURITY DEFINER:
--   * `event_capture_form`  -> devuelve SOLO lo que el formulario necesita pintar.
--   * `submit_event_lead`   -> valida, inserta y dispara Kommo desde la base con la llave del
--                              vault, el mismo camino que ya usa `create_service_survey_on_completed`.
-- Ninguna tabla queda abierta a `anon`: `prospect_events`, `salespersons`, `prospect_models` y
-- `prospect_vehicles` conservan sus policies tal cual. La llave de servicio nunca sale de la base.
--
-- Los dos interruptores del evento (`is_active` y `capture_form_enabled`) siguen mandando, y se
-- manejan desde Eventos -> Editar. Apagar cualquiera de los dos cierra el link al instante.

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- 1) Lo que el formulario necesita para pintarse.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.event_capture_form(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_ev     public.prospect_events%ROWTYPE;
  v_people jsonb;
  v_models jsonb;
BEGIN
  IF p_event_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  SELECT * INTO v_ev FROM public.prospect_events WHERE id = p_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- El nombre se devuelve igual cuando esta cerrado: la pantalla de "apagado" lo muestra.
  IF NOT v_ev.is_active THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'closed', 'name', v_ev.name);
  END IF;

  IF NOT coalesce(v_ev.capture_form_enabled, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'disabled', 'name', v_ev.name);
  END IF;

  -- Solo los vendedores del evento, y solo id + nombre: ni telefono ni profile_id salen a
  -- internet. Si el evento no cargo ninguno se ofrecen todos los activos, que es el
  -- comportamiento que ya tenia el formulario (un desplegable vacio no deja registrar nada).
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.name), '[]'::jsonb)
    INTO v_people
    FROM public.salespersons s
   WHERE s.is_active
     AND (
       coalesce(array_length(v_ev.salesperson_ids, 1), 0) = 0
       OR s.id = ANY (v_ev.salesperson_ids)
     );

  SELECT coalesce(jsonb_agg(jsonb_build_object('brand', m.brand, 'name', m.name)
                            ORDER BY m.brand, m.sort_order, m.name), '[]'::jsonb)
    INTO v_models
    FROM public.prospect_models m
   WHERE m.is_active;

  RETURN jsonb_build_object(
    'ok', true,
    'event', jsonb_build_object(
      'id',                 v_ev.id,
      'name',               v_ev.name,
      'location',           v_ev.location,
      'start_date',         v_ev.start_date,
      'end_date',           v_ev.end_date,
      'brands',             coalesce(to_jsonb(v_ev.brands), '[]'::jsonb),
      'exhibited_vehicles', coalesce(to_jsonb(v_ev.exhibited_vehicles), '[]'::jsonb),
      -- El concesionario NO se expone: lo resuelve `submit_event_lead`. Esto es solo para que
      -- el formulario avise en vez de dejar tocar "Registrar" y fallar.
      'has_dealership',     v_ev.dealership_id IS NOT NULL
    ),
    'salespersons', v_people,
    'models',       v_models
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.event_capture_form(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_capture_form(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2) Alta del lead. Unica puerta de escritura del formulario publico.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_event_lead(
  p_event_id        uuid,
  p_name            text,
  p_phone           text,
  p_email           text    DEFAULT NULL,
  p_brand           text    DEFAULT NULL,
  p_model           text    DEFAULT NULL,
  p_salesperson     text    DEFAULT NULL,
  p_notes           text    DEFAULT NULL,
  p_test_drive      boolean DEFAULT false,
  p_allow_duplicate boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_ev          public.prospect_events%ROWTYPE;
  v_name        text := btrim(coalesce(p_name, ''));
  v_phone       text := btrim(coalesce(p_phone, ''));
  v_email       text := nullif(btrim(coalesce(p_email, '')), '');
  v_brand       text := nullif(btrim(coalesce(p_brand, '')), '');
  v_model       text := nullif(btrim(coalesce(p_model, '')), '');
  v_seller      text := nullif(btrim(coalesce(p_salesperson, '')), '');
  v_notes       text := nullif(btrim(coalesce(p_notes, '')), '');
  v_seller_ok   boolean;
  v_recent      uuid;
  v_burst       integer;
  v_prospect_id uuid;
  v_key         text;
  v_kommo       boolean := false;
BEGIN
  IF p_event_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  SELECT * INTO v_ev FROM public.prospect_events WHERE id = p_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Los dos interruptores se revisan DE NUEVO al guardar, no solo al pintar: entre que alguien
  -- abrio el link y toco el boton, el evento pudo cerrarse desde el panel.
  IF NOT v_ev.is_active THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'closed');
  END IF;

  IF NOT coalesce(v_ev.capture_form_enabled, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'disabled');
  END IF;

  -- El concesionario sale del EVENTO, nunca del cliente. Es lo que decide que concesionario ve
  -- el lead: si lo mandara el navegador, cualquiera podria meter leads en cualquier sucursal.
  IF v_ev.dealership_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_dealership');
  END IF;

  IF v_name = ''  THEN RETURN jsonb_build_object('ok', false, 'reason', 'missing_name');  END IF;
  IF v_phone = '' THEN RETURN jsonb_build_object('ok', false, 'reason', 'missing_phone'); END IF;

  IF v_email IS NOT NULL AND v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_email');
  END IF;

  -- El vendedor tiene que ser uno real y de los habilitados para el evento. `prospects.salesperson`
  -- es texto libre en la tabla y ademas decide que ve un usuario con rol vendedor (policy
  -- `prospects_select`): dejar entrar texto arbitrario desde internet ensuciaria esa visibilidad.
  IF v_seller IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.salespersons s
       WHERE s.is_active
         AND s.name = v_seller
         AND (
           coalesce(array_length(v_ev.salesperson_ids, 1), 0) = 0
           OR s.id = ANY (v_ev.salesperson_ids)
         )
    ) INTO v_seller_ok;

    IF NOT v_seller_ok THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_salesperson');
    END IF;
  END IF;

  -- Doble toque en la tablet del stand: se devuelve el lead que ya se creo en vez de duplicarlo.
  SELECT p.id INTO v_recent
    FROM public.prospects p
   WHERE p.event_name = v_ev.name
     AND p.phone      = v_phone
     AND p.created_at > now() - interval '20 seconds'
   ORDER BY p.created_at DESC
   LIMIT 1;

  IF v_recent IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'prospect_id', v_recent, 'deduped', true);
  END IF;

  -- El link es publico, asi que hay un techo por evento. Un stand no carga 40 leads en un
  -- minuto; un bot si. No usa tabla nueva: cuenta los prospectos del propio evento.
  SELECT count(*) INTO v_burst
    FROM public.prospects p
   WHERE p.event_name = v_ev.name
     AND p.created_at > now() - interval '1 minute';

  IF v_burst >= 40 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited');
  END IF;

  -- Aviso de telefono repetido: no bloquea, obliga a confirmar. En un stand el mismo numero
  -- vuelve, y perder el lead es peor que tener dos.
  IF NOT coalesce(p_allow_duplicate, false)
     AND EXISTS (SELECT 1 FROM public.prospects p WHERE p.phone = v_phone) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'duplicate_phone');
  END IF;

  -- `status` no se manda: lo pone `normalize_prospect_status` con el estado de entrada del
  -- catalogo. `source = 'evento'` es el que ya leen los filtros de Prospectos y el mapeo de Kommo.
  INSERT INTO public.prospects (
    dealership_id, name, phone, email, model_interest, source,
    notes, salesperson, event_name, test_drive
  ) VALUES (
    v_ev.dealership_id, v_name, v_phone, v_email,
    nullif(btrim(concat_ws(' ', v_brand, v_model)), ''),
    'evento', v_notes, v_seller, v_ev.name, coalesce(p_test_drive, false)
  )
  RETURNING id INTO v_prospect_id;

  IF v_brand IS NOT NULL THEN
    INSERT INTO public.prospect_vehicles (prospect_id, brand, model, sort_order)
    VALUES (v_prospect_id, v_brand, v_model, 0);
  END IF;

  -- Kommo, desde la base. Es el MISMO `create_lead` que llamaba el frontend con sesion; lo que
  -- cambia es quien lo dispara. La llave de servicio sale del vault y nunca llega al navegador.
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'kommo_api_service_key' LIMIT 1;

  IF v_key IS NOT NULL THEN
    PERFORM net.http_post(
      url     := 'https://wsbuqiznddvxcwvpnbxm.supabase.co/functions/v1/kommo-api',
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key),
      body    := jsonb_build_object('action', 'create_lead', 'prospect_id', v_prospect_id),
      timeout_milliseconds := 20000
    );
    v_kommo := true;
  END IF;

  RETURN jsonb_build_object('ok', true, 'prospect_id', v_prospect_id, 'kommo_queued', v_kommo);
END;
$fn$;

REVOKE ALL ON FUNCTION public.submit_event_lead(uuid, text, text, text, text, text, text, text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_event_lead(uuid, text, text, text, text, text, text, text, boolean, boolean) TO anon, authenticated;

COMMIT;
