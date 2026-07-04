import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getClientIp, isRateLimited, recordAttempt } from "../_shared/rateLimit.ts";

// Normaliza una cédula para comparar: solo alfanuméricos, mayúsculas.
// "V-12.345.678" y "v12345678" → "V12345678".
function normalizeCedula(v: string): string {
  return v.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

// Compara cédulas de forma tolerante (con y sin prefijo de letra).
function cedulaMatches(input: string, stored: string): boolean {
  const a = normalizeCedula(input);
  const b = normalizeCedula(stored);
  if (!a || !b) return false;
  if (a === b) return true;
  // Fallback: comparar solo dígitos (por si uno tiene prefijo V/E y el otro no).
  const da = a.replace(/\D/g, "");
  const db = b.replace(/\D/g, "");
  return da.length > 0 && da === db;
}

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
    const { plate, cedula } = await req.json();

    if (!plate || typeof plate !== "string") {
      return json({ error: "La placa es requerida" }, 400);
    }
    if (!cedula || typeof cedula !== "string" || normalizeCedula(cedula).length < 4) {
      return json({ error: "La cédula del titular es requerida" }, 400);
    }

    const normalizedPlate = plate.trim().toUpperCase();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Rate limiting por IP y por placa.
    if (await isRateLimited(adminClient, { ip, identifier: normalizedPlate, kind: "plate" })) {
      return json(
        { error: "Demasiados intentos. Espera unos minutos e intenta de nuevo." },
        429,
      );
    }

    // Mensaje genérico para no revelar si falló la placa o la cédula (anti-oráculo).
    const invalidResponse = () =>
      json({ error: "Placa o cédula incorrecta" }, 404);

    // 1. Buscar vehículo por placa
    const { data: vehicle, error: vehicleError } = await adminClient
      .from("vehicles")
      .select("id, client_id, is_active")
      .eq("plate", normalizedPlate)
      .eq("is_active", true)
      .maybeSingle();

    if (vehicleError || !vehicle) {
      await recordAttempt(adminClient, { ip, identifier: normalizedPlate, kind: "plate", success: false });
      return invalidResponse();
    }

    // 2. Buscar cliente y VERIFICAR la cédula (segundo factor).
    const { data: client, error: clientError } = await adminClient
      .from("clients")
      .select("id, profile_id, full_name, email, phone, cedula")
      .eq("id", vehicle.client_id)
      .eq("is_active", true)
      .maybeSingle();

    if (clientError || !client || !client.cedula || !cedulaMatches(cedula, client.cedula)) {
      await recordAttempt(adminClient, { ip, identifier: normalizedPlate, kind: "plate", success: false });
      return invalidResponse();
    }

    // 3. Resolver profile_id — clients, luego client_users, luego auto-crear.
    //    La auto-creación ahora está protegida: solo ocurre tras validar
    //    placa + cédula del titular legítimo.
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
      const autoEmail = client.email || `cliente-${client.id}@imb-movilidad.auto`;
      const autoPassword = crypto.randomUUID();

      const { data: clienteRole } = await adminClient
        .from("roles")
        .select("id")
        .eq("name", "cliente")
        .maybeSingle();

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: autoEmail,
        password: autoPassword,
        email_confirm: true,
        user_metadata: { full_name: client.full_name },
      });

      if (createError || !newUser?.user) {
        console.error("Error creating auth user:", createError);
        return json({ error: "Error al crear cuenta de acceso para el cliente" }, 500);
      }

      profileId = newUser.user.id;

      await adminClient
        .from("clients")
        .update({ profile_id: profileId, email: autoEmail })
        .eq("id", client.id);

      await adminClient
        .from("client_users")
        .insert({ client_id: client.id, profile_id: profileId });

      if (clienteRole?.id) {
        await adminClient
          .from("profiles")
          .update({ role_id: clienteRole.id, full_name: client.full_name })
          .eq("id", profileId);
      }

      console.log(`Auto-created auth account for client ${client.full_name} (${client.id})`);
    }

    // 4. Obtener email del usuario
    const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(profileId);
    if (userError || !userData?.user?.email) {
      await recordAttempt(adminClient, { ip, identifier: normalizedPlate, kind: "plate", success: false });
      return json({ error: "No se encontró la cuenta de usuario asociada" }, 404);
    }

    // 5. Generar magic link para auto-login
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: userData.user.email,
    });

    if (linkError || !linkData) {
      console.error("Generate link error:", linkError);
      return json({ error: "Error al generar sesión" }, 500);
    }

    await recordAttempt(adminClient, { ip, identifier: normalizedPlate, kind: "plate", success: true });

    return json({
      token_hash: linkData.properties.hashed_token,
      email: userData.user.email,
      client_name: client.full_name,
    });
  } catch (err) {
    console.error("Error:", err);
    return json({ error: "Error interno del servidor" }, 500);
  }
});
