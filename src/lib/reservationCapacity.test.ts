import { describe, it, expect } from 'vitest';
import { computeSlotOccupancy } from './reservationCapacity';

describe('computeSlotOccupancy', () => {
  it('counts a zero-duration existing reservation (e.g. Solicitud de Repuestos) as zero occupancy', () => {
    // Solicitud de Repuestos rows are stored with duration_minutes: 0 so they never
    // block a bay/time slot. A candidate at the same start time must stay free.
    const result = computeSlotOccupancy({
      existingReservations: [
        { reservation_time: '09:00', service_type: 'Solicitud de Repuestos', duration_minutes: 0 },
      ],
      startTime: '09:00',
      durationMinutes: 60,
      bays: 2,
    });
    expect(result.occupied).toBe(0);
    expect(result.full).toBe(false);
  });

  it('still counts a normal existing reservation toward occupancy at the same slot', () => {
    const result = computeSlotOccupancy({
      existingReservations: [
        { reservation_time: '09:00', service_type: 'Mantenimiento', duration_minutes: 60 },
      ],
      startTime: '09:00',
      durationMinutes: 60,
      bays: 1,
    });
    expect(result.occupied).toBe(1);
    expect(result.full).toBe(true);
  });
});
