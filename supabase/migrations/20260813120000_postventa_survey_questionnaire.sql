-- Encuesta de Satisfacción: Experiencia Técnica y Servicio Postventa.
--
-- Reemplaza el cuestionario postventa por el que definió GAC. El anterior eran 5 aspectos
-- calificados 1..5 con slider; el nuevo son 8 preguntas de opción cerrada agrupadas en 5
-- secciones, sin escala y sin NPS. No es una reescritura de textos: cambia la forma del dato.
--
-- POR QUÉ IGUAL SE GUARDA UN PUNTAJE
-- ----------------------------------
-- `overall_score` y `has_low_score` no son decorativos. De ellos dependen:
--   * el dashboard de Satisfacción (promedios, distribución, ranking por concesionario),
--   * el PDF de respuesta,
--   * y el disparador de alerta por baja satisfacción
--     (20260721130000_satisfaction_low_score_alert.sql).
-- Guardar respuestas sin escala habría dejado esas tres cosas calculando sobre NULL sin
-- fallar en ninguna parte visible. Por eso cada opción tiene un puntaje fijo — mejor 5,
-- intermedia 3, peor 1 — y las dos columnas generadas se mantienen con el mismo contrato.
--
-- Los puntajes viven en la CHECK/CASE de abajo y no en el frontend a propósito: si el
-- cálculo estuviera en React, una encuesta respondida desde otro cliente entraría sin
-- puntaje.

-- ---------------------------------------------------------------------------
-- 1) Preservar lo ya respondido antes de cambiar la forma
-- ---------------------------------------------------------------------------
-- Hay 3 encuestas postventa históricas (1 respondida) del incidente de ruteo del 2026-08-03.
-- El cuestionario nuevo no es comparable con el viejo, pero borrar una respuesta real de un
-- cliente no es una opción: se archiva tal cual antes de reconstruir la tabla.
ALTER TABLE public.service_survey_responses
  ADD COLUMN IF NOT EXISTS legacy_answers jsonb;

COMMENT ON COLUMN public.service_survey_responses.legacy_answers IS
  'Respuestas al cuestionario postventa 1..5 vigente hasta 2026-08-13, archivadas al migrar '
  'al cuestionario de opción cerrada. Sólo lectura; ninguna vista las agrega.';

UPDATE public.service_survey_responses
   SET legacy_answers = jsonb_build_object(
         'q_agendamiento',     q_agendamiento,
         'q_recepcion_asesor', q_recepcion_asesor,
         'q_tiempo_entrega',   q_tiempo_entrega,
         'q_calidad_servicio', q_calidad_servicio,
         'q_instalaciones',    q_instalaciones,
         'nps_recomienda',     nps_recomienda,
         'cuestionario',       'escala_1_5_hasta_2026_08_13')
 WHERE legacy_answers IS NULL;

-- ---------------------------------------------------------------------------
-- 2) Las columnas generadas dependen de las viejas: hay que soltarlas primero
-- ---------------------------------------------------------------------------
ALTER TABLE public.service_survey_responses DROP COLUMN IF EXISTS overall_score;
ALTER TABLE public.service_survey_responses DROP COLUMN IF EXISTS has_low_score;

ALTER TABLE public.service_survey_responses DROP COLUMN IF EXISTS q_agendamiento;
ALTER TABLE public.service_survey_responses DROP COLUMN IF EXISTS q_recepcion_asesor;
ALTER TABLE public.service_survey_responses DROP COLUMN IF EXISTS q_tiempo_entrega;
ALTER TABLE public.service_survey_responses DROP COLUMN IF EXISTS q_calidad_servicio;
ALTER TABLE public.service_survey_responses DROP COLUMN IF EXISTS q_instalaciones;
ALTER TABLE public.service_survey_responses DROP COLUMN IF EXISTS nps_recomienda;

