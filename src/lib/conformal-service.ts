// ============================================================
// Conformal Service — thin service layer consumed by routes.
// Decouples API surface from conformal-risk internals.
// ============================================================

import { prisma } from '@/lib/prisma';
import {
  computeConformalPrediction,
  getConformalProfile,
  invalidateConformalCache,
  type ConformalPredictionSet,
  type ConformalRecommendation,
  type ConformalDecision,
} from '@/lib/conformal-risk';

// ─── Types ────────────────────────────────────────────────────

export interface ConformalServiceParams {
  symbol: string;
  probability: number;
  modelVersion?: string;
  alpha?: number;
  minEdge?: number;
  horizonDays?: number;
  regime?: string;
}

export interface ConformalServiceResult {
  sampleSize: number;
  threshold: number;
  probabilityUp: number;
  lowerBound: number;
  upperBound: number;
  uncertaintyBand: number;
  empiricalCoverage: number;
  tradeEligible: boolean;
  tradeEligibilityReason: string;
  confidenceSet: ConformalDecision[];
  suggestion: ConformalRecommendation;
}

// ─── Fit Conformal Threshold ───────────────────────────────────
// Computes the nonconformity score quantile from calibration data.

export function fitConformalThreshold(
  fittedRows: { calibratedProbability: number; outcome: number }[],
  alpha: number,
): number {
  if (fittedRows.length === 0) return 0.5;

  // Compute nonconformity scores (absolute error)
  const scores = fittedRows
    .map(r => Math.abs(r.calibratedProbability - r.outcome))
    .sort((a, b) => a - b);

  const n = scores.length;
  const rank = Math.ceil((n + 1) * (1 - alpha));
  const idx = Math.min(rank - 1, n - 1);
  return scores[idx];
}

// ─── Build Conformal Decision ──────────────────────────────────
// Lightweight decision builder using pre-computed threshold.

export function buildConformalDecision(params: {
  calibratedProbability: number;
  threshold: number;
  minEdge: number;
  alpha?: number;
  sampleSize?: number;
  empiricalCoverage?: number;
}): ConformalServiceResult {
  const { calibratedProbability: prob, threshold: q, minEdge, alpha = 0.1, sampleSize = 0, empiricalCoverage = 0 } = params;

  const lowerBound = Math.max(0, prob - q);
  const upperBound = Math.min(1, prob + q);
  const uncertaintyBand = upperBound - lowerBound;

  // Confidence set
  const confidenceSet: ConformalDecision[] = [];
  if (lowerBound > 0.5) confidenceSet.push('BUY');
  if (upperBound < 0.5) confidenceSet.push('SELL');
  if (lowerBound <= 0.5 && upperBound >= 0.5) {
    if (lowerBound < 0.35) confidenceSet.push('SELL');
    if (upperBound > 0.65) confidenceSet.push('BUY');
    confidenceSet.push('HOLD');
    confidenceSet.push('NO_TRADE');
  }
  if (uncertaintyBand > 0.18 && !confidenceSet.includes('NO_TRADE')) {
    confidenceSet.push('NO_TRADE');
  }

  // Trade eligibility
  let tradeEligible = true;
  let tradeEligibilityReason = 'Uncertainty within acceptable range';
  let suggestion: ConformalRecommendation;

  if (uncertaintyBand > 0.30) {
    tradeEligible = false;
    tradeEligibilityReason = `Band ${uncertaintyBand.toFixed(3)} > 0.30. Too uncertain to trade.`;
    suggestion = { action: 'NO_TRADE', reason: tradeEligibilityReason, suggestedPositionScale: 0 };
  } else if (uncertaintyBand > 0.18) {
    const scale = Math.round((1 - ((uncertaintyBand - 0.18) / 0.12) * 0.7) * 100) / 100;
    tradeEligibilityReason = `Band ${uncertaintyBand.toFixed(3)} is elevated. Reduce position size to ${(scale * 100).toFixed(0)}%.`;
    suggestion = { action: 'REDUCE_SIZE', reason: tradeEligibilityReason, suggestedPositionScale: scale };
  } else {
    suggestion = { action: 'PROCEED', reason: 'Uncertainty band is narrow. Standard position sizing applies.', suggestedPositionScale: 1.0 };
  }

  return {
    sampleSize,
    threshold: Math.round(q * 10000) / 10000,
    probabilityUp: Math.round(prob * 10000) / 10000,
    lowerBound: Math.round(lowerBound * 10000) / 10000,
    upperBound: Math.round(upperBound * 10000) / 10000,
    uncertaintyBand: Math.round(uncertaintyBand * 10000) / 10000,
    empiricalCoverage: Math.round(empiricalCoverage * 10000) / 10000,
    tradeEligible,
    tradeEligibilityReason,
    confidenceSet,
    suggestion,
  };
}

// ─── Main: Get Conformal Decision ──────────────────────────────
// Fetches calibration data from DB, fits threshold, returns decision.

export async function getConformalDecision(
  params: ConformalServiceParams,
): Promise<ConformalServiceResult> {
  const rows = await prisma.prediction.findMany({
    where: {
      symbol: params.symbol,
      ...(params.modelVersion ? { modelVersion: params.modelVersion } : {}),
      evaluationStatus: 'EVALUATED',
      actualOutcome: { not: null },
    },
    select: {
      calibratedConfidence: true,
      actualOutcome: true,
    },
    orderBy: { predictedAt: 'desc' },
    take: 500,
  });

  const fittedRows = rows.map(r => ({
    calibratedProbability: r.calibratedConfidence / 100,
    outcome: r.actualOutcome ?? 0,
  }));

  const alpha = params.alpha ?? 0.1;
  const threshold = fitConformalThreshold(fittedRows, alpha);

  return buildConformalDecision({
    calibratedProbability: params.probability,
    threshold,
    minEdge: params.minEdge ?? 0.08,
    alpha,
    sampleSize: fittedRows.length,
  });
}

// ─── Full Conformal via lib (for profile mode) ────────────────

export async function getConformalProfileService(
  symbol: string,
  params?: { modelVersion?: string; horizonDays?: number },
) {
  return getConformalProfile(symbol, params);
}

// ─── Full Conformal Prediction Set via lib ─────────────────────
// For direct use in the predict route where we want the
// full ConformalPredictionSet object.

export async function getFullConformalPrediction(
  probabilityUp: number,
  params?: {
    modelVersion?: string;
    horizonDays?: number;
    regime?: string;
    alpha?: number;
    maxBand?: number;
  },
): Promise<ConformalPredictionSet> {
  return computeConformalPrediction(probabilityUp, {
    modelVersion: params?.modelVersion,
    horizonDays: params?.horizonDays,
    regime: params?.regime,
    config: {
      ...(params?.alpha !== undefined ? { alpha: params.alpha } : {}),
      ...(params?.maxBand !== undefined ? { maxUncertaintyBand: params.maxBand } : {}),
    },
  });
}

// ─── Invalidate Cache ──────────────────────────────────────────

export { invalidateConformalCache };
