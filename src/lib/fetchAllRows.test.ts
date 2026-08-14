import { describe, it, expect } from 'vitest';
import { fetchAllRows } from './fetchAllRows';

/** Simula PostgREST: una tabla de `total` filas que respeta `range(from, to)`. */
function fakeTable(total: number, pageSize: number) {
  const calls: Array<[number, number]> = [];
  const build = (from: number, to: number) => {
    calls.push([from, to]);
    const rows = Array.from({ length: total }, (_, i) => ({ id: i })).slice(from, to + 1);
    // PostgREST nunca devuelve más de pageSize aunque el rango pida más.
    return Promise.resolve({ data: rows.slice(0, pageSize) });
  };
  return { build, calls };
}

describe('fetchAllRows', () => {
  it('trae todas las filas cuando hay más de una página', async () => {
    const { build, calls } = fakeTable(2350, 1000);
    const rows = await fetchAllRows<{ id: number }>(build, 1000);
    expect(rows).toHaveLength(2350);
    expect(rows[0].id).toBe(0);
    expect(rows[2349].id).toBe(2349);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('corta en la primera página cuando la tabla es más chica que el tamaño de página', async () => {
    const { build, calls } = fakeTable(637, 1000);
    const rows = await fetchAllRows<{ id: number }>(build, 1000);
    expect(rows).toHaveLength(637);
    expect(calls).toHaveLength(1);
  });

  it('pide una página de más cuando el total es múltiplo exacto, para saber que terminó', async () => {
    const { build, calls } = fakeTable(1000, 1000);
    const rows = await fetchAllRows<{ id: number }>(build, 1000);
    expect(rows).toHaveLength(1000);
    expect(calls).toHaveLength(2);
  });

  it('devuelve vacío sin romperse cuando no hay filas', async () => {
    const rows = await fetchAllRows<{ id: number }>(() => Promise.resolve({ data: null }));
    expect(rows).toEqual([]);
  });

  it('no pide páginas para siempre si la consulta siempre devuelve llena', async () => {
    let calls = 0;
    const rows = await fetchAllRows<{ id: number }>(() => {
      calls++;
      return Promise.resolve({ data: Array.from({ length: 10 }, (_, i) => ({ id: i })) });
    }, 10);
    expect(calls).toBe(100);
    expect(rows).toHaveLength(1000);
  });
});
