-- Fase 2B — Parte 1 (ADITIVA, no disruptiva): helpers de scoping + RPCs.
--
-- Esta parte NO cambia ninguna politica existente, asi que es segura de aplicar
-- ANTES de desplegar el frontend. Crea las funciones que el frontend nuevo usara
-- y que las politicas de la Parte 2 (restrictiva) necesitan.
--
-- Orden de deploy seguro:
--   1) Aplicar esta Parte 1 (ahora).            <- no rompe nada
--   2) Desplegar el frontend nuevo (usa RPCs).  <- RPCs ya existen
--   3) Aplicar la Parte 2 (politicas).          <- frontend ya no hace queries directas

-- ============================================================================
-- HELPERS DE SCOPING (para usar dentro de las politicas RLS de la Parte 2)
-- ============================================================================

-- IDs de concesionarios del usuario (concesionario / vendedor / asesor).
CREATE OR REPLACE FUNCTION public.current_user_dealership_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT coalesce(array_agg(dealership_id), ARRAY[]::uuid[])
  FROM public.dealership_users WHERE profile_id = auth.uid();
$$;

-- Nombres de vendedor del usuario: salespersons.name (gestionado por admin) UNION
-- profiles.full_name (congelado por el trigger, ver abajo). Ambas claves son
-- NO editables por el usuario final, evitando impersonacion via cambio de nombre.
CREATE OR REPLACE FUNCTION public.current_user_salesperson_names()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT coalesce(array_agg(DISTINCT n), ARRAY[]::text[]) FROM (
    SELECT s.name AS n FROM public.salespersons s
      WHERE s.profile_id = auth.uid() AND s.is_active
    UNION
    SELECT p.full_name FROM public.profiles p
      WHERE p.id = auth.uid() AND p.full_name IS NOT NULL
  ) x;
$$;

-- client_ids del usuario (portal cliente, via client_users).
CREATE OR REPLACE FUNCTION public.current_user_client_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT coalesce(array_agg(client_id), ARRAY[]::uuid[])
  FROM public.client_users WHERE profile_id = auth.uid();
$$;

