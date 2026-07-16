/**
 * Sanitizes a raw search term for safe embedding inside a double-quoted
 * PostgREST filter value. Only double quotes and backslashes are removed
 * because they cannot be represented inside a quoted value; commas,
 * parentheses and percent signs are preserved (quoting makes them safe).
 */
export function sanitizeSearchTerm(term: string): string {
  return term.trim().replace(/["\\]/g, '');
}

/**
 * Builds the PostgREST `.or()` filter string for the main "Vehículos" search
 * box, which matches by plate, VIN, color, and (when the term matches one or
 * more vehicle models) model.
 *
 * Pattern values are double-quoted so characters that are syntax-significant
 * in PostgREST's `.or()` filter (commas, parentheses) survive inside the term.
 * Returns '' when the term sanitizes to empty so callers can skip filtering
 * entirely instead of matching everything with a degenerate `%%` pattern.
 */
export function buildVehicleSearchFilter(term: string, modelIds: string[]): string {
  const sanitized = sanitizeSearchTerm(term);
  if (!sanitized) return '';
  const base = `plate.ilike."%${sanitized}%",vin.ilike."%${sanitized}%",color.ilike."%${sanitized}%"`;
  if (modelIds.length === 0) return base;
  return `${base},model_id.in.(${modelIds.join(',')})`;
}
