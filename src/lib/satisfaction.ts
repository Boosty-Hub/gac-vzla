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
 * Ordered list of the 5 rated aspects for a POST-SERVICE (postventa) survey.
 *
 * Deliberately a separate list rather than reworded sale questions: the answers land in
 * `service_survey_responses`, whose columns are named after THESE aspects. `column` here
 * is the RPC parameter base name for `submit_service_survey_response` (arg = `p_${column}`)
 * and the DB column base name (`q_${column}`), exactly as with the sale list.
 *
 * Keeping the count at 5 keeps the public form's step arithmetic identical for both kinds.
 */
export const SERVICE_SATISFACTION_ASPECTS: SatisfactionAspect[] = [
  {
    key: 'agendamiento',
    column: 'agendamiento',
    title: 'Agendamiento de la Cita',
    question:
      '¿Qué tan fácil te resultó agendar tu cita y obtener una fecha que se ajustara a lo que necesitabas?',
  },
  {
    key: 'recepcion_asesor',
    column: 'recepcion_asesor',
    title: 'Recepción y Asesor de Servicio',
    question:
      'Al llegar al centro de servicio, ¿cómo calificarías la atención del asesor: te escuchó, te explicó el trabajo a realizar y te dio un presupuesto claro?',
  },
  {
    key: 'tiempo_entrega',
    column: 'tiempo_entrega',
    title: 'Tiempo de Entrega',
    question: '¿Se cumplió el tiempo de entrega que te prometieron cuando dejaste tu vehículo?',
  },
  {
    key: 'calidad_servicio',
    column: 'calidad_servicio',
    title: 'Calidad del Servicio',
    question:
      'Pensando en el trabajo realizado, ¿tu vehículo te fue entregado en las condiciones que esperabas y se resolvió lo que solicitaste?',
  },
  {
    key: 'instalaciones',
    column: 'instalaciones',
    title: 'Instalaciones',
    question: '¿Qué tan cómodas, limpias y adecuadas te parecieron nuestras instalaciones mientras esperabas?',
  },
];

/** Aspect list matching a survey's origin. Unknown/absent origin falls back to the sale
 *  set, which is what every survey created before postventa existed is. */
export function getAspectsForOrigin(origin: string | null | undefined): SatisfactionAspect[] {
  return origin === 'service' ? SERVICE_SATISFACTION_ASPECTS : SATISFACTION_ASPECTS;
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
