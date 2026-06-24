import { describe, it, expect } from 'vitest';
import { resolveReservationAssignment, createOrReuseManualEntities } from './reservationAssignment';

/**
 * Minimal in-memory fake of the Supabase query builder used by
 * createOrReuseManualEntities. Each `from(table)` returns a fresh builder that
 * records the operation; the test wires up canned responses per (table, op).
 */
type Row = Record<string, unknown>;

interface FakeOptions {
  /** Vehicles indexed by plate for the reuse-by-plate lookup. */
  vehiclesByPlate?: Record<string, { id: string; client_id: string }>;
  /** Clients indexed by cedula for reuse-by-cedula lookup. */
  clientsByCedula?: Record<string, { id: string }>;
  /** Clients indexed by phone for reuse-by-phone lookup. */
  clientsByPhone?: Record<string, { id: string }>;
  /** When true, inserting a client returns a 23505 unique-violation error. */
  clientInsertConflict?: boolean;
  /** When true, inserting a vehicle returns an error (to test cleanup). */
  vehicleInsertFails?: boolean;
}

function makeFakeClient(opts: FakeOptions = {}) {
  const deletedClientIds: string[] = [];
  const insertedClients: Row[] = [];
  const insertedVehicles: Row[] = [];
  let clientIdSeq = 0;
  let vehicleIdSeq = 0;

  const client = {
    deletedClientIds,
    insertedClients,
    insertedVehicles,
    from(table: string) {
      const state: {
        op: 'select' | 'insert' | 'delete' | null;
        values: Row | null;
        eqs: Array<[string, unknown]>;
      } = { op: null, values: null, eqs: [] };

      const builder = {
        select() {
          if (!state.op) state.op = 'select';
          return builder;
        },
        insert(values: Row) {
          state.op = 'insert';
          state.values = values;
          return builder;
        },
        delete() {
          state.op = 'delete';
          return builder;
        },
        eq(column: string, value: unknown) {
          state.eqs.push([column, value]);
          if (state.op === 'delete' && table === 'clients' && column === 'id') {
            deletedClientIds.push(String(value));
            return Promise.resolve({ data: null, error: null });
          }
          return builder;
        },
        limit() {
          return builder;
        },
        async maybeSingle() {
          if (table === 'vehicles' && state.op === 'select') {
            const plate = state.eqs.find(([c]) => c === 'plate')?.[1] as string | undefined;
            const found = plate ? opts.vehiclesByPlate?.[plate] : undefined;
            return { data: found ?? null, error: null };
          }
          if (table === 'clients' && state.op === 'select') {
            const cedula = state.eqs.find(([c]) => c === 'cedula')?.[1] as string | undefined;
            const phone = state.eqs.find(([c]) => c === 'phone')?.[1] as string | undefined;
            if (cedula && opts.clientsByCedula?.[cedula]) {
              return { data: opts.clientsByCedula[cedula], error: null };
            }
            if (phone && opts.clientsByPhone?.[phone]) {
              return { data: opts.clientsByPhone[phone], error: null };
            }
            return { data: null, error: null };
          }
          return { data: null, error: null };
        },
        async single() {
          if (table === 'clients' && state.op === 'insert') {
            if (opts.clientInsertConflict) {
              return { data: null, error: { code: '23505', message: 'duplicate key' } };
            }
            const id = `cli-new-${++clientIdSeq}`;
            insertedClients.push({ id, ...state.values });
            return { data: { id }, error: null };
          }
          if (table === 'vehicles' && state.op === 'insert') {
            if (opts.vehicleInsertFails) {
              return { data: null, error: { code: '500', message: 'vehicle insert failed' } };
            }
            const id = `veh-new-${++vehicleIdSeq}`;
            insertedVehicles.push({ id, ...state.values });
            return { data: { id, client_id: state.values?.client_id }, error: null };
          }
          return { data: null, error: { message: 'unexpected single()' } };
        },
      };
      return builder as unknown as ReturnType<typeof client.from>;
    },
  };
  return client;
}

