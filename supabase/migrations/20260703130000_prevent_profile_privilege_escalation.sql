-- Fase 2A — Bloqueo de escalada de privilegios (cierra C3)
--
-- Contexto verificado en la DB:
--   * roles / role_permissions / permissions: escrituras ya restringidas a
--     superadmin. dealership_users / client_users / user_permissions: ya
--     bloqueadas (lectura propia + gestion solo admin). NO se tocan.
--   * El UNICO vector real de escalada es profiles: la policy profiles_update_own
--     tiene USING (auth.uid() = id) y WITH CHECK nulo, permitiendo que un usuario
--     haga UPDATE profiles SET role_id = <admin> WHERE id = auth.uid().
--
-- Solucion: trigger que congela role_id / is_active para usuarios finales
-- autenticados NO admin (tanto en UPDATE como en INSERT). No afecta:
--   - Backend (service_role / Management API / edge functions): auth.role() != 'authenticated'.
--   - Signup (handle_new_user, SECURITY DEFINER): corre en contexto backend.
--   - Admins: is_admin_user() = true los exime (siguen gestionando roles).
--   - Updates legitimos del propio usuario (nombre, pin_code, avatar, phone): pasan intactos.

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_is_end_user boolean;
BEGIN
  -- Solo restringimos a un usuario final autenticado que NO sea admin.
  -- auth.role() = 'authenticated' distingue a un usuario logueado del backend
  -- (service_role / postgres / signup), cuyo auth.role() es distinto.
  v_is_end_user := (auth.role() = 'authenticated') AND NOT public.is_admin_user();

  IF v_is_end_user THEN
    IF TG_OP = 'UPDATE' THEN
      -- El usuario no puede cambiar su propio rol ni su estado de activacion.
      NEW.role_id   := OLD.role_id;
      NEW.is_active := OLD.is_active;
    ELSIF TG_OP = 'INSERT' THEN
      -- Un usuario final nunca puede autoasignarse un rol privilegiado.
      NEW.role_id := (SELECT id FROM public.roles WHERE name = 'cliente');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- Hardening adicional: has_permission() es SECURITY DEFINER pero no fijaba
-- search_path (a diferencia de is_admin_user / get_user_role). Todas sus
-- referencias ya estan calificadas con schema, asi que fijar search_path='' es
-- seguro y previene secuestro por search_path malicioso.
CREATE OR REPLACE FUNCTION public.has_permission(perm_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.role_permissions rp ON rp.role_id = p.role_id
    JOIN public.permissions pm ON pm.id = rp.permission_id
    WHERE p.id = auth.uid() AND pm.name = perm_name
  );
$$;
