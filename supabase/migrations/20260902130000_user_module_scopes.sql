-- El interruptor "Ver todo" / "Solo propio" (Alcance) hasta ahora era SOLO por rol
-- (role_module_scopes): para darle alcance global a UNA persona puntual habia que crearle un
-- rol nuevo entero. El admin pidio poder hacerlo tambien por USUARIO especifico, desde el
-- mismo dialogo de "Permisos del usuario" en Usuarios que ya sobreescribe permisos puntuales
-- por persona (user_permissions) -- mismo patron, ahora tambien para el alcance.
--
-- user_module_scopes es una tabla de OVERRIDES, igual que user_permissions: vacia por
-- default, solo lleva fila cuando el alcance de ese usuario para ese modulo difiere del que
-- le daria su rol. has_global_scope() ahora mira primero el override del usuario y, si no
-- hay, cae al alcance del rol (comportamiento identico a hoy para todo el que no tenga
-- overrides).
CREATE TABLE public.user_module_scopes (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module     text NOT NULL,
  scope      text NOT NULL CHECK (scope IN ('own', 'all')),
  PRIMARY KEY (profile_id, module)
);

ALTER TABLE public.user_module_scopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage user scopes" ON public.user_module_scopes
  FOR ALL USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

-- Mismo motivo que "Read own role scopes" en role_module_scopes: AuthContext lee esto con
-- una query normal del cliente (no una RPC SECURITY DEFINER), asi que cada quien necesita
-- poder leer SU PROPIA fila para que getModuleScope() funcione en su propia sesion.
CREATE POLICY "Read own user scopes" ON public.user_module_scopes
  FOR SELECT USING (profile_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_global_scope(VARIADIC p_modules text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
     WHERE p.id = auth.uid()
       -- Un rol del portal cliente nunca ve de forma global, aunque alguien prenda el
       -- interruptor por error desde el panel.
       AND coalesce(r.redirect_portal, '') <> 'cliente'
       AND EXISTS (
         SELECT 1 FROM unnest(p_modules) AS m(module)
         WHERE coalesce(
           -- 1) override especifico de ESTE usuario para el modulo, si existe
           (SELECT ums.scope FROM public.user_module_scopes ums
             WHERE ums.profile_id = p.id AND ums.module = m.module),
           -- 2) si no, el alcance del rol
           (SELECT rms.scope FROM public.role_module_scopes rms
             WHERE rms.role_id = r.id AND rms.module = m.module),
           'own'
         ) = 'all'
       )
  );
$function$;

-- current_user_module_scope: sin llamadores hoy (ni RLS ni frontend), pero se actualiza igual
-- para que no quede una segunda fuente de verdad desactualizada si algo la usa despues.
CREATE OR REPLACE FUNCTION public.current_user_module_scope(p_module text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE(
    (SELECT ums.scope FROM public.user_module_scopes ums
      WHERE ums.profile_id = auth.uid() AND ums.module = p_module),
    (SELECT rms.scope
       FROM public.role_module_scopes rms
       JOIN public.profiles p ON p.role_id = rms.role_id
      WHERE p.id = auth.uid() AND rms.module = p_module),
    'own');
$function$;
