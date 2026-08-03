/**
 * Pure filtering logic for the survey table in `SatisfactionOverview.tsx`.
 *
 * Deliberately separate from `satisfactionDashboardUtils.ts`: that module filters the
 * DASHBOARD by brand/model/month, which are properties of the sold vehicle. This table is
 * an operational list — someone scanning it wants to find one person, pull up everything a
 * given salesperson sold, or isolate the complaints. Different questions, different filters.
 *
 * The table lists EVERY survey, answered or not. It used to show only answered ones, which
 * made the list silently contradict the "Total encuestas" KPI right above it (22 vs 2 rows).
 * Status is a filter now, not a hidden precondition.
 *
 * Keep this file free of React/DOM/Supabase imports so it stays directly unit-testable,
 * matching the convention in `src/lib/satisfaction.ts`.
 */

import { normalizeClientName } from '@/lib/satisfaction';

export const ALL_VALUE = 'todos';
export const UNKNOWN_LABEL = 'Sin asignar';

/** Minimal shape this module needs. The real row (SatisfactionOverview's `SurveyRow`) is a
 *  superset, so it can always be passed here. */
export interface SurveyTableRowLike {
  client_name: string | null;
  salesperson: string | null;
  sold_plate: string | null;
  dealerships: { name: string } | null;
  response: { overall_score: number | string; has_low_score: boolean } | null;
}

/**
 * Score buckets.
 *
 * `alerta` is NOT "low average" — it is `has_low_score`, which the database computes as
 * "any single aspect scored below 3". That distinction is the whole point: a survey can
 * average 3.6 and still hide a 1 on "experiencia de entrega". Averaging buries exactly the
 * complaint you need to act on, so it gets its own bucket rather than being folded into
 * `bajo`.
 */
export type ScoreBucket = typeof ALL_VALUE | 'alerta' | 'bajo' | 'medio' | 'alto';

export const SCORE_BUCKETS: Array<{ value: ScoreBucket; label: string }> = [
  { value: ALL_VALUE, label: 'Todos los puntajes' },
  { value: 'alerta', label: 'Con alerta (algún aspecto bajo)' },
  { value: 'bajo', label: 'Bajo (menos de 3)' },
  { value: 'medio', label: 'Medio (3 a 4)' },
  { value: 'alto', label: 'Alto (4 o más)' },
];

export type StatusFilter = typeof ALL_VALUE | 'respondida' | 'pendiente';

export const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: ALL_VALUE, label: 'Todas las encuestas' },
  { value: 'respondida', label: 'Respondidas' },
  { value: 'pendiente', label: 'Sin responder' },
];

export interface SurveyTableFilterState {
  /** Free text over client name and plate. */
  search: string;
  dealership: string;
  salesperson: string;
  score: ScoreBucket;
  status: StatusFilter;
}

export const DEFAULT_TABLE_FILTERS: SurveyTableFilterState = {
  search: '',
  dealership: ALL_VALUE,
  salesperson: ALL_VALUE,
  score: ALL_VALUE,
  status: ALL_VALUE,
};

export function surveyDealership(row: SurveyTableRowLike): string {
  return row.dealerships?.name?.trim() || UNKNOWN_LABEL;
}

export function surveySalesperson(row: SurveyTableRowLike): string {
  return row.salesperson?.trim() || UNKNOWN_LABEL;
}

/** Sorts facet values alphabetically, always pushing "Sin asignar" to the end. */
function sortFacets(values: Set<string>): string[] {
  return Array.from(values).sort((a, b) => {
    if (a === UNKNOWN_LABEL) return 1;
    if (b === UNKNOWN_LABEL) return -1;
    return a.localeCompare(b, 'es');
  });
}

export function deriveDealershipFacets(rows: SurveyTableRowLike[]): string[] {
  return sortFacets(new Set(rows.map(surveyDealership)));
}

export function deriveSalespersonFacets(rows: SurveyTableRowLike[]): string[] {
  return sortFacets(new Set(rows.map(surveySalesperson)));
}

function matchesStatus(row: SurveyTableRowLike, status: StatusFilter): boolean {
  if (status === ALL_VALUE) return true;
  // "Answered" is defined by the presence of the response row, not by the `status` column:
  // that column can lag behind (a delivery that failed to promote it — a real bug we hit),
  // while the response row only exists once the customer actually submitted.
  const answered = row.response != null;
  return status === 'respondida' ? answered : !answered;
}

function matchesScore(row: SurveyTableRowLike, bucket: ScoreBucket): boolean {
  if (bucket === ALL_VALUE) return true;
  // An unanswered survey has no score, so any score filter necessarily excludes it.
  if (!row.response) return false;
  if (bucket === 'alerta') return row.response.has_low_score === true;

  const score = Number(row.response.overall_score);
  // A malformed score must not silently pass every numeric filter.
  if (!Number.isFinite(score)) return false;
  if (bucket === 'bajo') return score < 3;
  if (bucket === 'medio') return score >= 3 && score < 4;
  return score >= 4;
}

function matchesSearch(row: SurveyTableRowLike, rawSearch: string): boolean {
  const needle = normalizeClientName(rawSearch);
  if (!needle) return true;
  // Plate is matched on the same normalized form so "demo123" finds "DEMO123".
  return (
    normalizeClientName(row.client_name).includes(needle) ||
    normalizeClientName(row.sold_plate).includes(needle)
  );
}

/** All filters compose with AND. */
export function filterSurveyTable<T extends SurveyTableRowLike>(
  rows: T[],
  filters: SurveyTableFilterState,
): T[] {
  return rows.filter(
    row =>
      matchesSearch(row, filters.search) &&
      (filters.dealership === ALL_VALUE || surveyDealership(row) === filters.dealership) &&
      (filters.salesperson === ALL_VALUE || surveySalesperson(row) === filters.salesperson) &&
      matchesStatus(row, filters.status) &&
      matchesScore(row, filters.score),
  );
}

/** True when anything is filtering, so the UI can offer a "limpiar" affordance only when
 *  it would actually do something. */
export function hasActiveFilters(filters: SurveyTableFilterState): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.dealership !== ALL_VALUE ||
    filters.salesperson !== ALL_VALUE ||
    filters.score !== ALL_VALUE ||
    filters.status !== ALL_VALUE
  );
}
