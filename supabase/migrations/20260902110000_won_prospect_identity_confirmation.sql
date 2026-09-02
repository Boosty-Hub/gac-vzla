-- CAUSA RAIZ del backfill 20260902100000: fn_resolve_or_create_client_for_prospect matchea
-- por cedula/telefono/correo cuando la placa es nueva (Case 3). Eso esta bien para un cliente
-- real repitiendo compra -- pero varios "clientes" en produccion (Elio Vincent, Clarence
-- Lamus, REDES ELIAS C.A, etc.) son en realidad INTERMEDIARIOS que gestionan compras para
-- VARIAS empresas distintas con el MISMO telefono. Cada venta nueva de una empresa distinta se
-- enganchaba en SILENCIO al intermediario ya existente, en vez de crear/usar el cliente real
-- (la empresa que factura el vehiculo). Ningun aviso, ninguna confirmacion -- el vendedor no
-- se enteraba.
--
-- Esta migracion agrega el mismo tipo de confirmacion explicita que ya existe para una placa
-- ya facturada (la tarjeta "Vincular este vehiculo al comprador" en WonProspectDialog.tsx),
-- pero un paso antes, para cuando el cliente se resolveria por cedula/telefono/correo:
--
--   1. staff_check_prospect_client_identity: RPC de solo lectura que el frontend llama antes
--      de confirmar. Replica el MISMO orden/normalizacion de
--      fn_resolve_or_create_client_for_prospect (placa -> cedula -> telefono -> correo) pero
--      sin crear nada, y devuelve el cliente que matchearia por cedula/telefono/correo (nunca
--      por placa -- eso ya lo cubre la tarjeta existente).
--
--   2. register_won_prospect gana un parametro p_force_new_client. Cuando el vendedor
--      confirma explicitamente "no es el mismo, es otra persona/empresa", el frontend lo manda
--      en true. Se propaga a fn_resolve_or_create_client_for_prospect via una GUC
--      transaccional (gac.force_new_client) -- el trigger BEFORE que dispara la resolucion
--      solo ve la fila NEW, no los parametros de la RPC, mismo mecanismo que
--      gac.client_just_created ya usa para el marcador de "cliente recien creado".
--
-- La placa sigue siendo el criterio absoluto en todos los casos: un vehiculo YA facturado
-- nunca se reasigna, con o sin p_force_new_client.

-- ============================================================================
-- fn_resolve_or_create_client_for_prospect: salta cedula/telefono/correo cuando
-- gac.force_new_client = 'true' para esta transaccion.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_resolve_or_create_client_for_prospect(
  p_prospect_id uuid,
  p_sold_plate  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE p record; v_client_id uuid; v_phone10 text; v_plate_norm text; v_force_new boolean;
BEGIN
  PERFORM set_config('gac.client_just_created', '', true);

  SELECT * INTO p FROM public.prospects WHERE id = p_prospect_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'prospect_not_found'; END IF;
  IF p.client_id IS NOT NULL THEN RETURN p.client_id; END IF;      -- 0) idempotent fast path

  -- 1) PLACA -- criterio absoluto, sin excepcion: es literalmente el vehiculo facturado.
  v_plate_norm := nullif(upper(trim(coalesce(p_sold_plate, ''))), '');
  IF v_plate_norm IS NOT NULL THEN
    SELECT v.client_id INTO v_client_id
      FROM public.vehicles v
     WHERE upper(trim(v.plate)) = v_plate_norm
     ORDER BY v.created_at
     LIMIT 1;
    IF v_client_id IS NOT NULL THEN
      RETURN v_client_id;
    END IF;
  END IF;

  -- 2026-09-02: gac.force_new_client lo fija register_won_prospect (via p_force_new_client)
  -- cuando el vendedor ya vio -- en staff_check_prospect_client_identity -- que
  -- cedula/telefono/correo matchea un cliente existente y confirmo explicitamente que es una
  -- persona/empresa DISTINTA. Sin esto, cedula/telefono/correo son solo heuristicas debiles
  -- (un telefono de intermediario se reusa entre clientes reales sin ninguna relacion).
  v_force_new := coalesce(current_setting('gac.force_new_client', true), '') = 'true';

  IF NOT v_force_new THEN
    v_phone10 := right(regexp_replace(coalesce(p.phone,''), '\D', '', 'g'), 10);

    -- 2) cedula  3) phone (last 10 digits)  4) email — MIRRORS findExistingContact
    --    (kommo-api:593-604, CI-RIF -> phone -> email) so DB and Kommo agree on identity.
    SELECT c.id INTO v_client_id FROM public.clients c
     WHERE nullif(trim(p.cedula),'') IS NOT NULL
       AND upper(trim(c.cedula)) = upper(trim(p.cedula))
     ORDER BY c.created_at LIMIT 1;

    IF v_client_id IS NULL AND length(v_phone10) = 10 THEN
      SELECT c.id INTO v_client_id FROM public.clients c
       WHERE right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 10) = v_phone10
       ORDER BY c.created_at LIMIT 1;
    END IF;

    IF v_client_id IS NULL AND nullif(trim(p.email),'') IS NOT NULL THEN
      SELECT c.id INTO v_client_id FROM public.clients c
       WHERE lower(trim(c.email)) = lower(trim(p.email))
       ORDER BY c.created_at LIMIT 1;
    END IF;
  END IF;

  -- Name is DELIBERATELY NOT a dedup key: 7 duplicate full_names, free text, unsafe.
  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (full_name, cedula, phone, email, state, is_active)
    VALUES (coalesce(nullif(trim(p.name),''), 'Cliente'), nullif(trim(p.cedula),''),
            nullif(trim(p.phone),''), nullif(trim(p.email),''),
            nullif(trim(p."Estado de Vnzla"),''), true)
    RETURNING id INTO v_client_id;
    PERFORM set_config('gac.client_just_created', v_client_id::text, true);
  END IF;

  RETURN v_client_id;
