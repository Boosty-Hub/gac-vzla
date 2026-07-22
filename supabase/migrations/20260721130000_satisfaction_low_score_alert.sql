-- Encuestas de Satisfacción — Parte 7: alerta interna por puntaje bajo.
--
-- Al insertarse una respuesta con has_low_score = true (algún aspecto < 3, ver
-- la columna GENERADA en 20260720120000_satisfaction_surveys.sql), notifica al
-- staff interno usando la tabla `notifications` ya existente (no crea tabla nueva).
--
-- ADITIVA y no disruptiva: solo agrega una función + un trigger nuevos sobre
-- `satisfaction_responses`. No toca nada existente.
--
-- Convención de destinatarios elegida (misma que notify_reservation_cancellation,
-- ver supabase/migrations/20260703140000_2b_part1_rpcs_and_helpers.sql líneas
-- 182-191 — es el único precedente en este repo de una alerta "para todo el
-- staff interno", no solo para un vendedor puntual):
--   1) Fan-out de UNA fila por cada admin/superadmin (recipient_profile_id),
--      igual que notify_reservation_cancellation — así cada admin la ve en su
--      propio centro de notificaciones (policy "Users can read own notifications").
--   2) UNA fila adicional recipient_dealership_id-scoped (cuando la encuesta
--      tiene concesionario asignado), visible para el staff de ESE concesionario
--      vía la policy "Dealership users can read dealership notifications".
-- No se agrega una fila por vendedor individual: `notifications` no tiene hoy
-- una policy de scoping por `salesperson` (solo por recipient_profile_id /
-- recipient_dealership_id). Si se quiere notificar también al vendedor puntual,
-- se puede resolver su profile_id (patrón usado en notify_on_prospect_insert,
-- ver 20260704000000_fix_prospect_notify_triggers_definer.sql) y agregar una
-- tercera fila — se dejó fuera de este batch para no adivinar ese requisito.
--
-- NO ejecutar/aplicar todavía — pendiente de revisión antes de correrla contra la DB.

CREATE OR REPLACE FUNCTION public.notify_low_satisfaction_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_survey record;
  v_low_aspects text;
  v_title text := 'Encuesta con puntaje bajo';
  v_message text;
  v_metadata jsonb;
BEGIN
  SELECT s.prospect_id, s.client_name, s.dealership_id, s.salesperson, d.name AS dealership_name
  INTO v_survey
  FROM public.satisfaction_surveys s
  LEFT JOIN public.dealerships d ON d.id = s.dealership_id
  WHERE s.id = NEW.survey_id;

  -- Which aspect(s) scored below 3 (the same threshold has_low_score uses).
  SELECT string_agg(label, ', ') INTO v_low_aspects
  FROM (
    SELECT 'Atención Digital' AS label WHERE NEW.q_atencion_digital < 3
    UNION ALL SELECT 'Bienvenida y Atención Presencial' WHERE NEW.q_bienvenida_presencial < 3
    UNION ALL SELECT 'Negociación y Asesoría' WHERE NEW.q_negociacion_asesoria < 3
    UNION ALL SELECT 'Financiamiento y Trámites' WHERE NEW.q_financiamiento_tramites < 3
    UNION ALL SELECT 'Experiencia de Entrega' WHERE NEW.q_experiencia_entrega < 3
  ) low;

  v_message := coalesce(v_survey.client_name, 'Un cliente') || ' calificó bajo en: '
    || coalesce(v_low_aspects, 'uno o más aspectos') || '.'
    || CASE WHEN v_survey.dealership_name IS NOT NULL THEN ' Concesionario: ' || v_survey.dealership_name || '.' ELSE '' END
    || CASE WHEN v_survey.salesperson IS NOT NULL THEN ' Vendedor: ' || v_survey.salesperson || '.' ELSE '' END;

  v_metadata := jsonb_build_object(
    'survey_id', NEW.survey_id,
    'response_id', NEW.id,
    'prospect_id', v_survey.prospect_id,
    'low_aspects', v_low_aspects
  );

  -- 1) Fan-out: una fila por admin/superadmin.
  INSERT INTO public.notifications (recipient_profile_id, type, title, message, metadata)
  SELECT p.id, 'satisfaction_low_score', v_title, v_message, v_metadata
  FROM public.profiles p JOIN public.roles r ON r.id = p.role_id
  WHERE r.name IN ('superadmin', 'admin');

  -- 2) Fila adicional scoped al concesionario (si la encuesta tiene uno).
  IF v_survey.dealership_id IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_dealership_id, type, title, message, metadata)
    VALUES (v_survey.dealership_id, 'satisfaction_low_score', v_title, v_message, v_metadata);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_low_satisfaction_score ON public.satisfaction_responses;
CREATE TRIGGER trg_notify_low_satisfaction_score
  AFTER INSERT ON public.satisfaction_responses
  FOR EACH ROW
  WHEN (NEW.has_low_score = true)
  EXECUTE FUNCTION public.notify_low_satisfaction_score();
