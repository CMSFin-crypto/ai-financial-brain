// ============================================================
// Stock Prediction Engine — Multi-Factor Technical Analysis
// Pure TypeScript, zero external dependencies, server-side only
// ============================================================

// ======================== TYPES =============================

export interface PricePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Direction = 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
export type TrendPrediction = 'UP' | 'DOWN' | 'SIDEWAYS';
export type SignalType = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type ImpactLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type RiskOrVolatility = 'LOW' | 'MEDIUM' | 'HIGH';

export interface KeyFactor {
  name: string;
  signal: SignalType;
  impact: ImpactLevel;
  score: number;
  description: string;
}

export interface TermPrediction {
  prediction: TrendPrediction;
  probability: number;
  expectedMove: number;
}

export interface PredictionResult {
  symbol: string;
  score: number;
  direction: Direction;
  confidence: number;
  shortTerm: TermPrediction;
  mediumTerm: TermPrediction;
  riskLevel: RiskOrVolatility;
  volatility: RiskOrVolatility;
  keyFactors: KeyFactor[];
  indicatorScores: Record<string, number>;
  timestamp: string;
}

interface IndicatorScore {
  score: number;
  name: string;
  signal: SignalType;
  impact: ImpactLevel;
  description: string;
}

// ====================== CONSTANTS ===========================

const WEIGHTS: Record<string, number> = {
  rsi: 0.10,
  macdHistogram: 0.08,
  bollinger: 0.08,
  maTrend: 0.12,
  stochastic: 0.06,
  adx: 0.06,
  atr: 0.03,
  roc: 0.08,
  obv: 0.07,
  volumeConfirm: 0.07,
  macdCrossover: 0.05,
  priceChannel: 0.05,
  divergence: 0.06,
  vwap: 0.04,
  pattern: 0.05,
};

const MIN_DATA_POINTS = 60;

// ===================== HELPERS ==============================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMax === inMin) return (outMin + outMax) / 2;
  const result = outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
  return clamp(result, Math.min(outMin, outMax), Math.max(outMin, outMax));
}

/** Simple Moving Average — full-length array with NaN padding */
function sma(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  if (data.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  result[period - 1] = sum / period;

  for (let i = period; i < data.length; i++) {
    sum += data[i] - data[i - period];
    result[i] = sum / period;
  }
  return result;
}

/** Exponential Moving Average — full-length array with NaN padding */
function ema(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  if (data.length < period) return result;

  const multiplier = 2 / (period + 1);

  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  result[period - 1] = sum / period;

  for (let i = period; i < data.length; i++) {
    result[i] = (data[i] - result[i - 1]) * multiplier + result[i - 1];
  }
  return result;
}

/** Rolling standard deviation */
function rollingStdDev(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  if (data.length < period) return result;

  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    result[i] = Math.sqrt(variance);
  }
  return result;
}

/** Simple linear regression → { slope, intercept } */
function linearRegression(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };

  return {
    slope: (n * sumXY - sumX * sumY) / denom,
    intercept: (sumY - ((n * sumXY - sumX * sumY) / denom) * sumX) / n,
  };
}

/** Percentile of a numeric array (0–100) */
function percentile(values: number[], p: number): number {
  const sorted = [...values].filter((v) => !isNaN(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

/** Last non-NaN numeric value from an array */
function lastValid(arr: number[]): number | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (!isNaN(arr[i])) return arr[i];
  }
  return undefined;
}

// ============= RAW INDICATOR CALCULATIONS ===================

/** RSI using Wilder's smoothing */
function calculateRSI(closes: number[], period: number = 14): number[] {
  const result: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return result;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    result[i] = clamp(100 - 100 / (1 + rs), 0, 100);
  }
  return result;
}

/** MACD: { macdLine, signalLine, histogram } */
function calculateMACD(
  closes: number[],
): { macdLine: number[]; signalLine: number[]; histogram: number[] } {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);

  const macdLine: number[] = new Array(closes.length).fill(NaN);
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(ema12[i]) && !isNaN(ema26[i])) {
      macdLine[i] = ema12[i] - ema26[i];
    }
  }

  // Build valid-only MACD array for signal-line EMA
  const validMacd: number[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (!isNaN(macdLine[i])) validMacd.push(macdLine[i]);
  }

  const sigEma = ema(validMacd, 9);

  const signalLine: number[] = new Array(closes.length).fill(NaN);
  const histogram: number[] = new Array(closes.length).fill(NaN);

  let vi = 0;
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(macdLine[i])) {
      if (vi < sigEma.length && !isNaN(sigEma[vi])) {
        signalLine[i] = sigEma[vi];
        histogram[i] = macdLine[i] - sigEma[vi];
      }
      vi++;
    }
  }

  return { macdLine, signalLine, histogram };
}

/** Bollinger Bands: { upper, middle, lower, bandwidth } */
function calculateBollingerBands(
  closes: number[],
  period: number = 20,
  stdDevMult: number = 2,
): { upper: number[]; middle: number[]; lower: number[]; bandwidth: number[] } {
  const middle = sma(closes, period);
  const sd = rollingStdDev(closes, period);

  const upper: number[] = new Array(closes.length).fill(NaN);
  const lower: number[] = new Array(closes.length).fill(NaN);
  const bandwidth: number[] = new Array(closes.length).fill(NaN);

  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(middle[i]) && !isNaN(sd[i])) {
      upper[i] = middle[i] + stdDevMult * sd[i];
      lower[i] = middle[i] - stdDevMult * sd[i];
      bandwidth[i] = middle[i] === 0 ? 0 : ((upper[i] - lower[i]) / middle[i]) * 100;
    }
  }

  return { upper, middle, lower, bandwidth };
}

/** Stochastic Oscillator: { k, d } */
function calculateStochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  kPeriod: number = 14,
  dPeriod: number = 3,
): { k: number[]; d: number[] } {
  const k: number[] = new Array(closes.length).fill(NaN);

  for (let i = kPeriod - 1; i < closes.length; i++) {
    let lowest = lows[i];
    let highest = highs[i];
    for (let j = i - kPeriod + 1; j < i; j++) {
      if (lows[j] < lowest) lowest = lows[j];
      if (highs[j] > highest) highest = highs[j];
    }
    const range = highest - lowest;
    k[i] = range === 0 ? 50 : ((closes[i] - lowest) / range) * 100;
  }

  const d = sma(k, dPeriod);
  return { k, d };
}

