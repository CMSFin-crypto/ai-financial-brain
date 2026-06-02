import { NextRequest, NextResponse } from 'next/server';
import { callAI, parseAIResponse, AIError } from '@/lib/ai';

interface QuantRequest {
  ticker: string;
  company?: string;
  universe?: 'sp500' | 'tech' | 'high-liquidity';
  timeframe?: 'swing' | 'day' | 'long-term';
  riskPerTrade?: number;
  historicalPeriod?: '1y' | '5y' | '10y';
}

const SYSTEM_PROMPT = `You are a QUANT TRADING SYSTEM — a multi-agent architecture with 6 specialized AI agents, a debate panel, and a scoring engine. You must simulate ALL agents independently and then combine their outputs through the scoring engine.

═════════════════════════════════════════
AGENT 1: TECHNICAL ANALYSIS AGENT (Weight: 35%)
═════════════════════════════════════════
Analyze using: RSI (14), MACD (12,26,9), SMA 20/50/200, EMA 12/26, Bollinger Bands (20,2), Volume Profile, Stochastic (14,3,3), ADX (14) for trend strength, ATR for volatility, and Pivot Points (S1,S2,R1,R2).

Identify:
- Short-term trend (1-5 days), Medium-term (1-4 weeks), Long-term (3-12 months)
- Golden Cross / Death Cross status
- Key support/resistance levels (4-6 levels each)
- Pivot Points (PP, S1, S2, S3, R1, R2, R3)
- Entry zone, stop loss zone, take profit levels (TP1, TP2, TP3)
- Volume confirmation (increasing/decreasing/divergent)
- Pattern recognition (head & shoulders, double top/bottom, flags, triangles)
Return: signal (BULLISH/BEARISH/NEUTRAL), confidence (0-100), key_levels, why_it_may_fail.

═════════════════════════════════════════
AGENT 2: FUNDAMENTAL ANALYSIS AGENT (Weight: 25%)
═════════════════════════════════════════
Analyze: Revenue growth (YoY, QoQ, 3Y CAGR), EPS (current, forward, growth), Net/Gross/Operating margins, P/E (trailing, forward, vs sector avg), PEG ratio, P/S, P/B, EV/EBITDA, Debt/Equity, Current Ratio, Free Cash Flow, ROE, ROI, Dividend yield, Next earnings date, Recent earnings surprises.
Competitive moat assessment, sector positioning.
Return: signal (BULLISH/BEARISH/NEUTRAL), confidence (0-100), valuation_verdict, why_it_may_fail.

═════════════════════════════════════════
AGENT 3: MACRO ECONOMIC AGENT (Weight: 20%)
═════════════════════════════════════════
Analyze current macro environment:
- Interest rates (Fed funds rate, ECB rate, yield curve 2Y/10Y — normal/inverted)
- Inflation (CPI, PCE, core inflation trend)
- GDP growth rate and trajectory
- Employment data (NFP, unemployment rate)
- Fed/ECB policy stance (hawkish/dovish/neutral, next meeting expectations)
- Dollar strength (DXY)
- Commodity prices (oil, gold) relevant to the sector
- Consumer confidence, PMI manufacturing/services
- How each macro factor specifically impacts this stock/sector
Return: signal (BULLISH/BEARISH/NEUTRAL), confidence (0-100), key_macro_factors, why_it_may_fail.

═════════════════════════════════════════
AGENT 4: GEOPOLITICAL & NEWS AGENT (Weight: 20%)
═════════════════════════════════════════
Analyze:
- Recent high-impact news (earnings, guidance, M&A, regulatory, product launches)
- Geopolitical risks (trade wars, sanctions, regional conflicts, supply chain)
- Sector-specific regulatory risks
- Sentiment from recent analyst upgrades/downgrades
- Social media / retail sentiment trends
- Earnings season impact
Return: signal (BULLISH/BEARISH/NEUTRAL), confidence (0-100), news_items with impact_score (1-10), why_it_may_fail.

═════════════════════════════════════════
DEBATE PANEL: Bull vs Bear vs Risk Manager
═════════════════════════════════════════
BULL AGENT argues why this is a BUY:
- Best case scenario
- Catalysts that could drive price up
- What could go RIGHT

BEAR AGENT argues why this is a SELL or why NOT to buy:
- Worst case scenario
- Headwinds and risks
- What could go WRONG

RISK MANAGER evaluates both sides:
- Identifies contradictions between agents
- Checks if minimum 3 confirmations exist across different fields
- Calculates risk/reward ratio
- Sets maximum risk per trade (default 1%)
- Determines position sizing
- Flags any NO-GO conditions

═════════════════════════════════════════
SCORING ENGINE
═════════════════════════════════════════
Weight: Technical 35% + Fundamental 25% + Macro 20% + News/Geopolitical 20%
Each agent's signal maps to: BULLISH = +1, NEUTRAL = 0, BEARISH = -1
Multiply by confidence/100 to get weighted score.
Sum all weighted scores → Total Score (-100 to +100)

Scoring thresholds:
- Score >= +60: STRONG BUY
- Score >= +35: BUY
- Score >= +10: LEAN BULLISH
- Score <= -10: LEAN BEARISH
- Score <= -35: SELL
- Score <= -60: STRONG SELL
- Between -10 and +10: NO TRADE / WAIT

CONFIRMATION RULE:
- Minimum 3 agents must agree on direction (BULL or BEAR)
- If fewer than 3 confirm, output verdict = NO TRADE regardless of score

═════════════════════════════════════════
OUTPUT FORMAT — respond ONLY with valid JSON:
═════════════════════════════════════════

{
  "ticker": "AAPL",
  "company": "Apple Inc.",
  "sector": "Technology",
  "currentPrice": 195.50,
  "timestamp": "2025-01-24T10:30:00Z",
  "universe": "sp500",
  "historicalPeriod": "1y",

  "technical": {
    "signal": "BULLISH|BEARISH|NEUTRAL",
    "confidence": 78,
    "shortTermTrend": "uptrend|downtrend|sideways",
    "mediumTermTrend": "uptrend|downtrend|sideways",
    "longTermTrend": "uptrend|downtrend|sideways",
    "rsi": {"value": 62.5, "signal": "neutral"},
    "macd": {"value": 1.25, "signal": "bullish", "histogram": 0.45},
    "sma": {"sma20": "193.50", "sma50": "188.00", "sma200": "178.00", "goldenCross": true, "deathCross": false},
    "ema": {"ema12": "194.80", "ema26": "192.50", "cross": "bullish"},
    "bollingerBands": {"upper": "202.00", "middle": "195.00", "lower": "188.00", "position": "near_middle"},
    "adx": {"value": 28.5, "signal": "trending", "strength": "moderate"},
    "stochastic": {"k": 72, "d": 65, "signal": "bullish"},
    "atr": {"value": 4.25, "volatility": "moderate"},
    "volume": {"trend": "increasing", "signal": "bullish", "vsAverage": "1.3x"},
    "pivotPoints": {"pp": "195.50", "s1": "192.00", "s2": "188.50", "s3": "185.00", "r1": "199.00", "r2": "202.50", "r3": "206.00"},
    "supportLevels": ["190.00", "185.50", "178.00"],
    "resistanceLevels": ["200.00", "205.50", "212.00"],
    "patterns": [{"name": "Bull Flag", "type": "bullish", "reliability": "high"}],
    "whyMayFail": "RSI approaching overbought, MACD could be losing momentum",
    "entryZone": "193-195",
    "stopLoss": "188.00",
    "takeProfits": {"tp1": "200.00", "tp2": "207.00", "tp3": "215.00"}
  },

  "fundamental": {
    "signal": "BULLISH|BEARISH|NEUTRAL",
    "confidence": 72,
    "revenue": {"annual": "383.3B", "growth": "8.1%", "growth3Y": "10.2%", "quarterly": "6.2%"},
    "eps": {"current": "6.42", "forward": "7.15", "growth": "12.5%", "surprises": [{"quarter": "Q4 2024", "surprise": "+3.8%"}]},
    "margins": {"gross": "44.1%", "operating": "29.8%", "net": "25.3%", "trend": "stable"},
    "valuation": {"pe": 31.5, "forwardPE": 28.2, "peg": 1.8, "ps": 7.8, "pb": 45.2, "evEbitda": 25.1, "vsSector": "premium"},
    "financialHealth": {"debtEquity": 1.72, "currentRatio": 1.05, "freeCashFlow": "110.5B", "rating": "strong"},
    "moat": {"type": "WIDE", "brandStrength": 9, "description": "Ecosystem lock-in, brand loyalty"},
    "nextEarnings": "2025-04-24",
    "analystConsensus": {"rating": "BUY", "target": "220.00", "buy": 28, "hold": 8, "sell": 2},
    "whyMayFail": "Premium valuation limits upside, China dependency risk"
  },

  "macro": {
    "signal": "BULLISH|BEARISH|NEUTRAL",
    "confidence": 65,
    "interestRates": {"fedRate": "5.25-5.50%", "trend": "expected_cuts", "impact": "positive"},
    "yieldCurve": {"twoYear": "4.65%", "tenYear": "4.25%", "status": "inverted", "impact": "caution"},
    "inflation": {"cpi": "3.1%", "trend": "cooling", "impact": "positive"},
    "gdp": {"growth": "2.5%", "trend": "stable", "impact": "neutral"},
    "fedStance": "dovish",
    "dollarStrength": "moderate",
    "keyFactors": ["Fed rate cuts expected Q3", "Cooling inflation supports growth"],
    "sectorImpact": "Tech benefits from lower rates due to DCF model impact",
    "whyMayFail": "Inverted yield curve historically precedes recessions, delayed impact"
  },

  "newsGeopolitical": {
    "signal": "BULLISH|BEARISH|NEUTRAL",
    "confidence": 70,
    "newsItems": [
      {"headline": "AI chip breakthrough announced", "impactScore": 8, "sentiment": "positive", "category": "product"},
      {"headline": "China regulatory pressure", "impactScore": 5, "sentiment": "negative", "category": "regulatory"}
    ],
    "geopoliticalRisks": ["US-China tensions", "Supply chain disruption risk"],
    "analystMoves": [{"firm": "Goldman Sachs", "action": "Upgrade", "target": "225"}],
    "sentiment": "cautiously_optimistic",
    "whyMayFail": "Escalation in US-China trade war could severely impact supply chain"
  },

  "debate": {
    "bullCase": {
      "summary": "Strong technical breakout with volume, AI catalyst, favorable macro shift",
      "bestCase": "Target $225+ if AI revenue accelerates and Fed cuts rates",
      "catalysts": ["M5 chip launch", "AI services revenue growth", "Fed rate cuts", "Buyback program"],
      "probability": 65
    },
    "bearCase": {
      "summary": "Overbought technically, premium valuation, geopolitical headwinds",
      "worstCase": "Drop to $170 if China bans Apple products and recession hits",
      "headwinds": ["China market share loss", "Regulatory pressure in EU", "Valuation compression", "Competition from Samsung/Huawei"],
      "probability": 35
    },
    "riskManager": {
      "confirmations": 3,
      "confirmationDetail": "Technical + Volume + Fundamental confirmed bullish",
      "contradictions": ["Macro yield curve inversion vs technical bullish"],
      "riskReward": "1:3.2",
      "positionSize": "2.5% of portfolio",
      "maxRiskPerTrade": "1%",
      "stopLossDistance": "3.6%",
      "takeProfitDistance": "11.5%",
      "noGoConditions": ["None triggered"],
      "positionSizing": "For $100K portfolio: risk $1K, buy ~$27.7K worth (142 shares at $195)"
    }
  },

  "scoring": {
    "technical": {"signal": 1, "weightedScore": 27.3},
    "fundamental": {"signal": 1, "weightedScore": 18.0},
    "macro": {"signal": 1, "weightedScore": 13.0},
    "newsGeopolitical": {"signal": 1, "weightedScore": 14.0},
    "totalScore": 72.3,
    "threshold": "STRONG_BUY"
  },

  "final": {
    "ticker": "AAPL",
    "bias": "BULLISH",
    "setup": "Breakout above resistance with volume confirmation, AI catalyst, Golden Cross on daily",
    "entry": "$193.50 - $195.50",
    "stop": "$188.00 (risk: 3.6%)",
    "targets": {
      "tp1": "$200.00 (+2.3%, 1:0.6R)",
      "tp2": "$207.00 (+5.9%, 1:1.6R)",
      "tp3": "$215.00 (+10.0%, 1:2.8R)"
    },
    "probability": "65%",
    "timeframe": "swing trading",
    "riskReward": "1:3.2",
    "mainDrivers": ["AI chip catalyst", "Golden Cross confirmation", "Volume breakout", "Favorable macro shift"],
    "riskFactors": ["Overbought RSI", "China regulatory risk", "Inverted yield curve", "Premium valuation"],
    "verdict": "BUY",
    "confidence": 72,
    "positionSize": "142 shares (~$27.7K) for 1% risk on $100K portfolio"
  }
}

CRITICAL: Return ONLY pure JSON, no markdown code blocks, no comments outside JSON.`;

