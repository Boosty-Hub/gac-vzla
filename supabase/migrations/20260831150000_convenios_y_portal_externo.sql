-- Administración de Convenios (clients.external_source) y del Portal Mi Flota (2026-08-31)
--
-- CONTEXTO. `clients.external_source` es texto libre desde 20260811130000_external_source.sql,
-- ya normalizado por trigger (trim + espacios colapsados) y ya listado por `external_sources()`.
-- Hoy no hay UI para renombrar ni borrar un convenio: solo se podía tocar por SQL. Tampoco hay
-- forma de apagar el Portal Mi Flota (`external_portal_login`, lanzado en 20260811150000)
-- sin editar código, ni de ver desde el panel qué sesiones o intentos fallidos tiene.
--
-- DECISIONES QUE IMPORTAN
--
-- 1. Convenios NO es un módulo nuevo. No se crean permisos `convenios.*`: la pantalla vive
--    dentro del dominio de Clientes y se gatea con `clientes.view/edit/delete`, igual que la
--    pestaña de clientes externos de AdminClientes. `clientes.edit` gatea el renombrado
--    (es un UPDATE masivo sobre `clients`) y `clientes.delete` gatea el borrado del convenio
--    (deja `external_source = NULL`, la acción semánticamente equivalente a "eliminarlo").
--
-- 2. Renombrar A -> B cuando B ya existe LOGRA el merge solo. No hace falta una acción de
--    "fusionar" separada: es el mismo UPDATE, cambia a cuántas filas les toca el nuevo valor.
--
-- 3. Portal Mi Flota SÍ es un módulo nuevo (`portal_externo`), porque es una pantalla de
--    seguridad (prender/apagar el acceso público, cerrar sesiones ajenas) y no una vista de
--    datos de Clientes. Se le asignan sus 4 permisos SOLO a superadmin/admin por defecto,
--    mismo criterio que encuestas.view en 20260831140000: entra por defecto a los roles de
--    mando y nadie más, porque el resto no la va a ver de todos modos (la ruta ya vive bajo
--    /admin/configuracion, reservada a esos dos roles).
--
-- 4. El interruptor usa `integration_configs` (integration_name = 'external_portal'), el
--    mismo mecanismo genérico que ya usa 'kommo'. Arranca `is_active = true` para no apagar
--    en caliente un portal que ya está en producción.
--
-- 5. `external_portal_sessions` y `external_portal_attempts` NO tienen policies (a propósito,
--    ver 20260811150000): sin eso, ni siquiera un superadmin puede leerlas por PostgREST. Se
--    agregan funciones SECURITY DEFINER propias para el panel, en vez de abrir policies nuevas
--    sobre esas tablas.
--
-- 6. `external_portal_admin_sessions()` NO devuelve el token de sesión en texto plano: devuelve
--    `md5(token)` como `session_key`. El token real es la credencial completa de acceso del
--    cliente externo (es el primary key de la tabla, no hay session id separado); mandarlo tal
--    cual a la respuesta HTTP de un listado sería exponer una credencial válida por network
--    logs/DevTools sin necesidad — el hash alcanza para identificar la fila y cerrarla.
--
-- 7. Cerrar una sesión hace `expires_at = now()` en vez de borrar la fila. Es lo que ya evalúa
--    `external_portal_client()` (`expires_at > now()`), así que corta el acceso al instante, y
--    conserva el registro para el propio listado de auditoría en vez de hacerlo desaparecer.

-- =============================================================================================
-- 1) Permisos del módulo Portal Mi Flota
-- =============================================================================================
INSERT INTO public.permissions (name, module, description) VALUES
  ('portal_externo.view',   'portal_externo', 'Ver el estado del Portal Mi Flota, sus sesiones activas e intentos fallidos'),
  ('portal_externo.create', 'portal_externo', 'Reservado para uso futuro del módulo Portal Mi Flota'),
  ('portal_externo.edit',   'portal_externo', 'Prender/apagar el Portal Mi Flota y cerrar sesiones de clientes externos'),
  ('portal_externo.delete', 'portal_externo', 'Reservado para uso futuro del módulo Portal Mi Flota')
ON CONFLICT (name) DO NOTHING;

-- Solo superadmin/admin lo tienen por defecto: es una pantalla de seguridad, no de operación
-- diaria (mismo criterio que encuestas.view en 20260831140000_encuestas_view_permission.sql).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM public.roles r
  CROSS JOIN public.permissions p
 WHERE r.name IN ('superadmin', 'admin')
   AND p.module = 'portal_externo'
ON CONFLICT DO NOTHING;

-- =============================================================================================
-- 2) Interruptor del portal en integration_configs (mismo mecanismo que 'kommo')
-- =============================================================================================
INSERT INTO public.integration_configs (integration_name, is_active, config)
VALUES ('external_portal', true, '{}'::jsonb)
ON CONFLICT (integration_name) DO NOTHING;

-- =============================================================================================
-- 3) RPCs de administración del Portal Mi Flota (todas SECURITY DEFINER: las tablas que tocan
--    no tienen policies para 'authenticated', a propósito, ver punto 5 del encabezado)
-- =============================================================================================

