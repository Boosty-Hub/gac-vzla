import { describe, it, expect } from 'vitest';
import { buildVehicleSearchFilter, sanitizeSearchTerm } from './vehicleSearch';

describe('sanitizeSearchTerm', () => {
  it('trims surrounding whitespace', () => {
    expect(sanitizeSearchTerm('  ABC123  ')).toBe('ABC123');
  });

  it('removes double quotes and backslashes', () => {
    expect(sanitizeSearchTerm('AB"C\\123')).toBe('ABC123');
  });

  it('preserves commas, parentheses and percent signs', () => {
    expect(sanitizeSearchTerm('Rojo (met, x) 50%')).toBe('Rojo (met, x) 50%');
  });
});

describe('buildVehicleSearchFilter', () => {
  it('filters by plate, vin and color with double-quoted patterns when no model ids match', () => {
    expect(buildVehicleSearchFilter('ABC123', [])).toBe(
      'plate.ilike."%ABC123%",vin.ilike."%ABC123%",color.ilike."%ABC123%"',
    );
  });

  it('appends a model_id.in clause when model ids are given', () => {
    expect(buildVehicleSearchFilter('GS3', ['id-1', 'id-2'])).toBe(
      'plate.ilike."%GS3%",vin.ilike."%GS3%",color.ilike."%GS3%",model_id.in.(id-1,id-2)',
    );
  });

  it('trims surrounding whitespace from the term', () => {
    expect(buildVehicleSearchFilter('  ABC123  ', [])).toBe(
      'plate.ilike."%ABC123%",vin.ilike."%ABC123%",color.ilike."%ABC123%"',
    );
  });

  it('preserves commas and parentheses inside the quoted patterns', () => {
    expect(buildVehicleSearchFilter('Rojo (met, x)', [])).toBe(
      'plate.ilike."%Rojo (met, x)%",vin.ilike."%Rojo (met, x)%",color.ilike."%Rojo (met, x)%"',
    );
  });

  it('removes double quotes and backslashes from the term', () => {
    expect(buildVehicleSearchFilter('AB"C\\123', [])).toBe(
      'plate.ilike."%ABC123%",vin.ilike."%ABC123%",color.ilike."%ABC123%"',
    );
  });

  it('returns an empty string when the term sanitizes to empty', () => {
    expect(buildVehicleSearchFilter('   ', [])).toBe('');
    expect(buildVehicleSearchFilter('"\\"', ['id-1'])).toBe('');
  });
});
