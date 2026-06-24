import { describe, it, expect } from 'vitest';
import { isRecurrentClient } from './recompra';

describe('isRecurrentClient', () => {
  it('returns true for a natural person with more than one vehicle', () => {
    expect(isRecurrentClient({ cedula: 'V-12345678', vehicleCount: 2 })).toBe(true);
  });

  it('returns false for a natural person with a single vehicle', () => {
    expect(isRecurrentClient({ cedula: 'V-12345678', vehicleCount: 1 })).toBe(false);
  });

  it('returns false for a legal entity (cedula starting with J) regardless of vehicle count', () => {
    expect(isRecurrentClient({ cedula: 'J-30012345', vehicleCount: 5 })).toBe(false);
  });

  it('returns false for a lowercase legal-entity prefix (j-30...)', () => {
    expect(isRecurrentClient({ cedula: 'j-30012345', vehicleCount: 2 })).toBe(false);
  });

  it('returns false for a legal-entity prefix without separator (J30012345)', () => {
    expect(isRecurrentClient({ cedula: 'J30012345', vehicleCount: 2 })).toBe(false);
  });

  it('returns false for a government entity prefix (G-20...)', () => {
    expect(isRecurrentClient({ cedula: 'G-20012345', vehicleCount: 2 })).toBe(false);
  });

  it('returns false for a communal-council prefix (C-12...)', () => {
    expect(isRecurrentClient({ cedula: 'C-12345678', vehicleCount: 2 })).toBe(false);
  });

  it('ignores leading whitespace when detecting the entity prefix (" J-30..")', () => {
    expect(isRecurrentClient({ cedula: ' J-30012345', vehicleCount: 2 })).toBe(false);
  });

  it('treats an empty cedula as a natural person and counts vehicles', () => {
    expect(isRecurrentClient({ cedula: '', vehicleCount: 2 })).toBe(true);
  });

  it('returns false for a natural person (V) with a single vehicle', () => {
    expect(isRecurrentClient({ cedula: 'V-123', vehicleCount: 0 })).toBe(false);
  });

  it('returns true for a foreign natural person (E) with more than one vehicle', () => {
    expect(isRecurrentClient({ cedula: 'E-456', vehicleCount: 2 })).toBe(true);
  });

  it('treats a null cedula as a natural person and counts vehicles', () => {
    expect(isRecurrentClient({ cedula: null, vehicleCount: 2 })).toBe(true);
  });

  it('returns false for a null cedula with a single vehicle', () => {
    expect(isRecurrentClient({ cedula: null, vehicleCount: 1 })).toBe(false);
  });
});
