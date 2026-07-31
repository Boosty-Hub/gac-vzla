-- Formulario de encuesta agnóstico de marca (R10) — expone `brand` por token.
--
-- El formulario público dejó de estar marcado como GAC porque DFSK y SHINERAY van a usar
-- el mismo formulario. Para poder mostrar la marca REAL de la unidad comprada, en vez de
-- una fija, `get_survey_by_token` tiene que devolverla. `PublicEncuesta.tsx` ya lee
-- `row.brand` de forma defensiva, así que esta migración activa esa ruta sin tocar el front.
--
-- DEPENDE de `20260729120000_satisfaction_prospect_to_client.sql`, que es quien agrega
-- `satisfaction_surveys.vehicle_id`. Aplicar DESPUÉS de esa migración.
--
-- Resolución de la marca: satisfaction_surveys.vehicle_id -> vehicles.model_id
--                         -> vehicle_models.brand
-- Las encuestas sin vehículo enlazado (las históricas, previas a este cambio) devuelven
-- NULL en `brand`. El formulario tiene que seguir renderizando en ese caso — la marca es
-- decorativa, nunca un requisito para responder.
--
-- PRIVACIDAD: esta RPC es SECURITY DEFINER y `anon` puede ejecutarla con solo el token,
-- así que el criterio original se mantiene — NO se expone teléfono, email ni placa. La
-- marca del vehículo no es dato personal y es justamente lo que el formulario necesita
-- para dejar de estar casado con una sola marca.

-- El tipo de retorno cambia, y Postgres no permite CREATE OR REPLACE cuando cambia
-- RETURNS TABLE. Hay que soltar la función primero; el DDL es transaccional, así que
-- ejecutar este archivo de una sola vez no deja ventana sin la función.
DROP FUNCTION IF EXISTS public.get_survey_by_token(text);

CREATE FUNCTION public.get_survey_by_token(p_token text)
RETURNS TABLE (
  survey_id         uuid,
  client_name       text,
  dealership_name   text,
  status            text,
  already_responded boolean,
  brand             text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT s.id,
         s.client_name,
         d.name,
         s.status,
         (s.status = 'responded'),
         vm.brand
  FROM public.satisfaction_surveys s
  LEFT JOIN public.dealerships d     ON d.id  = s.dealership_id
  LEFT JOIN public.vehicles v        ON v.id  = s.vehicle_id
  LEFT JOIN public.vehicle_models vm ON vm.id = v.model_id
  WHERE s.token = p_token
  LIMIT 1;
$$;

-- Se restablece el grant: DROP FUNCTION se lleva los privilegios con él.
GRANT EXECUTE ON FUNCTION public.get_survey_by_token(text) TO anon, authenticated;

-- ============================================================================
-- REVERSIÓN (ejecutable — descomentar para restaurar la versión sin `brand`)
--
-- DROP FUNCTION IF EXISTS public.get_survey_by_token(text);
--
-- CREATE FUNCTION public.get_survey_by_token(p_token text)
-- RETURNS TABLE (survey_id uuid, client_name text, dealership_name text, status text, already_responded boolean)
-- LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
--   SELECT s.id, s.client_name, d.name, s.status, (s.status = 'responded')
--   FROM public.satisfaction_surveys s
--   LEFT JOIN public.dealerships d ON d.id = s.dealership_id
--   WHERE s.token = p_token
--   LIMIT 1;
-- $$;
--
-- GRANT EXECUTE ON FUNCTION public.get_survey_by_token(text) TO anon, authenticated;
-- ============================================================================
