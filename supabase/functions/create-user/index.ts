import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    // New API keys (sb_secret / sb_publishable) with legacy fallback. The legacy
    // anon/service_role JWT keys were disabled during the July 2026 key migration,
    // so these must resolve the new keys first or every admin call 401s.
    const serviceRoleKey = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SB_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');

    // Verify caller is admin using their JWT
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized: invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if caller is admin
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerProfile } = await adminClient.from('profiles').select('role_id, roles(name)').eq('id', caller.id).single();
    const callerRole = callerProfile?.roles?.name;
    if (callerRole !== 'superadmin' && callerRole !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse request body
    // `pin_code` y `phone` NO se leian aca. El panel los mandaba, esta funcion los
    // descartaba en silencio y el perfil quedaba sin telefono y sin PIN: por eso habia que
    // crear el usuario, volver a entrar y cargarlos otra vez a mano.
    const { email, password, full_name, role_id, dealership_id, pin_code, phone } = await req.json();
    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Email and password are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create user with admin API
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || '' }
    });
    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Update profile with full_name, role_id, pin_code and phone
    if (newUser?.user) {
      const updates: Record<string, unknown> = {};
      if (full_name) updates.full_name = full_name;
      if (role_id) updates.role_id = role_id;
      if (pin_code) updates.pin_code = pin_code;
      if (phone) updates.phone = phone;
      if (Object.keys(updates).length > 0) {
        const { error: profileError } = await adminClient
          .from('profiles').update(updates).eq('id', newUser.user.id);
        // El usuario de auth YA existe en este punto. Borrarlo por un PIN repetido seria
        // peor: el admin perderia la contrasena que acaba de definir. Se devuelve 200 con
        // un aviso para que el panel diga que falta corregir, no que fallo todo.
        if (profileError) {
          const duplicatePin = String(profileError.code) === '23505';
          return new Response(JSON.stringify({
            user: newUser.user,
            user_id: newUser.user.id,
            warning: duplicatePin
              ? 'El usuario se creo, pero el PIN ya lo tiene otro usuario y no se guardo. Edita el usuario y elige otro PIN.'
              : 'El usuario se creo, pero no se pudieron guardar todos sus datos. Revisalos desde Editar.',
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
      // If dealership_id is provided, create dealership_users link
      if (dealership_id) {
        await adminClient.from('dealership_users').insert({
          dealership_id,
          profile_id: newUser.user.id
        });
      }
    }

    // `user_id` en la raiz: el panel lo usa para enlazar los concesionarios extra de un
    // vendedor. Antes solo se devolvia `user`, asi que ese `data?.user_id` era undefined y
    // los concesionarios a partir del segundo se perdian sin avisar.
    return new Response(JSON.stringify({ user: newUser.user, user_id: newUser.user?.id ?? null }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
