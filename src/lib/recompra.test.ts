import { describe, it, expect } from 'vitest';
import { isRecurrentClient } from './recompra';

describe('isRecurrentClient', () => {
  it('returns true for a natural person with more than one vehicle', () => {
    expect(isRecurrentClient({ cedula: 'V-12345678', vehicleCount: 2 })).toBe(true);
  });

  it('returns false for a natural person with a single vehicle', () => {
    expect(isRecurrentClient({ cedula: 'V-12345678', vehicleCount: 1 })).toBe(false);
  });

  it('returns true for a legal entity (J) with more than one vehicle (companies count too)', () => {
    expect(isRecurrentClient({ cedula: 'J-30012345', vehicleCount: 5 })).toBe(true);
  });

  it('returns true for a government entity (G) with more than one vehicle', () => {
    expect(isRecurrentClient({ cedula: 'G-20012345', vehicleCount: 2 })).toBe(true);
  });

  it('returns true for a communal-council entity (C) with more than one vehicle', () => {
    expect(isRecurrentClient({ cedula: 'C-12345678', vehicleCount: 2 })).toBe(true);
  });

  it('returns false for any client with a single vehicle, regardless of prefix', () => {
    expect(isRecurrentClient({ cedula: 'J-30012345', vehicleCount: 1 })).toBe(false);
  });

  it('returns true for an empty cedula with more than one vehicle', () => {
    expect(isRecurrentClient({ cedula: '', vehicleCount: 2 })).toBe(true);
  });

  it('returns false for zero vehicles', () => {
    expect(isRecurrentClient({ cedula: 'V-123', vehicleCount: 0 })).toBe(false);
  });

  it('treats a null cedula the same and counts vehicles', () => {
    expect(isRecurrentClient({ cedula: null, vehicleCount: 2 })).toBe(true);
  });

  it('returns false for a null cedula with a single vehicle', () => {
    expect(isRecurrentClient({ cedula: null, vehicleCount: 1 })).toBe(false);
  });
});
