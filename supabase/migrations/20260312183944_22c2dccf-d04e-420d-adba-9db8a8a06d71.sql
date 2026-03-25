
-- Add profile_id column to salespersons to link with platform users
ALTER TABLE public.salespersons ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_salespersons_profile_id ON public.salespersons(profile_id);
