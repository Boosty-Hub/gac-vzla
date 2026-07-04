-- Fix: notify_on_prospect_insert debe ser SECURITY DEFINER.
--
-- Bug (preexistente, detectado en la verificación): el alta de prospecto desde
-- el landing PÚBLICO (rol anon) fallaba con "new row violates row-level security
-- policy for table notifications", porque el trigger AFTER INSERT
-- notify_on_prospect_insert corría como SECURITY INVOKER (permisos del anon) y
-- anon no puede insertar en notifications. El alta por staff (authenticated) sí
-- funcionaba (tiene policy de insert en notifications), por eso no se había notado.
--
-- Solución: correr el trigger como el owner (DEFINER) — patrón correcto para
-- triggers que generan notificaciones del sistema. search_path='' por seguridad
-- (todas las refs quedan calificadas con schema). El cuerpo es idéntico al original.
--
-- NOTA: notify_on_prospect_status_change (AFTER UPDATE) NO se toca: solo lo dispara
-- staff authenticated (nunca anon), así que no está afectado.

CREATE OR REPLACE FUNCTION public.notify_on_prospect_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  salesperson_pid uuid;
BEGIN
  SELECT s.profile_id INTO salesperson_pid
  FROM public.salespersons s
  WHERE s.name = NEW.salesperson AND s.profile_id IS NOT NULL
  LIMIT 1;
  INSERT INTO public.notifications (title, message, type, recipient_profile_id, recipient_dealership_id, metadata)
  VALUES (
    'Nuevo prospecto agregado',
    'Se agrego el prospecto ' || NEW.name || ' desde ' || COALESCE(NEW.source, ''),
    'prospect_new',
    salesperson_pid,
    NEW.dealership_id,
    jsonb_build_object('prospect_id', NEW.id, 'prospect_name', NEW.name)
  );
  RETURN NEW;
END;
$function$;
