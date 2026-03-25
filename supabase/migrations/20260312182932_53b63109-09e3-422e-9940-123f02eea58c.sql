
-- Add missing prospectos module permissions
INSERT INTO public.permissions (name, module, description) VALUES
  ('prospectos.view', 'prospectos', 'Ver prospectos'),
  ('prospectos.create', 'prospectos', 'Crear prospectos'),
  ('prospectos.edit', 'prospectos', 'Editar prospectos'),
  ('prospectos.delete', 'prospectos', 'Eliminar prospectos');
