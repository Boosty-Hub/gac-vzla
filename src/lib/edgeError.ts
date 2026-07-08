// supabase.functions.invoke() rejects a non-2xx response with a FunctionsHttpError
// whose generic message is the opaque "Edge Function returned a non-2xx status code".
// The real payload (e.g. { error: "..." }) lives in error.context, which is the raw
// Response. This helper surfaces that real message so users see the actual cause
// (duplicate email, validation error, etc.) instead of the generic string.

const KNOWN_MESSAGES: Record<string, string> = {
  'A user with this email address has already been registered':
    'Ya existe un usuario registrado con ese correo.',
};

function translate(message: string): string {
  return KNOWN_MESSAGES[message] ?? message;
}

export async function extractEdgeError(
  error: unknown,
  fallback = 'Ocurrió un error inesperado.',
): Promise<string> {
  try {
    const ctx = (error as { context?: { json?: () => Promise<unknown> } })?.context;
    if (ctx && typeof ctx.json === 'function') {
      const body = (await ctx.json()) as { error?: string } | null;
      if (body?.error) return translate(body.error);
    }
  } catch {
    /* body was not JSON — fall through to the message/fallback */
  }
  const message = (error as { message?: string })?.message;
  if (message && !/non-2xx status code/i.test(message)) return translate(message);
  return fallback;
}
