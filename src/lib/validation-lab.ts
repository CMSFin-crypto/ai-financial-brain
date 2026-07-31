// ============================================================
// Validation Lab — anti-overfitting validation for the prediction
// engine. Provides walk-forward analysis, simplified overfitting
// detection, and benchmark comparison.
//
// Key concepts:
// - Walk-forward: sliding train/test windows, no look-ahead bias
// - Deflated Sharpe: penalize Sharpe for number of strategies tested
// - Overfitting warning: when OOS performance << IS performance
// - MODEL_NOT_ELIGIBLE: when the model is likely data-snooped
//
// This does NOT replace paper trading — it's a pre-deployment
// sanity check before committing capital.
// ============================================================

import prisma from './prisma';

// ─── Types ────────────────────────────────────────────────────

export type WalkForwardWindow = {
  trainFrom: string;
  trainTo: string;
  testFrom: string;
  testTo: string;
  trainSampleSize: number;
  testSampleSize: number;
  trainAccuracy: number | null;
  testAccuracy: number | null;
  trainSharpe: number | null;
  testSharpe: number | null;
  trainAvgReturn: number | null;
  testAvgReturn: number | null;
  degradation: number | null;  // testSharpe - trainSharpe
};

export type WalkForwardResult = {
  totalWindows: number;
  windows: WalkForwardWindow[];
  avgTrainAccuracy: number;
  avgTestAccuracy: number;
  avgTrainSharpe: number;
  avgTestSharpe: number;
  avgDegradation: number;
  consistencyScore: number;  // % of windows where test was profitable
  overfittingRatio: number;  // trainAcc / testAcc (> 1.3 = suspicious)
};

export type OverfittingAssessment = {
  isOverfit: boolean;
  severity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  inSampleSharpe: number;
  outOfSampleSharpe: number;
  sharpeDecay: number;       // (OOS - IS) / IS
  overfittingRatio: number;
  deflatedSharpe: number;     // Sharpe penalized for N trials
  numStrategiesTested: number;
  warnings: string[];
  eligibleForDeployment: boolean;
};

export type ValidationSummary = {
  assessedAt: string;
  modelVersion: string;
  totalPredictions: number;
  evaluatedPredictions: number;
  walkForward: WalkForwardResult | null;
  overfitting: OverfittingAssessment | null;
  benchmarkComparison: {
    modelWinRate: number;
    benchmarkWinRate: number;
    modelAvgReturn: number;
    benchmarkAvgReturn: number;
    modelSharpe: number;
    benchmarkSharpe: number;
    alpha: number;  // model return - benchmark return
  } | null;
  recommendation: 'DEPLOY' | 'CAUTION' | 'MODEL_NOT_ELIGIBLE';
  reasons: string[];
};

// ─── Helpers ────────────────────────────────────────────────────

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function stdDev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  return Math.sqrt(values.reduce((s, v) => s + (v - avg) ** 2, 0) / (values.length - 1));
}

function sharpeRatio(returns: number[], riskFreeRate = 0.05 / 252): number {
  if (returns.length < 5) return 0;
  const avg = mean(returns);
  const sd = stdDev(returns, avg);
  // Annualize
  const annualizedReturn = avg * 252;
  const annualizedVol = sd * Math.sqrt(252);
  return annualizedVol > 0 ? (annualizedReturn - riskFreeRate) / annualizedVol : 0;
}

/**
 * Simplified Deflated Sharpe Ratio.
 * Penalizes observed Sharpe by the expected maximum of N trials.
 * E[max Sharpe] ≈ Sharpe * (1 - 0.5 * (N-1) * (1/(n*252)))
 * where n = number of daily observations.
 *
 * More conservative than the full White's Reality Check but
 * practical for a single-model system.
 */
function deflatedSharpe(observedSharpe: number, nTrials: number, nDailyObs: number): number {
  if (nDailyObs < 30 || nTrials < 1) return observedSharpe;
  // Expected max Sharpe under null (no skill) for N trials
  const expectedMaxSharpe = Math.sqrt(2 * Math.log(nTrials) / nDailyObs) * Math.sqrt(252);
  return Math.max(0, observedSharpe - expectedMaxSharpe);
}

