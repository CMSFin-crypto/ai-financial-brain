import { NextResponse } from 'next/server';
import { callAI, parseAIResponse, AIError } from '@/lib/ai';
import { getStock } from '@/lib/market-data';
import { getRealPrices, injectPricesIntoPrompt } from '@/lib/alpha-vantage';
import { buildLearningContext, recordFromAIResponse } from '@/lib/ai-learning';

const SYSTEM_PROMPT = `You are an expert AI stock picker and market analyst. Generate today's top stock picks with detailed analysis.

You MUST respond ONLY with a valid JSON object (no markdown, no code blocks):

{
  "date": "today's date",
  "marketCondition": "bullish|bearish|neutral",
  "marketSummary": "2-3 sentence overview of today's market outlook",
  "topPicks": [
    {
      "ticker": "AAPL",
      "company": "Apple Inc.",
      "sector": "Technology",
      "currentPrice": 195.50,
      "targetPrice": 210.00,
      "stopLoss": 185.00,
      "signal": "BUY",
      "confidence": 85,
      "timeframe": "short-term|medium-term|long-term",
      "technicalReason": "Brief technical analysis reason",
      "fundamentalReason": "Brief fundamental analysis reason",
      "catalyst": "What event/news is driving this pick",
      "riskReward": "1:2.5",
      "keyLevels": {
        "support": "190.00",
        "resistance": "205.00",
        "pivot": "197.50"
      }
    }
  ],
  "marketMovers": [
    {
      "ticker": "TSLA",
      "direction": "UP|DOWN",
      "reason": "Why it's moving today"
    }
  ],
  "warnings": ["Any market warnings for today"]
}

Generate 5-6 top picks with strong potential. Include realistic price levels. Make picks across different sectors for diversification.

IMPORTANT CALIBRATION RULES:
- Default confidence should be 55-75% unless there is VERY strong evidence
- Only give 80%+ confidence for clear catalyst events (earnings beat, FDA approval, etc.)
- Always consider the current market trend before suggesting direction
- Include stop-loss levels that make sense (2-5% from entry)
- Prefer being correct over being bold`; 

// ═══════════════════════════════════════════
// DEMO DATA — realistic simulation when AI is unreachable
// ═══════════════════════════════════════════

function generateDemoPicks(livePrices?: Record<string, { price: number }>) {
  const today = new Date().toISOString().split('T')[0];

  const pickTickers = ['NVDA', 'AAPL', 'LLY', 'JPM', 'AMZN'];
  const topPicks = pickTickers.map((ticker) => {
    const s = getStock(ticker);
    const liveData = livePrices?.[ticker];
    if (!s && !liveData) return null;
    // CRITICAL: Use live price if available
    const price = liveData?.price || s?.price || 0;
    const company = s?.company || ticker + ' Corp';
    const sector = s?.sector || 'Technology';
    const targetPrice = liveData ? +(price * 1.10).toFixed(2) : (parseFloat(s?.targetPrice || '0') || price * 1.1);
    const stopLoss = +(price * 0.96).toFixed(2);
    const isBullish = s?.signal === 'BULLISH' || !!liveData;
    const confidence = isBullish ? 80 + Math.floor(Math.random() * 12) : 60 + Math.floor(Math.random() * 15);
    return {
      ticker: s?.ticker || ticker,
      company,
      sector,
      currentPrice: price,
      targetPrice,
      stopLoss,
      signal: 'BUY',
      confidence,
      timeframe: 'medium-term' as const,
      technicalReason: isBullish
        ? `Tendencë ngjitëse e konfirmuar, çmimi mbi SMA kryesore, vëllimi në rritje`
        : `Lëvizje anësore, çmimi pranë SMA, vëllimi mesatar`,
      fundamentalReason: s ? `Rritje të ardhurash ${s.revGrowth}, marzhë operative ${s.opMargin}, rating ${s.rating}` : 'Fundamentale të mira',
      catalyst: `${sector} sector momentum, katalizatorë pozitiv, fitime rezultate`,
      riskReward: `1:${(2 + Math.random()).toFixed(1)}`,
      keyLevels: { support: `${(price * 0.97).toFixed(2)}`, resistance: `${(price * 1.05).toFixed(2)}`, pivot: `${price.toFixed(2)}` },
    };
  }).filter(Boolean);

  // Market movers with real prices
  const moverTickers = ['TSLA', 'XOM', 'META'];
  const marketMovers = moverTickers.map(ticker => {
    const s = getStock(ticker);
    const live = livePrices?.[ticker];
    const price = live?.price || s?.price || 0;
    return { ticker, price };
  });

  return {
    date: today,
    marketCondition: 'bullish' as const,
    marketSummary:
      'Tregjet tregojnë ton pozitiv me rritje në sektorin e teknologjisë. Investitorët institucionalë po rrisin pozicionet në aksione me kapital të madh, duke nxitur performancën e përgjithshme të S&P 500.',
    isDemo: true,
    topPicks,
    marketMovers: marketMovers.map(m => ({
      ticker: m.ticker,
      direction: m.ticker === 'XOM' ? 'DOWN' : 'UP',
      reason: `${m.ticker} trading at $${m.price.toFixed(2)} with market activity`,
    })),
    warnings: [
      'Vigilëncë e nevojshme për volatilitetin e Fed minutes këtë javë',
      'Tensionet gjeopolitike mes SHBA dhe Kinës mund të prekin zinxhirët e furnizimit',
    ],
  };
}

