import { describe, expect, it } from 'vitest';
import {
  ALL_VALUE,
  DEFAULT_TABLE_FILTERS,
  UNKNOWN_LABEL,
  deriveDealershipFacets,
  deriveSalespersonFacets,
  filterSurveyTable,
  hasActiveFilters,
  surveyDealership,
  surveySalesperson,
  type SurveyTableRowLike,
} from './surveyTableFilters';

const row = (over: Partial<SurveyTableRowLike> = {}): SurveyTableRowLike => ({
  client_name: 'Jorge Khaoime',
  salesperson: 'Joselith Alvarez',
  sold_plate: 'DEMO123',
  dealerships: { name: 'Centro De Servicio Los Aviadores' },
  response: { overall_score: 3.6, has_low_score: false },
  ...over,
});

const filters = (over: Partial<typeof DEFAULT_TABLE_FILTERS> = {}) => ({
  ...DEFAULT_TABLE_FILTERS,
  ...over,
});

describe('surveyDealership / surveySalesperson', () => {
  it('falls back to "Sin asignar" for null, empty and whitespace', () => {
    expect(surveyDealership(row({ dealerships: null }))).toBe(UNKNOWN_LABEL);
    expect(surveySalesperson(row({ salesperson: null }))).toBe(UNKNOWN_LABEL);
    expect(surveySalesperson(row({ salesperson: '   ' }))).toBe(UNKNOWN_LABEL);
    expect(surveyDealership(row({ dealerships: { name: '  ' } }))).toBe(UNKNOWN_LABEL);
  });
});

describe('facets', () => {
  const rows = [
    row({ dealerships: { name: 'Zulia' }, salesperson: 'Ana' }),
    row({ dealerships: null, salesperson: null }),
    row({ dealerships: { name: 'Aragua' }, salesperson: 'Bruno' }),
    row({ dealerships: { name: 'Zulia' }, salesperson: 'Ana' }),
  ];

  it('dedupes and sorts alphabetically', () => {
    expect(deriveDealershipFacets(rows)).toEqual(['Aragua', 'Zulia', UNKNOWN_LABEL]);
    expect(deriveSalespersonFacets(rows)).toEqual(['Ana', 'Bruno', UNKNOWN_LABEL]);
  });

  it('always pushes "Sin asignar" to the end, never sorts it alphabetically', () => {
    // 'Sin asignar' would sort between 'Ana' and 'Zulia' under a plain localeCompare.
    expect(deriveDealershipFacets(rows).at(-1)).toBe(UNKNOWN_LABEL);
  });
});

describe('filterSurveyTable — default shows everything', () => {
  it('includes unanswered surveys, which is the whole point of the table listing all', () => {
    const rows = [row(), row({ response: null }), row({ response: null })];
    expect(filterSurveyTable(rows, filters())).toHaveLength(3);
  });
});

describe('filterSurveyTable — status', () => {
  const rows = [
    row({ client_name: 'respondio', response: { overall_score: 4, has_low_score: false } }),
    row({ client_name: 'no respondio', response: null }),
  ];

  it('separates answered from unanswered by the presence of the response row', () => {
    expect(filterSurveyTable(rows, filters({ status: 'respondida' })).map(r => r.client_name)).toEqual(['respondio']);
    expect(filterSurveyTable(rows, filters({ status: 'pendiente' })).map(r => r.client_name)).toEqual(['no respondio']);
  });
});

describe('filterSurveyTable — search', () => {
  it('returns everything for a blank or whitespace query', () => {
    const rows = [row(), row({ client_name: 'Otro' })];
    expect(filterSurveyTable(rows, filters({ search: '' }))).toHaveLength(2);
    expect(filterSurveyTable(rows, filters({ search: '   ' }))).toHaveLength(2);
  });

  it('matches the client name ignoring case and accents', () => {
    const rows = [row({ client_name: 'José Pérez' }), row({ client_name: 'Ana' })];
    expect(filterSurveyTable(rows, filters({ search: 'jose perez' }))).toHaveLength(1);
    expect(filterSurveyTable(rows, filters({ search: 'PÉREZ' }))).toHaveLength(1);
  });

  it('matches the plate case-insensitively', () => {
    const rows = [row({ sold_plate: 'DEMO123' }), row({ sold_plate: 'AB123CD' })];
    expect(filterSurveyTable(rows, filters({ search: 'demo123' }))).toHaveLength(1);
  });

  it('does not crash on rows with no name or plate', () => {
    const rows = [row({ client_name: null, sold_plate: null })];
    expect(filterSurveyTable(rows, filters({ search: 'algo' }))).toHaveLength(0);
  });
});

