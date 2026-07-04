-- Fase 2B — Parte 2 (RESTRICTIVA): aislamiento entre concesionarios/vendedores/clientes.
--
-- ⚠️ APLICAR SOLO DESPUES de: (1) Parte 1 aplicada y (2) frontend nuevo desplegado.
-- Si se aplica con el frontend viejo, rompe PublicReserva / dedupe / calendario,
-- porque esas pantallas aun harian queries directas que estas politicas bloquean.
--
-- Cierra: A1 (prospects), A2 (clients/vehicles/reservations), fuga anon de vehicles,
-- y M4 (prospect_updates/prospect_vehicles).

-- ============================================================================
-- PROSPECTS (A1): admin ve todo; concesionario por dealership; vendedor por
-- salesperson (nombre no editable). Asesor de Servicio NO ve prospects.
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can manage prospects" ON public.prospects;
DROP POLICY IF EXISTS "anon_insert_prospects" ON public.prospects;

CREATE POLICY prospects_select ON public.prospects FOR SELECT TO authenticated USING (
  public.is_admin_user()
  OR (public.get_user_role() = 'concesionario' AND dealership_id = ANY((SELECT public.current_user_dealership_ids())))
  OR (public.get_user_role() = 'vendedor'      AND salesperson  = ANY((SELECT public.current_user_salesperson_names())))
);

CREATE POLICY prospects_insert ON public.prospects FOR INSERT TO authenticated WITH CHECK (
  public.is_admin_user()
  OR (public.get_user_role() = 'concesionario' AND dealership_id = ANY((SELECT public.current_user_dealership_ids())))
  OR (public.get_user_role() = 'vendedor'      AND salesperson  = ANY((SELECT public.current_user_salesperson_names())))
);

CREATE POLICY prospects_update ON public.prospects FOR UPDATE TO authenticated
USING (
  public.is_admin_user()
  OR (public.get_user_role() = 'concesionario' AND dealership_id = ANY((SELECT public.current_user_dealership_ids())))
  OR (public.get_user_role() = 'vendedor'      AND salesperson  = ANY((SELECT public.current_user_salesperson_names())))
)
WITH CHECK (
  public.is_admin_user()
  OR (public.get_user_role() = 'concesionario' AND dealership_id = ANY((SELECT public.current_user_dealership_ids())))
  OR (public.get_user_role() = 'vendedor'      AND salesperson  = ANY((SELECT public.current_user_salesperson_names())))
);

CREATE POLICY prospects_delete ON public.prospects FOR DELETE TO authenticated USING (
  public.is_admin_user()
  OR (public.get_user_role() = 'concesionario' AND dealership_id = ANY((SELECT public.current_user_dealership_ids())))
  OR (public.get_user_role() = 'vendedor'      AND salesperson  = ANY((SELECT public.current_user_salesperson_names())))
);

-- Landing publico: solo puede crear prospectos con status inicial 'nuevo'.
CREATE POLICY anon_insert_prospects ON public.prospects FOR INSERT TO anon WITH CHECK (
  status = 'nuevo'
);

-- ============================================================================
-- CLIENTS (A2): admin todo; cliente lo suyo; staff los clientes ligados a una
-- reserva de su concesionario. (INSERT/UPDATE/DELETE se mantienen como estaban:
-- gateados por rol staff — el staff crea clientes al agendar.)
-- ============================================================================
DROP POLICY IF EXISTS clients_select ON public.clients;
CREATE POLICY clients_select ON public.clients FOR SELECT TO authenticated USING (
  public.is_admin_user()
  OR id = ANY((SELECT public.current_user_client_ids()))
  OR (public.get_user_role() IN ('concesionario','vendedor','Asesor de Servicio')
      AND id IN (
        SELECT client_id FROM public.reservations
        WHERE dealership_id = ANY((SELECT public.current_user_dealership_ids())) AND client_id IS NOT NULL
      ))
);

