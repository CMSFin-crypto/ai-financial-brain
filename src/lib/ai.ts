// ═══════════════════════════════════════════════════════════════
// AI ENGINE — Multi-provider with dynamic Gemini model discovery
// 1. Google Gemini (free, works everywhere — PRIMARY on Vercel)
//    Dynamically discovers available models, tries them in smart order
// 2. OpenAI compatible (works on Vercel with API key)
// 3. z-ai-web-dev-sdk (local dev ONLY)
// ═══════════════════════════════════════════════════════════════

interface AIOptions {
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  retries?: number;
}

class AIError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
    this.name = 'AIError';
  }
}

// ─── Dynamic model discovery with cache ─────────
const MODEL_CACHE = {
  models: [] as string[],
  fetchedAt: 0,
  workingModel: null as string | null,  // Cache the model that actually worked
  workingModelAt: 0,
};

// Keywords that indicate non-text-generation models (skip these)
const SKIP_MODEL_KEYWORDS = [
  'tts', 'audio', 'image', 'robotics', 'computer-use',
  'deep-research', 'clip', 'lyria', 'antigravity', 'nano-banana',
];

/**
 * Fetch available Gemini models from the API, with caching.
 * Returns only text-generation models, sorted by preference.
 */
async function getAvailableModels(apiKey: string): Promise<string[]> {
  // Use cache if less than 5 minutes old
  if (MODEL_CACHE.models.length > 0 && Date.now() - MODEL_CACHE.fetchedAt < 5 * 60 * 1000) {
    return MODEL_CACHE.models;
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!res.ok) {
      console.error(`[GEMINI] Model listing failed: ${res.status}`);
      return getDefaultModels();
    }

    const data = await res.json();
    if (!data?.models || !Array.isArray(data.models)) {
      return getDefaultModels();
    }

    // Filter: only models with generateContent support, skip non-text models
    const textModels = data.models
      .filter((m: { supportedGenerationMethods?: string[]; name: string }) =>
        m.supportedGenerationMethods?.includes('generateContent') &&
        !SKIP_MODEL_KEYWORDS.some(kw => m.name.toLowerCase().includes(kw))
      )
      .map((m: { name: string }) => m.name.replace('models/', ''));

    if (textModels.length === 0) {
      return getDefaultModels();
    }

    // Sort by preference (newest/most capable first)
    const prioritized = sortModelsByPreference(textModels);

    MODEL_CACHE.models = prioritized;
    MODEL_CACHE.fetchedAt = Date.now();
    console.log(`[GEMINI] Discovered ${prioritized.length} text models: ${prioritized.join(', ')}`);

    return prioritized;
  } catch (err) {
    console.error(`[GEMINI] Model discovery error:`, err);
    return getDefaultModels();
  }
}

/**
 * Sort models by preference: prefer newest flash/pro, avoid gemma (different model family)
 */
function sortModelsByPreference(models: string[]): string[] {
  // Priority tiers — models matching earlier patterns are preferred
  const tiers: Array<{ pattern: RegExp; priority: number }> = [
    { pattern: /^gemini-2\.5-flash/, priority: 1 },       // Preferred — smart & fast
    { pattern: /^gemini-2\.5-pro/, priority: 2 },         // Stable pro
    { pattern: /^gemini-3\.5-flash/, priority: 3 },      // Newest flash
    { pattern: /^gemini-3-pro/, priority: 4 },            // New pro
    { pattern: /^gemini-3\.1-(pro|flash)/, priority: 5 },  // 3.1 family
    { pattern: /^gemini-3-flash/, priority: 6 },             // 3.0 flash
    { pattern: /^gemini-2\.0-flash-001/, priority: 7 },     // 2.0 variant (separate quota)
    { pattern: /^gemini-2\.0-flash$/, priority: 8 },        // 2.0 (might be 429)
    { pattern: /^gemini-2\.0-flash-lite/, priority: 9 },   // 2.0 lite
    { pattern: /^gemini-2\.5-flash-lite/, priority: 10 },  // 2.5 lite
    { pattern: /^gemini-3\.1-flash-lite/, priority: 11 },  // 3.1 lite
    { pattern: /^gemini-flash-latest/, priority: 12 },     // Latest alias
    { pattern: /^gemini-pro-latest/, priority: 13 },        // Pro latest
    { pattern: /^gemma-/, priority: 99 },                    // Gemma (different family, last resort)
  ];

  return models.sort((a, b) => {
    const priA = tiers.find(t => t.pattern.test(a))?.priority ?? 50;
    const priB = tiers.find(t => t.pattern.test(b))?.priority ?? 50;
    return priA - priB;
  });
}

