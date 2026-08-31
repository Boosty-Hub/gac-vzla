-- INCIDENTE REAL: en el portal de concesionario, un asesor de servicio tecleo la placa
-- "A01A18I" (no registrada) en el buscador de "Nueva Reserva", esperando el flujo normal
-- de "placa no encontrada, cargar cliente nuevo". `staff_lookup_vehicle_by_plate`
-- correctamente no encontro nada. Pero `staff_search_clients` (20260806120000) extrajo los
-- digitos "0118" de ese texto (4 digitos, justo el minimo que exigia la rama de telefono) y
-- matcheo por pura casualidad contra el telefono de un cliente totalmente ajeno,
-- "Francisco Alonso Valbuena Morillo" (telefono termina en "...3800118", que contiene "0118"
-- como substring). Ese cliente aparecio como sugerencia en el dropdown, sin ninguna
-- indicacion de que el match fue por telefono y no por placa/nombre. Si ese cliente hubiera
-- tenido un solo vehiculo registrado, `resolveAutoVehicle` se lo habria auto-asignado a la
-- reserva sin pedir confirmacion de placa: la reserva de servicio habria quedado adjuntada
-- al cliente y vehiculo equivocados.
--
-- ARREGLO: un unico cambio sobre `staff_search_clients` (20260806120000) — subir el minimo
-- de digitos que activa el match por telefono de 4 a 7. Un telefono venezolano completo son
-- 10-11 digitos; exigir 7 significa que el usuario tuvo que haber tipeado la mayor parte del
-- numero real a proposito, lo cual sigue permitiendo buscar por telefono genuinamente pero
-- hace estadisticamente casi imposible que una placa mal tipeada (que normalmente aporta muy
-- pocos digitos reales, 3-4 como mucho) coincida por casualidad con el telefono de otra
-- persona. Las ramas de `cedula` (minimo 3 caracteres) y `full_name` no se tocan: el
-- incidente solo senala al telefono como vector.
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
      -- Umbral subido de 4 a 7 (ver comentario de cabecera): 4 digitos de un telefono de
      -- 10 se prestaba a coincidencias por casualidad contra placas mal tipeadas.
      OR (length(esc.digits) >= 7
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
  'por eso hacia imposible vincular un cliente buscandolo por cedula. El match por telefono '
  'exige minimo 7 digitos (antes 4) para evitar falsos positivos con placas mal tipeadas '
  '— ver 20260831130000. Ver tambien 20260806120000.';

GRANT EXECUTE ON FUNCTION public.staff_search_clients(text) TO authenticated;
