/**
 * Shared pure logic for the post-purchase customer satisfaction survey.
 *
 * Consumed today by the public survey form (`src/pages/PublicEncuesta.tsx`)
 * and, in a later phase, by the "Satisfacción" dashboard module — keep this
 * file free of React/DOM/Supabase imports so both consumers can share it.
 *
 * Backend contract (see supabase/migrations/20260720120000_satisfaction_surveys.sql):
 * `get_survey_by_token` / `submit_survey_response` RPCs take one param per
 * aspect named `p_{column}`. `column` below is that base name.
 */

export interface SatisfactionAspect {
  /** Stable identifier for the aspect; used as the key in form/ratings state. */
  key: string;
  /** DB/RPC parameter base name (RPC arg is `p_${column}`). Currently == key. */
  column: string;
  title: string;
  question: string;
}

/**
 * Which event produced the survey. Mirrors `satisfaction_surveys.origin`.
 * 'won' / 'repurchase' ask about the SALE; 'service' asks about a workshop visit.
 */
export type SurveyOrigin = 'won' | 'repurchase' | 'service';

/** Ordered list of the 5 rated aspects for a SALE survey, one per step in the form. */
export const SATISFACTION_ASPECTS: SatisfactionAspect[] = [
  {
    key: 'atencion_digital',
    column: 'atencion_digital',
    title: 'Atención Digital',
    question:
      '¿Qué tan satisfecho/a quedaste con la rapidez y claridad de la información que recibiste a través de nuestros canales digitales (WhatsApp, web, redes sociales) antes de visitarnos?',
  },
  {
    key: 'bienvenida_presencial',
    column: 'bienvenida_presencial',
    title: 'Bienvenida y Atención Presencial',
    question:
      'Pensando en el momento en que entraste al concesionario, ¿cómo calificarías la recepción, la amabilidad del equipo y la comodidad de nuestras instalaciones?',
  },
  {
    key: 'negociacion_asesoria',
    column: 'negociacion_asesoria',
    title: 'Negociación y Asesoría',
    question:
      'Durante la elección de tu vehículo, ¿el asesor comercial escuchó tus necesidades y te brindó información clara, transparente y sin presiones?',
  },
  {
    key: 'financiamiento_tramites',
    column: 'financiamiento_tramites',
    title: 'Financiamiento y Trámites',
    question: '¿Qué tan ágil, claro y eficiente te pareció el proceso de financiamiento, documentación y pago?',
  },
  {
    key: 'experiencia_entrega',
    column: 'experiencia_entrega',
    title: 'Experiencia de Entrega',
    question:
      '¿La explicación del vehículo, el estado de limpieza y la calidez del momento de entrega cumplieron tus expectativas?',
  },
];

/**
 * POSTVENTA — "Encuesta de Satisfacción: Experiencia Técnica y Servicio Postventa".
 *
 * NOT a rating survey. GAC defined 8 closed questions grouped in 5 sections; there is no
 * 1..5 scale and no NPS. That is a different SHAPE of answer, not different wording, which
 * is why it cannot reuse `SatisfactionAspect`.
 *
 * `score` mirrors the CASE expressions in
 * supabase/migrations/20260813120000_postventa_survey_questionnaire.sql. The database is the
 * one that computes `overall_score` / `has_low_score`; the copy here is only so the UI can
 * colour an answer without a round trip. If the two ever disagree, the migration wins.
 */
export interface ServiceSurveyOption {
  value: string;
  label: string;
  /** 5 best, 3 middle, 1 worst — same scale the sale survey reports on. */
  score: 1 | 3 | 5;
}

export interface ServiceSurveyQuestion {
  /** DB column is `q_${column}`; RPC argument is `p_${column}`. */
  column: string;
  title: string;
  question: string;
  options: ServiceSurveyOption[];
}

export interface ServiceSurveySection {
  title: string;
  questions: ServiceSurveyQuestion[];
}

