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
    const { plate } = await req.json();
    if (!plate || typeof plate !== "string") {
      return new Response(
        JSON.stringify({ error: "La placa es requerida" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedPlate = plate.trim().toUpperCase();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // 1. Look up vehicle by plate
    const { data: vehicle, error: vehicleError } = await adminClient
      .from("vehicles")
      .select("id, client_id, is_active")
      .eq("plate", normalizedPlate)
      .eq("is_active", true)
      .single();

    if (vehicleError || !vehicle) {
      return new Response(
        JSON.stringify({ error: "No se encontró un vehículo con esa placa" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Look up client
    const { data: client, error: clientError } = await adminClient
      .from("clients")
      .select("id, profile_id, full_name")
      .eq("id", vehicle.client_id)
      .eq("is_active", true)
      .maybeSingle();

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: "No se encontró un cliente asociado a este vehículo" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try profile_id from clients table, fallback to client_users table
    let profileId = client.profile_id;
    if (!profileId) {
      const { data: clientUser } = await adminClient
        .from("client_users")
        .select("profile_id")
        .eq("client_id", client.id)
        .limit(1)
        .maybeSingle();
      profileId = clientUser?.profile_id || null;
    }

    if (!profileId) {
      return new Response(
        JSON.stringify({ error: "Este cliente no tiene una cuenta de usuario vinculada. Contacte al administrador." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Get user email from auth
    const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(client.profile_id);
    if (userError || !userData?.user?.email) {
      return new Response(
        JSON.stringify({ error: "No se encontró la cuenta de usuario asociada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Generate a magic link to auto-login
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

    return new Response(
      JSON.stringify({
        token_hash: linkData.properties.hashed_token,
        email: userData.user.email,
        client_name: client.full_name,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
