-- Unicidad de PIN de acceso: login-by-pin busca el perfil por pin_code con .maybeSingle(),
-- que falla si dos perfiles comparten PIN. Este índice único parcial lo impide a nivel BD,
-- sin importar quién asigne el PIN (cliente desde Mi Perfil o admin desde Clientes).
-- Idempotente. Hoy todos los pin_code existentes son únicos y de 4 dígitos.

CREATE UNIQUE INDEX IF NOT EXISTS profiles_pin_code_unique
  ON public.profiles (pin_code)
  WHERE pin_code IS NOT NULL;
