// ============================================================
// ANALYST REVISION ENGINE — Estimate Revision / Earnings Revision Factor
//
// Changes in analyst estimates have predictive value for stock
// returns. This is "fundamental momentum" — often more valuable
// than pure technical indicators.
//
// Uses Alpha Vantage EARNINGS endpoint to extract:
// - Number of positive vs negative revisions
// - Revision ratio (positive / total)
// - Surprise trend (improving or worsening)
// - Composite analyst revision score (-100 to +100)
//
// Data source: Alpha Vantage EARNINGS (quarterly reports with
// reportedEPS vs estimatedEPS across quarters)
// ============================================================

import { fetchEarnings, type EarningsReport } from './pead-engine';

// ─── Types ────────────────────────────────────────────────────

export interface AnalystRevisionInput {
  symbol: string;
  earningsReports: EarningsReport[];
}

export interface AnalystRevisionScore {
  symbol: string;
  /** Overall revision signal: -100 to +100 */
  revisionScore: number;
  /** Trend direction */
  trend: 'STRONG_UP' | 'UP' | 'NEUTRAL' | 'DOWN' | 'STRONG_DOWN' | 'NO_DATA';
  /** Number of positive surprises in last 4 quarters */
  positiveCount: number;
  /** Number of negative surprises in last 4 quarters */
  negativeCount: number;
  /** Revision ratio: positiveCount / total (0 to 1) */
  revisionRatio: number;
  /** Average surprise % across quarters */
  avgSurprisePct: number;
  /** Is the surprise trend improving? (last quarter better than previous) */
  improvingTrend: boolean;
  /** Consecutive positive quarters */
  consecutivePositive: number;
  /** Consecutive negative quarters */
  consecutiveNegative: number;
  /** Reasons */
  reasons: string[];
  /** Risk flags */
  riskFlags: string[];
}

// ─── Core Computation ──────────────────────────────────────────

/**
 * Compute analyst revision score from earnings history.
 * 
 * Logic:
 * 1. Look at last 4 quarters of earnings reports
 * 2. Count positive vs negative surprises
 * 3. Calculate surprise trend (improving/worsening)
 * 4. Check for consecutive beats/misses
 * 5. Composite score based on all factors
 */
