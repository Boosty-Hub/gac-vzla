-- "Error al cargar clientes" al escribir en el buscador de Clientes.
--
-- CAUSA (medida en produccion, 2026-08-11):
-- `AdminClientes.fetchClients()` resolvia las coincidencias por placa/VIN, por modelo y por
-- chofer con tres consultas aparte y despues METIA todos los client_id encontrados dentro de
-- la URL, como `id.in.(uuid,uuid,...)`. Con hasta 1000 ids eso son ~37 KB de URL.
--
-- El gateway de Supabase corta la peticion en ~24 KiB y responde `400 Bad Request` en texto
-- plano (no el JSON de PostgREST). supabase-js lo entrega como error y la pagina muestra el
-- toast. Umbral medido por biseccion:
--     670 ids -> URL 24.903 chars -> HTTP 200
--     680 ids -> URL 25.273 chars -> HTTP 400
--
-- Y saltaba escribiendo un NOMBRE porque la busqueda corre en cada tecla, sin debounce ni
-- largo minimo: la primera tecla es una busqueda de UNA letra. Ids relacionados por letra:
--     "a" -> 1356 clientes por placa/VIN      "s" -> 511 por placa/VIN + 1250 por modelo
--     "o" ->  692 por modelo                  "gac" -> 358 por modelo
-- Medido de verdad: q="s" -> 748 ids -> URL 28.036 chars -> HTTP 400.
-- Por eso parecia intermitente: "jos" o "mar" dan 0 ids relacionados y esos SI funcionaban.
--
-- ARREGLO: la busqueda entera se resuelve en SQL y solo vuelven los ids de la pagina (25).
-- La URL deja de crecer con los datos. De paso son 1 viaje en vez de 4.
--
-- SECURITY INVOKER a proposito (o sea, sin SECURITY DEFINER): corre como quien llama, asi
-- que las policies de `clients`, `vehicles` y `drivers` aplican EXACTAMENTE igual que hoy.
-- Esto arregla un bug; no cambia quien ve que. Ampliar la visibilidad de la cartera al
-- concesionario es una decision de negocio aparte.
--
-- `p_warranty` tambien se resuelve aca. Antes se filtraba en el cliente DESPUES de paginar,
-- asi que el contador y las paginas no cerraban: la ultima pagina podia salir vacia.

CREATE OR REPLACE FUNCTION public.search_clients_page(
  p_query    text    DEFAULT '',
  p_kind     text    DEFAULT 'todos',   -- propios | externos | todos
  p_status   text    DEFAULT 'todos',   -- activo  | inactivo | todos
  p_city     text    DEFAULT 'todos',
  p_warranty text    DEFAULT 'todos',   -- activa  | vencida  | todos
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
      AND (
        p_warranty = 'todos'
        OR (p_warranty = 'activa') = EXISTS (
             SELECT 1 FROM public.vehicles v
             WHERE v.client_id = c.id AND v.warranty_active)
      )
      AND (
        t.crudo = ''
        OR c.full_name ILIKE t.patron ESCAPE '\'
        OR c.cedula    ILIKE t.patron ESCAPE '\'
        OR c.email     ILIKE t.patron ESCAPE '\'
        OR c.phone     ILIKE t.patron ESCAPE '\'
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

COMMENT ON FUNCTION public.search_clients_page(text, text, text, text, text, integer, integer) IS
  'Busqueda + filtros + paginacion del modulo Clientes, resuelta en SQL. Devuelve solo los '
  'ids de la pagina para que la URL no crezca con los datos (ver 20260811120000). '
  'SECURITY INVOKER: respeta las RLS de quien llama, no amplia visibilidad.';

GRANT EXECUTE ON FUNCTION public.search_clients_page(text, text, text, text, text, integer, integer)
  TO authenticated;
