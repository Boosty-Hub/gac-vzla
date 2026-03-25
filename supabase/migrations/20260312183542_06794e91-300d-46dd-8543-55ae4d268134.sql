
-- Add redirect_portal to roles table
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS redirect_portal text NOT NULL DEFAULT 'cliente';

-- Update existing roles with correct portals
UPDATE public.roles SET redirect_portal = 'admin' WHERE name IN ('superadmin', 'admin');
UPDATE public.roles SET redirect_portal = 'concesionario' WHERE name = 'concesionario';
UPDATE public.roles SET redirect_portal = 'cliente' WHERE name = 'cliente';

-- Create magic_links table for long-lived magic links
CREATE TABLE public.magic_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.magic_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage magic_links" ON public.magic_links
  FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

CREATE INDEX idx_magic_links_token ON public.magic_links(token);
CREATE INDEX idx_magic_links_user_id ON public.magic_links(user_id);
