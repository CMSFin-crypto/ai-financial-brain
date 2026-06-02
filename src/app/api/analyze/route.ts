import { NextRequest, NextResponse } from 'next/server';
import { callAI, parseAIResponse, AIError } from '@/lib/ai';

interface AnalysisRequest {
  text: string;
  sourceType: 'news' | 'policy' | 'tweet' | 'mixed';
}

const SYSTEM_PROMPT = `You are an expert AI Financial Analyst — a "Financial Brain" that processes news articles, government policies, social media posts, and market commentary to generate actionable trading signals.

When given text input, you MUST:

1. **Analyze Market Sentiment**: Determine if the overall sentiment is bullish, bearish, or neutral. Score it from 0-100 (0=extremely bearish, 50=neutral, 100=extremely bullish).

2. **Identify Affected Stocks**: Identify 3-6 publicly traded companies (with their stock ticker symbols) that would be most impacted by the news/policy/tweet. For each company:
   - Ticker symbol
   - Full company name
   - Business sector
   - What the company does (brief description)
   - Signal: BUY, HOLD, or SELL
   - Confidence level: 0-100%
   - Reasoning: Why this signal
   - Price target direction: UP, DOWN, or STABLE
   - Risk level: LOW, MEDIUM, or HIGH

3. **Market Overview**: Write a 2-3 sentence professional market overview based on the input.

4. **Key Insights**: List 3-5 key market insights from the analysis.

5. **Risk Factors**: List 2-4 risk factors investors should consider.

You MUST respond ONLY with a valid JSON object in this exact format (no markdown, no code blocks, just pure JSON):

{
  "sentiment": "bullish|bearish|neutral",
  "sentimentScore": 0-100,
  "predictions": [
    {
      "ticker": "AAPL",
      "company": "Apple Inc.",
      "sector": "Technology",
      "description": "Brief description of what the company does",
      "signal": "BUY|HOLD|SELL",
      "confidence": 85,
      "reasoning": "Detailed explanation of why this signal makes sense",
      "priceTargetDirection": "UP|DOWN|STABLE",
      "riskLevel": "LOW|MEDIUM|HIGH",
      "impactLevel": "HIGH|MEDIUM|LOW"
    }
  ],
  "marketOverview": "2-3 sentence professional market overview...",
  "keyInsights": ["Insight 1", "Insight 2", "Insight 3"],
  "riskFactors": ["Risk 1", "Risk 2"]
}

Be thorough, specific, and professional. Use real companies with real ticker symbols. Your analysis should reflect actual market dynamics.`;

export async function POST(request: NextRequest) {
  try {
    const body: AnalysisRequest = await request.json();
    const { text, sourceType } = body;

    if (!text || text.trim().length < 20) {
      return NextResponse.json(
        { error: 'Ju lutemi jepni të paktën 20 karaktere për analizë.' },
        { status: 400 }
      );
    }

    const sourceLabel =
      sourceType === 'news'
        ? 'news article'
        : sourceType === 'policy'
          ? 'government policy or regulatory announcement'
          : sourceType === 'tweet'
            ? 'social media post or tweet from a notable figure'
            : 'mixed market commentary';

    const userMessage = `Analyze this ${sourceLabel} and generate financial signals:\n\n${text}`;

    const content = await callAI({
      systemPrompt: SYSTEM_PROMPT,
      userMessage,
      temperature: 0.3,
      timeoutMs: 60000,
      retries: 1,
    });

    const fallback = {
      sentiment: 'neutral',
      sentimentScore: 50,
      predictions: [],
      marketOverview: content,
      keyInsights: [],
      riskFactors: [],
    };

    const analysis = parseAIResponse(content, fallback);
    return NextResponse.json({ analysis });
  } catch (error: unknown) {
    if (error instanceof AIError) {
      console.error('Analysis AI error:', error.code, error.message);
      return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Analysis error:', message);
    return NextResponse.json({ error: 'Analiza dështoi. Provo përsëri.' }, { status: 500 });
  }
}
