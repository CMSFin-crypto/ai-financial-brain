// ============================================================
// Model Promotion — Governance for V1→V2 model version promotion.
// This is the prediction-level promotion (separate from spillover
// V1→V2 which lives in spillover-promotion.ts).
//
// A new model version is promoted ONLY if it satisfies ALL gates:
//   1. Minimum sample size (configurable per horizon)
//   2. Lower Brier score (better calibration)
//   3. Lower ECE (better reliability)
//   4. Higher alpha (more excess return over benchmark)
//   5. Max drawdown not worse than incumbent (risk control)
//   6. No catastrophic regression on any sub-metric
//
// This prevents the system from promoting models that happened
// to have a few good weeks but aren't genuinely better.
// ============================================================

import { prisma } from '@/lib/prisma';
import { calculateModelMetrics } from './model-metrics';
import { computeCalibrationReport } from './calibration-metrics';

// ─── Types ────────────────────────────────────────────────────

export interface PromotionGateResult {
  gate: string;
  passed: boolean;
  value: number | null;
  threshold: number | null | undefined;
  detail: string;
}

export interface PromotionEvaluation {
  candidateVersion: string;
  incumbentVersion: string;
  evaluatedAt: string;
  shouldPromote: boolean;
  gatesPassed: number;
  gatesTotal: number;
  gates: PromotionGateResult[];
  candidateMetrics: PromotionMetricsSummary | null;
  incumbentMetrics: PromotionMetricsSummary | null;
  summary: string;
}

export interface PromotionMetricsSummary {
  sampleSize: number;
  accuracy: number | null;
  brierScore: number | null;
  ece: number | null;
  alpha: number | null;
  maxDrawdown: number | null;
  avgReturn: number | null;
  winRate: number | null;
}

export interface PromotionConfig {
  minSampleSize: number;
  brierImprovementMin: number;   // candidate must be at least this much better
  eceImprovementMin: number;     // candidate ECE must be at least this much lower
  alphaImprovementMin: number;   // candidate alpha must be at least this much higher
  maxDrawdownTolerance: number;  // candidate drawdown can be at most this much worse
  accuracyRegressionMax: number; // accuracy cannot drop by more than this
}

export type ActiveModelVersion = {
  version: string;
  promotedAt: string | null;
  promotionReason: string | null;
};

// ─── Defaults ──────────────────────────────────────────────────

const DEFAULT_CONFIG: PromotionConfig = {
  minSampleSize: 100,
  brierImprovementMin: 0.005,    // Brier must be at least 0.005 better
  eceImprovementMin: 0.005,       // ECE must be at least 0.005 better
  alphaImprovementMin: 0.02,      // alpha must be at least 0.02pp higher
  maxDrawdownTolerance: 2.0,      // drawdown can be up to 2pp worse
  accuracyRegressionMax: 0.03,    // accuracy cannot drop more than 3pp
};

// ─── Cache ─────────────────────────────────────────────────────

let cachedActiveModel: ActiveModelVersion = {
  version: 'predict-v3-regime-spillover',
  promotedAt: null,
  promotionReason: null,
};
let promotionEvaluatedAt = 0;
const PROMOTION_CACHE_MS = 4 * 60 * 60 * 1000; // 4 hours

// ─── Gather Metrics for a Model Version ────────────────────────

async function gatherMetrics(
  modelVersion: string,
  horizonDays?: number,
): Promise<PromotionMetricsSummary | null> {
  const [metrics, calibration] = await Promise.all([
    calculateModelMetrics({ modelVersion, horizonDays }),
    computeCalibrationReport({ modelVersion, horizonDays }),
  ]);

  if (metrics.sampleSize === 0) return null;

  return {
    sampleSize: metrics.sampleSize,
    accuracy: metrics.accuracy,
    brierScore: metrics.brierScore,
    ece: calibration.ece,
    alpha: metrics.alpha,
    maxDrawdown: metrics.maxDrawdown,
    avgReturn: metrics.avgReturn,
    winRate: metrics.winRate,
  };
}

// ─── Evaluate Promotion ────────────────────────────────────────

