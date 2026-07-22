-- Adds an optional, client-visible follow-up recommendation to reservations.
-- Distinct from `internal_notes` (staff-only): `recommendation` is meant to be
-- shown to the client (admin/dealership complete dialogs write it, client
-- portals read it).
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS recommendation text;
