import { describe, it, expect } from 'vitest';
import { escapeIlike, findOrCreateManualModel, type ManualModelClient } from './manualVehicleModel';

/**
 * Minimal fake of the PostgREST builder: records the filters applied and returns whatever
 * the scenario was seeded with. Only the methods this module actually chains are modelled.
 */
function fakeClient(opts: {
  existing?: { id: string } | null;
  insertResult?: { data?: { id: string } | null; error?: { code?: string } | null };
  existingAfterRace?: { id: string } | null;
}) {
  const calls: { filters: Record<string, string>; inserted: unknown[] } = { filters: {}, inserted: [] };
  let lookupCount = 0;

  const client: ManualModelClient = {
    from: () => {
      const builder: any = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          calls.filters[col] = String(val);
          return builder;
        },
        ilike: (col: string, val: string) => {
          calls.filters[`ilike:${col}`] = val;
          return builder;
        },
        maybeSingle: () => {
          lookupCount++;
          const row = lookupCount === 1 ? opts.existing ?? null : opts.existingAfterRace ?? null;
          return Promise.resolve({ data: row });
        },
        insert: (row: unknown) => {
          calls.inserted.push(row);
          return builder;
        },
        single: () =>
          Promise.resolve({
            data: opts.insertResult?.data ?? null,
            error: opts.insertResult?.error ?? null,
          }),
      };
      return builder;
    },
  };

  return { client, calls, lookupCount: () => lookupCount };
}

describe('escapeIlike', () => {
  it('escapes % so a typed model cannot wildcard-match unrelated rows', () => {
    // The real bug this prevents: a model typed as "%" previously matched EVERY manual
    // model, silently reusing the first one for an unrelated vehicle.
    expect(escapeIlike('%')).toBe('\\%');
  });

  it('escapes _ , the single-character wildcard', () => {
    expect(escapeIlike('GS_3')).toBe('GS\\_3');
  });

  it('escapes backslashes before adding its own, so escapes are not doubled', () => {
    expect(escapeIlike('a\\b')).toBe('a\\\\b');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeIlike('Toyota Corolla')).toBe('Toyota Corolla');
  });
});

describe('findOrCreateManualModel', () => {
  it('returns null for a blank brand or model instead of creating a junk row', async () => {
    const a = fakeClient({});
    expect(await findOrCreateManualModel(a.client, '   ', 'Corolla')).toBeNull();
    expect(a.calls.inserted).toHaveLength(0);

    const b = fakeClient({});
    expect(await findOrCreateManualModel(b.client, 'Toyota', '')).toBeNull();
    expect(b.calls.inserted).toHaveLength(0);
  });

  it('reuses an existing manual model instead of inserting a near-duplicate', async () => {
    const { client, calls } = fakeClient({ existing: { id: 'model-1' } });
    expect(await findOrCreateManualModel(client, 'Toyota', 'Corolla')).toBe('model-1');
    expect(calls.inserted).toHaveLength(0);
  });

  it('scopes the lookup to is_manual rows so it never repoints into the real catalog', async () => {
    // Typing "gac" / "GS3" must create a separate manual row, never silently reuse the
    // sellable catalog model of the same name.
    const { client, calls } = fakeClient({ existing: null, insertResult: { data: { id: 'new-1' } } });
    await findOrCreateManualModel(client, 'gac', 'GS3');
    expect(calls.filters['is_manual']).toBe('true');
  });

  it('trims and escapes the values used for matching', async () => {
    const { client, calls } = fakeClient({ existing: { id: 'model-1' } });
    await findOrCreateManualModel(client, '  Toy%ota  ', '  Coro_lla  ');
    expect(calls.filters['ilike:brand']).toBe('Toy\\%ota');
    expect(calls.filters['ilike:name']).toBe('Coro\\_lla');
  });

  it('creates the row inactive, flagged manual, and with no warranty fields', async () => {
    const { client, calls } = fakeClient({ existing: null, insertResult: { data: { id: 'new-1' } } });
    expect(await findOrCreateManualModel(client, 'Toyota', 'Corolla')).toBe('new-1');
    expect(calls.inserted[0]).toEqual({
      brand: 'Toyota',
      name: 'Corolla',
      is_manual: true,
      is_active: false,
    });
  });

  it('recovers from the insert race by re-reading the row the winner created', async () => {
    // Two people register the same make/model at once. The unique index
    // (uq_vehicle_models_manual_brand_name) rejects the loser with 23505 — that is the
    // expected outcome, not a failure.
    const { client } = fakeClient({
      existing: null,
      insertResult: { error: { code: '23505' } },
      existingAfterRace: { id: 'winner-1' },
    });
    expect(await findOrCreateManualModel(client, 'Toyota', 'Corolla')).toBe('winner-1');
  });

  it('throws on a non-race insert failure rather than returning a silent null', async () => {
    const { client } = fakeClient({
      existing: null,
      insertResult: { error: { code: '42501' } },
    });
    await expect(findOrCreateManualModel(client, 'Toyota', 'Corolla')).rejects.toBeDefined();
  });
});