export const SERVICE_SURVEY_SECTIONS: ServiceSurveySection[] = [
  {
    title: 'Atención y Diagnóstico Inicial',
    questions: [
      {
        column: 'recepcion_imagen',
        title: 'Recepción e Imagen',
        question:
          'Al llegar al concesionario, ¿el asesor te recibió a tiempo y mantuvo una presencia limpia, formal y profesional?',
        options: [
          { value: 'si', label: 'Sí', score: 5 },
          { value: 'no', label: 'No', score: 1 },
        ],
      },
      {
        column: 'explicacion_tecnica',
        title: 'Explicación Técnica del Asesor',
        question:
          '¿Qué tan clara, detallada y comprensible fue la explicación que te dio el asesor sobre el trabajo que se le realizaría a tu auto?',
        options: [
          { value: 'muy_clara', label: 'Muy clara y detallada', score: 5 },
          { value: 'aceptable', label: 'Aceptable', score: 3 },
          { value: 'confusa', label: 'Confusa o insuficiente', score: 1 },
        ],
      },
    ],
  },
  {
    title: 'Calidad del Trabajo Técnico y Repuestos',
    questions: [
      {
        column: 'informe_tecnico',
        title: 'Informe Técnico Escrito',
        question:
          '¿Recibiste un informe técnico por escrito o digital detallando los diagnósticos y trabajos ejecutados en tu vehículo?',
        options: [
          { value: 'si', label: 'Sí', score: 5 },
          { value: 'no', label: 'No', score: 1 },
        ],
      },
      {
        column: 'garantia_repuestos',
        title: 'Garantía de Repuestos',
        question:
          '¿Te confirmaron y garantizaron el uso de repuestos 100% genuinos / originales durante el mantenimiento o reparación?',
        options: [
          { value: 'si', label: 'Sí', score: 5 },
          // Una omisión al comunicar, no la negación de la garantía: por eso 3 y no 1.
          { value: 'no_mencionado', label: 'No me lo mencionaron', score: 3 },
          { value: 'no', label: 'No', score: 1 },
        ],
      },
      {
        column: 'presentacion_equipo',
        title: 'Presentación del Equipo Técnico',
        question:
          'Al interactuar o visualizar al equipo de taller/mecánicos, ¿notaste una presencia limpia, cuidada y profesional?',
        options: [
          { value: 'si', label: 'Sí', score: 5 },
          { value: 'no', label: 'No', score: 1 },
        ],
      },
    ],
  },
  {
    title: 'Entrega y Acabado del Vehículo',
    questions: [
      {
        column: 'limpieza_entrega',
        title: 'Limpieza e Higiene',
        question: 'Al momento de retirarlo, ¿tu vehículo fue entregado completamente lavado y aspirado?',
        options: [
          { value: 'impecable', label: 'Sí, impecable', score: 5 },
          { value: 'parcial', label: 'Parcialmente limpio', score: 3 },
          { value: 'no_lavado', label: 'No fue lavado/aspirado', score: 1 },
        ],
      },
    ],
  },
  {
    title: 'Transparencia y Valor de Servicio',
    questions: [
      {
        column: 'precio_mano_obra',
        title: 'Relación Precio - Mano de Obra',
        question:
          'Pensando en la calidad técnica recibida y la atención brindada, ¿qué opinas sobre el costo de la mano de obra?',
        options: [
          { value: 'excelente', label: 'Excelente / Justo', score: 5 },
          { value: 'adecuado', label: 'Adecuado', score: 3 },
          { value: 'elevado', label: 'Elevado para el servicio recibido', score: 1 },
        ],
      },
    ],
  },
  {
    title: 'Calificación General',
    questions: [
      {
        column: 'conclusion_tecnica',
        title: 'Conclusión Técnica',
        question:
          'En general, ¿sientes que te brindaron la atención técnica adecuada y resolvieron de forma definitiva el motivo de tu cita?',
        options: [
          { value: 'satisfecho', label: 'Sí, totalmente satisfecho', score: 5 },
          { value: 'parcial', label: 'Parcialmente', score: 3 },
          { value: 'persiste', label: 'No, el problema persiste', score: 1 },
        ],
      },
    ],
  },
];

/** The 8 questions in order, flattened out of their sections. */
export const SERVICE_SURVEY_QUESTIONS: ServiceSurveyQuestion[] =
  SERVICE_SURVEY_SECTIONS.flatMap(s => s.questions);

/** True when this survey uses the closed-question postventa form instead of 1..5 sliders. */
export function isServiceSurvey(origin: string | null | undefined): boolean {
  return origin === 'service';
}