/** ADX with +DI and -DI */
function calculateADX(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14,
): { adx: number[]; plusDI: number[]; minusDI: number[] } {
  const adx: number[] = new Array(closes.length).fill(NaN);
  const plusDI: number[] = new Array(closes.length).fill(NaN);
  const minusDI: number[] = new Array(closes.length).fill(NaN);

  if (closes.length < period * 2) return { adx, plusDI, minusDI };

  // Compute raw TR, +DM, -DM
  const trRaw: number[] = new Array(closes.length).fill(0);
  const plusDMRaw: number[] = new Array(closes.length).fill(0);
  const minusDMRaw: number[] = new Array(closes.length).fill(0);

  for (let i = 1; i < closes.length; i++) {
    trRaw[i] = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    );

    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];

    plusDMRaw[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDMRaw[i] = downMove > upMove && downMove > 0 ? downMove : 0;
  }

  // Wilder's smoothing for first period
  let smoothTR = 0;
  let smoothPlusDM = 0;
  let smoothMinusDM = 0;
  for (let i = 1; i <= period; i++) {
    smoothTR += trRaw[i];
    smoothPlusDM += plusDMRaw[i];
    smoothMinusDM += minusDMRaw[i];
  }

  const dxValues: number[] = [];

  const computeDI = (idx: number) => {
    if (smoothTR === 0) {
      plusDI[idx] = 0;
      minusDI[idx] = 0;
      dxValues.push(0);
      return;
    }
    plusDI[idx] = (100 * smoothPlusDM) / smoothTR;
    minusDI[idx] = (100 * smoothMinusDM) / smoothTR;
    const diSum = plusDI[idx] + minusDI[idx];
    dxValues.push(diSum === 0 ? 0 : (100 * Math.abs(plusDI[idx] - minusDI[idx])) / diSum);
  };

  computeDI(period);

  for (let i = period + 1; i < closes.length; i++) {
    smoothTR = smoothTR - smoothTR / period + trRaw[i];
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDMRaw[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDMRaw[i];
    computeDI(i);
  }

  // ADX = Wilder's smoothing of DX
  if (dxValues.length >= period) {
    let adxVal =
      dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
    const adxStartIdx = period - 1; // index in closes where first ADX goes
    const baseIdx = period; // index in closes where first DX was computed
    adx[baseIdx + adxStartIdx] = adxVal;

    for (let i = period; i < dxValues.length; i++) {
      adxVal = (adxVal * (period - 1) + dxValues[i]) / period;
      adx[baseIdx + i] = adxVal;
    }
  }

  return { adx, plusDI, minusDI };
}

/** Average True Range */
function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14,
): number[] {
  const result: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return result;

  const tr: number[] = [highs[0] - lows[0]];
  for (let i = 1; i < closes.length; i++) {
    tr.push(
      Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1]),
      ),
    );
  }

  // First ATR = SMA of first `period` TRs (TR starts at index 0, but Wilder uses first `period` starting from index 1)
  let atr = 0;
  for (let i = 1; i <= period; i++) atr += tr[i];
  atr /= period;
  result[period] = atr;

  for (let i = period + 1; i < closes.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    result[i] = atr;
  }
  return result;
}

/** On-Balance Volume */
function calculateOBV(closes: number[], volumes: number[]): number[] {
  const obv: number[] = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv[i] = obv[i - 1] + volumes[i];
    else if (closes[i] < closes[i - 1]) obv[i] = obv[i - 1] - volumes[i];
    else obv[i] = obv[i - 1];
  }
  return obv;
}

// =============== INDICATOR SCORING FUNCTIONS =================
// Each returns an IndicatorScore: { score (-100..+100), name, signal, impact, description (Albanian) }

function scoreRSI(rsiValues: number[]): IndicatorScore {
  const rsiVal = lastValid(rsiValues);
  if (rsiVal === undefined) return noData('RSI');

  let score: number;
  let name: string;
  let description: string;

  if (rsiVal < 20) {
    score = mapRange(20 - rsiVal, 0, 20, 70, 100);
    name = 'RSI Mbushje e Shitjes';
    description = `RSI në ${rsiVal.toFixed(1)} — kushtet e thella të mbushjes së shitjes, sinjal i fortë për blerje`;
  } else if (rsiVal < 30) {
    score = mapRange(30 - rsiVal, 0, 10, 50, 70);
    name = 'RSI Në Zonën e Blerjes';
    description = `RSI në ${rsiVal.toFixed(1)} — në zonën e blerjes, momentumi po kthehet pozitiv`;
  } else if (rsiVal < 45) {
    score = mapRange(45 - rsiVal, 0, 15, 40, 50);
    name = 'RSI Lehtësisht Bulliz';
    description = `RSI në ${rsiVal.toFixed(1)} — lehtësisht në favor të blerjes`;
  } else if (rsiVal <= 55) {
    score = 50 - (rsiVal - 50);
    name = 'RSI Neutral';
    description = `RSI në ${rsiVal.toFixed(1)} — zonë neutrale, asnjë sinjal i qartë`;
  } else if (rsiVal < 70) {
    score = mapRange(rsiVal - 55, 0, 15, -10, -40);
    name = 'RSI Lehtësisht Bearish';
    description = `RSI në ${rsiVal.toFixed(1)} — duke hyrë në zonën e shitjes`;
  } else if (rsiVal < 80) {
    score = mapRange(rsiVal - 70, 0, 10, -50, -70);
    name = 'RSI Në Zonën e Shitjes';
    description = `RSI në ${rsiVal.toFixed(1)} — kushtet e mbushjes së blerjes, sinjal i shitjes`;
  } else {
    score = mapRange(rsiVal - 80, 0, 20, -70, -100);
    name = 'RSI Mbushje e Blërjes';
    description = `RSI në ${rsiVal.toFixed(1)} — kushtet e thella të mbushjes së blerjes, sinjal i fortë për shitje`;
  }

  return { score, name, signal: score >= 0 ? 'BULLISH' : 'BEARISH', impact: Math.abs(score) > 60 ? 'HIGH' : 'MEDIUM', description };
}

function scoreMACDHistogram(histogram: number[]): IndicatorScore {
  const n = histogram.length;
  const h0 = lastValid(histogram);
  if (h0 === undefined) return noData('MACD Histogram');

  // Get last 3 valid histogram values
  const recent: number[] = [];
  for (let i = n - 1; i >= 0 && recent.length < 3; i--) {
    if (!isNaN(histogram[i])) recent.unshift(histogram[i]);
  }

  let score: number;
  let name: string;
  let description: string;

  // Use max absolute value across recent bars as a scale reference
  const maxAbs = Math.max(...recent.map(Math.abs), 0.001);

  if (recent.length < 2) {
    score = h0 > 0 ? 50 : h0 < 0 ? -50 : 0;
  } else {
    const prev = recent[recent.length - 2];
    const increasing = h0 > prev;

    if (h0 > 0 && increasing) {
      score = clamp(50 + 50 * (h0 / maxAbs), 50, 100);
      name = 'MACD Histogram Pozitiv në Rritje';
      description = 'Histogrami MACD pozitiv dhe në rritje, momentumi i blerjes po forcohet';
    } else if (h0 > 0) {
      score = clamp(40 + 20 * (h0 / maxAbs), 40, 60);
      name = 'MACD Histogram Pozitiv';
      description = 'Histogrami MACD pozitiv por në ulje, momentumi i blerjes po dobësohet';
    } else if (h0 < 0 && !increasing) {
      score = clamp(-50 - 50 * (Math.abs(h0) / maxAbs), -100, -50);
      name = 'MACD Histogram Negativ në Rritje';
      description = 'Histogrami MACD negativ dhe në rritje, momentumi i shitjes po forcohet';
    } else {
      score = clamp(-40 - 20 * (Math.abs(h0) / maxAbs), -60, -40);
      name = 'MACD Histogram Negativ';
      description = 'Histogrami MACD negativ por në ulje, shitjet po dobësohen';
    }
  }

  if (!name) {
    name = 'MACD Histogram Neutral';
    description = 'Histogrami MACD pranë zero, asnjë sinjal i qartë';
    score = 0;
  }

  return { score, name, signal: score >= 0 ? 'BULLISH' : 'BEARISH', impact: Math.abs(score) > 60 ? 'HIGH' : 'MEDIUM', description };
}

