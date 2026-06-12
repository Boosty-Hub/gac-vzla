/**
 * Resolves which client/vehicle (or walk-in) columns a reservation/incidencia
 * should be saved with, from the unified search selection state.
 *
 * Precedence: a selected vehicle (resolved by plate or from the client's list)
 * always wins and carries its own client_id; otherwise a client selected without
 * a vehicle; otherwise manual walk-in data. Setting one representation clears the
 * others so reassigning stays consistent.
 *
 * Shared by both the normal-reservation and the incidencia (Falla o Desperfecto)
 * save paths so the plate→vehicle link is persisted identically in both.
 */
export interface ReservationSelection {
  /** A resolved vehicle (e.g. picked by plate) plus the client it belongs to. */
  vehicle: { id: string; client_id: string } | null;
  /** A client selected without choosing a specific vehicle. */
  clientId: string | null;
  walkinName: string;
  walkinPhone: string;
  walkinPlate: string;
}

export interface ReservationAssignment {
  vehicle_id: string | null;
  client_id: string | null;
  walkin_client_name: string | null;
  walkin_client_phone: string | null;
  walkin_plate: string | null;
}

export function resolveReservationAssignment(sel: ReservationSelection): ReservationAssignment {
  if (sel.vehicle) {
    return {
      vehicle_id: sel.vehicle.id,
      client_id: sel.vehicle.client_id,
      walkin_client_name: null,
      walkin_client_phone: null,
      walkin_plate: null,
    };
  }
  if (sel.clientId) {
    return {
      vehicle_id: null,
      client_id: sel.clientId,
      walkin_client_name: null,
      walkin_client_phone: null,
      walkin_plate: null,
    };
  }
  return {
    vehicle_id: null,
    client_id: null,
    walkin_client_name: sel.walkinName.trim() || null,
    walkin_client_phone: sel.walkinPhone.trim() || null,
    walkin_plate: sel.walkinPlate.trim().toUpperCase() || null,
  };
}
