-- "Debo ver los antiguos tambien."
--
-- Los historicos no se pueden deducir. Rastros descartados uno por uno:
--   - `integration_logs` no guarda el cliente: sus columnas son prospect_id y
--     kommo_lead_id. Los 301 eventos `sync_to_kommo` traen solo {fields_synced}.
--   - `IdContactKommo IS NULL` da 6 clientes, y los 6 salen de una venta ganada.
--   - "nunca fue una venta ganada" da 1233 de 1378: no separa nada, porque la mayoria
--     entro en la importacion de febrero (1101 clientes) y no como lead del sistema.
--   - `clients` no tiene columna de autor ni de origen.
--
-- Quien sabe cuales son es el operador. `set_client_external` (20260806160000) ya lo
-- permite de a uno; esta es la version en lote, para que marcar decenas de clientes
-- historicos sea un rato y no una tarde.
--
-- Se reusa la funcion de a uno en un bucle en vez de duplicar la logica de arrastre a
-- vehiculos: son pocos cientos de filas como mucho, todo dentro de la misma transaccion,
-- y tener una sola definicion de "que significa marcar externo" evita que las dos
-- versiones se separen con el tiempo.

CREATE OR REPLACE FUNCTION public.set_clients_external(p_client_ids uuid[], p_value boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
  v_count integer := 0;
BEGIN
  -- La autorizacion la vuelve a chequear set_client_external en cada llamada; este
  -- chequeo temprano evita recorrer el arreglo entero para terminar rechazando.
  IF NOT (public.is_admin_user()
          OR public.get_user_role() IN ('concesionario', 'vendedor', 'Asesor de Servicio')) THEN
    RAISE EXCEPTION 'No autorizado para cambiar el tipo de cliente';
  END IF;

  FOREACH v_id IN ARRAY coalesce(p_client_ids, ARRAY[]::uuid[]) LOOP
    PERFORM public.set_client_external(v_id, p_value);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.set_clients_external(uuid[], boolean) IS
  'Version en lote de set_client_external. Marca o desmarca varios clientes como externos '
  'y arrastra sus vehiculos, en una sola transaccion. Ver 20260806170000.';

GRANT EXECUTE ON FUNCTION public.set_clients_external(uuid[], boolean) TO authenticated;
