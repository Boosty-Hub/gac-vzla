-- Horas de apertura y cierre por concesionario.
-- opening_hour: hora de inicio de atención (entero, ej. 8 = 8:00 AM)
-- closing_hour: hora de cierre (entero, ej. 17 = 5:00 PM)
-- El último bloque de cita disponible es closing_hour - 1 (una hora antes del cierre).
ALTER TABLE public.dealerships
  ADD COLUMN IF NOT EXISTS opening_hour integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS closing_hour integer NOT NULL DEFAULT 17;
