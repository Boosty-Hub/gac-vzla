-- Track when a prospect's STATUS last changed (not any edit), so the vendedor
-- reminder can flag prospects with no status movement in 2/3 days.
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

UPDATE public.prospects
SET status_updated_at = COALESCE(updated_at, created_at, now())
WHERE status_updated_at IS NULL;

ALTER TABLE public.prospects ALTER COLUMN status_updated_at SET DEFAULT now();

CREATE OR REPLACE FUNCTION public.set_prospect_status_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prospect_status_updated_at ON public.prospects;
CREATE TRIGGER trg_prospect_status_updated_at
  BEFORE UPDATE ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.set_prospect_status_updated_at();
