// ============================================================
// Conformal Risk Layer
// Provides distribution-free uncertainty quantification.
// Given a sequence of (predicted probability, actual outcome) pairs,
// computes nonconformity scores and constructs prediction sets
// with valid coverage guarantees — no distributional assumptions.
//
// Key outputs:
//   - uncertaintyBand: width of the prediction interval
//   - confidenceSet: {BUY, NO_TRADE} or {SELL, NO_TRADE} etc.
//   - tradeEligible: false if uncertainty is too high
//
// Conformal prediction is promoted for financial ML because it
// provides coverage guarantees without assuming Gaussian returns,
// which is critical for fat-tailed financial distributions.
// ============================================================

import { prisma } from '@/lib/prisma';

// ─── Types ────────────────────────────────────────────────────

export interface NonconformityScore {
  probability: number;
  outcome: number;
  score: number;  // |probability - outcome| or (probability - outcome)^2
}

export interface ConformalPredictionSet {
  // The predicted probability
  probabilityUp: number;
  // Uncertainty band: symmetric interval around probabilityUp
  lowerBound: number;
  upperBound: number;
  uncertaintyBand: number;
  // Alpha level used (1 - alpha = target coverage)
  alpha: number;
  // Empirical coverage on calibration data
  empiricalCoverage: number;
  // Number of calibration samples
  calibrationSize: number;
  // The conformal quantile (the threshold)
  conformalQuantile: number;
  // Is the prediction narrow enough to trade?
  tradeEligible: boolean;
  tradeEligibilityReason: string;
  // The confidence set: which decisions have conformal coverage
  confidenceSet: ConformalDecision[];
  // Recommendation
  recommendation: ConformalRecommendation;
}

export type ConformalDecision = 'BUY' | 'SELL' | 'HOLD' | 'NO_TRADE';

export interface ConformalRecommendation {
  action: 'PROCEED' | 'REDUCE_SIZE' | 'NO_TRADE';
  reason: string;
  suggestedPositionScale: number; // 0.0 to 1.0
}

export interface ConformalConfig {
  alpha: number;              // significance level (default 0.15 → 85% coverage)
  maxUncertaintyBand: number; // if band > this, tradeEligible = false (default 0.30)
  reduceBand: number;         // if band > this but < max, reduce size (default 0.18)
  minCalibrationSize: number; // minimum samples to compute (default 100)
  nonconformityMetric: 'absolute' | 'squared'; // how to measure nonconformity
}

export interface SymbolConformalProfile {
  symbol: string;
  regime?: string;
  current: ConformalPredictionSet;
  historical: {
    avgUncertaintyBand: number;
    avgCoverage: number;
    totalCalibrated: number;
    tradeEligibleRate: number;
  } | null;
}

// ─── Defaults ──────────────────────────────────────────────────

const DEFAULT_CONFIG: ConformalConfig = {
  alpha: 0.15,
  maxUncertaintyBand: 0.30,
  reduceBand: 0.18,
  minCalibrationSize: 100,
  nonconformityMetric: 'absolute',
};

// ─── Cache ─────────────────────────────────────────────────────

interface CachedConformal {
  scores: NonconformityScore[];
  quantile: number;
  computedAt: number;
  filteredBy: { modelVersion?: string; horizonDays?: number; regime?: string };
}
let conformalCache: CachedConformal | null = null;
const CONFORMAL_CACHE_MS = 20 * 60 * 1000; // 20 minutes

// ─── Compute Nonconformity Scores ──────────────────────────────

async function loadNonconformityScores(
  params?: { modelVersion?: string; horizonDays?: number; regime?: string },
  metric: 'absolute' | 'squared' = 'absolute',
): Promise<NonconformityScore[]> {
  const cacheKey = JSON.stringify(params ?? {});
  if (conformalCache && Date.now() - conformalCache.computedAt < CONFORMAL_CACHE_MS
      && JSON.stringify(conformalCache.filteredBy) === cacheKey) {
    return conformalCache.scores;
  }

  const rows = await prisma.prediction.findMany({
    where: {
      evaluationStatus: 'EVALUATED',
      actualOutcome: { not: null },
      ...(params?.modelVersion ? { modelVersion: params.modelVersion } : {}),
      ...(params?.horizonDays ? { horizonDays: params.horizonDays } : {}),
      ...(params?.regime ? { regime: params.regime } : {}),
    },
    select: { calibratedConfidence: true, actualOutcome: true },
    orderBy: { predictedAt: 'desc' },
    take: 5000,
  });

  const scores: NonconformityScore[] = rows.map(r => {
    const prob = r.calibratedConfidence / 100;
    const outcome = r.actualOutcome as number;
    return {
      probability: prob,
      outcome,
      score: metric === 'absolute'
        ? Math.abs(prob - outcome)
        : (prob - outcome) ** 2,
    };
  });

  // Compute and cache quantile
  const sortedScores = [...scores].sort((a, b) => a.score - b.score);
  const quantile = sortedScores.length > 0
    ? computeConformalQuantile(sortedScores, DEFAULT_CONFIG.alpha)
    : 0;

  conformalCache = {
    scores,
    quantile,
    computedAt: Date.now(),
    filteredBy: params ?? {},
  };

  return scores;
}

