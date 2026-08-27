-- El histórico del vehículo se comparte entre centros de servicio.
--
-- EL PEDIDO. "Lo ideal seria que los concesionarios por medio del apartado Vehiculos, al buscar
-- el carro por placa, puedan visualizar el historico. La idea principal de este sistema es la
-- comunicacion del historico entre centros de servicio, para monitorear el paso de los
-- vehiculos por los centros de servicio."
--
-- QUE PASABA. Darle al asesor el permiso global de Vehiculos lo dejo viendo los 2.774 autos,
-- pero el detalle seguia consultando `reservations` directo, y esa policy recorta por
-- concesionario. Medido sobre la placa AP125MB, que paso por TRES centros (GAC Barquisimeto,
-- GAC Maracaibo y PITS Services Maracaibo): el asesor veia 1 de 3 servicios y 0 encuestas.
-- Justo lo contrario de para lo que existe el sistema.
--
-- POR QUE UNA FUNCION Y NO UNA POLICY MAS. Abrir `reservations` a quien tiene Vehiculos en
-- "Ver todo" tambien le abriria el modulo de Reservas, que tiene su propio interruptor. Son
-- dos permisos distintos y tienen que seguir siendolo. Esta funcion expone UNA cosa: por donde
-- paso un vehiculo, para quien ya puede ver ese vehiculo. Ninguna tabla cambia de policy.
--
-- QUE DEVUELVE, TODO JUNTO. Servicio, centro donde se hizo y resultado de la encuesta. La
-- encuesta viaja en la misma fila a proposito: si la pantalla la buscara aparte por
-- `satisfaction_surveys`, esa consulta volveria a recortarse por concesionario y el historial
-- de los otros centros aparecerria sin encuesta. Es exactamente el cabo suelto que dejo el
-- permiso anterior.

BEGIN;

CREATE OR REPLACE FUNCTION public.vehicle_service_history(p_vehicle_id uuid)
RETURNS TABLE (
  id               uuid,
  reservation_date date,
  reservation_time time,
  service_type     text,
  current_mileage  integer,
  status           text,
  service_notes    text,
  completed_at     timestamptz,
  dealership_name  text,
  survey           jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_es_staff  boolean;
  v_permitido boolean;
BEGIN
  IF p_vehicle_id IS NULL THEN
    RETURN;
  END IF;

  SELECT coalesce(rl.redirect_portal, '') <> 'cliente'
    INTO v_es_staff
    FROM public.profiles pr
    JOIN public.roles rl ON rl.id = pr.role_id
   WHERE pr.id = auth.uid();
  v_es_staff := coalesce(v_es_staff, false);

  -- Mismo criterio que la policy `vehicles_select`: si puede ver el vehiculo, puede ver por
  -- donde paso. No se abre una puerta nueva, se sigue la que ya existe.
  v_permitido :=
    public.is_admin_user()
    OR public.has_global_scope('vehiculos', 'garantias', 'historial')
    OR EXISTS (
      SELECT 1 FROM public.vehicles v
       WHERE v.id = p_vehicle_id
         AND v.client_id = ANY (public.current_user_client_ids())
    )
    OR (v_es_staff AND EXISTS (
      SELECT 1 FROM public.reservations r2
       WHERE r2.vehicle_id = p_vehicle_id
         AND r2.dealership_id = ANY (public.current_user_dealership_ids())
    ));

  IF NOT v_permitido THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.reservation_date,
    r.reservation_time,
    r.service_type,
    r.current_mileage,
    r.status,
    r.service_notes,
    r.completed_at,
    d.name,
    CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id',             s.id,
      'reservation_id', s.reservation_id,
      'status',         s.status,
      'responded_at',   s.responded_at,
      'response',       CASE WHEN resp.id IS NULL THEN NULL
                             ELSE to_jsonb(resp) - 'id' - 'survey_id' - 'created_at' END
    ) END
  FROM public.reservations r
  LEFT JOIN public.dealerships d ON d.id = r.dealership_id
  -- Una encuesta suprimida no se muestra: se retiro a proposito, y pintarla como "enviada sin
  -- responder" le echaria al cliente un silencio que causamos nosotros.
  LEFT JOIN public.satisfaction_surveys s
         ON s.reservation_id = r.id
        AND s.origin = 'service'
        AND s.suppressed_reason IS NULL
  LEFT JOIN public.service_survey_responses resp ON resp.survey_id = s.id
  WHERE r.vehicle_id = p_vehicle_id
    -- Los servicios internos no se le muestran al cliente, igual que en `reservations_select`.
    AND (v_es_staff OR NOT public.is_internal_service_type(r.service_type))
  ORDER BY r.reservation_date DESC NULLS LAST, r.reservation_time DESC NULLS LAST
  LIMIT 200;
END;
$fn$;

REVOKE ALL ON FUNCTION public.vehicle_service_history(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vehicle_service_history(uuid) TO authenticated;

COMMENT ON FUNCTION public.vehicle_service_history(uuid) IS
  'Historial de servicios de un vehiculo ENTRE CENTROS, con el centro y la encuesta de cada uno. Visible para quien ya puede ver el vehiculo (mismo criterio que vehicles_select). No abre el modulo de Reservas.';

COMMIT;
