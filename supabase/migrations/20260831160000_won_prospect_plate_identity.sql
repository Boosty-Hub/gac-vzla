-- BUG: marcar un prospecto como "Ganado" y vincular la placa de un vehiculo ya facturado
-- crea un CLIENTE NUEVO/DUPLICADO en vez de enganchar el prospecto al cliente real (el que
-- ya existe desde que se facturo la venta, identificado por la placa). La casilla "Vincular
-- este vehiculo al comprador... no se crea un duplicado" hace justo lo contrario de lo que
-- promete.
--
-- CAUSA RAIZ: dos resoluciones de identidad separadas que nunca se cruzan.
--
-- 1) fn_resolve_or_create_client_for_prospect (creada en
--    20260729120000_satisfaction_prospect_to_client.sql, nunca redefinida desde entonces)
--    busca cedula -> telefono (ultimos 10 digitos) -> email, y si nada matchea CREA un
--    cliente nuevo. Nunca considera la placa. Corre en el trigger BEFORE
--    trg_link_client_on_won, disparado por el mismo UPDATE prospects SET status='ganado',
--    sold_plate=... que ejecuta register_won_prospect.
--
-- 2) register_won_prospect (version vigente hasta ahora en
--    20260805120000_won_prospect_always_returns_row.sql) primero corre ese UPDATE (que ya
--    deja v_client_id resuelto/creado por telefono/cedula/email, ANTES de que la funcion
--    procese la placa), y despues, si la placa ya existe bajo OTRO cliente y el usuario tildo
--    "link_existing", TRANSFIERE vehicles.client_id hacia v_client_id -- el cliente
--    nuevo/duplicado -- en vez de reconocer que v_client_id esta mal y usar al dueno real.
--
-- Segunda via del mismo bug: cuando Kommo mueve un lead a "ganado" por webhook
-- (kommo-webhook/index.ts, ourStatus === 'ganado'), no hay placa todavia
-- ("sold_plate not captured on webhook path", ya comentado en ese archivo) y el trigger
-- igual resuelve/crea el cliente por telefono/cedula/email. Cuando despues alguien completa
-- la placa desde la pestana "Falta placa" (que reabre este mismo WonProspectDialog.tsx y
-- vuelve a llamar a register_won_prospect), fn_resolve_or_create_client_for_prospect toma su
-- atajo idempotente (prospects.client_id IS NOT NULL -> lo reusa sin reevaluar), asi que la
-- placa nunca tiene chance de corregir una resolucion ya hecha por ese camino. Esa segunda
-- via depende exclusivamente del arreglo de register_won_prospect de abajo (Cambio 2).
--
-- ============================================================================
-- CAMBIO 1 -- fn_resolve_or_create_client_for_prospect: la placa pasa a ser el PRIMER
-- criterio, antes de cedula/telefono/email.
--
-- Firma nueva: agrega p_sold_plate. NO alcanza con re-leer prospects.sold_plate adentro de
-- la funcion -- esta corre dentro de un trigger BEFORE, y el `SELECT * INTO p FROM
-- public.prospects WHERE id = p_prospect_id` que ya hacia ve la fila TAL COMO ESTA HOY EN LA
-- TABLA, es decir la version PRE-update: el UPDATE que dispara este mismo trigger todavia no
-- se escribio. Para cedula/telefono/email eso no importaba (register_won_prospect nunca los
-- toca), pero sold_plate es justo la columna que ESTE MISMO UPDATE esta fijando por primera
-- vez en el caso principal del bug (el panel marca "Ganado" y carga la placa en el mismo
-- paso) -- leerla del SELECT interno devolveria siempre el valor viejo (NULL la primera vez)
-- y el criterio de placa nunca se cumpliria. Por eso el trigger (redefinido mas abajo) pasa
-- NEW.sold_plate explicitamente.
--
-- fn_resolve_or_create_client_for_prospect no se llama desde ningun otro lugar (confirmado:
-- unica referencia fuera de esta carpeta de migraciones y de openspec/ es el trigger
-- link_client_on_won), asi que este cambio de firma no rompe nada mas.
-- ============================================================================
-- CREATE OR REPLACE does NOT replace a function whose argument list differs — it creates a
-- new overload instead, leaving the old 1-arg signature orphaned in the schema (confirmed:
-- after applying this migration once without this DROP, both signatures existed side by
-- side). Nothing calls the 1-arg form anymore (the trigger below always passes the plate),
-- so it is dropped explicitly, before the new definition, to keep exactly one overload live.
DROP FUNCTION IF EXISTS public.fn_resolve_or_create_client_for_prospect(uuid);

