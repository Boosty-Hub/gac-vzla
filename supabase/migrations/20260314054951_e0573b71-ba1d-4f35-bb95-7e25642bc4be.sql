
-- Function to create notifications for various events
CREATE OR REPLACE FUNCTION public.notify_on_prospect_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  INSERT INTO public.notifications (title, message, type, recipient_dealership_id, metadata)
  VALUES (
    'Nuevo prospecto agregado',
    'Se agregó el prospecto ' || NEW.name || ' desde ' || NEW.source,
    'prospect_new',
    NEW.dealership_id,
    jsonb_build_object('prospect_id', NEW.id, 'prospect_name', NEW.name)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_prospect_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (title, message, type, recipient_dealership_id, metadata)
    VALUES (
      'Estado de prospecto actualizado',
      'El prospecto ' || NEW.name || ' cambió de "' || OLD.status || '" a "' || NEW.status || '"',
      'prospect_status',
      NEW.dealership_id,
      jsonb_build_object('prospect_id', NEW.id, 'old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_reservation_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  client_name text;
BEGIN
  SELECT full_name INTO client_name FROM public.clients WHERE id = NEW.client_id;
  INSERT INTO public.notifications (title, message, type, recipient_dealership_id, metadata)
  VALUES (
    'Nueva reserva creada',
    'Reserva de ' || COALESCE(client_name, NEW.walkin_client_name, 'Cliente') || ' para ' || NEW.reservation_date || ' a las ' || NEW.reservation_time,
    'reservation_new',
    NEW.dealership_id,
    jsonb_build_object('reservation_id', NEW.id, 'date', NEW.reservation_date, 'time', NEW.reservation_time)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_reservation_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  client_name text;
  notif_title text;
  notif_type text;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT full_name INTO client_name FROM public.clients WHERE id = NEW.client_id;
    
    IF NEW.status = 'cancelada' THEN
      notif_title := 'Reserva cancelada';
      notif_type := 'reservation_cancelled';
    ELSIF NEW.status = 'completada' THEN
      notif_title := 'Servicio completado';
      notif_type := 'reservation_completed';
    ELSE
      notif_title := 'Estado de reserva actualizado';
      notif_type := 'reservation_status';
    END IF;

    INSERT INTO public.notifications (title, message, type, recipient_dealership_id, metadata)
    VALUES (
      notif_title,
      'Reserva de ' || COALESCE(client_name, NEW.walkin_client_name, 'Cliente') || ' cambió a "' || NEW.status || '"',
      notif_type,
      NEW.dealership_id,
      jsonb_build_object('reservation_id', NEW.id, 'old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Triggers
CREATE TRIGGER trg_notify_prospect_insert
  AFTER INSERT ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_prospect_insert();

CREATE TRIGGER trg_notify_prospect_status
  AFTER UPDATE ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_prospect_status_change();

CREATE TRIGGER trg_notify_reservation_insert
  AFTER INSERT ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_reservation_insert();

CREATE TRIGGER trg_notify_reservation_status
  AFTER UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_reservation_status_change();

-- Allow dealership users to mark their notifications as read
CREATE POLICY "Dealership users can update their notifications"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (
    (recipient_dealership_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.dealership_users
      WHERE dealership_users.dealership_id = notifications.recipient_dealership_id
        AND dealership_users.profile_id = auth.uid()
    ))
  );
