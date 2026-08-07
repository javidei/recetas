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
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1] || '';
}

// Gemini Structured Output admite un subconjunto de JSON Schema.
// No usamos additionalProperties porque la API lo rechaza dentro de responseSchema.
const recipeSchema = {
  type: 'object',
  properties: {
    isRecipe: { type: 'boolean' },
    title: { type: 'string' },
    summary: { type: 'string' },
    category: { type: 'string', enum: ['principal', 'entrante', 'postre', 'desayuno'] },
    difficulty: { type: 'string', enum: ['Fácil', 'Media', 'Difícil'] },
    servings: { type: 'integer', minimum: 0, maximum: 30 },
    prepMinutes: { type: 'integer', minimum: 0, maximum: 1440 },
    cookMinutes: { type: 'integer', minimum: 0, maximum: 1440 },
    ingredients: { type: 'array', items: { type: 'string' } },
    steps: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
    warnings: { type: 'array', items: { type: 'string' } }
  },
  required: [
    'isRecipe', 'title', 'summary', 'category', 'difficulty', 'servings',
    'prepMinutes', 'cookMinutes', 'ingredients', 'steps', 'notes', 'warnings'
  ]
};

const prompt = `
Eres un extractor de recetas para una aplicación familiar española.
Vas a recibir entre una y cinco fotografías que pueden pertenecer a LA MISMA receta.
Combina la información de todas las imágenes como si fueran páginas consecutivas de un libro o revista.

REGLAS IMPORTANTES:
- Devuelve únicamente información visible o deducible directamente de tiempos explícitos.
- No inventes ingredientes, cantidades, pasos, tiempos ni raciones.
- Conserva cantidades y unidades tal como se entienden en las fotografías.
- Corrige únicamente errores OCR evidentes.
- Si una parte continúa en otra foto, une ambas partes sin duplicarla.
- Si varias fotos repiten información, no la dupliques.
- Si un dato numérico no aparece, usa 0.
- Si no hay título visible, usa una cadena vacía.
- Si faltan páginas, hay texto cortado o borroso, indícalo en warnings.
- Si el conjunto de imágenes no permite identificar una receta, isRecipe debe ser false.
- Responde en español.
- category: principal, entrante, postre o desayuno.
- difficulty: Fácil, Media o Difícil.
`;

type RecipeImage = { mimeType: string; imageBase64: string };

function normalizedImages(body: any): RecipeImage[] {
  if (Array.isArray(body?.images)) {
    return body.images
      .slice(0, 5)
      .map((item: any) => ({
        mimeType: String(item?.mimeType || '').toLowerCase(),
        imageBase64: String(item?.imageBase64 || '')
      }));
  }
  if (body?.imageBase64) {
    return [{
      mimeType: String(body?.mimeType || '').toLowerCase(),
      imageBase64: String(body.imageBase64 || '')
    }];
  }
  return [];
}

function modelVersionScore(name: string) {
  const match = name.match(/gemini-(\d+)(?:\.(\d+))?/i);
  if (!match) return 0;
  return Number(match[1]) * 100 + Number(match[2] || 0);
}

async function discoverFlashModel(apiKey: string) {
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': apiKey }
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const candidates = (Array.isArray(payload?.models) ? payload.models : [])
      .filter((model: any) => {
        const name = String(model?.name || '');
        const methods = Array.isArray(model?.supportedGenerationMethods) ? model.supportedGenerationMethods : [];
        return /gemini/i.test(name)
          && /flash/i.test(name)
          && !/lite|embedding|tts|native-audio|live|image-generation/i.test(name)
          && methods.includes('generateContent');
      })
      .sort((a: any, b: any) => {
        const aName = String(a?.name || '');
        const bName = String(b?.name || '');
        return modelVersionScore(bName) - modelVersionScore(aName);
      });
    return String(candidates[0]?.name || '').replace(/^models\//, '') || null;
  } catch {
    return null;
  }
}