describe('filterSurveyTable — score buckets', () => {
  const rows = [
    row({ client_name: 'bajo', response: { overall_score: 2.4, has_low_score: true } }),
    row({ client_name: 'medio', response: { overall_score: 3.6, has_low_score: false } }),
    row({ client_name: 'alto', response: { overall_score: 4.8, has_low_score: false } }),
    // The case the bucket exists for: a healthy AVERAGE hiding one terrible aspect.
    row({ client_name: 'oculto', response: { overall_score: 4.2, has_low_score: true } }),
  ];

  it('"alerta" uses has_low_score, not the average — it catches the high-average outlier', () => {
    const found = filterSurveyTable(rows, filters({ score: 'alerta' })).map(r => r.client_name);
    expect(found).toEqual(['bajo', 'oculto']);
  });

  it('bucket boundaries are half-open: 3 is medio, 4 is alto', () => {
    const boundary = [
      row({ client_name: 'tres', response: { overall_score: 3, has_low_score: false } }),
      row({ client_name: 'cuatro', response: { overall_score: 4, has_low_score: false } }),
    ];
    expect(filterSurveyTable(boundary, filters({ score: 'medio' })).map(r => r.client_name)).toEqual(['tres']);
    expect(filterSurveyTable(boundary, filters({ score: 'alto' })).map(r => r.client_name)).toEqual(['cuatro']);
    expect(filterSurveyTable(boundary, filters({ score: 'bajo' }))).toHaveLength(0);
  });

  it('accepts a string score, which is how PostgREST returns numeric', () => {
    const asString = [row({ response: { overall_score: '4.5', has_low_score: false } })];
    expect(filterSurveyTable(asString, filters({ score: 'alto' }))).toHaveLength(1);
  });

  it('excludes unanswered rows and unparseable scores instead of letting them through', () => {
    const broken = [
      row({ response: null }),
      row({ response: { overall_score: 'n/a', has_low_score: false } }),
    ];
    expect(filterSurveyTable(broken, filters({ score: 'alto' }))).toHaveLength(0);
    expect(filterSurveyTable(broken, filters({ score: 'bajo' }))).toHaveLength(0);
    // ...but with no score filter they are still listed.
    expect(filterSurveyTable(broken, filters())).toHaveLength(2);
  });
});

describe('filterSurveyTable — composition', () => {
  const rows = [
    row({ client_name: 'Ana', salesperson: 'Joselith Alvarez', dealerships: { name: 'Aviadores' }, response: { overall_score: 4.5, has_low_score: false } }),
    row({ client_name: 'Ana', salesperson: 'Otro', dealerships: { name: 'Aviadores' }, response: { overall_score: 4.5, has_low_score: false } }),
    row({ client_name: 'Ana', salesperson: 'Joselith Alvarez', dealerships: { name: 'Valencia' }, response: { overall_score: 4.5, has_low_score: false } }),
    row({ client_name: 'Ana', salesperson: 'Joselith Alvarez', dealerships: { name: 'Aviadores' }, response: { overall_score: 2.0, has_low_score: true } }),
  ];

  it('composes every filter with AND', () => {
    const found = filterSurveyTable(rows, filters({
      search: 'ana', salesperson: 'Joselith Alvarez', dealership: 'Aviadores', score: 'alto', status: 'respondida',
    }));
    expect(found).toHaveLength(1);
  });

  it('an unmatched value yields an empty list rather than falling back to everything', () => {
    expect(filterSurveyTable(rows, filters({ dealership: 'No existe' }))).toHaveLength(0);
  });
});

describe('hasActiveFilters', () => {
  it('is false for the defaults', () => {
    expect(hasActiveFilters(DEFAULT_TABLE_FILTERS)).toBe(false);
  });

  it('ignores a whitespace-only search', () => {
    expect(hasActiveFilters(filters({ search: '   ' }))).toBe(false);
  });

  it('is true when any filter moves off its default', () => {
    expect(hasActiveFilters(filters({ search: 'x' }))).toBe(true);
    expect(hasActiveFilters(filters({ dealership: 'Aviadores' }))).toBe(true);
    expect(hasActiveFilters(filters({ salesperson: 'Ana' }))).toBe(true);
    expect(hasActiveFilters(filters({ score: 'alerta' }))).toBe(true);
    expect(hasActiveFilters(filters({ status: 'pendiente' }))).toBe(true);
    expect(hasActiveFilters(filters({ dealership: ALL_VALUE }))).toBe(false);
  });
});
