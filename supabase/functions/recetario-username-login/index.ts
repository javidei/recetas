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

async function responseMessage(response: Response) {
  try {
    const body = await response.clone().json();
    return String(body?.message || body?.msg || body?.error_description || body?.error || '').trim();
  } catch {
    return (await response.clone().text()).trim();
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

    const profileUrl = new URL(`${supabaseUrl}/rest/v1/recetario_accounts`);
    profileUrl.searchParams.set('select', 'id,is_active');
    profileUrl.searchParams.set('username_normalized', `eq.${identifier}`);
    profileUrl.searchParams.set('limit', '1');

    const profileResponse = await fetch(profileUrl, {
      headers: { apikey: secretKey, Accept: 'application/json' }
    });

    if (!profileResponse.ok) {
      console.error('No se pudo consultar recetario_accounts.', {
        status: profileResponse.status,
        detail: await responseMessage(profileResponse)
      });
      return json({ error: 'No se puede consultar la tabla de usuarios del Recetario.' }, 503);
    }

    const profiles = await profileResponse.json();
    const account = Array.isArray(profiles) ? profiles[0] : null;
    if (!account?.id || !account?.is_active) return json({ error: 'Usuario o contraseña incorrectos.' }, 401);

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(account.id)}`, {
      headers: { apikey: secretKey, Accept: 'application/json' }
    });

    if (!userResponse.ok) return json({ error: 'Usuario o contraseña incorrectos.' }, 401);
    const userResult = await userResponse.json();
    const email = userResult?.email || userResult?.user?.email;
    if (!email) return json({ error: 'Usuario o contraseña incorrectos.' }, 401);

    const signInResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    if (!signInResponse.ok) return json({ error: 'Usuario o contraseña incorrectos.' }, 401);
    const signInData = await signInResponse.json();
    if (!signInData?.access_token || !signInData?.refresh_token) {
      return json({ error: 'Usuario o contraseña incorrectos.' }, 401);
    }

    return json({
      access_token: signInData.access_token,
      refresh_token: signInData.refresh_token,
      expires_in: signInData.expires_in,
      token_type: signInData.token_type,
      user: {
        id: signInData.user?.id,
        email: signInData.user?.email,
        user_metadata: signInData.user?.user_metadata || {}
      }
    });
  } catch (error) {
    console.error('Error inesperado en recetario-username-login.', error);
    return json({ error: 'No se pudo completar el inicio de sesión.' }, 500);
  }
});
