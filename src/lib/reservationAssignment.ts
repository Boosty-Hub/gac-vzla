import { syncClientToKommo } from '@/lib/kommo';
import { findOrCreateManualModel, type ManualModelClient } from '@/lib/manualVehicleModel';

/**
 * Resolves which client/vehicle (or walk-in) columns a reservation/incidencia
 * should be saved with, from the unified search selection state.
 *
 * Precedence: a selected vehicle (resolved by plate or from the client's list)
 * always wins and carries its own client_id; otherwise a client selected without
 * a vehicle; otherwise manual walk-in data. Setting one representation clears the
 * others so reassigning stays consistent.
 *
 * Shared by both the normal-reservation and the incidencia (Falla o Desperfecto)
 * save paths so the plate→vehicle link is persisted identically in both.
 */
export interface ReservationSelection {
  /** A resolved vehicle (e.g. picked by plate) plus the client it belongs to. */
  vehicle: { id: string; client_id: string } | null;
  /** A client selected without choosing a specific vehicle. */
  clientId: string | null;
  walkinName: string;
  walkinPhone: string;
  walkinPlate: string;
}

export interface ReservationAssignment {
  vehicle_id: string | null;
  client_id: string | null;
  walkin_client_name: string | null;
  walkin_client_phone: string | null;
  walkin_plate: string | null;
}

export function resolveReservationAssignment(sel: ReservationSelection): ReservationAssignment {
  if (sel.vehicle) {
    return {
      vehicle_id: sel.vehicle.id,
      client_id: sel.vehicle.client_id,
      walkin_client_name: null,
      walkin_client_phone: null,
      walkin_plate: null,
    };
  }
  if (sel.clientId) {
    return {
      vehicle_id: null,
      client_id: sel.clientId,
      walkin_client_name: null,
      walkin_client_phone: null,
      walkin_plate: null,
    };
  }
  return {
    vehicle_id: null,
    client_id: null,
    walkin_client_name: sel.walkinName.trim() || null,
    walkin_client_phone: sel.walkinPhone.trim() || null,
    walkin_plate: sel.walkinPlate.trim().toUpperCase() || null,
  };
}

/**
 * Data captured by the "Ingresar manualmente" path: a client (name, optional
 * cedula/phone) plus a vehicle (model, optional plate/year) that are not yet in
 * the database.
 *
 * The vehicle's model is resolved from EXACTLY ONE of two sources:
 *  - `modelId`: an existing row from the commercial catalog (GAC/DFSK/SHINERAY).
 *  - `manualModel`: a hand-typed `{ brand, modelName }` pair for a third-party
 *    vehicle that is not part of the catalog (e.g. a one-off service on a car we
 *    don't sell). When set, `modelId` is ignored.
 */
export interface ManualReservationInput {
  clientName: string;
  clientCedula: string;
  clientPhone: string;
  modelId: string;
  /**
   * Hand-typed brand/model for a third-party vehicle. Mutually exclusive with
   * `modelId` — when present, a manual (`is_manual: true`) `vehicle_models` row is
   * found-or-created instead of using `modelId`, and the resulting vehicle AND
   * client are both flagged `is_manual: true` (see `createOrReuseManualEntities`).
   */
  manualModel?: { brand: string; modelName: string } | null;
  plate: string;
  /** Vehicle year; falls back to the current year when empty/invalid. */
  year: string;
  /**
   * Convenio/alianza por la que llega este cliente externo, cuando corresponde.
   *
   * Sólo se escribe si el cliente se CREA en esta llamada. Un cliente reusado (por cédula,
   * teléfono o placa) no se re-etiqueta: ya existía y su origen es el que tenga cargado.
   * Pisarlo desde el mostrador borraría el dato bueno con lo que teclearon hoy.
   * Ver supabase/migrations/20260811130000_external_source.sql.
   */
  externalSource?: string | null;
}

export interface ManualEntitiesResult {
  /** A resolved vehicle + its client, ready to feed resolveReservationAssignment. */
  vehicle: { id: string; client_id: string };
}

/** A thenable that resolves to a Supabase-style `{ data, error }` envelope. */
interface QueryResult<T> {
  data: T | null;
  error: { message?: string; code?: string } | null;
}

