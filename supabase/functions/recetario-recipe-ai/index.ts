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
  const legacy = Deno.env.get(legacyVariable);
  if (legacy) return legacy;
  const single = Deno.env.get(singleVariable);
  if (single) return single;
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
    const payload = await response.clone().json();
    return String(payload?.error?.message || payload?.message || payload?.msg || payload?.error_description || payload?.error || '').trim();
  } catch {
    return (await response.clone().text()).trim();
  }
}

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

const recipeSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    isRecipe: { type: 'boolean', description: 'True only when the image contains enough information to identify a cooking or drink recipe.' },
    title: { type: 'string', description: 'Recipe title visible in the image. Do not invent one if none is present.' },
    summary: { type: 'string', description: 'Very short summary based only on information visible in the image.' },
    category: { type: 'string', enum: ['principal', 'entrante', 'postre', 'desayuno'], description: 'Best matching application category.' },
    difficulty: { type: 'string', enum: ['Fácil', 'Media', 'Difícil'], description: 'Difficulty. Use Fácil when the image gives no difficulty and the steps are simple.' },
    servings: { type: 'integer', minimum: 0, maximum: 30, description: 'Number of servings if visible, otherwise 0.' },
    prepMinutes: { type: 'integer', minimum: 0, maximum: 1440, description: 'Preparation minutes if visible or directly inferable from explicit timings in the recipe, otherwise 0.' },
    cookMinutes: { type: 'integer', minimum: 0, maximum: 1440, description: 'Cooking minutes if visible or directly inferable from explicit timings in the recipe, otherwise 0.' },
    ingredients: { type: 'array', items: { type: 'string' }, description: 'Ingredients preserving quantities and units from the image.' },
    steps: { type: 'array', items: { type: 'string' }, description: 'Preparation instructions in the same logical order as the image.' },
    notes: { type: 'string', description: 'Optional tips or notes explicitly present in the image. Empty string if none.' },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Short warnings about unreadable, cropped or missing information. Empty when extraction is clear.' }
  },
  required: ['isRecipe', 'title', 'summary', 'category', 'difficulty', 'servings', 'prepMinutes', 'cookMinutes', 'ingredients', 'steps', 'notes', 'warnings']
};

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const publishableKey = readKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY');
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    const geminiModel = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash-lite';
    const token = bearerToken(request);

    if (!supabaseUrl || !publishableKey) return json({ error: 'La función no encuentra la configuración interna de Supabase.' }, 503);
    if (!geminiApiKey) return json({ error: 'La IA todavía no tiene configurada GEMINI_API_KEY en Supabase.' }, 503);
    if (!token) return json({ error: 'Debes iniciar sesión.' }, 401);

    const commonHeaders = {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${token}` }
    });
    if (!userResponse.ok) return json({ error: 'Tu sesión no es válida.' }, 401);
    const user = await userResponse.json();
    if (!user?.id) return json({ error: 'Tu sesión no es válida.' }, 401);

    const accountUrl = new URL(`${supabaseUrl}/rest/v1/recetario_accounts`);
    accountUrl.searchParams.set('id', `eq.${user.id}`);
    accountUrl.searchParams.set('select', 'id,is_active,role');
    accountUrl.searchParams.set('limit', '1');
    const accountResponse = await fetch(accountUrl, { headers: commonHeaders });
    if (!accountResponse.ok) return json({ error: 'No se pudo validar tu cuenta de El Recetario.' }, 403);
    const accounts = await accountResponse.json();
    const account = accounts?.[0];
    if (!account?.is_active) return json({ error: 'Tu cuenta está desactivada.' }, 403);
    const isAdmin = account.role === 'admin';

    const settingsResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/get_recetario_ui_settings`, {
      method: 'POST',
      headers: commonHeaders,
      body: '{}'
    });
    if (!settingsResponse.ok) return json({ error: 'Falta activar la configuración de IA en Supabase.' }, 503);
    const settingsPayload = await settingsResponse.json();
    const settings = Array.isArray(settingsPayload) ? settingsPayload[0] : settingsPayload;

    // El administrador siempre puede usar la IA. El ajuste controla únicamente a miembros normales.
    if (!isAdmin && !settings?.ai_recipe_photo_enabled) {
      return json({ error: 'La importación de recetas con IA está desactivada para los usuarios.' }, 403);
    }

    const body = await request.json();
    const mimeType = String(body?.mimeType || '').toLowerCase();
    const imageBase64 = String(body?.imageBase64 || '');

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) return json({ error: 'Usa una imagen JPG, PNG o WEBP.' }, 400);
    if (!imageBase64 || imageBase64.length > 8_000_000) return json({ error: 'La imagen está vacía o es demasiado grande.' }, 400);

    const prompt = `
Eres un extractor de recetas para una aplicación familiar española.
Lee con precisión la fotografía aportada. Puede ser una página de libro, una receta impresa o manuscrita.

REGLAS IMPORTANTES:
- Devuelve únicamente información que aparezca en la imagen o pueda deducirse directamente de tiempos explícitos.
- No inventes ingredientes, cantidades, pasos, tiempos ni raciones.
- Conserva cantidades y unidades tal como se entienden en la imagen.
- Corrige únicamente errores OCR evidentes, sin reescribir creativamente la receta.
- Si un dato numérico no aparece, usa 0.
- Si no hay título visible, usa una cadena vacía.
- Si la foto está cortada, borrosa o faltan partes, indícalo en warnings.
- Si la imagen no contiene una receta suficientemente identificable, isRecipe debe ser false.
- Responde en español.
- Para category usa exactamente: principal, entrante, postre o desayuno.
- Para difficulty usa exactamente: Fácil, Media o Difícil.
`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': geminiApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: imageBase64 } }, { text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 3000,
            responseMimeType: 'application/json',
            responseJsonSchema: recipeSchema
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      const detail = await responseMessage(geminiResponse);
      console.error('Gemini error', geminiResponse.status, detail);
      if (geminiResponse.status === 429) return json({ error: 'La cuota gratuita de IA está temporalmente agotada. Prueba más tarde.' }, 429);
      return json({ error: 'La IA no ha podido analizar la imagen.', detail }, 502);
    }

    const geminiPayload = await geminiResponse.json();
    const text = geminiPayload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part?.text || '').join('').trim();
    if (!text) return json({ error: 'La IA no ha devuelto datos de la receta.' }, 502);

    let recipe;
    try {
      recipe = JSON.parse(text);
    } catch {
      console.error('Respuesta IA no JSON', text);
      return json({ error: 'La IA devolvió una respuesta que no se pudo interpretar.' }, 502);
    }

    if (!recipe?.isRecipe) {
      return json({
        error: 'No he podido identificar una receta completa en esa fotografía.',
        warnings: Array.isArray(recipe?.warnings) ? recipe.warnings : []
      }, 422);
    }

    return json({
      recipe,
      model: geminiModel,
      access: isAdmin ? 'admin' : 'member',
      notice: 'Revisa siempre los datos extraídos antes de guardar la receta.'
    });
  } catch (error) {
    console.error('Error inesperado en recetario-recipe-ai', error);
    return json({ error: 'No se pudo procesar la fotografía con IA.' }, 500);
  }
});