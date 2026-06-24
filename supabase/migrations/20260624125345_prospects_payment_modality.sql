-- REQ7: add "Modalidad de pago" (payment modality) to prospects.
-- Dropdown values from the UI: 'Contado' | 'Financiamiento'. Nullable so existing
-- prospects keep working; the UI Select constrains the values on write.
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS payment_modality text;

COMMENT ON COLUMN public.prospects.payment_modality IS 'Modalidad de pago del prospecto: Contado | Financiamiento (nullable).';
