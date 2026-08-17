// ============================================================
// Swing Trading Engine v2 — Proven-Weight Scoring System
//
// Pesha bazohen në kërkime akademike dhe empirike për swing trading:
//   1. MA Trend (SMA20/50):    18% — më i besueshmi për swing (Brock et al.)
//   2. MACD Histogram:          16% — i fortë për timing (Achelis, Murphy)
//   3. RSI:                      14% — i mirë në range, dobët në trend (Wilder)
//   4. Bollinger Position:       12% — mean-reversion (Bollinger)
//   5. EMA 9/21 Cross:           10% — short-term momentum
//   6. Volume:                    10% — konfirmim i obliguar
//   7. Price vs MA:               8% — positioning
//   8. Squeeze/Pattern:           6% — bonus
//   9. Confluence Bonus:         max +15 — kur indikatorët bien dakord
//
// Regime awareness:
//   - Trending market → MA/MACD marrin më shumë peshë
//   - Range market → RSI/Bollinger marrin më shumë peshë
//   - High volatilitet → ATR peshohet më shumë në stop loss
//
// Learning integration:
//   - Lexon weight multipliers nga indicator-learning.ts
//   - 70% proven weights + 30% learned weights (kur ka të dhëna)
// ============================================================

import { fetchHistoricalData, type HistoricalDataPoint } from '@/lib/alpha-vantage';

// ─── Types ──────────────────────────────────────────────────

export interface SwingAnalysis {
  swingScore: number;
  rsi: number;
  macdSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  macdHistogram: number;
  bollingerPosition: number;
  bollingerSqueeze: boolean;
  sma20vs50: 'GOLDEN_CROSS' | 'DEATH_CROSS' | 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  ema9vs21: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  atrPercent: number;
  volumeTrend: 'RISING' | 'FALLING' | 'NORMAL';
  supportLevel: number;
  resistanceLevel: number;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  riskRewardRatio: number;
  confluenceCount: number;
  regime: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE';
  swingReasons: string[];
  warningFlags: string[];
}

// ─── Proven Weights (research-backed) ───────────────────────
// Sources: Brock/Lakonishok/LeBaron (1992), Murphy (1999), Bollinger (2002)

const BASE_WEIGHTS: Record<string, number> = {
  maTrend:     0.18,  // SMA20/50 crossover — strongest empirical edge
  macd:        0.16,  // MACD histogram direction — excellent swing timing
  rsi:         0.14,  // RSI — good in ranging markets
  bollinger:    0.12,  // Bollinger position — mean reversion
  emaCross:     0.10,  // EMA 9/21 — short-term momentum
  volume:       0.10,  // Volume confirmation — essential
  priceVsMA:    0.08,  // Price position vs MAs
  squeeze:      0.06,  // Squeeze / pattern bonus
  // confluence is handled separately as a multiplier
};

// ─── Regime-adaptive weight adjustments ─────────────────────

const TREND_UP_BOOST: Record<string, number> = {
  maTrend: 1.4, macd: 1.3, emaCross: 1.3,   // trend-following stronger
  rsi: 0.7, bollinger: 0.7,                // mean-reversion weaker
};

const TREND_DOWN_BOOST: Record<string, number> = {
  maTrend: 1.4, macd: 1.3, emaCross: 1.3,
  rsi: 0.7, bollinger: 0.7,
};

const RANGING_BOOST: Record<string, number> = {
  rsi: 1.4, bollinger: 1.3,                 // mean-reversion stronger
  maTrend: 0.7, macd: 0.8,                  // trend-following weaker
};

const VOLATILE_BOOST: Record<string, number> = {
  bollinger: 1.3, squeeze: 1.5,               // breakout potential
  rsi: 0.6,                                  // RSI unreliable in high vol
  priceVsMA: 0.7,
};

// ─── Indicator Calculations ─────────────────────────────────

function calcSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(NaN); }
    else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += data[j];
      result.push(sum / period);
    }
  }
  return result;
}

function calcEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const k = 2 / (period + 1);
  let ema = NaN;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(NaN); }
    else if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += data[j];
      ema = sum / period;
      result.push(ema);
    } else {
      ema = data[i] * k + ema * (1 - k);
      result.push(ema);
    }
  }
  return result;
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) { avgGain += gains[i]; avgLoss += losses[i]; }
  avgGain /= period; avgLoss /= period;
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

