/**
 * Recurrent client rule (business decision).
 *
 * A recurrent client is ANY client that owns more than one vehicle. Companies
 * and fleets (cédula J/G/C) are intentionally INCLUDED — the business wants them
 * flagged as recurrent too, not only natural persons.
 */
export function isRecurrentClient(client: {
  cedula?: string | null;
  vehicleCount: number;
}): boolean {
  return client.vehicleCount > 1;
}