-- ---------------------------------------------------------------------------
-- 3) El cuestionario nuevo
-- ---------------------------------------------------------------------------
-- Las filas archivadas quedarían violando los NOT NULL, así que las columnas admiten NULL y
-- la validación de obligatoriedad vive en la RPC, que es el único camino de escritura.
ALTER TABLE public.service_survey_responses
  -- Sección 1 — Atención y Diagnóstico Inicial
  ADD COLUMN IF NOT EXISTS q_recepcion_imagen    text CHECK (q_recepcion_imagen    IN ('si', 'no')),
  ADD COLUMN IF NOT EXISTS q_explicacion_tecnica text CHECK (q_explicacion_tecnica IN ('muy_clara', 'aceptable', 'confusa')),
  -- Sección 2 — Calidad del Trabajo Técnico y Repuestos
  ADD COLUMN IF NOT EXISTS q_informe_tecnico     text CHECK (q_informe_tecnico     IN ('si', 'no')),
  ADD COLUMN IF NOT EXISTS q_garantia_repuestos  text CHECK (q_garantia_repuestos  IN ('si', 'no', 'no_mencionado')),
  ADD COLUMN IF NOT EXISTS q_presentacion_equipo text CHECK (q_presentacion_equipo IN ('si', 'no')),
  -- Sección 3 — Entrega y Acabado del Vehículo
  ADD COLUMN IF NOT EXISTS q_limpieza_entrega    text CHECK (q_limpieza_entrega    IN ('impecable', 'parcial', 'no_lavado')),
  -- Sección 4 — Transparencia y Valor de Servicio
  ADD COLUMN IF NOT EXISTS q_precio_mano_obra    text CHECK (q_precio_mano_obra    IN ('excelente', 'adecuado', 'elevado')),
  -- Sección 5 — Calificación General
  ADD COLUMN IF NOT EXISTS q_conclusion_tecnica  text CHECK (q_conclusion_tecnica  IN ('satisfecho', 'parcial', 'persiste'));

-- ---------------------------------------------------------------------------
-- 4) Puntaje derivado — mismo contrato que satisfaction_responses
-- ---------------------------------------------------------------------------
-- Mejor opción 5, intermedia 3, peor 1. En `garantia_repuestos`, "No me lo mencionaron" vale
-- 3 y no 1: es una omisión de comunicación, no la negación de la garantía.
ALTER TABLE public.service_survey_responses
  ADD COLUMN overall_score numeric GENERATED ALWAYS AS (
    (
      (CASE q_recepcion_imagen    WHEN 'si' THEN 5 WHEN 'no' THEN 1 END)
    + (CASE q_explicacion_tecnica WHEN 'muy_clara' THEN 5 WHEN 'aceptable' THEN 3 WHEN 'confusa' THEN 1 END)
    + (CASE q_informe_tecnico     WHEN 'si' THEN 5 WHEN 'no' THEN 1 END)
    + (CASE q_garantia_repuestos  WHEN 'si' THEN 5 WHEN 'no_mencionado' THEN 3 WHEN 'no' THEN 1 END)
    + (CASE q_presentacion_equipo WHEN 'si' THEN 5 WHEN 'no' THEN 1 END)
    + (CASE q_limpieza_entrega    WHEN 'impecable' THEN 5 WHEN 'parcial' THEN 3 WHEN 'no_lavado' THEN 1 END)
    + (CASE q_precio_mano_obra    WHEN 'excelente' THEN 5 WHEN 'adecuado' THEN 3 WHEN 'elevado' THEN 1 END)
    + (CASE q_conclusion_tecnica  WHEN 'satisfecho' THEN 5 WHEN 'parcial' THEN 3 WHEN 'persiste' THEN 1 END)
    )::numeric / 8::numeric
  ) STORED;

ALTER TABLE public.service_survey_responses
  ADD COLUMN has_low_score boolean GENERATED ALWAYS AS (
    LEAST(
      (CASE q_recepcion_imagen    WHEN 'si' THEN 5 WHEN 'no' THEN 1 END),
      (CASE q_explicacion_tecnica WHEN 'muy_clara' THEN 5 WHEN 'aceptable' THEN 3 WHEN 'confusa' THEN 1 END),
      (CASE q_informe_tecnico     WHEN 'si' THEN 5 WHEN 'no' THEN 1 END),
      (CASE q_garantia_repuestos  WHEN 'si' THEN 5 WHEN 'no_mencionado' THEN 3 WHEN 'no' THEN 1 END),
      (CASE q_presentacion_equipo WHEN 'si' THEN 5 WHEN 'no' THEN 1 END),
      (CASE q_limpieza_entrega    WHEN 'impecable' THEN 5 WHEN 'parcial' THEN 3 WHEN 'no_lavado' THEN 1 END),
      (CASE q_precio_mano_obra    WHEN 'excelente' THEN 5 WHEN 'adecuado' THEN 3 WHEN 'elevado' THEN 1 END),
      (CASE q_conclusion_tecnica  WHEN 'satisfecho' THEN 5 WHEN 'parcial' THEN 3 WHEN 'persiste' THEN 1 END)
    ) < 3
  ) STORED;

