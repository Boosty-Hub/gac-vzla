export interface SelectableVehicle {
  id: string;
  plate?: string | null;
}

/**
 * Decide which vehicle to auto-select for a reservation.
 *
 * Priority:
 * 1. Exact plate match (case-insensitive, trimmed) wins.
 * 2. Otherwise, if there is exactly one vehicle, pick it.
 * 3. Otherwise return null — the user must choose manually.
 */
export function resolveAutoVehicle<T extends SelectableVehicle>(
  vehicles: T[],
  plateHint?: string | null,
): T | null {
  if (vehicles.length === 0) return null;

  if (plateHint) {
    const normalizedHint = plateHint.trim().toLowerCase();
    const match = vehicles.find(
      (v) => v.plate != null && v.plate.trim().toLowerCase() === normalizedHint,
    );
    if (match) return match;
  }

  if (vehicles.length === 1) return vehicles[0];

  return null;
}
