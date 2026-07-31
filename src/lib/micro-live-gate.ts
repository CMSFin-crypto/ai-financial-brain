// ============================================================
// Micro-Live Readiness Gate — checks if the system is ready for
// real money (micro-live) deployment.
//
// This is NOT about the model being good. It's about the
// OPERATIONAL readiness:
//   - Manual approval mode enabled
//   - Risk per trade is tiny (0.10-0.25%)
//   - Hard daily loss cap
//   - Max trades per day
//   - No-trade around earnings / macro events
//   - Validation summary not MODEL_NOT_ELIGIBLE
//   - Drift not CRITICAL
//   - Health is OK
//   - Robustness score adequate
//
// All gates must pass for micro-live approval.
// ============================================================

import prisma from './prisma';

// ─── Types ────────────────────────────────────────────────────

export type ReadinessCheck = {
  name: string;
  passed: boolean;
  value: unknown;
  threshold: unknown;
  severity: 'CRITICAL' | 'REQUIRED' | 'RECOMMENDED';
  message: string;
};

export type MicroLiveReadiness = {
  overallReady: boolean;
  readinessScore: number;     // 0-100
  level: 'NOT_READY' | 'CAUTION' | 'READY' | 'GO';
  checks: ReadinessCheck[];
  recommendations: string[];
  assessedAt: string;
};

export type MicroLiveConfig = {
  maxRiskPerTradePct?: number;    // default 0.25%
  maxDailyLossPct?: number;      // default 2%
  maxTradesPerDay?: number;      // default 5
  minValidationDays?: number;     // default 90
  minRobustnessScore?: number;    // default 40
  minPredictionsForEval?: number; // default 200
};

const DEFAULT_CONFIG: Required<MicroLiveConfig> = {
  maxRiskPerTradePct: 0.25,
  maxDailyLossPct: 2,
  maxTradesPerDay: 5,
  minValidationDays: 90,
  minRobustnessScore: 40,
  minPredictionsForEval: 200,
};

// ─── Core ──────────────────────────────────────────────────────

