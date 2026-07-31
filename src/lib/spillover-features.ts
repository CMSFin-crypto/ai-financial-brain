// ============================================================
// Spillover Features — 16-dimensional feature vector
// Computed from global market data for V1 heuristics and V2 model.
// Pure functions, no I/O.
// ============================================================

import type { EnrichedMarketData } from './global-market-data';
import { pctChange, computeATR, smaCalc } from './global-market-data';

// ─── Feature type ──────────────────────────────────────────────

export interface SpilloverFeatures {
  // Asia returns
  kospi1d: number;
  kospi2d: number;
  kospi5d: number;
  nikkei1d: number;
  hsi1d: number;
  // US
  smh1d: number;
  smh2d: number;
  qqq1d: number;
  vix1d: number;
  // Target-specific
  target1d: number;
  target2d: number;
  targetDistanceFromSma20: number;
  targetAtrZ: number;
  // Composite
  semisBreadth: number;       // % of semis that were negative yesterday
  asiaDeceleration: number;   // positive = panic slowing down
  oversoldScore: number;      // 0-100, higher = more oversold
}

export const FEATURE_NAMES: (keyof SpilloverFeatures)[] = [
  'kospi1d', 'kospi2d', 'kospi5d', 'nikkei1d', 'hsi1d',
  'smh1d', 'smh2d', 'qqq1d', 'vix1d',
  'target1d', 'target2d', 'targetDistanceFromSma20', 'targetAtrZ',
  'semisBreadth', 'asiaDeceleration', 'oversoldScore',
];

// ─── Z-score helper ────────────────────────────────────────────

export function rollingZScore(values: number[], lookback: number = 20): number {
  if (values.length < lookback + 1) return 0;
  const window = values.slice(-(lookback + 1));
  const current = window[window.length - 1];
  const past = window.slice(0, -1);
  const mean = past.reduce((a, b) => a + b, 0) / past.length;
  const std = Math.sqrt(past.reduce((s, v) => s + (v - mean) ** 2, 0) / past.length);
  return std > 0 ? (current - mean) / std : 0;
}

// ─── Feature: Asia Deceleration ────────────────────────────────
// Positive when |kospi1d| < |kospi1d_previous| (panic slowing)
function computeAsiaDeceleration(kospi: EnrichedMarketData[]): number {
  if (kospi.length < 3) return 0;
  const today1d = Math.abs(kospi[0].return1d);
  const yesterday1d = Math.abs(kospi[1].return1d);
  if (yesterday1d < 0.5) return 0; // only meaningful after a real move
  // Normalize: deceleration ratio, capped
  return Math.max(-1, Math.min(1, (yesterday1d - today1d) / yesterday1d));
}

// ─── Feature: Oversold Score ───────────────────────────────────
// Combines distance from SMA20, extreme 2D move, and ATR z-score
function computeOversoldScore(
  target: EnrichedMarketData[],
  smh: EnrichedMarketData[]
): number {
  let score = 0;
  const t = target[0];
  const s = smh[0];

  // Distance from SMA20 (target)
  if (t.sma20 && t.sma20 > 0) {
    const dist = ((t.close - t.sma20) / t.sma20) * 100;
    if (dist < -5) score += 40;
    else if (dist < -3) score += 25;
    else if (dist < -1) score += 10;
  }

  // SMH extreme 2D move
  if (s.return2d !== null) {
    if (s.return2d < -8) score += 35;
    else if (s.return2d < -5) score += 20;
    else if (s.return2d < -3) score += 10;
  }

  // ATR z-score for target (elevated vol = more oversold context)
  if (target.length > 21) {
    const atrValues: number[] = [];
    for (let i = 0; i < Math.min(target.length - 1, 21); i++) {
      const v = target[i].atr14;
      if (v != null) atrValues.push(v);
    }
    if (atrValues.length >= 15) {
      const z = rollingZScore(atrValues, 15);
      if (z > 1.5) score += 25;
      else if (z > 1.0) score += 15;
    }
  }

  return Math.min(100, score);
}

