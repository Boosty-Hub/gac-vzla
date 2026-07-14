-- Reservations: explicit "Estado de Venezuela".
--
-- Until now this value existed only in Kommo, where it was guessed from the
-- dealership NAME via a hardcoded keyword map in the kommo-api edge function.
-- That map resolved 11 of 20 active dealerships incorrectly (7 -> NULL,
-- 4 -> "Caracas", which is not a Venezuelan state), so it had to be corrected
-- by hand in Kommo on every reservation.
--
-- The real value already lives in dealerships.state. This column lets a
-- reservation carry its own state:
--   NULL  -> inherit from the reservation's dealership (the normal case)
--   set   -> an explicit override chosen by the user in the reservation form
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS state text;

COMMENT ON COLUMN public.reservations.state IS
  'Estado de Venezuela. NULL means inherit from dealerships.state.';

-- Data fix: "GAC - El Tigre" stored the state without its accent, so it never
-- matched the canonical VENEZUELA_STATES list used by the UI selects and would
-- render as an empty selection.
UPDATE public.dealerships
   SET state = 'Anzoátegui'
 WHERE state = 'Anzoategui';
