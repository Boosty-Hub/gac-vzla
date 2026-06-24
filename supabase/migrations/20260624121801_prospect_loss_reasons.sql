CREATE TABLE IF NOT EXISTS public.prospect_loss_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kommo_loss_reason_id bigint UNIQUE NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS loss_reason_id bigint;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS loss_reason text;

ALTER TABLE public.prospect_loss_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loss_reasons_read_all" ON public.prospect_loss_reasons;
CREATE POLICY "loss_reasons_read_all" ON public.prospect_loss_reasons FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "loss_reasons_admin_write" ON public.prospect_loss_reasons;
CREATE POLICY "loss_reasons_admin_write" ON public.prospect_loss_reasons FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());
