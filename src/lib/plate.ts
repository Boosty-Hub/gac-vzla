/**
 * Sold-plate helpers for the "ganado" (won) prospect status intercept.
 *
 * When a prospect is marked "ganado" the sold vehicle plate is captured and
 * written to `prospects.sold_plate` in the same update as the status change
 * (see supabase/migrations/20260720120000_satisfaction_surveys.sql — the
 * `create_satisfaction_survey_on_won` trigger reads NEW.sold_plate).
 */

/**
 * Normalizes a raw sold-plate input: trims surrounding whitespace, collapses
 * internal whitespace runs to a single space, and uppercases. Mirrors the
 * walkin_plate normalization used elsewhere (`.trim().toUpperCase()`).
 */
export function normalizeSoldPlate(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Returns true when the raw input normalizes to a non-empty plate.
 * Venezuelan plate formats vary widely (old/new scheme, motorcycles,
 * temporary plates), so this intentionally stays lenient and only guards
 * against empty input.
 */
export function isValidSoldPlate(raw: string): boolean {
  return normalizeSoldPlate(raw).length > 0;
}