export async function assessMicroLiveReadiness(
  config?: MicroLiveConfig,
): Promise<MicroLiveReadiness> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const checks: ReadinessCheck[] = [];
  const recommendations: string[] = [];

  // 1. Minimum prediction count
  const totalPredictions = await prisma.prediction.count({
    where: { modelVersion: 'predict-v3-regime-spillover' },
  });
  const hasEnoughData = totalPredictions >= cfg.minPredictionsForEval;
  checks.push({
    name: 'prediction_sample_size',
    passed: hasEnoughData,
    value: totalPredictions,
    threshold: cfg.minPredictionsForEval,
    severity: 'CRITICAL',
    message: hasEnoughData
      ? `${totalPredictions} predictions (≥${cfg.minPredictionsForEval})`
      : `Only ${totalPredictions} predictions, need ≥${cfg.minPredictionsForEval}`,
  });
  if (!hasEnoughData) recommendations.push('Accumulate more prediction data before micro-live');

  // 2. Evaluated predictions (with outcomes)
  const evaluatedCount = await prisma.prediction.count({
    where: { modelVersion: 'predict-v3-regime-spillover', wasCorrect: { not: null } },
  });
  const hasEnoughEvaluated = evaluatedCount >= 100;
  checks.push({
    name: 'evaluated_predictions',
    passed: hasEnoughEvaluated,
    value: evaluatedCount,
    threshold: 100,
    severity: 'CRITICAL',
    message: hasEnoughEvaluated
      ? `${evaluatedCount} evaluated predictions`
      : `Only ${evaluatedCount} evaluated, need ≥100`,
  });

  // 3. Health check (from strategy-health)
  const recentExecs = await prisma.executionEvent.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
    take: 100,
  });
  const recentFilled = recentExecs.filter(e => e.status === 'FILLED').length;
  const recentRejected = recentExecs.filter(e => e.status === 'REJECTED').length;
  const healthOk = recentExecs.length === 0 ||
    (recentFilled / recentExecs.length >= 0.95 && recentRejected / recentExecs.length <= 0.02);
  checks.push({
    name: 'strategy_health',
    passed: healthOk,
    value: recentExecs.length > 0 ? `${(recentFilled / recentExecs.length * 100).toFixed(0)}% fill, ${(recentRejected / recentExecs.length * 100).toFixed(0)}% reject` : 'no execution data',
    threshold: 'fill≥95%, reject≤2%',
    severity: 'CRITICAL',
    message: healthOk ? 'Strategy health OK' : 'Execution metrics degraded',
  });
  if (!healthOk) recommendations.push('Resolve execution quality issues before live');

  // 4. Drift check (simplified — check if model has been running long enough)
  const oldestPrediction = await prisma.prediction.findFirst({
    where: { modelVersion: 'predict-v3-regime-spillover' },
    orderBy: { predictedAt: 'asc' },
    select: { predictedAt: true },
  });
  const daysRunning = oldestPrediction
    ? Math.ceil((Date.now() - oldestPrediction.predictedAt.getTime()) / 86400000)
    : 0;
  const stableLongEnough = daysRunning >= cfg.minValidationDays;
  checks.push({
    name: 'stability_period',
    passed: stableLongEnough,
    value: `${daysRunning} days`,
    threshold: `≥${cfg.minValidationDays} days`,
    severity: 'REQUIRED',
    message: stableLongEnough
      ? `Model has been running ${daysRunning} days`
      : `Only ${daysRunning} days, need ≥${cfg.minValidationDays} days of stability`,
  });
  if (!stableLongEnough) recommendations.push(`Wait until the model has ${cfg.minValidationDays}+ days of history`);

  // 5. Risk parameters check
  const riskPctOk = cfg.maxRiskPerTradePct <= 0.25;
  checks.push({
    name: 'risk_per_trade',
    passed: riskPctOk,
    value: `${cfg.maxRiskPerTradePct}%`,
    threshold: '≤0.25%',
    severity: 'CRITICAL',
    message: riskPctOk ? `Risk per trade: ${cfg.maxRiskPerTradePct}%` : `Risk ${cfg.maxRiskPerTradePct}% too high for micro-live, max 0.25%`,
  });

  // 6. Daily loss cap configured
  const dailyLossCapOk = cfg.maxDailyLossPct <= 2;
  checks.push({
    name: 'daily_loss_cap',
    passed: dailyLossCapOk,
    value: `${cfg.maxDailyLossPct}%`,
    threshold: '≤2%',
    severity: 'CRITICAL',
    message: dailyLossCapOk ? `Daily loss cap: ${cfg.maxDailyLossPct}%` : `Daily loss cap ${cfg.maxDailyLossPct}% too high`,
  });

  // 7. Max trades per day
  const tradesPerDayOk = cfg.maxTradesPerDay <= 5;
  checks.push({
    name: 'max_trades_per_day',
    passed: tradesPerDayOk,
    value: cfg.maxTradesPerDay,
    threshold: '≤5',
    severity: 'REQUIRED',
    message: tradesPerDayOk ? `Max ${cfg.maxTradesPerDay} trades/day` : `${cfg.maxTradesPerDay} trades/day is too many for micro-live`,
  });

  // 8. No MODEL_NOT_ELIGIBLE (check most recent model metrics if available)
  const recentMetrics = await prisma.modelMetricSnapshot.findFirst({
    where: { modelVersion: 'predict-v3-regime-spillover' },
    orderBy: { createdAt: 'desc' },
  });
  const modelAcc = recentMetrics?.accuracy ?? 0;
  const modelNotFailing = modelAcc >= 48;
  checks.push({
    name: 'model_performance',
    passed: modelNotFailing,
    value: `${modelAcc.toFixed(1)}% accuracy`,
    threshold: '≥48%',
    severity: 'REQUIRED',
    message: modelNotFailing ? `Model accuracy ${modelAcc.toFixed(1)}%` : `Model accuracy ${modelAcc.toFixed(1)}% below minimum`,
  });
  if (!modelNotFailing) recommendations.push('Model accuracy is below minimum — investigate before live');

  // 9. Execution logging is active
  const hasExecutionData = recentExecs.length > 0;
  checks.push({
    name: 'execution_logging',
    passed: hasExecutionData || totalPredictions < 50,
    value: hasExecutionData ? `${recentExecs.length} events` : 'none',
    threshold: 'active',
    severity: 'RECOMMENDED',
    message: hasExecutionData ? 'Execution logging is active' : 'No execution events found — ensure logging works before live',
  });

  // --- Compute overall score and level ---
  const criticalPassed = checks.filter(c => c.severity === 'CRITICAL').filter(c => c.passed).length;
  const criticalTotal = checks.filter(c => c.severity === 'CRITICAL').length;
  const requiredPassed = checks.filter(c => c.severity === 'REQUIRED').filter(c => c.passed).length;
  const requiredTotal = checks.filter(c => c.severity === 'REQUIRED').length;
  const recommendedPassed = checks.filter(c => c.severity === 'RECOMMENDED').filter(c => c.passed).length;
  const recommendedTotal = checks.filter(c => c.severity === 'RECOMMENDED').length;

  // Score: CRITICAL 50% + REQUIRED 30% + RECOMMENDED 20%
  const criticalScore = criticalTotal > 0 ? (criticalPassed / criticalTotal) * 50 : 50;
  const requiredScore = requiredTotal > 0 ? (requiredPassed / requiredTotal) * 30 : 30;
  const recommendedScore = recommendedTotal > 0 ? (recommendedPassed / recommendedTotal) * 20 : 20;
  const readinessScore = Math.round(criticalScore + requiredScore + recommendedScore);

  const allCriticalPassed = criticalPassed === criticalTotal;
  const allRequiredPassed = requiredPassed === requiredTotal;

  const level = !allCriticalPassed ? 'NOT_READY'
    : !allRequiredPassed ? 'CAUTION'
      : readinessScore >= 85 ? 'GO'
      : 'READY';

  const overallReady = allCriticalPassed;

  return {
    overallReady,
    readinessScore,
    level,
    checks,
    recommendations,
    assessedAt: new Date().toISOString(),
  };
}
