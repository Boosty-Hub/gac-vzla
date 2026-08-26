/**
 * Números del módulo de Eventos: inversión, costo por lead y costo por venta.
 *
 * Viven fuera de la pantalla porque son la única parte del módulo que puede estar mal sin que
 * se note. Un conteo equivocado se ve; un "USD 0 por venta" cuando nadie cargó la inversión se
 * lee como un evento gratis y decide dónde se pone la plata del mes.
 *
 * REGLA: si falta el dato, se devuelve `null` y la pantalla muestra un guión. Nunca 0.
 * Cero es un número, y acá significaría "no costó nada" — que es lo contrario de "no sabemos".
 */

/** Formatea un monto con su moneda, o un guión cuando no hay dato. */
export const formatInvestment = (value: number | null | undefined, currency: string): string => {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${currency} ${value.toLocaleString('es-VE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
};

/**
 * Cuánto costó cada lead. `null` cuando no hay inversión cargada o el evento no trajo leads
 * — dividir por cero da Infinity, y "USD Infinity por lead" no es una respuesta.
 */
export const costPerLead = (
  investment: number | null | undefined,
  leads: number | null | undefined,
): number | null => {
  if (investment == null || !Number.isFinite(investment)) return null;
  if (!leads || leads <= 0) return null;
  return investment / leads;
};

/** Cuánto costó cada venta. Mismo criterio: sin ganados no hay costo por venta, hay incógnita. */
export const costPerSale = (
  investment: number | null | undefined,
  won: number | null | undefined,
): number | null => {
  if (investment == null || !Number.isFinite(investment)) return null;
  if (!won || won <= 0) return null;
  return investment / won;
};

/**
 * Rango legible del evento.
 *
 * Las fechas llegan como 'YYYY-MM-DD' (columna `date`). Se les pega el mediodía a propósito:
 * `new Date('2026-08-26')` se interpreta como UTC y en Venezuela (UTC-4) muestra el día
 * ANTERIOR. Un evento del 26 apareciendo como 25 es el tipo de error que nadie reporta y
 * todos desconfían.
 */
export const formatEventDate = (value: string | null | undefined): string => {
  if (!value) return '';
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-VE', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

export const eventDateRange = (
  start: string | null | undefined,
  end: string | null | undefined,
): string => {
  if (!start && !end) return 'Sin fechas';
  if (start && end && start !== end) return `${formatEventDate(start)} — ${formatEventDate(end)}`;
  return formatEventDate(start || end);
};
