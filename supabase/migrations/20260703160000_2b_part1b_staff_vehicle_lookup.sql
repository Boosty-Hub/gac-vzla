-- Fase 2B — Parte 1b (ADITIVA): lookup de vehiculo por placa para STAFF.
--
-- El portal concesionario necesita buscar CUALQUIER vehiculo por placa al crear
-- una reserva (incluido un cliente nuevo aun no ligado a su concesionario). Bajo
-- la nueva vehicles_select, una query directa no lo encontraria. Esta RPC lo
-- resuelve, gateada a rol staff (un cliente que la llame no obtiene nada).
--
-- Es una busqueda ACOTADA (una placa -> una fila), no un volcado masivo: cierra
-- la cosecha de PII sin romper la operacion. (Rate limiting: Fase 4.)

CREATE OR REPLACE FUNCTION public.staff_lookup_vehicle_by_plate(p_plate text)
RETURNS TABLE (
  vehicle_id uuid, plate text, year int, color text, vin text, mileage int,
  warranty_active boolean, model_name text, model_brand text,
  client_id uuid, client_full_name text, client_phone text, client_cedula text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT v.id, v.plate, v.year, v.color, v.vin, v.mileage, v.warranty_active,
         m.name, m.brand, v.client_id, c.full_name, c.phone, c.cedula
  FROM public.vehicles v
  JOIN public.vehicle_models m ON m.id = v.model_id
  LEFT JOIN public.clients c ON c.id = v.client_id
  WHERE upper(v.plate) = upper(trim(p_plate))
    AND v.is_active
    AND (public.is_admin_user()
         OR public.get_user_role() IN ('concesionario','vendedor','Asesor de Servicio'))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.staff_lookup_vehicle_by_plate(text) TO authenticated;