export async function evaluatePromotion(
  candidateVersion: string,
  incumbentVersion?: string,
  horizonDays?: number,
  config?: Partial<PromotionConfig>,
): Promise<PromotionEvaluation> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const incumbent = incumbentVersion ?? cachedActiveModel.version;

  console.log(`[MODEL-PROMOTION] Evaluating ${candidateVersion} vs ${incumbent}`);

  const [candidateMetrics, incumbentMetrics] = await Promise.all([
    gatherMetrics(candidateVersion, horizonDays),
    gatherMetrics(incumbent, horizonDays),
  ]);

  const gates: PromotionGateResult[] = [];
  let gatesPassed = 0;

  // Gate 1: Minimum sample size
  const candidateSample = candidateMetrics?.sampleSize ?? 0;
  const sampleGatePassed = candidateSample >= cfg.minSampleSize;
  if (sampleGatePassed) gatesPassed++;
  gates.push({
    gate: 'min_sample_size',
    passed: sampleGatePassed,
    value: candidateSample,
    threshold: cfg.minSampleSize,
    detail: sampleGatePassed
      ? `Candidate has ${candidateSample} samples (≥${cfg.minSampleSize})`
      : `Candidate has only ${candidateSample} samples (need ${cfg.minSampleSize})`,
  });

  // Gate 2: Brier score improvement
  const candidateBrier = candidateMetrics?.brierScore ?? null;
  const incumbentBrier = incumbentMetrics?.brierScore ?? null;
  let brierGatePassed = false;
  if (candidateBrier !== null && incumbentBrier !== null) {
    const delta = incumbentBrier - candidateBrier; // positive = candidate better
    brierGatePassed = delta >= cfg.brierImprovementMin;
    if (brierGatePassed) gatesPassed++;
    gates.push({
      gate: 'brier_score',
      passed: brierGatePassed,
      value: candidateBrier ?? null,
      threshold: incumbentBrier != null ? (incumbentBrier - cfg.brierImprovementMin) : null,
      detail: brierGatePassed
        ? `Candidate Brier=${candidateBrier.toFixed(4)} vs incumbent ${incumbentBrier.toFixed(4)} (Δ=${delta.toFixed(4)}, need ≥${cfg.brierImprovementMin})`
        : `Candidate Brier=${candidateBrier?.toFixed(4)} not sufficiently better than incumbent ${incumbentBrier?.toFixed(4)} (Δ=${delta?.toFixed(4)}, need ≥${cfg.brierImprovementMin})`,
    });
  } else {
    gates.push({
      gate: 'brier_score', passed: false, value: candidateBrier, threshold: null,
      detail: 'Cannot evaluate Brier — missing metrics',
    });
  }

  // Gate 3: ECE improvement
  const candidateEce = candidateMetrics?.ece ?? null;
  const incumbentEce = incumbentMetrics?.ece ?? null;
  let eceGatePassed = false;
  if (candidateEce !== null && incumbentEce !== null) {
    const delta = incumbentEce - candidateEce; // positive = candidate better
    eceGatePassed = delta >= cfg.eceImprovementMin;
    if (eceGatePassed) gatesPassed++;
    gates.push({
      gate: 'ece',
      passed: eceGatePassed,
      value: candidateEce ?? null,
      threshold: incumbentEce != null ? (incumbentEce - cfg.eceImprovementMin) : null,
      detail: eceGatePassed
        ? `Candidate ECE=${candidateEce.toFixed(4)} vs incumbent ${incumbentEce.toFixed(4)} (Δ=${delta.toFixed(4)})`
        : `Candidate ECE=${candidateEce?.toFixed(4)} not sufficiently better than incumbent ${incumbentEce?.toFixed(4)}`,
    });
  } else {
    gates.push({
      gate: 'ece', passed: false, value: candidateEce, threshold: null,
      detail: 'Cannot evaluate ECE — missing calibration data',
    });
  }

  // Gate 4: Alpha improvement
  const candidateAlpha = candidateMetrics?.alpha ?? null;
  const incumbentAlpha = incumbentMetrics?.alpha ?? null;
  let alphaGatePassed = false;
  if (candidateAlpha !== null && incumbentAlpha !== null) {
    const delta = candidateAlpha - incumbentAlpha;
    alphaGatePassed = delta >= cfg.alphaImprovementMin;
    if (alphaGatePassed) gatesPassed++;
    gates.push({
      gate: 'alpha',
      passed: alphaGatePassed,
      value: candidateAlpha ?? null,
      threshold: incumbentAlpha != null ? (incumbentAlpha + cfg.alphaImprovementMin) : null,
      detail: alphaGatePassed
        ? `Candidate alpha=${candidateAlpha.toFixed(4)}% vs incumbent ${incumbentAlpha.toFixed(4)}% (Δ=+${delta.toFixed(4)}pp)`
        : `Candidate alpha=${candidateAlpha?.toFixed(4)}% not sufficiently better than incumbent ${incumbentAlpha?.toFixed(4)}% (Δ=${delta?.toFixed(4)}pp, need ≥${cfg.alphaImprovementMin})`,
    });
  } else {
    gates.push({
      gate: 'alpha', passed: false, value: candidateAlpha, threshold: null,
      detail: 'Cannot evaluate alpha — missing metrics',
    });
  }

  // Gate 5: Max drawdown not catastrophically worse
  const candidateDD = candidateMetrics?.maxDrawdown ?? null;
  const incumbentDD = incumbentMetrics?.maxDrawdown ?? null;
  let ddGatePassed = false;
  if (candidateDD !== null && incumbentDD !== null) {
    const delta = candidateDD - incumbentDD;
    ddGatePassed = delta <= cfg.maxDrawdownTolerance;
    if (ddGatePassed) gatesPassed++;
    gates.push({
      gate: 'max_drawdown',
      passed: ddGatePassed,
      value: candidateDD ?? null,
      threshold: incumbentDD != null ? (incumbentDD + cfg.maxDrawdownTolerance) : null,
      detail: ddGatePassed
        ? `Candidate drawdown=${candidateDD.toFixed(2)}% vs incumbent ${incumbentDD.toFixed(2)}% (Δ=${delta.toFixed(2)}pp, tolerance=${cfg.maxDrawdownTolerance})`
        : `Candidate drawdown=${candidateDD?.toFixed(2)}% is ${delta?.toFixed(2)}pp worse than incumbent ${incumbentDD?.toFixed(2)}% (tolerance=${cfg.maxDrawdownTolerance})`,
    });
  } else {
    gates.push({
      gate: 'max_drawdown', passed: false, value: candidateDD, threshold: null,
      detail: 'Cannot evaluate drawdown — missing metrics',
    });
  }

  // Gate 6: No catastrophic accuracy regression
  const candidateAcc = candidateMetrics?.accuracy ?? null;
  const incumbentAcc = incumbentMetrics?.accuracy ?? null;
  let accGatePassed = false;
  if (candidateAcc !== null && incumbentAcc !== null) {
    const delta = incumbentAcc - candidateAcc;
    accGatePassed = delta <= cfg.accuracyRegressionMax;
    if (accGatePassed) gatesPassed++;
    gates.push({
      gate: 'accuracy_regression',
      passed: accGatePassed,
      value: candidateAcc ?? null,
      threshold: incumbentAcc != null ? (incumbentAcc - cfg.accuracyRegressionMax) : null,
      detail: accGatePassed
        ? `Candidate accuracy=${(candidateAcc * 100).toFixed(1)}% vs incumbent ${(incumbentAcc * 100).toFixed(1)}% (regression=${(delta * 100).toFixed(1)}pp, max=${(cfg.accuracyRegressionMax * 100).toFixed(1)}pp)`
        : `Candidate accuracy ${(candidateAcc * 100).toFixed(1)}% is ${(delta * 100).toFixed(1)}pp worse than incumbent (max allowed ${(cfg.accuracyRegressionMax * 100).toFixed(1)}pp)`,
    });
  } else {
    gates.push({
      gate: 'accuracy_regression', passed: false, value: candidateAcc, threshold: null,
      detail: 'Cannot evaluate accuracy — missing metrics',
    });
  }

  // Final decision: ALL gates must pass
  const shouldPromote = gatesPassed === gates.length;
  const passedGates = gates.filter(g => g.passed).map(g => g.gate);
  const failedGates = gates.filter(g => !g.passed).map(g => g.gate);

  const summary = shouldPromote
    ? `PROMOTE ${candidateVersion}: all ${gates.length} gates passed. ${passedGates.join(', ')}.`
    : `DO NOT PROMOTE ${candidateVersion}: ${gatesPassed}/${gates.length} gates passed. Failed: ${failedGates.join(', ')}.`;

  console.log(`[MODEL-PROMOTION] ${summary}`);

  // Auto-promote if all gates pass
  if (shouldPromote) {
    cachedActiveModel = {
      version: candidateVersion,
      promotedAt: new Date().toISOString(),
      promotionReason: `All ${gates.length} gates passed. ${gates.map(g => `${g.gate}: ${g.detail}`).join(' | ')}`,
    };
    promotionEvaluatedAt = Date.now();
  }

  return {
    candidateVersion,
    incumbentVersion: incumbent,
    evaluatedAt: new Date().toISOString(),
    shouldPromote,
    gatesPassed,
    gatesTotal: gates.length,
    gates,
    candidateMetrics,
    incumbentMetrics,
    summary,
  };
}