// ─── Conformal Quantile ────────────────────────────────────────
// q = ceil((n+1)*(1-alpha)) / n-th sorted nonconformity score
// This gives the threshold such that (1-alpha) fraction of past
// predictions had nonconformity score ≤ q.

function computeConformalQuantile(
  sortedScores: NonconformityScore[],
  alpha: number,
): number {
  const n = sortedScores.length;
  if (n === 0) return 1;

  // Split conformal: use first half for calibration, second half for validation
  // But for production, use all data with the standard quantile formula
  const rank = Math.ceil((n + 1) * (1 - alpha));
  const idx = Math.min(rank - 1, n - 1);
  return sortedScores[idx].score;
}

// ─── Build Prediction Set ──────────────────────────────────────
// Given a predicted probability and the conformal quantile,
// construct an interval [prob - q, prob + q] and determine
// which decisions are covered.

function buildPredictionSet(
  probabilityUp: number,
  quantile: number,
  config: ConformalConfig,
  calibrationScores: NonconformityScore[],
): ConformalPredictionSet {
  const lowerBound = Math.max(0, probabilityUp - quantile);
  const upperBound = Math.min(1, probabilityUp + quantile);
  const uncertaintyBand = upperBound - lowerBound;

  // Empirical coverage on calibration data
  let covered = 0;
  for (const s of calibrationScores) {
    if (Math.abs(s.probability - s.outcome) <= quantile * 1.05) covered++; // 5% slack for rounding
  }
  const empiricalCoverage = calibrationScores.length > 0
    ? covered / calibrationScores.length
    : 0;

  // Determine confidence set: which decisions are consistent with the interval?
  const confidenceSet: ConformalDecision[] = [];

  // If the entire interval is above 0.5, BUY is covered
  if (lowerBound > 0.5) {
    confidenceSet.push('BUY');
  }
  // If the entire interval is below 0.5, SELL is covered
  if (upperBound < 0.5) {
    confidenceSet.push('SELL');
  }
  // If interval straddles 0.5, both BUY and SELL are possible → uncertain
  if (lowerBound <= 0.5 && upperBound >= 0.5) {
    if (lowerBound < 0.35) confidenceSet.push('SELL');
    if (upperBound > 0.65) confidenceSet.push('BUY');
    confidenceSet.push('HOLD');
    confidenceSet.push('NO_TRADE');
  }
  // Always include NO_TRADE if band is wide
  if (uncertaintyBand > config.reduceBand) {
    if (!confidenceSet.includes('NO_TRADE')) {
      confidenceSet.push('NO_TRADE');
    }
  }

  // Trade eligibility
  let tradeEligible = true;
  let tradeEligibilityReason = 'Uncertainty within acceptable range';
  let recommendation: ConformalRecommendation;

  if (uncertaintyBand > config.maxUncertaintyBand) {
    tradeEligible = false;
    tradeEligibilityReason = `Band ${uncertaintyBand.toFixed(3)} > max ${config.maxUncertaintyBand}. Too uncertain to trade.`;
    recommendation = {
      action: 'NO_TRADE',
      reason: tradeEligibilityReason,
      suggestedPositionScale: 0,
    };
  } else if (uncertaintyBand > config.reduceBand) {
    // Reduce position size proportionally
    const scale = 1 - ((uncertaintyBand - config.reduceBand) / (config.maxUncertaintyBand - config.reduceBand)) * 0.7;
    tradeEligibilityReason = `Band ${uncertaintyBand.toFixed(3)} is elevated. Reduce position size to ${(scale * 100).toFixed(0)}%.`;
    recommendation = {
      action: 'REDUCE_SIZE',
      reason: tradeEligibilityReason,
      suggestedPositionScale: Math.round(scale * 100) / 100,
    };
  } else {
    recommendation = {
      action: 'PROCEED',
      reason: 'Uncertainty band is narrow. Standard position sizing applies.',
      suggestedPositionScale: 1.0,
    };
  }

  return {
    probabilityUp: Math.round(probabilityUp * 10000) / 10000,
    lowerBound: Math.round(lowerBound * 10000) / 10000,
    upperBound: Math.round(upperBound * 10000) / 10000,
    uncertaintyBand: Math.round(uncertaintyBand * 10000) / 10000,
    alpha: config.alpha,
    empiricalCoverage: Math.round(empiricalCoverage * 10000) / 10000,
    calibrationSize: calibrationScores.length,
    conformalQuantile: Math.round(quantile * 10000) / 10000,
    tradeEligible,
    tradeEligibilityReason,
    confidenceSet,
    recommendation,
  };
}

