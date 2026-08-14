-- Recordatorio diario de citas abiertas, a las 4 de la tarde hora Venezuela.
--
-- Problema: las citas del día que nadie cierra quedan abiertas, y una cita que no pasa a
-- "Completada" nunca dispara la encuesta de postventa. El aviso llega antes de que termine
-- la jornada para que dé tiempo a cerrarlas.
--
-- Tres decisiones que conviene entender antes de tocar esto:
--
-- 1) El destinatario se decide POR PERMISO, no por nombre de rol. Se reparte a todo perfil
--    cuyo rol tenga `reservas.recordatorio`. Así se activa o se corta desde la pantalla de
--    Roles, sin SQL. El requerimiento pedía asesor de servicio, concesionario y admin: eso
--    es el estado inicial de los grants, no una condición cableada.
--
-- 2) El cron corre CADA HORA y la función decide si es la hora configurada. La alternativa
--    era reprogramar el cron cada vez que alguien cambia el horario, lo que obliga a tocar
--    SQL. Así el horario es un número en una tabla que la UI edita.
--
-- 3) La hora se compara en `America/Caracas`. El servidor corre en UTC y Venezuela no tiene
--    horario de verano, así que el offset -4 es fijo, pero se deja explícito para que quede
--    escrito de dónde sale.

