import { describe, it, expect } from 'vitest';
import { buildEventFilterOptions } from './prospectEventFilter';

describe('buildEventFilterOptions', () => {
  it('muestra un evento recién creado aunque todavía no tenga leads', () => {
    // El reporte que originó esto: "Expo Zulia" se creó el 2026-08-26, tenía 0 prospectos, y
    // el filtro no la ofrecía. Justo el momento en que uno filtra es para ver si ya llegó
    // alguno.
    const options = buildEventFilterOptions(
      [{ name: 'Expo Zulia' }],
      [{ event_name: 'Expo ISP 2026' }],
    );
    const zulia = options.find(o => o.name === 'Expo Zulia');
    expect(zulia).toBeDefined();
    expect(zulia!.count).toBe(0);
  });

  it('cuenta los leads de cada evento', () => {
    const options = buildEventFilterOptions(
      [{ name: 'Expo ISP 2026' }, { name: 'Expo Zulia' }],
      [
        { event_name: 'Expo ISP 2026' },
        { event_name: 'Expo ISP 2026' },
        { event_name: 'Expo Zulia' },
      ],
    );
    expect(options.find(o => o.name === 'Expo ISP 2026')!.count).toBe(2);
    expect(options.find(o => o.name === 'Expo Zulia')!.count).toBe(1);
  });

  it('conserva un evento cerrado que todavía tiene leads', () => {
    // Cerrar un evento lo saca del catálogo activo, pero sus 235 leads siguen existiendo.
    // Sin esto dejarían de poder filtrarse y quedarían inalcanzables.
    const options = buildEventFilterOptions(
      [{ name: 'Expo Zulia' }],
      [{ event_name: 'Cerro Verde 2026' }, { event_name: 'Cerro Verde 2026' }],
    );
    const cerrado = options.find(o => o.name === 'Cerro Verde 2026');
    expect(cerrado).toBeDefined();
    expect(cerrado!.count).toBe(2);
    expect(cerrado!.inCatalog).toBe(false);
  });

  it('no duplica un evento que está en el catálogo y en los prospectos', () => {
    const options = buildEventFilterOptions(
      [{ name: 'Expo ISP 2026' }],
      [{ event_name: 'Expo ISP 2026' }],
    );
    expect(options).toHaveLength(1);
    expect(options[0].inCatalog).toBe(true);
  });

  it('ignora vacíos y nulos, que no son un evento', () => {
    const options = buildEventFilterOptions(
      [],
      [{ event_name: null }, { event_name: '   ' }, { event_name: undefined }, {}],
    );
    expect(options).toEqual([]);
  });

  it('ordena alfabético respetando acentos del español', () => {
    const options = buildEventFilterOptions(
      [{ name: 'Zulia' }, { name: 'Exhibición Guacamaya' }, { name: 'Clínica Sanatrix' }],
      [],
    );
    expect(options.map(o => o.name)).toEqual([
      'Clínica Sanatrix', 'Exhibición Guacamaya', 'Zulia',
    ]);
  });

  it('aguanta listas nulas', () => {
    expect(buildEventFilterOptions(null, null)).toEqual([]);
    expect(buildEventFilterOptions(undefined, undefined)).toEqual([]);
  });
});
