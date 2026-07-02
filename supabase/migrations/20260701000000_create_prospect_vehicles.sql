-- re3: multiple vehicle units per prospect.
-- prospect_vehicles is the multi-unit store. prospects.model_interest is kept as the
-- denormalized "primary unit" mirror (what the Kommo integration reads/writes), so the
-- existing single-model sync stays untouched.

CREATE TABLE IF NOT EXISTS public.prospect_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  brand text,
  model text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospect_vehicles_prospect_id
  ON public.prospect_vehicles(prospect_id);

ALTER TABLE public.prospect_vehicles ENABLE ROW LEVEL SECURITY;

-- Mirror prospects RLS: authenticated users manage all rows; anon may insert (public landing).
DROP POLICY IF EXISTS "Authenticated users can manage prospect_vehicles" ON public.prospect_vehicles;
CREATE POLICY "Authenticated users can manage prospect_vehicles"
  ON public.prospect_vehicles FOR ALL
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "anon_insert_prospect_vehicles" ON public.prospect_vehicles;
CREATE POLICY "anon_insert_prospect_vehicles"
  ON public.prospect_vehicles FOR INSERT TO anon
  WITH CHECK (true);

-- Backfill: one primary unit per existing prospect that has a model_interest.
-- Idempotent: skips prospects that already have units.
INSERT INTO public.prospect_vehicles (prospect_id, brand, model, sort_order)
SELECT p.id,
       split_part(btrim(p.model_interest), ' ', 1) AS brand,
       CASE WHEN strpos(btrim(p.model_interest), ' ') > 0
            THEN btrim(substr(btrim(p.model_interest), strpos(btrim(p.model_interest), ' ') + 1))
            ELSE NULL END AS model,
       0
FROM public.prospects p
WHERE p.model_interest IS NOT NULL
  AND btrim(p.model_interest) <> ''
  AND NOT EXISTS (SELECT 1 FROM public.prospect_vehicles pv WHERE pv.prospect_id = p.id);