describe('resolveReservationAssignment', () => {
  it('links the vehicle (and its client) when a vehicle was selected by plate — the reported bug', () => {
    const result = resolveReservationAssignment({
      vehicle: { id: 'veh-1', client_id: 'cli-1' },
      clientId: null,
      walkinName: '',
      walkinPhone: '',
      walkinPlate: '',
    });
    expect(result).toEqual({
      vehicle_id: 'veh-1',
      client_id: 'cli-1',
      walkin_client_name: null,
      walkin_client_phone: null,
      walkin_plate: null,
    });
  });

  it('a selected vehicle always wins over a separately selected client', () => {
    const result = resolveReservationAssignment({
      vehicle: { id: 'veh-9', client_id: 'cli-from-vehicle' },
      clientId: 'cli-other',
      walkinName: 'Ignored',
      walkinPhone: '123',
      walkinPlate: 'XYZ',
    });
    expect(result.vehicle_id).toBe('veh-9');
    expect(result.client_id).toBe('cli-from-vehicle');
    expect(result.walkin_client_name).toBeNull();
    expect(result.walkin_plate).toBeNull();
  });

  it('links only the client (no vehicle) when a client was selected without a vehicle', () => {
    const result = resolveReservationAssignment({
      vehicle: null,
      clientId: 'cli-2',
      walkinName: '',
      walkinPhone: '',
      walkinPlate: '',
    });
    expect(result).toEqual({
      vehicle_id: null,
      client_id: 'cli-2',
      walkin_client_name: null,
      walkin_client_phone: null,
      walkin_plate: null,
    });
  });

  it('falls back to walk-in fields when nothing is registered, trimming and upper-casing the plate', () => {
    const result = resolveReservationAssignment({
      vehicle: null,
      clientId: null,
      walkinName: '  Juan Perez  ',
      walkinPhone: ' +58 412 ',
      walkinPlate: ' ab12cd ',
    });
    expect(result).toEqual({
      vehicle_id: null,
      client_id: null,
      walkin_client_name: 'Juan Perez',
      walkin_client_phone: '+58 412',
      walkin_plate: 'AB12CD',
    });
  });

  it('returns all-null when there is no selection and no walk-in data', () => {
    const result = resolveReservationAssignment({
      vehicle: null,
      clientId: null,
      walkinName: '   ',
      walkinPhone: '',
      walkinPlate: '',
    });
    expect(result).toEqual({
      vehicle_id: null,
      client_id: null,
      walkin_client_name: null,
      walkin_client_phone: null,
      walkin_plate: null,
    });
  });
});

const baseInput = {
  clientName: 'Juan Perez',
  clientCedula: 'V-12345678',
  clientPhone: '+58 412 1112233',
  modelId: 'model-1',
  plate: 'ABC123',
  year: '2020',
};