/**
 * Fallback model list if API listing fails
 */
function getDefaultModels(): string[] {
  return [
    'gemini-2.5-flash',
    'gemini-2.0-flash-001',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-flash-latest',
    'gemini-pro-latest',
  ];
}

// ─── Provider 1: Google Gemini (FREE — works everywhere) ─────────
async function callGemini(
  systemPrompt: string,
  userMessage: string,
  temperature: number,
  maxTokens: number,
  timeoutMs: number
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AIError('GEMINI_API_KEY not configured', 'SKIP');

  // PRIORITY 1: Use env var if set
  const envModel = process.env.GEMINI_MODEL;
  if (envModel) {
    console.log(`[GEMINI] Using env model: ${envModel}`);
    return await callGeminiModel(apiKey, envModel, systemPrompt, userMessage, temperature, maxTokens, timeoutMs);
  }

  // PRIORITY 2: Try known working models directly (no discovery overhead)
  // gemini-2.5-flash is the preferred model — smart, fast, good quality
  const FAST_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.5-flash', 'gemini-3.1-flash-lite-preview', 'gemini-3.1-flash-lite'];

  let lastErr: Error | null = null;
  for (const model of FAST_MODELS) {
    try {
      const result = await callGeminiModel(apiKey, model, systemPrompt, userMessage, temperature, maxTokens, timeoutMs);
      MODEL_CACHE.workingModel = model;
      MODEL_CACHE.workingModelAt = Date.now();
      return result;
    } catch (err: unknown) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const msg = lastErr.message;
      if (msg.includes('429') || msg.includes('quota') || msg.includes('404') || msg.includes('not found')) {
        console.warn(`[GEMINI] ${model} unavailable, trying next...`);
        continue;
      }
      throw lastErr;
    }
  }

  // PRIORITY 3: Full discovery as last resort
  const discoveredModels = await getAvailableModels(apiKey);
  for (const model of discoveredModels) {
    try {
      const result = await callGeminiModel(apiKey, model, systemPrompt, userMessage, temperature, maxTokens, timeoutMs);
      MODEL_CACHE.workingModel = model;
      MODEL_CACHE.workingModelAt = Date.now();
      return result;
    } catch (err: unknown) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      continue;
    }
  }

  throw lastErr || new Error('All Gemini models failed');
}

async function callGeminiModel(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  temperature: number,
  maxTokens: number,
  timeoutMs: number
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ parts: [{ text: userMessage }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };

  console.log(`[GEMINI] Calling model ${model}...`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error(`[GEMINI] ${model} error ${res.status}: ${errText.substring(0, 200)}`);
    throw new Error(`Gemini ${model} ${res.status}: ${errText.substring(0, 300)}`);
  }

  const data = await res.json();

  // Check for safety blocks
  if (data?.promptFeedback?.blockReason) {
    throw new Error(`Gemini ${model} blocked: ${data.promptFeedback.blockReason}`);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const reason = data?.candidates?.[0]?.finishReason || 'unknown';
    throw new Error(`Gemini ${model} empty response, finishReason: ${reason}`);
  }

  console.log(`[GEMINI] ✅ ${model} success (${text.length} chars)`);
  return text;
}

// ─── Provider 2: OpenAI compatible (works on Vercel) ─────────
async function callOpenAI(
  systemPrompt: string,
  userMessage: string,
  temperature: number,
  maxTokens: number,
  timeoutMs: number
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AIError('OPENAI_API_KEY not configured', 'SKIP');

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenAI ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI empty response');
  return content;
}

