import { NextRequest, NextResponse } from 'next/server';
import { callAI, parseAIResponse, AIError } from '@/lib/ai';

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
    {"date": "2025-01-07", "open": 193, "high": 196, "low": 192, "close": 195, "volume": 62000000},
    {"date": "2025-01-08", "open": 195, "high": 197, "low": 194, "close": 196, "volume": 58000000},
    {"date": "2025-01-09", "open": 196, "high": 199, "low": 195, "close": 198, "volume": 71000000},
    {"date": "2025-01-10", "open": 198, "high": 201, "low": 197, "close": 200, "volume": 85000000},
    {"date": "2025-01-13", "open": 200, "high": 202, "low": 198, "close": 199, "volume": 68000000},
    {"date": "2025-01-14", "open": 199, "high": 203, "low": 198, "close": 202, "volume": 78000000},
    {"date": "2025-01-15", "open": 202, "high": 205, "low": 201, "close": 204, "volume": 92000000},
    {"date": "2025-01-16", "open": 204, "high": 206, "low": 202, "close": 203, "volume": 70000000},
    {"date": "2025-01-17", "open": 203, "high": 207, "low": 202, "close": 206, "volume": 88000000},
    {"date": "2025-01-20", "open": 206, "high": 208, "low": 204, "close": 205, "volume": 75000000},
    {"date": "2025-01-21", "open": 205, "high": 209, "low": 204, "close": 208, "volume": 82000000},
    {"date": "2025-01-22", "open": 208, "high": 210, "low": 206, "close": 207, "volume": 69000000},
    {"date": "2025-01-23", "open": 207, "high": 211, "low": 206, "close": 209, "volume": 94000000},
    {"date": "2025-01-24", "open": 209, "high": 212, "low": 208, "close": 211, "volume": 86000000}
  ],
  "summary": "2-3 sentence technical analysis summary with actionable recommendations",
  "actionPlan": "Specific entry, exit, and stop-loss levels"
}`;

export async function POST(request: NextRequest) {
  try {
    const body: TechnicalAnalysisRequest = await request.json();
    const { ticker } = body;

    if (!ticker || ticker.trim().length < 1) {
      return NextResponse.json({ error: 'Ticker është i nevojshëm' }, { status: 400 });
    }

    const userMessage = `Perform a comprehensive technical analysis for ${ticker.toUpperCase()}. Include RSI, MACD, Moving Averages, Bollinger Bands, Volume analysis, Stochastic, support/resistance levels, chart patterns, and 15 days of simulated candlestick data. Provide specific entry/exit/stop-loss levels.`;

    const content = await callAI({
      systemPrompt: SYSTEM_PROMPT,
      userMessage,
      temperature: 0.3,
      timeoutMs: 60000,
      retries: 1,
    });

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
