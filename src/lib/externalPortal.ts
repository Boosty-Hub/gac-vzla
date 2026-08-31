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

/**
 * Panel de administración del portal (Configuración -> Portal Mi Flota).
 * Ver supabase/migrations/20260831150000_convenios_y_portal_externo.sql.
 */

export interface PortalSession {
  session_key: string;
  client_id: string;
  client_name: string | null;
  created_at: string;
  expires_at: string;
}

export interface PortalAttempt {
  id: number;
  plate: string;
  attempted_at: string;
}

const rpcNoParams = supabase.rpc as unknown as <T>(fn: string) =>
  Promise<{ data: T | null; error: { message: string } | null }>;

/** Prende/apaga el portal. Gatea con portal_externo.edit o superadmin/admin, del lado de la base. */
export async function setExternalPortalEnabled(enabled: boolean): Promise<void> {
  const { error } = await rpc<boolean>('set_external_portal_enabled', { p_enabled: enabled });
  if (error) throw new Error(error.message);
}

/** Sesiones vigentes (expires_at > now()). `session_key` es un hash, no el token real. */
export async function externalPortalAdminSessions(): Promise<PortalSession[]> {
  const { data, error } = await rpcNoParams<PortalSession[]>('external_portal_admin_sessions');
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Cierra una sesión por su session_key. Devuelve false si ya estaba vencida/no existía. */
export async function externalPortalCloseSession(sessionKey: string): Promise<boolean> {
  const { data, error } = await rpc<boolean>('external_portal_close_session', { p_session_key: sessionKey });
  if (error) throw new Error(error.message);
  return data ?? false;
}

/** Intentos fallidos recientes, más nuevo primero. */
export async function externalPortalAdminAttempts(limit = 50): Promise<PortalAttempt[]> {
  const { data, error } = await rpc<PortalAttempt[]>('external_portal_admin_attempts', { p_limit: limit });
  if (error) throw new Error(error.message);
  return data ?? [];
}
