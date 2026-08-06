-- REQUERIMIENTO: "Hay clientes que existen en nuestra base de datos interna, pero no estan
-- en el sistema de gestion, por lo que no se puede realizar la vinculacion."
--
-- VALIDADO, y el cliente SI existe. Lo que falla es que el portal del concesionario no lo
-- encuentra. Son dos capas que se suman:
--
--  1. RLS. La politica `clients_select` solo deja ver, a los roles concesionario /
--     vendedor / Asesor de Servicio, los clientes que YA tienen una reserva en su propio
--     concesionario. Un cliente cargado por otro concesionario, por el admin o importado
--     es invisible para ellos.
--  2. La RPC que existia justamente para saltar esa restriccion,
--     `staff_search_clients_by_name` (20260710120000), busca UNICAMENTE por `full_name`.
--     Buscar por cedula o por telefono devuelve cero resultados aunque la fila exista.
--
-- Y de ahi sale el "no se puede vincular", en cadena: al no encontrarlo, el operador usa
-- "Ingresar manualmente" con esa misma cedula. `createOrReuseManualEntities` intenta
-- reusar el cliente con un SELECT directo — tambien ciego por RLS —, no ve nada, inserta,
-- y choca contra el indice unico `clients_cedula_key`. La recuperacion del 23505 vuelve a
-- consultar por SELECT directo, vuelve a no ver nada, y la reserva aborta.
--
-- ARREGLO: dos funciones SECURITY DEFINER, ambas gateadas al mismo conjunto de roles que
-- ya tenia la RPC anterior. No abren la base: hay que saber a quien se busca.
--   - `staff_search_clients`  busqueda por nombre, cedula O telefono (minimo 3 caracteres).
--   - `staff_resolve_client`  resolucion EXACTA por cedula/telefono, para el camino de
--                             reuso del ingreso manual.

