/**
 * Single source of truth for resolving a hand-typed vehicle model.
 *
 * Third-party vehicles (a Toyota that comes in for a one-off service) are not in the
 * commercial catalog, which only holds GAC, DFSK and SHINERAY. Staff type the brand and
 * model by hand; this module turns that text into a `vehicle_models` row flagged
 * `is_manual`, reusing an existing one when the same make/model comes back.
 *
 * This used to be copy-pasted in three places (`AdminVehiculos.tsx`, `AdminClientes.tsx`,
 * `reservationAssignment.ts`) and the copies had already drifted apart in two ways that
 * mattered — one wrote `is_active: true` while the others wrote `false`, and only two of
 * them escaped ILIKE wildcards. Keep it here, in one place.
 */

/**
 * Minimal shape of the Supabase client used here. Declared structurally rather than
 * importing the concrete client type so tests can pass a fake, and so the `as any` casts
 * the stale `types.ts` forces on callers stay at the call site instead of leaking inward.
 */
export interface ManualModelClient {
  from: (table: string) => any;
}

/**
 * Escapes ILIKE metacharacters so free-typed text is matched literally.
 *
 * Without this, a model typed as "%" matches EVERY manual model and the first one gets
 * silently reused for an unrelated vehicle. `\` must be escaped first or it would double-
 * escape the sequences added after it.
 */
export function escapeIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export interface ManualModelInput {
  brand: string;
  modelName: string;
}

/**
 * Finds an existing manual model matching `(brand, modelName)` case-insensitively, or
 * creates one. Returns its id, or `null` when either field is blank.
 *
 * Guarantees:
 * - **Never reuses or mutates a real catalog row.** The lookup is scoped to
 *   `is_manual = true`, so typing "gac" / "GS3" creates a separate manual row rather than
 *   silently repointing a third-party vehicle at a sellable model.
 * - **Never writes warranty fields.** The DB CHECK `chk_manual_model_has_no_warranty`
 *   rejects that combination, and a vehicle we did not sell has no warranty with us.
 * - **`is_active: false`**, so a picker elsewhere that filters only on `is_active` and has
 *   not yet learned about `is_manual` still will not surface these.
 * - **Race-safe.** A partial unique index (`uq_vehicle_models_manual_brand_name`, migration
 *   20260730150000) makes concurrent inserts of the same make/model impossible; on the
 *   resulting unique violation we re-read and return the row the winner created.
 */
export async function findOrCreateManualModel(
  client: ManualModelClient,
  brand: string,
  modelName: string,
): Promise<string | null> {
  const brandTrim = brand?.trim() ?? '';
  const nameTrim = modelName?.trim() ?? '';
  if (!brandTrim || !nameTrim) return null;

  const lookup = () =>
    client
      .from('vehicle_models')
      .select('id')
      .eq('is_manual', true)
      .ilike('brand', escapeIlike(brandTrim))
      .ilike('name', escapeIlike(nameTrim))
      .maybeSingle();

  const { data: existing } = await lookup();
  if (existing?.id) return existing.id as string;

  const { data: created, error } = await client
    .from('vehicle_models')
    .insert({ brand: brandTrim, name: nameTrim, is_manual: true, is_active: false })
    .select('id')
    .single();

  if (created?.id) return created.id as string;

  // 23505 = unique_violation: another request created the same manual model between our
  // lookup and our insert. That is the expected outcome of the race, not a failure —
  // re-read and use theirs.
  if (error?.code === '23505') {
    const { data: raced } = await lookup();
    if (raced?.id) return raced.id as string;
  }

  throw error ?? new Error('No se pudo crear el modelo manual');
}