function scoreBollinger(
  closes: number[],
  bb: { upper: number[]; middle: number[]; lower: number[]; bandwidth: number[] },
): IndicatorScore {
  const last = closes.length - 1;
  const price = closes[last];
  const upper = bb.upper[last];
  const lower = bb.lower[last];
  const bw = bb.bandwidth[last];

  if (isNaN(upper) || isNaN(lower) || isNaN(bw) || upper === lower) {
    return noData('Bollinger Bands');
  }

  const position = (price - lower) / (upper - lower); // 0 to 1 (may go outside)

  // Detect squeeze: bandwidth narrowing over last 5 valid values
  let squeeze = false;
  const recentBW: number[] = [];
  for (let i = last; i >= 0 && recentBW.length < 5; i--) {
    if (!isNaN(bb.bandwidth[i])) recentBW.unshift(bb.bandwidth[i]);
  }
  if (recentBW.length >= 4) {
    squeeze = recentBW[recentBW.length - 1] < recentBW[0] * 0.85;
  }

  let score: number;
  let name: string;
  let description: string;

  if (position < 0.1) {
    score = mapRange(position, 0, 0.1, 100, 70);
    name = squeeze ? 'Bollinger Squeeze & Mbushje' : 'Bollinger Nën Band';
    description = squeeze
      ? 'Çmimi nën Bollinger Band të ulët me ngushtim, shpërthim i madh pozitiv i pritur'
      : 'Çmimi nën Bollinger Band të ulët, potencial i lartë për kthim lart';
  } else if (position < 0.3) {
    score = mapRange(position, 0.1, 0.3, 70, 50);
    name = 'Bollinger Pozicion i Ulët';
    description = 'Çmimi në pjesën e poshtme të Bollinger Bands, lehtësisht bulliz';
  } else if (position < 0.7) {
    score = mapRange(position, 0.3, 0.7, 50, -50);
    name = 'Bollinger Neutral';
    description = 'Çmimi në mes të Bollinger Bands, asnjë sinjal i qartë';
  } else if (position < 0.9) {
    score = mapRange(position, 0.7, 0.9, -50, -70);
    name = 'Bollinger Pozicion i Lartë';
    description = 'Çmimi në pjesën e sipërme të Bollinger Bands, lehtësisht bearish';
  } else {
    score = mapRange(position, 0.9, 1.2, -70, -100);
    name = squeeze ? 'Bollinger Squeeze & Mbushje' : 'Bollinger Mbi Band';
    description = squeeze
      ? 'Çmimi mbi Bollinger Band të sipërme me ngushtim, shpërthim i madh negativ i pritur'
      : 'Çmimi mbi Bollinger Band të sipërme, rreziku i kthimit poshtë';
  }

  // Squeeze amplification
  if (squeeze) {
    score = clamp(score * 1.1, -100, 100);
  }

  return { score, name, signal: score >= 0 ? 'BULLISH' : 'BEARISH', impact: Math.abs(score) > 60 ? 'HIGH' : 'MEDIUM', description };
}

function scoreMATrend(
  closes: number[],
  sma20: number[],
  sma50: number[],
  sma200: number[],
): IndicatorScore {
  const last = closes.length - 1;
  const price = closes[last];
  const s20 = sma20[last];
  const s50 = sma50[last];
  const s200 = sma200[last];

  if (isNaN(s20) || isNaN(s50)) return noData('MA Trend');

  // Short-term: price vs SMA20
  const shortTermScore = s20 > 0 ? (price > s20 ? mapRange((price - s20) / s20, 0, 0.05, 50, 100) : mapRange((s20 - price) / s20, 0, 0.05, -50, -100)) : 0;

  // Medium-term: price vs SMA50, SMA20 vs SMA50
  let medTermScore = 0;
  if (s50 > 0) {
    const priceVsS50 = price > s50 ? 50 : -50;
    const goldenCross = s20 > s50 ? 30 : -30;
    medTermScore = (priceVsS50 + goldenCross) / 2;
  }

  // Long-term: price vs SMA200
  const longTermScore = !isNaN(s200) && s200 > 0 ? (price > s200 ? 50 : -50) : 0;

  const score = clamp(shortTermScore * 0.3 + medTermScore * 0.4 + longTermScore * 0.3, -100, 100);

  let name: string;
  let description: string;

  if (s20 > s50 && !isNaN(s200) && s50 > s200) {
    name = 'Prirje e Plotë Pozitive';
    description = 'Çmimi sipër SMA 20, 50 dhe 200 — radhitja e plotë e mesatareve mobile pozitive';
  } else if (s20 > s50) {
    name = 'Kryqëzim i Artë';
    description = 'SMA 20 sipër SMA 50, sinjal i blerjes në afat mesatar';
  } else if (s20 < s50 && !isNaN(s200) && s50 < s200) {
    name = 'Prirje e Plotë Negative';
    description = 'Çmimi poshtë SMA 20, 50 dhe 200 — radhitja e plotë e mesatareve mobile negative';
  } else if (s20 < s50) {
    name = 'Kryqëzim i Vdekjes';
    description = 'SMA 20 poshtë SMA 50, sinjal i shitjes në afat mesatar';
  } else {
    name = 'MA Trend Neutral';
    description = 'Mesataret mobile pa ndryshim të qartë';
  }

  return { score, name, signal: score >= 0 ? 'BULLISH' : 'BEARISH', impact: 'HIGH', description };
}

