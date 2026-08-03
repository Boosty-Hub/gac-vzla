import { describe, expect, it } from 'vitest';
import {
  driverLabel,
  filterDrivers,
  findDuplicateDriver,
  formatDriverName,
  normalizeDriverName,
  type DriverOption,
} from './drivers';

const driver = (id: string, full_name: string, cedula: string | null = null): DriverOption => ({
  id,
  full_name,
  cedula,
  phone: null,
});

describe('normalizeDriverName', () => {
  it('returns "" for blank-ish input', () => {
    expect(normalizeDriverName(null)).toBe('');
    expect(normalizeDriverName(undefined)).toBe('');
    expect(normalizeDriverName('   ')).toBe('');
  });

  it('folds the exact variations R5 was written to stop', () => {
    // The requirement names these three literally.
    expect(normalizeDriverName('Moisés')).toBe('moises');
    expect(normalizeDriverName('moisés')).toBe('moises');
    expect(normalizeDriverName('  MOISES  ')).toBe('moises');
  });

  it('collapses internal whitespace runs', () => {
    expect(normalizeDriverName('Moisés   López')).toBe('moises lopez');
  });

  it('does NOT fold two genuinely different names together', () => {
    // "Moisés" and "Moisés López" are different people, and R5's example lists them
    // separately — normalization must not merge them.
    expect(normalizeDriverName('Moisés')).not.toBe(normalizeDriverName('Moisés López'));
  });
});

describe('formatDriverName', () => {
  it('title-cases while preserving accents', () => {
    expect(formatDriverName('moisés lópez')).toBe('Moisés López');
    expect(formatDriverName('MOISÉS LÓPEZ')).toBe('Moisés López');
  });

  it('collapses whitespace', () => {
    expect(formatDriverName('  juan   perez  ')).toBe('Juan Perez');
  });

  it('returns "" for blank input', () => {
    expect(formatDriverName('')).toBe('');
    expect(formatDriverName(null)).toBe('');
  });
});

describe('findDuplicateDriver', () => {
  const existing = [driver('1', 'Moisés López'), driver('2', 'Ana Torres')];

  it('matches across accent and case differences', () => {
    expect(findDuplicateDriver('moises lopez', existing)?.id).toBe('1');
    expect(findDuplicateDriver('  MOISÉS   LÓPEZ ', existing)?.id).toBe('1');
  });

  it('returns null when the name is free', () => {
    expect(findDuplicateDriver('Pedro Gómez', existing)).toBeNull();
  });

  it('returns null for a blank candidate instead of matching arbitrarily', () => {
    expect(findDuplicateDriver('   ', existing)).toBeNull();
  });
});

describe('filterDrivers', () => {
  const drivers = [
    driver('1', 'Moisés López', 'V-12345678'),
    driver('2', 'Moisés López', 'V-87654321'),
    driver('3', 'Ana Torres', null),
  ];

  it('keeps BOTH same-named drivers so the user can choose (R9)', () => {
    const found = filterDrivers(drivers, 'moises');
    expect(found.map(d => d.id)).toEqual(['1', '2']);
  });

  it('matches on cédula', () => {
    expect(filterDrivers(drivers, '87654321').map(d => d.id)).toEqual(['2']);
  });

  it('ignores accents in the query', () => {
    expect(filterDrivers(drivers, 'lópez').map(d => d.id)).toEqual(['1', '2']);
  });

  it('returns everything for an empty query', () => {
    expect(filterDrivers(drivers, '  ')).toHaveLength(3);
  });

  it('does not crash on a driver with no cédula', () => {
    expect(filterDrivers(drivers, 'ana').map(d => d.id)).toEqual(['3']);
  });
});

describe('driverLabel', () => {
  it('appends the cédula when present — the only way to disambiguate same-named drivers', () => {
    expect(driverLabel({ full_name: 'Moisés López', cedula: 'V-12345678' })).toBe('Moisés López — V-12345678');
  });

  it('falls back to the bare name', () => {
    expect(driverLabel({ full_name: 'Ana Torres', cedula: null })).toBe('Ana Torres');
  });
});
