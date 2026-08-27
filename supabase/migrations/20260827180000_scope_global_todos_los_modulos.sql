-- El interruptor "Ver todo" / "Solo propio" pasa a valer para TODOS los modulos.
--
-- DE DONDE VIENE. En Configuracion -> Roles cada modulo tiene un interruptor que se guarda en
-- `role_module_scopes`. Hasta la migracion anterior NINGUNA policy lo leia: el boton decia
-- "Ver todo" y la base seguia recortando por concesionario. Se arreglo `vehiculos`; quedaban
-- otros siete botones que no hacian nada, y el problema de fondo intacto: el dia que alguien
-- sume un modulo nuevo a la lista del panel sin tocar las policies, el boton vuelve a mentir.
--
-- COMO SE CIERRA, DE RAIZ. Tres piezas:
--
--   1) `has_global_scope(modulos...)`  -- una sola funcion que responde si el rol del usuario
--      tiene alguno de esos modulos en "Ver todo".
--   2) Una policy `<tabla>_select_global` por tabla, que solo AGREGA visibilidad. En Postgres
--      las policies permisivas se combinan con OR, asi que estas no pueden restringir nada de
--      lo que hoy funciona: en el peor caso no aportan.
--   3) `module_scope_catalog`, la lista de modulos que DE VERDAD obedecen el interruptor. El
--      panel de Roles lee esta tabla en vez de una lista escrita en el codigo, asi que un
--      modulo sin policy no muestra el boton. No se puede volver a prometer lo que no se cumple.
--
-- QUIEN QUEDA AFUERA, A PROPOSITO:
--   * `concesionarios` -> `dealerships` ya es legible por cualquier usuario autenticado (hace
--     falta para todos los selectores). Recortarla romperia media aplicacion y el interruptor
--     nunca significo nada ahi. Se saca del catalogo en vez de dejar un boton decorativo.
--   * `modelos`, `eventos`, `roles`, `configuracion` -> catalogos globales, no tienen dueño.
--
-- COMO SE AGREGA UN MODULO NUEVO (dos pasos, y si falta uno el boton no aparece):
--   a) crear la policy `<tabla>_select_global` con `public.has_global_scope('<modulo>')`;
--   b) insertar la fila en `module_scope_catalog`.
--
-- SEGURIDAD: `has_global_scope` exige que el rol NO sea del portal cliente (`redirect_portal`).
-- Asi un rol de staff nuevo funciona solo, y prender el interruptor sobre el rol `cliente` por
-- accidente no expone la base de clientes.

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- 1) La funcion unica.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_global_scope(VARIADIC p_modules text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
      JOIN public.roles r              ON r.id = p.role_id
      JOIN public.role_module_scopes s ON s.role_id = r.id
     WHERE p.id = auth.uid()
       -- Un rol del portal cliente nunca ve de forma global, aunque alguien prenda el
       -- interruptor por error desde el panel.
       AND coalesce(r.redirect_portal, '') <> 'cliente'
       AND s.module = ANY (p_modules)
       AND s.scope  = 'all'
  );
$fn$;

REVOKE ALL ON FUNCTION public.has_global_scope(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_global_scope(text[]) TO authenticated;

COMMENT ON FUNCTION public.has_global_scope(text[]) IS
  'true si el rol del usuario (no cliente) tiene alguno de esos modulos en "Ver todo" (role_module_scopes.scope = all).';

-- ---------------------------------------------------------------------------------------------
-- 2) El catalogo que consume el panel de Roles.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.module_scope_catalog (
  module       text PRIMARY KEY,
  gated_tables text[] NOT NULL,
  note         text,
  sort_order   integer NOT NULL DEFAULT 100
);

COMMENT ON TABLE public.module_scope_catalog IS
  'Modulos cuyo interruptor "Ver todo" esta realmente implementado en las policies. Configuracion -> Roles muestra el boton solo para estos. Agregar una fila SIN su policy <tabla>_select_global vuelve a dejar un boton que miente.';

INSERT INTO public.module_scope_catalog (module, gated_tables, note, sort_order) VALUES
  ('clientes',   ARRAY['clients'],                            'Clientes de todos los concesionarios.',        10),
  ('vehiculos',  ARRAY['vehicles'],                           'Vehiculos de todo el sistema.',                20),
  ('reservas',   ARRAY['reservations'],                       'Reservas de todos los concesionarios.',        30),
  ('garantias',  ARRAY['reservations','vehicles'],            'Garantias de todo el sistema.',                40),
  ('historial',  ARRAY['reservations','vehicles','clients'],  'Historial de servicios de todo el sistema.',   50),
  ('prospectos', ARRAY['prospects'],                          'Prospectos de todos los concesionarios.',      60),
  ('usuarios',   ARRAY['profiles'],                           'Usuarios de todo el sistema.',                 70)
ON CONFLICT (module) DO UPDATE
  SET gated_tables = EXCLUDED.gated_tables,
      note         = EXCLUDED.note,
      sort_order   = EXCLUDED.sort_order;

ALTER TABLE public.module_scope_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS module_scope_catalog_select ON public.module_scope_catalog;
CREATE POLICY module_scope_catalog_select ON public.module_scope_catalog
  FOR SELECT TO authenticated USING (true);

-- Solo quien administra roles puede tocar el catalogo.
DROP POLICY IF EXISTS module_scope_catalog_write ON public.module_scope_catalog;
CREATE POLICY module_scope_catalog_write ON public.module_scope_catalog
  FOR ALL TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

-- ---------------------------------------------------------------------------------------------
-- 3) Una policy por tabla. Solo suman visibilidad.
-- ---------------------------------------------------------------------------------------------

-- vehiculos: la migracion anterior metio la rama adentro de `vehicles_select`. Se devuelve esa
-- policy a su forma original y la parte global pasa a su propia policy, para que las cinco
-- tablas sigan exactamente el mismo patron.
DROP POLICY IF EXISTS vehicles_select ON public.vehicles;
CREATE POLICY vehicles_select ON public.vehicles
FOR SELECT TO authenticated
USING (
  public.is_admin_user()
  OR client_id = ANY (public.current_user_client_ids())
  OR (
    public.get_user_role() = ANY (ARRAY['concesionario'::text, 'vendedor'::text, 'Asesor de Servicio'::text])
    AND id IN (
      SELECT r.vehicle_id FROM public.reservations r
       WHERE r.dealership_id = ANY (public.current_user_dealership_ids())
         AND r.vehicle_id IS NOT NULL
    )
  )
);

DROP POLICY IF EXISTS vehicles_select_global ON public.vehicles;
CREATE POLICY vehicles_select_global ON public.vehicles
  FOR SELECT TO authenticated
  USING (public.has_global_scope('vehiculos', 'garantias', 'historial'));

DROP POLICY IF EXISTS clients_select_global ON public.clients;
CREATE POLICY clients_select_global ON public.clients
  FOR SELECT TO authenticated
  USING (public.has_global_scope('clientes', 'historial'));

DROP POLICY IF EXISTS reservations_select_global ON public.reservations;
CREATE POLICY reservations_select_global ON public.reservations
  FOR SELECT TO authenticated
  USING (public.has_global_scope('reservas', 'garantias', 'historial'));

DROP POLICY IF EXISTS prospects_select_global ON public.prospects;
CREATE POLICY prospects_select_global ON public.prospects
  FOR SELECT TO authenticated
  USING (public.has_global_scope('prospectos'));

DROP POLICY IF EXISTS profiles_select_global ON public.profiles;
CREATE POLICY profiles_select_global ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_global_scope('usuarios'));

COMMIT;
