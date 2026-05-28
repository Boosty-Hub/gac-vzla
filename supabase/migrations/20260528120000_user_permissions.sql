-- Per-user permission overrides
-- Allows granting or revoking specific permissions for individual users,
-- independent of their role's baseline permissions.

CREATE TABLE IF NOT EXISTS public.user_permissions (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id    uuid        NOT NULL REFERENCES public.profiles(id)    ON DELETE CASCADE,
  permission_id uuid        NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  granted       boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, permission_id)
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions REPLICA IDENTITY FULL;

-- Admins can manage all overrides
CREATE POLICY admins_manage_user_permissions
  ON public.user_permissions FOR ALL TO authenticated
  USING  (is_admin_user())
  WITH CHECK (is_admin_user());

-- Every user can read their own overrides (needed by loadUserProfile)
CREATE POLICY users_view_own_permissions
  ON public.user_permissions FOR SELECT TO authenticated
  USING (profile_id = auth.uid());
