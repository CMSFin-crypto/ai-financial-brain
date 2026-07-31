// ============================================================
// Model Metrics — Brier score + full calibration metrics
// Brier = mean((f - o)^2) where f=predicted probability, o=actual outcome (0/1)
// Lower Brier = better calibrated probabilities.
// ============================================================

import prisma from './prisma';

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Compute Brier score from evaluated predictions.
 * calibratedConfidence is stored as 0-100 int, actualOutcome is 0/1.
 * Brier = mean((f/100 - o)^2)
 */
function computeBrierScore(
  rows: { confidence: number; actualOutcome: number | null }[],
): number | null {
  const valid = rows.filter((r) => r.actualOutcome !== null);
  if (!valid.length) return null;

  const errors = valid.map((r) => {
    const f = r.confidence / 100;
    const o = r.actualOutcome as number;
    return Math.pow(f - o, 2);
  });

  return mean(errors);
}

/**
 * Compute Brier score by regime state.
 * Returns per-regime Brier for regime-specific calibration analysis.
 */
function computeBrierByRegime(
  rows: { confidence: number; actualOutcome: number | null; regimeState: string | null }[],
): Record<string, { brierScore: number | null; sampleSize: number }> {
  const byRegime: Record<string, { fs: number[]; os: number[] }> = {};

  for (const r of rows) {
    if (r.actualOutcome === null) continue;
    const regime = r.regimeState || 'UNKNOWN';
    if (!byRegime[regime]) byRegime[regime] = { fs: [], os: [] };
    byRegime[regime].fs.push(r.confidence / 100);
    byRegime[regime].os.push(r.actualOutcome);
  }

  const result: Record<string, { brierScore: number | null; sampleSize: number }> = {};
  for (const [regime, data] of Object.entries(byRegime)) {
    if (data.fs.length === 0) {
      result[regime] = { brierScore: null, sampleSize: 0 };
      continue;
    }
    const errors = data.fs.map((f, i) => Math.pow(f - data.os[i], 2));
    result[regime] = {
      brierScore: mean(errors),
      sampleSize: data.fs.length,
    };
  }
  return result;
}

/**
 * Compute Brier score by horizon.
 */
function computeBrierByHorizon(
  rows: { confidence: number; actualOutcome: number | null; horizonDays: number }[],
): Record<number, { brierScore: number | null; sampleSize: number }> {
  const byHorizon: Record<number, { fs: number[]; os: number[] }> = {};

  for (const r of rows) {
    if (r.actualOutcome === null) continue;
    if (!byHorizon[r.horizonDays]) byHorizon[r.horizonDays] = { fs: [], os: [] };
    byHorizon[r.horizonDays].fs.push(r.confidence / 100);
    byHorizon[r.horizonDays].os.push(r.actualOutcome);
  }

  const result: Record<number, { brierScore: number | null; sampleSize: number }> = {};
  for (const [h, data] of Object.entries(byHorizon)) {
    if (data.fs.length === 0) {
      result[Number(h)] = { brierScore: null, sampleSize: 0 };
      continue;
    }
    const errors = data.fs.map((f, i) => Math.pow(f - data.os[i], 2));
    result[Number(h)] = {
      brierScore: mean(errors),
      sampleSize: data.fs.length,
    };
  }
  return result;
}

export type ModelMetricsResult = {
  sampleSize: number;
  accuracy: number | null;
  avgReturn: number | null;
  winRate: number | null;
  brierScore: number | null;
  brierByRegime: Record<string, { brierScore: number | null; sampleSize: number }>;
  brierByHorizon: Record<number, { brierScore: number | null; sampleSize: number }>;
  precisionBuy: number | null;
  recallBuy: number | null;
  noTradeRate: number | null;
  maxDrawdown: number | null;
};

/**
 * Calculate comprehensive model metrics including Brier score.
 */
