import { supabase } from '@/integrations/supabase/client';

/**
 * Cliente tipado de las RPC del portal del cliente externo.
 *
 * Son funciones nuevas y `types.ts` no se regeneró, así que sin esto la página tendría que
 * castear a `any` en cada llamada. Ver supabase/migrations/20260811150000_external_portal.sql.
 */

export interface LoginRow {
  token: string | null;
  client_name: string | null;
  expires_at: string | null;
  /** null = entró. Si no: 'datos_incompletos' | 'demasiados_intentos' | 'no_encontrado'. */
  error_code: string | null;
}

export interface FleetVehicle {
  vehicle_id: string;
  plate: string | null;
  year: number;
  color: string | null;
  mileage: number;
  model_name: string;
  model_brand: string;
  warranty_active: boolean;
  last_service_date: string | null;
  services_count: number;
}

export interface ServiceRow {
  reservation_date: string;
  reservation_time: string;
  service_type: string;
  status: string;
  current_mileage: number;
  service_notes: string | null;
  dealership_name: string | null;
}

type Rpc = <T>(fn: string, params: Record<string, unknown>) =>
  Promise<{ data: T | null; error: { message: string } | null }>;

const rpc = supabase.rpc as unknown as Rpc;

/**
 * Valida placa + teléfono y abre una sesión de 8 horas.
 *
 * Nunca lanza por credenciales malas: la RPC devuelve una fila con `error_code`. Eso NO es
 * cosmético — la versión que rechazaba con `RAISE EXCEPTION` revertía, junto con la
 * excepción, el INSERT que registra el intento fallido, y el freno de fuerza bruta quedaba
 * de adorno (probado: el sexto intento entraba).
 */
export async function externalPortalLogin(plate: string, phone: string): Promise<LoginRow> {
  const { data, error } = await rpc<LoginRow[]>('external_portal_login', {
    p_plate: plate.trim(),
    p_phone: phone.trim(),
  });
  if (error) throw new Error(error.message);
  return data?.[0] ?? { token: null, client_name: null, expires_at: null, error_code: 'no_encontrado' };
}

/** Los vehículos del cliente de la sesión. Sin sesión vigente devuelve lista vacía. */
export async function externalPortalFleet(token: string): Promise<FleetVehicle[]> {
  const { data, error } = await rpc<FleetVehicle[]>('external_portal_fleet', { p_token: token });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Historial de UNO de sus vehículos. Un id ajeno devuelve vacío, lo valida la base. */
export async function externalPortalHistory(token: string, vehicleId: string): Promise<ServiceRow[]> {
  const { data, error } = await rpc<ServiceRow[]>('external_portal_history', {
    p_token: token,
    p_vehicle_id: vehicleId,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}
