-- Migration: allow_dealership_roles_insert_client_vehicle
-- Extends INSERT policies on clients and vehicles to include all dealership-portal
-- roles: vendedor and "Asesor de Servicio", in addition to the existing roles.
--
-- OLD WITH CHECK (both tables):
--   (get_user_role() = ANY (ARRAY['superadmin'::text, 'admin'::text, 'concesionario'::text]))
--
-- NEW WITH CHECK (both tables):
--   (get_user_role() = ANY (ARRAY['superadmin'::text, 'admin'::text, 'concesionario'::text, 'vendedor'::text, 'Asesor de Servicio'::text]))

-- clients INSERT policy
DROP POLICY IF EXISTS clients_insert ON public.clients;
CREATE POLICY clients_insert ON public.clients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    get_user_role() = ANY (ARRAY[
      'superadmin'::text,
      'admin'::text,
      'concesionario'::text,
      'vendedor'::text,
      'Asesor de Servicio'::text
    ])
  );

-- vehicles INSERT policy
DROP POLICY IF EXISTS vehicles_insert ON public.vehicles;
CREATE POLICY vehicles_insert ON public.vehicles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    get_user_role() = ANY (ARRAY[
      'superadmin'::text,
      'admin'::text,
      'concesionario'::text,
      'vendedor'::text,
      'Asesor de Servicio'::text
    ])
  );
