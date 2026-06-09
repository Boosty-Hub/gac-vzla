-- Backfill de garantía por modelo para DFSK (modelos que estaban sin configurar
-- y heredaban por fallback los términos de la garantía global GAC, mostrando datos
-- errados en la vista del cliente).
--
-- Regla derivada de los modelos DFSK ya configurados:
--   Serie C (C31/C32/C35/C37) y Serie K (K01H/K01S/K02S/K05S/K07S) → 30.000 km / 12 meses
--   Pick Up D1                                                     → 60.000 km / 24 meses
-- Confirmado con el cliente para las líneas sin referencia previa:
--   SUV/Pasajeros (GLORY 330/500/500T/560/580/600, IX5, E5)        → 30.000 km / 12 meses
--   Pickup/Carga  (D51, D71, D71-PLUS, D72-PLUS, Z9)               → 60.000 km / 24 meses
--   service_interval_km = 5000 (igual que todo el catálogo)
--
-- Idempotente: solo afecta filas con garantía NULL, no toca lo ya configurado.

-- 1) Pickups / carga → 60.000 km / 24 meses
UPDATE public.vehicle_models
SET warranty_km = 60000, warranty_months = 24, warranty_service_interval_km = 5000
WHERE brand = 'DFSK'
  AND warranty_km IS NULL AND warranty_months IS NULL
  AND (name LIKE 'D51%' OR name LIKE 'D71%' OR name LIKE 'D72%' OR name LIKE 'Z9%');

-- 2) Resto de DFSK sin configurar (SUV/pasajeros, Serie C/K) → 30.000 km / 12 meses
UPDATE public.vehicle_models
SET warranty_km = 30000, warranty_months = 12, warranty_service_interval_km = 5000
WHERE brand = 'DFSK'
  AND warranty_km IS NULL AND warranty_months IS NULL;
