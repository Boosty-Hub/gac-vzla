import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getClientIp, isRateLimited, recordAttempt } from "../_shared/rateLimit.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ip = getClientIp(req);
    const { token } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ error: "Token es requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Rate limiting por IP (frena enumeración de tokens).
    if (await isRateLimited(adminClient, { ip, kind: "magic", ipMax: 30 })) {
      return new Response(
        JSON.stringify({ error: "Demasiados intentos. Espera unos minutos." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar el magic link: no usado y no revocado.
    const { data: magicLink, error: findError } = await adminClient
      .from("magic_links")
      .select("*")
      .eq("token", token)
      .is("used_at", null)
      .is("revoked_at", null)
      .single();

    if (findError || !magicLink) {
      await recordAttempt(adminClient, { ip, kind: "magic", success: false });
      return new Response(
        JSON.stringify({ error: "Link inválido, revocado o ya fue utilizado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check expiry
    if (new Date(magicLink.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Este link ha expirado" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the user's email
    const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(magicLink.user_id);
    if (userError || !userData?.user?.email) {
      return new Response(
        JSON.stringify({ error: "Usuario no encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate a fresh Supabase magic link (short-lived) to complete auth
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: userData.user.email,
    });

    if (linkError || !linkData) {
      console.error("Generate link error:", linkError);
      return new Response(
        JSON.stringify({ error: "Error al generar sesión" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // No se marca como usado — el link de portal es reutilizable hasta expirar
    // (o hasta que un admin lo revoque vía revoked_at).
    await recordAttempt(adminClient, { ip, kind: "magic", success: true });

    return new Response(
      JSON.stringify({
        token_hash: linkData.properties.hashed_token,
        email: userData.user.email,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
