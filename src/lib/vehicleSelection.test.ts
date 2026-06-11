import { describe, it, expect } from 'vitest';
import { resolveAutoVehicle } from './vehicleSelection';

describe('resolveAutoVehicle', () => {
  const vehicles = [
    { id: 'v1', plate: 'AB123' },
    { id: 'v2', plate: 'CD456' },
    { id: 'v3', plate: 'EF789' },
  ];

  it('returns the vehicle whose plate exactly matches the hint (among many)', () => {
    const result = resolveAutoVehicle(vehicles, 'CD456');
    expect(result?.id).toBe('v2');
  });

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    const result = resolveAutoVehicle(vehicles, '  ab123 ');
    expect(result?.id).toBe('v1');
  });

  it('returns the single vehicle when there is no hint and only one vehicle exists', () => {
    const single = [{ id: 'v1', plate: 'AB123' }];
    const result = resolveAutoVehicle(single, null);
    expect(result?.id).toBe('v1');
  });

  it('returns null when there is no hint and multiple vehicles exist', () => {
    const result = resolveAutoVehicle(vehicles, null);
    expect(result).toBeNull();
  });

  it('returns null when hint does not match any plate and multiple vehicles exist', () => {
    const result = resolveAutoVehicle(vehicles, 'ZZ999');
    expect(result).toBeNull();
  });

  it('still returns the single vehicle when hint has no match and only one vehicle exists', () => {
    const single = [{ id: 'v1', plate: 'AB123' }];
    const result = resolveAutoVehicle(single, 'ZZ999');
    expect(result?.id).toBe('v1');
  });

  it('returns null for an empty array', () => {
    const result = resolveAutoVehicle([], 'AB123');
    expect(result).toBeNull();
  });

  it('handles vehicles with null plate gracefully', () => {
    const withNulls = [
      { id: 'v1', plate: null },
      { id: 'v2', plate: 'AB123' },
    ];
    const result = resolveAutoVehicle(withNulls, 'AB123');
    expect(result?.id).toBe('v2');
  });
});
