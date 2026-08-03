-- Un cliente de flota debe poder gestionar SUS choferes desde su propio portal.
--
-- Hoy no puede, por dos motivos distintos:
--   * `drivers_insert/update/delete` exigen un rol de staff. El cliente puede LEER sus
--     choferes pero no crearlos ni editarlos.
--   * `vehicles_update` tampoco lo alcanza: solo admin y staff del concesionario.
--
-- El segundo no se resuelve ampliando la policy de `vehicles`. RLS es por FILA, no por
-- columna: darle UPDATE al cliente sobre sus vehiculos le abriria tambien kilometraje,
-- placa, garantia y modelo. Por eso la asignacion va por una funcion acotada que solo toca
-- `driver_id`.

-- ---------------------------------------------------------------------------
-- drivers: el dueño gestiona los suyos
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS drivers_insert ON public.drivers;
CREATE POLICY drivers_insert ON public.drivers FOR INSERT WITH CHECK (
  public.get_user_role() = ANY (ARRAY['superadmin', 'admin', 'concesionario', 'vendedor', 'Asesor de Servicio'])
  -- El cliente solo puede crear choferes bajo SU propia ficha, nunca bajo otra.
  OR client_id = ANY (public.current_user_client_ids())
);

DROP POLICY IF EXISTS drivers_update ON public.drivers;
CREATE POLICY drivers_update ON public.drivers FOR UPDATE USING (
  public.is_admin_user()
  OR client_id = ANY (public.current_user_client_ids())
  OR (
    public.get_user_role() = ANY (ARRAY['concesionario', 'vendedor', 'Asesor de Servicio'])
    AND client_id IN (
      SELECT r.client_id FROM public.reservations r
      WHERE r.dealership_id = ANY (public.current_user_dealership_ids())
        AND r.client_id IS NOT NULL
    )
  )
);

DROP POLICY IF EXISTS drivers_delete ON public.drivers;
CREATE POLICY drivers_delete ON public.drivers FOR DELETE USING (
  public.is_admin_user()
  OR client_id = ANY (public.current_user_client_ids())
  OR (
    public.get_user_role() = ANY (ARRAY['concesionario', 'vendedor', 'Asesor de Servicio'])
    AND client_id IN (
      SELECT r.client_id FROM public.reservations r
      WHERE r.dealership_id = ANY (public.current_user_dealership_ids())
        AND r.client_id IS NOT NULL
    )
  )
);

-- ---------------------------------------------------------------------------
-- Asignacion de chofer a un vehiculo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_vehicle_driver(p_vehicle_id uuid, p_driver_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_vehicle_client uuid;
  v_driver_client  uuid;
BEGIN
  SELECT vehicles.client_id INTO v_vehicle_client
    FROM public.vehicles WHERE vehicles.id = p_vehicle_id;
  IF v_vehicle_client IS NULL THEN
    RAISE EXCEPTION 'vehicle_not_found';
  END IF;

  -- Quien puede asignar: un admin, el propio cliente dueño del vehiculo, o el staff del
  -- concesionario que atendio a ese cliente. Misma forma que el resto de las policies.
  IF NOT (
    public.is_admin_user()
    OR v_vehicle_client = ANY (public.current_user_client_ids())
    OR (
      public.get_user_role() = ANY (ARRAY['concesionario', 'vendedor', 'Asesor de Servicio'])
      AND v_vehicle_client IN (
        SELECT r.client_id FROM public.reservations r
        WHERE r.dealership_id = ANY (public.current_user_dealership_ids())
          AND r.client_id IS NOT NULL
      )
    )
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Un chofer pertenece a un cliente. Asignar el chofer de otra empresa a este vehiculo
  -- filtraria el nombre de esa persona a un tercero, asi que se rechaza.
  IF p_driver_id IS NOT NULL THEN
    SELECT drivers.client_id INTO v_driver_client
      FROM public.drivers WHERE drivers.id = p_driver_id AND drivers.is_active;
    IF v_driver_client IS NULL THEN
      RAISE EXCEPTION 'driver_not_found';
    END IF;
    IF v_driver_client IS DISTINCT FROM v_vehicle_client THEN
      RAISE EXCEPTION 'driver_belongs_to_another_client';
    END IF;
  END IF;

  UPDATE public.vehicles
     SET driver_id = p_driver_id, updated_at = now()
   WHERE vehicles.id = p_vehicle_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.assign_vehicle_driver(uuid, uuid) TO authenticated, service_role;
