/**
 * Pure aggregation/filtering logic for the admin "Satisfacción" dashboard tab
 * (`src/components/satisfaction/SatisfactionDashboard.tsx`).
 *
 * Keep this file free of React/DOM/Supabase imports, matching the same
 * convention as `src/lib/satisfaction.ts` / `src/lib/satisfactionStats.ts`.
 *
 * Brand/model are always derived from the SOLD vehicle
 * (`satisfaction_surveys.vehicle_id -> vehicles.model_id -> vehicle_models`),
 * never from Kommo brand enums — per requirements.md R8/R10 the three brands
 * (GAC, DFSK, SHINERAY) are resolved through `vehicle_models.brand` as plain
 * text, not through Kommo's enum IDs (7832208 / 7832206 / 7857650).
 */

import type { SurveyResponseLike } from '@/lib/satisfactionStats';

export const UNKNOWN_BRAND = 'Sin marca';
export const UNKNOWN_MODEL = 'Sin modelo';
export const ALL_VALUE = 'todos';

export interface SatisfactionSurveyVehicle {
  plate: string | null;
  vehicle_models: { brand: string; name: string } | null;
}

/** Row shape returned by the dashboard's single RLS-scoped fetch (design.md section 5). */
export interface SatisfactionSurveyRow {
  id: string;
  client_id: string | null;
  client_name: string | null;
  client_phone: string | null;
  sold_plate: string | null;
  status: string;
  origin: string;
  suppressed_reason: string | null;
  created_at: string;
  responded_at: string | null;
  dealership_id: string | null;
  salesperson: string | null;
  dealerships: { name: string } | null;
  // `vehicles`/`response` embed as a single object (or null), never an array —
  // same to-one relationship documented in SatisfactionOverview.tsx's SurveyRow.
  vehicles: SatisfactionSurveyVehicle | null;
  response: SurveyResponseLike | null;
}

export interface SatisfactionFilterState {
  brand: string;
  model: string;
  month: string;
}

export const DEFAULT_FILTERS: SatisfactionFilterState = { brand: ALL_VALUE, model: ALL_VALUE, month: ALL_VALUE };

export function surveyBrand(row: SatisfactionSurveyRow): string {
  return row.vehicles?.vehicle_models?.brand?.trim() || UNKNOWN_BRAND;
}

export function surveyModel(row: SatisfactionSurveyRow): string {
  return row.vehicles?.vehicle_models?.name?.trim() || UNKNOWN_MODEL;
}

/** `YYYY-MM`, keyed on `created_at` (≈ win date) — see design.md section 6:
 * 93% of surveys have no `responded_at`, so keying on it would hide every
 * pending survey and make the response-rate KPI meaningless. */
export function surveyMonthKey(row: SatisfactionSurveyRow): string {
  return row.created_at.slice(0, 7);
}

export function deriveBrandFacets(rows: SatisfactionSurveyRow[]): string[] {
  const set = new Set(rows.map(surveyBrand));
  return Array.from(set).sort((a, b) => {
    if (a === UNKNOWN_BRAND) return 1;
    if (b === UNKNOWN_BRAND) return -1;
    return a.localeCompare(b);
  });
}

/** Models present among `rows`, optionally narrowed to one brand (cascading select). */
export function deriveModelFacets(rows: SatisfactionSurveyRow[], brand: string): string[] {
  const scoped = brand === ALL_VALUE ? rows : rows.filter(r => surveyBrand(r) === brand);
  const set = new Set(scoped.map(surveyModel));
  return Array.from(set).sort((a, b) => {
    if (a === UNKNOWN_MODEL) return 1;
    if (b === UNKNOWN_MODEL) return -1;
    return a.localeCompare(b);
  });
}

export interface MonthOption {
  value: string; // YYYY-MM
  label: string; // "Julio 2026"
}

const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function monthKeyToLabel(key: string): string {
  const [year, month] = key.split('-');
  const label = MONTH_LABELS[Number(month) - 1] || month;
  return `${label} ${year}`;
}

export function deriveMonthOptions(rows: SatisfactionSurveyRow[]): MonthOption[] {
  const set = new Set(rows.map(surveyMonthKey));
  return Array.from(set)
    .sort((a, b) => b.localeCompare(a)) // most recent first
    .map(value => ({ value, label: monthKeyToLabel(value) }));
}

/** All three filters compose together with AND (requirements.md R8). */
export function filterSurveys(rows: SatisfactionSurveyRow[], filters: SatisfactionFilterState): SatisfactionSurveyRow[] {
  return rows.filter(r =>
    (filters.brand === ALL_VALUE || surveyBrand(r) === filters.brand) &&
    (filters.model === ALL_VALUE || surveyModel(r) === filters.model) &&
    (filters.month === ALL_VALUE || surveyMonthKey(r) === filters.month),
  );
}

export interface SatisfactionClientListRow {
  /** `client_id` when known; a per-survey synthetic key for the legacy
   * `client_id IS NULL` rows so each still renders as its own (non-clickable) row. */
  key: string;
  clientId: string | null;
  clientName: string;
  clientPhone: string | null;
  dealershipName: string | null;
  surveysCount: number;
  respondedCount: number;
  lastSurveyAt: string;
  lastOverallScore: number | null;
}

/**
 * Groups filtered survey rows into one row per client. Spec requirement
 * "Client List Derived from Surveys, Never from `clients`" — this NEVER
 * queries `clients`; it only aggregates the already-fetched, RLS-scoped
 * `satisfaction_surveys` rows the caller passes in.
 *
 * Rows with `client_id IS NULL` (the legacy pre-migration surveys) each
 * become their own non-clickable entry — matches design.md section 5
 * ("Rows with client_id IS NULL render normally but are not clickable").
 */
export function groupSurveysByClient(rows: SatisfactionSurveyRow[]): SatisfactionClientListRow[] {
  const map = new Map<string, SatisfactionClientListRow>();

  rows.forEach(r => {
    const key = r.client_id ?? `legacy:${r.id}`;
    const overallScore = r.response ? Number(r.response.overall_score) : null;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        key,
        clientId: r.client_id,
        clientName: r.client_name || 'Sin nombre',
        clientPhone: r.client_phone,
        dealershipName: r.dealerships?.name ?? null,
        surveysCount: 1,
        respondedCount: r.response ? 1 : 0,
        lastSurveyAt: r.created_at,
        lastOverallScore: overallScore,
      });
      return;
    }

    existing.surveysCount += 1;
    if (r.response) existing.respondedCount += 1;
    if (r.created_at > existing.lastSurveyAt) {
      existing.lastSurveyAt = r.created_at;
      existing.lastOverallScore = overallScore ?? existing.lastOverallScore;
      existing.clientName = r.client_name || existing.clientName;
      existing.clientPhone = r.client_phone || existing.clientPhone;
      existing.dealershipName = r.dealerships?.name ?? existing.dealershipName;
    }
  });

  return Array.from(map.values()).sort((a, b) => (a.lastSurveyAt > b.lastSurveyAt ? -1 : 1));
}
