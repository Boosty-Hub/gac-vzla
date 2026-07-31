-- Un modelo manual por (marca, modelo) — cierra la carrera del find-or-create.
--
-- El flujo de vehículo de tercero hace "buscar, y si no está, crear". Entre el SELECT y el
-- INSERT hay una ventana: si dos personas registran un "Toyota Corolla" al mismo tiempo,
-- ambas consultas no encuentran nada y ambas insertan. Resultado: dos modelos manuales
-- idénticos, y a partir de ahí los vehículos quedan repartidos entre los dos.
--
-- La deduplicación en la aplicación es "mejor esfuerzo"; esto la vuelve una garantía.
-- Índice ÚNICO PARCIAL sobre las versiones en minúscula, porque el emparejamiento en la
-- app es `ilike` (no distingue mayúsculas): sin `lower()` el índice dejaría pasar
-- "TOYOTA Corolla" y "Toyota corolla" como distintos, que es justo lo que se quiere evitar.
--
-- Solo aplica a `is_manual = true`. El catálogo comercial queda intacto: ahí conviven a
-- propósito varias filas con el mismo nombre y distinta configuración de garantía.
--
-- Antes de crear el índice se consolidan los duplicados que ya existieran: se conserva la
-- fila más antigua de cada grupo, se repuntan sus vehículos y se borran las sobrantes.
-- Al 2026-07-30 no hay ningún modelo manual todavía (la funcionalidad se acaba de
-- desplegar), así que en la práctica esto no toca nada — pero la migración tiene que ser
-- correcta si se re-ejecuta más adelante sobre datos reales.

-- 1) Repuntar los vehículos de cada duplicado hacia el modelo manual más antiguo del grupo.
WITH canonical AS (
  SELECT id,
         first_value(id) OVER (
           PARTITION BY lower(btrim(brand)), lower(btrim(name))
           ORDER BY created_at, id
         ) AS keep_id
    FROM public.vehicle_models
   WHERE is_manual
)
UPDATE public.vehicles v
   SET model_id = c.keep_id
  FROM canonical c
 WHERE v.model_id = c.id
   AND c.id <> c.keep_id;

-- 2) Borrar las filas duplicadas que ya no referencia ningún vehículo.
WITH canonical AS (
  SELECT id,
         first_value(id) OVER (
           PARTITION BY lower(btrim(brand)), lower(btrim(name))
           ORDER BY created_at, id
         ) AS keep_id
    FROM public.vehicle_models
   WHERE is_manual
)
DELETE FROM public.vehicle_models m
 USING canonical c
 WHERE m.id = c.id
   AND c.id <> c.keep_id;

-- 3) La garantía: a partir de acá la base impide el duplicado.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_models_manual_brand_name
  ON public.vehicle_models (lower(btrim(brand)), lower(btrim(name)))
  WHERE is_manual;

COMMENT ON INDEX public.uq_vehicle_models_manual_brand_name IS
  'Un solo modelo manual por (marca, modelo), sin distinguir mayúsculas ni espacios al '
  'borde. Cierra la carrera del find-or-create en el registro de vehículos de terceros. '
  'No aplica al catálogo comercial (is_manual = false).';

-- ============================================================================
-- REVERSIÓN (ejecutable — descomentar)
--
-- DROP INDEX IF EXISTS public.uq_vehicle_models_manual_brand_name;
--
-- La consolidación de duplicados de los pasos 1 y 2 NO es reversible: las filas borradas
-- no vuelven. Como los vehículos quedaron repuntados a la fila conservada, no se pierde
-- ningún vehículo — solo desaparecen modelos manuales redundantes.
-- ============================================================================
