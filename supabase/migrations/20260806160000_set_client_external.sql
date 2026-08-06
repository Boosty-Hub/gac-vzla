-- El usuario sigue sin ver clientes externos, y el sistema tiene razon: no hay ninguno.
--
-- Comprobado en produccion (2026-08-06):
--   clients  WHERE is_manual  -> 0 de 1378
--   vehicles WHERE is_manual  -> 0 de 2656
--   Los 6 unicos clientes sin contacto de Kommo salen todos de una venta ganada.
--   `vehicles.purchase_date` es nullable y SIN default, y `createOrReuseManualEntities`
--   nunca lo escribe: los 2656 vehiculos tienen fecha de compra, o sea que NINGUNO entro
--   por "Ingresar manualmente". Ni uno.
--
-- El criterio nuevo (20260806150000) marca los que entren de ahora en adelante, pero no
-- puede inventar los historicos: no hay rastro que distinga al cliente cargado a mano en
-- febrero del que vino en la importacion, y adivinarlo marcaria como externos a clientes
-- reales.
--
-- Lo que si hace falta es que el operador pueda marcarlos EL, que es quien sabe cuales
-- son. Esta funcion es esa accion, y existe como funcion y no como dos updates sueltos
-- desde el front porque el cliente y sus vehiculos tienen que quedar coherentes: de nada
-- sirve marcar al cliente si sus vehiculos no aparecen despues en la vista de externos.

CREATE OR REPLACE FUNCTION public.set_client_external(p_client_id uuid, p_value boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (public.is_admin_user()
          OR public.get_user_role() IN ('concesionario', 'vendedor', 'Asesor de Servicio')) THEN
    RAISE EXCEPTION 'No autorizado para cambiar el tipo de cliente';
  END IF;

  UPDATE public.clients SET is_manual = p_value WHERE id = p_client_id;

  IF p_value THEN
    -- Los vehiculos de un cliente externo son externos, sea el modelo del catalogo o no.
    UPDATE public.vehicles SET is_manual = true WHERE client_id = p_client_id;
  ELSE
    -- Al desmarcar NO se limpia todo: un vehiculo cuyo MODELO se escribio a mano sigue
    -- siendo de tercero aunque su dueño deje de estar marcado. Esa bandera describe al
    -- vehiculo, no al dueño, y es la unica de las tres que toca la garantia.
    UPDATE public.vehicles v SET is_manual = false
     WHERE v.client_id = p_client_id
       AND NOT EXISTS (
         SELECT 1 FROM public.vehicle_models m
          WHERE m.id = v.model_id AND m.is_manual
       );
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.set_client_external(uuid, boolean) IS
  'Marca o desmarca un cliente como externo (cargado a mano) y arrastra sus vehiculos, '
  'para que aparezcan juntos en la vista de externos. Al desmarcar respeta los vehiculos '
  'cuyo modelo es manual. Ver 20260806160000.';

GRANT EXECUTE ON FUNCTION public.set_client_external(uuid, boolean) TO authenticated;
