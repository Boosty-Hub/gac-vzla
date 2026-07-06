-- Hardening de hallazgos de la revisión adversarial final.
--
-- HIGH: integration_configs.config contiene el access_token de Kommo y era
--       legible por CUALQUIER usuario autenticado (incluido un cliente del
--       portal). Se restringe a admin. Las edge functions lo leen con service
--       role (bypass RLS), así que no se afectan. En el frontend solo lo lee
--       AdminAutomatizaciones (pantalla admin).
DROP POLICY IF EXISTS "Authenticated users can read integration_configs" ON public.integration_configs;
CREATE POLICY "Admins can read integration_configs" ON public.integration_configs
  FOR SELECT TO authenticated USING (is_admin_user());

-- LOW-MED: integration_logs.details puede contener PII de leads -> solo admin.
DROP POLICY IF EXISTS "Authenticated users can read integration_logs" ON public.integration_logs;
CREATE POLICY "Admins can read integration_logs" ON public.integration_logs
  FOR SELECT TO authenticated USING (is_admin_user());

-- MEDIUM: clients/vehicles tenían UPDATE/DELETE por rol SIN scoping (un vendedor
-- podía modificar/borrar cualquier cliente/vehículo del sistema si obtenía el
-- UUID). Se scopea igual que el SELECT: admin, o staff sobre registros ligados a
-- reservas de su concesionario. (INSERT se mantiene por rol para el alta walk-in.)
DROP POLICY IF EXISTS clients_update ON public.clients;
CREATE POLICY clients_update ON public.clients FOR UPDATE TO authenticated USING (
  is_admin_user()
  OR (get_user_role() = ANY (ARRAY['concesionario','vendedor','Asesor de Servicio'])
      AND id IN (SELECT client_id FROM public.reservations
                 WHERE dealership_id = ANY (current_user_dealership_ids()) AND client_id IS NOT NULL))
);

DROP POLICY IF EXISTS clients_delete ON public.clients;
CREATE POLICY clients_delete ON public.clients FOR DELETE TO authenticated USING (
  is_admin_user()
  OR (get_user_role() = ANY (ARRAY['concesionario','vendedor','Asesor de Servicio'])
      AND id IN (SELECT client_id FROM public.reservations
                 WHERE dealership_id = ANY (current_user_dealership_ids()) AND client_id IS NOT NULL))
);

DROP POLICY IF EXISTS vehicles_update ON public.vehicles;
CREATE POLICY vehicles_update ON public.vehicles FOR UPDATE TO authenticated USING (
  is_admin_user()
  OR (get_user_role() = ANY (ARRAY['concesionario','vendedor','Asesor de Servicio'])
      AND id IN (SELECT vehicle_id FROM public.reservations
                 WHERE dealership_id = ANY (current_user_dealership_ids()) AND vehicle_id IS NOT NULL))
);

DROP POLICY IF EXISTS vehicles_delete ON public.vehicles;
CREATE POLICY vehicles_delete ON public.vehicles FOR DELETE TO authenticated USING (
  is_admin_user()
  OR (get_user_role() = ANY (ARRAY['concesionario','vendedor','Asesor de Servicio'])
      AND id IN (SELECT vehicle_id FROM public.reservations
                 WHERE dealership_id = ANY (current_user_dealership_ids()) AND vehicle_id IS NOT NULL))
);

-- NOTA (aceptado / documentado, no en esta migración):
--  * staff_lookup_vehicle_by_plate devuelve PII (cédula/tel) de cualquier placa a
--    staff: es necesario para atender walk-ins (un cliente nuevo no está ligado al
--    concesionario). Mitigación: es staff-only (no anon) + rate limit (Fase 4).
--  * salespersons legible por authenticated: directorio de staff, riesgo bajo.
--  * inserts anon de prospects/reservations: por diseño del form público;
--    mitigar con captcha/rate-limit (Fase 4).
