-- Portal del cliente externo: entra con su placa y ve su flota y su historial.
--
-- POR QUE PLACA + TELEFONO, Y NO SOLO PLACA
-- La placa esta a la vista en la calle. Cualquiera que le saque una foto a un auto la tiene.
-- El propio proyecto ya tomo esa decision: `lookup_vehicle_by_plate` (la que usa /reservar)
-- devuelve el nombre ENMASCARADO — "Manuel Robles" sale como "Manuel R." — justamente para
-- que la placa sola no identifique a nadie. Abrir la flota y el historial de servicio con
-- solo la placa romperia esa decision.
-- El telefono es el segundo dato que el mostrador ya toma, asi que no agrega friccion real.
--
-- SOLO CLIENTES EXTERNOS (`clients.is_manual`)
-- Los clientes propios ya tienen portal con sesion real via magic link. Extender el acceso
-- por placa+telefono a los 1445 clientes propios es una decision de privacidad del negocio,
-- no una consecuencia tecnica de este requerimiento. Si GAC lo quiere para todos, se cae la
-- condicion `c.is_manual` de `external_portal_login` y listo.
--
-- RESERVAR NO SE REIMPLEMENTA: `create_public_reservation(p_plate, ...)` ya existe, ya es
-- publica por placa y ya funciona para vehiculos externos. El portal enlaza a /reservar en
-- vez de duplicar la logica de capacidad y horarios.

-- ---------------------------------------------------------------------------------------
-- Sesiones. Sin policies a proposito: RLS activo y cero policies = nadie llega por PostgREST,
-- solo las funciones SECURITY DEFINER de abajo.
-- ---------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.external_portal_sessions (
  token        text PRIMARY KEY DEFAULT encode(gen_random_bytes(32), 'hex'),
  client_id    uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '8 hours'
);

ALTER TABLE public.external_portal_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_external_portal_sessions_expires
  ON public.external_portal_sessions (expires_at);

