import { describe, it, expect } from 'vitest';
import { pickDefaultKeepId, translateMergeClientsError } from './MergeClientsDialog';

const client = (over: Partial<{
  id: string; full_name: string; cedula: string | null; phone: string | null;
  email: string | null; city: string | null; is_active: boolean; created_at: string;
}> = {}) => ({
  id: 'a',
  full_name: 'Cliente',
  cedula: null,
  phone: null,
  email: null,
  city: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  ...over,
});

describe('pickDefaultKeepId', () => {
  it('nunca propone conservar la ficha desactivada, aunque sea la única con cédula', () => {
    const viva = client({ id: 'viva', cedula: null, is_active: true, created_at: '2026-06-01T00:00:00Z' });
    const muerta = client({ id: 'muerta', cedula: 'V-12345678', is_active: false, created_at: '2026-01-01T00:00:00Z' });
    expect(pickDefaultKeepId(viva, muerta)).toBe('viva');
    expect(pickDefaultKeepId(muerta, viva)).toBe('viva');
  });

  it('entre dos fichas activas, conserva la que tiene cédula', () => {
    const sinCedula = client({ id: 'sin', cedula: null, created_at: '2026-01-01T00:00:00Z' });
    const conCedula = client({ id: 'con', cedula: 'J-40123456-7', created_at: '2026-06-01T00:00:00Z' });
    expect(pickDefaultKeepId(sinCedula, conCedula)).toBe('con');
  });

  it('empatadas en actividad y cédula, conserva la más antigua', () => {
    const vieja = client({ id: 'vieja', cedula: 'V-1', created_at: '2025-01-01T00:00:00Z' });
    const nueva = client({ id: 'nueva', cedula: 'V-2', created_at: '2026-01-01T00:00:00Z' });
    expect(pickDefaultKeepId(nueva, vieja)).toBe('vieja');
  });
});

describe('translateMergeClientsError', () => {
  it('traduce keep_inactive con la salida concreta', () => {
    expect(translateMergeClientsError('keep_inactive')).toContain('desactivada');
  });

  it('nunca devuelve el texto crudo de Postgres', () => {
    expect(translateMergeClientsError('duplicate key value violates unique constraint'))
      .toBe('No se pudo fusionar. Inténtalo de nuevo o contacta a soporte.');
  });
});
