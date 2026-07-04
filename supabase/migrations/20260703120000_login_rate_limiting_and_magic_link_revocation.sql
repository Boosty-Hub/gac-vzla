-- Fase 1 — Blindaje de autenticación
-- Rate limiting de logins + revocación de magic links.
-- Aditiva y segura: no altera datos existentes ni rompe flujos.

-- 1) Registro de intentos de login para rate limiting / lockout.
--    Solo accesible por el service role (RLS on, sin políticas) → ni anon ni
--    usuarios autenticados pueden leerla o escribirla. Las edge functions la
--    usan con service role (bypass de RLS).
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip         text,
  identifier text,               -- hash del factor (PIN/placa), nunca en claro
  kind       text        NOT NULL,  -- 'pin' | 'plate' | 'magic'
  success    boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time
  ON public.login_attempts (kind, ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ident_time
  ON public.login_attempts (kind, identifier, created_at DESC);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
-- Sin políticas a propósito: acceso exclusivo del service role.

-- Limpieza opcional de intentos viejos (mantener la tabla chica).
CREATE INDEX IF NOT EXISTS idx_login_attempts_created_at
  ON public.login_attempts (created_at);

-- 2) Revocación explícita de magic links desde el panel admin.
ALTER TABLE public.magic_links
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
