// ═══════════════════════════════════════════════════════════════
// HISTORICAL PATTERN LEARNING ENGINE
//
// Analyzes a stock's OWN historical data to find "similar momentum days"
// and measures how the stock performed in the following 1-5 days.
// This provides data-driven continuation probability estimates.
//
// Methodology:
//   1. For each historical day, compute its RVol and daily change
//   2. Find days with similar characteristics (relaxed: RVol≥3x, change≥5%)
//   3. For each "setup day", measure forward returns over 1/2/3/5 days
//   4. Aggregate to produce win rates, avg returns, and confidence scores
// ═══════════════════════════════════════════════════════════════

import { type HistoricalDataPoint } from './alpha-vantage';

// ─── Types ──────────────────────────────────────────────────

export interface HistoricalSetup {
  date: string;
  dayChangePct: number;
  dayRelVol: number;
  dayVolume: number;
  dayClose: number;
  // Forward returns
  return1d: number;
  return2d: number;
  return3d: number;
  return5d: number;
  maxGain5d: number;    // best day within 5 days
  maxDrawdown5d: number; // worst day within 5 days
  // Pattern type
  setupType: string;
}

export interface PatternAnalysis {
  // Win rates (% of setups that were positive)
  winRate1d: number;     // % positive next day
  winRate2d: number;     // % positive over 2 days
  winRate3d: number;     // % positive over 3 days
  winRate5d: number;     // % positive over 5 days

  // Average returns
  avgReturn1d: number;   // average next-day return
  avgReturn2d: number;
  avgReturn3d: number;
  avgReturn5d: number;

  // Extremes
  bestReturn1d: number;
  worstReturn1d: number;
  bestReturn5d: number;
  avgMaxGain5d: number;      // avg best day within 5 days
  avgMaxDrawdown5d: number;  // avg worst pullback within 5 days

  // Meta
  setupsFound: number;         // how many similar historical days
  patternConfidence: number;   // 0-100 confidence score
  historicalBias: 'bullish' | 'bearish' | 'neutral';

  // Setup type breakdown
  setupBreakdown: {
    label: string;
    count: number;
    winRate5d: number;
    avgReturn5d: number;
  }[];

  // The actual setups for transparency
  setups: HistoricalSetup[];
}

// ─── Thresholds for "similar" historical days ──────────────
// We use RELAXED thresholds to find more comparable setups
const HIST_RVOL_MIN = 3;       // vs 5x in live screening
const HIST_CHANGE_MIN = 5;     // vs 10% in live screening
const MIN_LOOKBACK = 30;       // need at least 30 days of history
const FORWARD_DAYS = 5;        // look 5 days ahead

// ─── Main Analysis Function ──────────────────────────────────

/**
 * Analyze historical patterns for a stock that currently has
 * a given RVol and daily change. Finds similar past days and
 * measures their forward returns.
 */
