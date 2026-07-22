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

/** Ordered list of the 5 rated aspects, shown one per step in the survey form. */
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
