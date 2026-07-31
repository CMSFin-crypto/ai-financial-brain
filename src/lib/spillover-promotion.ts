// ============================================================
// V1→V2 Promotion Logic
// V1 starts live. V2 runs in shadow mode.
// V2 only becomes default if it wins on OOS metrics:
//   - Higher precision (RELIEF_RALLY accuracy)
//   - Better Brier score (probability calibration)
//   - Higher net return after costs
// Requires minimum sample size (50 OOS predictions).
// ============================================================

import type { WalkForwardWindow } from './spillover-v2';

// ─── Types ────────────────────────────────────────────────────

export type ActiveModel = 'spillover-v1' | 'spillover-v2-logreg';

export interface PromotionStatus {
  activeModel: ActiveModel;
  v2Promoted: boolean;
  promotionDate: string | null;
  promotionReason: string | null;
  lastEvaluatedAt: string | null;
  v1Metrics: PromotionMetrics | null;
  v2Metrics: PromotionMetrics | null;
  minSampleSize: number;
  currentSampleSize: number;
}

export interface PromotionMetrics {
  totalOOS: number;
  precisionRelief: number;      // of predicted RELIEF_RALLY, how many were right
  recallRelief: number;          // of actual RELIEF_RALLY, how many caught
  accuracy: number;               // overall directional accuracy
  brierScore: number;             // lower = better calibration
  avgNetReturnPct: number;        // after 0.2% round-trip cost
  avgReturnLong: number;          // raw avg return when model says LONG
  profitFactor: number;
  winRate: number;
}

export interface ComparisonResult {
  evaluatedAt: string;
  v1: PromotionMetrics | null;
  v2: PromotionMetrics | null;
  winner: ActiveModel;
  shouldPromote: boolean;
  reason: string;
  details: {
    precisionDelta: number;
    brierDelta: number;          // negative = V2 better
    returnDelta: number;
    sampleV1: number;
    sampleV2: number;
    meetsMinSample: boolean;
  };
}

// ─── Constants ────────────────────────────────────────────────

const MIN_OOS_SAMPLE = 50;
const ROUND_TRIP_COST_PCT = 0.2;

// In-memory cache (resets on cold start, fine for serverless)
let cachedPromotionStatus: PromotionStatus | null = null;
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
let cachedAt = 0;

// ─── Compute V2 metrics from walk-forward windows ────────────