CREATE OR REPLACE FUNCTION public.fn_resolve_or_create_client_for_prospect(
  p_prospect_id uuid,
  p_sold_plate  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE p record; v_client_id uuid; v_phone10 text; v_plate_norm text;
BEGIN
  -- Marcador transaccional (ver Cambio 2 en register_won_prospect): se limpia al entrar para
  -- que un llamado anterior en la misma transaccion nunca deje un rastro que otro llamado
  -- lea por error. Solo se vuelve a fijar mas abajo, y solo cuando esta funcion realmente
  -- INSERTA un cliente nuevo.
  PERFORM set_config('gac.client_just_created', '', true);

  SELECT * INTO p FROM public.prospects WHERE id = p_prospect_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'prospect_not_found'; END IF;
  IF p.client_id IS NOT NULL THEN RETURN p.client_id; END IF;      -- 0) idempotent fast path

  -- 1) PLACA -- criterio mas fuerte: es literalmente el vehiculo facturado. Case-insensitive
  --    y sin espacios en los extremos, mismo criterio que ya usa register_won_prospect en su
  --    propia comparacion de placa (upper(btrim(...))), aplicado a ambos lados aca porque
  --    esta funcion no controla como llego a estar guardado vehicles.plate. Si matchea, se
  --    usa ESE client_id directo -- cedula/telefono/email ni se evaluan.
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

  v_phone10 := right(regexp_replace(coalesce(p.phone,''), '\D', '', 'g'), 10);

  -- 2) cedula  3) phone (last 10 digits)  4) email — MIRRORS findExistingContact
  --    (kommo-api:593-604, CI-RIF -> phone -> email) so DB and Kommo agree on identity.
  --    p.cedula is currently always NULL on this path (see the ALTER TABLE comment above
  --    for prospects.cedula) so this branch cannot match here today; phone is the effective
  --    first key until a future change adds cedula capture to the prospect forms.
  --    ORDER BY created_at: when the 62/60 existing duplicates match, always bind to the
  --    OLDEST row so this path is deterministic and never mints a third duplicate.
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

  -- Name is DELIBERATELY NOT a dedup key: 7 duplicate full_names, free text, unsafe.
  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (full_name, cedula, phone, email, state, is_active)
    VALUES (coalesce(nullif(trim(p.name),''), 'Cliente'), nullif(trim(p.cedula),''),
            nullif(trim(p.phone),''), nullif(trim(p.email),''),
            nullif(trim(p."Estado de Vnzla"),''), true)
    RETURNING id INTO v_client_id;
    -- Marcador transaccional: register_won_prospect (Cambio 2) lo usa para decidir si este
    -- cliente es descartable en caso de resultar un duplicado vacio. is_local = true: dura
    -- solo lo que dure la transaccion actual (una llamada RPC = una transaccion).
    PERFORM set_config('gac.client_just_created', v_client_id::text, true);
  END IF;

  RETURN v_client_id;
END; $$;

-- Rolling 24h gate. Sin cambios -- se copia identica para que el CREATE OR REPLACE de arriba
-- no sea el unico bloque de esta seccion del archivo original.
-- (fn_claim_survey_slot no se toca; no se redefine aca a proposito.)

