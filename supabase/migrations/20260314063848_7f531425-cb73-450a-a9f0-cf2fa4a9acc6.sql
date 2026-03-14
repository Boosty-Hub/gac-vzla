
CREATE TABLE public.message_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage message templates"
ON public.message_templates
FOR ALL
TO authenticated
USING (public.is_admin_user())
WITH CHECK (public.is_admin_user());

CREATE POLICY "Authenticated users can read active templates"
ON public.message_templates
FOR SELECT
TO authenticated
USING (is_active = true);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.message_templates
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

INSERT INTO public.message_templates (template_key, name, content, description) VALUES
(
  'reservation_confirmed',
  'Reserva Confirmada',
  'Hola {{cliente}},

Tu cita de servicio ha sido *confirmada* ✅

📅 *Fecha:* {{fecha}}
⏰ *Hora:* {{hora}}
🔧 *Servicio:* {{servicio}}
{{#vehiculo}}🚗 *Vehículo:* {{vehiculo}}
{{/vehiculo}}{{#placa}}🔖 *Placa:* {{placa}}
{{/placa}}{{#concesionario}}📍 *Concesionario:* {{concesionario}}
{{/concesionario}}{{#kilometraje}}📏 *Kilometraje:* {{kilometraje}} km
{{/kilometraje}}{{#notas}}📝 *Notas:* {{notas}}
{{/notas}}
Te esperamos. Gracias por confiar en nosotros 🙏',
  'Mensaje enviado por WhatsApp cuando se confirma una reserva'
);
