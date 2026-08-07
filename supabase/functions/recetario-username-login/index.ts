import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const MAX_ACTIVE_ACCOUNTS = 25;
const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;

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

function sessionPayload(session: any, user: any) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    token_type: session.token_type || 'bearer',
    user: {
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata || {}
    }
  };
}

async function signIn(authClient: any, email: string, password: string) {
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error || !data?.session || !data?.user) return null;
  return sessionPayload(data.session, data.user);
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  try {
    const body = await request.json();
    const action = String(body?.action || 'login').trim().toLowerCase();
    const identifier = String(body?.identifier || '').trim().toLowerCase();
    const password = String(body?.password || '');

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const secretKey = readKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
    const publishableKey = readKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY');

    if (!supabaseUrl || !secretKey || !publishableKey) {
      console.error('Faltan variables internas de Supabase para recetario-username-login.');
      return json({ error: 'La función no encuentra las claves internas de Supabase.' }, 503);
    }

    const admin = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });

    if (action === 'register') {
      const displayName = String(body?.displayName || '').trim();
      const username = String(body?.username || '').trim().toLowerCase();
      const email = String(body?.email || '').trim().toLowerCase();

      if (!displayName || displayName.length > 60) {
        return json({ error: 'Indica un nombre válido.' }, 400);
      }
      if (!USERNAME_PATTERN.test(username)) {
        return json({ error: 'El usuario debe tener entre 3 y 24 caracteres: letras minúsculas, números o guion bajo.' }, 400);
      }
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        return json({ error: 'El correo electrónico no es válido.' }, 400);
      }
      if (password.length < 6) {
        return json({ error: 'La contraseña debe tener al menos 6 caracteres.' }, 400);
      }

      const { count: activeCount, error: countError } = await admin
        .from('recetario_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true);
      if (countError) {
        console.error('No se pudo contar recetario_accounts.', countError);
        return json({ error: 'No se pudo comprobar el número de cuentas activas.' }, 503);
      }
      if (Number(activeCount || 0) >= MAX_ACTIVE_ACCOUNTS) {
        return json({ error: `El Recetario ha alcanzado el máximo actual de ${MAX_ACTIVE_ACCOUNTS} cuentas activas.` }, 409);
      }

      const { data: usernameOwner, error: usernameError } = await admin
        .from('recetario_accounts')
        .select('id')
        .eq('username_normalized', username)
        .maybeSingle();
      if (usernameError) return json({ error: 'No se pudo comprobar el nombre de usuario.' }, 503);
      if (usernameOwner?.id) return json({ error: 'Ese nombre de usuario ya está registrado.' }, 409);

      // Primero intentamos crear un usuario nuevo ya confirmado. Al usar admin.createUser
      // no se envía email de confirmación y, por tanto, no se consume el rate limit de emails.
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName, username, app: 'recetario' }
      });

      if (!createError && created?.user) {
        const logged = await signIn(authClient, email, password);
        if (!logged) return json({ error: 'La cuenta se creó, pero no se pudo iniciar sesión automáticamente.' }, 500);
        return json(logged);
      }

      const duplicateEmail = /already|registered|exists|duplicate/i.test(String(createError?.message || ''));
      if (!duplicateEmail) {
        console.error('No se pudo crear el usuario del Recetario.', createError);
        return json({ error: createError?.message || 'No se pudo crear la cuenta.' }, 400);
      }

      // Supabase Auth es compartido por varios proyectos. Si ese email ya existe,
      // comprobamos la contraseña. Si es realmente la misma persona, reutilizamos
      // su usuario Auth y le añadimos únicamente una cuenta de El Recetario.
      const existingLogin = await signIn(authClient, email, password);
      if (!existingLogin?.user?.id) {
        return json({ error: 'Ese correo ya está registrado. Usa su contraseña correcta o utiliza otro correo.' }, 409);
      }

      const { data: existingAccount } = await admin
        .from('recetario_accounts')
        .select('id,is_active')
        .eq('id', existingLogin.user.id)
        .maybeSingle();
      if (existingAccount?.id) {
        return json({ error: 'Ese correo ya tiene una cuenta en El Recetario.' }, 409);
      }

      const { error: insertError } = await admin.from('recetario_accounts').insert({
        id: existingLogin.user.id,
        display_name: displayName,
        username,
        email,
        role: 'member',
        is_active: true
      });
      if (insertError) {
        console.error('No se pudo vincular el usuario Auth existente al Recetario.', insertError);
        if (/username|unique|duplicate|23505/i.test(insertError.message)) {
          return json({ error: 'Ese nombre de usuario ya está registrado.' }, 409);
        }
        return json({ error: 'No se pudo crear la cuenta del Recetario.' }, 500);
      }

      return json(existingLogin);
    }

    if (!USERNAME_PATTERN.test(identifier) || !password) {
      return json({ error: 'Usuario o contraseña incorrectos.' }, 401);
    }

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
      return json({ error: 'No se puede consultar la tabla de usuarios del Recetario.', detail: accountError.message }, 503);
    }

    if (!account?.id || !account?.is_active) {
      return json({ error: 'Usuario o contraseña incorrectos.' }, 401);
    }

    const { data: userResult, error: userError } = await admin.auth.admin.getUserById(account.id);
    if (userError || !userResult?.user?.email) {
      console.error('No se pudo recuperar el usuario de Auth.', userError);
      return json({ error: 'Usuario o contraseña incorrectos.' }, 401);
    }

    const logged = await signIn(authClient, userResult.user.email, password);
    if (!logged) return json({ error: 'Usuario o contraseña incorrectos.' }, 401);
    return json(logged);
  } catch (error) {
    console.error('Error inesperado en recetario-username-login.', error);
    return json({ error: 'No se pudo completar la operación de acceso.' }, 500);
  }
});
