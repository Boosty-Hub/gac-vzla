-- Ningún prospecto vuelve a quedar en "Desconocido" (2026-08-26)
--
-- "Desconocido" no es un estado: es lo que la pantalla escribe cuando el `status` del
-- prospecto no está en el catálogo `prospect_statuses`. Hoy hay 51 así, de dos orígenes muy
-- distintos, y por eso NO se arreglan igual:
--
--   `nuevo` (50 filas) — valor heredado que nunca estuvo en el catálogo. Lo escriben el
--       formulario público, el alta desde el panel cuando nadie elige estado, y la
--       importación. En Kommo apunta a la etapa 101392711, LA MISMA que `por_contactar`
--       (verificado en `stage_mappings`), así que convertirlo es invisible para el CRM.
--       -> se convierten a `por_contactar`.
--
--   `seguimiento` (1 fila) — este NO es basura. Es una etapa REAL de Kommo (105277992) que
--       está en `stage_mappings` Y en `reverse_mappings`; simplemente nunca se agregó al
--       catálogo de este lado. Convertirlo a `por_contactar` dejaría al sistema y a Kommo
--       peleando por ese lead para siempre: el webhook lo volvería a poner en `seguimiento`
--       cada vez, y el trigger lo volvería a bajar.
--       -> se agrega "Seguimiento" al catálogo, que es lo que faltaba.
--
-- LO QUE VIENE A FUTURO se corta en la base y no en cada pantalla. Hay siete lugares que
-- escriben el estado de un prospecto (dos portales, el formulario público, el de eventos, la
-- importación, el webhook de Kommo y el alta automática); arreglarlos uno por uno deja el
-- octavo sin arreglar. Un trigger los cubre a todos de una vez.
--
-- CUIDADO CON LA RLS ANÓNIMA. `anon_insert_prospects` exigía `status = 'nuevo'`, y se comprobó
-- contra esta misma base que el WITH CHECK de una política evalúa la fila DESPUÉS de los
-- triggers BEFORE. O sea: agregar el trigger sin tocar esa política rompía por completo el
-- formulario público de captación. Por eso las dos cosas van juntas y en una transacción.

BEGIN;

-- ------------------------------------------------------ el estado de entrada del embudo
-- Sale del catálogo, no de una constante: si mañana reordenan los estados desde
-- Prospectos → "Gestionar estados", el default los sigue sin tocar código.
CREATE OR REPLACE FUNCTION public.default_prospect_status()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT COALESCE(
    (SELECT s.name FROM public.prospect_statuses s
      WHERE s.is_active ORDER BY s.sort_order, s.name LIMIT 1),
    -- Sólo si alguien desactivara TODOS los estados. Devolver NULL dejaría prospectos sin
    -- estado, que es peor que este piso.
    'por_contactar'
  );
$fn$;

GRANT EXECUTE ON FUNCTION public.default_prospect_status() TO authenticated, anon;

-- ------------------------------------- "Seguimiento": la etapa de Kommo que faltaba acá
INSERT INTO public.prospect_statuses (name, label, color, sort_order, is_active)
SELECT 'seguimiento', 'Seguimiento', 'bg-teal-100 text-teal-800', 11, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.prospect_statuses WHERE name = 'seguimiento'
);

-- ------------------------------------------------------------- la política anónima, ANTES
-- Se afloja antes de crear el trigger para que no quede ni un instante en que el formulario
-- público inserte y la política lo rechace.
--
-- Sigue restringiendo lo mismo que antes: un anónimo sólo puede crear un lead en el estado de
-- ENTRADA. No puede crear uno ya "ganado" ni "perdido". Lo único que cambia es que ese estado
-- se lee del catálogo en vez de estar escrito a mano.
DROP POLICY IF EXISTS anon_insert_prospects ON public.prospects;
CREATE POLICY anon_insert_prospects ON public.prospects
  FOR INSERT TO anon
  WITH CHECK (status = public.default_prospect_status());

-- --------------------------------------------------------------------------- el trigger
CREATE OR REPLACE FUNCTION public.normalize_prospect_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  -- Sólo toca lo que la pantalla mostraría como "Desconocido". Un estado válido pasa intacto,
  -- incluidos `ganado` y `perdido`.
  IF NEW.status IS NULL
     OR btrim(NEW.status) = ''
     OR NOT EXISTS (
          SELECT 1 FROM public.prospect_statuses s
           WHERE s.name = NEW.status AND s.is_active
        )
  THEN
    NEW.status := public.default_prospect_status();
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_normalize_prospect_status ON public.prospects;
CREATE TRIGGER trg_normalize_prospect_status
  BEFORE INSERT OR UPDATE ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.normalize_prospect_status();

-- ------------------------------------------------------------------------- los que ya están
-- El trigger normaliza lo que entra; esto arregla lo que ya estaba. `seguimiento` queda fuera
-- porque acaba de entrar al catálogo, así que ya dejó de ser "Desconocido".
UPDATE public.prospects
   SET status = public.default_prospect_status()
 WHERE status IS NULL
    OR btrim(status) = ''
    OR NOT EXISTS (
         SELECT 1 FROM public.prospect_statuses s
          WHERE s.name = prospects.status AND s.is_active
       );

COMMIT;
