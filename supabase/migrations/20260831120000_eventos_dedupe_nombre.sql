-- Índice único de eventos por clave fuerte, no por texto crudo (2026-08-31)
--
-- INCIDENTE REAL: "Expo Zulia" (creado a mano el 26-ago, 177 leads reales enganchados) y
-- "ExpoZulia" (auto-provisionado el 28-ago por el webhook de Kommo a partir de un lead que
-- llegó con el nombre del evento escrito sin espacio) convivieron como DOS filas distintas en
-- `prospect_events`. La fila vacía quedó como "la" activa visible en el panel mientras la que
-- de verdad tenía los 177 leads había quedado cerrada — el usuario veía "0 Leads" tanto en la
-- tarjeta del evento como en el detalle. Los datos ya fueron consolidados a mano en producción
-- (la fila con los leads fue reabierta, el formulario del duplicado vacío fue desactivado)
-- ANTES de esta migración, que no toca esas dos filas.
--
-- CAUSA DE FONDO #1 (por qué se creó el duplicado): el auto-provisioning del webhook de Kommo
-- decidía si un evento "ya existía" comparando nombres con una normalización débil (mayúsculas
-- y acentos, pero espacios internos intactos), así que "ExpoZulia" no matcheaba contra
-- "Expo Zulia" y el webhook insertaba una fila nueva en vez de reusar la existente. Ese bug se
-- corrige aparte, en el código del webhook (supabase/functions/kommo-webhook/index.ts).
--
-- CAUSA DE FONDO #2 (por qué la base no lo impidió): el índice único `prospect_events_name_key`
-- nunca fue en verdad case/espacio-insensible en producción, a pesar de que la migración
-- 20260826120000_eventos_modulo.sql lo intentó sobre `lower(btrim(name))`. Ya existía un índice
-- con ese mismo nombre (un unique plano sobre `name`, de antes del módulo de Eventos), así que
-- el `CREATE UNIQUE INDEX IF NOT EXISTS` fue un no-op silencioso y el índice viejo, sobre el
-- texto crudo, siguió activo (confirmado con pg_get_indexdef en producción antes de escribir
-- este DROP). Y aunque hubiera quedado el de `lower(btrim(name))`, tampoco habría atrapado este
-- caso: btrim solo recorta los extremos, no colapsa espacios internos.
--
-- FIX: la clave del índice ahora imita a `eventKey()` del webhook de Kommo (mayúsculas fuera,
-- acentos fuera, y CUALQUIER caracter que no sea letra o número fuera). "Expo Zulia" y
-- "ExpoZulia" pasan a ser la misma clave ("expozulia") y el índice único los bloquea en el
-- momento de crear/renombrar un evento, no después de que ya se repartieron leads en dos filas.
--
-- Sin extensión `unaccent` disponible en este proyecto (verificado con
-- `select * from pg_extension where extname='unaccent'` antes de escribir esto: no está
-- instalada). Se replica el recorte de acentos con `translate()` sobre el set de vocales y la
-- ñ acentuadas más comunes en español, igual que hace `normEventName()` en el webhook, sin
-- agregar una extensión nueva. `translate`, `regexp_replace` y `lower` son todas funciones
-- IMMUTABLE de Postgres, así que la expresión se puede indexar directo sin envolverla en una
-- función propia.

-- Verificación de seguridad: si quedara alguna colisión bajo la clave nueva, la migración se
-- aborta acá con un mensaje claro en vez de fallar a ciegas en el CREATE UNIQUE INDEX de abajo.
-- Va antes del DROP para que, si aborta, el índice viejo quede intacto y no haya una ventana
-- sin ningún índice único sobre el nombre del evento.
DO $$
DECLARE
  v_colisiones text;
BEGIN
  SELECT string_agg(format('%s -> [%s]', k, names), E'\n')
  INTO v_colisiones
  FROM (
    SELECT
      lower(regexp_replace(translate(name, 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU'), '[^a-zA-Z0-9]', '', 'g')) AS k,
      string_agg(name, ', ') AS names
    FROM public.prospect_events
    GROUP BY 1
    HAVING count(*) > 1
  ) dupes;

  IF v_colisiones IS NOT NULL THEN
    RAISE EXCEPTION 'prospect_events tiene nombres que colisionan bajo la clave normalizada. Resolvé manualmente (fusionar o renombrar/desactivar la fila sobrante) antes de reintentar esta migración: %', v_colisiones;
  END IF;
END $$;

-- El `prospect_events_name_key` de producción no es un índice suelto: quedó respaldando un
-- UNIQUE CONSTRAINT con el mismo nombre (confirmado en el intento de aplicar esta migración —
-- `DROP INDEX` lo rechazó pidiendo que se dropee el constraint). Se dropea el constraint, que
-- arrastra su índice, y se crea un índice único nuevo y suelto (sin constraint) sobre la clave
-- normalizada, igual que ya lo intentaba (sin lograrlo) 20260826120000_eventos_modulo.sql.
ALTER TABLE public.prospect_events DROP CONSTRAINT IF EXISTS prospect_events_name_key;
DROP INDEX IF EXISTS public.prospect_events_name_key;

CREATE UNIQUE INDEX prospect_events_name_key
  ON public.prospect_events (
    (lower(regexp_replace(translate(name, 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU'), '[^a-zA-Z0-9]', '', 'g')))
  );

COMMENT ON INDEX public.prospect_events_name_key IS
  'Unicidad por clave normalizada (minusculas, sin acentos, sin espacios ni puntuacion), igual a eventKey() en kommo-webhook/index.ts. Evita que variantes como "Expo Zulia" y "ExpoZulia" convivan como eventos distintos y se repartan los leads entre dos filas.';