function scoreStochastic(
  stochK: number[],
  stochD: number[],
): IndicatorScore {
  const last = stochK.length - 1;
  const k = stochK[last];
  const d = stochD[last];
  const kPrev = stochK[last - 1];
  const dPrev = stochD[last - 1];

  if (isNaN(k) || isNaN(d) || isNaN(kPrev) || isNaN(dPrev)) return noData('Stochastic');

  let score = 0;
  let name: string;
  let description: string;

  // Check for crossover in last bar
  const bullishCross = kPrev <= dPrev && k > d;
  const bearishCross = kPrev >= dPrev && k < d;

  if (k < 20 && d < 20) {
    score = mapRange(k, 0, 20, 90, 60);
    name = 'Stokastik Në Zonën e Shitjes';
    description = `%K (${k.toFixed(1)}) dhe %D (${d.toFixed(1)}) nën 20, mbushje e shitjes`;
  } else if (k > 80 && d > 80) {
    score = mapRange(k, 80, 100, -60, -90);
    name = 'Stokastik Në Zonën e Blërjes';
    description = `%K (${k.toFixed(1)}) dhe %D (${d.toFixed(1)}) mbi 80, mbushje e blerjes`;
  } else if (bullishCross) {
    score = mapRange(d, 20, 80, 75, 55);
    name = 'Stokastik Kryqëzim Bulliz';
    description = '%K kaloi sipër %D, sinjal i blerjes nga stokastiku';
  } else if (bearishCross) {
    score = mapRange(d, 20, 80, -75, -55);
    name = 'Stokastik Kryqëzim Bearish';
    description = '%K kaloi poshtë %D, sinjal i shitjes nga stokastiku';
  } else if (k > d) {
    score = mapRange(k - d, 0, 30, 10, 45);
    name = 'Stokastik Pozitiv';
    description = '%K sipër %D, momentumi i shkurtër pozitiv';
  } else {
    score = mapRange(d - k, 0, 30, -10, -45);
    name = 'Stokastik Negativ';
    description = '%K poshtë %D, momentumi i shkurtër negativ';
  }

  return { score, name, signal: score >= 0 ? 'BULLISH' : 'BEARISH', impact: Math.abs(score) > 50 ? 'MEDIUM' : 'LOW', description };
}

function scoreADX(
  adxValues: number[],
  plusDI: number[],
  minusDI: number[],
): IndicatorScore {
  const adx = lastValid(adxValues);
  const pdi = lastValid(plusDI);
  const mdi = lastValid(minusDI);

  if (adx === undefined || pdi === undefined || mdi === undefined) return noData('ADX');

  let score: number;
  let name: string;
  let description: string;

  const bullBias = pdi > mdi;
  const diSpread = Math.abs(pdi - mdi);

  if (adx > 25) {
    // Strong trend
    if (bullBias) {
      score = mapRange(diSpread, 0, 40, 50, 80);
      name = 'Prirje e Fortë Pozitive';
      description = `ADX ${adx.toFixed(1)} tregon trend të fortë, +DI (${pdi.toFixed(1)}) mbi -DI (${mdi.toFixed(1)})`;
    } else {
      score = mapRange(diSpread, 0, 40, -50, -80);
      name = 'Prirje e Fortë Negative';
      description = `ADX ${adx.toFixed(1)} tregon trend të fortë, -DI (${mdi.toFixed(1)}) mbi +DI (${pdi.toFixed(1)})`;
    }
  } else if (adx > 20) {
    // Developing trend
    score = bullBias ? mapRange(diSpread, 0, 20, 20, 50) : mapRange(diSpread, 0, 20, -20, -50);
    name = bullBias ? 'Prirje në Zhvillim Pozitive' : 'Prirje në Zhvillim Negative';
    description = `ADX ${adx.toFixed(1)} tregon trend në zhvillim, ${bullBias ? '+DI' : '-DI'} mbi ${bullBias ? '-DI' : '+DI'}`;
  } else {
    // Weak trend / ranging
    score = clamp(diSpread * (bullBias ? 1 : -1), -20, 20);
    name = 'Treg Pa Drejtim';
    description = `ADX ${adx.toFixed(1)} tregon treg pa drejtim të qartë, rreziku lartë për sinjale të rreme`;
  }

  return { score, name, signal: score >= 0 ? 'BULLISH' : 'BEARISH', impact: adx > 25 ? 'HIGH' : 'LOW', description };
}

function scoreATR(
  atrValues: number[],
  closes: number[],
): IndicatorScore {
  const last = closes.length - 1;
  const currentATR = lastValid(atrValues);
  if (currentATR === undefined || currentATR <= 0) return noData('ATR');

  // Compute 60-day ATR history for percentile
  const atrHistory: number[] = [];
  for (let i = last; i >= 0 && atrHistory.length < 60; i--) {
    if (!isNaN(atrValues[i]) && atrValues[i] > 0) atrHistory.unshift(atrValues[i]);
  }

  if (atrHistory.length < 20) return noData('ATR');

  const p30 = percentile(atrHistory, 30);
  const p70 = percentile(atrHistory, 70);

  let score: number;
  let name: string;
  let description: string;

  if (currentATR < p30) {
    score = mapRange(currentATR, 0, p30, 65, 55);
    name = 'Volatilitet i Ulët — Squeeze';
    description = 'ATR nën 30-inë e përqindjes, volatiliteti i ulët tregon konsolidim potencial';
  } else if (currentATR > p70) {
    score = mapRange(currentATR, p70, p70 * 2, 20, -20);
    name = 'Volatilitet i Lartë';
    description = 'ATR mbi 70-inë e përqindjes, volatiliteti i lartë rrit rrezikun';
  } else {
    score = mapRange(currentATR, p30, p70, 30, -30);
    name = 'Volatilitet Normal';
    description = 'ATR në nivel normal, asnjë sinjal ekstrem';
  }

  return { score, name, signal: score >= 0 ? 'BULLISH' : 'BEARISH', impact: 'LOW', description };
}

function scoreROC(closes: number[]): IndicatorScore {
  const last = closes.length - 1;
  if (last < 20) return noData('ROC');

  const roc5 = ((closes[last] - closes[last - 5]) / closes[last - 5]) * 100;
  const roc10 = ((closes[last] - closes[last - 10]) / closes[last - 10]) * 100;
  const roc20 = ((closes[last] - closes[last - 20]) / closes[last - 20]) * 100;

  // Weighted combination
  let rawScore = roc5 * 0.5 + roc10 * 0.3 + roc20 * 0.2;

  // Extreme positive → mean reversion penalty
  if (roc5 > 10) {
    rawScore -= (roc5 - 10) * 2;
  }
  // Extreme negative → mean reversion penalty
  if (roc5 < -10) {
    rawScore += (-10 - roc5) * 2;
  }

  const score = clamp(rawScore * 5, -100, 100); // Scale percentage to score

  let name: string;
  let description: string;

  if (roc5 > 5) {
    name = 'Momentum i Fortë Pozitiv';
    description = `ROC 5-ditor ${roc5.toFixed(2)}%, momentumi i shkurtër shumë pozitiv`;
  } else if (roc5 < -5) {
    name = 'Momentum i Fortë Negativ';
    description = `ROC 5-ditor ${roc5.toFixed(2)}%, momentumi i shkurtër shumë negativ`;
  } else if (rawScore > 1) {
    name = 'Momentum Pozitiv';
    description = `ROC i përgjithshëm pozitiv (5d: ${roc5.toFixed(2)}%, 10d: ${roc10.toFixed(2)}%, 20d: ${roc20.toFixed(2)}%)`;
  } else if (rawScore < -1) {
    name = 'Momentum Negativ';
    description = `ROC i përgjithshëm negativ (5d: ${roc5.toFixed(2)}%, 10d: ${roc10.toFixed(2)}%, 20d: ${roc20.toFixed(2)}%)`;
  } else {
    name = 'Momentum Neutral';
    description = 'Shkalla e ndryshimit afatshkurtër afër zero';
  }

  return { score, name, signal: score >= 0 ? 'BULLISH' : 'BEARISH', impact: Math.abs(score) > 40 ? 'MEDIUM' : 'LOW', description };
}

