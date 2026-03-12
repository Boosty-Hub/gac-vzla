import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    // Find the magic link
    const { data: magicLink, error: findError } = await adminClient
      .from("magic_links")
      .select("*")
      .eq("token", token)
      .is("used_at", null)
      .single();

    if (findError || !magicLink) {
      return new Response(
        JSON.stringify({ error: "Link inválido o ya fue utilizado" }),
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

    // Don't mark as used — allow reuse until expiry
    // The magic link acts as a persistent access token

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
