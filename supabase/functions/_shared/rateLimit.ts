// Rate limiting + lockout para endpoints de autenticación.
//
// Registra intentos en public.login_attempts (accesible solo por service role)
// y bloquea por IP y por identificador (factor hasheado, nunca en claro).
//
// Diseño defensivo: FALLA EN ABIERTO. Si la consulta de conteo o el insert
// fallan, permitimos el intento (nunca bloqueamos a un usuario legítimo por un
// error del limitador). El objetivo es frenar fuerza bruta, no ser un WAF.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

async function hashIdentifier(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface RateLimitOptions {
  ip: string;
  identifier?: string;
  kind: "pin" | "plate" | "magic";
  /** máximo de fallos por IP en la ventana antes de bloquear */
  ipMax?: number;
  /** máximo de fallos por identificador en la ventana antes de bloquear */
  identMax?: number;
  windowMinutes?: number;
}

/** true = bloqueado (demasiados intentos). Falla en abierto (false) ante error. */
export async function isRateLimited(
  admin: SupabaseClient,
  opts: RateLimitOptions,
): Promise<boolean> {
  const windowMinutes = opts.windowMinutes ?? 15;
  const ipMax = opts.ipMax ?? 15;
  const identMax = opts.identMax ?? 6;
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();

  try {
    // Fallos por IP en la ventana.
    const { count: ipFails, error: ipErr } = await admin
      .from("login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("kind", opts.kind)
      .eq("ip", opts.ip)
      .eq("success", false)
      .gte("created_at", since);
    if (!ipErr && (ipFails ?? 0) >= ipMax) return true;

    // Fallos por identificador (lockout por cuenta/placa/PIN).
    if (opts.identifier) {
      const idHash = await hashIdentifier(opts.identifier);
      const { count: identFails, error: idErr } = await admin
        .from("login_attempts")
        .select("id", { count: "exact", head: true })
        .eq("kind", opts.kind)
        .eq("identifier", idHash)
        .eq("success", false)
        .gte("created_at", since);
      if (!idErr && (identFails ?? 0) >= identMax) return true;
    }
  } catch (_err) {
    // Falla en abierto: no bloquear ante error del limitador.
    return false;
  }
  return false;
}

/** Registra un intento (éxito o fallo). Nunca lanza. */
export async function recordAttempt(
  admin: SupabaseClient,
  opts: { ip: string; identifier?: string; kind: "pin" | "plate" | "magic"; success: boolean },
): Promise<void> {
  try {
    const idHash = opts.identifier ? await hashIdentifier(opts.identifier) : null;
    await admin.from("login_attempts").insert({
      ip: opts.ip,
      identifier: idHash,
      kind: opts.kind,
      success: opts.success,
    });
  } catch (_err) {
    // Ignorar: registrar el intento no debe romper el login.
  }
}