export function analyzeHistoricalPatterns(
  history: HistoricalDataPoint[],
  currentRVol: number,
  currentChangePct: number
): PatternAnalysis {
  const empty: PatternAnalysis = {
    winRate1d: 0, winRate2d: 0, winRate3d: 0, winRate5d: 0,
    avgReturn1d: 0, avgReturn2d: 0, avgReturn3d: 0, avgReturn5d: 0,
    bestReturn1d: 0, worstReturn1d: 0, bestReturn5d: 0,
    avgMaxGain5d: 0, avgMaxDrawdown5d: 0,
    setupsFound: 0, patternConfidence: 0,
    historicalBias: 'neutral',
    setupBreakdown: [], setups: [],
  };

  if (!history || history.length < MIN_LOOKBACK + FORWARD_DAYS) {
    return empty;
  }

  // Find all "setup days" — historical days with similar momentum
  const setups: HistoricalSetup[] = [];
  const lookbackStart = Math.max(0, history.length - 90); // last 90 days

  for (let i = lookbackStart; i < history.length - FORWARD_DAYS; i++) {
    const day = history[i];
    const prevDay = i > 0 ? history[i - 1] : null;

    // Calculate this day's change
    const dayChangePct = prevDay && prevDay.close > 0
      ? ((day.close - prevDay.close) / prevDay.close) * 100
      : 0;

    // Calculate this day's RVol (vs 30-day avg before this day)
    const volStart = Math.max(0, i - 30);
    const volEnd = Math.max(0, i);
    const pastVolumes = history.slice(volStart, volEnd).map(d => d.volume);
    const avgVol = pastVolumes.length > 0
      ? pastVolumes.reduce((a, b) => a + b, 0) / pastVolumes.length
      : 0;
    const dayRelVol = avgVol > 0 ? day.volume / avgVol : 0;

    // Check if this day matches our "similar setup" criteria
    if (dayRelVol >= HIST_RVOL_MIN && dayChangePct >= HIST_CHANGE_MIN) {
      // Measure forward returns (1, 2, 3, 5 trading days later)
      const getClose = (offset: number) => {
        const idx = i + offset;
        return idx < history.length ? history[idx].close : null;
      };

      const c1 = getClose(1);
      const c2 = getClose(2);
      const c3 = getClose(3);
      const c5 = getClose(FORWARD_DAYS);

      if (c1 === null || c5 === null || c2 === null || c3 === null) continue;

      const ret1d = ((c1 - day.close) / day.close) * 100;
      const ret2d = ((c2 - day.close) / day.close) * 100;
      const ret3d = ((c3 - day.close) / day.close) * 100;
      const ret5d = ((c5 - day.close) / day.close) * 100;

      // Max gain and max drawdown within 5 days
      let maxGain = 0;
      let maxDD = 0;
      for (let j = 1; j <= FORWARD_DAYS; j++) {
        const fc = getClose(j);
        if (fc === null) break;
        const gain = ((fc - day.close) / day.close) * 100;
        const dd = ((day.close - fc) / day.close) * 100;
        if (gain > maxGain) maxGain = gain;
        if (dd > maxDD) maxDD = dd;
      }

      // Classify setup type
      let setupType = 'Momentum Spike';
      if (dayChangePct >= 20) setupType = 'Parabolic Surge';
      else if (dayChangePct >= 15) setupType = 'Strong Breakout';
      else if (dayRelVol >= 10) setupType = 'Volume Explosion';
      else if (dayChangePct >= 10) setupType = 'Solid Momentum';
      else setupType = 'Moderate Spike';

      setups.push({
        date: day.date,
        dayChangePct: parseFloat(dayChangePct.toFixed(2)),
        dayRelVol: parseFloat(dayRelVol.toFixed(1)),
        dayVolume: day.volume,
        dayClose: day.close,
        return1d: parseFloat(ret1d.toFixed(2)),
        return2d: parseFloat(ret2d.toFixed(2)),
        return3d: parseFloat(ret3d.toFixed(2)),
        return5d: parseFloat(ret5d.toFixed(2)),
        maxGain5d: parseFloat(maxGain.toFixed(2)),
        maxDrawdown5d: parseFloat(maxDD.toFixed(2)),
        setupType,
      });
    }
  }

  if (setups.length === 0) {
    return empty;
  }

  // ─── Compute Aggregated Statistics ────────────────────
  const wins1d = setups.filter(s => s.return1d > 0).length;
  const wins2d = setups.filter(s => s.return2d > 0).length;
  const wins3d = setups.filter(s => s.return3d > 0).length;
  const wins5d = setups.filter(s => s.return5d > 0).length;

  const sum1d = setups.reduce((a, s) => a + s.return1d, 0);
  const sum2d = setups.reduce((a, s) => a + s.return2d, 0);
  const sum3d = setups.reduce((a, s) => a + s.return3d, 0);
  const sum5d = setups.reduce((a, s) => a + s.return5d, 0);
  const sumMaxGain = setups.reduce((a, s) => a + s.maxGain5d, 0);
  const sumMaxDD = setups.reduce((a, s) => a + s.maxDrawdown5d, 0);

  const n = setups.length;
  const winRate1d = (wins1d / n) * 100;
  const winRate2d = (wins2d / n) * 100;
  const winRate3d = (wins3d / n) * 100;
  const winRate5d = (wins5d / n) * 100;

  const avgReturn1d = sum1d / n;
  const avgReturn2d = sum2d / n;
  const avgReturn3d = sum3d / n;
  const avgReturn5d = sum5d / n;
  const avgMaxGain5d = sumMaxGain / n;
  const avgMaxDrawdown5d = sumMaxDD / n;

  const bestReturn1d = Math.max(...setups.map(s => s.return1d));
  const worstReturn1d = Math.min(...setups.map(s => s.return1d));
  const bestReturn5d = Math.max(...setups.map(s => s.return5d));

  // ─── Compute Pattern Confidence (0-100) ──────────────
  // Based on: number of data points, consistency of results,
  // and how strong the signal is
  let confidence = 0;

  // Data points factor (more setups = more confidence, up to 40 points)
  confidence += Math.min(40, n * 8);

  // Consistency factor: if win rate is very high or very low, more confident (up to 30 points)
  const consistencyScore = Math.abs(winRate5d - 50) * 0.6; // 0-30
  confidence += Math.min(30, consistencyScore);

  // Average return factor: stronger avg returns = more confidence (up to 20 points)
  if (avgReturn5d > 0) {
    confidence += Math.min(20, avgReturn5d * 2);
  } else if (avgReturn5d < 0) {
    confidence += Math.min(20, Math.abs(avgReturn5d) * 2);
  }

  // Similarity to current setup bonus (up to 10 points)
  // If current setup is stronger than avg historical setup, slightly more confident
  const avgHistChange = setups.reduce((a, s) => a + s.dayChangePct, 0) / n;
  const avgHistRVol = setups.reduce((a, s) => a + s.dayRelVol, 0) / n;
  if (currentChangePct > avgHistChange && currentRVol > avgHistRVol) {
    confidence += 10;
  } else if (currentChangePct > avgHistChange || currentRVol > avgHistRVol) {
    confidence += 5;
  }

  confidence = Math.min(100, Math.max(0, Math.round(confidence)));

  // ─── Determine Bias ───────────────────────────────────
  let historicalBias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (winRate5d >= 60 && avgReturn5d > 2) {
    historicalBias = 'bullish';
  } else if (winRate5d <= 40 || avgReturn5d < -2) {
    historicalBias = 'bearish';
  }

  // ─── Setup Type Breakdown ─────────────────────────────
  const typeMap = new Map<string, HistoricalSetup[]>();
  for (const s of setups) {
    const arr = typeMap.get(s.setupType) || [];
    arr.push(s);
    typeMap.set(s.setupType, arr);
  }

  const setupBreakdown = Array.from(typeMap.entries()).map(([label, typeSetups]) => {
    const wins = typeSetups.filter(s => s.return5d > 0).length;
    const avgRet = typeSetups.reduce((a, s) => a + s.return5d, 0) / typeSetups.length;
    return {
      label,
      count: typeSetups.length,
      winRate5d: parseFloat(((wins / typeSetups.length) * 100).toFixed(0)),
      avgReturn5d: parseFloat(avgRet.toFixed(1)),
    };
  }).sort((a, b) => b.count - a.count);

  return {
    winRate1d: parseFloat(winRate1d.toFixed(0)),
    winRate2d: parseFloat(winRate2d.toFixed(0)),
    winRate3d: parseFloat(winRate3d.toFixed(0)),
    winRate5d: parseFloat(winRate5d.toFixed(0)),
    avgReturn1d: parseFloat(avgReturn1d.toFixed(2)),
    avgReturn2d: parseFloat(avgReturn2d.toFixed(2)),
    avgReturn3d: parseFloat(avgReturn3d.toFixed(2)),
    avgReturn5d: parseFloat(avgReturn5d.toFixed(2)),
    bestReturn1d: parseFloat(bestReturn1d.toFixed(2)),
    worstReturn1d: parseFloat(worstReturn1d.toFixed(2)),
    bestReturn5d: parseFloat(bestReturn5d.toFixed(2)),
    avgMaxGain5d: parseFloat(avgMaxGain5d.toFixed(2)),
    avgMaxDrawdown5d: parseFloat(avgMaxDrawdown5d.toFixed(2)),
    setupsFound: n,
    patternConfidence: confidence,
    historicalBias,
    setupBreakdown,
    setups: setups.slice(-10), // keep last 10 for transparency
  };
}