END; $$;

-- ============================================================================
-- staff_check_prospect_client_identity: chequeo de solo lectura, mismo orden/normalizacion
-- que fn_resolve_or_create_client_for_prospect pero SIN crear ni tocar nada. El frontend lo
-- llama antes de habilitar "Confirmar" en WonProspectDialog.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.staff_check_prospect_client_identity(
  p_prospect_id uuid,
  p_first_plate text DEFAULT NULL
)
RETURNS TABLE(matched_client_id uuid, matched_client_name text, match_reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_prospect record;
  v_plate_norm text;
  v_phone10 text;
  v_client_id uuid;
  v_client_name text;
BEGIN
  SELECT * INTO v_prospect FROM public.prospects WHERE id = p_prospect_id;
  IF v_prospect.id IS NULL THEN RAISE EXCEPTION 'prospect_not_found'; END IF;

  IF NOT (public.is_admin_user()
      OR (public.get_user_role() = 'concesionario' AND v_prospect.dealership_id = ANY(public.current_user_dealership_ids()))
      OR (public.get_user_role() = 'vendedor'      AND v_prospect.salesperson  = ANY(public.current_user_salesperson_names()))) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Ya resuelto: cero riesgo de enganche silencioso, nada que avisar.
  IF v_prospect.client_id IS NOT NULL THEN RETURN; END IF;

  -- Placa ya facturada: el aviso de "vincular este vehiculo" en el dialogo ya cubre este
  -- caso -- no duplicar el aviso aca.
  v_plate_norm := nullif(upper(trim(coalesce(p_first_plate, ''))), '');
  IF v_plate_norm IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.vehicles v WHERE upper(trim(v.plate)) = v_plate_norm
  ) THEN
    RETURN;
  END IF;

  IF nullif(trim(v_prospect.cedula), '') IS NOT NULL THEN
    SELECT c.id, c.full_name INTO v_client_id, v_client_name FROM public.clients c
     WHERE upper(trim(c.cedula)) = upper(trim(v_prospect.cedula))
     ORDER BY c.created_at LIMIT 1;
    IF v_client_id IS NOT NULL THEN
      matched_client_id := v_client_id; matched_client_name := v_client_name; match_reason := 'cedula';
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  v_phone10 := right(regexp_replace(coalesce(v_prospect.phone,''), '\D', '', 'g'), 10);
  IF length(v_phone10) = 10 THEN
    SELECT c.id, c.full_name INTO v_client_id, v_client_name FROM public.clients c
     WHERE right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 10) = v_phone10
     ORDER BY c.created_at LIMIT 1;
    IF v_client_id IS NOT NULL THEN
      matched_client_id := v_client_id; matched_client_name := v_client_name; match_reason := 'phone';
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  IF nullif(trim(v_prospect.email), '') IS NOT NULL THEN
    SELECT c.id, c.full_name INTO v_client_id, v_client_name FROM public.clients c
     WHERE lower(trim(c.email)) = lower(trim(v_prospect.email))
     ORDER BY c.created_at LIMIT 1;
    IF v_client_id IS NOT NULL THEN
      matched_client_id := v_client_id; matched_client_name := v_client_name; match_reason := 'email';
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  RETURN;
END; $$;