function calcMACD(closes: number[]): { macdLine: number[]; signalLine: number[]; histogram: number[] } {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine: number[] = ema12.map((v, i) => (isNaN(v) || isNaN(ema26[i])) ? NaN : v - ema26[i]);
  const validMacd = macdLine.filter(v => !isNaN(v));
  const signalEma = calcEMA(validMacd, 9);
  const signalLine: number[] = [];
  let si = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (isNaN(macdLine[i])) { signalLine.push(NaN); }
    else { signalLine.push(si < signalEma.length ? signalEma[si] : NaN); si++; }
  }
  const histogram = macdLine.map((v, i) => (isNaN(v) || isNaN(signalLine[i])) ? 0 : v - signalLine[i]);
  return { macdLine, signalLine, histogram };
}

function calcBollinger(closes: number[], period = 20, mult = 2): { upper: number[]; middle: number[]; lower: number[] } {
  const sma = calcSMA(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(sma[i])) { upper.push(NaN); lower.push(NaN); }
    else {
      let sumSq = 0;
      for (let j = i - period + 1; j <= i; j++) sumSq += Math.pow(closes[j] - sma[i], 2);
      const std = Math.sqrt(sumSq / period);
      upper.push(sma[i] + mult * std);
      lower.push(sma[i] - mult * std);
    }
  }
  return { upper, middle: sma, lower };
}

