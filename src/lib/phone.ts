/**
 * Phone helpers for duplicate detection (Venezuela).
 */

/**
 * Returns the digits-only representation of a phone number.
 * Strips every non-digit character. Returns "" for empty/nullish input.
 */
export function normalizeVzPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.replace(/\D/g, '');
}

/**
 * Reduces a phone number to its canonical Venezuelan form (digits only).
 *
 * Venezuelan assumption: a mobile/landline number is 10 significant digits
 * (e.g. 4141234567). Numbers may be entered with the country code 58 and/or a
 * national trunk 0 prefix (e.g. +58 414 1234567, 0414 1234567). We strip a
 * leading 58 country code first, then a single leading national 0, and finally
 * keep the last 10 significant digits of what remains. Numbers that end up with
 * fewer than 10 digits are returned as-is (too short to safely truncate).
 */
function toCanonicalVzPhone(raw: string | null | undefined): string {
  let digits = normalizeVzPhone(raw);
  if (!digits) return '';

  // Strip leading country code (Venezuela = 58).
  if (digits.startsWith('58')) {
    digits = digits.slice(2);
  }

  // Strip a single leading national trunk 0.
  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // Keep the last 10 significant digits when available.
  if (digits.length >= 10) {
    return digits.slice(-10);
  }

  return digits;
}

/**
 * Compares two phone numbers for a likely match.
 *
 * Both numbers are first reduced to a canonical Venezuelan form (see
 * toCanonicalVzPhone): country code 58 and a national trunk 0 are stripped, and
 * the last 10 significant digits are kept. When both canonical forms have 10
 * digits they must match exactly; when either has fewer than 10 digits the full
 * digit strings are compared instead (avoids false positives from blind
 * last-10 comparison). Empty values never match.
 */
export function phonesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const ca = toCanonicalVzPhone(a);
  const cb = toCanonicalVzPhone(b);

  if (!ca || !cb) return false;

  // Both canonical forms are already last-10 (or full string when shorter),
  // so an exact string comparison covers both the 10-digit and short cases.
  return ca === cb;
}

/**
 * Strips all non-digit characters from `raw` (via `normalizeVzPhone`) and
 * returns the last `len` digits (or fewer, if the input has fewer digits
 * than `len`).
 *
 * Used to match a `clients.phone` (local format, e.g. `0424-8040975`)
 * against `satisfaction_surveys.client_phone` (international format, e.g.
 * `+584248040975`) — both share the same last-10-digit suffix, which is
 * used as the `ilike '%<suffix>'` join key since there is no FK between
 * the two tables. Returns `""` for `null`/`undefined`/empty input.
 */
export function phoneMatchSuffix(raw: string | null | undefined, len = 10): string {
  const digits = normalizeVzPhone(raw);
  if (!digits) return '';
  return digits.slice(-len);
}