// ─── Main: Compute Conformal Prediction for a Symbol ───────────

export async function computeConformalPrediction(
  probabilityUp: number,
  params?: {
    modelVersion?: string;
    horizonDays?: number;
    regime?: string;
    config?: Partial<ConformalConfig>;
  },
): Promise<ConformalPredictionSet> {
  const config = { ...DEFAULT_CONFIG, ...params?.config };
  const scores = await loadNonconformityScores(
    { modelVersion: params?.modelVersion, horizonDays: params?.horizonDays, regime: params?.regime },
    config.nonconformityMetric,
  );

  if (scores.length < config.minCalibrationSize) {
    // Not enough data — return a conservative wide interval
    const wideBand = 0.35;
    return {
      probabilityUp: Math.round(probabilityUp * 10000) / 10000,
      lowerBound: Math.round(Math.max(0, probabilityUp - wideBand / 2) * 10000) / 10000,
      upperBound: Math.round(Math.min(1, probabilityUp + wideBand / 2) * 10000) / 10000,
      uncertaintyBand: wideBand,
      alpha: config.alpha,
      empiricalCoverage: 0,
      calibrationSize: scores.length,
      conformalQuantile: wideBand / 2,
      tradeEligible: false,
      tradeEligibilityReason: `Only ${scores.length} calibration samples (need ${config.minCalibrationSize}). Using conservative wide interval.`,
      confidenceSet: ['HOLD', 'NO_TRADE'],
      recommendation: {
        action: 'NO_TRADE',
        reason: `Insufficient calibration data (${scores.length}/${config.minCalibrationSize}). Accumulate more evaluated predictions.`,
        suggestedPositionScale: 0,
      },
    };
  }

  const quantile = conformalCache?.quantile ?? computeConformalQuantile(
    [...scores].sort((a, b) => a.score - b.score),
    config.alpha,
  );

  return buildPredictionSet(probabilityUp, quantile, config, scores);
}

// ─── Historical Profile for a Symbol ───────────────────────────

export async function getConformalProfile(
  symbol: string,
  params?: { modelVersion?: string; horizonDays?: number },
): Promise<SymbolConformalProfile> {
  // Get recent predictions for this symbol to compute symbol-specific profile
  const symbolPredictions = await prisma.prediction.findMany({
    where: {
      symbol,
      evaluationStatus: 'EVALUATED',
      actualOutcome: { not: null },
      ...(params?.modelVersion ? { modelVersion: params.modelVersion } : {}),
      ...(params?.horizonDays ? { horizonDays: params.horizonDays } : {}),
    },
    select: { calibratedConfidence: true, actualOutcome: true, regime: true },
    orderBy: { predictedAt: 'desc' },
    take: 500,
  });

  const scores = symbolPredictions.map(r => {
    const prob = r.calibratedConfidence / 100;
    const outcome = r.actualOutcome as number;
    return Math.abs(prob - outcome);
  });

  const currentRegime = symbolPredictions[0]?.regime;

  // Compute current conformal set for this symbol using global calibration
  const avgProb = symbolPredictions.length > 0
    ? symbolPredictions.reduce((s, r) => s + r.calibratedConfidence / 100, 0) / symbolPredictions.length
    : 0.5;

  const current = await computeConformalPrediction(avgProb, params);

  return {
    symbol,
    regime: currentRegime ?? undefined,
    current,
    historical: symbolPredictions.length >= 10 ? {
      avgUncertaintyBand: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10000) / 10000 : 0,
      avgCoverage: 0, // Would need conformal quantile per-symbol to compute
      totalCalibrated: symbolPredictions.length,
      tradeEligibleRate: scores.length > 0
        ? Math.round(scores.filter(s => s < DEFAULT_CONFIG.maxUncertaintyBand / 2).length / scores.length * 10000) / 10000
        : 0,
    } : null,
  };
}

// ─── Quick check: should we even compute conformal? ───────────
// Lightweight gate to avoid expensive DB queries when not needed

export function shouldComputeConformal(calibratedConfidence: number): boolean {
  // If confidence is very low or very high, conformal is most useful
  // In the middle range (45-65), the model is already uncertain
  return true; // Always compute for now — the cost is the cached DB query
}

// ─── Invalidate Cache ──────────────────────────────────────────

export function invalidateConformalCache(): void {
  conformalCache = null;
}
