import type { ServiceSurveySummary } from '@/hooks/useServiceSurveys';

/**
 * Estado de la encuesta de postventa de una cita, para pintar el icono del listado del
 * Historial.
 *
 * Vive suelto y no adentro del diálogo porque es la única parte de esta función que puede estar
 * mal sin que se note: es lo único que ve alguien que revisa cien citas seguidas. Si dice "sin
 * enviar" sobre una encuesta ya enviada, la manda de nuevo y el cliente recibe dos veces el
 * mismo WhatsApp.
 *
 * `responded_at` gana sobre `status` a propósito: uno es el hecho, el otro el estado de la
 * maquinaria, y cuando no coinciden lo que importa es el hecho.
 */
export type ServiceSurveyIconState = 'no_aplica' | 'sin_enviar' | 'enviada' | 'respondida';

export const serviceSurveyIconState = (
  survey: ServiceSurveySummary | undefined,
  sendsSurvey: boolean,
): ServiceSurveyIconState => {
  // El tipo de servicio manda sobre todo lo demás: aunque exista una encuesta vieja, la base
  // rechaza el envío igual, así que ofrecerlo sería mentir.
  if (!sendsSurvey) return 'no_aplica';
  if (survey?.responded_at) return 'respondida';
  if (survey?.status === 'sent') return 'enviada';
  // 'pending' incluido: la fila existe pero el mensaje nunca salió. Es justo el caso que el
  // botón resuelve.
  return 'sin_enviar';
};
