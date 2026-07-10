-- Fase 2B — Parte 1d (ADITIVA): roster de vendedores de un concesionario, para
-- que un CONCESIONARIO pueda filtrar y atribuir prospectos por vendedor.
--
-- Problema: por RLS un concesionario NO puede leer dealership_users ni profiles
-- de otros usuarios desde el navegador (solo su propia fila), asi que no tiene
-- forma de listar a los vendedores de su concesionario. Ademas, el concesionario
-- no es una fila de salespersons, por lo que hoy no puede atribuirse un prospecto
-- a si mismo.
--
-- Esta RPC (mismo patron SECURITY DEFINER que staff_lookup_vehicle_by_plate)
-- devuelve el nombre con el que cada VENDEDOR del concesionario guarda sus
-- prospectos: COALESCE(salespersons.name, profiles.full_name) — el mismo criterio
-- que usa el front (currentSalesperson?.name || profile.full_name). Gateada a que
-- el que llama sea admin o pertenezca a ese concesionario. Al concesionario mismo
-- lo agrega el front (profile.full_name); aqui solo devolvemos el roster de
-- vendedores, nunca otros concesionarios.
CREATE OR REPLACE FUNCTION public.dealership_salesperson_names(p_dealership_id uuid)
RETURNS TABLE (name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT DISTINCT COALESCE(s.name, p.full_name) AS name
  FROM public.dealership_users du
  JOIN public.profiles p ON p.id = du.profile_id
  JOIN public.roles r ON r.id = p.role_id
  LEFT JOIN public.salespersons s ON s.profile_id = p.id AND s.is_active
  WHERE du.dealership_id = p_dealership_id
    AND r.name = 'vendedor'
    AND COALESCE(s.name, p.full_name) IS NOT NULL
    AND COALESCE(s.name, p.full_name) <> ''
    AND (public.is_admin_user()
         OR p_dealership_id = ANY(public.current_user_dealership_ids()));
$$;

GRANT EXECUTE ON FUNCTION public.dealership_salesperson_names(uuid) TO authenticated;
