/**
 * Pure aggregation logic for the "Satisfacción" analytics view
 * (`src/components/satisfaction/SatisfactionOverview.tsx`).
 *
 * Keep this file free of React/DOM/Supabase imports so it stays trivially
 * unit-testable and mirrors the same convention as `src/lib/satisfaction.ts`.
 */

import { SATISFACTION_ASPECTS } from './satisfaction';

/** Shape of a single `satisfaction_responses` row consumed by the stats functions. */
export interface SurveyResponseLike {
  q_atencion_digital: number;
  q_bienvenida_presencial: number;
  q_negociacion_asesoria: number;
  q_financiamiento_tramites: number;
  q_experiencia_entrega: number;
  nps_recomienda: boolean | null;
  /** `numeric(3,2)` — PostgREST returns this as a string, so both are accepted. */
  overall_score: number | string;
  has_low_score: boolean;
}

/** Minimal shape of a `satisfaction_surveys` row needed for funnel counts. */
export interface SurveyLike {
  status: string;
}

export interface SurveyStats {
  totalResponses: number;
  /** Keyed by `SatisfactionAspect.key`; raw (unrounded) mean, or `null` when empty. */
  aspectAverages: Record<string, number | null>;
  avgOverall: number | null;
  npsPercent: number | null;
  lowScoreCount: number;
}

export interface FunnelStats {
  total: number;
  pending: number;
  sent: number;
  responded: number;
  responseRate: number;
}

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

/**
 * Raw (unrounded) arithmetic mean per aspect, keyed by `SatisfactionAspect.key`.
 * Rounding for display is the UI's responsibility.
 */
export function computeAspectAverages(responses: SurveyResponseLike[]): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  SATISFACTION_ASPECTS.forEach(aspect => {
    const field = `q_${aspect.column}` as keyof SurveyResponseLike;
    const values = responses.map(r => Number(r[field]));
    result[aspect.key] = mean(values);
  });
  return result;
}

export function computeSurveyStats(responses: SurveyResponseLike[]): SurveyStats {
  const aspectAverages = computeAspectAverages(responses);
  const avgOverall = mean(responses.map(r => Number(r.overall_score)));

  const npsVotes = responses
    .map(r => r.nps_recomienda)
    .filter((v): v is boolean => v !== null);
  const npsPercent = npsVotes.length === 0
    ? null
    : (npsVotes.filter(v => v === true).length / npsVotes.length) * 100;

  const lowScoreCount = responses.filter(r => r.has_low_score === true).length;

  return {
    totalResponses: responses.length,
    aspectAverages,
    avgOverall,
    npsPercent,
    lowScoreCount,
  };
}

export function computeFunnel(surveys: SurveyLike[]): FunnelStats {
  const total = surveys.length;
  const pending = surveys.filter(s => s.status === 'pending').length;
  const sent = surveys.filter(s => s.status === 'sent').length;
  const responded = surveys.filter(s => s.status === 'responded').length;
  const responseRate = total === 0 ? 0 : (responded / total) * 100;

  return { total, pending, sent, responded, responseRate };
}