-- ---------------------------------------------------------------------------
-- 5) La RPC de envío
-- ---------------------------------------------------------------------------
-- La firma anterior tomaba 5 enteros; hay que soltarla o PostgREST resuelve por nombre+cuerpo
-- y las dos sobrecargas chocan con PGRST203.
DROP FUNCTION IF EXISTS public.submit_service_survey_response(text, integer, integer, integer, integer, integer, boolean, text);

CREATE OR REPLACE FUNCTION public.submit_service_survey_response(
  p_token               text,
  p_recepcion_imagen    text,
  p_explicacion_tecnica text,
  p_informe_tecnico     text,
  p_garantia_repuestos  text,
  p_presentacion_equipo text,
  p_limpieza_entrega    text,
  p_precio_mano_obra    text,
  p_conclusion_tecnica  text,
  p_comment             text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_survey record;
BEGIN
  SELECT id, status, origin INTO v_survey
  FROM public.satisfaction_surveys WHERE token = p_token FOR UPDATE;

  IF v_survey.id IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF v_survey.status = 'responded' THEN RAISE EXCEPTION 'already_responded'; END IF;
  -- Un token de venta enviado acá dejaría las respuestas en la tabla equivocada y la
  -- encuesta de venta figuraría por siempre como no respondida.
  IF v_survey.origin IS DISTINCT FROM 'service' THEN RAISE EXCEPTION 'wrong_survey_type'; END IF;

  -- Las 8 son obligatorias. La tabla las admite NULL sólo para no invalidar las respuestas
  -- archivadas del cuestionario anterior, así que la exigencia se aplica acá.
  IF p_recepcion_imagen IS NULL OR p_explicacion_tecnica IS NULL OR p_informe_tecnico IS NULL
     OR p_garantia_repuestos IS NULL OR p_presentacion_equipo IS NULL
     OR p_limpieza_entrega IS NULL OR p_precio_mano_obra IS NULL OR p_conclusion_tecnica IS NULL THEN
    RAISE EXCEPTION 'incomplete_answers';
  END IF;

  -- Los CHECK de la tabla ya rechazarían un valor inválido, pero con un mensaje de Postgres
  -- que el formulario no puede traducir. Este error sí es reconocible.
  IF p_recepcion_imagen    NOT IN ('si', 'no')
     OR p_explicacion_tecnica NOT IN ('muy_clara', 'aceptable', 'confusa')
     OR p_informe_tecnico     NOT IN ('si', 'no')
     OR p_garantia_repuestos  NOT IN ('si', 'no', 'no_mencionado')
     OR p_presentacion_equipo NOT IN ('si', 'no')
     OR p_limpieza_entrega    NOT IN ('impecable', 'parcial', 'no_lavado')
     OR p_precio_mano_obra    NOT IN ('excelente', 'adecuado', 'elevado')
     OR p_conclusion_tecnica  NOT IN ('satisfecho', 'parcial', 'persiste') THEN
    RAISE EXCEPTION 'invalid_answer';
  END IF;

  INSERT INTO public.service_survey_responses (
    survey_id, q_recepcion_imagen, q_explicacion_tecnica, q_informe_tecnico,
    q_garantia_repuestos, q_presentacion_equipo, q_limpieza_entrega,
    q_precio_mano_obra, q_conclusion_tecnica, comment
  ) VALUES (
    v_survey.id, p_recepcion_imagen, p_explicacion_tecnica, p_informe_tecnico,
    p_garantia_repuestos, p_presentacion_equipo, p_limpieza_entrega,
    p_precio_mano_obra, p_conclusion_tecnica, nullif(btrim(p_comment), '')
  );

  UPDATE public.satisfaction_surveys
     SET status = 'responded', responded_at = now(), updated_at = now()
   WHERE id = v_survey.id;

  RETURN 'ok';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.submit_service_survey_response(
  text, text, text, text, text, text, text, text, text, text
) TO anon, authenticated, service_role;
