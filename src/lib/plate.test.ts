import { describe, it, expect } from 'vitest';
import { normalizeSoldPlate, isValidSoldPlate } from './plate';

describe('normalizeSoldPlate', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeSoldPlate('  AB123CD  ')).toBe('AB123CD');
  });

  it('uppercases lowercase input', () => {
    expect(normalizeSoldPlate('ab123cd')).toBe('AB123CD');
  });

  it('collapses internal whitespace runs to a single space', () => {
    expect(normalizeSoldPlate('AB  123   CD')).toBe('AB 123 CD');
  });

  it('normalizes mixed-case input with irregular spacing', () => {
    expect(normalizeSoldPlate('  aB12  3cd ')).toBe('AB12 3CD');
  });

  it('returns an empty string for empty input', () => {
    expect(normalizeSoldPlate('')).toBe('');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeSoldPlate('   ')).toBe('');
  });
});

describe('isValidSoldPlate', () => {
  it('returns false for empty input', () => {
    expect(isValidSoldPlate('')).toBe(false);
  });

  it('returns false for whitespace-only input', () => {
    expect(isValidSoldPlate('   ')).toBe(false);
  });

  it('returns true for a plain plate', () => {
    expect(isValidSoldPlate('AB123CD')).toBe(true);
  });

  it('returns true for a lowercase plate with irregular spacing', () => {
    expect(isValidSoldPlate('  ab 123 cd  ')).toBe(true);
  });
});