// ─── Feature: Semis Breadth ────────────────────────────────────
// % of semiconductor stocks that had negative 1D return yesterday
async function computeSemisBreadth(
  semiDataMap: Record<string, EnrichedMarketData[]>
): Promise<number> {
  const tickers = Object.keys(semiDataMap);
  if (tickers.length === 0) return 0.5; // neutral
  let negative = 0;
  let valid = 0;
  for (const t of tickers) {
    const arr = semiDataMap[t];
    if (arr.length >= 2) {
      valid++;
      if (arr[1].return1d < 0) negative++; // yesterday's return
    }
  }
  return valid > 0 ? negative / valid : 0.5;
}

// ─── Main feature builder ──────────────────────────────────────

export interface FeatureInput {
  kospi: EnrichedMarketData[];
  nikkei: EnrichedMarketData[];
  hsi: EnrichedMarketData[];
  smh: EnrichedMarketData[];
  qqq: EnrichedMarketData[];
  vix: EnrichedMarketData[];
  target: EnrichedMarketData[];
  semiDataMap?: Record<string, EnrichedMarketData[]>;
}

export function buildSpilloverFeatures(input: FeatureInput): SpilloverFeatures {
  const { kospi, nikkei, hsi, smh, qqq, vix, target } = input;

  const kospi1d = kospi.length >= 2 ? kospi[0].return1d : 0;
  const kospi2d = kospi.length >= 3 ? (kospi[0].return2d ?? 0) : 0;
  const kospi5d = kospi.length >= 6 ? (kospi[0].return5d ?? 0) : 0;
  const nikkei1d = nikkei.length >= 2 ? nikkei[0].return1d : 0;
  const hsi1d = hsi.length >= 2 ? hsi[0].return1d : 0;
  const smh1d = smh.length >= 2 ? smh[0].return1d : 0;
  const smh2d = smh.length >= 3 ? (smh[0].return2d ?? 0) : 0;
  const qqq1d = qqq.length >= 2 ? qqq[0].return1d : 0;
  const vix1d = vix.length >= 2 ? vix[0].return1d : 0;
  const target1d = target.length >= 2 ? target[0].return1d : 0;
  const target2d = target.length >= 3 ? (target[0].return2d ?? 0) : 0;

  // Target distance from SMA20 as percentage
  const t0 = target[0];
  const targetDistanceFromSma20 = t0.sma20 && t0.sma20 > 0
    ? ((t0.close - t0.sma20) / t0.sma20) * 100 : 0;

  // Target ATR z-score
  const atrValues: number[] = [];
  for (let i = 0; i < Math.min(target.length, 21); i++) {
    const v = target[i].atr14;
    if (v != null) atrValues.push(v);
  }
  const targetAtrZ = atrValues.length >= 15 ? rollingZScore(atrValues, 15) : 0;

  // Asia deceleration
  const asiaDeceleration = computeAsiaDeceleration(kospi);

  // Oversold score
  const oversoldScore = computeOversoldScore(target, smh);

  // Semis breadth (synchronous-friendly default; async version below)
  const semisBreadth = computeSemisBreadthSync(input.semiDataMap);

  return {
    kospi1d, kospi2d, kospi5d, nikkei1d, hsi1d,
    smh1d, smh2d, qqq1d, vix1d,
    target1d, target2d, targetDistanceFromSma20, targetAtrZ,
    semisBreadth, asiaDeceleration, oversoldScore,
  };
}

/** Synchronous breadth (uses provided map or defaults to 0.5) */
function computeSemisBreadthSync(semiDataMap?: Record<string, EnrichedMarketData[]>): number {
  if (!semiDataMap) return 0.5;
  const tickers = Object.keys(semiDataMap);
  if (tickers.length === 0) return 0.5;
  let neg = 0, valid = 0;
  for (const t of tickers) {
    const arr = semiDataMap[t];
    if (arr.length >= 2) { valid++; if (arr[1].return1d < 0) neg++; }
  }
  return valid > 0 ? neg / valid : 0.5;
}

/** Async version that fetches semi data if not provided */
export async function buildSpilloverFeaturesAsync(
  input: FeatureInput
): Promise<SpilloverFeatures> {
 // If semiDataMap not provided, skip async fetch (use sync default)
  return buildSpilloverFeatures(input);
}

// ─── For V2: build a feature array (numeric only, for model input) ───

export function featuresToArray(f: SpilloverFeatures): number[] {
 return FEATURE_NAMES.map(k => f[k]);
}