-- ============================================================================
-- 1) Busqueda del operador: nombre, cedula o telefono.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.staff_search_clients(p_query text)
RETURNS TABLE(client_id uuid, full_name text, cedula text, phone text, is_manual boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH q AS (
    SELECT
      btrim(coalesce(p_query, '')) AS raw,
      -- Cedula: se comparan solo alfanumericos, para que "V-12.345.678", "v 12345678"
      -- y "V12345678" sean la misma busqueda. Asi esta guardada de forma inconsistente.
      upper(regexp_replace(btrim(coalesce(p_query, '')), '[^A-Za-z0-9]', '', 'g')) AS alnum,
      -- Telefono: solo digitos, mismo motivo (+58, 0412, espacios, guiones). Se compara
      -- por los ULTIMOS 10 digitos, que es el numero nacional sin el 0 ni el +58: en la
      -- base conviven "04122846405" y "+584122846405", que son el mismo telefono. Sin
      -- esto, buscar con el prefijo internacional no encontraba nada.
      right(regexp_replace(btrim(coalesce(p_query, '')), '[^0-9]', '', 'g'), 10) AS digits
  ),
  esc AS (
    -- El termino va dentro de un LIKE/ILIKE: `%` y `_` del usuario deben ser literales,
    -- no comodines. Sin esto, escribir "%" lista la base entera.
    SELECT q.*, replace(replace(replace(q.raw, '\', '\\'), '%', '\%'), '_', '\_') AS raw_like
    FROM q
  )
  SELECT c.id, c.full_name, c.cedula, c.phone, c.is_manual
  FROM public.clients c, esc
  WHERE length(esc.raw) >= 3
    AND (
      c.full_name ILIKE '%' || esc.raw_like || '%'
      -- Los umbrales por rama no son decorativos: si el termino no trae digitos,
      -- `digits` queda vacio y `telefono LIKE '%%'` haria match con TODA la tabla.
      OR (length(esc.alnum) >= 3
          AND upper(regexp_replace(coalesce(c.cedula, ''), '[^A-Za-z0-9]', '', 'g'))
              LIKE '%' || esc.alnum || '%')
      OR (length(esc.digits) >= 4
          AND right(regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g'), 10)
              LIKE '%' || esc.digits || '%')
    )
    AND (public.is_admin_user()
         OR public.get_user_role() IN ('concesionario', 'vendedor', 'Asesor de Servicio'))
  -- La coincidencia exacta de cedula primero: si el operador tecleo una cedula completa,
  -- ese es el cliente que busca, no un homonimo.
  ORDER BY
    (upper(regexp_replace(coalesce(c.cedula, ''), '[^A-Za-z0-9]', '', 'g')) = esc.alnum) DESC,
    c.full_name
  LIMIT 20;
$function$;

COMMENT ON FUNCTION public.staff_search_clients(text) IS
  'Busca clientes por nombre, cedula o telefono para el staff (concesionario/vendedor/'
  'Asesor de Servicio) saltando la restriccion de RLS que solo les muestra clientes con '
  'reserva propia. Reemplaza a staff_search_clients_by_name, que solo miraba full_name y '
  'por eso hacia imposible vincular un cliente buscandolo por cedula. Ver 20260806120000.';

GRANT EXECUTE ON FUNCTION public.staff_search_clients(text) TO authenticated;

-- ============================================================================
-- 2) Resolucion exacta para el camino de "Ingresar manualmente".
-- ============================================================================
-- Devuelve el id del cliente que ya existe con esa cedula o telefono, o NULL. La usa
-- `createOrReuseManualEntities` ANTES de insertar: sin esto el reuso es ciego bajo RLS y
-- termina en violacion del unique de cedula.
CREATE OR REPLACE FUNCTION public.staff_resolve_client(p_cedula text, p_phone text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH k AS (
    -- Misma normalizacion que hace el front antes de insertar (trim + upper + sin
    -- espacios internos). Si divergen, el reuso falla justo en el caso que importa.
    SELECT
      upper(regexp_replace(btrim(coalesce(p_cedula, '')), '\s', '', 'g')) AS ced,
      btrim(coalesce(p_phone, '')) AS tel
  )
  SELECT c.id
  FROM public.clients c, k
  WHERE (public.is_admin_user()
         OR public.get_user_role() IN ('concesionario', 'vendedor', 'Asesor de Servicio'))
    AND (
      (length(k.ced) > 0
       AND upper(regexp_replace(coalesce(c.cedula, ''), '\s', '', 'g')) = k.ced)
      -- Telefono por los ultimos 10 digitos (numero nacional): "04122846405" y
      -- "+584122846405" son la misma persona y antes se creaba un cliente duplicado.
      -- El minimo de 10 evita que un numero corto o incompleto agarre a cualquiera.
      OR (length(regexp_replace(k.tel, '[^0-9]', '', 'g')) >= 10
          AND right(regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g'), 10)
              = right(regexp_replace(k.tel, '[^0-9]', '', 'g'), 10))
    )
  -- La cedula manda sobre el telefono: cedula es UNIQUE en la tabla, el telefono no.
  ORDER BY (length(k.ced) > 0
            AND upper(regexp_replace(coalesce(c.cedula, ''), '\s', '', 'g')) = k.ced) DESC
  LIMIT 1;
$function$;

COMMENT ON FUNCTION public.staff_resolve_client(text, text) IS
  'Devuelve el id del cliente existente con esa cedula (o, en su defecto, telefono), o '
  'NULL. Existe porque el reuso por SELECT directo es ciego bajo RLS para el staff y '
  'terminaba en violacion de clients_cedula_key al ingresar manualmente. Ver 20260806120000.';

GRANT EXECUTE ON FUNCTION public.staff_resolve_client(text, text) TO authenticated;

-- ============================================================================
-- 3) Misma historia del lado del vehiculo.
-- ============================================================================
-- `vehicles_select` esconde al staff todo vehiculo sin reserva en su concesionario, y
-- `vehicles_plate_key` es UNIQUE sobre la placa: el ingreso manual leia "no existe",
-- insertaba, y moria en el unique — ahi sin ninguna recuperacion, a diferencia de la
-- cedula.
--
-- No se reusa `staff_lookup_vehicle_by_plate` para esto porque esa filtra `v.is_active`,
-- y el indice unico NO es parcial: un vehiculo inactivo igual bloquea el INSERT pero no
-- aparecería en la busqueda. La pregunta que hay que contestar aca es exactamente la del
-- constraint — "¿ya hay una fila con esta placa?" —, sin importar el estado.
CREATE OR REPLACE FUNCTION public.staff_resolve_vehicle_by_plate(p_plate text)
RETURNS TABLE(vehicle_id uuid, client_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT v.id, v.client_id
  FROM public.vehicles v
  WHERE length(btrim(coalesce(p_plate, ''))) > 0
    AND upper(v.plate) = upper(btrim(p_plate))
    AND (public.is_admin_user()
         OR public.get_user_role() IN ('concesionario', 'vendedor', 'Asesor de Servicio'))
  LIMIT 1;
$function$;

COMMENT ON FUNCTION public.staff_resolve_vehicle_by_plate(text) IS
  'Devuelve el vehiculo (y su cliente) que ya ocupa esa placa, activo o no. Contesta la '
  'misma pregunta que el indice unico vehicles_plate_key, para que el ingreso manual '
  'pueda reusar en vez de chocar. Ver 20260806120000.';

GRANT EXECUTE ON FUNCTION public.staff_resolve_vehicle_by_plate(text) TO authenticated;

-- ============================================================================
-- 4) La anterior queda sin uso: su unico llamador (DealershipReservas) pasa a
--    staff_search_clients en este mismo cambio.
-- ============================================================================
DROP FUNCTION IF EXISTS public.staff_search_clients_by_name(text);
