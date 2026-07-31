/**
 * Spanish-language message helpers for the WonProspectDialog / `register_won_prospect`
 * flow. Split out from the dialog component itself so both AdminProspectos.tsx and
 * DealershipProspectos.tsx can reuse them without triggering a
 * `react-refresh/only-export-components` warning on the dialog module.
 */

const MIN_YEAR = 1980;
const MAX_YEAR = new Date().getFullYear() + 2;

/**
 * Maps the verbatim exception names raised by `register_won_prospect`'s validation pass
 * (confirmed against the migration author) to readable Spanish. Several carry a `%`
 * interpolation suffix (e.g. `model_id_not_found: <uuid>`), so this matches on the prefix
 * before the colon rather than full string equality — never surfaces raw Postgres text.
 */
export function translateRegisterWonProspectError(rawMessage: string | null | undefined): string {
  const message = (rawMessage || '').trim();
  if (message.startsWith('prospect_not_found')) {
    return 'No se encontró el prospecto. Actualiza la página e inténtalo de nuevo.';
  }
  if (message.startsWith('not_authorized')) {
    return 'No tienes permiso para registrar esta venta.';
  }
  if (message.startsWith('at_least_one_vehicle_required')) {
    return 'Agrega al menos un vehículo con placa, modelo y año.';
  }
  if (message.startsWith('invalid_vehicle_entry')) {
    return 'Uno de los vehículos tiene datos inválidos. Revisa la lista e inténtalo de nuevo.';
  }
  if (message.startsWith('plate_required_for_every_vehicle')) {
    return 'Todos los vehículos deben tener placa.';
  }
  if (message.startsWith('model_id_required_for_every_vehicle')) {
    return 'Todos los vehículos deben tener un modelo seleccionado.';
  }
  if (message.startsWith('year_required_for_every_vehicle')) {
    return 'Todos los vehículos deben tener el año indicado.';
  }
  if (message.startsWith('invalid_model_id')) {
    return 'Uno de los modelos seleccionados no es válido.';
  }
  if (message.startsWith('model_id_not_found')) {
    return 'Uno de los modelos seleccionados ya no existe. Actualiza la lista e inténtalo de nuevo.';
  }
  if (message.startsWith('invalid_year')) {
    return 'Uno de los años ingresados no es válido.';
  }
  if (message.startsWith('year_out_of_range')) {
    return `Uno de los años está fuera de rango (debe estar entre ${MIN_YEAR} y ${MAX_YEAR}).`;
  }
  return 'No se pudo registrar la venta. Inténtalo de nuevo o contacta a soporte.';
}

// Note: `suppressed_reason` (creation-time 24h gate) and delivery `skipped` reasons share
// the same vocabulary (`rate_limited_24h`, etc.), so both are described with
// `describeSkippedDelivery` from `@/components/clients/surveyDelivery` — the helper the
// resend button / repurchase flow already established — rather than a second, slightly
// different wording defined here.