// ─── Walk-Forward Engine ─────────────────────────────────────

/**
 * Build sliding walk-forward windows and evaluate each.
 * Each window: train on [trainFrom..trainTo], test on [testFrom..testTo]
 * with a gap (purge) to prevent information leakage.
 */
export function buildWalkForwardWindows(
  totalDays: number,
  trainSize: number,
  testSize: number,
  stepSize?: number,
  purgeDays?: number,
): Array<{ trainFrom: number; trainTo: number; testFrom: number; testTo: number }> {
  const step = stepSize || testSize;
  const purge = purgeDays || 1; // 1 day purge by default
  const windows: Array<{ trainFrom: number; trainTo: number; testFrom: number; testTo: number }> = [];

  let testStart = trainSize + purge;
  while (testStart + testSize <= totalDays) {
    windows.push({
      trainFrom: testStart - trainSize - purge,
      trainTo: testStart - purge - 1,
      testFrom: testStart,
      testTo: testStart + testSize - 1,
    });
    testStart += step;
  }

  return windows;
}

/**
 * Run walk-forward validation on actual prediction data from DB.
 */
export async function runWalkForwardValidation(
  modelVersion = 'predict-v3-regime-spillover',
  trainDays = 60,
  testDays = 15,
  numWindows = 6,
): Promise<WalkForwardResult> {
  // Get date range of predictions
  const latest = await prisma.prediction.findFirst({
    where: { modelVersion, actualReturn: { not: null } },
    orderBy: { predictedAt: 'desc' },
    select: { predictedAt: true },
  });

  const earliest = await prisma.prediction.findFirst({
    where: { modelVersion, actualReturn: { not: null } },
    orderBy: { predictedAt: 'asc' },
    select: { predictedAt: true },
  });

  if (!latest || !earliest) {
    return {
      totalWindows: 0, windows: [],
      avgTrainAccuracy: 0, avgTestAccuracy: 0,
      avgTrainSharpe: 0, avgTestSharpe: 0,
      avgDegradation: 0, consistencyScore: 0, overfittingRatio: 0,
    };
  }

  const totalSpanDays = Math.ceil(
    (latest.predictedAt.getTime() - earliest.predictedAt.getTime()) / 86400000,
  );

  const step = Math.max(testDays, Math.floor((totalSpanDays - trainDays) / numWindows));
  const windows = buildWalkForwardWindows(totalSpanDays, trainDays, testDays, step);

  // Evaluate each window
  const results: WalkForwardWindow[] = [];

  for (const win of windows.slice(-numWindows)) { // take last N windows
    const trainFrom = new Date(earliest.predictedAt.getTime() + win.trainFrom * 86400000);
    const trainTo = new Date(earliest.predictedAt.getTime() + win.trainTo * 86400000);
    const testFrom = new Date(earliest.predictedAt.getTime() + win.testFrom * 86400000);
    const testTo = new Date(earliest.predictedAt.getTime() + win.testTo * 86400000);

    const [trainPreds, testPreds] = await Promise.all([
      prisma.prediction.findMany({
        where: {
          modelVersion,
          predictedAt: { gte: trainFrom, lte: trainTo },
          actualReturn: { not: null },
          wasCorrect: { not: null },
        },
        select: { actualReturn: true, wasCorrect: true },
        take: 2000,
      }),
      prisma.prediction.findMany({
        where: {
          modelVersion,
          predictedAt: { gte: testFrom, lte: testTo },
          actualReturn: { not: null },
          wasCorrect: { not: null },
        },
        select: { actualReturn: true, wasCorrect: true },
        take: 1000,
      }),
    ]);

    const trainReturns = trainPreds.map(p => p.actualReturn as number);
    const testReturns = testPreds.map(p => p.actualReturn as number);
    const trainCorrect = trainPreds.filter(p => p.wasCorrect === true).length;
    const testCorrect = testPreds.filter(p => p.wasCorrect === true).length;

    const trainAcc = trainPreds.length > 0 ? trainCorrect / trainPreds.length : null;
    const testAcc = testPreds.length > 0 ? testCorrect / testPreds.length : null;
    const trainSharpe = trainReturns.length >= 5 ? sharpeRatio(trainReturns) : null;
    const testSharpe = testReturns.length >= 5 ? sharpeRatio(testReturns) : null;

    results.push({
      trainFrom: trainFrom.toISOString(),
      trainTo: trainTo.toISOString(),
      testFrom: testFrom.toISOString(),
      testTo: testTo.toISOString(),
      trainSampleSize: trainPreds.length,
      testSampleSize: testPreds.length,
      trainAccuracy: trainAcc !== null ? Math.round(trainAcc * 10000) / 100 : null,
      testAccuracy: testAcc !== null ? Math.round(testAcc * 10000) / 100 : null,
      trainSharpe: trainSharpe !== null ? Math.round(trainSharpe * 100) / 100 : null,
      testSharpe: testSharpe !== null ? Math.round(testSharpe * 100) / 100 : null,
      trainAvgReturn: trainReturns.length > 0 ? Math.round(mean(trainReturns) * 10000) / 100 : null,
      testAvgReturn: testReturns.length > 0 ? Math.round(mean(testReturns) * 10000) / 100 : null,
      degradation: trainSharpe !== null && testSharpe !== null
        ? Math.round((testSharpe - trainSharpe) * 100) / 100
        : null,
    });
  }

  // Aggregate metrics
  const validTrainAcc = results.filter(w => w.trainAccuracy != null).map(w => w.trainAccuracy as number);
  const validTestAcc = results.filter(w => w.testAccuracy != null).map(w => w.testAccuracy as number);
  const validTrainSharpe = results.filter(w => w.trainSharpe != null).map(w => w.trainSharpe as number);
  const validTestSharpe = results.filter(w => w.testSharpe != null).map(w => w.testSharpe as number);
  const validDegradation = results.filter(w => w.degradation != null).map(w => w.degradation as number);

  const avgTrainAcc = validTrainAcc.length > 0 ? mean(validTrainAcc) : 0;
  const avgTestAcc = validTestAcc.length > 0 ? mean(validTestAcc) : 0;

  // Consistency: % of windows where OOS accuracy > 50%
  const profitableWindows = validTestAcc.filter(a => a > 50).length;
  const consistencyScore = validTestAcc.length > 0
    ? Math.round((profitableWindows / validTestAcc.length) * 10000) / 100
    : 0;

  const overfittingRatio = avgTestAcc > 0
    ? Math.round((avgTrainAcc / avgTestAcc) * 100) / 100
    : 0;

  return {
    totalWindows: results.length,
    windows: results,
    avgTrainAccuracy: Math.round(avgTrainAcc * 100) / 100,
    avgTestAccuracy: Math.round(avgTestAcc * 100) / 100,
    avgTrainSharpe: validTrainSharpe.length > 0 ? Math.round(mean(validTrainSharpe) * 100) / 100 : 0,
    avgTestSharpe: validTestSharpe.length > 0 ? Math.round(mean(validTestSharpe) * 100) / 100 : 0,
    avgDegradation: validDegradation.length > 0 ? Math.round(mean(validDegradation) * 100) / 100 : 0,
    consistencyScore,
    overfittingRatio,
  };
}

