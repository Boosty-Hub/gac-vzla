import { syncClientToKommo } from '@/lib/kommo';

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
 */
export interface ManualReservationInput {
  clientName: string;
  clientCedula: string;
  clientPhone: string;
  modelId: string;
  plate: string;
  /** Vehicle year; falls back to the current year when empty/invalid. */
  year: string;
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
  limit: (count: number) => ManualEntitiesQuery;
  maybeSingle: () => Promise<QueryResult<{ id: string; client_id?: string }>>;
  single: () => Promise<QueryResult<{ id: string; client_id: string }>>;
}

/**
 * Minimal slice of the Supabase client this helper needs. Accepting it as a
 * parameter keeps this lib decoupled from the generated client typings while
 * letting both reservation portals share the create-or-reuse logic.
 */
interface ManualEntitiesClient {
  from: (table: string) => ManualEntitiesQuery;
}

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

  // Validate the model: a vehicle row cannot exist without it.
  if (!input.modelId) throw new Error('El modelo del vehículo es requerido');

  // Validate the year: parse and clamp to a sane range, else fall back to current year.
  const currentYear = new Date().getFullYear();
  const parsedYear = parseInt(input.year, 10);
  const year =
    Number.isFinite(parsedYear) && parsedYear >= 1980 && parsedYear <= currentYear + 1
      ? parsedYear
      : currentYear;

  // Plate is UNIQUE in the DB: if a vehicle already exists with this plate, reuse it
  // (and its client) instead of inserting a duplicate that would violate the constraint.
  if (plate) {
    const { data: existingVehicle } = await client
      .from('vehicles')
      .select('id, client_id')
      .eq('plate', plate)
      .maybeSingle();
    if (existingVehicle?.id && existingVehicle.client_id) {
      return { vehicle: { id: existingVehicle.id, client_id: existingVehicle.client_id } };
    }
  }

  // 1) Resolve the client: reuse by cedula first, then by phone, else insert.
  let clientId: string | null = null;
  // Track whether WE created the client this call, so we can roll it back if the
  // vehicle insert fails (avoids leaving orphan clients behind).
  let clientWasCreated = false;

  if (cedula) {
    const { data } = await client.from('clients').select('id').eq('cedula', cedula).maybeSingle();
    if (data?.id) clientId = data.id;
  }
  if (!clientId && phone) {
    const { data } = await client.from('clients').select('id').eq('phone', phone).limit(1).maybeSingle();
    if (data?.id) clientId = data.id;
  }
  if (!clientId) {
    const { data, error } = await client
      .from('clients')
      .insert({
        full_name: name,
        cedula: cedula || null,
        phone: phone || null,
        is_active: true,
      })
      .select('id')
      .single();
    if (error || !data?.id) {
      // A concurrent insert (or pre-existing row) can trip the UNIQUE cedula
      // constraint (Postgres 23505). Re-query by cedula and reuse instead of aborting.
      const code = (error as { code?: string } | null)?.code;
      if (code === '23505' && cedula) {
        const { data: existing } = await client
          .from('clients')
          .select('id')
          .eq('cedula', cedula)
          .maybeSingle();
        if (existing?.id) {
          clientId = existing.id;
        }
      }
      if (!clientId) throw error || new Error('No se pudo crear el cliente');
    } else {
      clientId = data.id;
      clientWasCreated = true;
    }
  }

  // 2) Insert the vehicle linked to the resolved client.
  const { data: vehicleData, error: vehicleError } = await client
    .from('vehicles')
    .insert({
      client_id: clientId,
      model_id: input.modelId,
      year,
      plate: plate || null,
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
  if (clientWasCreated && clientId) {
    syncClientToKommo(clientId).catch(() => {});
  }

  return { vehicle: { id: vehicleData.id, client_id: vehicleData.client_id } };
}