-- Prender/apagar el portal. Gatea con portal_externo.edit, no solo is_admin_user(), para que
-- el permiso que se ve en Configuración -> Roles sea real (mismo motivo que dejó el módulo
-- Eventos: "otorgar el permiso desde el panel no servía de nada" — ver 20260826120000).
CREATE OR REPLACE FUNCTION public.set_external_portal_enabled(p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (public.is_admin_user() OR public.has_permission('portal_externo.edit')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'enabled_requerido';
  END IF;

  UPDATE public.integration_configs
     SET is_active  = p_enabled,
         updated_at = now()
   WHERE integration_name = 'external_portal';

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_external_portal_enabled(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_external_portal_enabled(boolean) TO authenticated;

-- Sesiones vigentes, con el cliente resuelto. Ver punto 6: session_key es un hash, no el token.
CREATE OR REPLACE FUNCTION public.external_portal_admin_sessions()
RETURNS TABLE(
  session_key text, client_id uuid, client_name text,
  created_at timestamptz, expires_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (public.is_admin_user() OR public.has_permission('portal_externo.view')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT md5(s.token), s.client_id, c.full_name, s.created_at, s.expires_at
  FROM public.external_portal_sessions s
  JOIN public.clients c ON c.id = s.client_id
  WHERE s.expires_at > now()
  ORDER BY s.expires_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.external_portal_admin_sessions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.external_portal_admin_sessions() TO authenticated;

-- Cierra una sesión por su session_key (el hash de arriba). Ver punto 7: no borra la fila.
CREATE OR REPLACE FUNCTION public.external_portal_close_session(p_session_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_found boolean;
BEGIN
  IF NOT (public.is_admin_user() OR public.has_permission('portal_externo.edit')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.external_portal_sessions
     SET expires_at = now()
   WHERE md5(token) = p_session_key
     AND expires_at > now();

  GET DIAGNOSTICS v_found = ROW_COUNT;
  RETURN v_found;
END;
$function$;

REVOKE ALL ON FUNCTION public.external_portal_close_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.external_portal_close_session(text) TO authenticated;

-- Intentos fallidos recientes (freno de fuerza bruta), para verlos desde el panel.
CREATE OR REPLACE FUNCTION public.external_portal_admin_attempts(p_limit integer DEFAULT 50)
RETURNS TABLE(id bigint, plate text, attempted_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (public.is_admin_user() OR public.has_permission('portal_externo.view')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT a.id, a.plate, a.attempted_at
  FROM public.external_portal_attempts a
  ORDER BY a.attempted_at DESC
  LIMIT greatest(coalesce(p_limit, 50), 1);
END;
$function$;

REVOKE ALL ON FUNCTION public.external_portal_admin_attempts(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.external_portal_admin_attempts(integer) TO authenticated;

-- =============================================================================================
-- 4) external_portal_login: se agrega el chequeo del interruptor AL PRINCIPIO. El resto de la
--    función es EXACTAMENTE la de 20260811150000_external_portal.sql — mismo freno de fuerza
--    bruta, mismo `right(...,10)` para comparar teléfonos, mismo `RETURN QUERY` fila-a-fila en
--    vez de RAISE (para no revertir el INSERT del intento fallido en los demás casos).
--    No cuenta como intento fallido: es un apagado general, no una placa/teléfono incorrectos.
-- =============================================================================================
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
  v_enabled   boolean;
BEGIN
  SELECT ic.is_active INTO v_enabled
    FROM public.integration_configs ic
   WHERE ic.integration_name = 'external_portal';

  IF NOT coalesce(v_enabled, false) THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::timestamptz, 'portal_deshabilitado'::text;
    RETURN;
  END IF;

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

REVOKE ALL ON FUNCTION public.external_portal_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.external_portal_login(text, text) TO anon, authenticated;

-- =============================================================================================
-- 5) RPCs de administración de Convenios (renombrar = merge automático, borrar = desvincular)
--    Gateadas con los permisos de Clientes que YA EXISTEN. No se crea permiso `convenios.*`.
-- =============================================================================================

-- Renombra un convenio en TODOS los clientes que lo tengan, en una sola transacción. Si
-- p_new ya es el nombre de otro convenio existente, esto ES el merge: ambos grupos de
-- clientes quedan bajo el mismo texto. No hace falta una acción separada de "fusionar".
CREATE OR REPLACE FUNCTION public.rename_external_source(p_old text, p_new text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old   text := public.normalize_external_source(p_old);
  v_new   text := public.normalize_external_source(p_new);
  v_count integer;
BEGIN
  IF NOT (public.is_admin_user() OR public.has_permission('clientes.edit')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_old IS NULL THEN
    RAISE EXCEPTION 'convenio_origen_requerido';
  END IF;

  IF v_new IS NULL THEN
    RAISE EXCEPTION 'convenio_nuevo_requerido';
  END IF;

  UPDATE public.clients
     SET external_source = v_new
   WHERE is_manual AND external_source = v_old;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.rename_external_source(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rename_external_source(text, text) TO authenticated;

-- "Borra" un convenio: deja external_source = NULL en los clientes que lo tenían. No borra
-- clientes ni los desmarca como externos (is_manual no se toca), solo pierden la etiqueta.
CREATE OR REPLACE FUNCTION public.delete_external_source(p_source text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_source text := public.normalize_external_source(p_source);
  v_count  integer;
BEGIN
  IF NOT (public.is_admin_user() OR public.has_permission('clientes.delete')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_source IS NULL THEN
    RAISE EXCEPTION 'convenio_requerido';
  END IF;

  UPDATE public.clients
     SET external_source = NULL
   WHERE is_manual AND external_source = v_source;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_external_source(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_external_source(text) TO authenticated;