/**
 * Compute a single "historical score" (0-100) for ranking purposes.
 * Combines pattern confidence, win rate, and avg return into one number.
 */
export function computeHistoricalScore(analysis: PatternAnalysis): number {
  if (analysis.setupsFound === 0) return 50; // neutral if no data

  let score = 50; // start at neutral

  // Win rate influence (±25 points)
  score += (analysis.winRate5d - 50) * 0.5;

  // Average return influence (±15 points)
  score += Math.max(-15, Math.min(15, analysis.avgReturn5d * 1.5));

  // Confidence influence (±10 points)
  score += (analysis.patternConfidence - 50) * 0.2;

  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Generate a human-readable summary of the historical analysis.
 */
export function formatHistoricalSummary(analysis: PatternAnalysis): string {
  if (analysis.setupsFound === 0) {
    return 'Asnjë model i ngjashëm historik nuk u gjet për këtë aksion.';
  }

  const biasEmoji = analysis.historicalBias === 'bullish' ? '📈' : analysis.historicalBias === 'bearish' ? '📉' : '➡️';
  const parts = [
    `${biasEmoji} ${analysis.setupsFound} raste të ngjashme të gjetura në 90 ditët e fundit.`,
    `Win rate ditën tjetër: ${analysis.winRate1d}% | 5 ditë: ${analysis.winRate5d}%`,
    `Return mesatar: 1D ${analysis.avgReturn1d > 0 ? '+' : ''}${analysis.avgReturn1d}% | 5D ${analysis.avgReturn5d > 0 ? '+' : ''}${analysis.avgReturn5d}%`,
    `Besimi i modelit: ${analysis.patternConfidence}/100`,
  ];

  if (analysis.avgMaxGain5d > 0) {
    parts.push(`Gain maksimal mesatar (5D): +${analysis.avgMaxGain5d}%`);
  }
  if (analysis.avgMaxDrawdown5d > 0) {
    parts.push(`Drawdown mesatar (5D): -${analysis.avgMaxDrawdown5d}%`);
  }

  return parts.join(' • ');
}
