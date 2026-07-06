-- Hardening menor (hallazgos adversariales LOW).
--
-- salespersons: era legible por CUALQUIER authenticated (incluido un cliente del
-- portal) — directorio de staff (nombre, teléfono, profile_id). Se restringe a
-- roles de staff. Verificado: los hooks useSalespersons/useCurrentSalesperson
-- solo se usan en páginas admin/concesionario, nunca en el portal cliente.
DROP POLICY IF EXISTS "Authenticated can read salespersons" ON public.salespersons;
CREATE POLICY "Staff can read salespersons" ON public.salespersons
  FOR SELECT TO authenticated
  USING (get_user_role() = ANY (ARRAY['superadmin','admin','concesionario','vendedor','Asesor de Servicio']));

-- prospect_vehicles: el form público NO adjunta vehículos de prospecto (verificado
-- en el frontend). La policy anon con WITH CHECK true permitía a un anónimo adjuntar
-- vehículos a CUALQUIER prospect_id. Se elimina (la escritura authenticated scopeada
-- por can_access_prospect se mantiene).
DROP POLICY IF EXISTS anon_insert_prospect_vehicles ON public.prospect_vehicles;

-- NOTA: "Authenticated can insert notifications" se MANTIENE a propósito: el trigger
-- trg_notify_prospect_status (SECURITY INVOKER) lo necesita cuando el staff cambia
-- el estado de un prospecto. El riesgo de spoofing es bajo y no hay inserción directa
-- de notifications desde el frontend.