// ─── Overfitting Assessment ───────────────────────────────────

/**
 * Compare in-sample (earlier) vs out-of-sample (recent) performance.
 * If OOS degrades significantly, flag overfitting.
 */
export async function assessOverfitting(
  modelVersion = 'predict-v3-regime-spillover',
  numStrategiesTested = 3,
): Promise<OverfittingAssessment> {
  // In-sample: predictions from 60-90 days ago
  const isFrom = new Date(Date.now() - 90 * 86400000);
  const isTo = new Date(Date.now() - 60 * 86400000);

  // Out-of-sample: predictions from last 30 days
  const oosFrom = new Date(Date.now() - 30 * 86400000);
  const oosTo = new Date();

  const [isPreds, oosPreds] = await Promise.all([
    prisma.prediction.findMany({
      where: { modelVersion, actualReturn: { not: null }, predictedAt: { gte: isFrom, lt: isTo } },
      select: { actualReturn: true }, take: 2000,
    }),
    prisma.prediction.findMany({
      where: { modelVersion, actualReturn: { not: null }, predictedAt: { gte: oosFrom, lte: oosTo } },
      select: { actualReturn: true }, take: 2000,
    }),
  ]);

  const isReturns = isPreds.map(p => p.actualReturn as number);
  const oosReturns = oosPreds.map(p => p.actualReturn as number);

  const isSharpe = sharpeRatio(isReturns);
  const oosSharpe = sharpeRatio(oosReturns);

  const sharpeDecay = isSharpe !== 0 ? (oosSharpe - isSharpe) / Math.abs(isSharpe) : 0;
  const overfittingRatio = oosSharpe > 0 ? Math.abs(isSharpe / oosSharpe) : isSharpe > 0 ? 99 : 0;

  const dSharpe = deflatedSharpe(oosSharpe, numStrategiesTested, oosReturns.length);

  // Determine severity
  const warnings: string[] = [];
  let severity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' = 'NONE';
  let isOverfit = false;

  if (sharpeDecay < -0.5) {
    severity = 'HIGH';
    isOverfit = true;
    warnings.push(`Sharpe decay ${(sharpeDecay * 100).toFixed(0)}% — OOS significantly worse than IS`);
  } else if (sharpeDecay < -0.25) {
    severity = 'MEDIUM';
    warnings.push(`Sharpe decay ${(sharpeDecay * 100).toFixed(0)}% — moderate degradation`);
  } else if (sharpeDecay < -0.1) {
    severity = 'LOW';
    warnings.push(`Sharpe decay ${(sharpeDecay * 100).toFixed(0)}% — minor degradation`);
  }

  if (overfittingRatio > 1.5) {
    severity = severity === 'NONE' ? 'MEDIUM' : severity;
    isOverfit = true;
    warnings.push(`Overfitting ratio ${overfittingRatio.toFixed(2)} — IS/OOS ratio > 1.5`);
  }

  if (dSharpe <= 0 && oosSharpe > 0) {
    isOverfit = true;
    severity = severity === 'NONE' ? 'MEDIUM' : severity;
    warnings.push('Deflated Sharpe <= 0 — return likely from data snooping');
  }

  if (oosReturns.length < 30) {
    warnings.push(`OOS sample small (${oosReturns.length} predictions) — results unreliable`);
  }

  return {
    isOverfit,
    severity,
    inSampleSharpe: Math.round(isSharpe * 100) / 100,
    outOfSampleSharpe: Math.round(oosSharpe * 100) / 100,
    sharpeDecay: Math.round(sharpeDecay * 10000) / 10000,
    overfittingRatio: Math.round(overfittingRatio * 100) / 100,
    deflatedSharpe: Math.round(dSharpe * 100) / 100,
    numStrategiesTested,
    warnings,
    eligibleForDeployment: !isOverfit || severity === 'LOW',
  };
}

