-- CAMBIO DE CRITERIO, pedido por el usuario: "el cliente debe aparecer en externo cuando
-- sea ingresado manualmente, y su vehiculo si puede ser o nuestro o uno ingresado tambien
-- manual, pero debemos verlos ahi".
--
-- Hasta ahora "externo" se marcaba solo si la MARCA quedaba fuera del catalogo
-- (`Boolean(manualModel)` en src/lib/reservationAssignment.ts). Resultado medido en
-- produccion antes de este cambio:
--
--   clients  WHERE is_manual  ->  0 de 1378
--   vehicles WHERE is_manual  ->  0 de 2656
--   vehicle_models WHERE is_manual -> 0
--
-- Cero, porque nadie escribio nunca una marca fuera del catalogo: los ingresos manuales se
-- hicieron siempre eligiendo un modelo nuestro, y esos clientes quedaron como clientes
-- normales. Por eso la vista de externos salia vacia aunque si se cargaban a mano.
--
-- El criterio pasa a ser el ORIGEN del registro, no la marca:
--
--   clients.is_manual        true = lo cargamos a mano (mostrador / alta manual).
--   vehicles.is_manual       true = idem; puede ser un modelo NUESTRO igual.
--   vehicle_models.is_manual true = la marca/modelo se escribio a mano. SIN CAMBIOS.
--
-- La separacion importa y es la razon de no colapsar las tres banderas en una: la garantia
-- la decide `vehicle_models.is_manual` (src/lib/warranty.ts:65), no las otras dos. Un
-- cliente externo que trae un GAC que no le vendimos conserva la garantia del modelo;
-- perderla seria un falso negativo con consecuencia comercial.
--
-- Esta migracion solo corrige la documentacion de las columnas. NO reescribe filas
-- historicas: no hay forma de distinguir a posteriori que cliente de febrero entro a mano
-- y cual vino de la importacion, y adivinarlo marcaria como externos a clientes reales.
-- El criterio nuevo rige desde aca en adelante.

COMMENT ON COLUMN public.clients.is_manual IS
  'true = cliente cargado a mano (mostrador o alta manual), no proveniente de una venta '
  'ni del CRM. Es lo que la UI llama "externo". NO implica nada sobre la garantia de sus '
  'vehiculos: eso lo decide vehicle_models.is_manual. Ver 20260806150000.';

COMMENT ON COLUMN public.vehicles.is_manual IS
  'true = vehiculo cargado a mano junto con su cliente externo. El modelo puede ser del '
  'catalogo igual. Bandera de origen y de filtrado; la garantia NO depende de esta '
  'columna sino de vehicle_models.is_manual. Ver 20260806150000.';

COMMENT ON COLUMN public.vehicle_models.is_manual IS
  'true = marca/modelo escrito a mano para un vehiculo de tercero que no vendemos. NO es '
  'catalogo comercial: se excluye de los selectores de venta, de AdminModelos y del '
  'fallback global de garantia. Esta es la unica de las tres banderas is_manual que corta '
  'la garantia. Ver 20260730140000 y 20260806150000.';
