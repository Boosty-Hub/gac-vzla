
-- Create prospect_statuses table for dynamic prospect status management
CREATE TABLE public.prospect_statuses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  label text NOT NULL,
  color text NOT NULL DEFAULT 'bg-gray-100 text-gray-800',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.prospect_statuses ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read
CREATE POLICY "Authenticated can read prospect_statuses"
  ON public.prospect_statuses FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can insert
CREATE POLICY "Admins can insert prospect_statuses"
  ON public.prospect_statuses FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_user());

-- Only admins can update
CREATE POLICY "Admins can update prospect_statuses"
  ON public.prospect_statuses FOR UPDATE
  TO authenticated
  USING (is_admin_user());

-- Only admins can delete
CREATE POLICY "Admins can delete prospect_statuses"
  ON public.prospect_statuses FOR DELETE
  TO authenticated
  USING (is_admin_user());

-- Trigger for updated_at
CREATE TRIGGER set_prospect_statuses_updated_at
  BEFORE UPDATE ON public.prospect_statuses
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Seed with default statuses
INSERT INTO public.prospect_statuses (name, label, color, sort_order) VALUES
  ('nuevo', 'Nuevo', 'bg-blue-100 text-blue-800', 1),
  ('por_contactar', 'Por Contactar', 'bg-sky-100 text-sky-800', 2),
  ('en_conversacion', 'En Conversación', 'bg-yellow-100 text-yellow-800', 3),
  ('cotizacion_enviada', 'Cotización Enviada', 'bg-indigo-100 text-indigo-800', 4),
  ('precalificar', 'Precalificar', 'bg-purple-100 text-purple-800', 5),
  ('demostracion', 'Demostración', 'bg-amber-100 text-amber-800', 6),
  ('negociacion', 'Negociación', 'bg-orange-100 text-orange-800', 7),
  ('ganado', 'Ganado', 'bg-green-100 text-green-800', 8),
  ('perdido', 'Perdido', 'bg-red-100 text-red-800', 9);
