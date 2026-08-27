import { supabase } from '@/integrations/supabase/client';
import { extractEdgeError } from '@/lib/edgeError';

/**
 * Llamadas a las edge functions de administración con la sesión garantizada.
 *
 * EL PROBLEMA QUE RESUELVE (reporte del 2026-08-27: "Unauthorized: Invalid Token, no deja
 * crear usuarios"). `supabase.functions.invoke` manda el token que tiene cacheado. Los tokens
 * duran una hora, y cuando vencen `invoke` NO los renueva: manda el vencido igual. Peor: si ya
 * no hay sesión, manda la clave pública del proyecto en el lugar del token. La función recibe
 * algo que no es un JWT válido y responde `Unauthorized: invalid token` — un mensaje que
 * culpa al token cuando lo único que pasó es que al usuario se le venció la sesión con la
 * pantalla abierta. Reproducido contra producción: los dos casos dan exactamente ese error.
 *
 * `getSession()` sí renueva un token vencido antes de devolverlo, así que pedirlo primero
 * arregla el caso normal sin que el usuario se entere. Y cuando la sesión ya no se puede
 * recuperar, se le dice qué hacer en vez de mostrarle "Invalid".
 */

export const SESSION_EXPIRED_MESSAGE =
  'Tu sesión venció. Cerrá sesión, volvé a entrar y probá de nuevo.';

interface SessionLike {
  access_token?: string | null;
  /** Segundos desde epoch, como lo entrega Supabase. */
  expires_at?: number | null;
}

/**
 * ¿Hay que renovar antes de llamar?
 *
 * El margen existe porque un token que vence *mientras viaja* la petición falla igual que uno
 * ya vencido. Un minuto cubre de sobra la ida y vuelta.
 */
export function needsRefresh(
  session: SessionLike | null | undefined,
  nowMs: number,
  marginMs = 60_000,
): boolean {
  if (!session?.access_token) return true;
  if (!session.expires_at) return false;
  return session.expires_at * 1000 - nowMs < marginMs;
}

/** Un 401 de la función siempre significa lo mismo para quien está mirando la pantalla. */
export function isSessionError(message: string): boolean {
  return /invalid token|no authorization header|jwt expired|token is expired/i.test(message);
}

export interface AdminInvokeResult<T> {
  data: T | null;
  /** Mensaje listo para mostrar, o `null` si salió bien. */
  error: string | null;
  /** `true` cuando lo que falló fue la sesión y no la operación. */
  sessionExpired: boolean;
}

export async function invokeAdminFunction<T = Record<string, unknown>>(
  name: string,
  body: Record<string, unknown>,
  fallbackError = 'No se pudo completar la operación.',
): Promise<AdminInvokeResult<T>> {
  let token: string | null = null;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    token = session?.access_token ?? null;

    if (needsRefresh(session, Date.now())) {
      // Sin refresh token esto falla, y está bien: significa que hay que volver a entrar.
      const { data: renovada } = await supabase.auth.refreshSession();
      token = renovada.session?.access_token ?? token;
    }
  } catch {
    /* se cae al chequeo de abajo */
  }

  if (!token) {
    return { data: null, error: SESSION_EXPIRED_MESSAGE, sessionExpired: true };
  }

  // El header explícito no es decorativo: deja el token que ACABAMOS de validar, en vez del
  // que `invoke` tenga cacheado.
  const { data, error } = await supabase.functions.invoke<T>(name, {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) {
    const mensaje = await extractEdgeError(error, fallbackError);
    const deSesion = isSessionError(mensaje);
    return {
      data: null,
      error: deSesion ? SESSION_EXPIRED_MESSAGE : mensaje,
      sessionExpired: deSesion,
    };
  }

  return { data: (data as T) ?? null, error: null, sessionExpired: false };
}