export function computeAnalystRevisionScore(input: AnalystRevisionInput): AnalystRevisionScore {
  const { symbol, earningsReports } = input;

  const defaults: AnalystRevisionScore = {
    symbol,
    revisionScore: 0,
    trend: 'NO_DATA',
    positiveCount: 0,
    negativeCount: 0,
    revisionRatio: 0,
    avgSurprisePct: 0,
    improvingTrend: false,
    consecutivePositive: 0,
    consecutiveNegative: 0,
    reasons: [],
    riskFlags: [],
  };

  if (!earningsReports || earningsReports.length < 2) {
    return defaults;
  }

  // Use last 4 quarters
  const recent = earningsReports.slice(0, Math.min(4, earningsReports.length));
  const reasons: string[] = [];
  const riskFlags: string[] = [];

  // Count surprises
  let positiveCount = 0;
  let negativeCount = 0;
  let totalSurprise = 0;
  let validSurprises = 0;

  for (const r of recent) {
    if (r.surprise !== null) {
      if (r.surprise > 0) positiveCount++;
      else if (r.surprise < 0) negativeCount++;
      totalSurprise += r.surprisePct ?? 0;
      validSurprises++;
    }
  }

  const total = positiveCount + negativeCount;
  const revisionRatio = total > 0 ? positiveCount / total : 0.5;
  const avgSurprisePct = validSurprises > 0 ? totalSurprise / validSurprises : 0;

  // ── 1. Revision Ratio Score (-30 to +30) ──
  let ratioScore = 0;
  if (total >= 2) {
    if (revisionRatio >= 1.0) { ratioScore = 30; reasons.push('4/4 quarters positive — konsensusi po ngrihet'); }
    else if (revisionRatio >= 0.75) { ratioScore = 22; reasons.push('75%+ quarters me beat'); }
    else if (revisionRatio >= 0.5) { ratioScore = 10; }
    else if (revisionRatio <= 0) { ratioScore = -30; riskFlags.push('4/4 quarters negative — konsensusi po ulet'); }
    else if (revisionRatio <= 0.25) { ratioScore = -22; riskFlags.push('75%+ quarters me miss'); }
    else { ratioScore = -10; }
  } else if (total === 1) {
    ratioScore = positiveCount === 1 ? 10 : -10;
  }

  // ── 2. Surprise Trend (-25 to +25) ──
  let trendScore = 0;
  let improvingTrend = false;

  if (recent.length >= 2) {
    const latest = recent[0].surprisePct ?? 0;
    const previous = recent[1].surprisePct ?? 0;
    const diff = latest - previous;

    if (diff > 5) {
      trendScore = 25;
      improvingTrend = true;
      reasons.push('Surprise po mirësohet: +Q4 vs Q3');
    } else if (diff > 0) {
      trendScore = 15;
      improvingTrend = true;
      reasons.push('Surprise në rritje nga kuarti i fundit');
    } else if (diff < -5) {
      trendScore = -25;
      riskFlags.push('Surprise po përkeqësohet');
    } else if (diff < 0) {
      trendScore = -15;
    }
  }

  // ── 3. Consecutive Streak Bonus (-20 to +20) ──
  let streakScore = 0;
  let consecutivePositive = 0;
  let consecutiveNegative = 0;

  for (const r of recent) {
    if (r.surprise === null) continue;
    if (r.surprise > 0) {
      if (consecutiveNegative > 0) break;
      consecutivePositive++;
    } else if (r.surprise < 0) {
      if (consecutivePositive > 0) break;
      consecutiveNegative++;
    } else {
      break;
    }
  }

  if (consecutivePositive >= 4) {
    streakScore = 20;
    reasons.push('4 beat-e radhazi — nxitje e fortë konsensusi');
  } else if (consecutivePositive >= 3) {
    streakScore = 15;
    reasons.push('3 beat-e radhazi');
  } else if (consecutivePositive >= 2) {
    streakScore = 8;
  } else if (consecutiveNegative >= 4) {
    streakScore = -20;
    riskFlags.push('4 miss-e radhazi — degradim i konsensusit');
  } else if (consecutiveNegative >= 3) {
    streakScore = -15;
    riskFlags.push('3 miss-e radhazi');
  } else if (consecutiveNegative >= 2) {
    streakScore = -8;
  }

  // ── 4. Average Surprise Magnitude (-15 to +15) ──
  let magnitudeScore = 0;
  if (validSurprises >= 2) {
    if (avgSurprisePct > 10) {
      magnitudeScore = 15;
      reasons.push(`Surprise mesatar: +${avgSurprisePct.toFixed(1)}%`);
    } else if (avgSurprisePct > 5) {
      magnitudeScore = 10;
      reasons.push(`Surprise mesatar: +${avgSurprisePct.toFixed(1)}%`);
    } else if (avgSurprisePct > 0) {
      magnitudeScore = 5;
    } else if (avgSurprisePct < -10) {
      magnitudeScore = -15;
      riskFlags.push(`Surprise mesatar: ${avgSurprisePct.toFixed(1)}%`);
    } else if (avgSurprisePct < -5) {
      magnitudeScore = -10;
    } else if (avgSurprisePct < 0) {
      magnitudeScore = -5;
    }
  }

  // ── Composite Score ──
  const rawScore = ratioScore + trendScore + streakScore + magnitudeScore;
  const revisionScore = Math.round(Math.max(-100, Math.min(100, rawScore)));

  // ── Trend Classification ──
  let trend: AnalystRevisionScore['trend'] = 'NEUTRAL';
  if (revisionScore >= 50) trend = 'STRONG_UP';
  else if (revisionScore >= 15) trend = 'UP';
  else if (revisionScore >= -15) trend = 'NEUTRAL';
  else if (revisionScore >= -50) trend = 'DOWN';
  else trend = 'STRONG_DOWN';

  return {
    symbol,
    revisionScore,
    trend,
    positiveCount,
    negativeCount,
    revisionRatio: Math.round(revisionRatio * 100) / 100,
    avgSurprisePct: Math.round(avgSurprisePct * 10) / 10,
    improvingTrend,
    consecutivePositive,
    consecutiveNegative,
    reasons,
    riskFlags,
  };
}

// ─── Feature for ML pipeline ───────────────────────────────────

export interface AnalystRevisionFeature {
  analyst_revision_score: number;
  analyst_revision_trend: number; // 2=STRONG_UP, 1=UP, 0=NEUTRAL, -1=DOWN, -2=STRONG_DOWN
  analyst_positive_ratio: number;
  analyst_avg_surprise_pct: number;
  analyst_consecutive_positive: number;
  analyst_improving: number;
}

export function analystRevisionToFeatures(r: AnalystRevisionScore): AnalystRevisionFeature {
  const trendMap: Record<string, number> = {
    STRONG_UP: 2, UP: 1, NEUTRAL: 0, DOWN: -1, STRONG_DOWN: -2, NO_DATA: 0,
  };
  return {
    analyst_revision_score: r.revisionScore,
    analyst_revision_trend: trendMap[r.trend] ?? 0,
    analyst_positive_ratio: r.revisionRatio,
    analyst_avg_surprise_pct: r.avgSurprisePct,
    analyst_consecutive_positive: r.consecutivePositive,
    analyst_improving: r.improvingTrend ? 1 : 0,
  };
}

// ─── Batch compute (reuses PEAD earnings cache) ────────────────

export async function computeAnalystRevisionBatch(
  symbols: string[],
): Promise<Map<string, AnalystRevisionScore>> {
  const results = new Map<string, AnalystRevisionScore>();

  const promises = symbols.map(async (sym) => {
    try {
      const reports = await fetchEarnings(sym);
      const score = computeAnalystRevisionScore({ symbol: sym, earningsReports: reports });
      results.set(sym, score);
    } catch {}
  });
  await Promise.allSettled(promises);

  return results;
}
