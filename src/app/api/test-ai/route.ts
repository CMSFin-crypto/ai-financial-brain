// ═══════════════════════════════════════════════════════════════
// TEST AI ENDPOINT — Discovers and tests available Gemini models
// Call: GET /api/test-ai
// ═══════════════════════════════════════════════════════════════

export const maxDuration = 60;

const SKIP_KEYWORDS = [
  'tts', 'audio', 'image', 'robotics', 'computer-use',
  'deep-research', 'clip', 'lyria', 'antigravity', 'nano-banana',
];

const MODEL_TIERS: Array<{ pattern: RegExp; priority: number }> = [
  { pattern: /^gemini-3\.5-flash/, priority: 1 },
  { pattern: /^gemini-2\.5-flash$/, priority: 2 },
  { pattern: /^gemini-3-pro/, priority: 3 },
  { pattern: /^gemini-2\.5-pro$/, priority: 4 },
  { pattern: /^gemini-3\.1-(pro|flash)/, priority: 5 },
  { pattern: /^gemini-3-flash/, priority: 6 },
  { pattern: /^gemini-2\.0-flash-001/, priority: 7 },
  { pattern: /^gemini-2\.0-flash$/, priority: 8 },
  { pattern: /^gemini-2\.0-flash-lite/, priority: 9 },
  { pattern: /^gemini-2\.5-flash-lite/, priority: 10 },
  { pattern: /^gemini-3\.1-flash-lite/, priority: 11 },
  { pattern: /^gemini-flash-latest/, priority: 12 },
  { pattern: /^gemini-pro-latest/, priority: 13 },
  { pattern: /^gemma-/, priority: 99 },
];

export async function GET() {
  const startTime = Date.now();
  const logs: string[] = [];

  const log = (msg: string) => {
    console.log(`[TEST-AI] ${msg}`);
    logs.push(`[${Date.now() - startTime}ms] ${msg}`);
  };

  log(`Node: ${process.version} | VERCEL: ${process.env.VERCEL || 'not set'}`);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ status: 'error', message: 'GEMINI_API_KEY not configured', logs, elapsed: Date.now() - startTime }, { status: 500 });
  }

  log(`Key: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)} (len: ${apiKey.length})`);

  // ─── Step 1: List available models ───
  log('Fetching available models from Gemini API...');
  let allModels: string[] = [];

  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const listRes = await fetch(listUrl, { signal: AbortSignal.timeout(10000) });
    const listData = await listRes.json();

    if (listData?.models && Array.isArray(listData.models)) {
      allModels = listData.models
        .filter((m: { supportedGenerationMethods?: string[]; name: string }) =>
          m.supportedGenerationMethods?.includes('generateContent') &&
          !SKIP_KEYWORDS.some(kw => m.name.toLowerCase().includes(kw))
        )
        .map((m: { name: string }) => m.name.replace('models/', ''))
        .sort((a: string, b: string) => {
          const priA = MODEL_TIERS.find(t => t.pattern.test(a))?.priority ?? 50;
          const priB = MODEL_TIERS.find(t => t.pattern.test(b))?.priority ?? 50;
          return priA - priB;
        });

      log(`Found ${allModels.length} text-generation models (sorted by preference):`);
      allModels.forEach(m => log(`  ${m}`));
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Model listing failed: ${msg}`);
  }

  // ─── Step 2: Test each model ───
  const results: Array<{ model: string; status: string; response?: string; error?: string; timeMs: number }> = [];

  for (const model of allModels) {
    log(`Testing ${model}...`);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Say "AI works!" in exactly those words, nothing else.' }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 20 },
        }),
        signal: AbortSignal.timeout(15000),
      });

      const timeMs = Date.now() - startTime;

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        const shortErr = errText.substring(0, 150);
        log(`${model}: ${res.status} - ${shortErr}`);
        results.push({ model, status: `error ${res.status}`, error: shortErr, timeMs });
        continue;
      }

      const data = await res.json();

      if (data?.promptFeedback?.blockReason) {
        log(`${model}: BLOCKED - ${data.promptFeedback.blockReason}`);
        results.push({ model, status: 'blocked', error: data.promptFeedback.blockReason, timeMs });
        continue;
      }

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        log(`${model}: EMPTY response`);
        results.push({ model, status: 'empty', error: 'No text', timeMs });
        continue;
      }

      log(`${model}: ✅ SUCCESS - "${text.trim()}" (${timeMs}ms)`);

      // Found a working model!
      return Response.json({
        status: 'success',
        workingModel: model,
        response: text.trim(),
        testedCount: results.length + 1,
        totalModels: allModels.length,
        allResults: results.concat([{ model, status: 'success', response: text.trim(), timeMs }]),
        logs,
        elapsed: Date.now() - startTime,
        recommendation: `Set GEMINI_MODEL=${model} in Vercel env vars for fastest results (skips model discovery)`,
      });

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log(`${model}: FETCH ERROR - ${message}`);
      results.push({ model, status: 'fetch_error', error: message, timeMs: Date.now() - startTime });
    }
  }

  // No model worked
  return Response.json({
    status: 'all_models_failed',
    testedCount: results.length,
    totalModels: allModels.length,
    allResults: results,
    allModels,
    logs,
    elapsed: Date.now() - startTime,
    suggestion: 'Your API key has quota=0 for all models. Go to https://aistudio.google.com/apikey and create a new key, or enable billing at https://ai.google.dev/pricing',
  }, { status: 502 });
}