function scoreOBV(closes: number[], volumes: number[]): IndicatorScore {
  const obv = calculateOBV(closes, volumes);
  const last = closes.length - 1;
  if (last < 10) return noData('OBV');

  const obvSlice = obv.slice(last - 4, last + 1);
  const priceSlice = closes.slice(last - 4, last + 1);

  const obvReg = linearRegression(obvSlice);
  const priceReg = linearRegression(priceSlice);

  const obvRising = obvReg.slope > 0;
  const priceRising = priceReg.slope > 0;

  let score: number;
  let name: string;
  let description: string;

  if (obvRising && priceRising) {
    score = mapRange(obvReg.slope / Math.max(Math.abs(obvSlice[0]), 1), 0, 0.5, 60, 85);
    name = 'OBV Konfirmon Blerjen';
    description = 'Volumi në balancë në rritje së bashku me çmimin, konfirmim bulliz';
  } else if (!obvRising && priceRising) {
    score = mapRange(-obvReg.slope / Math.max(Math.abs(obvSlice[0]), 1), 0, 0.5, -60, -85);
    name = 'Divergjencë Bearish OBV';
    description = 'Çmimi në rritje por volumi në ulje, divergjencë bearish';
  } else if (obvRising && !priceRising) {
    score = mapRange(obvReg.slope / Math.max(Math.abs(obvSlice[0]), 1), 0, 0.5, 60, 85);
    name = 'Divergjencë Bulliz OBV';
    description = 'Çmimi në ulje por volumi në rritje, divergjencë bulliz';
  } else {
    score = mapRange(-obvReg.slope / Math.max(Math.abs(obvSlice[0]), 1), 0, 0.5, -60, -85);
    name = 'OBV Konfirmon Shitjen';
    description = 'Volumi në balancë në ulje së bashku me çmimin, konfirmim bearish';
  }

  return { score, name, signal: score >= 0 ? 'BULLISH' : 'BEARISH', impact: 'MEDIUM', description };
}

function scoreVolumeConfirmation(
  closes: number[],
  volumes: number[],
): IndicatorScore {
  const last = closes.length - 1;
  if (last < 20) return noData('Konfirmimi i Volumit');

  const currentVol = volumes[last];
  const avgVol = volumes.slice(last - 19, last).reduce((a, b) => a + b, 0) / 20;
  const priceUp = closes[last] >= closes[last - 1];

  let score: number;
  let name: string;
  let description: string;

  if (priceUp && currentVol > avgVol * 1.2) {
    score = mapRange(currentVol / avgVol, 1.2, 3, 55, 80);
    name = 'Volum i Lartë Konfirmon Rritjen';
    description = `Volumi ${(currentVol / avgVol * 100).toFixed(0)}% i mesatares me çmim në rritje, blerje e fortë`;
  } else if (priceUp) {
    score = mapRange(currentVol / avgVol, 0.3, 1.2, 20, 45);
    name = 'Rritje e Dobët';
    description = 'Çmimi në rritje por me volum nën mesataren, rally e dobët';
  } else if (!priceUp && currentVol > avgVol * 1.2) {
    score = mapRange(currentVol / avgVol, 1.2, 3, -55, -80);
    name = 'Volum i Lartë Konfirmon Uljen';
    description = `Volumi ${(currentVol / avgVol * 100).toFixed(0)}% i mesatares me çmim në ulje, shitje e fortë`;
  } else {
    score = mapRange(currentVol / avgVol, 0.3, 1.2, -20, -45);
    name = 'Ulje e Dobët';
    description = 'Çmimi në ulje por me volum nën mesataren, ulje e dobët';
  }

  return { score, name, signal: score >= 0 ? 'BULLISH' : 'BEARISH', impact: Math.abs(score) > 50 ? 'MEDIUM' : 'LOW', description };
}

function scoreMACDCrossover(
  macdLine: number[],
  signalLine: number[],
): IndicatorScore {
  const n = macdLine.length;
  let score = 0;
  let name = 'Asnjë Kryqëzim MACD';
  let description = 'Asnjë kryqëzim i fundit midis MACD dhe vijës së sinjalit';
  let found = false;

  // Check last 5 valid bars for crossover
  const recentIndices: number[] = [];
  for (let i = n - 1; i >= 0 && recentIndices.length < 6; i--) {
    if (!isNaN(macdLine[i]) && !isNaN(signalLine[i])) recentIndices.unshift(i);
  }

  for (let j = 1; j < recentIndices.length; j++) {
    const prevIdx = recentIndices[j - 1];
    const currIdx = recentIndices[j];

    const prevDiff = macdLine[prevIdx] - signalLine[prevIdx];
    const currDiff = macdLine[currIdx] - signalLine[currIdx];

    if (prevDiff <= 0 && currDiff > 0) {
      // Bullish crossover
      const recency = j / recentIndices.length; // 1 = most recent
      score = mapRange(recency, 0, 1, 65, 90);
      name = 'Kryqëzim Bulliz MACD';
      description = 'MACD kaloi sipër vijës së sinjalit, sinjal i blerjes';
      found = true;
      break;
    } else if (prevDiff >= 0 && currDiff < 0) {
      // Bearish crossover
      const recency = j / recentIndices.length;
      score = mapRange(recency, 0, 1, -65, -90);
      name = 'Kryqëzim Bearish MACD';
      description = 'MACD kaloi poshtë vijës së sinjalit, sinjal i shitjes';
      found = true;
      break;
    }
  }

  if (!found) score = 0;

  return { score, name, signal: found ? (score > 0 ? 'BULLISH' : 'BEARISH') : 'NEUTRAL', impact: found ? 'HIGH' : 'LOW', description };
}

