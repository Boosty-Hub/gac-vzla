INSERT INTO public.message_templates (template_key, name, content, description, is_active)
VALUES (
  'prospect_assigned',
  'Prospecto Asignado a Vendedor',
  E'🚗 *Nuevo Prospecto Asignado*\n\n▪️ *Nombre:* {{nombre}}\n{{#telefono}}▪️ *Teléfono:* {{telefono}}\n{{/telefono}}{{#email}}▪️ *Email:* {{email}}\n{{/email}}{{#modelo}}▪️ *Modelo de interés:* {{modelo}}\n{{/modelo}}{{#concesionario}}▪️ *Concesionario:* {{concesionario}}\n{{/concesionario}}▪️ *Fuente:* {{fuente}}\n▪️ *Estado:* {{estado}}\n{{#notas}}▪️ *Notas:* {{notas}}\n{{/notas}}▪️ *Fecha:* {{fecha}}',
  'Mensaje enviado al vendedor cuando se le asigna un nuevo prospecto',
  true
)
ON CONFLICT DO NOTHING;