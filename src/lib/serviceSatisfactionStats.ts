/**
 * Agregación pura de la encuesta de POSTVENTA / SERVICIO.
 *
 * Existe aparte de `satisfactionStats.ts` porque las dos encuestas no comparten NADA
 * agregable: la de venta son cinco aspectos con escala 1..5, la de postventa son ocho
 * preguntas de opción cerrada. Promediarlas juntas daría un número que no significa nada.
 *
 * Es justamente lo que hacía que esta encuesta no tuviera panel: `SatisfactionOverview` y
 * `SatisfactionDashboard` filtran `origin IN ('won','repurchase')` a propósito, porque las
 * respuestas de postventa viven en `service_survey_responses` y entrar por ese camino las
 * contaba como ventas enviadas y nunca respondidas.
 *
 * Sin React, sin DOM, sin Supabase: se testea sola.
 */

import { SERVICE_SURVEY_QUESTIONS } from './satisfaction';

/** Una fila de `service_survey_responses`, sólo lo que estas funciones necesitan. */
export interface ServiceResponseLike {
  /** `numeric(3,2)` — PostgREST lo devuelve como string, así que se aceptan los dos. */
  overall_score: number | string | null;
  has_low_score: boolean | null;
  comment?: string | null;
  /** Las ocho columnas `q_*`. Se indexa por nombre porque el set de preguntas es dato. */
  [key: string]: unknown;
}

/** Una fila de `satisfaction_surveys` de origen 'service'. */
export interface ServiceSurveyLike {
  status: string;
  suppressed_reason?: string | null;
  response: ServiceResponseLike | null;
}

export interface ServiceSurveyStats {
  /** Encuestas creadas, sin contar las suprimidas: ésas nunca le llegaron a nadie. */
  total: number;
  responded: number;
  pending: number;
  /** 0..100. Cero encuestas da 0, no NaN. */
  responseRate: number;
  /** Promedio general de las respondidas, o null si no hay ninguna. */
  avgOverall: number | null;
  /** Cuántas traen al menos una respuesta mala. Es la cola que hay que llamar por teléfono. */
  lowScoreCount: number;
  commentCount: number;
}

export interface QuestionOptionBreakdown {
  value: string;
  label: string;
  score: number;
  count: number;
  /** 0..100 sobre el total de respuestas de ESA pregunta, no sobre el total general. */
  percent: number;
}

export interface QuestionBreakdown {
  column: string;
  title: string;
  answered: number;
  /** Promedio de score (1/3/5) de esta pregunta, o null si nadie la respondió. */
  avgScore: number | null;
  options: QuestionOptionBreakdown[];
}

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

/** Una encuesta suprimida se retira a propósito: contarla hundiría la tasa de respuesta. */
const isCounted = (s: ServiceSurveyLike): boolean => !s.suppressed_reason;

export function computeServiceSurveyStats(surveys: ServiceSurveyLike[]): ServiceSurveyStats {
  const counted = surveys.filter(isCounted);
  const answered = counted.filter(s => s.response != null);
  const responses = answered.map(s => s.response!);

  return {
    total: counted.length,
    responded: answered.length,
    pending: counted.length - answered.length,
    responseRate: counted.length === 0 ? 0 : (answered.length / counted.length) * 100,
    // El filtro de null va ANTES del Number(), no después: `Number(null)` es 0 y 0 pasa el
    // `isFinite`. Una encuesta respondida sin puntaje entraría al promedio como un cero
    // perfecto y lo hundiría — un panel que miente hacia abajo es peor que no tener panel.
    avgOverall: mean(
      responses
        .filter(r => r.overall_score !== null && r.overall_score !== undefined && r.overall_score !== '')
        .map(r => Number(r.overall_score))
        .filter(n => Number.isFinite(n)),
    ),
    lowScoreCount: responses.filter(r => r.has_low_score === true).length,
    commentCount: responses.filter(r => String(r.comment ?? '').trim() !== '').length,
  };
}

/**
 * Distribución de respuestas por pregunta.
 *
 * Se reporta pregunta por pregunta y no como un promedio único porque un 4.0 general esconde
 * un "No fue lavado/aspirado" del 40%. El promedio dice que todo está bien; el desglose dice
 * qué arreglar.
 */
export function computeQuestionBreakdown(surveys: ServiceSurveyLike[]): QuestionBreakdown[] {
  const responses = surveys.filter(isCounted).map(s => s.response).filter((r): r is ServiceResponseLike => r != null);

  return SERVICE_SURVEY_QUESTIONS.map(question => {
    const raw = responses
      .map(r => r[`q_${question.column}`])
      .filter((v): v is string => typeof v === 'string' && v !== '');

    const options: QuestionOptionBreakdown[] = question.options.map(option => {
      const count = raw.filter(v => v === option.value).length;
      return {
        value: option.value,
        label: option.label,
        score: option.score,
        count,
        percent: raw.length === 0 ? 0 : (count / raw.length) * 100,
      };
    });

    const scores: number[] = raw
      .map(v => question.options.find(o => o.value === v)?.score)
      .filter((n): n is 1 | 3 | 5 => typeof n === 'number');

    return {
      column: question.column,
      title: question.title,
      answered: raw.length,
      avgScore: mean(scores),
      options,
    };
  });
}