export async function POST(request: NextRequest) {
  try {
    const body: QuantRequest = await request.json();
    const { ticker, universe, timeframe, riskPerTrade, historicalPeriod } = body;

    if (!ticker || ticker.trim().length < 1) {
      return NextResponse.json({ error: 'Ticker është i nevojshëm' }, { status: 400 });
    }

    const userMessage = `Run the FULL multi-agent quant analysis for ${ticker.toUpperCase()}.

Configuration:
- Universe: ${universe || 'sp500'} (S&P 500 high-liquidity stocks only)
- Timeframe: ${timeframe || 'swing'} (${timeframe === 'day' ? 'day trading — intraday levels' : timeframe === 'long-term' ? 'long-term investing — weekly/monthly levels' : 'swing trading — daily levels, 3-15 day holds'})
- Historical period: ${historicalPeriod || '1y'}
- Max risk per trade: ${riskPerTrade || 1}%

Requirements:
1. Run ALL 4 agents independently
2. Run the debate panel (bull vs bear vs risk manager)
3. Apply the scoring engine with weights: Technical 35%, Fundamental 25%, Macro 20%, News/Geo 20%
4. Check MINIMUM 3 confirmations rule — if fewer than 3 agents agree, verdict MUST be "NO TRADE"
5. Include Pivot Points (PP, S1, S2, S3, R1, R2, R3)
6. Include ADX for trend strength
7. Include SMA 200 crossover status (Golden Cross / Death Cross)
8. Include specific entry zone, stop loss, and 3 take profit levels
9. Include position sizing based on ${riskPerTrade || 1}% risk
10. Each agent MUST include "whyMayFail" — what could make this analysis wrong
11. Be specific with numbers — exact prices, exact percentages
12. Timeframe-appropriate analysis (${timeframe || 'swing'} trading)`;

    const content = await callAI({
      systemPrompt: SYSTEM_PROMPT,
      userMessage,
      temperature: 0.2,
      maxTokens: 8000,
      timeoutMs: 90000,
      retries: 1,
    });

    const fallback = {
      ticker: ticker.toUpperCase(),
      company: '',
      sector: '',
      currentPrice: 0,
      technical: { signal: 'NEUTRAL', confidence: 50, shortTermTrend: 'sideways', mediumTermTrend: 'sideways', longTermTrend: 'sideways', supportLevels: [], resistanceLevels: [], patterns: [], whyMayFail: 'Analiza u ndërpre' },
      fundamental: { signal: 'NEUTRAL', confidence: 50, keyFactors: [], whyMayFail: 'Analiza u ndërpre' },
      macro: { signal: 'NEUTRAL', confidence: 50, keyFactors: [], whyMayFail: 'Analiza u ndërpre' },
      newsGeopolitical: { signal: 'NEUTRAL', confidence: 50, newsItems: [], geopoliticalRisks: [], whyMayFail: 'Analiza u ndërpre' },
      debate: { bullCase: { summary: '', bestCase: '', catalysts: [], probability: 50 }, bearCase: { summary: '', worstCase: '', headwinds: [], probability: 50 }, riskManager: { confirmations: 0, confirmationDetail: '', contradictions: [], riskReward: 'N/A', positionSize: 'N/A', maxRiskPerTrade: '1%', noGoConditions: [], positionSizing: '' } },
      scoring: { technical: { signal: 0, weightedScore: 0 }, fundamental: { signal: 0, weightedScore: 0 }, macro: { signal: 0, weightedScore: 0 }, newsGeopolitical: { signal: 0, weightedScore: 0 }, totalScore: 0, threshold: 'NO_TRADE' },
      final: { ticker: ticker.toUpperCase(), bias: 'NEUTRAL', setup: '', entry: 'N/A', stop: 'N/A', targets: { tp1: 'N/A', tp2: 'N/A', tp3: 'N/A' }, probability: 'N/A', timeframe: timeframe || 'swing', riskReward: 'N/A', mainDrivers: [], riskFactors: ['AI analysis incomplete'], verdict: 'NO TRADE', confidence: 0 },
    };

    const analysis = parseAIResponse(content, fallback);

    return NextResponse.json({ analysis });
  } catch (error: unknown) {
    if (error instanceof AIError) {
      console.error('Quant analysis AI error:', error.code, error.message);
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 502 }
      );
    }
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('Quant analysis error:', message);
    return NextResponse.json({ error: 'Quant analysis dështoi. Provo përsëri.' }, { status: 500 });
  }
}
