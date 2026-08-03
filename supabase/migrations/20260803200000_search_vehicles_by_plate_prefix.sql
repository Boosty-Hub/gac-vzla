-- Busqueda de vehiculos por placa PARCIAL, para sugerir mientras el vendedor escribe.
--
-- `staff_lookup_vehicle_by_plate` hace coincidencia EXACTA: solo responde cuando la placa
-- esta completa. Sirve para vincular, pero no para buscar: el vendedor que no recuerda la
-- placa entera no obtiene nada hasta el ultimo caracter.
--
-- Limites deliberados, porque esto expone vehiculos que el usuario no necesariamente
-- administra:
--   * minimo 3 caracteres — con menos, "A" listaria practicamente toda la flota y esto se
--     convertiria en un volcado enumerable de la base de vehiculos.
--   * maximo 8 resultados — es una ayuda de tipeo, no un reporte.
--   * mismos roles que la funcion exacta que ya existe; no amplia quien puede consultar.
--
-- Devuelve el nombre del dueño actual porque es justamente el dato que el vendedor necesita
-- ver ANTES de decidir transferir el vehiculo.

CREATE OR REPLACE FUNCTION public.staff_search_vehicles_by_plate(p_query text)
RETURNS TABLE(
  vehicle_id uuid, plate text, year integer, model_id uuid,
  model_name text, model_brand text, client_id uuid, client_full_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT v.id, v.plate, v.year, v.model_id, m.name, m.brand, v.client_id, c.full_name
  FROM public.vehicles v
  JOIN public.vehicle_models m ON m.id = v.model_id
  LEFT JOIN public.clients c ON c.id = v.client_id
  WHERE v.is_active
    AND length(btrim(coalesce(p_query, ''))) >= 3
    AND upper(v.plate) LIKE '%' || upper(btrim(p_query)) || '%'
    AND (public.is_admin_user()
         OR public.get_user_role() IN ('concesionario', 'vendedor', 'Asesor de Servicio'))
  -- Las que EMPIEZAN con lo tecleado primero: es lo que el usuario esta escribiendo.
  ORDER BY (upper(v.plate) LIKE upper(btrim(p_query)) || '%') DESC, v.plate
  LIMIT 8;
$function$;

GRANT EXECUTE ON FUNCTION public.staff_search_vehicles_by_plate(text) TO authenticated, service_role;