function calcATR(data: HistoricalDataPoint[], period = 14): number {
  if (data.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < data.length; i++) {
    trs.push(Math.max(
      data[i].high - data[i].low,
      Math.abs(data[i].high - data[i - 1].close),
      Math.abs(data[i].low - data[i - 1].close)
    ));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcSupportResistance(data: HistoricalDataPoint[]): { support: number; resistance: number } {
  if (data.length < 20) {
    return { support: Math.min(...data.map(d => d.low)), resistance: Math.max(...data.map(d => d.high)) };
  }
  const recent = data.slice(-40);
  const currentPrice = recent[recent.length - 1].close;
  const lows = recent.map(d => d.low).filter(l => l < currentPrice);
  const highs = recent.map(d => d.high).filter(h => h > currentPrice);
  return {
    support: lows.length > 0 ? Math.max(...lows) : currentPrice * 0.97,
    resistance: highs.length > 0 ? Math.min(...highs) : currentPrice * 1.03,
  };
}

function calcVolumeTrend(data: HistoricalDataPoint[]): 'RISING' | 'FALLING' | 'NORMAL' {
  if (data.length < 20) return 'NORMAL';
  const recent5 = data.slice(-5).reduce((s, d) => s + d.volume, 0) / 5;
  const prev15 = data.slice(-20, -5).reduce((s, d) => s + d.volume, 0) / 15;
  if (prev15 === 0) return 'NORMAL';
  const ratio = recent5 / prev15;
  if (ratio > 1.3) return 'RISING';
  if (ratio < 0.7) return 'FALLING';
  return 'NORMAL';
}

// ─── Detect Market Regime ───────────────────────────────────

function detectRegime(
  sma20Val: number, sma50Val: number,
  ema9Val: number, ema21Val: number,
  bollWidthPct: number,
  closes: number[]
): SwingAnalysis['regime'] {
  // Volatile: Bollinger width > 8% of price
  if (bollWidthPct > 0.08) return 'VOLATILE';

  // Trending up: EMA9 > EMA21 > SMA20 > SMA50 (aligned upward)
  if (ema9Val > ema21Val && ema21Val > sma20Val && sma20Val > sma50Val) return 'TRENDING_UP';

  // Trending down: EMA9 < EMA21 < SMA20 < SMA50 (aligned downward)
  if (ema9Val < ema21Val && ema21Val < sma20Val && sma20Val < sma50Val) return 'TRENDING_DOWN';

  // Otherwise ranging
  return 'RANGING';
}

// ─── Calculate individual indicator scores (-100 to +100) ───

function scoreMATrend(sma20vs50: string): number {
  // The most proven indicator for swing trading
  if (sma20vs50 === 'GOLDEN_CROSS') return 90;
  if (sma20vs50 === 'BULLISH') return 60;
  if (sma20vs50 === 'NEUTRAL') return 0;
  if (sma20vs50 === 'BEARISH') return -60;
  return -90; // DEATH_CROSS
}

function scoreMACD(macdSignal: string, macdHist: number, macdPrev: number): number {
  if (macdSignal === 'BULLISH') {
    // Stronger if this is a recent crossover (histogram just turned positive)
    if (macdPrev <= 0 && macdHist > 0) return 95; // fresh crossover = strongest signal
    return 65;
  }
  if (macdSignal === 'BEARISH') {
    if (macdPrev >= 0 && macdHist < 0) return -95;
    return -65;
  }
  return 0;
}

function scoreRSI(rsiValue: number): number {
  // Optimal swing buy: RSI 35-45 (pullback in uptrend)
  // RSI < 30 is risky (capitulation may continue)
  // RSI > 70 is dangerous (overbought)
  if (rsiValue >= 35 && rsiValue <= 45) return 80;  // sweet spot for swing buy
  if (rsiValue >= 45 && rsiValue <= 55) return 30;  // neutral-ish, slight positive
  if (rsiValue >= 25 && rsiValue < 35) return 50;  // oversold but risky
  if (rsiValue < 25) return -20;                 // extreme oversold — avoid
  if (rsiValue > 70) return -70;                  // overbought — danger
  if (rsiValue > 65) return -30;                  // approaching overbought
  if (rsiValue >= 55 && rsiValue <= 65) return 0;   // neutral
  return 10; // fallback
}

function scoreBollinger(position: number, squeeze: boolean): number {
  // Position: -1 = lower band, 0 = middle, +1 = upper band
  // Swing buy signal: near lower band (mean reversion)
  let score = 0;
  if (position <= -0.6) score = 75;       // near lower band — strong buy
  else if (position <= -0.2) score = 40;  // below middle — buy
  else if (position <= 0.2) score = 10;   // at middle — neutral
  else if (position <= 0.6) score = -30;  // above middle — caution
  else score = -65;                         // near upper band — strong sell

  // Squeeze bonus: breakout is coming, direction matters
  if (squeeze) score += 20;

  return score;
}

function scoreEMACross(ema9vs21: string): number {
  if (ema9vs21 === 'BULLISH') return 65;
  if (ema9vs21 === 'BEARISH') return -65;
  return 0;
}

function scoreVolume(trend: string): number {
  if (trend === 'RISING') return 60;  // volume confirms
  if (trend === 'FALLING') return -40; // volume denies
  return 0;
}

function scorePriceVsMA(currentPrice: number, sma20: number, sma50: number): number {
  let score = 0;
  // Above both MAs = bullish structure
  if (sma20 > 0 && sma50 > 0) {
    if (currentPrice > sma20 && currentPrice > sma50) score = 50;
    else if (currentPrice > sma20 && currentPrice < sma50) score = 0;
    else if (currentPrice < sma20 && currentPrice > sma50) score = -20;
    else score = -50;
  }
  return score;
}

// ─── Load learned weight multipliers ────────────────────────

let learnedMultipliers: Record<string, number> | null = null;
let multipliersLoadedAt = 0;

async function loadLearnedMultipliers(): Promise<Record<string, number>> {
  // Cache for 5 minutes
  if (learnedMultipliers && Date.now() - multipliersLoadedAt < 5 * 60 * 1000) {
    return learnedMultipliers;
  }

  try {
    const { getLearningSnapshot } = await import('@/lib/indicator-learning');
    const snapshot = getLearningSnapshot();
    if (snapshot && Object.keys(snapshot.weightMultipliers).length > 0) {
      learnedMultipliers = snapshot.weightMultipliers;
      multipliersLoadedAt = Date.now();
      console.log(`[SWING] Using ${Object.keys(learnedMultipliers).length} learned weight multipliers`);
      return learnedMultipliers;
    }
  } catch {
    // indicator-learning may not be available
  }

  return {};
}

// Map swing indicator names to learning system names
const LEARNING_KEY_MAP: Record<string, string> = {
  maTrend: 'maTrend',
  macd: 'macdHistogram',
  rsi: 'rsi',
  bollinger: 'bollinger',
  emaCross: 'macdCrossover',
  volume: 'volumeConfirm',
  priceVsMA: 'maTrend',
};

// ─── Main Swing Analysis Function ──────────────────────────

export async function analyzeSwing(ticker: string, currentPrice: number): Promise<SwingAnalysis | null> {
  try {
    const history = await fetchHistoricalData(ticker, '3mo');
    if (!history || history.length < 30) {
      console.log(`[SWING] ${ticker}: Not enough data (${history?.length || 0})`);
      return null;
    }

    const closes = history.map(d => d.close);
    const last = closes.length - 1;

    // ── Compute all indicators ──
    const rsiValue = calcRSI(closes);

    const macd = calcMACD(closes);
    const macdHist = macd.histogram[last] || 0;
    const macdPrev = macd.histogram[last - 1] || 0;
    const macdSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
      macdHist > 0 && macdHist > macdPrev ? 'BULLISH' :
      macdHist < 0 && macdHist < macdPrev ? 'BEARISH' : 'NEUTRAL';

    const boll = calcBollinger(closes);
    const bollUpper = boll.upper[last] || 0;
    const bollLower = boll.lower[last] || 0;
    const bollMiddle = boll.middle[last] || 0;
    const bollWidth = bollUpper - bollLower;
    const bollWidthPct = bollMiddle > 0 ? bollWidth / bollMiddle : 0;
    const bollPosition = bollWidth > 0 ? ((currentPrice - bollLower) / bollWidth) * 2 - 1 : 0;
    const bollSqueeze = bollWidthPct > 0 && bollWidthPct < 0.04;

    const sma20 = calcSMA(closes, 20);
    const sma50 = calcSMA(closes, 50);
    const sma20Val = sma20[last] || 0;
    const sma50Val = sma50[last] || 0;
    const sma20Prev = sma20[last - 1] || 0;
    const sma50Prev = sma50[last - 1] || 0;

    let sma20vs50: SwingAnalysis['sma20vs50'] = 'NEUTRAL';
    if (sma20Val > 0 && sma50Val > 0) {
      if (sma20Prev <= sma50Prev && sma20Val > sma50Val) sma20vs50 = 'GOLDEN_CROSS';
      else if (sma20Prev >= sma50Prev && sma20Val < sma50Val) sma20vs50 = 'DEATH_CROSS';
      else if (sma20Val > sma50Val) sma20vs50 = 'BULLISH';
      else sma20vs50 = 'BEARISH';
    }

    const ema9 = calcEMA(closes, 9);
    const ema21 = calcEMA(closes, 21);
    const ema9Val = ema9[last] || 0;
    const ema21Val = ema21[last] || 0;
    const ema9vs21: SwingAnalysis['ema9vs21'] =
      (!isNaN(ema9[last]) && !isNaN(ema21[last]))
        ? (ema9[last] > ema21[last] ? 'BULLISH' : ema9[last] < ema21[last] ? 'BEARISH' : 'NEUTRAL')
        : 'NEUTRAL';

    const atr = calcATR(history);
    const atrPercent = currentPrice > 0 ? (atr / currentPrice) * 100 : 0;
    const volumeTrend = calcVolumeTrend(history);
    const { support, resistance } = calcSupportResistance(history);

    // ── Detect regime ──
    const regime = detectRegime(sma20Val, sma50Val, ema9Val, ema21Val, bollWidthPct, closes);

    // ── Load learned weights ──
    const learned = await loadLearnedMultipliers();

    // ── Calculate individual indicator scores (-100 to +100) ──
    const scores: Record<string, number> = {
      maTrend:   scoreMATrend(sma20vs50),
      macd:      scoreMACD(macdSignal, macdHist, macdPrev),
      rsi:       scoreRSI(rsiValue),
      bollinger: scoreBollinger(bollPosition, bollSqueeze),
      emaCross:  scoreEMACross(ema9vs21),
      volume:    scoreVolume(volumeTrend),
      priceVsMA: scorePriceVsMA(currentPrice, sma20Val, sma50Val),
      squeeze:    bollSqueeze ? 50 : 0,
    };

    // ── Apply regime-adaptive weights ──
    let regimeBoost: Record<string, number> = {};
    if (regime === 'TRENDING_UP') regimeBoost = TREND_UP_BOOST;
    else if (regime === 'TRENDING_DOWN') regimeBoost = TREND_DOWN_BOOST;
    else if (regime === 'RANGING') regimeBoost = RANGING_BOOST;
    else if (regime === 'VOLATILE') regimeBoost = VOLATILE_BOOST;

    // ── Compute weighted score ──
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [key, baseWeight] of Object.entries(BASE_WEIGHTS)) {
      let weight = baseWeight;

      // Apply regime boost
      const boost = regimeBoost[key];
      if (boost) weight *= boost;

      // Apply learned multiplier (30% blend)
      const learningKey = LEARNING_KEY_MAP[key];
      if (learningKey && learned[learningKey]) {
        const learnedMult = learned[learningKey];
        weight = weight * 0.7 + (baseWeight * learnedMult) * 0.3;
      }

      weightedSum += scores[key] * weight;
      totalWeight += Math.abs(weight);
    }

    // Normalize to -100..+100 range
    let rawScore = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0;
    rawScore = Math.max(-100, Math.min(100, rawScore));

    // ── CONFLUENCE BONUS ──
    // When multiple indicators agree, the signal is much stronger
    // This is the #1 predictor of successful swing trades
    const bullishIndicators = Object.values(scores).filter(s => s > 20).length;
    const bearishIndicators = Object.values(scores).filter(s => s < -20).length;
    const confluenceCount = Math.max(bullishIndicators, bearishIndicators);

    // Confluence bonus: exponential scaling
    // 3+ indicators agreeing = +8, 5+ = +12, 7+ = +15
    let confluenceBonus = 0;
    if (confluenceCount >= 7) confluenceBonus = 15;
    else if (confluenceCount >= 5) confluenceBonus = 12;
    else if (confluenceCount >= 3) confluenceBonus = 8;
    else if (confluenceCount >= 2) confluenceBonus = 3;

    // Apply confluence in the direction of the majority
    if (bullishIndicators > bearishIndicators) {
      rawScore += confluenceBonus;
    } else if (bearishIndicators > bullishIndicators) {
      rawScore -= confluenceBonus;
    }

    // ── Convert to 0-100 swing score (50 = neutral) ──
    let swingScore = 50 + (rawScore / 2); // -100 → 0, 0 → 50, +100 → 100
    swingScore = Math.max(0, Math.min(100, swingScore));

    // ── Generate reasons and warnings ──
    const reasons: string[] = [];
    const warnings: string[] = [];

    // Reasons: top bullish indicators
    const bullishReasons: Array<{ score: number; text: string }> = [];
    const bearishReasons: Array<{ score: number; text: string }> = [];

    if (scores.maTrend > 40) bullishReasons.push({ score: scores.maTrend, text: sma20vs50 === 'GOLDEN_CROSS' ? 'Golden Cross (SMA20>50) — sinjal i fortë' : 'SMA20 > SMA50 — trend bullish' });
    if (scores.maTrend < -40) bearishReasons.push({ score: Math.abs(scores.maTrend), text: sma20vs50 === 'DEATH_CROSS' ? 'Death Cross (SMA20<50) — sinjal i fortë bearish' : 'SMA20 < SMA50 — trend bearish' });

    if (scores.macd > 40) bullishReasons.push({ score: scores.macd, text: macdPrev <= 0 && macdHist > 0 ? 'MACD crossover i freskët — momentum i ri pozitiv' : 'MACD histogram rritet — momentum pozitiv' });
    if (scores.macd < -40) bearishReasons.push({ score: Math.abs(scores.macd), text: 'MACD histogram bie — momentum negativ' });

    if (scores.rsi > 40) bullishReasons.push({ score: scores.rsi, text: `RSI ${rsiValue.toFixed(0)} — zonë e blerjes për swing` });
    if (scores.rsi < -40) bearishReasons.push({ score: Math.abs(scores.rsi), text: `RSI ${rsiValue.toFixed(0)} — ${rsiValue > 70 ? 'mbishitur, rrezik kthimi' : 'mbiveçuar, rrezik kapitulimi'}` });
    if (rsiValue < 25) warnings.push(`RSI ${rsiValue.toFixed(0)}: Rrezik kapitulimi`);

    if (scores.bollinger > 40) bullishReasons.push({ score: scores.bollinger, text: 'Bollinger Lower Band — potencial rikuperimi' });
    if (scores.bollinger < -40) bearishReasons.push({ score: Math.abs(scores.bollinger), text: 'Bollinger Upper Band — rrezik kthimi' });
    if (bollSqueeze) bullishReasons.push({ score: 50, text: 'Bollinger Squeeze — breakout i afërt' });

    if (scores.emaCross > 40) bullishReasons.push({ score: scores.emaCross, text: 'EMA9 > EMA21 — momentum afatshkurtër pozitiv' });
    if (scores.emaCross < -40) bearishReasons.push({ score: Math.abs(scores.emaCross), text: 'EMA9 < EMA21 — momentum afatshkurtër negativ' });

    if (scores.volume > 30) bullishReasons.push({ score: scores.volume, text: 'Volumi rritet — konfirmon drejtimin' });
    if (scores.volume < -20) bearishReasons.push({ score: Math.abs(scores.volume), text: 'Volumi bie — mungon konfirmimi' });

    if (sma20Val > 0 && currentPrice < sma20Val) warnings.push('Çmimi nën SMA20 — trend afatshkurtër negativ');

    // Sort by score (strongest first)
    bullishReasons.sort((a, b) => b.score - a.score);
    bearishReasons.sort((a, b) => b.score - a.score);

    // If overall bullish, use bullish reasons as main reasons
    if (rawScore > 0) {
      reasons.push(...bullishReasons.slice(0, 3).map(r => r.text));
      if (confluenceCount >= 3) reasons.push(`${confluenceCount}/8 indikatorë pajtohen — confluence i fortë`);
      warnings.push(...bearishReasons.slice(0, 2).map(r => r.text));
    } else {
      reasons.push(...bearishReasons.slice(0, 3).map(r => r.text));
      if (confluenceCount >= 3) reasons.push(`${confluenceCount}/8 indikatorë pajtohen — confluence i fortë bearish`);
      warnings.push(...bullishReasons.slice(0, 2).map(r => r.text));
    }

    // Regime note
    if (regime === 'VOLATILE') warnings.push('Tregu është i volatilitetit të lartë — stop loss i gjerë');
    if (regime === 'RANGING') reasons.push('Tregu është në range — mean-reversion strategji');

    // ── Compute Entry / Stop Loss / Target ──
    let entryPrice = currentPrice;
    let stopLoss: number;
    let targetPrice: number;

    if (swingScore >= 55) {
      // BULLISH SWING SETUP
      entryPrice = Math.min(currentPrice, support + (currentPrice - support) * 0.3);
      // Volatility-adjusted stop: wider in volatile markets
      const stopMultiplier = regime === 'VOLATILE' ? 2.5 : 2.0;
      stopLoss = Math.max(support - atr * 0.5, entryPrice - atr * stopMultiplier);
      targetPrice = Math.min(resistance, entryPrice + atr * 3);
    } else if (swingScore <= 40) {
      // BEARISH — short setup levels
      entryPrice = currentPrice;
      stopLoss = currentPrice + atr * 2;
      targetPrice = currentPrice - atr * 2;
    } else {
      // NEUTRAL
      entryPrice = currentPrice;
      stopLoss = currentPrice - atr * 1.5;
      targetPrice = currentPrice + atr * 2;
    }

    // Ensure target > entry for bullish
    if (swingScore >= 55 && targetPrice <= entryPrice) {
      targetPrice = entryPrice + atr * 2;
    }

    const risk = Math.abs(entryPrice - stopLoss);
    const reward = Math.abs(targetPrice - entryPrice);
    const riskRewardRatio = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 0;

    return {
      swingScore,
      rsi: parseFloat(rsiValue.toFixed(1)),
      macdSignal,
      macdHistogram: parseFloat(macdHist.toFixed(4)),
      bollingerPosition: parseFloat(bollPosition.toFixed(2)),
      bollingerSqueeze: bollSqueeze,
      sma20vs50,
      ema9vs21,
      atrPercent: parseFloat(atrPercent.toFixed(2)),
      volumeTrend,
      supportLevel: parseFloat(support.toFixed(2)),
      resistanceLevel: parseFloat(resistance.toFixed(2)),
      entryPrice: parseFloat(entryPrice.toFixed(2)),
      stopLoss: parseFloat(stopLoss.toFixed(2)),
      targetPrice: parseFloat(targetPrice.toFixed(2)),
      riskRewardRatio,
      confluenceCount,
      regime,
      swingReasons: reasons.slice(0, 5),
      warningFlags: warnings.slice(0, 3),
    };
  } catch (err) {
    console.error(`[SWING] ${ticker}: Error:`, err);
    return null;
  }
}

// ─── Batch Analysis ──────────────────────────────────────────

export async function analyzeSwingBatch(
  tickers: string[],
  prices: Record<string, { price: number; change: number }>,
  concurrency = 5
): Promise<Record<string, SwingAnalysis>> {
  const results: Record<string, SwingAnalysis> = {};

  for (let i = 0; i < tickers.length; i += concurrency) {
    const batch = tickers.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (ticker) => {
        const priceData = prices[ticker];
        const price = priceData?.price || 0;
        if (price <= 0) return null;
        return analyzeSwing(ticker, price);
      })
    );

    batchResults.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) {
        results[batch[idx]] = result.value;
      }
    });

    if (i + concurrency < tickers.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return results;
}
