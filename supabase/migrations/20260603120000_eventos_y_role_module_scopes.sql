-- Agregar permisos del módulo eventos
INSERT INTO permissions (name, module) VALUES
  ('eventos.view',   'eventos'),
  ('eventos.create', 'eventos'),
  ('eventos.edit',   'eventos'),
  ('eventos.delete', 'eventos')
ON CONFLICT (name) DO NOTHING;

-- Tabla de alcance por módulo por rol (own = solo lo suyo, all = ver todo)
CREATE TABLE IF NOT EXISTS public.role_module_scopes (
  role_id uuid    NOT NULL,
  module  text    NOT NULL,
  scope   text    NOT NULL DEFAULT 'own',
  CONSTRAINT role_module_scopes_pkey       PRIMARY KEY (role_id, module),
  CONSTRAINT role_module_scopes_role_fkey  FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE,
  CONSTRAINT role_module_scopes_scope_chk  CHECK (scope = ANY(ARRAY['own', 'all']))
);

ALTER TABLE public.role_module_scopes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage scopes"   ON public.role_module_scopes;
DROP POLICY IF EXISTS "Read own role scopes"  ON public.role_module_scopes;

CREATE POLICY "Admin manage scopes"
  ON public.role_module_scopes FOR ALL TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

CREATE POLICY "Read own role scopes"
  ON public.role_module_scopes FOR SELECT TO authenticated
  USING (role_id IN (SELECT role_id FROM profiles WHERE id = auth.uid()));
