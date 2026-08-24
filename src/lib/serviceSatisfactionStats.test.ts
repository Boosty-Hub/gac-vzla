import { describe, it, expect } from 'vitest';
import {
  computeServiceSurveyStats,
  computeQuestionBreakdown,
  type ServiceSurveyLike,
} from './serviceSatisfactionStats';
import { SERVICE_SURVEY_QUESTIONS } from './satisfaction';

const answered = (over: Record<string, unknown> = {}): ServiceSurveyLike => ({
  status: 'responded',
  suppressed_reason: null,
  response: {
    overall_score: '5.00',
    has_low_score: false,
    comment: null,
    q_recepcion_imagen: 'si',
    ...over,
  },
});

const pending = (): ServiceSurveyLike => ({
  status: 'pending',
  suppressed_reason: null,
  response: null,
});

const suppressed = (): ServiceSurveyLike => ({
  status: 'pending',
  suppressed_reason: 'rate_limited_24h',
  response: null,
});

describe('computeServiceSurveyStats', () => {
  it('devuelve ceros sin NaN cuando no hay ninguna encuesta', () => {
    const s = computeServiceSurveyStats([]);
    expect(s).toEqual({
      total: 0,
      responded: 0,
      pending: 0,
      responseRate: 0,
      avgOverall: null,
      lowScoreCount: 0,
      commentCount: 0,
    });
  });

  it('cuenta respondidas y pendientes por separado', () => {
    const s = computeServiceSurveyStats([answered(), pending(), pending()]);
    expect(s.total).toBe(3);
    expect(s.responded).toBe(1);
    expect(s.pending).toBe(2);
    expect(s.responseRate).toBeCloseTo(33.333, 2);
  });

  it('excluye del total las encuestas suprimidas', () => {
    // Una encuesta suprimida se retiró a propósito y nunca le llegó al cliente. Contarla
    // hundiría la tasa de respuesta culpando al cliente de un silencio que causamos nosotros.
    const s = computeServiceSurveyStats([answered(), suppressed(), suppressed()]);
    expect(s.total).toBe(1);
    expect(s.responseRate).toBe(100);
  });

  it('promedia overall_score aunque PostgREST lo mande como string', () => {
    const s = computeServiceSurveyStats([
      answered({ overall_score: '5.00' }),
      answered({ overall_score: 3 }),
    ]);
    expect(s.avgOverall).toBe(4);
  });

  it('ignora overall_score nulo en lugar de contarlo como cero', () => {
    const s = computeServiceSurveyStats([
      answered({ overall_score: null }),
      answered({ overall_score: 4 }),
    ]);
    expect(s.avgOverall).toBe(4);
  });

  it('cuenta alertas y comentarios', () => {
    const s = computeServiceSurveyStats([
      answered({ has_low_score: true, comment: 'Tardaron mucho' }),
      answered({ has_low_score: false, comment: '   ' }),
      answered({ has_low_score: null, comment: null }),
    ]);
    expect(s.lowScoreCount).toBe(1);
    expect(s.commentCount).toBe(1);
  });
});

describe('computeQuestionBreakdown', () => {
  it('devuelve una entrada por cada pregunta del cuestionario', () => {
    const rows = computeQuestionBreakdown([]);
    expect(rows).toHaveLength(SERVICE_SURVEY_QUESTIONS.length);
    expect(rows.every(r => r.answered === 0 && r.avgScore === null)).toBe(true);
  });

  it('reparte los porcentajes sobre las respuestas de ESA pregunta', () => {
    const rows = computeQuestionBreakdown([
      answered({ q_recepcion_imagen: 'si' }),
      answered({ q_recepcion_imagen: 'no' }),
      // Sin responder esa pregunta: no debe entrar en su denominador.
      answered({ q_recepcion_imagen: null }),
    ]);
    const recepcion = rows.find(r => r.column === 'recepcion_imagen')!;
    expect(recepcion.answered).toBe(2);
    expect(recepcion.options.find(o => o.value === 'si')!.percent).toBe(50);
    expect(recepcion.options.find(o => o.value === 'no')!.percent).toBe(50);
    // 'si' vale 5 y 'no' vale 1.
    expect(recepcion.avgScore).toBe(3);
  });

  it('no cuenta las respuestas de encuestas suprimidas', () => {
    const rows = computeQuestionBreakdown([
      answered({ q_recepcion_imagen: 'si' }),
      { ...answered({ q_recepcion_imagen: 'no' }), suppressed_reason: 'rate_limited_24h' },
    ]);
    const recepcion = rows.find(r => r.column === 'recepcion_imagen')!;
    expect(recepcion.answered).toBe(1);
    expect(recepcion.options.find(o => o.value === 'si')!.percent).toBe(100);
  });
});
