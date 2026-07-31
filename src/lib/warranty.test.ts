import { describe, it, expect } from 'vitest';
import { formatServiceCount, resolveWarrantyCondition, type WarrantyConditionRef } from './warranty';

const GLOBAL: WarrantyConditionRef[] = [
  { id: 1, name: 'Garantía general', max_km: 100000, max_months: 60, service_interval_km: 5000, is_active: true },
];

describe('resolveWarrantyCondition — manual (third-party) models', () => {
  it('returns null for a manual model instead of inheriting the global fallback', () => {
    // The dangerous case: a third-party vehicle we never sold. Without the is_manual guard
    // this falls through to the global condition and reports "Garantía activa" under our
    // own terms — a false positive with commercial consequences.
    expect(resolveWarrantyCondition({ is_manual: true }, GLOBAL)).toBeNull();
  });

  it('still returns null for a manual model even if warranty values somehow got stored', () => {
    // chk_manual_model_has_no_warranty forbids this at the DB level, but the guard must not
    // depend on that constraint holding.
    const rogue = { is_manual: true, warranty_km: 100000, warranty_months: 60, warranty_condition_id: 1 };
    expect(resolveWarrantyCondition(rogue, GLOBAL)).toBeNull();
  });

  it('still applies the global fallback to a normal model with no warranty values', () => {
    // Regression guard: the fix must not disable the fallback for our own catalog models.
    expect(resolveWarrantyCondition({ is_manual: false }, GLOBAL)).toEqual({
      maxKm: 100000, maxMonths: 60, intervalKm: 5000, name: 'Garantía general',
    });
  });

  it('treats an absent is_manual flag as a normal model', () => {
    // Rows fetched before the column existed, or selects that omit it.
    expect(resolveWarrantyCondition({}, GLOBAL)?.name).toBe('Garantía general');
  });

  it('prefers per-model values over the global fallback for a normal model', () => {
    expect(resolveWarrantyCondition({ warranty_km: 50000, warranty_months: 36 }, GLOBAL)).toEqual({
      maxKm: 50000, maxMonths: 36, intervalKm: 0, name: 'Personalizada',
    });
  });
});

describe('formatServiceCount', () => {
  it('uses the singular form for exactly one service', () => {
    expect(formatServiceCount(1)).toBe('1 servicio');
  });

  it('uses the plural form for zero services', () => {
    expect(formatServiceCount(0)).toBe('0 servicios');
  });

  it('uses the plural form for more than one service', () => {
    expect(formatServiceCount(3)).toBe('3 servicios');
  });
});
