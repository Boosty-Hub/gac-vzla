// CORS con allowlist por variable de entorno.
//
// Configura `ALLOWED_ORIGINS` (separado por comas) con los orígenes de la app,
// p.ej.:  https://tu-dominio.com,http://localhost:8080
//
// Si NO está configurada, se mantiene el comportamiento permisivo (refleja el
// Origin) para no romper producción — se cierra el día que definas la variable,
// sin necesidad de redeploy del código.

const ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type";
const ALLOWED_METHODS = "POST, OPTIONS";

function allowlist(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = allowlist();

  let allowOrigin: string;
  if (allowed.length === 0) {
    // Sin allowlist: permisivo (interino). Refleja el origin o usa '*'.
    allowOrigin = origin || "*";
  } else if (origin && allowed.includes(origin)) {
    allowOrigin = origin;
  } else {
    // Origen no permitido: devolvemos el primero de la lista (no reflejamos el
    // origen atacante). El preflight fallará para orígenes no autorizados.
    allowOrigin = allowed[0];
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Vary": "Origin",
  };
}
