import { describe, it, expect } from 'vitest';
import { formatServiceCount } from './warranty';

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
