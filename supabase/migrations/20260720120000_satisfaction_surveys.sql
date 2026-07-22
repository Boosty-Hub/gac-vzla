-- Encuestas de Satisfacción (post-compra) — Parte 1: FUNDACIÓN DE DATOS.
--
-- ADITIVA y no disruptiva: crea tablas/columna/RPCs/trigger nuevos, no toca nada
-- existente, así que es segura de aplicar antes de desplegar el frontend nuevo.
--
-- Modelo: la encuesta se ancla al PROSPECTO ganado (no al cliente — el 91% de los
-- ganados no existe en `clients`). El formulario público NO toca las tablas: entra
-- por RPCs SECURITY DEFINER con un token de un solo uso (patrón de PublicReserva).
--
-- Orden de deploy: (1) aplicar esta migración, (2) desplegar el frontend (usa las RPCs).

-- ============================================================================
-- COLUMNA: placa del vehículo vendido, capturada al pasar el prospecto a "ganado".
-- Nullable: los 171 ganados históricos y el backfill no la tienen; el frontend la
-- exige solo en wins nuevos (diálogo intercept, misma UX que el motivo de "perdido").
-- ============================================================================
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS sold_plate text;

-- ============================================================================
-- TABLA: satisfaction_surveys — una fila por prospecto ganado a encuestar.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.satisfaction_surveys (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id    uuid NOT NULL UNIQUE REFERENCES public.prospects(id) ON DELETE CASCADE,
  kommo_lead_id  bigint,
  dealership_id  uuid REFERENCES public.dealerships(id) ON DELETE SET NULL,
  salesperson    text,
  client_name    text,
  client_phone   text,
  sold_plate     text,
  -- Token largo, no adivinable (2 UUIDs = ~122 bits). Va en la URL /encuesta/:token.
  token          text NOT NULL UNIQUE
                   DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'sent', 'responded', 'expired')),
  eligible_at    timestamptz NOT NULL,        -- status_updated_at + 24h: cuándo se puede enviar
  sent_at        timestamptz,
  responded_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_satisfaction_surveys_dealership ON public.satisfaction_surveys(dealership_id);
CREATE INDEX IF NOT EXISTS idx_satisfaction_surveys_status     ON public.satisfaction_surveys(status);
CREATE INDEX IF NOT EXISTS idx_satisfaction_surveys_eligible   ON public.satisfaction_surveys(eligible_at);

-- ============================================================================
-- TABLA: satisfaction_responses — lo que respondió el cliente (1:1 con la encuesta).
-- overall_score y has_low_score son GENERADAS: la DB garantiza la consistencia y
-- has_low_score (<3 en algún aspecto) es lo que dispara la alerta interna (Parte 7).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.satisfaction_responses (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id                   uuid NOT NULL UNIQUE REFERENCES public.satisfaction_surveys(id) ON DELETE CASCADE,
  q_atencion_digital          smallint NOT NULL CHECK (q_atencion_digital          BETWEEN 1 AND 5),
  q_bienvenida_presencial     smallint NOT NULL CHECK (q_bienvenida_presencial     BETWEEN 1 AND 5),
  q_negociacion_asesoria      smallint NOT NULL CHECK (q_negociacion_asesoria      BETWEEN 1 AND 5),
  q_financiamiento_tramites   smallint NOT NULL CHECK (q_financiamiento_tramites   BETWEEN 1 AND 5),
  q_experiencia_entrega       smallint NOT NULL CHECK (q_experiencia_entrega       BETWEEN 1 AND 5),
  nps_recomienda              boolean NOT NULL,
  comment                     text,
  overall_score numeric(3,2) GENERATED ALWAYS AS (
    (q_atencion_digital + q_bienvenida_presencial + q_negociacion_asesoria
     + q_financiamiento_tramites + q_experiencia_entrega)::numeric / 5
  ) STORED,
  has_low_score boolean GENERATED ALWAYS AS (
    LEAST(q_atencion_digital, q_bienvenida_presencial, q_negociacion_asesoria,
          q_financiamiento_tramites, q_experiencia_entrega) < 3
  ) STORED,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_satisfaction_responses_low
  ON public.satisfaction_responses(has_low_score) WHERE has_low_score;

-- ============================================================================
-- RLS: sin acceso directo para anon (todo el flujo público va por RPCs definer).
-- Staff lee scopeado por concesionario/vendedor; admin, todo. Las escrituras van
-- por RPCs/trigger SECURITY DEFINER (que saltan RLS), no por policies.
-- ============================================================================
ALTER TABLE public.satisfaction_surveys   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.satisfaction_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS satisfaction_surveys_admin_all ON public.satisfaction_surveys;
CREATE POLICY satisfaction_surveys_admin_all ON public.satisfaction_surveys FOR ALL TO authenticated
  USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS satisfaction_surveys_staff_select ON public.satisfaction_surveys;
CREATE POLICY satisfaction_surveys_staff_select ON public.satisfaction_surveys FOR SELECT TO authenticated USING (
  (public.get_user_role() = 'concesionario' AND dealership_id = ANY(public.current_user_dealership_ids()))
  OR (public.get_user_role() = 'vendedor'   AND salesperson  = ANY(public.current_user_salesperson_names()))
);

DROP POLICY IF EXISTS satisfaction_responses_admin_all ON public.satisfaction_responses;
CREATE POLICY satisfaction_responses_admin_all ON public.satisfaction_responses FOR ALL TO authenticated
  USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS satisfaction_responses_staff_select ON public.satisfaction_responses;
CREATE POLICY satisfaction_responses_staff_select ON public.satisfaction_responses FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.satisfaction_surveys s
    WHERE s.id = survey_id AND (
      (public.get_user_role() = 'concesionario' AND s.dealership_id = ANY(public.current_user_dealership_ids()))
      OR (public.get_user_role() = 'vendedor'   AND s.salesperson  = ANY(public.current_user_salesperson_names()))
    )
  )
);

