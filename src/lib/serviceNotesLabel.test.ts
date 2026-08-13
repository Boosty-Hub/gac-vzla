import { describe, it, expect } from 'vitest';
import { serviceNotesLabel } from './serviceTypes';

/**
 * `reservations.notes` guarda POR QUÉ entró el vehículo. Las vistas de detalle sólo lo
 * mostraban para incidencias y repuestos, así que en un mantenimiento normal el motivo del
 * ingreso quedaba invisible salvo entrando a Editar.
 */
describe('serviceNotesLabel', () => {
  it('llama falla a lo que es una falla', () => {
    expect(serviceNotesLabel('Falla o Desperfecto')).toBe('Descripción de la falla');
    expect(serviceNotesLabel('Incidencia')).toBe('Descripción de la falla');
  });

  it('llama solicitud al pedido de repuestos', () => {
    expect(serviceNotesLabel('Solicitud de Repuestos')).toBe('Descripción de la solicitud');
  });

  it('da un título propio a los servicios normales, que antes no mostraban nada', () => {
    // Son la mayoría del histórico: 446 mantenimientos por kilometraje y 112 revisiones.
    expect(serviceNotesLabel('Mantenimiento por Kilometraje')).toBe('Motivo del ingreso');
    expect(serviceNotesLabel('Revisión y Diagnóstico')).toBe('Motivo del ingreso');
    expect(serviceNotesLabel('Garantía')).toBe('Motivo del ingreso');
  });

  it('nunca queda sin título, aunque el tipo falte', () => {
    expect(serviceNotesLabel(null)).toBe('Motivo del ingreso');
    expect(serviceNotesLabel(undefined)).toBe('Motivo del ingreso');
    expect(serviceNotesLabel('')).toBe('Motivo del ingreso');
  });
});
