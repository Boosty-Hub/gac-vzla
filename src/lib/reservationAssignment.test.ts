import { describe, it, expect } from 'vitest';
import { resolveReservationAssignment } from './reservationAssignment';

describe('resolveReservationAssignment', () => {
  it('links the vehicle (and its client) when a vehicle was selected by plate — the reported bug', () => {
    const result = resolveReservationAssignment({
      vehicle: { id: 'veh-1', client_id: 'cli-1' },
      clientId: null,
      walkinName: '',
      walkinPhone: '',
      walkinPlate: '',
    });
    expect(result).toEqual({
      vehicle_id: 'veh-1',
      client_id: 'cli-1',
      walkin_client_name: null,
      walkin_client_phone: null,
      walkin_plate: null,
    });
  });

  it('a selected vehicle always wins over a separately selected client', () => {
    const result = resolveReservationAssignment({
      vehicle: { id: 'veh-9', client_id: 'cli-from-vehicle' },
      clientId: 'cli-other',
      walkinName: 'Ignored',
      walkinPhone: '123',
      walkinPlate: 'XYZ',
    });
    expect(result.vehicle_id).toBe('veh-9');
    expect(result.client_id).toBe('cli-from-vehicle');
    expect(result.walkin_client_name).toBeNull();
    expect(result.walkin_plate).toBeNull();
  });

  it('links only the client (no vehicle) when a client was selected without a vehicle', () => {
    const result = resolveReservationAssignment({
      vehicle: null,
      clientId: 'cli-2',
      walkinName: '',
      walkinPhone: '',
      walkinPlate: '',
    });
    expect(result).toEqual({
      vehicle_id: null,
      client_id: 'cli-2',
      walkin_client_name: null,
      walkin_client_phone: null,
      walkin_plate: null,
    });
  });

  it('falls back to walk-in fields when nothing is registered, trimming and upper-casing the plate', () => {
    const result = resolveReservationAssignment({
      vehicle: null,
      clientId: null,
      walkinName: '  Juan Perez  ',
      walkinPhone: ' +58 412 ',
      walkinPlate: ' ab12cd ',
    });
    expect(result).toEqual({
      vehicle_id: null,
      client_id: null,
      walkin_client_name: 'Juan Perez',
      walkin_client_phone: '+58 412',
      walkin_plate: 'AB12CD',
    });
  });

  it('returns all-null when there is no selection and no walk-in data', () => {
    const result = resolveReservationAssignment({
      vehicle: null,
      clientId: null,
      walkinName: '   ',
      walkinPhone: '',
      walkinPlate: '',
    });
    expect(result).toEqual({
      vehicle_id: null,
      client_id: null,
      walkin_client_name: null,
      walkin_client_phone: null,
      walkin_plate: null,
    });
  });
});