// ─── Get Active Model Version ──────────────────────────────────

export function getActiveModelVersion(): ActiveModelVersion {
  return { ...cachedActiveModel };
}

// ─── Set Active Model Version (manual override) ────────────────

export function setActiveModelVersion(version: string, reason: string): void {
  cachedActiveModel = {
    version,
    promotedAt: new Date().toISOString(),
    promotionReason: reason,
  };
  promotionEvaluatedAt = Date.now();
  console.log(`[MODEL-PROMOTION] Manual override: active model set to ${version}. Reason: ${reason}`);
}

// ─── Reset to Default ──────────────────────────────────────────

export function resetModelVersion(): void {
  cachedActiveModel = {
    version: 'predict-v3-regime-spillover',
    promotedAt: null,
    promotionReason: null,
  };
  promotionEvaluatedAt = 0;
}

// ─── Get Available Model Versions ──────────────────────────────

export async function getAvailableModelVersions(): Promise<{
  version: string;
  count: number;
  latestPredictionAt: string | null;
}[]> {
  const groups = await prisma.prediction.groupBy({
    by: ['modelVersion'],
    _count: { id: true },
    _max: { predictedAt: true },
    orderBy: { _count: { id: 'desc' } },
  });

  return groups.map(g => ({
    version: g.modelVersion,
    count: g._count.id,
    latestPredictionAt: g._max.predictedAt?.toISOString() ?? null,
  }));
}
