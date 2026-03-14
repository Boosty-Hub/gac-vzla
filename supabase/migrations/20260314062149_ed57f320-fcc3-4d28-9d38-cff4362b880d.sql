ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pin_code text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_pin_code_unique ON public.profiles (pin_code) WHERE pin_code IS NOT NULL;