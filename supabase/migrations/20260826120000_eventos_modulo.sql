-- Módulo de Eventos — de catálogo de nombres a control de leads (2026-08-26)
--
-- `prospect_events` era una lista de nombres: id, name, sort_order, is_active. Servía para
-- llenar un selector en Prospectos y nada más. El pedido es convertirlo en el módulo donde se
-- controla un evento completo: quién participa, qué se exhibe, cuánto costó, cuántos leads
-- entraron y cuántos de esos compraron.
--
-- DECISIONES QUE IMPORTAN
--
-- 1. El vínculo evento <-> lead sigue siendo `prospects.event_name` (texto), NO una FK nueva.
--    Hay 1.270 prospectos ya clasificados por ese texto y los leads que llegan desde Kommo lo
--    escriben así. Cambiarlo a FK obligaría a migrar esas filas y a tocar el webhook de Kommo,
--    que es exactamente lo que el pedido dice que NO se toca. El módulo lee, no reescribe.
--
-- 2. Renombrar un evento re-apunta sus leads. Por eso el rename queda bloqueado del lado de la
--    base cuando el evento ya tiene leads (ver trg_prospect_events_guard_rename): sin ese corte,
--    editar el nombre desde el panel dejaría 359 leads huérfanos en silencio.
--
-- 3. Vendedores, marcas y vehículos exhibidos van en arrays y no en tablas puente. Son listas
--    cortas, sin atributos propios y sin consultas cruzadas: una tabla puente acá agrega tres
--    joins y cero información.
--
-- 4. Las métricas salen de una vista con `security_invoker`, así el conteo respeta la MISMA RLS
--    de Prospectos. Un concesionario ve el evento con SUS leads, no con los de otra sede.

-- ---------------------------------------------------------------- columnas del evento
ALTER TABLE public.prospect_events
  ADD COLUMN IF NOT EXISTS description          text,
  ADD COLUMN IF NOT EXISTS start_date           date,
  ADD COLUMN IF NOT EXISTS end_date             date,
  ADD COLUMN IF NOT EXISTS location             text,
  ADD COLUMN IF NOT EXISTS dealership_id        uuid REFERENCES public.dealerships(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS brands               text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS exhibited_vehicles   text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS salesperson_ids      uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS investment           numeric(14,2),
  ADD COLUMN IF NOT EXISTS investment_currency  text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS capture_form_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at           timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.prospect_events.salesperson_ids IS
  'Vendedores que atienden el evento. Alimenta el desplegable del formulario de captacion: ahi se ofrecen SOLO estos, no el listado completo.';
COMMENT ON COLUMN public.prospect_events.capture_form_enabled IS
  'Interruptor del formulario de captacion del evento. Apagado, el enlace deja de aceptar registros sin borrar el evento.';

ALTER TABLE public.prospect_events
  DROP CONSTRAINT IF EXISTS prospect_events_investment_check;
ALTER TABLE public.prospect_events
  ADD CONSTRAINT prospect_events_investment_check CHECK (investment IS NULL OR investment >= 0);

ALTER TABLE public.prospect_events
  DROP CONSTRAINT IF EXISTS prospect_events_dates_check;
ALTER TABLE public.prospect_events
  ADD CONSTRAINT prospect_events_dates_check
  CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);

-- El nombre es la clave real del vínculo con los leads: dos eventos con el mismo nombre
-- mezclarían sus leads sin que nadie lo note.
CREATE UNIQUE INDEX IF NOT EXISTS prospect_events_name_key
  ON public.prospect_events (lower(btrim(name)));

-- Busca los leads del evento por nombre. Sin esto cada tarjeta hace un seq scan de 3.623 filas.
CREATE INDEX IF NOT EXISTS prospects_event_name_idx
  ON public.prospects (event_name) WHERE event_name IS NOT NULL;

-- --------------------------------------------------- rename bloqueado si ya hay leads
CREATE OR REPLACE FUNCTION public.guard_prospect_event_rename()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_leads bigint;
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    SELECT count(*) INTO v_leads FROM public.prospects WHERE event_name = OLD.name;
    IF v_leads > 0 THEN
      RAISE EXCEPTION 'evento_con_leads:%', v_leads
        USING HINT = 'Renombrar este evento dejaria sus leads sin evento. Crea uno nuevo.';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_prospect_events_guard_rename ON public.prospect_events;
CREATE TRIGGER trg_prospect_events_guard_rename
  BEFORE UPDATE ON public.prospect_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_prospect_event_rename();

-- ------------------------------------------------------------------------- métricas
-- `security_invoker` es el punto entero de la vista: sin él, PostgreSQL la evalúa con los
-- permisos del dueño y un concesionario vería el conteo de TODAS las sedes mientras la lista de
-- leads de abajo le muestra sólo la suya. Dos números distintos para la misma pantalla.
DROP VIEW IF EXISTS public.prospect_event_stats;
CREATE VIEW public.prospect_event_stats
WITH (security_invoker = true) AS
SELECT
  e.id                                                            AS event_id,
  e.name                                                          AS event_name,
  count(p.id)                                                     AS leads_total,
  count(p.id) FILTER (WHERE p.status = 'ganado')                  AS ganados,
  count(p.id) FILTER (WHERE p.status = 'perdido')                 AS perdidos,
  count(p.id) FILTER (WHERE p.status NOT IN ('ganado','perdido')) AS en_gestion,
  count(p.id) FILTER (WHERE p.test_drive)                         AS test_drives,
  count(p.id) FILTER (WHERE p.visited_showroom)                   AS visitas_showroom,
  max(p.created_at)                                               AS ultimo_lead_at
FROM public.prospect_events e
LEFT JOIN public.prospects p ON p.event_name = e.name
GROUP BY e.id, e.name;

COMMENT ON VIEW public.prospect_event_stats IS
  'Conteo de leads por evento, respetando la RLS de prospects (security_invoker). Es la fuente del retorno de inversion que muestra el modulo de Eventos.';

GRANT SELECT ON public.prospect_event_stats TO authenticated;

-- --------------------------------------------------------------------------- permisos
-- Antes: `is_admin_user()` para todo. Con eso, otorgar "eventos.edit" desde Configuración →
-- Roles no servía de nada — la base rechazaba igual. Ahora la política pregunta por el permiso,
-- que es la regla del proyecto: un módulo se administra desde el panel, no desde el código.
DROP POLICY IF EXISTS "Admins can manage prospect_events" ON public.prospect_events;
DROP POLICY IF EXISTS prospect_events_insert ON public.prospect_events;
DROP POLICY IF EXISTS prospect_events_update ON public.prospect_events;
DROP POLICY IF EXISTS prospect_events_delete ON public.prospect_events;

CREATE POLICY prospect_events_insert ON public.prospect_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user() OR public.has_permission('eventos.create'));

CREATE POLICY prospect_events_update ON public.prospect_events
  FOR UPDATE TO authenticated
  USING (public.is_admin_user() OR public.has_permission('eventos.edit'))
  WITH CHECK (public.is_admin_user() OR public.has_permission('eventos.edit'));

CREATE POLICY prospect_events_delete ON public.prospect_events
  FOR DELETE TO authenticated
  USING (public.is_admin_user() OR public.has_permission('eventos.delete'));