/**
 * Minimal slice of the Supabase query builder this helper relies on. Only the
 * chained calls actually used below are modeled, keeping the surface small while
 * staying decoupled from the generated client typings.
 */
interface ManualEntitiesQuery {
  select: (columns: string) => ManualEntitiesQuery;
  insert: (values: Record<string, unknown>) => ManualEntitiesQuery;
  delete: () => ManualEntitiesQuery;
  eq: (column: string, value: unknown) => ManualEntitiesQuery;
  /** Case-insensitive match, used to dedupe manual `vehicle_models` by brand/name. */
  ilike: (column: string, pattern: string) => ManualEntitiesQuery;
  limit: (count: number) => ManualEntitiesQuery;
  maybeSingle: () => Promise<QueryResult<{ id: string; client_id?: string }>>;
  single: () => Promise<QueryResult<{ id: string; client_id: string }>>;
}

/**
 * Minimal slice of the Supabase client this helper needs. Accepting it as a
 * parameter keeps this lib decoupled from the generated client typings while
 * letting both reservation portals share the create-or-reuse logic.
 *
 * `from` is deliberately loose, matching `ManualModelClient` in
 * `@/lib/manualVehicleModel`. The real client's `PostgrestQueryBuilder` does NOT
 * structurally satisfy `ManualEntitiesQuery` — `eq`/`ilike`/`limit`/`maybeSingle`/
 * `single` live on the filter builder that `.select()` returns, not on the builder
 * `from()` hands back. Typing it strictly made both call sites fail to compile
 * (AdminReservas, DealershipReservas) even though the chain is correct at runtime.
 * `ManualEntitiesQuery` still documents and types the chain used inside this module,
 * and tests keep passing a fake shaped like it.
 */
interface ManualEntitiesClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  /**
   * Needed for the reuse lookups below. A plain `from('clients').select()` is BLIND for
   * a dealership user: `clients_select` only exposes clients that already have a
   * reservation at their own dealership, so an existing client shows up as "not found",
   * gets re-inserted, and dies on the `clients_cedula_key` unique index. The
   * SECURITY DEFINER RPCs see the whole table and are gated to staff roles.
   * See supabase/migrations/20260806120000_staff_client_search_cedula_phone.sql.
   */
  // `PromiseLike`, no `Promise`: supabase `.rpc()` devuelve un PostgrestFilterBuilder, que es
  // "thenable" pero no una Promise. Con `Promise` el cliente real no calzaba y las dos
  // pantallas que llaman acá no compilaban. `await` funciona igual con los dos.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: string, params: Record<string, unknown>) => PromiseLike<QueryResult<any>>;
}

/**
 * Manual-model resolution lives in `@/lib/manualVehicleModel` — see the import above.
 *
 * It used to be duplicated here and in both admin pages, and the copies had already
 * drifted: this one wrote `is_active: true` where the others wrote `false`, and it did
 * not escape ILIKE wildcards, so a model typed with a `%` would match an unrelated row.
 */

/**
 * Persists the manual-entry client and vehicle as REAL rows so the reservation
 * carries genuine foreign keys (instead of free-text walk-in data).
 *
 * Vehicle reuse: plate is UNIQUE in the DB, so an existing vehicle with the same
 * plate is reused (returning its id + client_id) instead of inserting a duplicate.
 *
 * Client reuse: an existing client is reused when its cedula matches (cedula is
 * UNIQUE in the DB, normalized before lookup), otherwise when its phone matches;
 * only when neither matches is a new client inserted. A UNIQUE-violation (23505)
 * on cedula insert is recovered by re-reading and reusing the existing client.
 *
 * BOTH reuse lookups go through SECURITY DEFINER RPCs (`staff_resolve_client`,
 * `staff_resolve_vehicle_by_plate`), never a direct select. RLS only exposes to a
 * dealership user the clients and vehicles that already have a reservation at their own
 * dealership, so the direct reads answered "does not exist" for rows that did exist —
 * the insert then hit the unique index and the reservation failed outright. That is the
 * reported "el cliente existe pero no se puede vincular". Do not swap these back for
 * `from('clients')` / `from('vehicles')`: it works for an admin and silently breaks for
 * everyone else. See 20260806120000_staff_client_search_cedula_phone.sql.
 *
 * Manual model (`input.manualModel`): when the caller supplies a hand-typed
 * brand/model instead of `modelId` (a third-party vehicle we don't sell), the
 * model is found-or-created via `findOrCreateManualModel`, and BOTH the inserted
 * vehicle and a freshly-created client are flagged `is_manual: true`. A REUSED
 * client (matched by cedula/phone, or by an existing vehicle's plate) is never
 * retroactively flagged — reuse means they are already a real, tracked customer.
 *
 * Atomicity: if the client was created in this call and the subsequent vehicle
 * insert fails, the freshly created client is deleted (cleanup) before throwing,
 * so no orphan client rows are left behind.
 *
 * Throws on any unrecoverable insert error so callers can surface a toast and abort.
 */
