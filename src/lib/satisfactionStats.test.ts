import { describe, it, expect } from 'vitest';
import {
  computeAspectAverages,
  computeSurveyStats,
  computeFunnel,
  type SurveyResponseLike,
  type SurveyLike,
} from './satisfactionStats';
import { SATISFACTION_ASPECTS } from './satisfaction';

const makeResponse = (overrides: Partial<SurveyResponseLike> = {}): SurveyResponseLike => ({
  q_atencion_digital: 5,
  q_bienvenida_presencial: 5,
  q_negociacion_asesoria: 5,
  q_financiamiento_tramites: 5,
  q_experiencia_entrega: 5,
  nps_recomienda: true,
  overall_score: 5,
  has_low_score: false,
  ...overrides,
});

describe('computeAspectAverages', () => {
  it('returns null for every aspect when there are no responses', () => {
    const result = computeAspectAverages([]);
    SATISFACTION_ASPECTS.forEach(a => {
      expect(result[a.key]).toBeNull();
    });
  });

  it('computes the raw arithmetic mean per aspect (unrounded)', () => {
    const responses: SurveyResponseLike[] = [
      makeResponse({ q_atencion_digital: 4, q_bienvenida_presencial: 3, q_negociacion_asesoria: 5, q_financiamiento_tramites: 2, q_experiencia_entrega: 1 }),
      makeResponse({ q_atencion_digital: 5, q_bienvenida_presencial: 3, q_negociacion_asesoria: 5, q_financiamiento_tramites: 3, q_experiencia_entrega: 2 }),
      makeResponse({ q_atencion_digital: 3, q_bienvenida_presencial: 3, q_negociacion_asesoria: 5, q_financiamiento_tramites: 4, q_experiencia_entrega: 3 }),
    ];
    const result = computeAspectAverages(responses);
    expect(result['atencion_digital']).toBeCloseTo(4); // (4+5+3)/3 = 4
    expect(result['bienvenida_presencial']).toBeCloseTo(3); // (3+3+3)/3 = 3
    expect(result['negociacion_asesoria']).toBeCloseTo(5); // (5+5+5)/3 = 5
    expect(result['financiamiento_tramites']).toBeCloseTo(3); // (2+3+4)/3 = 3
    expect(result['experiencia_entrega']).toBeCloseTo(2); // (1+2+3)/3 = 2
  });
});

describe('computeSurveyStats', () => {
  it('returns all-null / zero stats for an empty response set', () => {
    const stats = computeSurveyStats([]);
    expect(stats.totalResponses).toBe(0);
    SATISFACTION_ASPECTS.forEach(a => {
      expect(stats.aspectAverages[a.key]).toBeNull();
    });
    expect(stats.avgOverall).toBeNull();
    expect(stats.npsPercent).toBeNull();
    expect(stats.lowScoreCount).toBe(0);
  });

  it('computes exact avgOverall, npsPercent (excluding nulls from denominator), and lowScoreCount', () => {
    const responses: SurveyResponseLike[] = [
      makeResponse({ overall_score: 5, nps_recomienda: true, has_low_score: false }),
      makeResponse({ overall_score: 3, nps_recomienda: true, has_low_score: false }),
      makeResponse({ overall_score: 1, nps_recomienda: false, has_low_score: true }),
      makeResponse({ overall_score: 4, nps_recomienda: null, has_low_score: false }), // excluded from NPS denominator
    ];
    const stats = computeSurveyStats(responses);
    expect(stats.totalResponses).toBe(4);
    // avgOverall = (5+3+1+4)/4 = 3.25
    expect(stats.avgOverall).toBeCloseTo(3.25);
    // nps: 2 true out of 3 non-null (true,true,false) => 2/3 * 100
    expect(stats.npsPercent).toBeCloseTo((2 / 3) * 100);
    expect(stats.lowScoreCount).toBe(1);
  });

  it('coerces overall_score given as a string (PostgREST numeric style)', () => {
    const responses: SurveyResponseLike[] = [
      makeResponse({ overall_score: '4.50' }),
      makeResponse({ overall_score: '3.50' }),
    ];
    const stats = computeSurveyStats(responses);
    expect(stats.avgOverall).toBeCloseTo(4);
  });

  it('returns npsPercent null when all nps_recomienda values are null', () => {
    const responses: SurveyResponseLike[] = [
      makeResponse({ nps_recomienda: null }),
      makeResponse({ nps_recomienda: null }),
    ];
    const stats = computeSurveyStats(responses);
    expect(stats.npsPercent).toBeNull();
  });
});

describe('computeFunnel', () => {
  it('returns responseRate 0 for an empty survey list', () => {
    const funnel = computeFunnel([]);
    expect(funnel).toEqual({ total: 0, pending: 0, sent: 0, responded: 0, responseRate: 0 });
  });

  it('counts mixed statuses correctly and computes exact responseRate', () => {
    const surveys: SurveyLike[] = [
      { status: 'pending' },
      { status: 'pending' },
      { status: 'sent' },
      { status: 'responded' },
      { status: 'responded' },
      { status: 'responded' },
      { status: 'expired' },
    ];
    const funnel = computeFunnel(surveys);
    expect(funnel.total).toBe(7);
    expect(funnel.pending).toBe(2);
    expect(funnel.sent).toBe(1);
    expect(funnel.responded).toBe(3);
    // responseRate = 3/7 * 100
    expect(funnel.responseRate).toBeCloseTo((3 / 7) * 100);
  });
});
