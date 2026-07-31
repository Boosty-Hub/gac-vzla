import { supabase } from '@/integrations/supabase/client';
import { extractEdgeError } from '@/lib/edgeError';

/**
 * Client-side wrapper around the `kommo-api` edge function's
 * `deliver_satisfaction_survey` action (design.md section 3 / requirements.md R3/R9).
 *
 * Shared by the "reenviar encuesta" button (`ClientDetailDialog`) and the repurchase
 * flow's "Registrar y enviar encuesta" outcome (`RepurchaseDialog`) so both surfaces
 * report `delivered` / `skipped` / config error (400) / real error (500) identically —
 * never showing a success message when `delivered` is false.
 */

export type DeliverSurveyIdentifier =
  | { client_id: string }
  | { survey_id: string }
  | { prospect_id: string };

export type DeliverSurveyReason = 'won' | 'repurchase' | 'resend';

export interface DeliverSurveyResult {
  delivered: boolean;
  skipped?: string;
  survey_id?: string;
  client_id?: string;
  lead_id?: number | null;
  token?: string;
}

export type DeliverSurveyOutcome =
  | { kind: 'delivered'; result: DeliverSurveyResult }
  | { kind: 'skipped'; reason: string; result: DeliverSurveyResult }
  // Kommo delivery config is incomplete (kommo-api returns 400 — `survey_stage_id`,
  // `survey_link_field_id` or `survey_base_url` missing from `integration_configs`).
  | { kind: 'config_error'; message: string }
  // Any other failure (network, 500, unexpected shape).
  | { kind: 'error'; message: string };

export async function deliverSatisfactionSurvey(
  identifier: DeliverSurveyIdentifier,
  reason: DeliverSurveyReason,
): Promise<DeliverSurveyOutcome> {
  const { data, error } = await supabase.functions.invoke('kommo-api', {
    body: { action: 'deliver_satisfaction_survey', ...identifier, reason },
  });

  if (error) {
    // FunctionsHttpError's `context` is the raw fetch Response — `.status` distinguishes
    // the 400 "config incomplete" contract from a genuine 500 (see kommo-api/index.ts's
    // deliver_satisfaction_survey handler).
    const status = (error as { context?: { status?: number } })?.context?.status;
    const message = await extractEdgeError(error, 'No se pudo procesar el envío de la encuesta.');
    return status === 400 ? { kind: 'config_error', message } : { kind: 'error', message };
  }

  const result = (data || {}) as DeliverSurveyResult;
  if (result.delivered) return { kind: 'delivered', result };
  return { kind: 'skipped', reason: result.skipped || 'desconocido', result };
}

/**
 * Human-readable Spanish for every known `skipped` value kommo-api can return
 * (design.md section 3, steps 2/5/6). None of these are failures — they are
 * deliberate refusals — but they MUST NOT be reported as "encuesta enviada".
 */
export function describeSkippedDelivery(reason: string): string {
  switch (reason) {
    case 'disabled':
      return 'El envío automático de encuestas está desactivado por ahora.';
    case 'rate_limited_24h':
      return 'Este cliente ya recibió una encuesta en las últimas 24 horas; no se envió otra.';
    case 'shared_conversation_lead':
      return 'No se envió: la conversación de Kommo de este cliente está compartida con otro registro, así que el envío se bloqueó para evitar contactar al cliente equivocado.';
    // Only ever returned for the automatic reasons ('won' / 'repurchase'). A human-initiated
    // 'resend' is the deliberate escape hatch and is always allowed through.
    case 'already_delivered':
      return 'Esta encuesta ya se había enviado; no se envió de nuevo. Usá "Reenviar encuesta" si querés mandarla otra vez.';
    default:
      return `No se envió la encuesta (motivo: ${reason}).`;
  }
}
