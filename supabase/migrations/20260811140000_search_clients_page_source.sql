-- Agrega el filtro por convenio (`p_source`) a la busqueda de Clientes.
--
-- Se DROPEA la version de 7 argumentos antes de crear la de 8. Postgres permite sobrecargas,
-- pero PostgREST resuelve la RPC por nombre y cuerpo: dejar las dos hace que una llamada sin
-- `p_source` sea ambigua y falle con PGRST203. Una sola definicion viva.

DROP FUNCTION IF EXISTS public.search_clients_page(text, text, text, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.search_clients_page(
  p_query    text    DEFAULT '',
  p_kind     text    DEFAULT 'todos',   -- propios | externos | todos
  p_status   text    DEFAULT 'todos',   -- activo  | inactivo | todos
  p_city     text    DEFAULT 'todos',
  p_warranty text    DEFAULT 'todos',   -- activa  | vencida  | todos
  p_source   text    DEFAULT 'todos',   -- convenio exacto | todos
  p_limit    integer DEFAULT 25,
  p_offset   integer DEFAULT 0
)
RETURNS TABLE(client_id uuid, total_count bigint)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  WITH termino AS (
    -- Se escapan los comodines de LIKE. Sin esto, teclear "%" lista la base entera y "_"
    -- hace de comodin de un caracter — el usuario cree que busca y en realidad no filtra.
    SELECT
      btrim(coalesce(p_query, '')) AS crudo,
      '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS patron
  ),
  filtrados AS (
    SELECT c.id, c.full_name
    FROM public.clients c, termino t
    WHERE (p_kind    = 'todos' OR c.is_manual = (p_kind   = 'externos'))
      AND (p_status  = 'todos' OR c.is_active = (p_status = 'activo'))
      AND (p_city    = 'todos' OR c.city = p_city)
      AND (p_source  = 'todos' OR c.external_source = p_source)
      AND (
        p_warranty = 'todos'
        OR (p_warranty = 'activa') = EXISTS (
             SELECT 1 FROM public.vehicles v
             WHERE v.client_id = c.id AND v.warranty_active)
      )
      AND (
        t.crudo = ''
        OR c.full_name       ILIKE t.patron ESCAPE '\'
        OR c.cedula          ILIKE t.patron ESCAPE '\'
        OR c.email           ILIKE t.patron ESCAPE '\'
        OR c.phone           ILIKE t.patron ESCAPE '\'
        -- El convenio tambien es buscable: escribir el nombre de la alianza trae su cartera.
        OR c.external_source ILIKE t.patron ESCAPE '\'
        -- Placa, VIN y modelo: mismo alcance que la caja de busqueda promete.
        OR EXISTS (
             SELECT 1
             FROM public.vehicles v
             LEFT JOIN public.vehicle_models m ON m.id = v.model_id
             WHERE v.client_id = c.id
               AND (v.plate ILIKE t.patron ESCAPE '\'
                 OR v.vin   ILIKE t.patron ESCAPE '\'
                 OR m.name  ILIKE t.patron ESCAPE '\'
                 OR m.brand ILIKE t.patron ESCAPE '\')
           )
        OR EXISTS (
             SELECT 1 FROM public.drivers d
             WHERE d.client_id = c.id AND d.is_active
               AND (d.full_name ILIKE t.patron ESCAPE '\'
                 OR d.cedula    ILIKE t.patron ESCAPE '\')
           )
      )
  )
  SELECT f.id, count(*) OVER () AS total_count
  FROM filtrados f
  ORDER BY f.full_name
  LIMIT  greatest(coalesce(p_limit, 25), 1)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$function$;

COMMENT ON FUNCTION public.search_clients_page(text, text, text, text, text, text, integer, integer) IS
  'Busqueda + filtros + paginacion del modulo Clientes, resuelta en SQL. Devuelve solo los '
  'ids de la pagina para que la URL no crezca con los datos (ver 20260811120000). '
  'SECURITY INVOKER: respeta las RLS de quien llama, no amplia visibilidad.';

GRANT EXECUTE ON FUNCTION public.search_clients_page(text, text, text, text, text, text, integer, integer)
  TO authenticated;
