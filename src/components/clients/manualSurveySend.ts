import { supabase } from '@/integrations/supabase/client';
import { deliverSatisfactionSurvey, describeSkippedDelivery } from './surveyDelivery';

/**
 * Envío MANUAL de una encuesta de satisfacción (2026-08-24).
 *
 * Desde este día el barrido automático no manda nada: manda una persona, con un botón.
 *   - Entrega de vehículo -> ficha del cliente, pestaña "Encuestas", "Enviar encuesta".
 *   - Postventa / servicio -> diálogo "Completar Servicio", decisión obligatoria sí/no.
 *
 * Los dos caminos hacen lo mismo en dos pasos, y por eso viven acá y no duplicados en tres
 * pantallas:
 *
 *   1. `ensure_*_survey` — asegura que la FILA exista. Hace falta porque con el interruptor
 *      apagado no se creó ninguna: sin este paso, prender el interruptor más tarde dejaría el
 *      botón muerto para todas las ventas y servicios de este período.
 *   2. `deliver_satisfaction_survey` — la entrega. Sigue siendo la edge function la única que
 *      escribe en Kommo, así que todos los cortes de seguridad siguen en un solo lugar.
 *
 * Se manda con `reason: 'resend'` a propósito, incluso la primera vez: 'resend' es el único
 * motivo que la edge function deja pasar por encima del guard de `already_delivered`, y esto
 * es literalmente una persona pidiendo que salga ahora.
 */

/**
 * `supabase.rpc` es un método de clase y usa `this` adentro. Guardarlo suelto en una constante
 * lo desprende del cliente y revienta antes de tocar la red. Se envuelve para que el `this`
 * viaje siempre — misma trampa que dejó dos tarjetas de configuración en "Cargando..." para
 * siempre el 2026-08-19.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (fn: string, params?: Record<string, unknown>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase.rpc as any)(fn, params);

export type ManualSendResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * Motivos que devuelven `ensure_sales_survey` / `ensure_service_survey` cuando NO pueden
 * dejar la fila lista. Se traducen acá y no en la pantalla para que las tres digan lo mismo.
 */
function describeEnsureReason(reason: string): string {
  switch (reason) {
    case 'sales_survey_disabled':
      return 'La encuesta de entrega de vehículo está desactivada. Actívala en Configuración → Automatizaciones para poder usar este botón.';
    case 'service_survey_disabled':
      return 'La encuesta de postventa / servicio está desactivada. Actívala en Configuración → Automatizaciones para poder usar este botón.';
    case 'sin_venta_registrada':
      return 'Este cliente no tiene ninguna venta registrada, así que no hay encuesta de entrega de vehículo para enviarle.';
    case 'sin_telefono':
      return 'No hay un teléfono cargado para este cliente, y la encuesta se envía por WhatsApp.';
    case 'sin_cliente':
      return 'Esta cita no está asociada a un cliente registrado, así que no se le puede enviar la encuesta.';
    case 'tipo_de_servicio_excluido':
      return 'Este tipo de servicio está configurado para no enviar encuesta de postventa. Se cambia en Configuración → Servicios.';
    case 'rate_limited_24h':
      return 'Este cliente ya recibió una encuesta de este tipo en las últimas 24 horas; no se le envía otra.';
    case 'reserva_no_encontrada':
      return 'No se encontró la cita, así que no se pudo preparar la encuesta.';
    case 'no_creada':
      return 'No se pudo preparar la encuesta. Intentá de nuevo en un momento.';
    default:
      return `No se pudo preparar la encuesta (motivo: ${reason}).`;
  }
}

function describeRpcError(e: unknown, fallback: string): string {
  const msg = String((e as { message?: string })?.message || '');
  if (msg.includes('not_authorized')) {
    return 'Tu usuario no tiene permiso para enviar encuestas. Se otorga en Configuración → Roles.';
  }
  return fallback;
}

/**
 * Paso 1 + paso 2 en uno. `ensureFn` es el nombre de la RPC y `params` su argumento; el resto
 * es idéntico para venta y postventa, y esa es justamente la razón de que compartan función.
 */
async function ensureAndDeliver(
  ensureFn: 'ensure_sales_survey' | 'ensure_service_survey',
  params: Record<string, unknown>,
  successMessage: string,
): Promise<ManualSendResult> {
  let surveyId: string | null = null;

  try {
    const { data, error } = await rpc(ensureFn, params);
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as
      | { survey_id: string | null; reason: string }
      | undefined;

    if (!row) return { ok: false, message: 'No se pudo preparar la encuesta.' };
    if (!row.survey_id) return { ok: false, message: describeEnsureReason(row.reason) };
    surveyId = row.survey_id;
  } catch (e) {
    console.error(e);
    return { ok: false, message: describeRpcError(e, 'No se pudo preparar la encuesta.') };
  }

  const outcome = await deliverSatisfactionSurvey({ survey_id: surveyId }, 'resend');
  switch (outcome.kind) {
    case 'delivered':
      return { ok: true, message: successMessage };
    case 'skipped':
      return { ok: false, message: describeSkippedDelivery(outcome.reason) };
    default:
      return { ok: false, message: outcome.message };
  }
}

/** Encuesta de ENTREGA DE VEHÍCULO para un cliente (ficha del cliente → "Enviar encuesta"). */
export function sendSalesSurveyNow(clientId: string): Promise<ManualSendResult> {
  return ensureAndDeliver(
    'ensure_sales_survey',
    { p_client_id: clientId },
    'Encuesta de entrega de vehículo enviada al cliente.',
  );
}

/** Encuesta de POSTVENTA / SERVICIO de una cita (diálogo "Completar Servicio"). */
export function sendServiceSurveyNow(reservationId: string): Promise<ManualSendResult> {
  return ensureAndDeliver(
    'ensure_service_survey',
    { p_reservation_id: reservationId },
    'Encuesta de postventa / servicio enviada al cliente.',
  );
}