// ─── Provider 3: z-ai-web-dev-sdk (local dev ONLY — NEVER on Vercel) ─────────
async function callZAI(
  systemPrompt: string,
  userMessage: string,
  temperature: number,
  maxTokens: number,
  timeoutMs: number
): Promise<string> {
  // ABSOLUTELY NEVER run on Vercel/serverless
  if (process.env.VERCEL) {
    throw new AIError('z-ai-web-dev-sdk not available on Vercel', 'SKIP');
  }

  const ZAI = (await import('z-ai-web-dev-sdk')).default;
  const zai = await ZAI.create();

  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature,
    max_tokens: maxTokens,
  });

  const result = completion as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error('z-ai empty response');
  return content;
}

// ─── Smart provider selection ─────────
function getProviders(): Array<{ name: string; fn: typeof callGemini }> {
  const providers: Array<{ name: string; fn: typeof callGemini }> = [];

  // ALWAYS try Gemini first if key exists (free, fast, works everywhere)
  if (process.env.GEMINI_API_KEY) {
    providers.push({ name: 'gemini', fn: callGemini });
  }

  // Try OpenAI if key exists
  if (process.env.OPENAI_API_KEY) {
    providers.push({ name: 'openai', fn: callOpenAI });
  }

  // z-ai ONLY in local development (never on Vercel)
  if (!process.env.VERCEL) {
    providers.push({ name: 'z-ai-web-dev-sdk', fn: callZAI });
  }

  return providers;
}

export async function callAI(options: AIOptions): Promise<string> {
  const {
    systemPrompt,
    userMessage,
    temperature = 0.3,
    maxTokens = 4000,
    timeoutMs = 60000,
    retries = 1,
  } = options;

  // On Vercel/serverless, use shorter timeout
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const effectiveTimeout = isServerless ? Math.min(timeoutMs, 25000) : timeoutMs;
  const effectiveRetries = isServerless ? 0 : retries;

  const providers = getProviders();
  console.log(`[AI] Providers: ${providers.length > 0 ? providers.map(p => p.name).join(', ') : 'NONE!'} | Serverless: ${isServerless}`);

  if (providers.length === 0) {
    throw new AIError(
      'Asnjë AI nuk është konfiguruar. Vendosni GEMINI_API_KEY në Environment Variables.',
      'NO_PROVIDER'
    );
  }

  let lastError: AIError | null = null;

  for (const provider of providers) {
    for (let attempt = 0; attempt <= effectiveRetries; attempt++) {
      try {
        console.log(`[AI] Trying: ${provider.name} (attempt ${attempt + 1})`);
        const content = await provider.fn(systemPrompt, userMessage, temperature, maxTokens, effectiveTimeout);
        console.log(`[AI] ✅ ${provider.name} success (${content.length} chars)`);
        return content;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const code = (error instanceof AIError && error.code === 'SKIP') ? 'SKIP' : 'ERROR';

        if (code === 'SKIP') {
          console.log(`[AI] ⏭️ Skipping ${provider.name}: ${message}`);
          break; // Move to next provider immediately
        }

        lastError = new AIError(message, 'AI_ERROR');
        console.warn(`[AI] ⚠️ ${provider.name} failed: ${message.substring(0, 150)}`);

        if (attempt < effectiveRetries) {
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        }
      }
    }
  }

  throw lastError || new AIError('Analiza dështoi. Provoni përsëri.', 'UNKNOWN_ERROR');
}

export function parseAIResponse<T>(content: string, fallback: T): T {
  try {
    // Remove markdown code blocks
    const cleaned = content
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

    // Find JSON boundaries — first { or [
    const start = cleaned.search(/[{[]/);
    if (start === -1) return fallback;

    const jsonStr = cleaned.slice(start);

    // Find matching last closing brace or bracket
    const lastBrace = jsonStr.lastIndexOf('}');
    const lastBracket = jsonStr.lastIndexOf(']');
    const end = Math.max(lastBrace, lastBracket);
    if (end === -1) return fallback;

    return JSON.parse(jsonStr.slice(0, end + 1)) as T;
  } catch {
    return fallback;
  }
}

export { AIError };