-- ── Configuración editable desde el panel ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reminder_settings (
  -- Fila única: el CHECK sobre una PK booleana hace imposible insertar una segunda.
  id                        boolean PRIMARY KEY DEFAULT true CHECK (id),
  open_reservations_enabled boolean NOT NULL DEFAULT true,
  open_reservations_hour    int     NOT NULL DEFAULT 16 CHECK (open_reservations_hour BETWEEN 0 AND 23),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.reminder_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.reminder_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reminder_settings_select ON public.reminder_settings;
CREATE POLICY reminder_settings_select ON public.reminder_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS reminder_settings_update ON public.reminder_settings;
CREATE POLICY reminder_settings_update ON public.reminder_settings
  FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

-- ── Permiso ──────────────────────────────────────────────────────────────────
INSERT INTO public.permissions (name, description, module)
SELECT 'reservas.recordatorio', 'Recibir el recordatorio diario de citas sin cerrar', 'reservas'
WHERE NOT EXISTS (SELECT 1 FROM public.permissions WHERE name = 'reservas.recordatorio');

-- Estado inicial pedido por el requerimiento. Superadmin va incluido porque el bypass de
-- superadmin vive en el frontend y esta función reparte desde SQL: sin la fila, no le llega.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM public.roles r
  CROSS JOIN public.permissions p
 WHERE p.name = 'reservas.recordatorio'
   AND r.name IN ('superadmin', 'admin', 'concesionario', 'Asesor de Servicio')
   AND NOT EXISTS (
     SELECT 1 FROM public.role_permissions rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
   );

-- ── La barredora ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_notify_open_reservations()
 RETURNS TABLE(notified integer, skipped_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_enabled boolean;
  v_hour    int;
  v_now_ve  timestamp;
  v_today   date;
  v_total   int;
  v_row     record;
  v_count   int := 0;
BEGIN
  SELECT open_reservations_enabled, open_reservations_hour
    INTO v_enabled, v_hour
    FROM public.reminder_settings WHERE id;

  IF NOT coalesce(v_enabled, false) THEN
    RETURN QUERY SELECT 0, 'disabled'::text;
    RETURN;
  END IF;

  v_now_ve := now() AT TIME ZONE 'America/Caracas';
  v_today  := v_now_ve::date;

  IF EXTRACT(hour FROM v_now_ve)::int <> v_hour THEN
    RETURN QUERY SELECT 0, 'not_the_configured_hour'::text;
    RETURN;
  END IF;

  -- Citas de HOY que siguen abiertas. Abierta = todo lo que no está cerrado; `en_proceso`
  -- cuenta porque tampoco dispara la encuesta. Espejo de ARCHIVED_RESERVATION_STATUSES.
  SELECT count(*) INTO v_total
    FROM public.reservations
   WHERE reservation_date = v_today
     AND status NOT IN ('completada', 'cancelada');

  IF coalesce(v_total, 0) = 0 THEN
    RETURN QUERY SELECT 0, 'nothing_open'::text;
    RETURN;
  END IF;

  FOR v_row IN
    SELECT prof.id AS profile_id,
           (rol.name IN ('superadmin', 'admin')) AS ve_todo,
           -- Para quien no es admin, sólo sus concesionarios.
           (SELECT count(*)
              FROM public.reservations r
              JOIN public.dealership_users du ON du.dealership_id = r.dealership_id
             WHERE du.profile_id = prof.id
               AND r.reservation_date = v_today
               AND r.status NOT IN ('completada', 'cancelada')) AS propias
      FROM public.profiles prof
      JOIN public.roles rol ON rol.id = prof.role_id
      JOIN public.role_permissions rp ON rp.role_id = rol.id
      JOIN public.permissions perm ON perm.id = rp.permission_id
     WHERE perm.name = 'reservas.recordatorio'
  LOOP
    DECLARE
      v_n int := CASE WHEN v_row.ve_todo THEN v_total ELSE v_row.propias END;
    BEGIN
      CONTINUE WHEN v_n = 0;

      -- Un aviso por persona por día. Sin esto, un cambio de hora en la configuración
      -- durante la tarde mandaría el recordatorio dos veces.
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.notifications n
         WHERE n.type = 'reservation_open_reminder'
           AND n.recipient_profile_id = v_row.profile_id
           AND n.metadata->>'date' = v_today::text
      );

      INSERT INTO public.notifications (recipient_profile_id, type, title, message, metadata)
      VALUES (
        v_row.profile_id,
        'reservation_open_reminder',
        'Citas de hoy sin cerrar',
        CASE WHEN v_n = 1
             THEN 'Queda 1 cita de hoy sin cerrar. Cerrala antes de terminar la jornada para que salga la encuesta de servicio.'
             ELSE 'Quedan ' || v_n || ' citas de hoy sin cerrar. Cerralas antes de terminar la jornada para que salgan las encuestas de servicio.'
        END,
        jsonb_build_object('date', v_today::text, 'open_count', v_n, 'scope', CASE WHEN v_row.ve_todo THEN 'global' ELSE 'dealership' END)
      );

      v_count := v_count + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT v_count, NULL::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_notify_open_reservations() FROM PUBLIC, anon, authenticated;

-- ── Lectura/escritura de la configuración desde el panel ──────────────────────
CREATE OR REPLACE FUNCTION public.get_reminder_settings()
 RETURNS TABLE(open_reservations_enabled boolean, open_reservations_hour int)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT open_reservations_enabled, open_reservations_hour
    FROM public.reminder_settings WHERE id;
$function$;

CREATE OR REPLACE FUNCTION public.set_open_reservations_reminder(p_enabled boolean, p_hour int)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_hour IS NULL OR p_hour < 0 OR p_hour > 23 THEN
    RAISE EXCEPTION 'hora_invalida';
  END IF;

  UPDATE public.reminder_settings
     SET open_reservations_enabled = coalesce(p_enabled, true),
         open_reservations_hour    = p_hour,
         updated_at                = now()
   WHERE id;

  RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_reminder_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_open_reservations_reminder(boolean, int) TO authenticated;

-- ── Cron: cada hora en punto; la función decide si le toca ────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('notify-open-reservations')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-open-reservations');

SELECT cron.schedule('notify-open-reservations', '0 * * * *', $$SELECT public.fn_notify_open_reservations();$$);

-- Reversión:
--   SELECT cron.unschedule('notify-open-reservations');
--   DROP FUNCTION IF EXISTS public.fn_notify_open_reservations();
--   DROP FUNCTION IF EXISTS public.set_open_reservations_reminder(boolean, int);
--   DROP FUNCTION IF EXISTS public.get_reminder_settings();
--   DELETE FROM public.role_permissions WHERE permission_id = (SELECT id FROM public.permissions WHERE name='reservas.recordatorio');
--   DELETE FROM public.permissions WHERE name='reservas.recordatorio';
--   DROP TABLE IF EXISTS public.reminder_settings;
