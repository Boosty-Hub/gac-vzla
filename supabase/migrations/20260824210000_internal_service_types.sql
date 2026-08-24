-- Internal service types — hidden from the client portal (2026-08-24)
--
-- Reported: "Solicitud de Repuestos" is an INTERNAL parts request routed to the plant.
-- It must not be visible to the client, but staff must keep seeing it in the client's
-- service history.
--
-- The booking flows (public reservation + user portal) already hid the type from the
-- service picker, but nothing hid an EXISTING parts request from the client's own
-- "Mis Citas" list, from the vehicle service history, or from the API: the client
-- branch of `reservations_select` grants every row with a matching `client_id`.
-- Today 15 of the 15 parts requests carry a `client_id`. None of those clients has a
-- portal account yet, which is luck, not design — the first one that gets one sees
-- the request.
--
-- The flag lives on `service_types`, NOT as a hardcoded name, so a new internal
-- service can be added from Configuración → Servicios without touching code.

-- 1) The flag ------------------------------------------------------------------

ALTER TABLE public.service_types
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.service_types.is_internal IS
  'Servicio de uso interno. No se ofrece al cliente al reservar ni aparece en su portal '
  '(citas, historial del vehículo, conteo de servicios para garantía). El personal lo ve '
  'siempre, en Reservas y en el historial del cliente.';

UPDATE public.service_types
   SET is_internal = true, updated_at = now()
 WHERE name = 'Solicitud de Repuestos'
   AND is_internal = false;

-- 2) Lector compartido ---------------------------------------------------------
--
-- SECURITY DEFINER a propósito: se usa dentro de políticas RLS de `reservations` y no
-- puede depender de que el que consulta tenga permiso de leer `service_types`. Hoy la
-- política `service_types_select_all` es `true` para authenticated, pero si mañana se
-- restringe, un subquery plano devolvería "no es interno" y volvería a mostrarlo.
--
-- Un `service_type` que no existe en la tabla (texto libre de reservas viejas) NO es
-- interno: el default seguro acá es mostrar, no esconder por accidente.

CREATE OR REPLACE FUNCTION public.is_internal_service_type(p_service_type text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.service_types st
     WHERE st.name = p_service_type
       AND st.is_internal
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_internal_service_type(text) TO authenticated, anon;

-- 3) RLS: la rama del cliente deja de ver los servicios internos -----------------
--
-- Sólo cambia la última rama (la del cliente del portal). Admin, concesionario,
-- Asesor de Servicio y vendedor quedan exactamente igual: el pedido era que el
-- personal SÍ lo siga viendo en el histórico del cliente.

DROP POLICY IF EXISTS reservations_select ON public.reservations;

CREATE POLICY reservations_select ON public.reservations
FOR SELECT TO authenticated
USING (
  public.is_admin_user()
  OR (
    public.get_user_role() = ANY (ARRAY['concesionario'::text, 'Asesor de Servicio'::text])
    AND dealership_id = ANY (public.current_user_dealership_ids())
  )
  OR (
    public.get_user_role() = 'vendedor'::text
    AND created_by_profile_id = (SELECT auth.uid())
  )
  OR (
    client_id = ANY (public.current_user_client_ids())
    AND NOT public.is_internal_service_type(service_type)
  )
);

-- 4) El cliente tampoco puede cancelar un pedido interno --------------------------
--
-- Sin SELECT ya no puede obtener el id desde la app, pero la política de UPDATE es
-- independiente de la de SELECT: dejarla abierta permitiría cancelar por id a ciegas
-- un pedido de repuestos que el cliente ni siquiera debería saber que existe.

DROP POLICY IF EXISTS "Clients can cancel own reservations" ON public.reservations;

CREATE POLICY "Clients can cancel own reservations" ON public.reservations
FOR UPDATE
USING (
  client_id IN (
    SELECT cu.client_id FROM public.client_users cu WHERE cu.profile_id = auth.uid()
  )
  AND NOT public.is_internal_service_type(service_type)
)
WITH CHECK (
  client_id IN (
    SELECT cu.client_id FROM public.client_users cu WHERE cu.profile_id = auth.uid()
  )
  AND NOT public.is_internal_service_type(service_type)
);
