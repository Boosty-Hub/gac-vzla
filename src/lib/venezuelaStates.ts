// Canonical list of Venezuela's states, shared by every state picker in the
// app (clients, dealerships, prospects, reservations). Uses 'Distrito Capital'
// as the canonical name for the capital region — not 'Caracas', which is a
// city, not a state.
export const VENEZUELA_STATES = [
  'Amazonas', 'Anzoátegui', 'Apure', 'Aragua', 'Barinas', 'Bolívar', 'Carabobo',
  'Cojedes', 'Delta Amacuro', 'Dependencias Federales', 'Distrito Capital',
  'Falcón', 'Guárico', 'Lara', 'Mérida', 'Miranda', 'Monagas', 'Nueva Esparta',
  'Portuguesa', 'Sucre', 'Táchira', 'Trujillo', 'Vargas', 'Yaracuy', 'Zulia',
];

/**
 * Resolves the effective "Estado de Venezuela" for a reservation.
 *
 * `reservations.state` is nullable: null means "inherit from the reservation's
 * dealership" and a non-null value is an explicit user override. This is the
 * single resolution rule shared by the reservation forms (admin + dealership
 * portals). The Kommo sync (supabase/functions/kommo-api/index.ts) carries an
 * equivalent inline copy of this rule, since edge functions are deployed
 * standalone and cannot import from src/.
 */
export function resolveReservationState(
  reservationState: string | null | undefined,
  dealershipState: string | null | undefined,
): string | null {
  return reservationState || dealershipState || null;
}
