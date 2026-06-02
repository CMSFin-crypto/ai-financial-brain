import ZAI from 'z-ai-web-dev-sdk';

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

async function callWithTimeout(
  fn: () => Promise<unknown>,
  timeoutMs: number
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AIError(
        'Koha mbaroi — AI po zgjidh shumë gjatë. Provo përsëri.',
        'TIMEOUT'
      ));
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function classifyError(error: unknown): AIError {
  if (error instanceof AIError) return error;

  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('fetch failed') || message.includes('ConnectTimeout') || message.includes('ECONNREFUSED') || message.includes('UND_ERR')) {
    return new AIError(
      'Lidhja me AI dështoi. Shërbimi mund të jetë përkohësisht i pavlefshëm. Provo përsëri pas pak sekondash.',
      'CONNECTION_ERROR'
    );
  }

  if (message.includes('429') || message.includes('rate limit')) {
    return new AIError(
      'Shumë kërkesa. Prani 30 sekonda dhe provo përsëri.',
      'RATE_LIMIT'
    );
  }

  if (message.includes('401') || message.includes('403')) {
    return new AIError(
      'Gabim autorizimi AI. Kontakti me administratorin.',
      'AUTH_ERROR'
    );
  }

  if (message.includes('500') || message.includes('502') || message.includes('503')) {
    return new AIError(
      'Serveri AI është duke u rifilluar. Provo përsëri pas 1 minuti.',
      'SERVER_ERROR'
    );
  }

  return new AIError(
    `Gabim i papritur: ${message}`,
    'UNKNOWN_ERROR'
  );
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

  let lastError: AIError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const zai = await ZAI.create();

      const completion = await callWithTimeout(
        () =>
          zai.chat.completions.create({
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage },
            ],
            temperature,
            max_tokens: maxTokens,
          }),
        timeoutMs
      );

      const result = completion as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = result.choices?.[0]?.message?.content;

      if (!content) {
        throw new AIError(
          'AI nuk ktheu asnjë përgjigje. Provo përsëri.',
          'EMPTY_RESPONSE'
        );
      }

      return content;
    } catch (error: unknown) {
      lastError = classifyError(error);

      // Don't retry on auth errors
      if (lastError.code === 'AUTH_ERROR') {
        throw lastError;
      }

      // Wait before retry (exponential backoff)
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }

  throw lastError || new AIError('Analiza dështoi. Provo përsëri.', 'UNKNOWN_ERROR');
}

export function parseAIResponse<T>(content: string, fallback: T): T {
  try {
    const cleaned = content
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .replace(/^[^{[]*/m, '')
      .replace(/[^}\]]*$/m, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

export { AIError };
