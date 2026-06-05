import { NextRequest, NextResponse } from 'next/server';
import { callAI, parseAIResponse, AIError } from '@/lib/ai';
import { getRealPrices, injectPricesIntoPrompt } from '@/lib/alpha-vantage';
import { buildLearningContext, recordFromAIResponse } from '@/lib/ai-learning';

interface AnalysisRequest {
  text: string;
  sourceType: 'news' | 'policy' | 'tweet' | 'mixed';
}

export const maxDuration = 60;

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

Be thorough, specific, and professional. Use real companies with real ticker symbols. Your analysis should reflect actual market dynamics.

IMPORTANT CALIBRATION RULES:
- Default confidence should be 55-75% unless there is VERY strong evidence
- Only give 80%+ confidence for clear catalyst events (earnings beat, FDA approval, etc.)
- Always mention counter-arguments and risks
- Prefer being correct over being bold`;

// ═══════════════════════════════════════════
// DEMO DATA — realistic simulation when AI is unreachable
// ═══════════════════════════════════════════

function generateDemoAnalysis() {
  return {
    sentiment: 'bullish',
    sentimentScore: 68,
    predictions: [
      {
        ticker: 'AAPL',
        company: 'Apple Inc.',
        sector: 'Technology',
        description: 'Technology company making iPhones, Macs, and services',
        signal: 'BUY',
        confidence: 82,
        reasoning: 'Strong product ecosystem and AI integration driving growth',
        priceTargetDirection: 'UP',
        riskLevel: 'MEDIUM',
        impactLevel: 'HIGH',
      },
      {
        ticker: 'NVDA',
        company: 'NVIDIA Corp',
        sector: 'Technology',
        description: 'AI chip manufacturer dominating the GPU market',
        signal: 'BUY',
        confidence: 90,
        reasoning: 'Unprecedented AI demand driving revenue growth 125% YoY',
        priceTargetDirection: 'UP',
        riskLevel: 'LOW',
        impactLevel: 'HIGH',
      },
      {
        ticker: 'MSFT',
        company: 'Microsoft Corp',
        sector: 'Technology',
        description: 'Cloud computing and software giant with Azure and Copilot AI',
        signal: 'BUY',
        confidence: 78,
        reasoning: 'Azure cloud growth accelerating with AI workloads',
        priceTargetDirection: 'UP',
        riskLevel: 'LOW',
        impactLevel: 'MEDIUM',
      },
    ],
    marketOverview:
      'Mercatet tregojnë favorizëm me nxitimin e AI. Teknologjia udhëheq me forcat e korporatave të mëdha.',
    keyInsights: [
      'AI integration becoming key differentiator across sectors',
      'Fed policy shift expected to support growth stocks',
      'Institutional flows favoring large-cap tech',
    ],
    riskFactors: [
      'Valuation stretch in mega-cap tech',
      'Geopolitical tensions affecting supply chains',
    ],
    isDemo: true,
  };
}

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

    // ═══ FETCH REAL PRICES FOR COMMON STOCKS ═══
    const commonTickers = ['AAPL','MSFT','NVDA','GOOGL','AMZN'];
    const livePrices = await getRealPrices(commonTickers);

    let userMessage = `Analyze this ${sourceLabel} and generate financial signals:\n\n${text}`;

    // Inject real prices into prompt
    if (Object.keys(livePrices).length > 0) {
      userMessage = injectPricesIntoPrompt(userMessage, livePrices);
    }

    // ═══ INJECT LEARNED LESSONS ═══
    const learningContext = await buildLearningContext();
    if (learningContext) {
      userMessage += `\n\n${learningContext}`;
    }

    // Try real AI first, fall back to demo
    let content: string;
    try {
      content = await callAI({
        systemPrompt: SYSTEM_PROMPT,
        userMessage,
        temperature: 0.3,
        timeoutMs: 30000,
        retries: 0,
      });
    } catch {
      // AI unavailable — use demo data
      console.log('[DEMO MODE] AI unavailable for analyze, using simulation data');
      const demo = generateDemoAnalysis();
      return NextResponse.json({ analysis: demo, demo: true });
    }

    const fallback = {
      sentiment: 'neutral',
      sentimentScore: 50,
      predictions: [],
      marketOverview: content,
      keyInsights: [],
      riskFactors: [],
    };

    const analysis = parseAIResponse(content, fallback);

    // ═══ RECORD PREDICTIONS FOR LEARNING ═══
    if (analysis?.predictions && Array.isArray(analysis.predictions) && analysis.predictions.length > 0) {
      try {
        const tickers = analysis.predictions.map((p: { ticker: string }) => p.ticker);
        const allPrices = { ...livePrices };
        // Fetch prices for predicted tickers not already fetched
        const missingTickers = tickers.filter((t: string) => !livePrices[t.toUpperCase()]);
        if (missingTickers.length > 0 && missingTickers.length <= 6) {
          const extraPrices = await getRealPrices(missingTickers);
          Object.assign(allPrices, extraPrices);
        }
        await recordFromAIResponse('analyze', analysis.predictions.map((p: { ticker: string; company?: string; sector?: string; signal?: string; confidence?: number; reasoning?: string }) => ({
          ...p,
          currentPrice: allPrices[p.ticker?.toUpperCase()]?.price,
        })));
        console.log(`[ANALYZE] Recorded ${analysis.predictions.length} predictions for learning`);
      } catch (learnErr) {
        console.error('[ANALYZE] Failed to record predictions:', learnErr);
      }
    }

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
