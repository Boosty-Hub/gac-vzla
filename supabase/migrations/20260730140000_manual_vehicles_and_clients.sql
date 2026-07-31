-- Vehículos y clientes de ingreso MANUAL (servicio a terceros).
--
-- Caso de uso del usuario: "hay veces vienen vehículos que no son de nosotros y solo le
-- hacemos un mantenimiento, entonces por lo menos en la vista debe quedar registro de qué
-- vehículo es — ojo, no puede quedar con nuestros clientes."
--
-- El catálogo `vehicle_models` solo tiene GAC (89), DFSK (169) y SHINERAY (11): las marcas
-- que la empresa vende. Un Toyota que entra por un mantenimiento suelto no está ahí, y no
-- debe estarlo como si fuera un modelo comercializable.
--
-- ============================================================================
-- POR QUÉ SE MARCA CON BANDERA Y NO SE DEJA `model_id` EN NULL
-- ============================================================================
--
-- `vehicles.model_id`, `vehicles.client_id` y `vehicles.year` son NOT NULL. Dejar el modelo
-- en NULL parecía lo más limpio, pero rompe dos cosas verificadas:
--
--   1. `lookup_vehicle_by_plate` (20260703140000:80) y `staff_lookup_vehicle_by_plate`
--      (20260703160000:21) usan `JOIN public.vehicle_models` — INNER, no LEFT. Con el
--      modelo en NULL devuelven CERO filas, y el vehículo se vuelve invisible para la
--      reserva pública por placa (`PublicReserva.tsx:147`). Silencioso, no da error.
--   2. Las dos RPC de venta validan `model_id_required_for_every_vehicle` y
--      `model_id_not_found` (20260729120000:319-333 y :476-488).
--
-- Por eso el modelo manual SÍ crea una fila en `vehicle_models`, pero marcada `is_manual`.
-- Así ningún JOIN se rompe y la separación es explícita en vez de implícita.
--
-- ============================================================================
-- GARANTÍA — el riesgo real de este cambio
-- ============================================================================
--
-- `src/lib/warranty.ts:46-77` resuelve la condición de garantía así: si el modelo no trae
-- `warranty_km`/`warranty_months`/`warranty_service_interval_km`, cae al FALLBACK GLOBAL de
-- `warranty_conditions` (`:66`). Un modelo manual, que naturalmente no tiene esos valores,
-- heredaría la garantía de GAC y se mostraría como "Garantía activa" en `WarrantyChip`,
-- `AdminGarantias` y el portal del cliente — y además contaría en los KPI de garantía
-- (`AdminGarantias.tsx:186-188`).
--
-- Eso es un FALSO POSITIVO con consecuencia comercial: un tercero apareciendo como unidad
-- en garantía. `warranty.ts` se corrige junto con esta migración para cortar el fallback
-- cuando el modelo es manual. La bandera de acá es lo que le permite distinguirlo.
--
-- ============================================================================

-- 1) Modelos de ingreso manual: no son catálogo comercial.
ALTER TABLE public.vehicle_models
  ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.vehicle_models.is_manual IS
  'true = modelo escrito a mano para un vehículo de tercero que entró solo por servicio. '
  'NO es catálogo comercial: se excluye de los selectores de venta, de AdminModelos y del '
  'fallback global de garantía. Ver 20260730140000.';

-- 2) Vehículos de tercero.
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.vehicles.is_manual IS
  'true = vehículo que no vendimos nosotros, registrado para poder atenderle un servicio. '
  'Nunca debe contar como unidad en garantía.';

-- 3) Clientes de tercero. Esta es la que responde "no puede quedar con nuestros clientes".
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clients.is_manual IS
  'true = persona registrada solo para poder facturarle un servicio puntual; no es cliente '
  'nuestro. Se oculta del listado de Clientes por defecto, no cuenta en métricas y NO se '
  'sincroniza a Kommo (ver reservationAssignment.ts).';

-- 4) Índices parciales: las consultas normales piden "solo los NO manuales", y los manuales
--    van a ser una minoría chica. Un índice parcial sobre la bandera es barato y evita el
--    seq scan cuando el listado de clientes/vehículos filtra por defecto.
CREATE INDEX IF NOT EXISTS idx_clients_is_manual  ON public.clients (is_manual)  WHERE is_manual;
CREATE INDEX IF NOT EXISTS idx_vehicles_is_manual ON public.vehicles (is_manual) WHERE is_manual;

-- 5) Un modelo manual jamás debe traer condiciones de garantía. Si alguien las carga por
--    error desde AdminModelos, esto lo impide a nivel de base en vez de confiar en la UI.
ALTER TABLE public.vehicle_models
  DROP CONSTRAINT IF EXISTS chk_manual_model_has_no_warranty;

ALTER TABLE public.vehicle_models
  ADD CONSTRAINT chk_manual_model_has_no_warranty CHECK (
    NOT is_manual
    OR (warranty_km IS NULL
        AND warranty_months IS NULL
        AND warranty_service_interval_km IS NULL
        AND warranty_condition_id IS NULL)
  );

-- ============================================================================
-- REVERSIÓN (ejecutable — descomentar para revertir)
--
-- ALTER TABLE public.vehicle_models DROP CONSTRAINT IF EXISTS chk_manual_model_has_no_warranty;
-- DROP INDEX IF EXISTS public.idx_vehicles_is_manual;
-- DROP INDEX IF EXISTS public.idx_clients_is_manual;
--
-- -- OJO: soltar estas columnas PIERDE la marca de qué era tercero y qué no. Si ya se
-- -- registraron vehículos manuales, conviene conservarlas aunque se revierta la UI.
-- ALTER TABLE public.clients        DROP COLUMN IF EXISTS is_manual;
-- ALTER TABLE public.vehicles       DROP COLUMN IF EXISTS is_manual;
-- ALTER TABLE public.vehicle_models DROP COLUMN IF EXISTS is_manual;
-- ============================================================================
