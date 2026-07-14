import { describe, it, expect } from 'vitest';
import { resolveReservationState } from './venezuelaStates';

describe('resolveReservationState', () => {
  it('returns the explicit reservation state when set, ignoring the dealership state', () => {
    expect(resolveReservationState('Zulia', 'Miranda')).toBe('Zulia');
  });

  it('falls back to the dealership state when the reservation has no override', () => {
    expect(resolveReservationState(null, 'Miranda')).toBe('Miranda');
  });

  it('falls back to the dealership state when the reservation state is undefined', () => {
    expect(resolveReservationState(undefined, 'Miranda')).toBe('Miranda');
  });

  it('returns null when neither the reservation nor the dealership has a state', () => {
    expect(resolveReservationState(null, null)).toBeNull();
  });

  it('treats an empty-string reservation state as no override', () => {
    expect(resolveReservationState('', 'Miranda')).toBe('Miranda');
  });
});
