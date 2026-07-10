-- Fase 2B — Parte 1c (ADITIVA): busqueda de clientes por nombre y listado de
-- vehiculos de un cliente, para STAFF del portal concesionario.
--
-- Contexto: 2b_part2 (tenant isolation) restringio el SELECT directo de clients
-- y vehicles a filas ya ligadas a una reserva del concesionario. 2b_part1b
-- resolvio SOLO la busqueda por placa con una RPC SECURITY DEFINER. Faltaban dos
-- caminos del alta de reservas:
--   1. Buscar cliente por NOMBRE: no aparecian los clientes sin reserva previa
--      (~83% de la base, sobre todo flotas).
--   2. Traer TODOS los vehiculos de un cliente: una flota con un solo vehiculo
--      con historial hacia que el sistema autoseleccionara ese unico visible.
--
-- Mismo patron que staff_lookup_vehicle_by_plate: gateadas a rol staff (un
-- cliente que las llame no obtiene nada). La busqueda por nombre esta ACOTADA a
-- 20 filas para no volcar la base entera. (Rate limiting: Fase 4.)

-- 1) Busqueda de clientes por nombre (autocomplete del alta de reserva).
CREATE OR REPLACE FUNCTION public.staff_search_clients_by_name(p_query text)
RETURNS TABLE (client_id uuid, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT c.id, c.full_name
  FROM public.clients c
  WHERE trim(p_query) <> ''
    AND c.full_name ILIKE '%' || trim(p_query) || '%'
    AND (public.is_admin_user()
         OR public.get_user_role() IN ('concesionario','vendedor','Asesor de Servicio'))
  ORDER BY c.full_name
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.staff_search_clients_by_name(text) TO authenticated;

-- 2) Todos los vehiculos de un cliente (selector al elegir cliente por nombre).
--    SIN filtro is_active, para preservar el comportamiento del SELECT directo
--    original (que listaba todos los vehiculos del cliente); aqui solo se corrige
--    el bloqueo de RLS. LEFT JOIN a vehicle_models para no descartar ningun
--    vehiculo si le faltara el modelo.
CREATE OR REPLACE FUNCTION public.staff_lookup_client_vehicles(p_client_id uuid)
RETURNS TABLE (
  vehicle_id uuid, plate text, year int, color text,
  model_name text, model_brand text,
  client_id uuid, client_full_name text, client_phone text, client_cedula text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT v.id, v.plate, v.year, v.color,
         m.name, m.brand,
         v.client_id, c.full_name, c.phone, c.cedula
  FROM public.vehicles v
  LEFT JOIN public.vehicle_models m ON m.id = v.model_id
  LEFT JOIN public.clients c ON c.id = v.client_id
  WHERE v.client_id = p_client_id
    AND (public.is_admin_user()
         OR public.get_user_role() IN ('concesionario','vendedor','Asesor de Servicio'))
  ORDER BY v.plate NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.staff_lookup_client_vehicles(uuid) TO authenticated;