function scorePriceChannel(
  highs: number[],
  lows: number[],
  closes: number[],
): IndicatorScore {
  const last = closes.length - 1;
  if (last < 20) return noData('Price Channel');

  let ch20High = -Infinity;
  let ch20Low = Infinity;
  for (let i = last - 19; i < last; i++) {
    if (highs[i] > ch20High) ch20High = highs[i];
    if (lows[i] < ch20Low) ch20Low = lows[i];
  }

  const price = closes[last];
  const range = ch20High - ch20Low;
  if (range <= 0) return noData('Price Channel');

  let score: number;
  let name: string;
  let description: string;

  if (price > ch20High) {
    // Breakout
    score = mapRange((price - ch20High) / range, 0, 0.1, 70, 95);
    name = 'Shpërthim mbi Kanalin 20-Ditor';
    description = 'Çmimi theu rezistencën e 20 ditëve, shpërthim i potencialit bulliz';
  } else if (price < ch20Low) {
    // Breakdown
    score = mapRange((ch20Low - price) / range, 0, 0.1, -70, -95);
    name = 'Thyesje nën Kanalin 20-Ditor';
    description = 'Çmimi thehu mbështetjen e 20 ditëve, rrezik i thellë uljeje';
  } else {
    const position = (price - ch20Low) / range;
    if (position > 0.7) {
      score = mapRange(position, 0.7, 1, 50, 75);
      name = 'Çmimi Pranë Rezistencës';
      description = 'Çmimi pranë lartësisë 20-ditore, momentum pozitiv';
    } else if (position < 0.3) {
      score = mapRange(position, 0, 0.3, -75, -50);
      name = 'Çmimi Pranë Mbështetjes';
      description = 'Çmimi pranë ulëtësisë 20-ditore, rreziku i uljes';
    } else {
      score = mapRange(position - 0.5, -0.2, 0.2, -30, 30);
      name = 'Price Channel Neutral';
      description = 'Çmimi në mes të kanalit 20-ditor';
    }
  }

  return { score, name, signal: score >= 0 ? 'BULLISH' : 'BEARISH', impact: Math.abs(score) > 60 ? 'MEDIUM' : 'LOW', description };
}

function scoreDivergence(
  closes: number[],
  rsiValues: number[],
): IndicatorScore {
  const last = closes.length - 1;
  if (last < 30) return noData('Divergjencë');

  // Find price lows and RSI lows in last 30 bars
  const lookback = Math.min(30, last);
  const priceSlice = closes.slice(last - lookback, last + 1);
  const rsiSlice = rsiValues.slice(last - lookback, last + 1);

  // Find local minima (price lows)
  const priceLows: { idx: number; val: number }[] = [];
  const rsiAtPriceLows: number[] = [];
  for (let i = 1; i < priceSlice.length - 1; i++) {
    if (priceSlice[i] < priceSlice[i - 1] && priceSlice[i] < priceSlice[i + 1] && !isNaN(rsiSlice[i])) {
      priceLows.push({ idx: i, val: priceSlice[i] });
      rsiAtPriceLows.push(rsiSlice[i]);
    }
  }

  // Find local maxima (price highs)
  const priceHighs: { idx: number; val: number }[] = [];
  const rsiAtPriceHighs: number[] = [];
  for (let i = 1; i < priceSlice.length - 1; i++) {
    if (priceSlice[i] > priceSlice[i - 1] && priceSlice[i] > priceSlice[i + 1] && !isNaN(rsiSlice[i])) {
      priceHighs.push({ idx: i, val: priceSlice[i] });
      rsiAtPriceHighs.push(rsiSlice[i]);
    }
  }

  // Bullish divergence: price makes lower low but RSI makes higher low
  let bullishDiv = false;
  let bearishDiv = false;

  if (priceLows.length >= 2) {
    const lastTwo = priceLows.slice(-2);
    if (lastTwo[1].val < lastTwo[0].val) {
      const rsiLastTwo = rsiAtPriceLows.slice(-2);
      if (rsiLastTwo.length >= 2 && rsiLastTwo[1] > rsiLastTwo[0]) {
        bullishDiv = true;
      }
    }
  }

  // Bearish divergence: price makes higher high but RSI makes lower high
  if (priceHighs.length >= 2) {
    const lastTwo = priceHighs.slice(-2);
    if (lastTwo[1].val > lastTwo[0].val) {
      const rsiLastTwo = rsiAtPriceHighs.slice(-2);
      if (rsiLastTwo.length >= 2 && rsiLastTwo[1] < rsiLastTwo[0]) {
        bearishDiv = true;
      }
    }
  }

  if (bullishDiv) {
    return {
      score: 75,
      name: 'Divergjencë Bulliz',
      signal: 'BULLISH',
      impact: 'HIGH',
      description: 'Çmimi bën ultë të ulëta por RSI bën ultë më të larta, sinjal i forttë i blerjes',
    };
  }
  if (bearishDiv) {
    return {
      score: -75,
      name: 'Divergjencë Bearish',
      signal: 'BEARISH',
      impact: 'HIGH',
      description: 'Çmimi bën maje më të larta por RSI bën maje më të ulëta, sinjal i fortë i shitjes',
    };
  }

  return {
    score: 0,
    name: 'Asnjë Divergjencë',
    signal: 'NEUTRAL',
    impact: 'LOW',
    description: 'Asnjë divergjencë e dukshme midis çmimit dhe RSI-së',
  };
}

function scoreVWAP(closes: number[], highs: number[], lows: number[], volumes: number[]): IndicatorScore {
  const last = closes.length - 1;
  if (last < 20) return noData('VWAP');

  // Approximate VWAP over 20 days: cumulative (H+L+C)/3 * volume / cumulative volume
  let cumVP = 0;
  let cumVol = 0;
  for (let i = last - 19; i <= last; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    cumVP += tp * volumes[i];
    cumVol += volumes[i];
  }

  const vwap = cumVol === 0 ? closes[last] : cumVP / cumVol;
  const price = closes[last];
  const deviation = ((price - vwap) / vwap) * 100; // percentage deviation

  let score: number;
  let name: string;
  let description: string;

  if (price > vwap) {
    score = clamp(mapRange(deviation, 0, 5, 50, 65), 50, 65);
    name = 'Çmimi Sipër VWAP';
    description = `Çmimi ${deviation.toFixed(2)}% mbi VWAP, blerësit në kontroll`;
  } else {
    score = clamp(mapRange(-deviation, 0, 5, 50, 65), -65, -50);
    name = 'Çmimi Poshtë VWAP';
    description = `Çmimi ${(-deviation).toFixed(2)}% poshtë VWAP, shitësit në kontroll`;
  }

  return { score, name, signal: score >= 0 ? 'BULLISH' : 'BEARISH', impact: 'LOW', description };
}

