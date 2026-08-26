import { describe, it, expect } from 'vitest';
import {
  formatInvestment,
  costPerLead,
  costPerSale,
  formatEventDate,
  eventDateRange,
} from './eventRoi';

describe('formatInvestment', () => {
  it('muestra el monto con su moneda', () => {
    expect(formatInvestment(1500, 'USD')).toBe('USD 1.500');
  });

  it('devuelve guión cuando no hay inversión cargada', () => {
    // Un 0 acá se leería como "el evento fue gratis", que es lo contrario de "no sabemos".
    expect(formatInvestment(null, 'USD')).toBe('—');
    expect(formatInvestment(undefined, 'USD')).toBe('—');
  });

  it('sí muestra el cero cuando el cero es el dato', () => {
    expect(formatInvestment(0, 'USD')).toBe('USD 0');
  });
});

describe('costPerLead', () => {
  it('divide la inversión entre los leads', () => {
    expect(costPerLead(1500, 150)).toBe(10);
  });

  it('no calcula sin inversión cargada', () => {
    expect(costPerLead(null, 150)).toBeNull();
  });

  it('no divide por cero leads', () => {
    // Sin esto sería Infinity, y la pantalla mostraría "USD Infinity por lead".
    expect(costPerLead(1500, 0)).toBeNull();
    expect(costPerLead(1500, null)).toBeNull();
  });
});

describe('costPerSale', () => {
  it('divide la inversión entre los ganados', () => {
    expect(costPerSale(1500, 5)).toBe(300);
  });

  it('un evento con leads pero sin ventas no tiene costo por venta', () => {
    // Caso real: "Exhibición Acarigua Mango Center 2026" tenía 359 leads y 0 ganados.
    expect(costPerSale(1500, 0)).toBeNull();
  });

  it('no calcula sin inversión cargada', () => {
    expect(costPerSale(undefined, 5)).toBeNull();
  });
});

describe('formatEventDate', () => {
  it('no corre la fecha un día para atrás', () => {
    // `new Date('2026-08-26')` es medianoche UTC; en Venezuela (UTC-4) eso es el 25.
    expect(formatEventDate('2026-08-26')).toContain('26');
    expect(formatEventDate('2026-01-01')).toContain('2026');
  });

  it('devuelve vacío sin fecha', () => {
    expect(formatEventDate(null)).toBe('');
    expect(formatEventDate(undefined)).toBe('');
  });
});

describe('eventDateRange', () => {
  it('muestra el rango cuando son dos días distintos', () => {
    const range = eventDateRange('2026-08-26', '2026-08-28');
    expect(range).toContain('—');
    expect(range).toContain('26');
    expect(range).toContain('28');
  });

  it('muestra una sola fecha cuando empieza y termina el mismo día', () => {
    expect(eventDateRange('2026-08-26', '2026-08-26')).not.toContain('—');
  });

  it('muestra la fecha que haya cuando falta la otra', () => {
    expect(eventDateRange('2026-08-26', null)).toContain('26');
    expect(eventDateRange(null, '2026-08-28')).toContain('28');
  });

  it('lo dice cuando no hay ninguna', () => {
    expect(eventDateRange(null, null)).toBe('Sin fechas');
  });
});