-- ============================================================================
-- TRIGGER: al pasar un prospecto a "ganado", crear su encuesta (pending, 24h).
-- El trigger BEFORE `set_prospect_status_updated_at` ya fijó NEW.status_updated_at,
-- así que eligible_at = ese instante + 24h. ON CONFLICT: idempotente por prospecto.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_satisfaction_survey_on_won()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  INSERT INTO public.satisfaction_surveys (
    prospect_id, kommo_lead_id, dealership_id, salesperson, client_name, client_phone,
    sold_plate, eligible_at
  ) VALUES (
    NEW.id, NEW.kommo_lead_id, NEW.dealership_id, NEW.salesperson, NEW.name, NEW.phone,
    NEW.sold_plate, coalesce(NEW.status_updated_at, now()) + interval '24 hours'
  )
  ON CONFLICT (prospect_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_satisfaction_survey_on_won ON public.prospects;
CREATE TRIGGER trg_create_satisfaction_survey_on_won
  AFTER UPDATE OF status ON public.prospects
  FOR EACH ROW
  WHEN (NEW.status = 'ganado' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.create_satisfaction_survey_on_won();

-- ============================================================================
-- RPC (público): datos mínimos para renderizar el formulario por token.
-- No expone teléfono/email/placa. `already_responded` deja que la página muestre
-- la pantalla de "¡Gracias!" en vez del formulario cuando el link ya fue usado.
-- Devuelve 0 filas si el token no existe → el front muestra "link inválido".
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_survey_by_token(p_token text)
RETURNS TABLE (survey_id uuid, client_name text, dealership_name text, status text, already_responded boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT s.id, s.client_name, d.name, s.status, (s.status = 'responded')
  FROM public.satisfaction_surveys s
  LEFT JOIN public.dealerships d ON d.id = s.dealership_id
  WHERE s.token = p_token
  LIMIT 1;
$$;

-- ============================================================================
-- RPC (público): guardar respuesta. UN SOLO USO: FOR UPDATE + chequeo de status
-- y UNIQUE(survey_id) evitan doble envío / carreras. Al guardar, la encuesta pasa
-- a 'responded' y el token queda inservible.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.submit_survey_response(
  p_token text,
  p_atencion_digital int, p_bienvenida_presencial int, p_negociacion_asesoria int,
  p_financiamiento_tramites int, p_experiencia_entrega int,
  p_nps boolean, p_comment text
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_survey record;
BEGIN
  SELECT id, status INTO v_survey
  FROM public.satisfaction_surveys WHERE token = p_token FOR UPDATE;

  IF v_survey.id IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF v_survey.status = 'responded' THEN RAISE EXCEPTION 'already_responded'; END IF;

  IF p_atencion_digital NOT BETWEEN 1 AND 5 OR p_bienvenida_presencial NOT BETWEEN 1 AND 5
     OR p_negociacion_asesoria NOT BETWEEN 1 AND 5 OR p_financiamiento_tramites NOT BETWEEN 1 AND 5
     OR p_experiencia_entrega NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'invalid_rating';
  END IF;

  INSERT INTO public.satisfaction_responses (
    survey_id, q_atencion_digital, q_bienvenida_presencial, q_negociacion_asesoria,
    q_financiamiento_tramites, q_experiencia_entrega, nps_recomienda, comment
  ) VALUES (
    v_survey.id, p_atencion_digital, p_bienvenida_presencial, p_negociacion_asesoria,
    p_financiamiento_tramites, p_experiencia_entrega, p_nps, nullif(trim(p_comment), '')
  );

  UPDATE public.satisfaction_surveys
    SET status = 'responded', responded_at = now(), updated_at = now()
    WHERE id = v_survey.id;

  RETURN 'ok';
END;
$$;

-- ============================================================================
-- RPC (staff): marcar una encuesta como enviada (botón manual "Enviar"). No baja
-- de estado una encuesta ya respondida. Scopeado por concesionario/vendedor/admin.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mark_survey_sent(p_survey_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v record;
BEGIN
  SELECT id, dealership_id, salesperson, status INTO v
  FROM public.satisfaction_surveys WHERE id = p_survey_id;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Encuesta no encontrada'; END IF;

  IF NOT (public.is_admin_user()
      OR (public.get_user_role() = 'concesionario' AND v.dealership_id = ANY(public.current_user_dealership_ids()))
      OR (public.get_user_role() = 'vendedor'      AND v.salesperson  = ANY(public.current_user_salesperson_names()))) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF v.status = 'pending' THEN
    UPDATE public.satisfaction_surveys
      SET status = 'sent', sent_at = now(), updated_at = now()
      WHERE id = p_survey_id;
  END IF;
END;
$$;

-- ============================================================================
-- RPC (staff/admin): backfill idempotente de los prospectos ya en "ganado" que no
-- tienen encuesta (los 171 históricos). Devuelve cuántas creó.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.backfill_satisfaction_surveys()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'No autorizado'; END IF;

  INSERT INTO public.satisfaction_surveys (
    prospect_id, kommo_lead_id, dealership_id, salesperson, client_name, client_phone,
    sold_plate, eligible_at
  )
  SELECT p.id, p.kommo_lead_id, p.dealership_id, p.salesperson, p.name, p.phone,
         p.sold_plate, coalesce(p.status_updated_at, now()) + interval '24 hours'
  FROM public.prospects p
  WHERE p.status = 'ganado'
  ON CONFLICT (prospect_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.get_survey_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_survey_response(text, int, int, int, int, int, boolean, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_survey_sent(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_satisfaction_surveys() TO authenticated;
