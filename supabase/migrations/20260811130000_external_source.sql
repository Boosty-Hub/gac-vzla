-- De QUE alianza vino un cliente externo.
--
-- Hoy `clients.is_manual` es un si/no: dice que lo cargamos a mano, pero no de donde salio.
-- El pedido fue "etiquetarlo con una etiqueta distintiva para filtrarlos a futuro", porque
-- los externos vienen de convenios con otras empresas y hace falta saber cuantos trae cada
-- una.
--
-- Texto y no una tabla catalogo a proposito: son un punado de convenios, y el formulario
-- ofrece las etiquetas ya usadas como sugerencia, asi que en la practica no se multiplican.
-- Si algun dia hacen falta atributos por convenio (contacto, vigencia, tarifa), migrar de
-- text a FK es un ALTER y un UPDATE; al reves seria perder datos.
--
-- Se normaliza al guardar (trim + espacios colapsados) para que "Seguros Caracas" y
-- "seguros  caracas " no queden como dos convenios distintos y el filtro mienta.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS external_source text;

COMMENT ON COLUMN public.clients.external_source IS
  'Convenio/alianza por la que llego este cliente externo. NULL = no aplica. Solo tiene '
  'sentido con is_manual = true; set_client_external() lo limpia al desmarcar. Ver '
  '20260811130000.';

-- Normalizador unico, para que el trigger y cualquier backfill futuro coincidan.
CREATE OR REPLACE FUNCTION public.normalize_external_source(p_value text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT nullif(btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g')), '');
$function$;

CREATE OR REPLACE FUNCTION public.clients_normalize_external_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  NEW.external_source := public.normalize_external_source(NEW.external_source);
  -- Un cliente propio no tiene convenio de origen. Se limpia en vez de rechazar: el
  -- formulario puede dejar el campo escrito y apagar el switch de externo, y eso no
  -- deberia ser un error para el usuario.
  IF NOT NEW.is_manual THEN
    NEW.external_source := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_clients_normalize_external_source ON public.clients;
CREATE TRIGGER trg_clients_normalize_external_source
  BEFORE INSERT OR UPDATE OF external_source, is_manual ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.clients_normalize_external_source();

-- Filtrar por convenio recorre solo los externos, que son pocos frente a la cartera.
CREATE INDEX IF NOT EXISTS idx_clients_external_source
  ON public.clients (external_source)
  WHERE is_manual;

-- Las etiquetas ya usadas, para ofrecerlas en el formulario y en el filtro. Sin esto cada
-- quien escribe la suya y el filtro deja de servir.
CREATE OR REPLACE FUNCTION public.external_sources()
RETURNS TABLE(source text, clientes bigint)
LANGUAGE sql STABLE
SET search_path TO ''
AS $function$
  SELECT c.external_source, count(*)
  FROM public.clients c
  WHERE c.is_manual AND c.external_source IS NOT NULL
  GROUP BY c.external_source
  ORDER BY count(*) DESC, c.external_source;
$function$;

GRANT EXECUTE ON FUNCTION public.external_sources() TO authenticated;
