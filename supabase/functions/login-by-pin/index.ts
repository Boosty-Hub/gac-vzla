import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getClientIp, isRateLimited, recordAttempt } from "../_shared/rateLimit.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const ip = getClientIp(req);
    const { pin } = await req.json();

    // Acepta 4 a 8 dígitos (permite migrar a PIN más largo sin cambiar el código).
    if (!pin || typeof pin !== "string" || !/^\d{4,8}$/.test(pin)) {
      return json({ error: "El código PIN debe ser de 4 a 8 dígitos" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Rate limiting: bloquea fuerza bruta por IP y por PIN.
    if (await isRateLimited(adminClient, { ip, identifier: pin, kind: "pin" })) {
      return json(
        { error: "Demasiados intentos. Espera unos minutos e intenta de nuevo." },
        429,
      );
    }

    // 1. Buscar perfil por pin_code
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, full_name, email, is_active")
      .eq("pin_code", pin)
      .eq("is_active", true)
      .maybeSingle();

    if (profileError || !profile) {
      await recordAttempt(adminClient, { ip, identifier: pin, kind: "pin", success: false });
      return json({ error: "Código PIN no válido" }, 404);
    }

    // 2. Obtener email del usuario
    const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(profile.id);
    if (userError || !userData?.user?.email) {
      await recordAttempt(adminClient, { ip, identifier: pin, kind: "pin", success: false });
      return json({ error: "No se encontró la cuenta de usuario" }, 404);
    }

    // 3. Generar magic link para auto-login
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: userData.user.email,
    });

    if (linkError || !linkData) {
      console.error("Generate link error:", linkError);
      return json({ error: "Error al generar sesión" }, 500);
    }

    await recordAttempt(adminClient, { ip, identifier: pin, kind: "pin", success: true });

    return json({
      token_hash: linkData.properties.hashed_token,
      email: userData.user.email,
      user_name: profile.full_name,
    });
  } catch (err) {
    console.error("Error:", err);
    return json({ error: "Error interno del servidor" }, 500);
  }
});