// ─── Full Validation Summary ─────────────────────────────────

export async function getValidationSummary(
  modelVersion = 'predict-v3-regime-spillover',
): Promise<ValidationSummary> {
  // Count totals
  const [totalPreds, evaluatedPreds] = await Promise.all([
    prisma.prediction.count({ where: { modelVersion } }),
    prisma.prediction.count({ where: { modelVersion, wasCorrect: { not: null } } }),
  ]);

  // Run walk-forward (only if enough data)
  const walkForward = evaluatedPreds >= 200
    ? await runWalkForwardValidation(modelVersion).catch(() => null)
    : null;

  // Run overfitting assessment
  const overfitting = evaluatedPreds >= 100
    ? await assessOverfitting(modelVersion).catch(() => null)
    : null;

  // Benchmark comparison (model vs SPY predictions)
  const benchmarkComparison = await computeBenchmarkComparison(modelVersion);

  // --- Determine recommendation ---
  const reasons: string[] = [];
  let recommendation: 'DEPLOY' | 'CAUTION' | 'MODEL_NOT_ELIGIBLE' = 'DEPLOY';

  if (evaluatedPreds < 100) {
    recommendation = 'CAUTION';
    reasons.push(`Only ${evaluatedPreds} evaluated predictions (minimum 100)`);
  }

  if (overfitting) {
    if (overfitting.severity === 'HIGH' || !overfitting.eligibleForDeployment) {
      recommendation = 'MODEL_NOT_ELIGIBLE';
      reasons.push(`Overfitting detected: ${overfitting.severity}`);
    } else if (overfitting.severity === 'MEDIUM') {
      recommendation = 'CAUTION';
      reasons.push('Moderate overfitting detected');
    }
  }

  if (walkForward) {
    if (walkForward.consistencyScore < 40) {
      recommendation = recommendation === 'DEPLOY' ? 'CAUTION' : recommendation;
      reasons.push(`Walk-forward consistency ${walkForward.consistencyScore}% < 40%`);
    }
    if (walkForward.overfittingRatio > 1.4) {
      recommendation = 'MODEL_NOT_ELIGIBLE';
      reasons.push(`WF overfitting ratio ${walkForward.overfittingRatio} > 1.4`);
    }
  }

  if (benchmarkComparison) {
    if (benchmarkComparison.alpha < -0.5) {
      recommendation = 'CAUTION';
      reasons.push(`Model underperforms benchmark by ${Math.abs(benchmarkComparison.alpha).toFixed(2)}% avg`);
    }
  }

  return {
    assessedAt: new Date().toISOString(),
    modelVersion,
    totalPredictions: totalPreds,
    evaluatedPredictions,
    walkForward,
    overfitting,
    benchmarkComparison,
    recommendation,
    reasons,
  };
}

