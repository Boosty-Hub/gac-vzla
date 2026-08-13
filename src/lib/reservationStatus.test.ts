import { describe, it, expect } from 'vitest';
import {
  RESERVATION_STATUSES,
  RESERVATION_STATUS_CONFIG,
  ARCHIVED_RESERVATION_STATUSES,
  isReservationStatus,
  reservationStatusStyle,
} from './reservationStatus';

/**
 * These tests exist to stop ONE specific regression from coming back: a view offering a
 * status the database rejects. See the header of reservationStatus.ts for the incident.
 */
describe('reservationStatus', () => {
  it('matches the reservations_status_check constraint exactly', () => {
    // Copied verbatim from the live constraint on 2026-08-13:
    //   CHECK (status = ANY (ARRAY['pendiente','confirmada','en_proceso','completada','cancelada']))
    // If a status is added here, that constraint must be migrated in the same change.
    expect([...RESERVATION_STATUSES]).toEqual([
      'pendiente',
      'confirmada',
      'en_proceso',
      'completada',
      'cancelada',
    ]);
  });

  it('does not resurrect the phantom incidencia statuses', () => {
    // `agendada` and `culminado` were offered by the incidencia views and rejected by the
    // database on every save. Zero rows ever carried them.
    expect(isReservationStatus('agendada')).toBe(false);
    expect(isReservationStatus('culminado')).toBe(false);
  });

  it('gives every valid status a label and a colour', () => {
    for (const status of RESERVATION_STATUSES) {
      expect(RESERVATION_STATUS_CONFIG[status].label).toBeTruthy();
      expect(RESERVATION_STATUS_CONFIG[status].color).toBeTruthy();
    }
  });

  it('labels "completada" as Completada, never Culminada', () => {
    expect(RESERVATION_STATUS_CONFIG.completada.label).toBe('Completada');
  });

  it('shows an unknown status as itself instead of disguising it as Pendiente', () => {
    // The old per-view fallback was `map[status] || map.pendiente`, so a bad value rendered
    // as a legitimate state and nobody could see anything was wrong.
    expect(reservationStatusStyle('culminado').label).toBe('culminado');
    expect(reservationStatusStyle(null).label).toBe('Sin estado');
  });

  it('archives only completed and cancelled appointments', () => {
    expect(ARCHIVED_RESERVATION_STATUSES.has('completada')).toBe(true);
    expect(ARCHIVED_RESERVATION_STATUSES.has('cancelada')).toBe(true);
    expect(ARCHIVED_RESERVATION_STATUSES.has('en_proceso')).toBe(false);
    // `culminado` used to sit in this set, hiding rows that could not exist.
    expect(ARCHIVED_RESERVATION_STATUSES.has('culminado')).toBe(false);
  });
});