export function computeV2MetricsFromWalkForward(windows: WalkForwardWindow[]): PromotionMetrics {
  if (windows.length === 0) {
    return { totalOOS: 0, precisionRelief: 0, recallRelief: 0, accuracy: 0, brierScore: 1, avgNetReturnPct: 0, avgReturnLong: 0, profitFactor: 0, winRate: 0 };
  }

  const totalOOS = windows.reduce((s, w) => s + w.testSize, 0);
  const weightedPrecision = windows.reduce((s, w) => s + w.oosPrecisionRelief * w.testSize, 0) / totalOOS;
  const weightedRecall = windows.reduce((s, w) => s + w.oosRecallRelief * w.testSize, 0) / totalOOS;
  const weightedAccuracy = windows.reduce((s, w) => s + w.oosAccuracy * w.testSize, 0) / totalOOS;
  const weightedBrier = windows.reduce((s, w) => s + w.brierScore * w.testSize, 0) / totalOOS;
  const weightedAvgLongRet = windows.reduce((s, w) => s + w.avgReturnLong * w.testSize, 0) / totalOOS;

  // Estimate net return: avgLongRet - round-trip cost (only on trades, ~30% of days)
  const tradeFrequency = 0.3;
  const avgNetReturnPct = (weightedAvgLongRet - ROUND_TRIP_COST_PCT) * tradeFrequency;

  // Win rate from accuracy
  const winRate = weightedAccuracy;

  // Profit factor estimate: if avgLongRet > cost, PF > 1
  const avgWin = Math.max(0, weightedAvgLongRet);
  const avgLoss = Math.abs(Math.min(0, weightedAvgLongRet - ROUND_TRIP_COST_PCT));
  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 99 : 0;

  return {
    totalOOS,
    precisionRelief: Math.round(weightedPrecision * 1000) / 1000,
    recallRelief: Math.round(weightedRecall * 1000) / 1000,
    accuracy: Math.round(weightedAccuracy * 1000) / 1000,
    brierScore: Math.round(weightedBrier * 1000) / 1000,
    avgNetReturnPct: Math.round(avgNetReturnPct * 100) / 100,
    avgReturnLong: Math.round(weightedAvgLongRet * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    winRate: Math.round(winRate * 1000) / 1000,
  };
}

// ─── Compute V1 metrics from DB signals ───────────────────────

export async function computeV1MetricsFromDB(): Promise<PromotionMetrics> {
  try {
    const { prisma } = await import('./prisma');

    // Get recent V1 signals that have been evaluated
    const signals = await prisma.spilloverSignal.findMany({
      where: {
        modelVersion: 'spillover-v1',
        setupType: { in: ['RELIEF_RALLY', 'CONTINUATION'] },
      },
      orderBy: { date: 'desc' },
      take: 200,
    });

    if (signals.length === 0) {
      return { totalOOS: 0, precisionRelief: 0, recallRelief: 0, accuracy: 0, brierScore: 1, avgNetReturnPct: 0, avgReturnLong: 0, profitFactor: 0, winRate: 0 };
    }

    let reliefPredicted = 0;
    let reliefCorrect = 0;
    let totalCorrect = 0;
    let brierSum = 0;
    let longReturns: number[] = [];
    let allReturns: number[] = [];
    let grossProfit = 0;
    let grossLoss = 0;

    for (const sig of signals) {
      // Find entry price
      const entrySnap = await prisma.globalMarketSnapshot.findFirst({
        where: { symbol: sig.targetSymbol, date: { lte: sig.date } },
        orderBy: { date: 'desc' },
      });
      if (!entrySnap) continue;

      // Find price 3 days later
      const futureDate = new Date(sig.date);
      futureDate.setDate(futureDate.getDate() + 3);
      const futSnap = await prisma.globalMarketSnapshot.findFirst({
        where: { symbol: sig.targetSymbol, date: { gte: futureDate } },
        orderBy: { date: 'asc' },
      });
      if (!futSnap) continue;

      const ret = ((futSnap.close - entrySnap.close) / entrySnap.close) * 100;
      allReturns.push(ret);

      // Brier: use confidence as probability of UP when RELIEF_RALLY
      const probUp = sig.setupType === 'RELIEF_RALLY' ? sig.confidence : 1 - sig.confidence;
      const actualUp = ret > 0 ? 1 : 0;
      brierSum += (probUp - actualUp) ** 2;

      // Direction accuracy
      const predictedUp = sig.setupType === 'RELIEF_RALLY';
      if (predictedUp === !!actualUp) totalCorrect++;

      // Relief precision/recall
      if (sig.setupType === 'RELIEF_RALLY') {
        reliefPredicted++;
        if (ret > 0) reliefCorrect++;
        longReturns.push(ret);
      }

      // P&L
      const netRet = sig.setupType === 'RELIEF_RALLY'
        ? ret - ROUND_TRIP_COST_PCT
        : -ret - ROUND_TRIP_COST_PCT;
      if (netRet > 0) grossProfit += netRet;
      else grossLoss += Math.abs(netRet);
    }

    const n = allReturns.length;
    const reliefActual = allReturns.filter(r => r > 0).length;

    return {
      totalOOS: n,
      precisionRelief: reliefPredicted > 0 ? reliefCorrect / reliefPredicted : 0,
      recallRelief: reliefActual > 0 ? reliefCorrect / reliefActual : 0,
      accuracy: n > 0 ? totalCorrect / n : 0,
      brierScore: n > 0 ? brierSum / n : 1,
      avgNetReturnPct: n > 0 ? allReturns.reduce((a, b) => a + b, 0) / n - ROUND_TRIP_COST_PCT : 0,
      avgReturnLong: longReturns.length > 0 ? longReturns.reduce((a, b) => a + b, 0) / longReturns.length : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0,
      winRate: n > 0 ? totalCorrect / n : 0,
    };
  } catch (err) {
    console.error('[SPILLOVER-PROMOTION] V1 metrics failed:', err);
    return { totalOOS: 0, precisionRelief: 0, recallRelief: 0, accuracy: 0, brierScore: 1, avgNetReturnPct: 0, avgReturnLong: 0, profitFactor: 0, winRate: 0 };
  }
}

// ─── Comparison logic ──────────────────────────────────────────

/**
 * Compare V1 and V2 metrics. Returns whether V2 should be promoted.
 * Rules:
 *   1. V2 must have >= MIN_OOS_SAMPLE OOS predictions
 *   2. V2 must win on at least 2 of 3: precision, Brier score, net return
 *   3. V2 must not be significantly worse on any metric (>20% worse)
 */
export function compareModels(
  v1: PromotionMetrics,
  v2: PromotionMetrics
): ComparisonResult {
  const meetsMinSample = v2.totalOOS >= MIN_OOS_SAMPLE;

  // Metric deltas (positive = V2 better for precision/return, negative = V2 better for brier)
  const precisionDelta = v2.precisionRelief - v1.precisionRelief;
  const brierDelta = v1.brierScore - v2.brierScore; // positive = V2 better
  const returnDelta = v2.avgNetReturnPct - v1.avgNetReturnPct;

  // Count wins
  let v2Wins = 0;
  if (precisionDelta > 0.02) v2Wins++;      // V2 precision at least 2pp higher
  if (brierDelta > 0.01) v2Wins++;           // V2 Brier at least 0.01 better
  if (returnDelta > 0.05) v2Wins++;          // V2 net return at least 0.05pp higher

  // Check for catastrophic regression
  const precisionRegressed = v1.precisionRelief > 0 && v2.precisionRelief < v1.precisionRelief * 0.8;
  const brierRegressed = v2.brierScore > v1.brierScore * 1.2;

  const shouldPromote = meetsMinSample && v2Wins >= 2 && !precisionRegressed && !brierRegressed;

  let reason: string;
  let winner: ActiveModel;

  if (!meetsMinSample) {
    reason = `V2 ka vetëm ${v2.totalOOS} OOS mostrime, nevojitet ${MIN_OOS_SAMPLE}`;
    winner = 'spillover-v1';
  } else if (shouldPromote) {
    const wins: string[] = [];
    if (precisionDelta > 0.02) wins.push(`precision +${(precisionDelta * 100).toFixed(1)}pp`);
    if (brierDelta > 0.01) wins.push(`Brier -${brierDelta.toFixed(3)}`);
    if (returnDelta > 0.05) wins.push(`return +${returnDelta.toFixed(3)}pp`);
    reason = `V2 fiton: ${wins.join(', ')}`;
    winner = 'spillover-v2-logreg';
  } else if (v2Wins < 2) {
    reason = `V2 fiton vetëm ${v2Wins}/3 metrika — nevojitet 2/3`;
    winner = 'spillover-v1';
  } else {
    reason = `V2 ka regresion katastrofik në një metrikë`;
    winner = 'spillover-v1';
  }

  return {
    evaluatedAt: new Date().toISOString(),
    v1,
    v2,
    winner,
    shouldPromote,
    reason,
    details: {
      precisionDelta: Math.round(precisionDelta * 1000) / 1000,
      brierDelta: Math.round(brierDelta * 1000) / 1000,
      returnDelta: Math.round(returnDelta * 1000) / 1000,
      sampleV1: v1.totalOOS,
      sampleV2: v2.totalOOS,
      meetsMinSample,
    },
  };
}

// ─── Active model management ──────────────────────────────────

/**
 * Get the currently active model version.
 * In production this should read from DB/env, but for serverless
 * we use in-memory cache with DB-backed promotion state.
 */
export async function getActiveModel(): Promise<ActiveModel> {
  // Check in-memory cache first
  if (cachedPromotionStatus && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedPromotionStatus.activeModel;
  }

  try {
    const { prisma } = await import('./prisma');

    // Check if V2 has been promoted in DB (stored as a key-value in AIStats or similar)
    // For now, use a simple heuristic: check if SpilloverModelResult has enough evaluated rows
    // with wasCorrect = true (precision > V1)
    const v2Results = await prisma.spilloverModelResult.findMany({
      where: {
        modelVersion: 'spillover-v2-logreg',
        wasCorrect: { not: null },
      },
      orderBy: { date: 'desc' },
      take: 100,
    });

    if (v2Results.length < MIN_OOS_SAMPLE) {
      cachedPromotionStatus = {
        activeModel: 'spillover-v1',
        v2Promoted: false,
        promotionDate: null,
        promotionReason: null,
        lastEvaluatedAt: new Date().toISOString(),
        v1Metrics: null,
        v2Metrics: null,
        minSampleSize: MIN_OOS_SAMPLE,
        currentSampleSize: v2Results.length,
      };
      cachedAt = Date.now();
      return 'spillover-v1';
    }

    // Quick comparison from DB results
    const v2Correct = v2Results.filter(r => r.wasCorrect === true).length;
    const v2ReliefCorrect = v2Results.filter(r =>
      r.predictedClass === 'RELIEF_RALLY' && r.wasCorrect === true
    ).length;
    const v2ReliefPredicted = v2Results.filter(r => r.predictedClass === 'RELIEF_RALLY').length;

    // Brier score from recent results
    let brierSum = 0;
    for (const r of v2Results) {
      const actualUp = (r.actualReturn ?? 0) > 0 ? 1 : 0;
      brierSum += (r.probabilityUp - actualUp) ** 2;
    }
    const v2Brier = brierSum / v2Results.length;

    const v2Metrics: PromotionMetrics = {
      totalOOS: v2Results.length,
      precisionRelief: v2ReliefPredicted > 0 ? v2ReliefCorrect / v2ReliefPredicted : 0,
      recallRelief: 0,
      accuracy: v2Results.length > 0 ? v2Correct / v2Results.length : 0,
      brierScore: v2Brier,
      avgNetReturnPct: 0,
      avgReturnLong: 0,
      profitFactor: 0,
      winRate: v2Results.length > 0 ? v2Correct / v2Results.length : 0,
    };

    // Get V1 metrics for comparison
    const v1Metrics = await computeV1MetricsFromDB();
    const comparison = compareModels(v1Metrics, v2Metrics);

    cachedPromotionStatus = {
      activeModel: comparison.winner,
      v2Promoted: comparison.shouldPromote,
      promotionDate: comparison.shouldPromote ? comparison.evaluatedAt : null,
      promotionReason: comparison.shouldPromote ? comparison.reason : null,
      lastEvaluatedAt: comparison.evaluatedAt,
      v1Metrics,
      v2Metrics,
      minSampleSize: MIN_OOS_SAMPLE,
      currentSampleSize: v2Results.length,
    };
    cachedAt = Date.now();

    return comparison.winner;
  } catch (err) {
    console.error('[SPILLOVER-PROMOTION] getActiveModel failed, defaulting to V1:', err);
    return 'spillover-v1';
  }
}

/**
 * Run full comparison and return detailed result.
 * Used by /api/global-spillover/compare endpoint.
 */
export async function runFullComparison(): Promise<ComparisonResult & PromotionStatus> {
  const v1Metrics = await computeV1MetricsFromDB();

  // Get V2 metrics from walk-forward (run a quick backtest)
  let v2Metrics: PromotionMetrics;
  try {
    const { getDailyHistory } = await import('./global-market-data');
    const { buildSpilloverDataset, walkForwardValidate } = await import('./spillover-v2');

    const [kospi, nikkei, hsi, smh, qqq, vix, target] = await Promise.all([
      getDailyHistory('^KS11', 500),
      getDailyHistory('^N225', 500),
      getDailyHistory('^HSI', 500),
      getDailyHistory('SMH', 500),
      getDailyHistory('QQQ', 500),
      getDailyHistory('VIX', 500),
      getDailyHistory('SMH', 500),
    ]);

    const dataset = buildSpilloverDataset('SMH', kospi, nikkei, hsi, smh, qqq, vix, target);
    const windows = walkForwardValidate(dataset, 12, 1);
    v2Metrics = computeV2MetricsFromWalkForward(windows);
  } catch (err) {
    console.error('[SPILLOVER-PROMOTION] V2 walk-forward failed:', err);
    v2Metrics = { totalOOS: 0, precisionRelief: 0, recallRelief: 0, accuracy: 0, brierScore: 1, avgNetReturnPct: 0, avgReturnLong: 0, profitFactor: 0, winRate: 0 };
  }

  const comparison = compareModels(v1Metrics, v2Metrics);

  // Update cache
  cachedPromotionStatus = {
    activeModel: comparison.winner,
    v2Promoted: comparison.shouldPromote,
    promotionDate: comparison.shouldPromote ? comparison.evaluatedAt : null,
    promotionReason: comparison.shouldPromote ? comparison.reason : null,
    lastEvaluatedAt: comparison.evaluatedAt,
    v1Metrics,
    v2Metrics,
    minSampleSize: MIN_OOS_SAMPLE,
    currentSampleSize: v2Metrics.totalOOS,
  };
  cachedAt = Date.now();

  return { ...comparison, ...cachedPromotionStatus };
}

/**
 * Run V2 in shadow mode: predict but don't use for trading.
 * Save result to SpilloverModelResult for later evaluation.
 */
export async function runV2ShadowPrediction(
  targetSymbol: string,
  features: import('./spillover-features').SpilloverFeatures
): Promise<import('./spillover-v2').SpilloverV2Prediction | null> {
  try {
    const { trainSpilloverModel, predictSpilloverV2, saveModelResult, buildSpilloverDataset } = await import('./spillover-v2');
    const { getDailyHistory } = await import('./global-market-data');

    // Build a quick dataset and train on recent data
    const [kospi, nikkei, hsi, smh, qqq, vix, target] = await Promise.all([
      getDailyHistory('^KS11', 300),
      getDailyHistory('^N225', 300),
      getDailyHistory('^HSI', 300),
      getDailyHistory('SMH', 300),
      getDailyHistory('QQQ', 300),
      getDailyHistory('VIX', 300),
      getDailyHistory(targetSymbol, 300),
    ]);

    const dataset = buildSpilloverDataset(targetSymbol, kospi, nikkei, hsi, smh, qqq, vix, target);
    if (dataset.length < 50) {
      console.log(`[SPILLOVER-SHADOW] ${targetSymbol}: dataset too small for shadow prediction`);
      return null;
    }

    // Train on all available data except last 5 days
    const trainRows = dataset.slice(0, -5);
    const { model, standardizer } = trainSpilloverModel(trainRows);

    // Predict on today's features
    const prediction = predictSpilloverV2(features, model, standardizer);

    // Save to DB for later evaluation
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await saveModelResult(today, targetSymbol, prediction);

    console.log(`[SPILLOVER-SHADOW] ${targetSymbol}: V2 predicts ${prediction.predictedClass} (pUp=${prediction.probabilityUp}, pDown=${prediction.probabilityDown})`);
    return prediction;
  } catch (err) {
    console.error('[SPILLOVER-SHADOW] Failed:', err);
    return null;
  }
}

/** Reset the promotion cache (for testing) */
export function resetPromotionCache(): void {
  cachedPromotionStatus = null;
  cachedAt = 0;
}