async function callGemini(apiKey: string, model: string, images: RecipeImage[]) {
  const parts = images.map(image => ({
    inlineData: { mimeType: image.mimeType, data: image.imageBase64 }
  }));
  parts.push({ text: prompt } as any);

  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 3500,
          responseMimeType: 'application/json',
          responseSchema: recipeSchema
        }
      })
    }
  );
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const publishableKey = readKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY');
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    const configuredModel = Deno.env.get('GEMINI_MODEL') || '';
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
    const account = (await accountResponse.json())?.[0];
    if (!account?.is_active) return json({ error: 'Tu cuenta está desactivada.' }, 403);
    const isAdmin = account.role === 'admin';

    const settingsResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/get_recetario_ui_settings`, {
      method: 'POST', headers: commonHeaders, body: '{}'
    });
    if (!settingsResponse.ok) return json({ error: 'Falta activar la configuración de IA en Supabase.' }, 503);
    const settingsPayload = await settingsResponse.json();
    const settings = Array.isArray(settingsPayload) ? settingsPayload[0] : settingsPayload;
    if (!isAdmin && !settings?.ai_recipe_photo_enabled) {
      return json({ error: 'La importación de recetas con IA está desactivada para los usuarios.' }, 403);
    }

    const body = await request.json();
    const images = normalizedImages(body);
    if (!images.length) return json({ error: 'Selecciona al menos una fotografía.' }, 400);
    if (images.length > 5) return json({ error: 'Puedes analizar un máximo de 5 fotografías a la vez.' }, 400);

    let totalBase64 = 0;
    for (const image of images) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(image.mimeType)) {
        return json({ error: 'Todas las imágenes deben ser JPG, PNG o WEBP.' }, 400);
      }
      if (!image.imageBase64) return json({ error: 'Una de las imágenes está vacía.' }, 400);
      totalBase64 += image.imageBase64.length;
    }
    if (totalBase64 > 14_000_000) {
      return json({ error: 'El conjunto de fotografías es demasiado grande. Prueba con menos imágenes.' }, 400);
    }

    const initialModel = configuredModel || 'gemini-2.5-flash';
    let usedModel = initialModel;
    let geminiResponse = await callGemini(geminiApiKey, usedModel, images);

    if (geminiResponse.status === 404) {
      const detail = await responseMessage(geminiResponse);
      console.warn('Modelo Gemini no disponible', usedModel, detail);
      const discovered = await discoverFlashModel(geminiApiKey);
      if (discovered && discovered !== usedModel) {
        usedModel = discovered;
        geminiResponse = await callGemini(geminiApiKey, usedModel, images);
      }
    }

    if (!geminiResponse.ok) {
      const detail = await responseMessage(geminiResponse);
      console.error('Gemini error', geminiResponse.status, detail);
      if (geminiResponse.status === 429) {
        return json({ error: 'La cuota gratuita de IA está temporalmente agotada. Prueba más tarde.', detail }, 429);
      }
      if (geminiResponse.status === 404) {
        return json({ error: 'Google ha retirado el modelo de IA configurado y no se ha encontrado automáticamente otro compatible.', detail }, 502);
      }
      return json({ error: 'La IA no ha podido analizar las imágenes.', detail }, 502);
    }

    const geminiPayload = await geminiResponse.json();
    const text = geminiPayload?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part?.text || '')
      .join('')
      .trim();
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
        error: 'No he podido identificar una receta completa en las fotografías.',
        warnings: Array.isArray(recipe?.warnings) ? recipe.warnings : []
      }, 422);
    }

    return json({
      recipe,
      model: usedModel,
      imageCount: images.length,
      access: isAdmin ? 'admin' : 'member',
      notice: 'Revisa siempre los datos extraídos antes de guardar la receta.'
    });
  } catch (error) {
    console.error('Error inesperado en recetario-recipe-ai', error);
    return json({ error: 'No se pudieron procesar las fotografías con IA.' }, 500);
  }
});
