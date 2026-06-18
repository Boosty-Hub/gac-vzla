-- Separate internal notes from the incident/service description.
-- Until now both lived in `notes`, which mixed GAC-only internal notes
-- with the incident description (and leaked them into Kommo).

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS internal_notes text;

-- Backfill: for regular reservations the `notes` column actually held the
-- internal notes, so move them to the dedicated column. Incidencias keep
-- `notes` as their description (historical concatenations cannot be split).
UPDATE public.reservations
SET internal_notes = notes,
    notes = NULL
WHERE service_type NOT IN ('Incidencia', 'Falla o Desperfecto')
  AND notes IS NOT NULL
  AND btrim(notes) <> '';