-- ============================================================================
-- Trigger BEFORE: ahora pasa NEW.sold_plate a fn_resolve_or_create_client_for_prospect. El
-- trigger en si (trg_link_client_on_won, BEFORE UPDATE OF status ... WHEN NEW.status =
-- 'ganado') no cambia -- solo la funcion que ejecuta.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.link_client_on_won()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF NEW.status = 'ganado' THEN
    NEW.client_id := public.fn_resolve_or_create_client_for_prospect(NEW.id, NEW.sold_plate);
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- CAMBIO 2 -- register_won_prospect: cuando la placa ya pertenece a OTRO cliente y el
-- usuario confirma "link_existing", el vehiculo se queda donde esta (con su dueno real) y es
-- el PROSPECTO (y su encuesta, si ya se creo una) el que se re-apunta a ese dueno real. Si el
-- cliente resuelto momentos antes por el trigger (v_client_id) resulta ser un duplicado vacio
-- creado en este mismo instante -- y en NINGUN caso si no lo es -- se borra.
--
-- Regenerada desde la definicion vigente en
-- 20260805120000_won_prospect_always_returns_row.sql. Unico cambio real: el bloque "Case 2"
-- adentro del loop de vehiculos. Todo lo demas (validacion, Case 1, Case 3, autorizacion, el
-- RETURN QUERY con LEFT JOIN LATERAL) se copia sin tocar una linea.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.register_won_prospect(p_prospect_id uuid, p_vehicles jsonb DEFAULT '[]'::jsonb, p_is_fleet boolean DEFAULT false)
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

  -- Authorization mirrors mark_survey_sent's role-gate LOGIC (20260720120000:206-210).
  -- Error codes in this migration's new functions are English snake_case (matching
  -- fn_resolve_or_create_client_for_prospect's own 'prospect_not_found' above and design.md's
  -- kommo-api error-code contract), not mark_survey_sent's older Spanish-sentence style.
  IF NOT (public.is_admin_user()
      OR (public.get_user_role() = 'concesionario' AND v_prospect.dealership_id = ANY(public.current_user_dealership_ids()))
      OR (public.get_user_role() = 'vendedor'      AND v_prospect.salesperson  = ANY(public.current_user_salesperson_names()))) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- "Plate Capture Remains Mandatory on UI-Driven Wins" / "Fleet win requires at least one
  -- plate" (prospect-to-client spec): enforced here too, not just client-side.
  IF p_vehicles IS NULL OR jsonb_typeof(p_vehicles) IS DISTINCT FROM 'array' OR jsonb_array_length(p_vehicles) = 0 THEN
    RAISE EXCEPTION 'at_least_one_vehicle_required';
  END IF;

  v_max_year := extract(year FROM now())::int + 2;

  -- Validation pass: every entry must carry plate + model_id + year, model_id must resolve to
  -- a real vehicle_models row, and year must be sane. All-or-nothing — nothing is written yet.
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

  -- Single UPDATE so the BEFORE trigger (client link) and the AFTER trigger (survey claim)
  -- both fire inside this one statement (design.md D2). status is set unconditionally, even
  -- when already 'ganado' (the "Falta placa" backfill re-invocation): the AFTER trigger's own
  -- WHEN clause (OLD.status IS DISTINCT FROM NEW.status) then correctly skips re-creating the
  -- survey, while this function backfills vehicle_id on the existing row below instead.
  UPDATE public.prospects
     SET status = 'ganado', sold_plate = v_first_plate, is_fleet = p_is_fleet
   WHERE id = p_prospect_id
  RETURNING prospects.client_id INTO v_client_id;

  -- vehicles: one row per validated entry, all under the resolved client. Idempotent: a plate
  -- already registered to this client (from an earlier call, or an earlier entry in this same
  -- array) is skipped rather than duplicated.
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_vehicles) LOOP
    v_plate    := upper(btrim(v_entry->>'plate'));
    v_model_id := (v_entry->>'model_id')::uuid;
    v_year     := (v_entry->>'year')::int;

    -- Case 1: already this client's vehicle. Idempotent dedup, unchanged.
    IF EXISTS (
      SELECT 1 FROM public.vehicles
      WHERE vehicles.client_id = v_client_id AND upper(vehicles.plate) = v_plate
    ) THEN
      CONTINUE;
    END IF;

    -- Case 2: the plate exists, but under ANOTHER client.
    --
    -- `vehicles.plate` carries a global UNIQUE index, so the INSERT below used to hit
    -- 23505 and abort the ENTIRE win with a raw Postgres error — the salesperson lost the
    -- sale registration over a plate typo or a car that had previously come in for
    -- service. Two such plates already exist in production.
    --
    -- Now it is an explicit decision. `link_existing` is set by the UI only after showing
    -- the user who currently owns that vehicle, so ownership never moves silently.
    -- Columns MUST be qualified: this function RETURNS TABLE(client_id uuid, ...), so the
    -- bare name resolves to the OUT parameter and Postgres raises 42702 (ambiguous). Same
    -- trap that broke this function once before.
    SELECT vehicles.id, vehicles.client_id INTO v_existing_id, v_existing_client
      FROM public.vehicles WHERE upper(vehicles.plate) = v_plate LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      IF coalesce((v_entry->>'link_existing')::boolean, false) THEN
        -- 2026-08-31 FIX (duplicate-client bug). Used to UPDATE vehicles SET client_id =
        -- v_client_id here — transferring the vehicle TO the client the trigger just
        -- resolved/created moments ago by cedula/phone/email (which never looks at the
        -- plate). That is backwards: v_existing_client is the REAL owner of this exact
        -- plate — typically the client created at invoicing time, which is precisely why
        -- the plate was already registered — so it is v_client_id that is likely the
        -- duplicate here, not v_existing_client. v_existing_client can never equal
        -- v_client_id at this point: Case 1 above already caught and CONTINUE'd that.
        --
        -- The vehicle now stays exactly where it is. Instead:
        --   - THIS prospect gets re-pointed at the real owner.
        --   - Its satisfaction survey, if the AFTER trigger already created one on the
        --     UPDATE above (client_id = v_client_id, the wrong one at INSERT time — the
        --     plate is only known once this loop runs, after that trigger already fired),
        --     gets re-pointed too, so delivery lands on the right client.
        --   - v_client_id itself is swapped to the real owner for the REST of this call —
        --     remaining fleet entries and the row finally returned to the caller.
        --   - v_client_id (the old, likely-wrong value) is deleted ONLY if it was created
        --     by THIS EXACT call (via the transaction-local marker
        --     fn_resolve_or_create_client_for_prospect sets right after its own INSERT —
        --     never inferred from timing or row counts) AND it carries no other real data
        --     of any kind. A client that already existed before this call (matched by
        --     phone/cedula/email to someone with real history, or already assigned to this
        --     prospect from a previous attempt) is NEVER a candidate for deletion, full
        --     stop — this function does not even check its data in that case. Any doubt on
        --     the "no other data" side also means no delete: prefer an unresolved possible
        --     duplicate over losing a real client.
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
          -- vehicles.client_id is ON DELETE CASCADE (would delete real vehicles), so the
          -- vehicles check above is not optional — it is the difference between deleting an
          -- empty row and cascading into real fleet data.
          DELETE FROM public.clients WHERE clients.id = v_dup_client_id;
        END IF;

        -- Vehicle keeps its real owner and never changes hands. Refresh only the commercial
        -- data the salesperson just entered for this sale (model/year, and the
        -- warranty/is_manual pair derived from it) — matches what the dialog's checkbox
        -- copy already promises ("... con el modelo y el año de abajo"). client_id and any
        -- existing driver_id are left untouched on purpose: ownership does not move anymore.
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
      -- Not authorized to link: fail with a message the UI can translate, never a raw
      -- constraint violation.
      RAISE EXCEPTION 'plate_belongs_to_another_client: %', v_plate;
    END IF;

    -- Case 3: brand-new plate.
    INSERT INTO public.vehicles (client_id, model_id, year, plate, mileage, purchase_date, warranty_active, is_active, is_manual)
    VALUES (v_client_id, v_model_id, v_year, v_plate, 0, current_date,
            NOT coalesce((SELECT vm.is_manual FROM public.vehicle_models vm WHERE vm.id = v_model_id), false),
            true,
            coalesce((SELECT vm.is_manual FROM public.vehicle_models vm WHERE vm.id = v_model_id), false))
    RETURNING id INTO v_vehicle_id;
    v_created := v_created + 1;
    IF v_first_vehicle IS NULL THEN v_first_vehicle := v_vehicle_id; END IF;
  END LOOP;
  -- No "zero created" guard here (unlike register_client_repurchase): this RPC's primary
  -- job is confirming the win (client resolution + survey claim), which must still succeed
  -- idempotently on a retry that reuses already-registered plates.

  -- Stamp vehicle_id on this prospect's survey if it does not have one yet — covers both
  -- the fresh-insert case (the AFTER trigger above just created it with vehicle_id NULL)
  -- and the "Falta placa" backfill case (an older no-plate survey row already exists, e.g.
  -- created by the Kommo webhook path per design.md section 4).
  IF v_first_vehicle IS NOT NULL THEN
    UPDATE public.satisfaction_surveys s
       SET vehicle_id = v_first_vehicle
     WHERE s.prospect_id = p_prospect_id AND s.vehicle_id IS NULL;
  END IF;

  -- Exactly UNA fila, SIEMPRE. Antes esto era un SELECT directo sobre satisfaction_surveys
  -- con LIMIT 1: sin encuesta no devolvia filas, la funcion terminaba vacia y la UI daba la
  -- venta por fallida aunque todo lo de arriba ya estuviera escrito. El LEFT JOIN LATERAL
  -- contra un ancla de una fila garantiza la fila de salida y deja los campos de encuesta en
  -- NULL cuando no hay ninguna. Los consumidores ya toleran survey_id NULL: el dialogo solo
  -- intenta el envio cuando row.survey_id existe (WonProspectDialog.tsx:345).
  --
  -- Los nombres van calificados con surv.: la funcion es RETURNS TABLE(client_id, ...,
  -- suppressed_reason, ...), asi que un nombre desnudo resuelve al parametro OUT y Postgres
  -- levanta 42702. Es la misma trampa que ya rompio esta funcion antes.
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