// ─── Benchmark Comparison ────────────────────────────────────

async function computeBenchmarkComparison(
  modelVersion: string,
): Promise<ValidationSummary['benchmarkComparison']> {
  const since = new Date(Date.now() - 60 * 86400000);

  // Model predictions for the period
  const modelPreds = await prisma.prediction.findMany({
    where: { modelVersion, predictedAt: { gte: since }, actualReturn: { not: null } },
    select: { actualReturn: true, benchmarkReturn: true, wasCorrect: true },
    take: 3000,
  });

  if (modelPreds.length < 20) return null;

  const modelReturns = modelPreds.map(p => p.actualReturn as number);
  const benchReturns = modelPreds
    .filter(p => p.benchmarkReturn != null)
    .map(p => p.benchmarkReturn as number);

  const modelWinRate = modelPreds.filter(p => p.wasCorrect === true).length / modelPreds.length;
  const benchWinRate = benchReturns.length > 0
    ? benchReturns.filter(r => r > 0).length / benchReturns.length
    : 0.5;

  return {
    modelWinRate: Math.round(modelWinRate * 10000) / 100,
    benchmarkWinRate: Math.round(benchWinRate * 10000) / 100,
    modelAvgReturn: Math.round(mean(modelReturns) * 10000) / 100,
    benchmarkAvgReturn: benchReturns.length > 0 ? Math.round(mean(benchReturns) * 10000) / 100 : 0,
    modelSharpe: Math.round(sharpeRatio(modelReturns) * 100) / 100,
    benchmarkSharpe: benchReturns.length >= 5 ? Math.round(sharpeRatio(benchReturns) * 100) / 100 : 0,
    alpha: benchReturns.length > 0
      ? Math.round((mean(modelReturns) - mean(benchReturns)) * 10000) / 100
      : Math.round(mean(modelReturns) * 10000) / 100,
  };
}
