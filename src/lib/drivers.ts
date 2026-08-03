/**
 * Pure helpers for fleet drivers (`public.drivers`).
 *
 * The whole point of requirement R5 is that a driver is PICKED from a list, never typed
 * free-form, so that "Moisés", "moisés " and "MOISES" stop becoming three people. The DB
 * enforces that with a unique index on `(client_id, lower(btrim(full_name)))`, but a
 * constraint violation is a terrible way to tell a user "that driver already exists" — so
 * the same normalization lives here and runs before the insert.
 *
 * Keep this file free of React/Supabase imports so it stays directly unit-testable.
 */

export interface DriverOption {
  id: string;
  full_name: string;
  cedula: string | null;
  phone: string | null;
}

/**
 * Canonical form used for duplicate detection: accents stripped, whitespace runs
 * collapsed, trimmed, lowercased.
 *
 * NOTE the deliberate asymmetry with the DB index, which is only `lower(btrim(name))` and
 * therefore does NOT fold accents. This is stricter on purpose: it catches "Moises" vs
 * "Moisés" in the UI before the round-trip. Anything this rejects the DB would also
 * accept, never the reverse, so the two can't disagree in a way that lets a duplicate slip
 * through.
 */
export function normalizeDriverName(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Presentation form stored in the DB: trimmed, whitespace-collapsed, and Title Cased so a
 * list of drivers reads consistently no matter how each one was typed. Accents are
 * PRESERVED here — only the comparison form drops them.
 */
export function formatDriverName(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(word => (word ? word[0].toLocaleUpperCase('es') + word.slice(1).toLocaleLowerCase('es') : word))
    .join(' ');
}

/**
 * Finds an existing driver whose name collides with `candidate` under normalization.
 * Returns the colliding driver so the caller can offer to select it instead of creating a
 * near-duplicate. Returns null when the name is free (or blank — a blank name is rejected
 * by validation, not by duplicate detection).
 */
export function findDuplicateDriver(candidate: string, existing: DriverOption[]): DriverOption | null {
  const normalized = normalizeDriverName(candidate);
  if (!normalized) return null;
  return existing.find(d => normalizeDriverName(d.full_name) === normalized) ?? null;
}

/**
 * Filters drivers by a free-text query over name and cédula (R9).
 *
 * Two different drivers CAN legitimately share a name across different clients — R9 states
 * that when that happens both must be listed so the user picks. So this never dedupes; it
 * only filters, and the caller is responsible for rendering enough context (cédula, client)
 * to tell two same-named people apart.
 */
export function filterDrivers<T extends { full_name: string; cedula?: string | null }>(
  drivers: T[],
  query: string,
): T[] {
  const q = normalizeDriverName(query);
  if (!q) return drivers;
  return drivers.filter(d => {
    if (normalizeDriverName(d.full_name).includes(q)) return true;
    const cedula = (d.cedula ?? '').toLowerCase();
    return cedula ? cedula.includes(query.trim().toLowerCase()) : false;
  });
}

/**
 * Label for a driver in a dropdown. Appends the cédula when present, which is the only
 * reliable way to tell apart two drivers who genuinely share a name.
 */
export function driverLabel(driver: Pick<DriverOption, 'full_name' | 'cedula'>): string {
  return driver.cedula ? `${driver.full_name} — ${driver.cedula}` : driver.full_name;
}
