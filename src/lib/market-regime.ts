// ============================================================
// Market Regime Detector
// Classifies market as BULL / BEAR / VOLATILE / RANGING
// Uses SPY data as benchmark proxy
// ============================================================

import { fetchHistoricalData, type HistoricalDataPoint } from './alpha-vantage';

export type Regime = 'BULL' | 'BEAR' | 'VOLATILE' | 'RANGING' | 'UNKNOWN';

export interface MarketRegimeResult {
  regime: Regime;
  confidence: number;  // 0-1
  spyPrice: number;
  spyChange5d: number;
  spyChange20d: number;
  vixLevel?: number;
  marketBreadth?: number;
  detectedAt: string;
}

// Cache
let cachedRegime: MarketRegimeResult | null = null;
let regimeFetchedAt = 0;
const REGIME_CACHE_MS = 30 * 60 * 1000; // 30 minutes

function sma(data: number[], period: number): number | null {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function ema(data: number[], period: number): number | null {
  if (data.length < period) return null;
  const multiplier = 2 / (period + 1);
  let val = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    val = (data[i] - val) * multiplier + val;
  }
  return val;
}

function atr(highs: number[], lows: number[], closes: number[], period: number = 14): number | null {
  if (closes.length < period + 1) return null;
  const trs: number[] = [highs[0] - lows[0]];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    ));
  }
  let atrVal = 0;
  for (let i = 1; i <= period; i++) atrVal += trs[i];
  atrVal /= period;
  for (let i = period + 1; i < trs.length; i++) {
    atrVal = (atrVal * (period - 1) + trs[i]) / period;
  }
  return atrVal;
}

function adxCalc(highs: number[], lows: number[], closes: number[], period: number = 14): number | null {
  if (closes.length < period * 2) return null;
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const tr: number[] = [highs[0] - lows[0]];
  for (let i = 1; i < closes.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  let smoothTR = 0, smoothPDM = 0, smoothMDM = 0;
  for (let i = 1; i <= period; i++) { smoothTR += tr[i]; smoothPDM += plusDM[i]; smoothMDM += minusDM[i]; }
  const dxValues: number[] = [];
  const computeDX = () => {
    if (smoothTR === 0) { dxValues.push(0); return; }
    const pdi = (100 * smoothPDM) / smoothTR;
    const mdi = (100 * smoothMDM) / smoothTR;
    const diSum = pdi + mdi;
    dxValues.push(diSum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / diSum);
  };
  computeDX();
  for (let i = period + 1; i < closes.length; i++) {
    smoothTR = smoothTR - smoothTR / period + tr[i];
    smoothPDM = smoothPDM - smoothPDM / period + plusDM[i];
    smoothMDM = smoothMDM - smoothMDM / period + minusDM[i];
    computeDX();
  }
  if (dxValues.length < period) return null;
  let adxVal = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxValues.length; i++) {
    adxVal = (adxVal * (period - 1) + dxValues[i]) / period;
  }
  return adxVal;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

export async function detectMarketRegime(): Promise<MarketRegimeResult> {
  const now = Date.now();
  if (cachedRegime && now - regimeFetchedAt < REGIME_CACHE_MS) {
    return cachedRegime;
  }

  try {
    const data = await fetchHistoricalData('SPY', '6mo');
    if (!data || data.length < 60) {
      return fallbackRegime();
    }

    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const last = closes.length - 1;
    const price = closes[last];

    const sma20 = sma(closes, 20);
    const sma50 = sma(closes, 50);
    const sma200 = sma(closes, 200);
    const adxVal = adxCalc(highs, lows, closes);
    const atrVal = atr(highs, lows, closes);

    // Changes
    const spyChange5d = last >= 5 ? ((price - closes[last - 5]) / closes[last - 5]) * 100 : 0;
    const spyChange20d = last >= 20 ? ((price - closes[last - 20]) / closes[last - 20]) * 100 : 0;

    // ATR percentile
    const atrHistory: number[] = [];
    for (let i = last; i >= 0 && atrHistory.length < 60; i++) {
      const a = atr(highs.slice(0, i + 1), lows.slice(0, i + 1), closes.slice(0, i + 1));
      if (a !== null && a > 0) atrHistory.push(a);
    }
    const atrP75 = atrHistory.length > 10 ? percentile(atrHistory, 75) : Infinity;
    const isHighVol = atrVal !== null && atrVal > atrP75;

    // Determine regime
    let regime: Regime = 'RANGING';
    let confidence = 0.3;

    if (adxVal === null || sma200 === null) {
      // Not enough data — use simple heuristics
      if (spyChange20d > 5) { regime = 'BULL'; confidence = 0.5; }
      else if (spyChange20d < -5) { regime = 'BEAR'; confidence = 0.5; }
      else { regime = 'RANGING'; confidence = 0.3; }
    } else if (adxVal < 20) {
      regime = 'RANGING';
      confidence = mapRange(adxVal, 10, 20, 0.7, 0.4);
    } else if (isHighVol && sma200 !== null && Math.abs(price - sma200) / sma200 < 0.02) {
      regime = 'VOLATILE';
      confidence = mapRange(adxVal, 20, 40, 0.5, 0.8);
    } else if (price > sma200 && sma20 !== null && sma50 !== null && sma20 > sma50) {
      regime = 'BULL';
      confidence = mapRange(adxVal, 20, 40, 0.5, 0.85);
    } else if (price < sma200 && sma20 !== null && sma50 !== null && sma20 < sma50) {
      regime = 'BEAR';
      confidence = mapRange(adxVal, 20, 40, 0.5, 0.85);
    } else {
      regime = 'RANGING';
      confidence = 0.4;
    }

    const result: MarketRegimeResult = {
      regime,
      confidence: Math.round(confidence * 100) / 100,
      spyPrice: Math.round(price * 100) / 100,
      spyChange5d: Math.round(spyChange5d * 100) / 100,
      spyChange20d: Math.round(spyChange20d * 100) / 100,
      detectedAt: new Date().toISOString(),
    };

    cachedRegime = result;
    regimeFetchedAt = now;
    return result;
  } catch (err) {
    console.error('[REGIME] Detection failed:', err);
    return fallbackRegime();
  }
}

function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return (outMin + outMax) / 2;
  return Math.max(outMin, Math.min(outMax, outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin)));
}

function fallbackRegime(): MarketRegimeResult {
  return {
    regime: 'UNKNOWN',
    confidence: 0,
    spyPrice: 0,
    spyChange5d: 0,
    spyChange20d: 0,
    detectedAt: new Date().toISOString(),
  };
}

export function regimeScore(regime: Regime): number {
  // Score for prediction adjustment: -100 (bear) to +100 (bull)
  switch (regime) {
    case 'BULL': return 30;
    case 'BEAR': return -30;
    case 'VOLATILE': return -15;
    case 'RANGING': return 0;
    default: return 0;
  }
}
