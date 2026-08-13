-- Una encuesta postventa sin cliente nunca se puede entregar.
--
-- `deliver_satisfaction_survey` falla con `survey_has_no_client`, y por eso el barrido
-- excluye `client_id IS NULL`. Hoy hay 16 encuestas de VENTA en ese estado, creadas antes de
-- que existiera el trigger que liga el cliente: pendientes desde julio, con cero intentos,
-- para siempre.
--
-- El trigger de postventa podia sumar filas a esa pila: una cita de mostrador tiene
-- client_id NULL y su telefono vive en walkin_client_phone, asi que pasaba el control de
-- telefono y creaba una encuesta que nadie iba a recibir. Se corta en el mismo lugar y por
-- la misma razon que el control de telefono: si no hay a quien entregarsela, no se crea.
CREATE OR REPLACE FUNCTION public.create_service_survey_on_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_client_name  text;
  v_client_phone text;
  v_plate        text;
  v_suppressed   text;
  v_sends        boolean;
BEGIN
  -- Sin cliente no hay entrega posible. Es lo primero que se evalua para no hacer trabajo
  -- que igual se descarta.
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT st.sends_postventa_survey INTO v_sends
    FROM public.service_types st
   WHERE st.name = NEW.service_type
   LIMIT 1;

  IF coalesce(v_sends, true) = false THEN
    RETURN NEW;
  END IF;

  SELECT c.full_name, c.phone INTO v_client_name, v_client_phone
    FROM public.clients c WHERE c.id = NEW.client_id;

  v_client_name  := coalesce(v_client_name,  NEW.walkin_client_name);
  v_client_phone := coalesce(v_client_phone, NEW.walkin_client_phone);

  IF v_client_phone IS NULL OR btrim(v_client_phone) = '' THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(v.plate, NEW.walkin_plate) INTO v_plate
    FROM public.vehicles v WHERE v.id = NEW.vehicle_id;
  v_plate := coalesce(v_plate, NEW.walkin_plate);

  v_suppressed := public.fn_claim_survey_slot(NEW.client_id, 'service');

  INSERT INTO public.satisfaction_surveys (
    reservation_id, client_id, vehicle_id, origin, dealership_id,
    client_name, client_phone, sold_plate, suppressed_reason, eligible_at
  ) VALUES (
    NEW.id, NEW.client_id, NEW.vehicle_id, 'service', NEW.dealership_id,
    v_client_name, v_client_phone, v_plate, v_suppressed,
    now()
  )
  ON CONFLICT (reservation_id) WHERE reservation_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$function$;
