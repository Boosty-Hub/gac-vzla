/**
 * The ONE reservation status vocabulary. Every view must import from here.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The list below was duplicated across AdminReservas, DealershipReservas, DealershipPanel,
 * AdminHistorial, UserPortal and MonthlyReservationsCalendar. The copies drifted, and the
 * drift was not cosmetic — it produced a hard failure reported from production:
 *
 *   "Si voy a cambiar de 'En proceso' a 'Completada', en lugar de decir 'Completada' sale
 *    'Culminada' y arroja error al actualizar estado."
 *
 * The cause, measured against the live database on 2026-08-13:
 *
 *   reservations_status_check CHECK (status = ANY (ARRAY[
 *     'pendiente', 'confirmada', 'en_proceso', 'completada', 'cancelada'
 *   ]))
 *
 * AdminReservas and DealershipReservas defined a SECOND vocabulary for the "Incidencia" /
 * "Falla o Desperfecto" service types — `pendiente, agendada, en_proceso, culminado`.
 * `agendada` and `culminado` are not in that constraint, so selecting either one made the
 * UPDATE fail with a check-constraint violation. Row counts confirm it never once
 * succeeded: completada 465, confirmada 69, pendiente 47, en_proceso 28, cancelada 11,
 * and `agendada` / `culminado` ZERO.
 *
 * The two phantom states were also mapped in kommo-api (`agendada -> 101411323`, the SAME
 * stage as `confirmada`, and `culminado -> 142`, a 3-digit id where every real Post Venta
 * stage id is 9 digits). So `agendada` was never a distinct state to begin with, and
 * `culminado` pointed nowhere. Collapsing them onto `confirmada` / `completada` loses no
 * information and is what keeps the Kommo link intact.
 *
 * RULE: this vocabulary mirrors a database CHECK constraint. Adding a status here without
 * migrating that constraint re-creates the exact bug above.
 */

export const RESERVATION_STATUSES = [
  'pendiente',
  'confirmada',
  'en_proceso',
  'completada',
  'cancelada',
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export interface ReservationStatusStyle {
  label: string;
  color: string;
}

export const RESERVATION_STATUS_CONFIG: Record<ReservationStatus, ReservationStatusStyle> = {
  pendiente: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  confirmada: { label: 'Confirmada', color: 'bg-blue-100 text-blue-800' },
  en_proceso: { label: 'En Proceso', color: 'bg-purple-100 text-purple-800' },
  completada: { label: 'Completada', color: 'bg-green-100 text-green-800' },
  cancelada: { label: 'Cancelada', color: 'bg-red-100 text-red-800' },
};

/** Statuses that take an appointment out of the active worklist. */
export const ARCHIVED_RESERVATION_STATUSES: ReadonlySet<string> = new Set<string>([
  'completada',
  'cancelada',
]);

export function isReservationStatus(value: string | null | undefined): value is ReservationStatus {
  return !!value && (RESERVATION_STATUSES as readonly string[]).includes(value);
}

/**
 * Style for a status, never throwing on unknown input.
 *
 * Legacy rows and Kommo webhooks can still carry a value outside the vocabulary; those must
 * render as themselves rather than silently masquerading as "Pendiente", which is what the
 * previous per-view fallbacks did and is why the mismatch went unnoticed for so long.
 */
export function reservationStatusStyle(status: string | null | undefined): ReservationStatusStyle {
  if (isReservationStatus(status)) return RESERVATION_STATUS_CONFIG[status];
  return { label: status || 'Sin estado', color: 'bg-muted text-muted-foreground' };
}

export const RESERVATION_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  RESERVATION_STATUSES.map(s => [s, RESERVATION_STATUS_CONFIG[s].label]),
);

export const RESERVATION_STATUS_COLORS: Record<string, string> = Object.fromEntries(
  RESERVATION_STATUSES.map(s => [s, RESERVATION_STATUS_CONFIG[s].color]),
);
