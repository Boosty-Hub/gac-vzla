-- Fleet clients and assigned drivers.
--
-- Requirements covered:
--   R8  Optional "fleet client" flag captured when registering a client. It gates the
--       driver field (R5) and documents WHY the survey rate-limit matters for these
--       accounts (a fleet buying 6 units at once must not receive 6 surveys).
--   R5  Assigned driver on the vehicle, chosen from a DROPDOWN rather than free text so
--       "Moisés" / "moisés" / "Moisés López" stop becoming three different people.
--   R9  Search by driver — the FK + index here is what makes that query cheap.
--
-- Design note on the rate limit: `fn_claim_survey_slot` ALREADY suppresses any second
-- survey for the same client within 24h, for every client, fleet or not. So R8's
-- "no reenviar la encuesta múltiples veces el mismo día" needs no new logic — this flag
-- is about the driver field and about reporting, not about re-implementing that guard.

-- ---------------------------------------------------------------------------
-- R8 — fleet flag
-- ---------------------------------------------------------------------------
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS is_fleet boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clients.is_fleet IS
  'Optional flag set when registering a client. Enables the assigned-driver field on that client''s vehicles.';

-- Partial index: fleet clients are the small minority, and every consumer filters
-- `is_fleet = true` (never `= false`), so indexing only the true rows keeps it tiny.
CREATE INDEX IF NOT EXISTS idx_clients_is_fleet
  ON public.clients (id) WHERE is_fleet;

-- ---------------------------------------------------------------------------
-- R5 — drivers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.drivers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  full_name  text NOT NULL,
  cedula     text,
  phone      text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drivers_full_name_not_blank CHECK (btrim(full_name) <> '')
);

COMMENT ON TABLE public.drivers IS
  'Drivers belonging to a fleet client. Vehicles reference one via vehicles.driver_id.';

-- This index IS the requirement, not an optimization. R5 asks for a dropdown instead of
-- a free-text field specifically to stop spelling variants creating duplicate people, so
-- the uniqueness is enforced on a case- and whitespace-normalized name, scoped to the
-- client. Two genuinely different drivers with the identical name under the SAME client
-- would collide; that is the accepted trade for killing the duplicate problem, and such a
-- pair is distinguished by adding a surname. Across different clients the name is free to
-- repeat — R9 explicitly wants both listed so the user can choose.
CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_unique_name_per_client
  ON public.drivers (client_id, lower(btrim(full_name)))
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_drivers_client ON public.drivers (client_id);

-- R9 — name search. `text_pattern_ops` would only serve prefix matches; the UI searches
-- with a contains-style ILIKE, so index the lowered name and let the planner use it for
-- the anchored cases while staying correct for the rest.
CREATE INDEX IF NOT EXISTS idx_drivers_name_lower ON public.drivers (lower(full_name));

DROP TRIGGER IF EXISTS trg_drivers_updated_at ON public.drivers;
CREATE TRIGGER trg_drivers_updated_at
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- R5 — link the driver to the vehicle
-- ---------------------------------------------------------------------------
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.vehicles.driver_id IS
  'Assigned driver (fleet clients only). ON DELETE SET NULL: removing a driver must never delete the vehicle.';

CREATE INDEX IF NOT EXISTS idx_vehicles_driver ON public.vehicles (driver_id) WHERE driver_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS — mirrors the existing `clients_*` policies exactly. A driver is reachable by
-- whoever can reach its client: admins, the client's own portal user, and dealership
-- staff who have serviced that client.
-- ---------------------------------------------------------------------------
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drivers_select ON public.drivers;
CREATE POLICY drivers_select ON public.drivers FOR SELECT USING (
  public.is_admin_user()
  OR client_id = ANY (public.current_user_client_ids())
  OR (
    public.get_user_role() = ANY (ARRAY['concesionario', 'vendedor', 'Asesor de Servicio'])
    AND client_id IN (
      SELECT r.client_id FROM public.reservations r
      WHERE r.dealership_id = ANY (public.current_user_dealership_ids())
        AND r.client_id IS NOT NULL
    )
  )
);

DROP POLICY IF EXISTS drivers_insert ON public.drivers;
CREATE POLICY drivers_insert ON public.drivers FOR INSERT WITH CHECK (
  public.get_user_role() = ANY (ARRAY['superadmin', 'admin', 'concesionario', 'vendedor', 'Asesor de Servicio'])
);

DROP POLICY IF EXISTS drivers_update ON public.drivers;
CREATE POLICY drivers_update ON public.drivers FOR UPDATE USING (
  public.is_admin_user()
  OR (
    public.get_user_role() = ANY (ARRAY['concesionario', 'vendedor', 'Asesor de Servicio'])
    AND client_id IN (
      SELECT r.client_id FROM public.reservations r
      WHERE r.dealership_id = ANY (public.current_user_dealership_ids())
        AND r.client_id IS NOT NULL
    )
  )
);

DROP POLICY IF EXISTS drivers_delete ON public.drivers;
CREATE POLICY drivers_delete ON public.drivers FOR DELETE USING (
  public.is_admin_user()
  OR (
    public.get_user_role() = ANY (ARRAY['concesionario', 'vendedor', 'Asesor de Servicio'])
    AND client_id IN (
      SELECT r.client_id FROM public.reservations r
      WHERE r.dealership_id = ANY (public.current_user_dealership_ids())
        AND r.client_id IS NOT NULL
    )
  )
);