export async function calculateModelMetrics(params?: {
  modelVersion?: string;
  horizonDays?: number;
}): Promise<ModelMetricsResult> {
  const rows = await prisma.prediction.findMany({
    where: {
      ...(params?.modelVersion ? { modelVersion: params.modelVersion } : {}),
      ...(params?.horizonDays ? { horizonDays: params.horizonDays } : {}),
      wasCorrect: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    take: 2000,
  });

  const sampleSize = rows.length;
  if (!sampleSize) {
    return {
      sampleSize: 0,
      accuracy: null,
      avgReturn: null,
      winRate: null,
      brierScore: null,
      brierByRegime: {},
      brierByHorizon: {},
      precisionBuy: null,
      recallBuy: null,
      noTradeRate: null,
      maxDrawdown: null,
    };
  }

  const correct = rows.filter((r) => r.wasCorrect === true).length;
  const buys = rows.filter(
    (r) => r.predictedDir === 'UP' && r.gateStatus === 'TRADE',
  );
  const buyTruePositives = buys.filter((r) => r.actualOutcome === 1).length;
  const allActualPositives = rows.filter((r) => r.actualOutcome === 1).length;
  const noTrades = rows.filter((r) => r.gateStatus === 'NO_TRADE').length;

  const accuracy = correct / sampleSize;
  const returns = rows
    .map((r) => r.returnPct)
    .filter((r): r is number => r !== null && r !== undefined);
  const avgReturn = mean(returns);
  const winRate = returns.filter((r) => r > 0).length / sampleSize;
  const brierScore = computeBrierScore(rows);
  const brierByRegime = computeBrierByRegime(rows);
  const brierByHorizon = computeBrierByHorizon(rows);
  const precisionBuy =
    buys.length > 0 ? buyTruePositives / buys.length : null;
  const recallBuy =
    allActualPositives > 0
      ? buyTruePositives / allActualPositives
      : null;
  const noTradeRate = noTrades / sampleSize;

  // Max drawdown from cumulative returns
  let maxDrawdown: number | null = null;
  if (returns.length > 1) {
    let cumulative = 0;
    let peak = 0;
    let maxDd = 0;
    for (const ret of returns) {
      cumulative += ret / 100;
      if (cumulative > peak) peak = cumulative;
      const dd = peak - cumulative;
      if (dd > maxDd) maxDd = dd;
    }
    maxDrawdown = maxDd * 100;
  }

  return {
    sampleSize,
    accuracy,
    avgReturn,
    winRate,
    brierScore,
    brierByRegime,
    brierByHorizon,
    precisionBuy,
    recallBuy,
    noTradeRate,
    maxDrawdown,
  };
}

/**
 * Snapshot current metrics to ModelMetricSnapshot table.
 * Called after each evaluation batch or on demand.
 */
export async function snapshotModelMetrics(params: {
  modelVersion: string;
  horizonDays?: number;
}) {
  const metrics = await calculateModelMetrics({
    modelVersion: params.modelVersion,
    horizonDays: params.horizonDays,
  });

  return prisma.modelMetricSnapshot.create({
    data: {
      modelVersion: params.modelVersion,
      horizonDays: params.horizonDays ?? 1,
      sampleSize: metrics.sampleSize,
      accuracy: metrics.accuracy,
      avgReturn: metrics.avgReturn,
      winRate: metrics.winRate,
      brierScore: metrics.brierScore,
      precisionBuy: metrics.precisionBuy,
      recallBuy: metrics.recallBuy,
      noTradeRate: metrics.noTradeRate,
      maxDrawdown: metrics.maxDrawdown,
    },
  });
}

/**
 * Get metrics snapshot history for time-series charts.
 */
export async function getMetricsHistory(params?: {
  modelVersion?: string;
  horizonDays?: number;
  days?: number;
}) {
  const days = params?.days ?? 90;
  const since = new Date();
  since.setDate(since.getDate() - days);

  return prisma.modelMetricSnapshot.findMany({
    where: {
      ...(params?.modelVersion
        ? { modelVersion: params.modelVersion }
        : {}),
      ...(params?.horizonDays
        ? { horizonDays: params.horizonDays }
        : {}),
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'asc' },
  });
}