-- ---------------------------------------------------------------------------------------
-- Intentos fallidos por placa. Es el freno de fuerza bruta: sin esto, alguien con la placa
-- prueba telefonos hasta entrar, y los moviles venezolanos tienen un espacio chico.
-- ---------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.external_portal_attempts (
  id           bigserial PRIMARY KEY,
  plate        text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.external_portal_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_external_portal_attempts_plate
  ON public.external_portal_attempts (plate, attempted_at DESC);

-- ---------------------------------------------------------------------------------------
-- Resuelve el cliente de una sesion vigente. Interna: NO se le da GRANT a anon, solo la
-- usan las funciones de abajo. Si se expusiera, seria un oraculo para validar tokens.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.external_portal_client(p_token text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT s.client_id
  FROM public.external_portal_sessions s
  WHERE s.token = p_token AND s.expires_at > now()
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.external_portal_client(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- Login. Devuelve un token de sesion cuando la placa y el telefono coinciden.
-- ---------------------------------------------------------------------------------------
-- `CREATE OR REPLACE` no puede cambiar el tipo de retorno de una funcion existente, y dejar
-- dos firmas haria que PostgREST responda PGRST203 por ambiguedad. Se suelta primero.
DROP FUNCTION IF EXISTS public.external_portal_login(text, text);

-- NO usa RAISE para rechazar, y esa es la parte importante: `RAISE EXCEPTION` aborta la
-- transaccion y REVIERTE el `INSERT` del intento fallido, con lo cual el contador nunca sube
-- y el freno de fuerza bruta queda de adorno. Se probo: con RAISE, el sexto intento entraba.
-- Por eso devuelve siempre UNA fila con `error_code`, y el frontend traduce.
CREATE OR REPLACE FUNCTION public.external_portal_login(p_plate text, p_phone text)
RETURNS TABLE(token text, client_name text, expires_at timestamptz, error_code text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_plate     text := upper(btrim(coalesce(p_plate, '')));
  -- Ultimos 10 digitos: "04122846405" y "+584122846405" son el mismo numero. Comparar el
  -- texto crudo haria fallar a la mitad de la base segun como se haya cargado.
  v_digits    text := right(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 10);
  v_client_id uuid;
  v_name      text;
  v_fails     integer;
  v_token     text;
  v_expires   timestamptz;
BEGIN
  IF v_plate = '' OR length(v_digits) < 10 THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::timestamptz, 'datos_incompletos'::text;
    RETURN;
  END IF;

  SELECT count(*) INTO v_fails
  FROM public.external_portal_attempts a
  WHERE a.plate = v_plate AND a.attempted_at > now() - interval '15 minutes';

  IF v_fails >= 5 THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::timestamptz, 'demasiados_intentos'::text;
    RETURN;
  END IF;

  SELECT c.id, c.full_name INTO v_client_id, v_name
  FROM public.vehicles v
  JOIN public.clients c ON c.id = v.client_id
  WHERE upper(v.plate) = v_plate
    AND v.is_active
    AND c.is_active
    -- Solo externos: ver el encabezado. Los propios entran por magic link.
    AND c.is_manual
    AND right(regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g'), 10) = v_digits
  LIMIT 1;

  IF v_client_id IS NULL THEN
    INSERT INTO public.external_portal_attempts (plate) VALUES (v_plate);
    -- MISMO codigo si la placa no existe, si no es de un externo o si el telefono no
    -- coincide. Distinguirlos le confirmaria a un desconocido que placas estan cargadas.
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::timestamptz, 'no_encontrado'::text;
    RETURN;
  END IF;

  -- Higiene barata, aprovechando que ya estamos escribiendo. Las columnas van calificadas:
  -- `expires_at` es tambien un parametro OUT de esta funcion y sin el alias Postgres corta
  -- con "column reference is ambiguous".
  DELETE FROM public.external_portal_sessions s WHERE s.expires_at < now() - interval '1 day';
  DELETE FROM public.external_portal_attempts a WHERE a.attempted_at < now() - interval '1 day';

  INSERT INTO public.external_portal_sessions (client_id)
  VALUES (v_client_id)
  RETURNING external_portal_sessions.token, external_portal_sessions.expires_at
  INTO v_token, v_expires;

  RETURN QUERY SELECT v_token, v_name, v_expires, NULL::text;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.external_portal_login(text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- La flota del cliente de la sesion.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.external_portal_fleet(p_token text)
RETURNS TABLE(
  vehicle_id uuid, plate text, year integer, color text, mileage integer,
  model_name text, model_brand text, warranty_active boolean,
  last_service_date date, services_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    v.id, v.plate, v.year, v.color, v.mileage,
    m.name, m.brand, v.warranty_active,
    (SELECT max(r.reservation_date) FROM public.reservations r
      WHERE r.vehicle_id = v.id AND r.status = 'completada'),
    (SELECT count(*) FROM public.reservations r WHERE r.vehicle_id = v.id)
  FROM public.vehicles v
  JOIN public.vehicle_models m ON m.id = v.model_id
  WHERE v.is_active
    AND v.client_id = public.external_portal_client(p_token)
    -- Sin sesion vigente `external_portal_client` devuelve NULL y `= NULL` no matchea
    -- ninguna fila: no hace falta un IF, pero se deja explicito para que se lea.
    AND public.external_portal_client(p_token) IS NOT NULL
  ORDER BY v.plate;
$function$;

GRANT EXECUTE ON FUNCTION public.external_portal_fleet(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- Historial de servicio de UNO de sus vehiculos. El vehiculo se valida contra el cliente de
-- la sesion: mandar el id de un vehiculo ajeno no devuelve nada.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.external_portal_history(p_token text, p_vehicle_id uuid)
RETURNS TABLE(
  reservation_date date, reservation_time time, service_type text, status text,
  current_mileage integer, service_notes text, dealership_name text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    r.reservation_date, r.reservation_time, r.service_type, r.status,
    r.current_mileage, r.service_notes, d.name
  FROM public.reservations r
  JOIN public.vehicles d2 ON d2.id = r.vehicle_id
  LEFT JOIN public.dealerships d ON d.id = r.dealership_id
  WHERE r.vehicle_id = p_vehicle_id
    AND d2.client_id = public.external_portal_client(p_token)
    AND public.external_portal_client(p_token) IS NOT NULL
  ORDER BY r.reservation_date DESC, r.reservation_time DESC
  LIMIT 100;
$function$;

GRANT EXECUTE ON FUNCTION public.external_portal_history(text, uuid) TO anon, authenticated;

COMMENT ON TABLE public.external_portal_sessions IS
  'Sesiones del portal del cliente externo (placa + telefono). RLS activo sin policies: solo '
  'las funciones SECURITY DEFINER entran. Ver 20260811150000.';
COMMENT ON TABLE public.external_portal_attempts IS
  'Intentos fallidos de login por placa. Freno de fuerza bruta: la placa es publica y el '
  'telefono es el unico secreto. Ver 20260811150000.';
