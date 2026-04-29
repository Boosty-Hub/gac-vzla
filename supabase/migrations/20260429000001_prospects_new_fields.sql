-- Nuevos campos en prospects: test drive, tipo persona, genero, rango edad
ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS test_drive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS person_type text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS age_range text;

ALTER TABLE public.prospects DROP CONSTRAINT IF EXISTS prospects_person_type_check;
ALTER TABLE public.prospects ADD CONSTRAINT prospects_person_type_check
  CHECK (person_type IS NULL OR person_type IN ('natural','juridica'));

ALTER TABLE public.prospects DROP CONSTRAINT IF EXISTS prospects_gender_check;
ALTER TABLE public.prospects ADD CONSTRAINT prospects_gender_check
  CHECK (gender IS NULL OR gender IN ('masculino','femenino'));

ALTER TABLE public.prospects DROP CONSTRAINT IF EXISTS prospects_age_range_check;
ALTER TABLE public.prospects ADD CONSTRAINT prospects_age_range_check
  CHECK (age_range IS NULL OR age_range IN ('20-30','30-40','40+'));
