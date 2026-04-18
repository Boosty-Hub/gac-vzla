-- Add FK from vehicle_models to warranty_conditions for persistent warranty linkage

ALTER TABLE public.vehicle_models
  ADD COLUMN IF NOT EXISTS warranty_condition_id bigint NULL
  REFERENCES public.warranty_conditions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vehicle_models_warranty_condition_id
  ON public.vehicle_models(warranty_condition_id);

-- Backfill: match existing raw values to existing conditions (best effort)
UPDATE public.vehicle_models vm
SET warranty_condition_id = wc.id
FROM public.warranty_conditions wc
WHERE vm.warranty_km = wc.max_km
  AND vm.warranty_months = wc.max_months
  AND vm.warranty_service_interval_km = wc.service_interval_km
  AND vm.warranty_condition_id IS NULL;