export async function createOrReuseManualEntities(
  client: ManualEntitiesClient,
  input: ManualReservationInput,
): Promise<ManualEntitiesResult> {
  const name = input.clientName.trim();
  // Normalize cedula (trim + uppercase + strip inner spaces) BEFORE lookup/insert
  // so reuse works regardless of how it was originally typed (e.g. "v 123" vs "V123").
  const cedula = input.clientCedula.trim().toUpperCase().replace(/\s+/g, '');
  const phone = input.clientPhone.trim();
  const plate = input.plate.trim().toUpperCase();

  // Resolve the manual brand/model (if any) and validate: a vehicle row cannot
  // exist without a model, resolved either from an existing catalog id or from a
  // hand-typed brand/model pair — never both, never neither.
  const manualModel = input.manualModel
    ? { brand: input.manualModel.brand.trim(), modelName: input.manualModel.modelName.trim() }
    : null;
  if (manualModel) {
    if (!manualModel.brand || !manualModel.modelName) {
      throw new Error('La marca y el modelo son requeridos');
    }
  } else if (!input.modelId) {
    throw new Error('El modelo del vehículo es requerido');
  }

  // Validate the year: parse and clamp to a sane range, else fall back to current year.
  const currentYear = new Date().getFullYear();
  const parsedYear = parseInt(input.year, 10);
  const year =
    Number.isFinite(parsedYear) && parsedYear >= 1980 && parsedYear <= currentYear + 1
      ? parsedYear
      : currentYear;

  // Plate is UNIQUE in the DB: if a vehicle already exists with this plate, reuse it
  // (and its client) instead of inserting a duplicate that would violate the constraint.
  //
  // Via RPC, not a direct select: `vehicles_select` hides from a dealership user every
  // vehicle without a reservation at their own dealership, so the direct read reported
  // "no existe" for a plate that did exist, and the insert then died on the unique index
  // with no recovery path at all.
  if (plate) {
    const { data: plateRows } = await client.rpc('staff_resolve_vehicle_by_plate', { p_plate: plate });
    const existingVehicle = (plateRows as Array<{ vehicle_id: string; client_id: string | null }> | null)?.[0];
    if (existingVehicle?.vehicle_id && existingVehicle.client_id) {
      return { vehicle: { id: existingVehicle.vehicle_id, client_id: existingVehicle.client_id } };
    }
  }

  // 1) Resolve the client: reuse by cedula first, then by phone, else insert.
  let clientId: string | null = null;
  // Track whether WE created the client this call, so we can roll it back if the
  // vehicle insert fails (avoids leaving orphan clients behind).
  let clientWasCreated = false;

  // One RPC instead of two direct selects. It applies the same precedence (cedula, then
  // phone) but SECURITY DEFINER, so it actually sees the row — which the direct selects
  // did not for a dealership user, and that is the whole reported bug: the client existed
  // and could not be linked.
  if (cedula || phone) {
    const { data } = await client.rpc('staff_resolve_client', { p_cedula: cedula, p_phone: phone });
    const resolved = typeof data === 'string' ? data : null;
    if (resolved) clientId = resolved;
  }
  if (!clientId) {
    const { data, error } = await client
      .from('clients')
      .insert({
        full_name: name,
        cedula: cedula || null,
        phone: phone || null,
        is_active: true,
        // Externo = lo cargamos nosotros a mano, no vino de una venta ni del CRM. Vale
        // para TODO el ingreso manual, no solo cuando la marca está fuera del catálogo:
        // un tercero puede traer un GAC que no le vendimos. Antes esto era
        // `Boolean(manualModel)` y por eso no había un solo cliente externo en la base
        // pese a que sí se cargaban a mano.
        is_manual: true,
        // De qué convenio vino. El trigger de la DB normaliza espacios y lo limpia si el
        // cliente dejara de ser externo, así que acá sólo hace falta no mandar vacío.
        external_source: input.externalSource?.trim() || null,
      })
      .select('id')
      .single();
    if (error || !data?.id) {
      // A concurrent insert (or pre-existing row) can trip the UNIQUE cedula
      // constraint (Postgres 23505). Re-query by cedula and reuse instead of aborting.
      const code = (error as { code?: string } | null)?.code;
      if (code === '23505' && cedula) {
        // Through the RPC as well. With the direct select this recovery was useless for a
        // dealership user: the same RLS that hid the client in the first place hid it
        // again here, so the 23505 always ended in a thrown error.
        const { data: existing } = await client.rpc('staff_resolve_client', { p_cedula: cedula, p_phone: '' });
        if (typeof existing === 'string' && existing) {
          clientId = existing;
        }
      }
      if (!clientId) throw error || new Error('No se pudo crear el cliente');
    } else {
      clientId = data.id;
      clientWasCreated = true;
    }
  }

  // 2) Resolve the model: an existing catalog id, or find-or-create a manual
  // (is_manual: true) vehicle_models row for a hand-typed brand/model. Done AFTER
  // the plate short-circuit above so a manual model row is never created for a
  // plate that already resolved to an existing vehicle.
  // The shared helper returns null when brand or model is blank; the caller-side
  // validation should already have caught that, so treat it as a hard error here rather
  // than letting a null reach the NOT NULL `vehicles.model_id` column.
  const modelId = manualModel
    ? await findOrCreateManualModel(
        client as unknown as ManualModelClient,
        manualModel.brand,
        manualModel.modelName,
      )
    : input.modelId;

  if (!modelId) throw new Error('El modelo del vehículo es requerido');

  // 3) Insert the vehicle linked to the resolved client.
  const { data: vehicleData, error: vehicleError } = await client
    .from('vehicles')
    .insert({
      client_id: clientId,
      model_id: modelId,
      year,
      plate: plate || null,
      // Mismo criterio que el cliente: entró a mano, así que es externo aunque el modelo
      // salga del catálogo. NO afecta la garantía — esa la decide `vehicle_models.
      // is_manual` (src/lib/warranty.ts), que solo se marca cuando la marca se escribe
      // a mano. Un externo con un GAC conserva su garantía.
      is_manual: true,
    })
    .select('id, client_id')
    .single();
  if (vehicleError || !vehicleData?.id) {
    // Atomicity: if we just created the client, roll it back so a failed vehicle
    // insert doesn't leave an orphan client row.
    if (clientWasCreated && clientId) {
      try {
        await client.from('clients').delete().eq('id', clientId);
      } catch {
        // Best-effort cleanup; surface the original vehicle error regardless.
      }
    }
    throw vehicleError || new Error('No se pudo crear el vehículo');
  }

  // Fire-and-forget: sync into Kommo's Post Venta "En conversación" stage only when
  // a genuinely NEW client was inserted above (not on the cedula/phone reuse branches),
  // and only after the vehicle insert succeeded so a rolled-back client is never synced.
  //
  // DO NOT REMOVE the third-party guard. Un tercero al que le hicimos un mantenimiento
  // sobre un vehículo que no vendemos NO es un cliente comercial: sincronizarlo
  // fabricaría un lead de Post Venta falso por cada entrada de taller, que es justo lo
  // que el requerimiento prohíbe ("ojo, no puede quedar con nuestros clientes").
  // Ver supabase/migrations/20260730140000_manual_vehicles_and_clients.sql.
  //
  // La guarda mira el MODELO, no `is_manual` del cliente. Desde que "externo" pasó a
  // significar "cargado a mano", esa bandera es true para todo este camino, y atar el
  // sync a ella dejaría sin sincronizar a clientes reales que solo faltaba cargar.
  const isThirdPartyVehicle = Boolean(manualModel);
  if (clientWasCreated && clientId && !isThirdPartyVehicle) {
    syncClientToKommo(clientId).catch(() => {});
  }

  return { vehicle: { id: vehicleData.id, client_id: vehicleData.client_id } };
}
