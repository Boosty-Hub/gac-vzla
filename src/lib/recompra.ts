/**
 * Recurrent client rule (business decision).
 *
 * A recurrent client is a natural person who owns more than one vehicle.
 * Venezuelan non-natural entities are excluded from the recurrent-client
 * definition because they represent fleets/organizations, not individuals:
 *   - J: persona jurídica (legal entity / company)
 *   - G: ente gubernamental (government body)
 *   - C: consejo comunal (communal council)
 * Natural persons use V (venezolano), E (extranjero) or P (pasaporte); a null,
 * empty or digit-leading cédula is also treated as a natural person.
 */
const NON_NATURAL_ENTITY_PREFIXES = ['J', 'G', 'C'];

export function isRecurrentClient(client: {
  cedula?: string | null;
  vehicleCount: number;
}): boolean {
  if (client.vehicleCount <= 1) return false;

  const cedula = (client.cedula ?? '').trim();
  const prefix = cedula.charAt(0).toUpperCase();
  const isNonNaturalEntity = NON_NATURAL_ENTITY_PREFIXES.includes(prefix);

  return !isNonNaturalEntity;
}