describe('createOrReuseManualEntities', () => {
  it('reuses an existing vehicle by plate (UNIQUE) instead of inserting a duplicate', async () => {
    const fake = makeFakeClient({ vehiclesByPlate: { ABC123: { id: 'veh-x', client_id: 'cli-x' } } });
    const result = await createOrReuseManualEntities(fake as never, baseInput);
    expect(result.vehicle).toEqual({ id: 'veh-x', client_id: 'cli-x' });
    expect(fake.insertedVehicles).toHaveLength(0);
    expect(fake.insertedClients).toHaveLength(0);
  });

  it('reuses an existing client by cedula and inserts a fresh vehicle', async () => {
    const fake = makeFakeClient({ clientsByCedula: { 'V-12345678': { id: 'cli-ced' } } });
    const result = await createOrReuseManualEntities(fake as never, baseInput);
    expect(result.vehicle.client_id).toBe('cli-ced');
    expect(fake.insertedClients).toHaveLength(0);
    expect(fake.insertedVehicles).toHaveLength(1);
  });

  it('normalizes the cedula (spaces + case) before lookup so reuse matches', async () => {
    const fake = makeFakeClient({ clientsByCedula: { 'V12345678': { id: 'cli-ced' } } });
    const result = await createOrReuseManualEntities(fake as never, {
      ...baseInput,
      clientCedula: '  v 123 456 78 ',
    });
    expect(result.vehicle.client_id).toBe('cli-ced');
    expect(fake.insertedClients).toHaveLength(0);
  });

  it('creates a new client and vehicle when nothing matches', async () => {
    const fake = makeFakeClient();
    const result = await createOrReuseManualEntities(fake as never, baseInput);
    expect(fake.insertedClients).toHaveLength(1);
    expect(fake.insertedVehicles).toHaveLength(1);
    expect(result.vehicle.client_id).toMatch(/^cli-new-/);
  });

  it('throws when the model id is missing', async () => {
    const fake = makeFakeClient();
    await expect(
      createOrReuseManualEntities(fake as never, { ...baseInput, modelId: '' }),
    ).rejects.toThrow(/modelo/i);
    expect(fake.insertedClients).toHaveLength(0);
    expect(fake.insertedVehicles).toHaveLength(0);
  });

  it('clamps an out-of-range year to the current year', async () => {
    const fake = makeFakeClient();
    await createOrReuseManualEntities(fake as never, { ...baseInput, year: '1850' });
    expect(fake.insertedVehicles[0].year).toBe(new Date().getFullYear());
  });

  it('falls back to the current year for a non-numeric year', async () => {
    const fake = makeFakeClient();
    await createOrReuseManualEntities(fake as never, { ...baseInput, year: 'abc' });
    expect(fake.insertedVehicles[0].year).toBe(new Date().getFullYear());
  });

  it('deletes the freshly created client when the vehicle insert fails (atomicity)', async () => {
    const fake = makeFakeClient({ vehicleInsertFails: true });
    await expect(createOrReuseManualEntities(fake as never, baseInput)).rejects.toBeTruthy();
    expect(fake.insertedClients).toHaveLength(1);
    expect(fake.deletedClientIds).toEqual([fake.insertedClients[0].id]);
  });

  it('does NOT delete a reused client when the vehicle insert fails', async () => {
    const fake = makeFakeClient({
      clientsByCedula: { 'V-12345678': { id: 'cli-ced' } },
      vehicleInsertFails: true,
    });
    await expect(createOrReuseManualEntities(fake as never, baseInput)).rejects.toBeTruthy();
    expect(fake.deletedClientIds).toHaveLength(0);
  });

  it('recovers from a UNIQUE-violation (23505) on cedula by reusing the existing client', async () => {
    // First lookup misses (no cedula match yet), insert hits 23505, then re-query
    // finds the row. Simulate by toggling clientsByCedula after the conflict via a
    // builder that returns the row on the second maybeSingle. Simplest: provide the
    // row in clientsByCedula AND set clientInsertConflict — but then the first lookup
    // would already reuse it. So model the race: no initial match, conflict, recover.
    const recovered = { id: 'cli-race' };
    let cedulaLookups = 0;
    const fake = {
      insertedVehicles: [] as Row[],
      from(table: string) {
        const state: { op: string | null; values: Row | null; eqs: Array<[string, unknown]> } = {
          op: null, values: null, eqs: [],
        };
        const builder: Record<string, unknown> = {
          select() { if (!state.op) state.op = 'select'; return builder; },
          insert(v: Row) { state.op = 'insert'; state.values = v; return builder; },
          delete() { state.op = 'delete'; return builder; },
          eq(c: string, v: unknown) { state.eqs.push([c, v]); return builder; },
          limit() { return builder; },
          async maybeSingle() {
            if (table === 'vehicles') return { data: null, error: null };
            if (table === 'clients' && state.eqs.some(([c]) => c === 'cedula')) {
              cedulaLookups++;
              // First lookup: miss. After the conflicting insert: hit.
              return { data: cedulaLookups > 1 ? recovered : null, error: null };
            }
            return { data: null, error: null };
          },
          async single() {
            if (table === 'clients') return { data: null, error: { code: '23505', message: 'dup' } };
            if (table === 'vehicles') {
              const id = 'veh-race';
              (fake.insertedVehicles as Row[]).push({ id, ...state.values });
              return { data: { id, client_id: state.values?.client_id }, error: null };
            }
            return { data: null, error: { message: 'unexpected' } };
          },
        };
        return builder;
      },
    };
    const result = await createOrReuseManualEntities(fake as never, baseInput);
    expect(result.vehicle.client_id).toBe('cli-race');
    expect(fake.insertedVehicles).toHaveLength(1);
  });
});
