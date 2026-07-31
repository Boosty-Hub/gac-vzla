import { describe, it, expect } from 'vitest';
import { getStatusTransition, humanizeStatus } from './notificationText';

describe('humanizeStatus', () => {
  it('turns a slug into a readable label', () => {
    expect(humanizeStatus('cotizacion_enviada')).toBe('Cotizacion enviada');
  });

  it('leaves an already single-word status capitalized', () => {
    expect(humanizeStatus('demostracion')).toBe('Demostracion');
  });

  it('returns an empty string for blank input rather than a stray capital', () => {
    expect(humanizeStatus('')).toBe('');
    expect(humanizeStatus('   ')).toBe('');
  });
});

describe('getStatusTransition', () => {
  it('reads the pair written by the status-change triggers', () => {
    // Real shape observed in production: metadata from notify_on_prospect_status_change.
    expect(
      getStatusTransition({
        prospect_id: '8510f6df-df10-4fa6-a7e4-8706a1a0206e',
        old_status: 'demostracion',
        new_status: 'seguimiento',
      }),
    ).toEqual({ from: 'Demostracion', to: 'Seguimiento' });
  });

  it('returns null for notifications that are not status changes', () => {
    expect(getStatusTransition({ prospect_id: 'abc' })).toBeNull();
    expect(getStatusTransition(null)).toBeNull();
    expect(getStatusTransition(undefined)).toBeNull();
  });

  it('returns null when only one end of the pair is present', () => {
    expect(getStatusTransition({ new_status: 'ganado' })).toBeNull();
    expect(getStatusTransition({ old_status: 'ganado' })).toBeNull();
  });

  it('returns null when a non-string sneaks into either end', () => {
    expect(getStatusTransition({ old_status: 1, new_status: 'ganado' })).toBeNull();
  });

  it('returns null when nothing actually changed, so the row shows no "X -> X" noise', () => {
    expect(getStatusTransition({ old_status: 'ganado', new_status: 'ganado' })).toBeNull();
  });
});
