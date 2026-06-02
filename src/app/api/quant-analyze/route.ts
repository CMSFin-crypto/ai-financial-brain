import { NextRequest, NextResponse } from 'next/server';
import { callAI, parseAIResponse, AIError } from '@/lib/ai';
import { getStock, type StockProfile } from '@/lib/market-data';

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

// ═══════════════════════════════════════════
// DEMO DATA — realistic simulation when AI is unreachable
// ═══════════════════════════════════════════

// Stock profiles now imported from centralized market-data module

function generateDemoAnalysis(ticker: string, timeframe: string, riskPerTrade: number) {
  const t = ticker.toUpperCase();
  const raw = getStock(t);
  const p = raw ? {
    company: raw.company, sector: raw.sector, price: raw.price,
    pe: raw.pe, fwdPE: raw.fwdPE, peg: raw.peg, revGrowth: raw.revGrowth, epsGrowth: raw.epsGrowth,
    margin: raw.grossMargin, fcf: raw.fcf, debtEq: raw.debtEq,
    moat: raw.moat, analystTarget: raw.targetPrice, analystRating: raw.rating
  } : {
    company: t + ' Corp', sector: 'Technology', price: 150 + Math.random() * 100,
    pe: 25, fwdPE: 22, peg: 1.5, revGrowth: '10%', epsGrowth: '12%',
    margin: '35%', fcf: '5.0B', debtEq: 0.5, moat: 'NARROW', analystTarget: '180.00', analystRating: 'HOLD'
  };

  const price = p.price;
  const isBullish = p.analystRating.includes('BUY');
  const bullProb = isBullish ? 60 + Math.floor(Math.random() * 15) : 35 + Math.floor(Math.random() * 15);

  const techScore = isBullish ? (25 + Math.random() * 12) : -(15 + Math.random() * 10);
  const fundScore = isBullish ? (16 + Math.random() * 8) : -(8 + Math.random() * 6);
  const macroScore = 8 + Math.random() * 8;
  const newsScore = isBullish ? (10 + Math.random() * 8) : -(5 + Math.random() * 6);

  const totalScore = Math.round((techScore + fundScore + macroScore + newsScore) * 10) / 10;

  let threshold = 'NO_TRADE';
  let verdict = 'NO TRADE';
  if (totalScore >= 60) { threshold = 'STRONG_BUY'; verdict = 'BUY'; }
  else if (totalScore >= 35) { threshold = 'BUY'; verdict = 'BUY'; }
  else if (totalScore >= 10) { threshold = 'LEAN_BULLISH'; verdict = 'BUY'; }
  else if (totalScore <= -10) { threshold = 'LEAN_BEARISH'; verdict = 'SELL'; }
  else if (totalScore <= -35) { threshold = 'SELL'; verdict = 'SELL'; }

  const confirmations = isBullish ? 3 : 1;
  const entryLow = (price * 0.995).toFixed(2);
  const entryHigh = price.toFixed(2);
  const stopDist = (price * 0.036).toFixed(2);
  const stop = (price - price * 0.036).toFixed(2);
  const tp1 = (price * 1.023).toFixed(2);
  const tp2 = (price * 1.059).toFixed(2);
  const tp3 = (price * 1.10).toFixed(2);
  const rr = (3.2 + Math.random()).toFixed(1);

  const riskAmt = riskPerTrade || 1;
  const posValue = ((riskAmt / 100) * 100000 / (price * 0.036)).toFixed(0);
  const shares = Math.floor(parseFloat(posValue) / price);
  const posCost = (shares * price).toFixed(0);

  const sma20 = (price * 0.99).toFixed(2);
  const sma50 = (price * 0.96).toFixed(2);
  const sma200 = (price * 0.91).toFixed(2);

  return {
    ticker: t,
    company: p.company,
    sector: p.sector,
    currentPrice: price,
    timestamp: new Date().toISOString(),
    universe: 'sp500',
    isDemo: true,
    technical: {
      signal: isBullish ? 'BULLISH' : 'NEUTRAL',
      confidence: 55 + Math.floor(Math.random() * 25),
      shortTermTrend: isBullish ? 'uptrend' : 'sideways',
      mediumTermTrend: isBullish ? 'uptrend' : 'sideways',
      longTermTrend: isBullish ? 'uptrend' : 'sideways',
      rsi: { value: 45 + Math.floor(Math.random() * 25), signal: 'neutral' },
      macd: { value: (Math.random() * 2 - 0.5).toFixed(2), signal: isBullish ? 'bullish' : 'neutral', histogram: (Math.random() * 0.5).toFixed(2) },
      sma: { sma20, sma50, sma200, goldenCross: isBullish, deathCross: !isBullish },
      ema: { ema12: (price * 0.997).toFixed(2), ema26: (price * 0.993).toFixed(2), cross: isBullish ? 'bullish' : 'neutral' },
      bollingerBands: { upper: (price * 1.04).toFixed(2), middle: price.toFixed(2), lower: (price * 0.96).toFixed(2), position: 'near_middle' },
      adx: { value: 20 + Math.floor(Math.random() * 20), signal: 'trending', strength: 'moderate' },
      stochastic: { k: 60 + Math.floor(Math.random() * 20), d: 55 + Math.floor(Math.random() * 15), signal: isBullish ? 'bullish' : 'neutral' },
      atr: { value: (price * 0.022).toFixed(2), volatility: 'moderate' },
      volume: { trend: isBullish ? 'increasing' : 'average', signal: isBullish ? 'bullish' : 'neutral', vsAverage: '1.2x' },
      pivotPoints: { pp: price.toFixed(2), s1: (price * 0.983).toFixed(2), s2: (price * 0.965).toFixed(2), s3: (price * 0.947).toFixed(2), r1: (price * 1.018).toFixed(2), r2: (price * 1.035).toFixed(2), r3: (price * 1.053).toFixed(2) },
      supportLevels: [(price * 0.97).toFixed(2), (price * 0.95).toFixed(2), sma200],
      resistanceLevels: [(price * 1.03).toFixed(2), (price * 1.05).toFixed(2), (price * 1.08).toFixed(2)],
      patterns: isBullish ? [{ name: 'Bull Flag', type: 'bullish', reliability: 'high' }] : [],
      whyMayFail: isBullish ? 'RSI approaching overbought zone, macro uncertainty may limit upside' : 'Weak technical setup, volume declining, no clear catalyst',
      entryZone: `${entryLow}-${entryHigh}`,
      stopLoss: stop,
      takeProfits: { tp1, tp2, tp3 }
    },
    fundamental: {
      signal: p.analystRating.includes('BUY') ? 'BULLISH' : 'NEUTRAL',
      confidence: 55 + Math.floor(Math.random() * 25),
      revenue: { annual: '$' + (price * 2).toFixed(0) + 'B', growth: p.revGrowth, growth3Y: (parseFloat(p.revGrowth) + 2).toFixed(1) + '%', quarterly: (parseFloat(p.revGrowth) - 2).toFixed(1) + '%' },
      eps: { current: (price / p.pe).toFixed(2), forward: (price / p.fwdPE).toFixed(2), growth: p.epsGrowth, surprises: [{ quarter: 'Q4 2024', surprise: '+3.8%' }] },
      margins: { gross: p.margin, operating: (parseFloat(p.margin) * 0.65).toFixed(1) + '%', net: (parseFloat(p.margin) * 0.55).toFixed(1) + '%', trend: 'stable' },
      valuation: { pe: p.pe, forwardPE: p.fwdPE, peg: p.peg, ps: (p.pe * 0.25).toFixed(1), pb: (p.pe * 1.4).toFixed(1), evEbitda: (p.pe * 0.8).toFixed(1), vsSector: p.pe > 30 ? 'premium' : 'fair' },
      financialHealth: { debtEquity: p.debtEq, currentRatio: 1.05, freeCashFlow: '$' + p.fcf, rating: p.debtEq < 0.5 ? 'strong' : 'moderate' },
      moat: { type: p.moat, brandStrength: p.moat === 'WIDE' ? 9 : 5 },
      nextEarnings: '2025-07-22',
      analystConsensus: { rating: p.analystRating, target: '$' + p.analystTarget, buy: 22, hold: 10, sell: 3 },
      whyMayFail: `Valuation ${p.pe > 30 ? 'premium' : 'fair'}, ${p.debtEq > 1 ? 'high leverage' : 'moderate debt'}, sector competition`
    },
    macro: {
      signal: 'BULLISH',
      confidence: 55 + Math.floor(Math.random() * 15),
      interestRates: { fedRate: '5.25-5.50%', trend: 'expected_cuts', impact: 'positive' },
      yieldCurve: { twoYear: '4.65%', tenYear: '4.25%', status: 'inverted', impact: 'caution' },
      inflation: { cpi: '3.1%', trend: 'cooling', impact: 'positive' },
      gdp: { growth: '2.5%', trend: 'stable', impact: 'neutral' },
      fedStance: 'dovish',
      dollarStrength: 'moderate',
      keyFactors: ['Fed rate cuts expected Q3 2025', 'Cooling inflation supports growth', 'Strong labor market'],
      sectorImpact: `${p.sector} benefits from expected rate cuts and stable GDP growth`,
      whyMayFail: 'Inverted yield curve historically precedes recessions, geopolitical risks'
    },
    newsGeopolitical: {
      signal: isBullish ? 'BULLISH' : 'NEUTRAL',
      confidence: 50 + Math.floor(Math.random() * 20),
      newsItems: [
        { headline: `${p.company} reports strong quarterly results, beats estimates`, impactScore: 7, sentiment: 'positive', category: 'earnings' },
        { headline: `${p.sector} sector sees increased institutional buying`, impactScore: 6, sentiment: 'positive', category: 'market' },
        { headline: 'US-China trade negotiations ongoing, uncertainty remains', impactScore: 5, sentiment: 'negative', category: 'geopolitical' }
      ],
      geopoliticalRisks: ['US-China trade tensions', 'Fed policy uncertainty'],
      analystMoves: [{ firm: 'Goldman Sachs', action: isBullish ? 'Upgrade' : 'Hold', target: '$' + p.analystTarget }],
      sentiment: isBullish ? 'cautiously_optimistic' : 'neutral',
      whyMayFail: 'Escalation in trade tensions could impact sector significantly'
    },
    debate: {
      bullCase: {
        summary: `Strong ${p.sector.toLowerCase()} sector momentum, favorable valuation relative to growth, upcoming catalysts`,
        bestCase: `Target $${(price * 1.15).toFixed(0)}+ if earnings accelerate and macro tailwinds continue`,
        catalysts: [`Next earnings beat expected`, `${p.sector} sector rotation into growth`, 'Fed rate cuts supporting multiples', 'Institutional buying increasing'],
        probability: bullProb
      },
      bearCase: {
        summary: `${p.pe > 30 ? 'Premium valuation' : 'Moderate valuation'}, macro headwinds, competitive pressures`,
        worstCase: `Drop to $${(price * 0.85).toFixed(0)} if recession hits and earnings miss`,
        headwinds: [p.pe > 30 ? 'Valuation compression risk' : 'Limited upside catalyst', 'Geopolitical uncertainty', 'Potential recession', 'Sector rotation risk'],
        probability: 100 - bullProb
      },
      riskManager: {
        confirmations,
        confirmationDetail: confirmations >= 3 ? `${confirmations} agents confirmed bullish direction` : 'Only 1-2 confirmations — insufficient for high-conviction trade',
        contradictions: ['Macro yield curve inversion vs bullish technicals', 'Valuation vs growth debate'],
        riskReward: `1:${rr}`,
        positionSize: `${((parseFloat(posCost) / 100000) * 100).toFixed(1)}% of portfolio`,
        maxRiskPerTrade: `${riskAmt}%`,
        stopLossDistance: '3.6%',
        takeProfitDistance: '11.5%',
        noGoConditions: confirmations < 3 ? ['Less than 3 confirmations'] : [],
        positionSizing: `For $100K portfolio: risk $${(riskAmt / 100 * 1000).toFixed(0)}, buy ~$${posCost} worth (${shares} shares at $${price.toFixed(2)})`
      }
    },
    scoring: {
      technical: { signal: isBullish ? 1 : 0, weightedScore: Math.round(techScore * 10) / 10 },
      fundamental: { signal: isBullish ? 1 : 0, weightedScore: Math.round(fundScore * 10) / 10 },
      macro: { signal: 1, weightedScore: Math.round(macroScore * 10) / 10 },
      newsGeopolitical: { signal: isBullish ? 1 : -1, weightedScore: Math.round(newsScore * 10) / 10 },
      totalScore,
      threshold
    },
    final: {
      ticker: t,
      bias: isBullish ? 'BULLISH' : 'NEUTRAL',
      setup: `${isBullish ? 'Bullish momentum with' : 'Neutral setup, waiting for'} volume confirmation, ${isBullish ? 'SMA alignment favorable' : 'mixed technical signals'}, ${isBullish ? 'favorable macro backdrop' : 'awaiting catalyst'}`,
      entry: `$${entryLow} - $${entryHigh}`,
      stop: `$${stop} (risk: 3.6%)`,
      targets: {
        tp1: `$${tp1} (+2.3%, 1:0.6R)`,
        tp2: `$${tp2} (+5.9%, 1:1.6R)`,
        tp3: `$${tp3} (+10.0%, 1:2.8R)`
      },
      probability: `${bullProb}%`,
      timeframe: `${timeframe || 'swing'} trading`,
      riskReward: `1:${rr}`,
      mainDrivers: [`${p.sector} sector strength`, isBullish ? 'SMA alignment confirmed' : 'Awaiting technical confirmation', isBullish ? 'Volume trend supporting' : 'Volume neutral', 'Expected rate cuts tailwind'],
      riskFactors: [confirmations < 3 ? 'Insufficient agent confirmations' : 'Market volatility risk', 'Geopolitical uncertainty', p.pe > 30 ? 'Premium valuation risk' : 'Limited catalyst visibility', 'Macro timing uncertainty'],
      verdict,
      confidence: confirmations >= 3 ? (55 + Math.floor(Math.random() * 20)) : 25,
      positionSize: `${shares} shares (~$${posCost}) for ${riskAmt}% risk on $100K portfolio`
    }
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: QuantRequest = await request.json();
    const { ticker, universe, timeframe, riskPerTrade } = body;

    if (!ticker || ticker.trim().length < 1) {
      return NextResponse.json({ error: 'Ticker është i nevojshëm' }, { status: 400 });
    }

    const userMessage = `Run the FULL multi-agent quant analysis for ${ticker.toUpperCase()}.

Configuration:
- Universe: ${universe || 'sp500'} (S&P 500 high-liquidity stocks only)
- Timeframe: ${timeframe || 'swing'} (${timeframe === 'day' ? 'day trading — intraday levels' : timeframe === 'long-term' ? 'long-term investing — weekly/monthly levels' : 'swing trading — daily levels, 3-15 day holds'})
- Max risk per trade: ${riskPerTrade || 1}%

Requirements:
1. Run ALL 4 agents independently
2. Run the debate panel (bull vs bear vs risk manager)
3. Apply the scoring engine with weights: Technical 35%, Fundamental 25%, Macro 20%, News/Geo 20%
4. Check MINIMUM 3 confirmations rule
5. Include Pivot Points (PP, S1, S2, S3, R1, R2, R3)
6. Include ADX for trend strength
7. Include SMA 200 crossover status (Golden Cross / Death Cross)
8. Include specific entry zone, stop loss, and 3 take profit levels
9. Include position sizing based on ${riskPerTrade || 1}% risk
10. Each agent MUST include "whyMayFail"`;

    // Try real AI first, fall back to demo
    let content: string;
    try {
      content = await callAI({
        systemPrompt: SYSTEM_PROMPT,
        userMessage,
        temperature: 0.2,
        maxTokens: 8000,
        timeoutMs: 30000, // Shorter timeout for faster fallback
        retries: 0,      // No retry — go straight to demo
      });
    } catch (aiError) {
      // AI unavailable — use demo data
      console.log(`[DEMO MODE] AI unavailable for ${ticker}, using simulation data`);
      const demo = generateDemoAnalysis(ticker.trim().toUpperCase(), timeframe || 'swing', riskPerTrade || 1);
      return NextResponse.json({ analysis: demo, demo: true });
    }

    const fallback = generateDemoAnalysis(ticker.trim().toUpperCase(), timeframe || 'swing', riskPerTrade || 1);
    const analysis = parseAIResponse(content, fallback);

    return NextResponse.json({ analysis });
  } catch (error: unknown) {
    if (error instanceof AIError) {
      console.error('Quant analysis AI error:', error.code, error.message);
      return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
    }
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('Quant analysis error:', message);
    return NextResponse.json({ error: 'Quant analysis dështoi. Provo përsëri.' }, { status: 500 });
  }
}