function scorePattern(
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
): IndicatorScore {
  const last = closes.length - 1;
  if (last < 10) return noData('Pattern');

  const len = Math.min(10, last + 1);
  const o = opens.slice(last - len + 1);
  const h = highs.slice(last - len + 1);
  const l = lows.slice(last - len + 1);
  const c = closes.slice(last - len + 1);
  const v = volumes.slice(last - len + 1);

  let bestScore = 0;
  let bestName = 'Asnjë Model';
  let bestDescription = 'Nuk u zbuluan modele qirinjësh në 10 ditët e fundit';
  let bestSignal: SignalType = 'NEUTRAL';
  let bestImpact: ImpactLevel = 'LOW';

  const n = o.length;

  // 1. Three consecutive green candles with increasing volume
  if (n >= 3) {
    const g1 = c[n - 3] > o[n - 3];
    const g2 = c[n - 2] > o[n - 2];
    const g3 = c[n - 1] > o[n - 1];
    if (g1 && g2 && g3 && v[n - 1] > v[n - 2] && v[n - 2] > v[n - 3]) {
      bestScore = 75;
      bestName = 'Tre Qirinj Jeshilë';
      bestSignal = 'BULLISH';
      bestImpact = 'HIGH';
      bestDescription = 'Tre qirinj jeshilë radhazi me volum në rritje, prirje e fortë e blerjes';
    }
  }

  // 2. Three consecutive red candles with increasing volume
  if (n >= 3) {
    const r1 = c[n - 3] < o[n - 3];
    const r2 = c[n - 2] < o[n - 2];
    const r3 = c[n - 1] < o[n - 1];
    if (r1 && r2 && r3 && v[n - 1] > v[n - 2] && v[n - 2] > v[n - 3]) {
      if (Math.abs(-75) > Math.abs(bestScore)) {
        bestScore = -75;
        bestName = 'Tre Qirinj të Kuq';
        bestSignal = 'BEARISH';
        bestImpact = 'HIGH';
        bestDescription = 'Tre qirinj të kuq radhazi me volum në rritje, prirje e fortë e shitjes';
      }
    }
  }

  // 3. Hammer: small body, long lower shadow (at least 2x body), body in upper 1/3
  {
    const body = Math.abs(c[n - 1] - o[n - 1]);
    const totalRange = h[n - 1] - l[n - 1];
    const lowerShadow = Math.min(o[n - 1], c[n - 1]) - l[n - 1];
    const upperShadow = h[n - 1] - Math.max(o[n - 1], c[n - 1]);

    if (totalRange > 0 && body > 0 && lowerShadow >= 2 * body && upperShadow <= body * 0.3) {
      // Check if at bottom of trend (price was declining)
      const declining = c[n - 2] < o[n - 2] || c[n - 3] < o[n - 3];
      if (declining) {
        const score = 65;
        if (score > Math.abs(bestScore)) {
          bestScore = score;
          bestName = 'Modeli Çekiç';
          bestSignal = 'BULLISH';
          bestImpact = 'MEDIUM';
          bestDescription = 'Modeli çekiç pas një prirjeje të ulët, sinjal i shmangies pozitive';
        }
      }
    }
  }

  // 4. Shooting star: small body, long upper shadow (at least 2x body), body in lower 1/3
  {
    const body = Math.abs(c[n - 1] - o[n - 1]);
    const totalRange = h[n - 1] - l[n - 1];
    const lowerShadow = Math.min(o[n - 1], c[n - 1]) - l[n - 1];
    const upperShadow = h[n - 1] - Math.max(o[n - 1], c[n - 1]);

    if (totalRange > 0 && body > 0 && upperShadow >= 2 * body && lowerShadow <= body * 0.3) {
      const advancing = c[n - 2] > o[n - 2] || c[n - 3] > o[n - 3];
      if (advancing) {
        const score = -65;
        if (Math.abs(score) > Math.abs(bestScore)) {
          bestScore = score;
          bestName = 'Yllë e Qitjes';
          bestSignal = 'BEARISH';
          bestImpact = 'MEDIUM';
          bestDescription = 'Yllë e qitjes pas një prirjeje të lartë, sinjal i shmangies negative';
        }
      }
    }
  }

  // 5. Bullish engulfing: red candle followed by larger green candle
  if (n >= 2) {
    const prevRed = c[n - 2] < o[n - 2];
    const currGreen = c[n - 1] > o[n - 1];
    const prevBody = Math.abs(c[n - 2] - o[n - 2]);
    const currBody = Math.abs(c[n - 1] - o[n - 1]);
    const engulfsBody = c[n - 1] > o[n - 2] && o[n - 1] < c[n - 2];

    if (prevRed && currGreen && engulfsBody && currBody > prevBody) {
      const score = 70;
      if (Math.abs(score) > Math.abs(bestScore)) {
        bestScore = score;
        bestName = 'Mbështjellje Bulliz';
        bestSignal = 'BULLISH';
        bestImpact = 'HIGH';
        bestDescription = 'Modeli i mbështjelljes bullize, sinjal i fortë për ndryshim të drejtimit';
      }
    }
  }

  // 6. Bearish engulfing: green candle followed by larger red candle
  if (n >= 2) {
    const prevGreen = c[n - 2] > o[n - 2];
    const currRed = c[n - 1] < o[n - 1];
    const prevBody = Math.abs(c[n - 2] - o[n - 2]);
    const currBody = Math.abs(c[n - 1] - o[n - 1]);
    const engulfsBody = o[n - 1] > c[n - 2] && c[n - 1] < o[n - 2];

    if (prevGreen && currRed && engulfsBody && currBody > prevBody) {
      const score = -70;
      if (Math.abs(score) > Math.abs(bestScore)) {
        bestScore = score;
        bestName = 'Mbështjellje Bearish';
        bestSignal = 'BEARISH';
        bestImpact = 'HIGH';
        bestDescription = 'Modeli i mbështjelljes bearish, sinjal i fortë për ndryshim të drejtimit';
      }
    }
  }

  return { score: bestScore, name: bestName, signal: bestSignal, impact: bestImpact, description: bestDescription };
}

// =================== HELPER: NO DATA ========================

function noData(indicatorName: string): IndicatorScore {
  return {
    score: 0,
    name: `${indicatorName} — të Dhëna të Pamjaftueshme`,
    signal: 'NEUTRAL',
    impact: 'LOW',
    description: `Të dhëna të pamjaftueshme për të llogaritur ${indicatorName}`,
  };
}

// ============== MAIN PREDICTION FUNCTION =====================