GRANT EXECUTE ON FUNCTION public.staff_check_prospect_client_identity(uuid, text) TO authenticated;

-- ============================================================================
-- register_won_prospect: nuevo parametro p_force_new_client (trailing, DEFAULT false -- no
-- rompe llamadas existentes). DROP explicito primero: CREATE OR REPLACE NO reemplaza una
-- funcion cuya lista de tipos de argumento cambio -- crea un overload nuevo y deja el viejo
-- huerfano (mismo error ya documentado en 20260831160000). Cuerpo identico al vigente, unico
-- cambio real: el set_config al principio.
-- ============================================================================
DROP FUNCTION IF EXISTS public.register_won_prospect(uuid, jsonb, boolean);

CREATE OR REPLACE FUNCTION public.register_won_prospect(
  p_prospect_id uuid,
  p_vehicles jsonb DEFAULT '[]'::jsonb,
  p_is_fleet boolean DEFAULT false,
  p_force_new_client boolean DEFAULT false
)
 RETURNS TABLE(client_id uuid, survey_id uuid, survey_token text, suppressed_reason text, vehicles_created integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_prospect      record;
  v_entry         jsonb;
  v_plate         text;
  v_model_id      uuid;
  v_year          int;
  v_min_year      int := 1980;
  v_max_year      int;
  v_first_plate   text;
  v_vehicle_id    uuid;
  v_first_vehicle uuid;
  v_created       int := 0;
  v_client_id     uuid;
  v_existing_id     uuid;
  v_existing_client uuid;
  v_dup_client_id   uuid;
  v_client_just_created boolean;
BEGIN
  SELECT * INTO v_prospect FROM public.prospects WHERE id = p_prospect_id;
  IF v_prospect.id IS NULL THEN RAISE EXCEPTION 'prospect_not_found'; END IF;

  IF NOT (public.is_admin_user()
      OR (public.get_user_role() = 'concesionario' AND v_prospect.dealership_id = ANY(public.current_user_dealership_ids()))
      OR (public.get_user_role() = 'vendedor'      AND v_prospect.salesperson  = ANY(public.current_user_salesperson_names()))) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- 2026-09-02: se propaga a fn_resolve_or_create_client_for_prospect via GUC transaccional
  -- -- el trigger BEFORE que la llama solo ve la fila NEW, no los parametros de esta RPC.
  -- Fijado SIEMPRE (incluso a 'false'), para que una llamada anterior en la misma
  -- transaccion/conexion pooleada nunca deje un valor viejo sin querer.
  PERFORM set_config('gac.force_new_client', CASE WHEN p_force_new_client THEN 'true' ELSE 'false' END, true);

  IF p_vehicles IS NULL OR jsonb_typeof(p_vehicles) IS DISTINCT FROM 'array' OR jsonb_array_length(p_vehicles) = 0 THEN
    RAISE EXCEPTION 'at_least_one_vehicle_required';
  END IF;

  v_max_year := extract(year FROM now())::int + 2;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_vehicles) LOOP
    IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'invalid_vehicle_entry: expected a JSON object, got %', v_entry;
    END IF;
    IF NOT (v_entry ? 'plate') OR nullif(btrim(v_entry->>'plate'), '') IS NULL THEN
      RAISE EXCEPTION 'plate_required_for_every_vehicle';
    END IF;
    IF NOT (v_entry ? 'model_id') OR nullif(btrim(v_entry->>'model_id'), '') IS NULL THEN
      RAISE EXCEPTION 'model_id_required_for_every_vehicle';
    END IF;
    IF NOT (v_entry ? 'year') OR nullif(btrim(v_entry->>'year'), '') IS NULL THEN
      RAISE EXCEPTION 'year_required_for_every_vehicle';
    END IF;

    BEGIN
      v_model_id := (v_entry->>'model_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid_model_id: %', v_entry->>'model_id';
    END;
    IF NOT EXISTS (SELECT 1 FROM public.vehicle_models m WHERE m.id = v_model_id) THEN
      RAISE EXCEPTION 'model_id_not_found: %', v_model_id;
    END IF;

    BEGIN
      v_year := (v_entry->>'year')::int;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid_year: %', v_entry->>'year';
    END;
    IF v_year < v_min_year OR v_year > v_max_year THEN
      RAISE EXCEPTION 'year_out_of_range: % (expected between % and %)', v_year, v_min_year, v_max_year;
    END IF;

    IF v_first_plate IS NULL THEN
      v_first_plate := upper(btrim(v_entry->>'plate'));
    END IF;
  END LOOP;

  UPDATE public.prospects
     SET status = 'ganado', sold_plate = v_first_plate, is_fleet = p_is_fleet
   WHERE id = p_prospect_id
  RETURNING prospects.client_id INTO v_client_id;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_vehicles) LOOP
    v_plate    := upper(btrim(v_entry->>'plate'));
    v_model_id := (v_entry->>'model_id')::uuid;
    v_year     := (v_entry->>'year')::int;

    IF EXISTS (
      SELECT 1 FROM public.vehicles
      WHERE vehicles.client_id = v_client_id AND upper(vehicles.plate) = v_plate
    ) THEN
      CONTINUE;
    END IF;

    SELECT vehicles.id, vehicles.client_id INTO v_existing_id, v_existing_client
      FROM public.vehicles WHERE upper(vehicles.plate) = v_plate LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      IF coalesce((v_entry->>'link_existing')::boolean, false) THEN
        v_dup_client_id := v_client_id;

        UPDATE public.prospects
           SET client_id = v_existing_client
         WHERE prospects.id = p_prospect_id;

        UPDATE public.satisfaction_surveys
           SET client_id = v_existing_client
         WHERE satisfaction_surveys.prospect_id = p_prospect_id
           AND satisfaction_surveys.client_id = v_dup_client_id;

        v_client_id := v_existing_client;

        v_client_just_created :=
          coalesce(current_setting('gac.client_just_created', true), '') = v_dup_client_id::text;

        IF v_client_just_created
           AND NOT EXISTS (SELECT 1 FROM public.prospects WHERE prospects.client_id = v_dup_client_id)
           AND NOT EXISTS (SELECT 1 FROM public.vehicles WHERE vehicles.client_id = v_dup_client_id)
           AND NOT EXISTS (SELECT 1 FROM public.reservations WHERE reservations.client_id = v_dup_client_id)
           AND NOT EXISTS (SELECT 1 FROM public.satisfaction_surveys WHERE satisfaction_surveys.client_id = v_dup_client_id)
           AND NOT EXISTS (SELECT 1 FROM public.client_users WHERE client_users.client_id = v_dup_client_id)
           AND NOT EXISTS (SELECT 1 FROM public.drivers WHERE drivers.client_id = v_dup_client_id)
           AND NOT EXISTS (SELECT 1 FROM public.external_portal_sessions WHERE external_portal_sessions.client_id = v_dup_client_id)
        THEN
          DELETE FROM public.clients WHERE clients.id = v_dup_client_id;
        END IF;

        UPDATE public.vehicles
           SET model_id        = v_model_id,
               year            = v_year,
               warranty_active = NOT coalesce((SELECT vm.is_manual FROM public.vehicle_models vm WHERE vm.id = v_model_id), false),
               is_manual       = coalesce((SELECT vm.is_manual FROM public.vehicle_models vm WHERE vm.id = v_model_id), false),
               updated_at      = now()
         WHERE vehicles.id = v_existing_id;
        v_vehicle_id := v_existing_id;
        v_created := v_created + 1;
        IF v_first_vehicle IS NULL THEN v_first_vehicle := v_vehicle_id; END IF;
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'plate_belongs_to_another_client: %', v_plate;
    END IF;

    INSERT INTO public.vehicles (client_id, model_id, year, plate, mileage, purchase_date, warranty_active, is_active, is_manual)
    VALUES (v_client_id, v_model_id, v_year, v_plate, 0, current_date,
            NOT coalesce((SELECT vm.is_manual FROM public.vehicle_models vm WHERE vm.id = v_model_id), false),
            true,
            coalesce((SELECT vm.is_manual FROM public.vehicle_models vm WHERE vm.id = v_model_id), false))
    RETURNING id INTO v_vehicle_id;
    v_created := v_created + 1;
    IF v_first_vehicle IS NULL THEN v_first_vehicle := v_vehicle_id; END IF;
  END LOOP;

  IF v_first_vehicle IS NOT NULL THEN
    UPDATE public.satisfaction_surveys s
       SET vehicle_id = v_first_vehicle
     WHERE s.prospect_id = p_prospect_id AND s.vehicle_id IS NULL;
  END IF;

  RETURN QUERY
  SELECT v_client_id, surv.id, surv.token, surv.suppressed_reason, v_created
  FROM (SELECT 1) AS anchor
  LEFT JOIN LATERAL (
    SELECT s.id, s.token, s.suppressed_reason
      FROM public.satisfaction_surveys s
     WHERE s.prospect_id = p_prospect_id
     ORDER BY s.created_at DESC
     LIMIT 1
  ) AS surv ON true;
END;
$function$;
