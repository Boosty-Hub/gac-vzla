import { describe, it, expect } from 'vitest';
import { describeDeliveryError } from './manualSurveySend';

/**
 * La entrega puede fallar por motivos que sólo tienen sentido adentro de la edge function.
 * El que ve el mensaje suele ser el único que puede resolverlo, así que cada uno tiene que
 * decir QUÉ HACER, no cómo se llama el error.
 */
describe('describeDeliveryError', () => {
  it('explica una cita sin registro en Kommo y dice cómo arreglarla', () => {
    // Hoy las 694 citas completadas tienen su lead, así que este caso no está vivo. Aparece
    // cuando la creación del lead de una cita nueva falla: sin traducir, el usuario leería
    // "service_reservation_lead_missing" y no sabría que se arregla volviendo a guardar.
    const message = describeDeliveryError('Error: service_reservation_lead_missing');
    expect(message).toContain('Kommo');
    expect(message).toContain('Reservas');
    expect(message).not.toContain('service_reservation_lead_missing');
  });

  it('manda a Automatizaciones cuando falta el campo de la encuesta de postventa', () => {
    const message = describeDeliveryError('service_link_field_not_configured');
    expect(message).toContain('Automatizaciones');
    expect(message).not.toContain('service_link_field_not_configured');
  });

  it('explica una cita sin cliente', () => {
    expect(describeDeliveryError('survey_has_no_client')).toContain('cliente registrado');
  });

  it('devuelve el mensaje tal cual cuando no lo reconoce', () => {
    // Un error desconocido se muestra completo a propósito: inventarle una explicación
    // amable escondería justamente el dato que hace falta para diagnosticarlo.
    expect(describeDeliveryError('Kommo respondió 502')).toBe('Kommo respondió 502');
  });
});
