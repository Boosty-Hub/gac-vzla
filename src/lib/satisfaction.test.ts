import { describe, it, expect } from 'vitest';
import { SATISFACTION_ASPECTS, getSatisfactionLevel, normalizeClientName, firstMeaningfulNameToken } from './satisfaction';

describe('SATISFACTION_ASPECTS', () => {
  it('has exactly 5 aspects', () => {
    expect(SATISFACTION_ASPECTS).toHaveLength(5);
  });

  it('has the expected keys in order', () => {
    expect(SATISFACTION_ASPECTS.map(a => a.key)).toEqual([
      'atencion_digital',
      'bienvenida_presencial',
      'negociacion_asesoria',
      'financiamiento_tramites',
      'experiencia_entrega',
    ]);
  });

  it('mirrors each key as its RPC/DB column name', () => {
    SATISFACTION_ASPECTS.forEach(a => expect(a.column).toBe(a.key));
  });

  it('has a non-empty title and question for every aspect', () => {
    SATISFACTION_ASPECTS.forEach(a => {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.question.length).toBeGreaterThan(0);
    });
  });
});

describe('getSatisfactionLevel', () => {
  it('maps 1 to Muy insatisfecho / 😠', () => {
    const level = getSatisfactionLevel(1);
    expect(level.label).toBe('Muy insatisfecho');
    expect(level.emoji).toBe('😠');
  });

  it('maps 2 to Insatisfecho / 🙁', () => {
    const level = getSatisfactionLevel(2);
    expect(level.label).toBe('Insatisfecho');
    expect(level.emoji).toBe('🙁');
  });

  it('maps 3 to Neutral / 😐', () => {
    const level = getSatisfactionLevel(3);
    expect(level.label).toBe('Neutral');
    expect(level.emoji).toBe('😐');
  });

  it('maps 4 to Satisfecho / 🙂', () => {
    const level = getSatisfactionLevel(4);
    expect(level.label).toBe('Satisfecho');
    expect(level.emoji).toBe('🙂');
  });

  it('maps 5 to Muy satisfecho / 😄', () => {
    const level = getSatisfactionLevel(5);
    expect(level.label).toBe('Muy satisfecho');
    expect(level.emoji).toBe('😄');
  });

  it('gives every level a distinct HSL-triplet color that shifts red to green', () => {
    const colors = [1, 2, 3, 4, 5].map(v => getSatisfactionLevel(v).color);
    colors.forEach(c => expect(c).toMatch(/^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/));
    expect(new Set(colors).size).toBe(5);
  });

  it('falls back to a sane level for out-of-range input instead of throwing', () => {
    expect(() => getSatisfactionLevel(0)).not.toThrow();
    expect(() => getSatisfactionLevel(6)).not.toThrow();
    expect(getSatisfactionLevel(0).label).toBeTruthy();
  });
});

describe('normalizeClientName', () => {
  it('uppercases lowercase input', () => {
    expect(normalizeClientName('juan perez')).toBe('JUAN PEREZ');
  });

  it('collapses internal whitespace runs to a single space', () => {
    expect(normalizeClientName('Juan   Perez')).toBe('JUAN PEREZ');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeClientName('  Juan Perez  ')).toBe('JUAN PEREZ');
  });

  it('strips accents/diacritics', () => {
    expect(normalizeClientName('María José Núñez')).toBe('MARIA JOSE NUNEZ');
  });

  it('returns an empty string for null/undefined/empty input', () => {
    expect(normalizeClientName(null)).toBe('');
    expect(normalizeClientName(undefined)).toBe('');
    expect(normalizeClientName('')).toBe('');
  });
});

describe('firstMeaningfulNameToken', () => {
  it('returns the first token of a normalized name', () => {
    expect(firstMeaningfulNameToken('Juan Perez')).toBe('JUAN');
  });

  it('skips short particle tokens (<3 chars) and returns the next meaningful one', () => {
    expect(firstMeaningfulNameToken('De La Rosa')).toBe('ROSA');
  });

  it('strips accents before tokenizing', () => {
    expect(firstMeaningfulNameToken('María José')).toBe('MARIA');
  });

  it('returns an empty string when no token is long enough', () => {
    expect(firstMeaningfulNameToken('De La')).toBe('');
  });

  it('returns an empty string for null/undefined/empty input', () => {
    expect(firstMeaningfulNameToken(null)).toBe('');
    expect(firstMeaningfulNameToken(undefined)).toBe('');
    expect(firstMeaningfulNameToken('')).toBe('');
  });
});
