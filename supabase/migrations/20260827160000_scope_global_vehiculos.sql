-- El boton "Ver todo" de Configuracion -> Roles no hacia nada en Vehiculos.
--
-- QUE PASABA. En Configuracion -> Roles cada modulo tiene un interruptor "Ver todo" /
-- "Solo propio" que se guarda en `role_module_scopes`. Para el rol "Asesor de Servicio" el
-- modulo `vehiculos` ya estaba en `all`. Pero la policy `vehicles_select` NUNCA leia esa
-- tabla: tenia el filtro por concesionario cableado a mano. Resultado medido: el usuario veia
-- 143 vehiculos (los que tienen una reserva en su concesionario) sobre 2.774 que existen.
-- El interruptor decia una cosa y la base hacia otra.
--
-- QUE CAMBIA. Se agrega `current_user_module_scope(modulo)`, que lee el interruptor del rol
-- del usuario, y `vehicles_select` pasa a consultarlo. Nada mas cambia: el scope por defecto
-- es 'own', que es el comportamiento de siempre.
--
-- POR QUE SOLO LECTURA. "Asesor de Servicio" tiene unicamente `vehiculos.view`; no tiene
-- create, edit ni delete. Ampliar solo el SELECT deja la funcion completa para ese rol, sin
-- abrir escritura sobre vehiculos de otros concesionarios.
--
-- OJO: el mismo interruptor existe para clientes, reservas, garantias, historial, prospectos,
-- concesionarios y usuarios, y ninguna de esas policies lo consulta todavia. Hoy todas esas
-- filas estan en 'own', asi que nadie lo nota; el dia que alguien las ponga en 'all' se va a
-- repetir este mismo sintoma. La funcion de abajo deja el arreglo a una linea por policy.

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- Interruptor del rol para un modulo. 'own' (por defecto) o 'all'.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_module_scope(p_module text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT COALESCE(
    (SELECT s.scope
       FROM public.role_module_scopes s
       JOIN public.profiles p ON p.role_id = s.role_id
      WHERE p.id = auth.uid()
        AND s.module = p_module
      LIMIT 1),
    'own');
$fn$;

REVOKE ALL ON FUNCTION public.current_user_module_scope(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_module_scope(text) TO authenticated;

COMMENT ON FUNCTION public.current_user_module_scope(text) IS
  'Interruptor "Ver todo" / "Solo propio" del rol del usuario para un modulo, desde role_module_scopes. Devuelve ''own'' si no hay fila.';

-- ---------------------------------------------------------------------------------------------
-- vehicles_select: igual que antes, mas la rama del interruptor en 'all'.
-- ---------------------------------------------------------------------------------------------
DROP POLICY IF EXISTS vehicles_select ON public.vehicles;

CREATE POLICY vehicles_select ON public.vehicles
FOR SELECT TO authenticated
USING (
  public.is_admin_user()
  OR client_id = ANY (public.current_user_client_ids())
  OR (
    public.get_user_role() = ANY (ARRAY['concesionario'::text, 'vendedor'::text, 'Asesor de Servicio'::text])
    AND (
      -- Rama nueva: el rol tiene el modulo en "Ver todo".
      public.current_user_module_scope('vehiculos') = 'all'
      -- Rama de siempre: solo los vehiculos con una reserva en su concesionario.
      OR id IN (
        SELECT r.vehicle_id
          FROM public.reservations r
         WHERE r.dealership_id = ANY (public.current_user_dealership_ids())
           AND r.vehicle_id IS NOT NULL
      )
    )
  )
);

COMMIT;
