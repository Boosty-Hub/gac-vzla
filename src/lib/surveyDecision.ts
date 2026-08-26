import { supabase } from '@/integrations/supabase/client';

/**
 * Acta de quién decidió enviar (o no) una encuesta.
 *
 * Desde el 2026-08-24 las encuestas las manda una persona, con un botón. La decisión ya era
 * obligatoria al completar un servicio, pero no quedaba escrita en ningún lado: si el cliente
 * reclamaba que nunca le llegó, no había forma de saber quién eligió qué.
 *
 * Se escribe SIEMPRE, incluso — y sobre todo — cuando la respuesta es "no". Guardar sólo los
 * "sí" convierte al registro en una lista de envíos, que es justamente lo que ya existía.
 *
 * Nunca rompe la operación que la llama. Cerrar un servicio o registrar una venta no puede
 * fallar porque el acta no se pudo escribir: se avisa por consola y se sigue.
 */

/** `supabase.rpc` usa `this` adentro; guardarlo suelto lo desprende del cliente. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (fn: string, params?: Record<string, unknown>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase.rpc as any)(fn, params);

export type SurveyDecisionKind = 'venta' | 'postventa';

export interface SurveyDecisionTarget {
  prospectId?: string | null;
  reservationId?: string | null;
  clientId?: string | null;
  surveyId?: string | null;
}

/**
 * Deja el acta y devuelve su id, o `null` si no se pudo escribir.
 *
 * El id sirve para cerrarla después con `closeSurveyDecision` — "pidió que se enviara" y
 * "llegó" son dos hechos distintos y se registran por separado.
 */
export async function recordSurveyDecision(
  kind: SurveyDecisionKind,
  decision: boolean,
  target: SurveyDecisionTarget,
  outcome?: string,
): Promise<string | null> {
  try {
    const { data, error } = await rpc('record_survey_decision', {
      p_kind: kind,
      p_decision: decision,
      p_prospect_id: target.prospectId ?? null,
      p_reservation_id: target.reservationId ?? null,
      p_client_id: target.clientId ?? null,
      p_survey_id: target.surveyId ?? null,
      p_outcome: outcome ?? null,
    });
    if (error) throw error;
    return (typeof data === 'string' ? data : null);
  } catch (e) {
    console.error('[encuestas] no se pudo registrar la decisión:', e);
    return null;
  }
}

/** Escribe el resultado real del envío sobre un acta ya abierta. */
export async function closeSurveyDecision(
  decisionId: string | null,
  outcome: string,
): Promise<void> {
  if (!decisionId) return;
  try {
    const { error } = await rpc('set_survey_decision_outcome', {
      p_decision_id: decisionId,
      p_outcome: outcome,
    });
    if (error) throw error;
  } catch (e) {
    console.error('[encuestas] no se pudo cerrar el acta:', e);
  }
}

export interface SurveyDecisionRecord {
  id: string;
  kind: SurveyDecisionKind;
  decision: boolean;
  decided_by_name: string;
  decided_at: string;
  outcome: string | null;
}

/** Última acta de un prospecto o de una cita, para mostrarla en la ficha. */
export async function fetchLatestSurveyDecision(
  target: { prospectId: string } | { reservationId: string },
): Promise<SurveyDecisionRecord | null> {
  const column = 'prospectId' in target ? 'prospect_id' : 'reservation_id';
  const value = 'prospectId' in target ? target.prospectId : target.reservationId;
  const { data, error } = await supabase
    .from('survey_send_decisions')
    .select('id, kind, decision, decided_by_name, decided_at, outcome')
    .eq(column, value)
    .order('decided_at', { ascending: false })
    .limit(1);
  if (error) {
    console.error('[encuestas] no se pudo leer el acta:', error);
    return null;
  }
  return (data?.[0] as SurveyDecisionRecord | undefined) ?? null;
}

/** Texto de una línea para la ficha: quién decidió qué, cuándo, y qué pasó después. */
export function describeSurveyDecision(record: SurveyDecisionRecord): string {
  const when = new Date(record.decided_at).toLocaleString('es-VE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const what = record.decision ? 'Sí, enviar' : 'No enviar';
  const tail = record.outcome ? ` · ${record.outcome}` : '';
  return `${what} — ${record.decided_by_name}, ${when}${tail}`;
}
