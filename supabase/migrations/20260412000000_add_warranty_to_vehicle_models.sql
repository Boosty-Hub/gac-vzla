-- migration: add per-model warranty fields to vehicle_models
-- purpose: allow each vehicle model to define its own warranty (km, months, service interval)
--          if null, the system falls back to the global warranty_conditions

ALTER TABLE public.vehicle_models
  ADD COLUMN IF NOT EXISTS warranty_km integer,
  ADD COLUMN IF NOT EXISTS warranty_months integer,
  ADD COLUMN IF NOT EXISTS warranty_service_interval_km integer;

COMMENT ON COLUMN public.vehicle_models.warranty_km IS 'Max km for this model warranty (null = use global warranty_conditions)';
COMMENT ON COLUMN public.vehicle_models.warranty_months IS 'Max months for this model warranty (null = use global warranty_conditions)';
COMMENT ON COLUMN public.vehicle_models.warranty_service_interval_km IS 'Service interval km for this model warranty (null = use global warranty_conditions)';