-- ¿el usuario puede acceder a este prospecto? (para prospect_updates/vehicles/events)
CREATE OR REPLACE FUNCTION public.can_access_prospect(p_prospect_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT public.is_admin_user() OR EXISTS (
    SELECT 1 FROM public.prospects pr
    WHERE pr.id = p_prospect_id AND (
      (public.get_user_role() = 'concesionario'
        AND pr.dealership_id = ANY(public.current_user_dealership_ids()))
      OR (public.get_user_role() = 'vendedor'
        AND pr.salesperson = ANY(public.current_user_salesperson_names()))
    )
  );
$$;

-- ============================================================================
-- RPCs LLAMADAS DESDE EL FRONTEND
-- ============================================================================

-- Busqueda publica por placa: NO expone telefono/email del titular a anon.
-- Devuelve datos del vehiculo + ids internos para agendar + nombre enmascarado
-- (solo para confirmar visualmente "es tu vehiculo").
CREATE OR REPLACE FUNCTION public.lookup_vehicle_by_plate(p_plate text)
RETURNS TABLE (
  vehicle_id uuid, plate text, year int, color text, mileage int,
  warranty_active boolean, model_name text, model_brand text,
  client_id uuid, client_masked_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT
    v.id, v.plate, v.year, v.color, v.mileage, v.warranty_active,
    m.name, m.brand, v.client_id,
    -- "Manuel Robles" -> "Manuel R." ; una sola palabra queda igual.
    CASE WHEN position(' ' in c.full_name) > 0
      THEN regexp_replace(c.full_name, '^(\S+)\s+(\S).*$', '\1 \2.')
      ELSE c.full_name END
  FROM public.vehicles v
  JOIN public.vehicle_models m ON m.id = v.model_id
  LEFT JOIN public.clients c ON c.id = v.client_id
  WHERE upper(v.plate) = upper(trim(p_plate)) AND v.is_active
  LIMIT 1;
$$;

-- Horas ocupadas de un concesionario en una fecha (para el calendario).
-- No expone ningun dato de clientes, solo las horas tomadas.
CREATE OR REPLACE FUNCTION public.get_taken_reservation_times(p_dealership_id uuid, p_date date)
RETURNS TABLE (reservation_time time)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT r.reservation_time FROM public.reservations r
  WHERE r.dealership_id = p_dealership_id
    AND r.reservation_date = p_date
    AND r.status <> 'cancelada';
$$;

-- Alta publica de reserva (server-side). Resuelve vehiculo/cliente por placa,
-- fuerza status='pendiente', valida el concesionario. Anon nunca fija client_id
-- ni status arbitrarios. Devuelve el id de la reserva creada.
CREATE OR REPLACE FUNCTION public.create_public_reservation(
  p_plate text, p_dealership_id uuid, p_service_type text,
  p_date date, p_time time, p_mileage int, p_notes text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_vehicle_id uuid; v_client_id uuid; v_client_name text; v_res_id uuid;
BEGIN
  SELECT v.id, v.client_id, c.full_name INTO v_vehicle_id, v_client_id, v_client_name
  FROM public.vehicles v LEFT JOIN public.clients c ON c.id = v.client_id
  WHERE upper(v.plate) = upper(trim(p_plate)) AND v.is_active
  LIMIT 1;
  IF v_vehicle_id IS NULL THEN RAISE EXCEPTION 'Vehiculo no encontrado'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.dealerships WHERE id = p_dealership_id AND is_active) THEN
    RAISE EXCEPTION 'Concesionario invalido';
  END IF;

  INSERT INTO public.reservations (
    dealership_id, client_id, vehicle_id, reservation_date, reservation_time,
    service_type, current_mileage, status, notes, created_by_name, created_by_role
  ) VALUES (
    p_dealership_id, v_client_id, v_vehicle_id, p_date, p_time,
    p_service_type, coalesce(p_mileage, 0), 'pendiente', nullif(trim(p_notes), ''),
    coalesce(v_client_name, 'Cliente'), 'Cliente'
  ) RETURNING id INTO v_res_id;

  RETURN v_res_id;
END;
$$;

-- Dedupe de telefono para el landing publico: SOLO boolean, sin PII.
CREATE OR REPLACE FUNCTION public.prospect_phone_exists(p_phone text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.prospects
    WHERE regexp_replace(coalesce(phone,''), '\D', '', 'g') =
          regexp_replace(coalesce(p_phone,''), '\D', '', 'g')
      AND regexp_replace(coalesce(p_phone,''), '\D', '', 'g') <> ''
  );
$$;

-- Dedupe para staff: devuelve matches SOLO dentro del scope del llamante.
CREATE OR REPLACE FUNCTION public.find_prospects_by_phone(p_phone text)
RETURNS TABLE (id uuid, name text, phone text, salesperson text, dealership_id uuid, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT pr.id, pr.name, pr.phone, pr.salesperson, pr.dealership_id, pr.status
  FROM public.prospects pr
  WHERE regexp_replace(coalesce(pr.phone,''), '\D', '', 'g') =
        regexp_replace(coalesce(p_phone,''), '\D', '', 'g')
    AND regexp_replace(coalesce(p_phone,''), '\D', '', 'g') <> ''
    AND (
      public.is_admin_user()
      OR pr.dealership_id = ANY(public.current_user_dealership_ids())
      OR pr.salesperson = ANY(public.current_user_salesperson_names())
    );
$$;

-- Fan-out de notificaciones al cancelar el cliente su reserva (server-side).
-- Reemplaza el INSERT multi-fila directo (que la RLS bloquearia). Verifica que
-- el llamante sea dueno de la reserva.
CREATE OR REPLACE FUNCTION public.notify_reservation_cancellation(p_reservation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_res record; v_client_name text; v_title text := 'Cita Cancelada por Cliente'; v_msg text;
BEGIN
  SELECT r.id, r.client_id, r.dealership_id, r.service_type, r.reservation_date,
         r.reservation_time, d.name AS dealership_name
  INTO v_res
  FROM public.reservations r LEFT JOIN public.dealerships d ON d.id = r.dealership_id
  WHERE r.id = p_reservation_id;
  IF v_res.id IS NULL THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;

  IF NOT (public.is_admin_user() OR v_res.client_id = ANY(public.current_user_client_ids())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT full_name INTO v_client_name FROM public.clients WHERE id = v_res.client_id;
  v_msg := coalesce(v_client_name, 'Cliente') || ' cancelo su cita de ' || v_res.service_type
    || ' para el ' || v_res.reservation_date || ' a las ' || to_char(v_res.reservation_time, 'HH24:MI')
    || '. Concesionario: ' || coalesce(v_res.dealership_name, 'N/A') || '.';

  INSERT INTO public.notifications (recipient_profile_id, type, title, message, metadata)
  SELECT p.id, 'cancelacion', v_title, v_msg, jsonb_build_object('reservation_id', p_reservation_id)
  FROM public.profiles p JOIN public.roles r ON r.id = p.role_id
  WHERE r.name IN ('superadmin', 'admin');

  IF v_res.dealership_id IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_dealership_id, type, title, message, metadata)
    VALUES (v_res.dealership_id, 'cancelacion', v_title, v_msg,
            jsonb_build_object('reservation_id', p_reservation_id));
  END IF;
END;
$$;

-- ============================================================================
-- TRIGGER: congelar tambien full_name (es clave de scoping de vendedor).
-- Reemplaza la funcion de la Fase 2A agregando full_name. No hay flujo legitimo
-- donde un usuario final edite su propio full_name (solo signup/admin lo fijan).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_is_end_user boolean;
BEGIN
  v_is_end_user := (auth.role() = 'authenticated') AND NOT public.is_admin_user();
  IF v_is_end_user THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.role_id   := OLD.role_id;
      NEW.is_active := OLD.is_active;
      NEW.full_name := OLD.full_name;  -- clave de autorizacion: no editable por el usuario
    ELSIF TG_OP = 'INSERT' THEN
      NEW.role_id := (SELECT id FROM public.roles WHERE name = 'cliente');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.lookup_vehicle_by_plate(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_taken_reservation_times(uuid, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_reservation(text, uuid, text, date, time, int, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prospect_phone_exists(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_prospects_by_phone(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_reservation_cancellation(uuid) TO authenticated;
-- Los helpers de scoping los usan las policies (SECURITY DEFINER); execute a authenticated es inocuo.
GRANT EXECUTE ON FUNCTION public.current_user_dealership_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_salesperson_names() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_client_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_prospect(uuid) TO authenticated;