export const maxDuration = 60;

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];

    // ═══ FETCH REAL PRICES FOR PICKS ═══
    const pickTickers = ['NVDA','AAPL','LLY','JPM','AMZN'];
    const livePrices = await getRealPrices(pickTickers);
    console.log(`[DAILY PICKS] Fetched ${Object.keys(livePrices).length} live prices`);

    let userMessage = `Generate today's top stock picks for ${today}. Focus on stocks with the highest probability of moving up today or this week. Include technical levels, catalysts, and risk/reward ratios. Make the picks realistic and based on current market conditions.`;

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
        temperature: 0.4,
        timeoutMs: 30000,
        retries: 0,
      });
    } catch {
      // AI unavailable — use demo data
      console.log('[DEMO MODE] AI unavailable for daily-picks, using simulation data');
      const demo = generateDemoPicks(livePrices);
      return NextResponse.json({ picks: demo, demo: true });
    }

    const fallback = {
      date: today,
      marketCondition: 'neutral',
      marketSummary: content,
      topPicks: [],
      marketMovers: [],
      warnings: [],
    };

    const picks = parseAIResponse(content, fallback);

    // ═══ RECORD PICKS FOR LEARNING ═══
    if (picks?.topPicks && Array.isArray(picks.topPicks) && picks.topPicks.length > 0) {
      try {
        await recordFromAIResponse('daily-picks', picks.topPicks.map((p: { ticker: string; company?: string; sector?: string; signal?: string; confidence?: number; currentPrice?: number; targetPrice?: number; technicalReason?: string }) => ({
          ticker: p.ticker,
          company: p.company,
          sector: p.sector,
          signal: p.signal,
          confidence: p.confidence,
          currentPrice: p.currentPrice,
          targetPrice: p.targetPrice,
          reasoning: p.technicalReason,
        })));
        console.log(`[DAILY PICKS] Recorded ${picks.topPicks.length} predictions for learning`);
      } catch (learnErr) {
        console.error('[DAILY PICKS] Failed to record predictions:', learnErr);
      }
    }

    return NextResponse.json({ picks });
  } catch (error: unknown) {
    if (error instanceof AIError) {
      console.error('Daily picks AI error:', error.code, error.message);
      return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Daily picks error:', message);
    return NextResponse.json({ error: 'Përzgjedhjet dështuan. Provo përsëri.' }, { status: 500 });
  }
}
