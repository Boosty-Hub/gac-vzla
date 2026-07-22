import { describe, it, expect } from 'vitest';
import { phoneMatchSuffix } from './phone';

describe('phoneMatchSuffix', () => {
  it('strips separators and keeps the last 10 digits', () => {
    expect(phoneMatchSuffix('0424-8040975')).toBe('4248040975');
  });

  it('strips the + and country code prefix down to the last 10 digits', () => {
    expect(phoneMatchSuffix('+584248040975')).toBe('4248040975');
  });

  it('produces the same suffix for a local and an international-format number of the same client', () => {
    expect(phoneMatchSuffix('0424-8040975')).toBe(phoneMatchSuffix('+584248040975'));
  });

  it('returns an empty string for null input', () => {
    expect(phoneMatchSuffix(null)).toBe('');
  });

  it('returns an empty string for undefined input', () => {
    expect(phoneMatchSuffix(undefined)).toBe('');
  });

  it('returns an empty string for empty input', () => {
    expect(phoneMatchSuffix('')).toBe('');
  });

  it('returns the digits as-is when the input has fewer than `len` digits', () => {
    expect(phoneMatchSuffix('12345')).toBe('12345');
  });

  it('respects a custom `len` argument', () => {
    expect(phoneMatchSuffix('+584248040975', 7)).toBe('8040975');
  });

  it('ignores non-digit characters entirely, including letters', () => {
    expect(phoneMatchSuffix('(0424) 804-0975 ext.')).toBe('4248040975');
  });
});
