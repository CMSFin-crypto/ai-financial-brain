import { NextRequest, NextResponse } from 'next/server';
import { callAI, parseAIResponse, AIError } from '@/lib/ai';
import { getStock } from '@/lib/market-data';

interface TechnicalAnalysisRequest {
  ticker: string;
  company?: string;
}

const SYSTEM_PROMPT = `You are an expert technical analyst. Analyze the given stock using technical analysis principles.

You MUST respond ONLY with a valid JSON object (no markdown, no code blocks):

{
  "ticker": "AAPL",
  "company": "Apple Inc.",
  "overallSignal": "BULLISH|BEARISH|NEUTRAL",
  "confidence": 78,
  "priceAnalysis": {
    "currentPrice": 195.50,
    "trend": "uptrend|downtrend|sideways",
    "trendStrength": "strong|moderate|weak"
  },
  "indicators": {
    "rsi": {
      "value": 62.5,
      "signal": "neutral",
      "interpretation": "RSI is in neutral zone, neither overbought nor oversold"
    },
    "macd": {
      "value": 1.25,
      "signal": "bullish",
      "interpretation": "MACD line crossed above signal line, bullish momentum"
    },
    "movingAverage": {
      "sma20": "193.50",
      "sma50": "188.00",
      "sma200": "178.00",
      "ema12": "194.80",
      "signal": "bullish",
      "interpretation": "Price above all major moving averages, strong uptrend confirmed"
    },
    "bollingerBands": {
      "upper": "202.00",
      "middle": "195.00",
      "lower": "188.00",
      "signal": "neutral",
      "interpretation": "Price is near middle band, neutral position"
    },
    "volume": {
      "trend": "increasing|decreasing|average",
      "signal": "bullish",
      "interpretation": "Volume supports the current price movement"
    },
    "stochastic": {
      "k": 72.5,
      "d": 65.0,
      "signal": "bullish",
      "interpretation": "Stochastic pointing upward, bullish momentum"
    }
  },
  "supportResistance": {
    "supports": ["190.00", "185.50", "178.00"],
    "resistances": ["200.00", "205.50", "212.00"]
  },
  "patterns": [
    {
      "name": "Golden Cross",
      "type": "bullish",
      "reliability": "high",
      "description": "50-day SMA crossed above 200-day SMA"
    }
  ],
  "candlestickData": [
    {"date": "2025-01-06", "open": 190, "high": 194, "low": 189, "close": 193, "volume": 55000000},
    {"date": "2025-01-07", "open": 193, "high": 196, "low": 192, "close": 195, "volume": 62000000}
  ],
  "summary": "2-3 sentence technical analysis summary with actionable recommendations",
  "actionPlan": "Specific entry, exit, and stop-loss levels"
}`;

// ═══════════════════════════════════════════
// DEMO DATA — realistic simulation when AI is unreachable
// ═══════════════════════════════════════════

// Stock profiles now imported from centralized market-data module

function generateCandlestickData(basePrice: number, trend: 'uptrend' | 'downtrend' | 'sideways') {
  const data: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }> = [];
  let price = basePrice * 0.92;
  const today = new Date();

  for (let i = 14; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    const drift = trend === 'uptrend' ? 0.003 : trend === 'downtrend' ? -0.002 : 0;
    const change = (Math.random() - 0.45) * 0.02 + drift;
    const open = price;
    const close = +(open * (1 + change)).toFixed(2);
    const high = +(Math.max(open, close) * (1 + Math.random() * 0.015)).toFixed(2);
    const low = +(Math.min(open, close) * (1 - Math.random() * 0.015)).toFixed(2);
    const volume = Math.floor(40000000 + Math.random() * 60000000);

    data.push({ date: dateStr, open, high, low, close, volume });
    price = close;
  }

  return data;
}