/** The stored option for one answer, or undefined if the value is unknown. */
export function getServiceSurveyOption(
  column: string,
  value: string | null | undefined,
): ServiceSurveyOption | undefined {
  if (!value) return undefined;
  return SERVICE_SURVEY_QUESTIONS.find(q => q.column === column)?.options.find(o => o.value === value);
}

/**
 * Aspect list for a SALE survey.
 *
 * Returns an empty list for 'service': that origin has no 1..5 aspects at all since
 * 2026-08-13. Returning the sale list instead would have every consumer render sale titles
 * over columns that no longer exist — five rows of "NaN/5" that still look like a report.
 */
export function getAspectsForOrigin(origin: string | null | undefined): SatisfactionAspect[] {
  return isServiceSurvey(origin) ? [] : SATISFACTION_ASPECTS;
}

/** The RPC that accepts this origin's answers. The two are not interchangeable — each one
 *  rejects the other's token server-side (see migration 20260803130000). */
export function getSubmitRpcForOrigin(origin: string | null | undefined): string {
  return origin === 'service' ? 'submit_service_survey_response' : 'submit_survey_response';
}

/** Human label for a survey's origin, shared by the client dialog and the dashboard. */
export const SURVEY_ORIGIN_LABEL: Record<string, string> = {
  won: 'Compra',
  repurchase: 'Recompra',
  service: 'Postventa',
};

export interface SatisfactionLevel {
  label: string;
  emoji: string;
  /**
   * HSL triplet as "H S% L%" (no `hsl()` wrapper) — matches this project's
   * CSS custom-property convention (see `--primary` / `--destructive` in
   * src/index.css). Consumers either:
   *  - wrap it for a CSS color: `hsl(${color})`, or
   *  - assign it directly to a local `--primary` override to recolor a
   *    component that consumes `bg-primary` / `border-primary` (e.g. the
   *    shadcn Slider), without forking that shared component.
   */
  color: string;
}

// Mirrors Tailwind's default red-500/orange-500/amber-500/lime-500/green-500
// scale (already partially adopted by this project: --destructive === red-500,
// --imb-warning === amber-500) so the survey's red→green gradient matches the
// rest of the app's semantic colors.
const SATISFACTION_LEVELS: Record<number, SatisfactionLevel> = {
  1: { label: 'Muy insatisfecho', emoji: '😠', color: '0 84% 60%' },
  2: { label: 'Insatisfecho', emoji: '🙁', color: '24 95% 53%' },
  3: { label: 'Neutral', emoji: '😐', color: '38 92% 50%' },
  4: { label: 'Satisfecho', emoji: '🙂', color: '83 78% 42%' },
  5: { label: 'Muy satisfecho', emoji: '😄', color: '142 71% 45%' },
};

const FALLBACK_LEVEL: SatisfactionLevel = SATISFACTION_LEVELS[3];

/**
 * Maps a 1..5 rating to its display level (label + emoji + accent color).
 * Out-of-range values fall back to the neutral (3) level instead of throwing,
 * so a live slider drag can never render a blank/broken state.
 */
export function getSatisfactionLevel(value: number): SatisfactionLevel {
  return SATISFACTION_LEVELS[value] ?? FALLBACK_LEVEL;
}

/**
 * Normalizes a name for fuzzy matching: strips accents/diacritics, trims,
 * collapses internal whitespace runs to a single space, and uppercases.
 * Used by the client-detail survey match cascade (name is the last-resort
 * signal, after plate and phone) — `clients.full_name` and
 * `satisfaction_surveys.client_name` are free text and may differ in casing,
 * accents, or spacing even for the same person.
 */
export function normalizeClientName(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/**
 * Returns the first "meaningful" token (length >= 3) of a normalized name,
 * skipping short particles ("DE", "LA", "EL", ...) that would otherwise
 * produce a near-universal `ILIKE '%DE%'` match. Returns "" when no token is
 * long enough or the input is empty.
 */
export function firstMeaningfulNameToken(raw: string | null | undefined): string {
  const tokens = normalizeClientName(raw).split(' ').filter(t => t.length >= 3);
  return tokens[0] || '';
}