-- ============================================================================
-- VEHICLES (A2 + fuga anon): admin todo; cliente los suyos; staff los ligados a
-- reservas de su concesionario. Se ELIMINA la lectura anon masiva (el flujo
-- publico por placa ahora va por la RPC lookup_vehicle_by_plate, sin PII).
-- ============================================================================
DROP POLICY IF EXISTS anon_read_vehicles_by_plate ON public.vehicles;
DROP POLICY IF EXISTS vehicles_select ON public.vehicles;
CREATE POLICY vehicles_select ON public.vehicles FOR SELECT TO authenticated USING (
  public.is_admin_user()
  OR client_id = ANY((SELECT public.current_user_client_ids()))
  OR (public.get_user_role() IN ('concesionario','vendedor','Asesor de Servicio')
      AND id IN (
        SELECT vehicle_id FROM public.reservations
        WHERE dealership_id = ANY((SELECT public.current_user_dealership_ids())) AND vehicle_id IS NOT NULL
      ))
);

-- ============================================================================
-- RESERVATIONS (A2): admin todo; concesionario/asesor por dealership; vendedor
-- solo las que EL creo (created_by_profile_id); cliente las suyas. Se elimina el
-- INSERT anon (ahora via RPC create_public_reservation).
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated can read reservations" ON public.reservations;
DROP POLICY IF EXISTS "Staff can update reservations" ON public.reservations;
DROP POLICY IF EXISTS "Staff can delete reservations" ON public.reservations;
DROP POLICY IF EXISTS "anon_insert_reservations" ON public.reservations;

CREATE POLICY reservations_select ON public.reservations FOR SELECT TO authenticated USING (
  public.is_admin_user()
  OR (public.get_user_role() IN ('concesionario','Asesor de Servicio') AND dealership_id = ANY((SELECT public.current_user_dealership_ids())))
  OR (public.get_user_role() = 'vendedor' AND created_by_profile_id = (SELECT auth.uid()))
  OR client_id = ANY((SELECT public.current_user_client_ids()))
);

CREATE POLICY "Staff can update reservations" ON public.reservations FOR UPDATE TO authenticated USING (
  public.is_admin_user()
  OR (public.get_user_role() IN ('concesionario','Asesor de Servicio') AND dealership_id = ANY((SELECT public.current_user_dealership_ids())))
  OR (public.get_user_role() = 'vendedor' AND created_by_profile_id = (SELECT auth.uid()))
);

CREATE POLICY "Staff can delete reservations" ON public.reservations FOR DELETE TO authenticated USING (
  public.is_admin_user()
  OR (public.get_user_role() IN ('concesionario','Asesor de Servicio') AND dealership_id = ANY((SELECT public.current_user_dealership_ids())))
  OR (public.get_user_role() = 'vendedor' AND created_by_profile_id = (SELECT auth.uid()))
);
-- Se mantienen: "Clients can cancel own reservations" (UPDATE) y
-- "Authenticated can insert reservations" (INSERT) para el flujo del portal cliente/staff.

-- ============================================================================
-- PROSPECT_UPDATES / PROSPECT_VEHICLES (M4): acotar por can_access_prospect().
-- ============================================================================
DROP POLICY IF EXISTS "authenticated users can read prospect updates" ON public.prospect_updates;
CREATE POLICY prospect_updates_select ON public.prospect_updates FOR SELECT TO authenticated
  USING (public.can_access_prospect(prospect_id));

DROP POLICY IF EXISTS "authenticated users can insert prospect updates" ON public.prospect_updates;
CREATE POLICY prospect_updates_insert ON public.prospect_updates FOR INSERT TO authenticated
  WITH CHECK (public.can_access_prospect(prospect_id) AND user_id = (SELECT auth.uid()));
-- Se mantiene "users can delete own prospect updates".

DROP POLICY IF EXISTS "Authenticated users can manage prospect_vehicles" ON public.prospect_vehicles;
CREATE POLICY prospect_vehicles_all ON public.prospect_vehicles FOR ALL TO authenticated
  USING (public.can_access_prospect(prospect_id))
  WITH CHECK (public.can_access_prospect(prospect_id));
-- Se mantiene "anon_insert_prospect_vehicles" para el landing publico.

-- NOTA: prospect_events es un CATALOGO de tipos de evento (sin prospect_id), no PII → se deja legible.
