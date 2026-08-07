import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function readKey(mapVariable: string, legacyVariable: string, singleVariable: string) {
  const legacyValue = Deno.env.get(legacyVariable);
  if (legacyValue) return legacyValue;

  const singleValue = Deno.env.get(singleVariable);
  if (singleValue) return singleValue;

  const mapValue = Deno.env.get(mapVariable);
  if (!mapValue) return null;

  try {
    const parsed = JSON.parse(mapValue) as Record<string, string>;
    return parsed.default || Object.values(parsed).find(Boolean) || null;
  } catch {
    return mapValue;
  }
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  try {
    const body = await request.json();
    const identifier = String(body?.identifier || '').trim().toLowerCase();
    const password = String(body?.password || '');

    if (!/^[a-z0-9_]{3,24}$/.test(identifier) || !password) {
      return json({ error: 'Usuario o contraseña incorrectos.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const secretKey = readKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
    const publishableKey = readKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY');

    if (!supabaseUrl || !secretKey || !publishableKey) {
      console.error('Faltan variables internas de Supabase para recetario-username-login.');
      return json({ error: 'La función no encuentra las claves internas de Supabase.' }, 503);
    }

    // Cliente administrativo: se ejecuta únicamente dentro de la Edge Function.
    // La secret/service_role jamás se envía al navegador.
    const admin = createClient(supabaseUrl, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

    const { data: account, error: accountError } = await admin
      .from('recetario_accounts')
      .select('id,is_active')
      .eq('username_normalized', identifier)
      .maybeSingle();

    if (accountError) {
      console.error('No se pudo consultar recetario_accounts.', {
        code: accountError.code,
        message: accountError.message,
        details: accountError.details,
        hint: accountError.hint
      });
      return json({
        error: 'No se puede consultar la tabla de usuarios del Recetario.',
        detail: accountError.message
      }, 503);
    }

    if (!account?.id || !account?.is_active) {
      return json({ error: 'Usuario o contraseña incorrectos.' }, 401);
    }

    const { data: userResult, error: userError } = await admin.auth.admin.getUserById(account.id);
    if (userError || !userResult?.user?.email) {
      console.error('No se pudo recuperar el usuario de Auth.', userError);
      return json({ error: 'Usuario o contraseña incorrectos.' }, 401);
    }

    // Cliente público separado para validar la contraseña exactamente igual que
    // un inicio de sesión normal de Supabase Auth.
    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

    const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
      email: userResult.user.email,
      password
    });

    if (signInError || !signInData?.session || !signInData?.user) {
      return json({ error: 'Usuario o contraseña incorrectos.' }, 401);
    }

    return json({
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
      expires_in: signInData.session.expires_in,
      token_type: signInData.session.token_type || 'bearer',
      user: {
        id: signInData.user.id,
        email: signInData.user.email,
        user_metadata: signInData.user.user_metadata || {}
      }
    });
  } catch (error) {
    console.error('Error inesperado en recetario-username-login.', error);
    return json({ error: 'No se pudo completar el inicio de sesión.' }, 500);
  }
});
