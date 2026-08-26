-- Registro de quién decidió enviar (o no) una encuesta (2026-08-26)
--
-- Desde el 2026-08-24 las encuestas no salen solas: las manda una persona con un botón. Pero
-- esa decisión no quedaba escrita en ningún lado. El diálogo de "Completar Servicio" YA obliga
-- a elegir sí/no y después tira la respuesta a la basura: si el cliente reclama que nunca
-- recibió la encuesta, o si se le mandó una a alguien que se fue enojado, no hay forma de saber
-- quién eligió qué.
--
-- Esta tabla es un libro de actas, no un estado. Sólo se agregan filas — no se editan ni se
-- borran — y por eso no tiene políticas de UPDATE ni de DELETE: ni siquiera un admin puede
-- reescribir lo que alguien marcó.
--
-- Cubre las DOS encuestas con el mismo formato, porque la pregunta que responden es la misma
-- ("¿se le manda o no?") y separarlas en dos tablas obligaría a leer dos veces para armar una
-- sola línea de historial.

CREATE TABLE IF NOT EXISTS public.survey_send_decisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'venta'     -> encuesta de entrega de vehículo, se decide al marcar el prospecto ganado.
  -- 'postventa' -> encuesta de servicio, se decide al completar la cita.
  kind            text NOT NULL CHECK (kind IN ('venta', 'postventa')),
  prospect_id     uuid REFERENCES public.prospects(id)             ON DELETE SET NULL,
  reservation_id  uuid REFERENCES public.reservations(id)          ON DELETE SET NULL,
  client_id       uuid REFERENCES public.clients(id)               ON DELETE SET NULL,
  survey_id       uuid REFERENCES public.satisfaction_surveys(id)  ON DELETE SET NULL,
  -- true = "sí, enviar". false = "no enviar". No admite NULL: la decisión es obligatoria en
  -- pantalla, y una fila sin decisión no registraría nada.
  decision        boolean NOT NULL,
  decided_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Copia del nombre al momento de decidir. `decided_by` se pone en NULL si borran al usuario,
  -- y entonces el acta diría "alguien marcó que no". El nombre congelado la mantiene legible.
  decided_by_name text NOT NULL,
  decided_at      timestamptz NOT NULL DEFAULT now(),
  -- Qué pasó DESPUÉS de decidir que sí: 'enviada' o el motivo por el que no salió. Separado de
  -- `decision` a propósito: "pidió que se enviara" y "llegó" son dos hechos distintos, y
  -- mezclarlos es lo que hace que un reclamo no se pueda resolver.
  outcome         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT survey_send_decisions_target_check
    CHECK (prospect_id IS NOT NULL OR reservation_id IS NOT NULL OR client_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS survey_send_decisions_prospect_idx
  ON public.survey_send_decisions (prospect_id, decided_at DESC) WHERE prospect_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS survey_send_decisions_reservation_idx
  ON public.survey_send_decisions (reservation_id, decided_at DESC) WHERE reservation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS survey_send_decisions_client_idx
  ON public.survey_send_decisions (client_id, decided_at DESC) WHERE client_id IS NOT NULL;

ALTER TABLE public.survey_send_decisions ENABLE ROW LEVEL SECURITY;

-- Quién puede LEER el acta: quien ya podía ver el prospecto o la cita a la que pertenece.
--
-- Los EXISTS de abajo se evalúan con la RLS del usuario que consulta, así que la visibilidad se
-- hereda sola: un vendedor ve las actas de SUS prospectos porque `prospects_select` sólo le
-- devuelve esos. No hay que repetir acá la regla de sedes ni la de vendedores, que es
-- justamente donde esas reglas se desincronizan.
DROP POLICY IF EXISTS survey_send_decisions_select ON public.survey_send_decisions;
CREATE POLICY survey_send_decisions_select ON public.survey_send_decisions
  FOR SELECT TO authenticated
  USING (
    public.is_admin_user()
    OR decided_by = (SELECT auth.uid())
    OR (prospect_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.prospects p WHERE p.id = survey_send_decisions.prospect_id))
    OR (reservation_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.reservations r WHERE r.id = survey_send_decisions.reservation_id))
  );

-- Sin políticas de INSERT / UPDATE / DELETE a propósito. La única puerta de escritura es la RPC
-- de abajo, que es SECURITY DEFINER: así `decided_by` sale siempre de `auth.uid()` y no de algo
-- que el navegador pueda mandar. Un INSERT directo desde el cliente permitiría firmar el acta
-- con el nombre de otra persona.

CREATE OR REPLACE FUNCTION public.record_survey_decision(
  p_kind           text,
  p_decision       boolean,
  p_prospect_id    uuid DEFAULT NULL,
  p_reservation_id uuid DEFAULT NULL,
  p_client_id      uuid DEFAULT NULL,
  p_survey_id      uuid DEFAULT NULL,
  p_outcome        text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid  uuid := auth.uid();
  v_name text;
  v_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_kind NOT IN ('venta', 'postventa') THEN
    RAISE EXCEPTION 'kind_invalido:%', p_kind;
  END IF;
  IF p_prospect_id IS NULL AND p_reservation_id IS NULL AND p_client_id IS NULL THEN
    RAISE EXCEPTION 'sin_referencia';
  END IF;

  SELECT COALESCE(NULLIF(btrim(pr.full_name), ''), 'Usuario sin nombre')
    INTO v_name
    FROM public.profiles pr
   WHERE pr.id = v_uid;

  INSERT INTO public.survey_send_decisions (
    kind, prospect_id, reservation_id, client_id, survey_id,
    decision, decided_by, decided_by_name, outcome
  ) VALUES (
    p_kind, p_prospect_id, p_reservation_id, p_client_id, p_survey_id,
    p_decision, v_uid, COALESCE(v_name, 'Usuario sin nombre'), p_outcome
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_survey_decision(text, boolean, uuid, uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_survey_decision(text, boolean, uuid, uuid, uuid, uuid, text) TO authenticated;

-- Cierra el acta con lo que realmente pasó. Se llama después del intento de envío, y sólo el
-- que la abrió (o un admin) puede cerrarla — el `outcome` no es editable desde ningún otro lado.
CREATE OR REPLACE FUNCTION public.set_survey_decision_outcome(
  p_decision_id uuid,
  p_outcome     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  UPDATE public.survey_send_decisions
     SET outcome = p_outcome
   WHERE id = p_decision_id
     AND (decided_by = auth.uid() OR public.is_admin_user());
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_survey_decision_outcome(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_survey_decision_outcome(uuid, text) TO authenticated;
