import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveReservationAssignment, createOrReuseManualEntities } from './reservationAssignment';
import { syncClientToKommo } from '@/lib/kommo';

// createOrReuseManualEntities imports syncClientToKommo directly (not injected), so
// it must be mocked at module level to assert on it without hitting the real
// Supabase edge function.
vi.mock('@/lib/kommo', () => ({ syncClientToKommo: vi.fn(() => Promise.resolve()) }));

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
  /** Existing manual `vehicle_models`, keyed by "brand|name" lowercased, for the find-or-create lookup. */
  manualModelsByKey?: Record<string, { id: string }>;
}

function makeFakeClient(opts: FakeOptions = {}) {
  const deletedClientIds: string[] = [];
  const insertedClients: Row[] = [];
  const insertedVehicles: Row[] = [];
  const insertedVehicleModels: Row[] = [];
  let clientIdSeq = 0;
  let vehicleIdSeq = 0;
  let modelIdSeq = 0;

  const client = {
    deletedClientIds,
    insertedClients,
    insertedVehicles,
    insertedVehicleModels,
    /**
     * The reuse lookups go through SECURITY DEFINER RPCs, not direct selects, because
     * RLS makes the direct read blind for a dealership user (see the module docblock).
     * The fake answers them from the same `clientsByCedula` / `clientsByPhone` /
     * `vehiclesByPlate` maps, so every reuse test keeps asserting the same behaviour.
     */
    async rpc(fn: string, params: Record<string, unknown>) {
      if (fn === 'staff_resolve_vehicle_by_plate') {
        const plate = String(params.p_plate ?? '');
        const found = opts.vehiclesByPlate?.[plate];
        return {
          data: found ? [{ vehicle_id: found.id, client_id: found.client_id }] : [],
          error: null,
        };
      }
      if (fn === 'staff_resolve_client') {
        const cedula = String(params.p_cedula ?? '');
        const phone = String(params.p_phone ?? '');
        // Cedula wins over phone, mirroring the RPC's ORDER BY.
        const found = (cedula && opts.clientsByCedula?.[cedula])
          || (phone && opts.clientsByPhone?.[phone])
          || null;
        return { data: found ? found.id : null, error: null };
      }
      throw new Error(`unexpected rpc: ${fn}`);
    },
    from(table: string) {
      const state: {
        op: 'select' | 'insert' | 'delete' | null;
        values: Row | null;
        eqs: Array<[string, unknown]>;
        ilikes: Array<[string, unknown]>;
      } = { op: null, values: null, eqs: [], ilikes: [] };

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
        ilike(column: string, value: unknown) {
          state.ilikes.push([column, value]);
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
          if (table === 'vehicle_models' && state.op === 'select') {
            const brand = state.ilikes.find(([c]) => c === 'brand')?.[1] as string | undefined;
            const name = state.ilikes.find(([c]) => c === 'name')?.[1] as string | undefined;
            if (brand && name) {
              const key = `${brand.toLowerCase()}|${name.toLowerCase()}`;
              const found = opts.manualModelsByKey?.[key];
              if (found) return { data: found, error: null };
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
          if (table === 'vehicle_models' && state.op === 'insert') {
            const id = `model-new-${++modelIdSeq}`;
            insertedVehicleModels.push({ id, ...state.values });
            return { data: { id }, error: null };
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
      async rpc(fn: string) {
        if (fn === 'staff_resolve_vehicle_by_plate') return { data: [], error: null };
        if (fn === 'staff_resolve_client') {
          cedulaLookups++;
          // First lookup: miss. After the conflicting insert: hit.
          return { data: cedulaLookups > 1 ? recovered.id : null, error: null };
        }
        throw new Error(`unexpected rpc: ${fn}`);
      },
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

  // Regresión reportada: "hay clientes que existen en nuestra base de datos interna, pero
  // no están en el sistema de gestión, por lo que no se puede realizar la vinculación".
  // Bajo RLS, un `from('clients').select()` no ve al cliente si no tiene una reserva en el
  // concesionario del usuario, así que el reuso fallaba, se insertaba de nuevo y moría en
  // clients_cedula_key. Estas dos pruebas fijan que el reuso ocurre por RPC.
  it('busca el cliente existente por RPC y no por un select directo (ciego bajo RLS)', async () => {
    const seenTables: string[] = [];
    const rpcCalls: string[] = [];
    const fake = makeFakeClient({ clientsByCedula: { 'V-12345678': { id: 'cli-ced' } } });
    const wrapped = {
      ...fake,
      rpc(fn: string, params: Record<string, unknown>) { rpcCalls.push(fn); return fake.rpc(fn, params); },
      from(table: string) { seenTables.push(table); return fake.from(table); },
    };
    const result = await createOrReuseManualEntities(wrapped as never, baseInput);
    expect(result.vehicle.client_id).toBe('cli-ced');
    expect(rpcCalls).toContain('staff_resolve_client');
    // `clients` solo puede aparecer para INSERT/DELETE, nunca para resolver el reuso.
    expect(rpcCalls).toContain('staff_resolve_vehicle_by_plate');
    expect(seenTables).not.toContain('clients');
  });

  it('reusa el vehículo existente por placa vía RPC, sin tocar la tabla vehicles', async () => {
    const seenTables: string[] = [];
    const fake = makeFakeClient({ vehiclesByPlate: { ABC123: { id: 'veh-x', client_id: 'cli-x' } } });
    const wrapped = {
      ...fake,
      rpc: fake.rpc,
      from(table: string) { seenTables.push(table); return fake.from(table); },
    };
    const result = await createOrReuseManualEntities(wrapped as never, baseInput);
    expect(result.vehicle).toEqual({ id: 'veh-x', client_id: 'cli-x' });
    expect(seenTables).not.toContain('vehicles');
  });
});

describe('createOrReuseManualEntities — manual model (typed brand/model)', () => {
  it('reuses an existing manual model matching case-insensitively instead of creating a duplicate', async () => {
    const fake = makeFakeClient({
      manualModelsByKey: { 'toyota|corolla': { id: 'model-manual-1' } },
    });
    const result = await createOrReuseManualEntities(fake as never, {
      ...baseInput,
      modelId: '',
      manualModel: { brand: 'TOYOTA', modelName: 'corolla' },
    });
    expect(fake.insertedVehicleModels).toHaveLength(0);
    expect(fake.insertedVehicles[0].model_id).toBe('model-manual-1');
    expect(fake.insertedVehicles[0].is_manual).toBe(true);
    expect(result.vehicle.id).toBeTruthy();
  });

  it('creates a manual vehicle_models row (is_manual, no warranty fields) when nothing matches', async () => {
    const fake = makeFakeClient();
    await createOrReuseManualEntities(fake as never, {
      ...baseInput,
      modelId: '',
      manualModel: { brand: 'Toyota', modelName: 'Corolla' },
    });
    expect(fake.insertedVehicleModels).toHaveLength(1);
    expect(fake.insertedVehicleModels[0]).toMatchObject({ brand: 'Toyota', name: 'Corolla', is_manual: true });
    // The DB CHECK chk_manual_model_has_no_warranty forbids warranty values on a
    // manual model — this asserts the client never even attempts to set them.
    expect(fake.insertedVehicleModels[0]).not.toHaveProperty('warranty_km');
    expect(fake.insertedVehicleModels[0]).not.toHaveProperty('warranty_months');
    expect(fake.insertedVehicleModels[0]).not.toHaveProperty('warranty_condition_id');
  });

  it('flags both the vehicle and a newly created client as is_manual', async () => {
    const fake = makeFakeClient();
    await createOrReuseManualEntities(fake as never, {
      ...baseInput,
      modelId: '',
      manualModel: { brand: 'Toyota', modelName: 'Corolla' },
    });
    expect(fake.insertedClients[0].is_manual).toBe(true);
    expect(fake.insertedVehicles[0].is_manual).toBe(true);
  });

  it('does NOT flag a REUSED client (matched by cedula) as manual', async () => {
    const fake = makeFakeClient({ clientsByCedula: { 'V-12345678': { id: 'cli-ced' } } });
    const result = await createOrReuseManualEntities(fake as never, {
      ...baseInput,
      modelId: '',
      manualModel: { brand: 'Toyota', modelName: 'Corolla' },
    });
    expect(result.vehicle.client_id).toBe('cli-ced');
    expect(fake.insertedClients).toHaveLength(0);
  });

  it('throws when manualModel is missing the brand', async () => {
    const fake = makeFakeClient();
    await expect(
      createOrReuseManualEntities(fake as never, {
        ...baseInput,
        modelId: '',
        manualModel: { brand: '  ', modelName: 'Corolla' },
      }),
    ).rejects.toThrow(/marca.*modelo/i);
    expect(fake.insertedClients).toHaveLength(0);
    expect(fake.insertedVehicles).toHaveLength(0);
  });

  it('throws when manualModel is missing the model name', async () => {
    const fake = makeFakeClient();
    await expect(
      createOrReuseManualEntities(fake as never, {
        ...baseInput,
        modelId: '',
        manualModel: { brand: 'Toyota', modelName: '  ' },
      }),
    ).rejects.toThrow(/marca.*modelo/i);
    expect(fake.insertedClients).toHaveLength(0);
    expect(fake.insertedVehicles).toHaveLength(0);
  });
});

describe('createOrReuseManualEntities — Kommo sync guard', () => {
  beforeEach(() => {
    vi.mocked(syncClientToKommo).mockClear();
  });

  it('syncs a genuinely new, non-manual client to Kommo', async () => {
    const fake = makeFakeClient();
    await createOrReuseManualEntities(fake as never, baseInput);
    expect(syncClientToKommo).toHaveBeenCalledTimes(1);
    expect(syncClientToKommo).toHaveBeenCalledWith(fake.insertedClients[0].id);
  });

  it('does NOT sync a manual client (third-party, typed model) to Kommo', async () => {
    const fake = makeFakeClient();
    await createOrReuseManualEntities(fake as never, {
      ...baseInput,
      modelId: '',
      manualModel: { brand: 'Toyota', modelName: 'Corolla' },
    });
    expect(syncClientToKommo).not.toHaveBeenCalled();
  });

  it('does NOT sync a reused client even on the normal (non-manual) path', async () => {
    const fake = makeFakeClient({ clientsByCedula: { 'V-12345678': { id: 'cli-ced' } } });
    await createOrReuseManualEntities(fake as never, baseInput);
    expect(syncClientToKommo).not.toHaveBeenCalled();
  });
});
