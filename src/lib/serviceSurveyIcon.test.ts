import { describe, it, expect } from 'vitest';
import { serviceSurveyIconState } from '@/lib/serviceSurveyIcon';
import type { ServiceSurveySummary } from '@/hooks/useServiceSurveys';

/**
 * El icono del listado del Historial es lo único que ve alguien que revisa cien citas seguidas.
 * Si dice "sin enviar" sobre una encuesta ya enviada, la manda de nuevo — y el cliente recibe
 * dos veces el mismo WhatsApp.
 */

const survey = (over: Partial<ServiceSurveySummary>): ServiceSurveySummary => ({
  id: 's1',
  reservation_id: 'r1',
  status: 'pending',
  responded_at: null,
  response: null,
  ...over,
});

describe('serviceSurveyIconState', () => {
  it('sin encuesta todavía -> se puede enviar', () => {
    expect(serviceSurveyIconState(undefined, true)).toBe('sin_enviar');
  });

  it('enviada y sin responder -> enviada, no "sin enviar"', () => {
    // Había 118 filas en este estado. Antes el icono habría invitado a mandarla de nuevo.
    expect(serviceSurveyIconState(survey({ status: 'sent' }), true)).toBe('enviada');
  });

  it('respondida -> respondida, aunque el estado siga diciendo otra cosa', () => {
    // `responded_at` manda sobre `status`: es el hecho, no el estado de la maquinaria.
    expect(serviceSurveyIconState(
      survey({ status: 'sent', responded_at: '2026-08-20T10:00:00Z' }), true,
    )).toBe('respondida');
  });

  it('creada pero sin enviar -> sigue siendo enviable', () => {
    // `pending` = la fila existe pero el mensaje no salió. Es exactamente el caso que el
    // botón resuelve.
    expect(serviceSurveyIconState(survey({ status: 'pending' }), true)).toBe('sin_enviar');
  });

  it('tipo de servicio que no manda encuesta -> no aplica, gane lo que gane el estado', () => {
    // "Falla o Desperfecto" y "Solicitud de Repuestos" tienen sends_postventa_survey en false.
    // Que exista una encuesta vieja no reabre el botón: la base la rechaza igual.
    expect(serviceSurveyIconState(undefined, false)).toBe('no_aplica');
    expect(serviceSurveyIconState(survey({ status: 'sent' }), false)).toBe('no_aplica');
    expect(serviceSurveyIconState(
      survey({ responded_at: '2026-08-20T10:00:00Z' }), false,
    )).toBe('no_aplica');
  });
});