function generateDemoTechnicalAnalysis(ticker: string, company?: string) {
  const t = ticker.toUpperCase();
  const raw = getStock(t);
  const p = raw ? {
    company: raw.company,
    sector: raw.sector,
    price: raw.price,
    signal: raw.signal,
    trend: raw.trend,
  } : {
    company: company || t + ' Corp',
    sector: 'Technology',
    price: 150 + Math.random() * 100,
    signal: 'NEUTRAL' as const,
    trend: 'sideways' as const,
  };

  const price = p.price;
  const isBullish = p.signal === 'BULLISH';
  const isBearish = p.signal === 'BEARISH';

  const rsiValue = isBullish ? 55 + Math.floor(Math.random() * 20) : isBearish ? 25 + Math.floor(Math.random() * 15) : 45 + Math.floor(Math.random() * 10);
  const rsiSignal = rsiValue > 70 ? 'overbought' : rsiValue < 30 ? 'oversold' : 'neutral';

  const macdValue = isBullish ? +(0.5 + Math.random() * 2).toFixed(2) : isBearish ? +(-2 + Math.random()).toFixed(2) : +(Math.random() - 0.5).toFixed(2);
  const macdSignal = macdValue > 0.2 ? 'bullish' : macdValue < -0.2 ? 'bearish' : 'neutral';

  const sma20 = +(price * 0.99).toFixed(2);
  const sma50 = +(price * 0.96).toFixed(2);
  const sma200 = +(price * 0.91).toFixed(2);
  const ema12 = +(price * 0.997).toFixed(2);

  const bbUpper = +(price * 1.04).toFixed(2);
  const bbMiddle = +price.toFixed(2);
  const bbLower = +(price * 0.96).toFixed(2);

  const stochK = isBullish ? 60 + Math.floor(Math.random() * 25) : isBearish ? 15 + Math.floor(Math.random() * 25) : 40 + Math.floor(Math.random() * 20);
  const stochD = stochK - 5 - Math.floor(Math.random() * 10);

  const candlestickData = generateCandlestickData(price, p.trend);

  const confidence = isBullish ? 65 + Math.floor(Math.random() * 20) : isBearish ? 60 + Math.floor(Math.random() * 20) : 45 + Math.floor(Math.random() * 15);

  const supports = [
    (price * 0.97).toFixed(2),
    (price * 0.95).toFixed(2),
    sma200.toFixed(2),
  ];
  const resistances = [
    (price * 1.03).toFixed(2),
    (price * 1.05).toFixed(2),
    (price * 1.08).toFixed(2),
  ];

  const patterns: Array<{ name: string; type: string; reliability: string; description: string }> = [];
  if (isBullish) {
    patterns.push({
      name: 'Golden Cross',
      type: 'bullish',
      reliability: 'high',
      description: 'SMA 50 kaloi mbi SMA 200, sinjal ngjitës afatgjatë',
    });
    if (Math.random() > 0.5) {
      patterns.push({
        name: 'Bull Flag',
        type: 'bullish',
        reliability: 'moderate',
        description: 'Model Flag Bistikut në formim pas lëvizjes së fortë ngjitëse',
      });
    }
  } else if (isBearish) {
    patterns.push({
      name: 'Death Cross',
      type: 'bearish',
      reliability: 'high',
      description: 'SMA 50 ra nën SMA 200, sinjal ulës afatgjatë',
    });
  }

  const summary = isBullish
    ? `${p.company} tregon tendencë ngjitëse të fortë me çmimin mbi të gjitha SMA-të kryesore. RSI në ${rsiValue} me hapësirë për rritje të mëtejshme. MACD pozitiv me moment ngjitës. Rekomandohet hyrja në zona $${(price * 0.99).toFixed(0)}-$${price.toFixed(0)} me stop loss $${(price * 0.96).toFixed(0)}.`
    : isBearish
      ? `${p.company} tregon tendencë ulëse me çmimin nën SMA 50. RSI në ${rsiValue} duke afrohet zonën e mbipëshit. MACD negativ me presion ulës. Këshillohet kujdes — prit stabilizimin përpara se të hapësh pozicion.`
      : `${p.company} tregon lëvizje anësore pa drejtim të qartë. Indikatorët janë neutralë. Prit një thyerje mbi rezistencën $${(price * 1.03).toFixed(0)} ose nën suportin $${(price * 0.97).toFixed(0)} përpara se të veproni.`;

  const actionPlan = isBullish
    ? `Hyrje: $${(price * 0.99).toFixed(2)}-$${price.toFixed(2)} | Stop Loss: $${(price * 0.96).toFixed(2)} | Target 1: $${(price * 1.03).toFixed(2)} | Target 2: $${(price * 1.05).toFixed(2)} | Risk/Reward: 1:${(2.5 + Math.random()).toFixed(1)}`
    : isBearish
      ? `Kujdes: Tendencë ulëse aktive | Nëse shitet SHORT: Hyrje $${price.toFixed(2)} | Stop: $${(price * 1.03).toFixed(2)} | Target: $${(price * 0.95).toFixed(2)}`
      : `Prisni: Asnjë veprim deri në thyerje | Suport: $${(price * 0.97).toFixed(2)} | Rezistencë: $${(price * 1.03).toFixed(2)} | Monitoroni vëllimin për konfirmim`;

  return {
    ticker: t,
    company: p.company,
    sector: p.sector,
    overallSignal: p.signal,
    confidence,
    isDemo: true,
    priceAnalysis: {
      currentPrice: price,
      trend: p.trend,
      trendStrength: isBullish || isBearish ? 'moderate' : 'weak',
    },
    indicators: {
      rsi: {
        value: rsiValue,
        signal: rsiSignal,
        interpretation:
          rsiSignal === 'overbought'
            ? `RSI në ${rsiValue} — rreziqi i mbipëshit, mund të ketë korreksion afërsisht`
            : rsiSignal === 'oversold'
              ? `RSI në ${rsiValue} — zonë e nënshitjes, mund të ketë rikthim`
              : `RSI në ${rsiValue} — zonë neutrale, asnjë sinjal i fortë`,
      },
      macd: {
        value: macdValue,
        signal: macdSignal,
        interpretation:
          macdSignal === 'bullish'
            ? 'MACD vija kaloi mbi vijën e sinjalit, moment ngjitës'
            : macdSignal === 'bearish'
              ? 'MACD vija nën vijën e sinjalit, moment ulës'
              : 'MACD neutral, nuk ka sinjal të qartë',
      },
      movingAverage: {
        sma20: sma20.toFixed(2),
        sma50: sma50.toFixed(2),
        sma200: sma200.toFixed(2),
        ema12: ema12.toFixed(2),
        signal: isBullish ? 'bullish' : isBearish ? 'bearish' : 'neutral',
        interpretation: isBullish
          ? 'Çmimi mbi të gjitha SMA-të kryesore, tendencë ngjitëse e konfirmuar'
          : isBearish
            ? 'Çmimi nën SMA 50, presion ulës aktiv'
            : 'Çmimi midis SMA 20 dhe SMA 50, pa drejtim të qartë',
      },
      bollingerBands: {
        upper: bbUpper.toFixed(2),
        middle: bbMiddle.toFixed(2),
        lower: bbLower.toFixed(2),
        signal: 'neutral',
        interpretation: `Çmimi pranë brezit ${price > bbMiddle ? 'të sipërm' : 'të mesëm'}, pozicion ${price > bbMiddle ? 'ngjitës' : 'neutral'}`,
      },
      volume: {
        trend: isBullish ? 'increasing' : isBearish ? 'decreasing' : 'average',
        signal: isBullish ? 'bullish' : isBearish ? 'bearish' : 'neutral',
        interpretation: isBullish
          ? 'Vëllimi mbështet lëvizjen aktuale të çmimit'
          : isBearish
            ? 'Vëllimi në rritje me çmime në rënie — konfirmim ulës'
            : 'Vëllimi mesatar, pa sinjal të veçantë',
      },
      stochastic: {
        k: stochK,
        d: stochD,
        signal: stochK > 80 ? 'overbought' : stochK < 20 ? 'oversold' : isBullish ? 'bullish' : 'neutral',
        interpretation:
          stochK > 80
            ? 'Stochastic në zonën e mbipëshit, kujdes për korreksion'
            : stochK < 20
              ? 'Stochastic në zonën e nënshitjes, mund të ketë rikthim'
              : `Stochastic K:${stochK} D:${stochD} — moment ${isBullish ? 'ngjitës' : 'neutral'}`,
      },
    },
    supportResistance: { supports, resistances },
    patterns,
    candlestickData,
    summary,
    actionPlan,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: TechnicalAnalysisRequest = await request.json();
    const { ticker } = body;

    if (!ticker || ticker.trim().length < 1) {
      return NextResponse.json({ error: 'Ticker është i nevojshëm' }, { status: 400 });
    }

    const userMessage = `Perform a comprehensive technical analysis for ${ticker.toUpperCase()}. Include RSI, MACD, Moving Averages, Bollinger Bands, Volume analysis, Stochastic, support/resistance levels, chart patterns, and 15 days of simulated candlestick data. Provide specific entry/exit/stop-loss levels.`;

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
      console.log(`[DEMO MODE] AI unavailable for technical-analysis of ${ticker}, using simulation data`);
      const demo = generateDemoTechnicalAnalysis(ticker.trim().toUpperCase(), body.company);
      return NextResponse.json({ analysis: demo, demo: true });
    }

    const fallback = {
      ticker: ticker.toUpperCase(),
      company: body.company || ticker.toUpperCase(),
      overallSignal: 'NEUTRAL',
      confidence: 50,
      summary: content,
      priceAnalysis: { currentPrice: 0, trend: 'sideways', trendStrength: 'weak' },
      indicators: { rsi: { value: 50, signal: 'neutral', interpretation: '' }, macd: { value: 0, signal: 'neutral', interpretation: '' }, movingAverage: { sma20: '0', sma50: '0', sma200: '0', ema12: '0', signal: 'neutral', interpretation: '' }, bollingerBands: { upper: '0', middle: '0', lower: '0', signal: 'neutral', interpretation: '' }, volume: { trend: 'average', signal: 'neutral', interpretation: '' }, stochastic: { k: 50, d: 50, signal: 'neutral', interpretation: '' } },
      supportResistance: { supports: [], resistances: [] },
      patterns: [],
      candlestickData: [],
      actionPlan: '',
    };

    const analysis = parseAIResponse(content, fallback);
    return NextResponse.json({ analysis });
  } catch (error: unknown) {
    if (error instanceof AIError) {
      console.error('Technical AI error:', error.code, error.message);
      return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Technical analysis error:', message);
    return NextResponse.json({ error: 'Analiza teknike dështoi. Provo përsëri.' }, { status: 500 });
  }
}