export function predictStock(symbol: string, data: PricePoint[]): PredictionResult {
  const emptyResult = (): PredictionResult => ({
    symbol,
    score: 0,
    direction: 'NEUTRAL',
    confidence: 0,
    shortTerm: { prediction: 'SIDEWAYS', probability: 50, expectedMove: 0 },
    mediumTerm: { prediction: 'SIDEWAYS', probability: 50, expectedMove: 0 },
    riskLevel: 'HIGH',
    volatility: 'MEDIUM',
    keyFactors: [
      {
        name: 'Të Dhëna',
        signal: 'NEUTRAL' as SignalType,
        impact: 'HIGH' as ImpactLevel,
        score: 0,
        description: 'Të dhëna të pamjaftueshme për analizë teknike',
      },
    ],
    indicatorScores: {},
    timestamp: new Date().toISOString(),
  });

  if (!data || data.length < MIN_DATA_POINTS) return emptyResult();

  // ---------- Extract price arrays ----------
  const closes = data.map((d) => d.close);
  const highs = data.map((d) => d.high);
  const lows = data.map((d) => d.low);
  const volumes = data.map((d) => d.volume);
  const opens = data.map((d) => d.open);

  // Validate
  if (closes.some((c) => c <= 0) || volumes.some((v) => v < 0)) return emptyResult();

  // ---------- Calculate raw indicators ----------
  const rsiValues = calculateRSI(closes, 14);
  const macd = calculateMACD(closes);
  const bb = calculateBollingerBands(closes, 20, 2);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const stoch = calculateStochastic(highs, lows, closes, 14, 3);
  const adxResult = calculateADX(highs, lows, closes, 14);
  const atrValues = calculateATR(highs, lows, closes, 14);
  const atr20Values = calculateATR(highs, lows, closes, 20);

  // ---------- Score each indicator ----------
  const scores: Record<string, IndicatorScore> = {};

  scores.rsi = scoreRSI(rsiValues);
  scores.macdHistogram = scoreMACDHistogram(macd.histogram);
  scores.bollinger = scoreBollinger(closes, bb);
  scores.maTrend = scoreMATrend(closes, sma20, sma50, sma200);
  scores.stochastic = scoreStochastic(stoch.k, stoch.d);
  scores.adx = scoreADX(adxResult.adx, adxResult.plusDI, adxResult.minusDI);
  scores.atr = scoreATR(atrValues, closes);
  scores.roc = scoreROC(closes);
  scores.obv = scoreOBV(closes, volumes);
  scores.volumeConfirm = scoreVolumeConfirmation(closes, volumes);
  scores.macdCrossover = scoreMACDCrossover(macd.macdLine, macd.signalLine);
  scores.priceChannel = scorePriceChannel(highs, lows, closes);
  scores.divergence = scoreDivergence(closes, rsiValues);
  scores.vwap = scoreVWAP(closes, highs, lows, volumes);
  scores.pattern = scorePattern(opens, highs, lows, closes, volumes);

  // ---------- Weighted final score ----------
  let finalScore = 0;
  const indicatorScores: Record<string, number> = {};

  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const s = scores[key]?.score ?? 0;
    finalScore += s * weight;
    indicatorScores[key] = Math.round(s * 100) / 100;
  }
  finalScore = clamp(Math.round(finalScore * 100) / 100, -100, 100);

  // ---------- Confidence ----------
  const allIndicatorScores = Object.values(scores).map((s) => s.score);
  const mean = allIndicatorScores.reduce((a, b) => a + b, 0) / allIndicatorScores.length;
  const variance = allIndicatorScores.reduce((a, b) => a + (b - mean) ** 2, 0) / allIndicatorScores.length;
  const stdDev = Math.sqrt(variance);
  const confidence = clamp(Math.round((100 - stdDev * 1.5) * 100) / 100, 0, 100);

  // ---------- Direction ----------
  const direction: Direction =
    finalScore > 60 ? 'STRONG_BUY' : finalScore > 25 ? 'BUY' : finalScore > -25 ? 'NEUTRAL' : finalScore > -60 ? 'SELL' : 'STRONG_SELL';

  // ---------- Short-term prediction (1-3 days) ----------
  const shortTermWeights = { rsi: 0.25, stochastic: 0.20, macdHistogram: 0.25, volumeConfirm: 0.15, pattern: 0.15 };
  let shortScore = 0;
  for (const [k, w] of Object.entries(shortTermWeights)) {
    shortScore += (scores[k]?.score ?? 0) * w;
  }
  const shortPrediction: TrendPrediction = shortScore > 20 ? 'UP' : shortScore < -20 ? 'DOWN' : 'SIDEWAYS';
  const shortProbability = clamp(Math.round(Math.abs(shortScore) * 0.8 + 20), 0, 100);
  const currentATR = lastValid(atrValues) ?? 0;
  const lastClose = closes[closes.length - 1];
  const shortExpectedMove = lastClose > 0 ? Math.round(((currentATR / lastClose) * 100) * 100) / 100 : 0;

  // ---------- Medium-term prediction (1-2 weeks) ----------
  const medTermWeights = { maTrend: 0.30, macdHistogram: 0.20, bollinger: 0.20, obv: 0.15, roc: 0.15 };
  let medScore = 0;
  for (const [k, w] of Object.entries(medTermWeights)) {
    medScore += (scores[k]?.score ?? 0) * w;
  }
  const medPrediction: TrendPrediction = medScore > 20 ? 'UP' : medScore < -20 ? 'DOWN' : 'SIDEWAYS';
  const medProbability = clamp(Math.round(Math.abs(medScore) * 0.8 + 20), 0, 100);
  const currentATR20 = lastValid(atr20Values) ?? currentATR;
  const medExpectedMove = lastClose > 0 ? Math.round(((currentATR20 / lastClose) * 100) * 100) / 100 : 0;

  // ---------- Risk level & volatility ----------
  const atrHistory: number[] = [];
  const atrLast = atrValues.length - 1;
  for (let i = atrLast; i >= 0 && atrHistory.length < 60; i--) {
    if (!isNaN(atrValues[i]) && atrValues[i] > 0) atrHistory.unshift(atrValues[i]);
  }

  const p30 = atrHistory.length > 5 ? percentile(atrHistory, 30) : 0;
  const p70 = atrHistory.length > 5 ? percentile(atrHistory, 70) : Infinity;

  const atrHigh = currentATR > p70;
  const atrLow = currentATR < p30;

  const volatility: RiskOrVolatility = atrHigh ? 'HIGH' : atrLow ? 'LOW' : 'MEDIUM';

  const riskLevel: RiskOrVolatility =
    atrHigh || confidence < 30 ? 'HIGH' : atrLow && confidence > 70 ? 'LOW' : 'MEDIUM';

  // ---------- Top 5 key factors ----------
  const sortedFactors = Object.values(scores)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 5);

  const keyFactors: KeyFactor[] = sortedFactors.map((f) => ({
    name: f.name,
    signal: f.signal,
    impact: f.impact,
    score: Math.round(f.score * 100) / 100,
    description: f.description,
  }));

  // ---------- Build result ----------
  return {
    symbol,
    score: finalScore,
    direction,
    confidence,
    shortTerm: {
      prediction: shortPrediction,
      probability: shortProbability,
      expectedMove: shortExpectedMove,
    },
    mediumTerm: {
      prediction: medPrediction,
      probability: medProbability,
      expectedMove: medExpectedMove,
    },
    riskLevel,
    volatility,
    keyFactors,
    indicatorScores,
    timestamp: new Date().toISOString(),
  };
}

// ===================== RANK FUNCTION ========================

export function rankStocks(results: PredictionResult[]): PredictionResult[] {
  return [...results].sort((a, b) => b.score - a.score);
}