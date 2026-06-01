-- req2: REPLICA IDENTITY FULL so realtime filters work on non-PK columns
ALTER TABLE public.role_permissions REPLICA IDENTITY FULL;
ALTER TABLE public.notifications    REPLICA IDENTITY FULL;

-- req1: Prospect insert notification → set recipient_profile_id to salesperson's profile
CREATE OR REPLACE FUNCTION notify_on_prospect_insert()
RETURNS trigger LANGUAGE plpgsql AS $body$
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
    salesperson_pid,       -- NULL when no salesperson → only visible to managers/admin
    NEW.dealership_id,
    jsonb_build_object('prospect_id', NEW.id, 'prospect_name', NEW.name)
  );
  RETURN NEW;
END;
$body$;

-- req1: Prospect status change notification → same salesperson scoping
CREATE OR REPLACE FUNCTION notify_on_prospect_status_change()
RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE
  salesperson_pid uuid;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT s.profile_id INTO salesperson_pid
    FROM public.salespersons s
    WHERE s.name = NEW.salesperson AND s.profile_id IS NOT NULL
    LIMIT 1;

    INSERT INTO public.notifications (title, message, type, recipient_profile_id, recipient_dealership_id, metadata)
    VALUES (
      'Estado de prospecto actualizado',
      'El prospecto ' || NEW.name || ' cambio de "' || OLD.status || '" a "' || NEW.status || '"',
      'prospect_status',
      salesperson_pid,
      NEW.dealership_id,
      jsonb_build_object('prospect_id', NEW.id, 'old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$body$;

-- Backfill historical notifications with correct recipient_profile_id
UPDATE public.notifications n
SET recipient_profile_id = s.profile_id
FROM public.prospects p
JOIN public.salespersons s ON s.name = p.salesperson AND s.profile_id IS NOT NULL
WHERE n.type IN ('prospect_new', 'prospect_status')
  AND n.recipient_profile_id IS NULL
  AND n.metadata IS NOT NULL
  AND (n.metadata->>'prospect_id') IS NOT NULL
  AND p.id = (n.metadata->>'prospect_id')::uuid;

-- req6: company_name field on prospects
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS company_name text;
