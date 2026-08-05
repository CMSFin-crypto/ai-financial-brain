// ============================================================
// Prediction Review & Drift Monitor
//
// Tracks whether model behavior is healthy across:
//   - Horizons (1D, 5D, 20D accuracy)
//   - Calibration (Brier score, ECE)
//   - Regimes (per-regime accuracy degradation)
//   - Sectors (per-sector accuracy degradation)
//   - No-trade rate monitoring
//
// Exposes:
//   computeDriftReview()  — full snapshot for today
//   getDriftHistory()     — time series for charts
//   recordDailySnapshot() — persist DriftSnapshot to DB
// ============================================================

import prisma from './prisma';
import { computeCalibrationReport, getCalibrationTimeSeries } from './calibration-metrics';

// ─── Types ──────────────────────────────────────────────────

export interface HorizonDrift {
  horizonDays: number;
  accuracy: number;
  sampleSize: number;
  accuracy7d: number | null;     // rolling 7-day accuracy
  accuracy30d: number | null;    // rolling 30-day accuracy
  driftVsBaseline: number | null; // % change from long-run baseline
  trend: 'improving' | 'stable' | 'degrading' | 'insufficient_data';
}

export interface CalibrationDrift {
  brierScore: number | null;
  ece: number | null;
  mce: number | null;
  sampleSize: number;
  diagnosis: string;
  brierTrend7d: 'improving' | 'stable' | 'worsening' | 'insufficient_data';
  eceTrend7d: 'improving' | 'stable' | 'worsening' | 'insufficient_data';
}

export interface NoTradeDrift {
  currentRate: number;
  rate7d: number | null;
  rate30d: number | null;
  trend: 'rising' | 'stable' | 'falling' | 'insufficient_data';
  interpretation: string;
}

export interface EnvironmentSlice {
  name: string;
  accuracy: number;
  sampleSize: number;
  accuracy7d: number | null;
  driftVsOverall: number; // difference from overall accuracy
  warning: string | null;
}

export interface DriftWarning {
  level: 'INFO' | 'WARNING' | 'CRITICAL';
  category: 'horizon' | 'calibration' | 'regime' | 'sector' | 'no_trade' | 'sample_size';
  message: string;
  detail: string;
}

export interface DriftReviewResult {
  computedAt: string;
  overall: {
    totalEvaluated: number;
    totalPending: number;
    overallAccuracy: number;
    streakCorrect: number;
    streakWrong: number;
  };
  horizons: HorizonDrift[];
  calibration: CalibrationDrift;
  noTrade: NoTradeDrift;
  regimeSlices: EnvironmentSlice[];
  sectorSlices: EnvironmentSlice[];
  warnings: DriftWarning[];
  calibrationTimeSeries: { date: string; brierScore: number | null; ece: number | null; sampleSize: number }[];
}

export interface DriftHistoryPoint {
  date: string;
  accuracy1d: number | null;
  accuracy5d: number | null;
  accuracy20d: number | null;
  brierScore: number | null;
  ece: number | null;
  noTradeRate: number | null;
  warnings: string[];
}

// ─── Warning thresholds ──────────────────────────────────────

const ACCURACY_DEGRADATION_THRESHOLD = -5;   // % drop triggers WARNING
const ACCURACY_CRISIS_THRESHOLD = -15;       // % drop triggers CRITICAL
const BRIER_WARNING = 0.25;
const BRIER_CRITICAL = 0.35;
const ECE_WARNING = 0.08;
const ECE_CRITICAL = 0.15;
const NO_TRADE_HIGH = 0.70;
const MIN_SAMPLES_FOR_DRIFT = 20;
const MIN_SAMPLES_FOR_TREND = 50;

// ─── Main: Compute Full Drift Review ────────────────────────

export async function computeDriftReview(): Promise<DriftReviewResult> {
  const computedAt = new Date().toISOString();
  const warnings: DriftWarning[] = [];

  // 1. Overall stats from AIStats
  let stats = await prisma.aIStats.findFirst();
  if (!stats) {
    stats = await prisma.aIStats.create({ data: {} });
  }

  const totalEvaluated = await prisma.prediction.count({
    where: { evaluationStatus: 'EVALUATED' },
  });
  const totalPending = await prisma.prediction.count({
    where: { evaluationStatus: 'PENDING' },
  });

  // 2. Per-horizon drift
  const horizons = await computeHorizonDrift(warnings);

  // 3. Calibration drift
  const calibration = await computeCalibrationDrift(warnings);

  // 4. No-trade rate drift
  const noTrade = await computeNoTradeDrift(warnings);

  // 5. Regime environment slices
  const regimeSlices = await computeEnvironmentSlices('regime', warnings);

  // 6. Sector environment slices
  const sectorSlices = await computeEnvironmentSlices('sector', warnings);

  // 7. Calibration time series
  const calibrationTimeSeries = await getCalibrationTimeSeries({ days: 60 }).catch(() => []);

  // 8. Check sample size
  if (totalEvaluated < MIN_SAMPLES_FOR_DRIFT) {
    warnings.push({
      level: 'INFO',
      category: 'sample_size',
      message: 'Insufficient evaluated predictions for reliable drift detection',
      detail: `Have ${totalEvaluated} evaluated predictions, need ≥${MIN_SAMPLES_FOR_DRIFT}`,
    });
  }

  return {
    computedAt,
    overall: {
      totalEvaluated,
      totalPending,
      overallAccuracy: stats.avgAccuracy,
      streakCorrect: stats.streakCorrect,
      streakWrong: stats.streakWrong,
    },
    horizons,
    calibration,
    noTrade,
    regimeSlices,
    sectorSlices,
    warnings,
    calibrationTimeSeries,
  };
}

// ─── Per-horizon drift ──────────────────────────────────────

async function computeHorizonDrift(warnings: DriftWarning[]): Promise<HorizonDrift[]> {
  const result: HorizonDrift[] = [];
  const horizons = [1, 5, 20];

  for (const h of horizons) {
    // All-time accuracy for this horizon
    const allEval = await prisma.prediction.findMany({
      where: { evaluationStatus: 'EVALUATED', horizonDays: h, wasCorrect: { not: null } },
      select: { wasCorrect: true, predictedAt: true },
    });

    const accuracy = allEval.length > 0
      ? Math.round((allEval.filter(p => p.wasCorrect === true).length / allEval.length) * 1000) / 10
      : 0;

    // 7-day rolling
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recent7 = allEval.filter(p => new Date(p.predictedAt) >= since7d);
    const accuracy7d = recent7.length >= 5
      ? Math.round((recent7.filter(p => p.wasCorrect === true).length / recent7.length) * 1000) / 10
      : null;

    // 30-day rolling
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recent30 = allEval.filter(p => new Date(p.predictedAt) >= since30d);
    const accuracy30d = recent30.length >= MIN_SAMPLES_FOR_TREND
      ? Math.round((recent30.filter(p => p.wasCorrect === true).length / recent30.length) * 1000) / 10
      : null;

    // Drift vs baseline (30d vs all-time)
    const driftVsBaseline = accuracy30d !== null && allEval.length >= MIN_SAMPLES_FOR_TREND
      ? Math.round((accuracy30d - accuracy) * 10) / 10
      : null;

    // Trend determination
    let trend: HorizonDrift['trend'] = 'insufficient_data';
    if (accuracy7d !== null && accuracy30d !== null) {
      const diff = accuracy7d - accuracy30d;
      if (diff > 3) trend = 'improving';
      else if (diff < -3) trend = 'degrading';
      else trend = 'stable';
    } else if (accuracy30d !== null) {
      const diff = accuracy30d - accuracy;
      if (diff > 5) trend = 'improving';
      else if (diff < -5) trend = 'degrading';
      else trend = 'stable';
    }

    // Warnings
    if (driftVsBaseline !== null) {
      if (driftVsBaseline <= ACCURACY_CRISIS_THRESHOLD) {
        warnings.push({
          level: 'CRITICAL',
          category: 'horizon',
          message: `${h}D accuracy crisis`,
          detail: `${h}D accuracy dropped ${Math.abs(driftVsBaseline)}% vs baseline (current 30d: ${accuracy30d}%, all-time: ${accuracy}%)`,
        });
      } else if (driftVsBaseline <= ACCURACY_DEGRADATION_THRESHOLD) {
        warnings.push({
          level: 'WARNING',
          category: 'horizon',
          message: `${h}D accuracy degrading`,
          detail: `${h}D accuracy dropped ${Math.abs(driftVsBaseline)}% vs baseline (current 30d: ${accuracy30d}%, all-time: ${accuracy}%)`,
        });
      }
    }

    result.push({
      horizonDays: h,
      accuracy,
      sampleSize: allEval.length,
      accuracy7d,
      accuracy30d,
      driftVsBaseline,
      trend,
    });
  }

  return result;
}

// ─── Calibration drift ──────────────────────────────────────

async function computeCalibrationDrift(warnings: DriftWarning[]): Promise<CalibrationDrift> {
  const report = await computeCalibrationReport().catch(() => null);

  const brierScore = report?.brierScore ?? null;
  const ece = report?.ece ?? null;
  const mce = report?.mce ?? null;
  const sampleSize = report?.sampleSize ?? 0;
  const diagnosis = report?.diagnosis.summary ?? 'No data';

  // Brier trend over last 7 days of data
  const timeSeries = await getCalibrationTimeSeries({ days: 14 }).catch(() => []);
  let brierTrend7d: CalibrationDrift['brierTrend7d'] = 'insufficient_data';
  let eceTrend7d: CalibrationDrift['eceTrend7d'] = 'insufficient_data';

  if (timeSeries.length >= 2) {
    const half = Math.floor(timeSeries.length / 2);
    const firstHalf = timeSeries.slice(0, half);
    const secondHalf = timeSeries.slice(half);

    const avgBrier1 = firstHalf.reduce((s, p) => s + (p.brierScore ?? 0), 0) / firstHalf.length;
    const avgBrier2 = secondHalf.reduce((s, p) => s + (p.brierScore ?? 0), 0) / secondHalf.length;
    const brierDiff = avgBrier2 - avgBrier1;
    if (Math.abs(brierDiff) < 0.01) brierTrend7d = 'stable';
    else if (brierDiff < 0) brierTrend7d = 'improving';
    else brierTrend7d = 'worsening';

    const avgEce1 = firstHalf.reduce((s, p) => s + (p.ece ?? 0), 0) / firstHalf.length;
    const avgEce2 = secondHalf.reduce((s, p) => s + (p.ece ?? 0), 0) / secondHalf.length;
    const eceDiff = avgEce2 - avgEce1;
    if (Math.abs(eceDiff) < 0.005) eceTrend7d = 'stable';
    else if (eceDiff < 0) eceTrend7d = 'improving';
    else eceTrend7d = 'worsening';
  }

  // Warnings
  if (brierScore !== null && brierScore >= BRIER_CRITICAL) {
    warnings.push({
      level: 'CRITICAL',
      category: 'calibration',
      message: 'Brier score critical',
      detail: `Brier=${brierScore.toFixed(4)} (threshold: ${BRIER_CRITICAL}). Probabilities are severely miscalibrated.`,
    });
  } else if (brierScore !== null && brierScore >= BRIER_WARNING) {
    warnings.push({
      level: 'WARNING',
      category: 'calibration',
      message: 'Brier score elevated',
      detail: `Brier=${brierScore.toFixed(4)} (threshold: ${BRIER_WARNING}). Consider recalibration.`,
    });
  }

  if (ece !== null && ece >= ECE_CRITICAL) {
    warnings.push({
      level: 'CRITICAL',
      category: 'calibration',
      message: 'ECE critical',
      detail: `ECE=${ece.toFixed(4)} (threshold: ${ECE_CRITICAL}). Systematic misalignment between confidence and accuracy.`,
    });
  } else if (ece !== null && ece >= ECE_WARNING) {
    warnings.push({
      level: 'WARNING',
      category: 'calibration',
      message: 'ECE elevated',
      detail: `ECE=${ece.toFixed(4)} (threshold: ${ECE_WARNING}). Calibration is drifting.`,
    });
  }

  return { brierScore, ece, mce, sampleSize, diagnosis, brierTrend7d, eceTrend7d };
}

// ─── No-trade rate drift ────────────────────────────────────

async function computeNoTradeDrift(warnings: DriftWarning[]): Promise<NoTradeDrift> {
  const all = await prisma.prediction.findMany({
    where: { finalDecision: { not: null } },
    select: { finalDecision: true, predictedAt: true },
  });

  const currentRate = all.length > 0
    ? Math.round((all.filter(p => p.finalDecision === 'NO_TRADE').length / all.length) * 1000) / 10
    : 0;

  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recent7 = all.filter(p => new Date(p.predictedAt) >= since7d);
  const rate7d = recent7.length >= 10
    ? Math.round((recent7.filter(p => p.finalDecision === 'NO_TRADE').length / recent7.length) * 1000) / 10
    : null;

  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recent30 = all.filter(p => new Date(p.predictedAt) >= since30d);
  const rate30d = recent30.length >= 20
    ? Math.round((recent30.filter(p => p.finalDecision === 'NO_TRADE').length / recent30.length) * 1000) / 10
    : null;

  let trend: NoTradeDrift['trend'] = 'insufficient_data';
  if (rate7d !== null && rate30d !== null) {
    const diff = rate7d - rate30d;
    if (diff > 5) trend = 'rising';
    else if (diff < -5) trend = 'falling';
    else trend = 'stable';
  }

  let interpretation = `${currentRate}% of all predictions result in NO_TRADE`;
  if (currentRate > 80) {
    interpretation += ' — model is overly conservative, may be gating out valid signals';
    warnings.push({
      level: 'WARNING',
      category: 'no_trade',
      message: 'No-trade rate very high',
      detail: `${currentRate}% no-trade rate. Model may be too conservative or regime/event gates are too strict.`,
    });
  } else if (currentRate > NO_TRADE_HIGH) {
    interpretation += ' — above normal threshold, investigate gate sensitivity';
  } else if (currentRate < 20) {
    interpretation += ' — low gate activity, confirm gates are functioning';
  }

  return { currentRate, rate7d, rate30d, trend, interpretation };
}

// ─── Environment slices (regime or sector) ──────────────────

async function computeEnvironmentSlices(
  dimension: 'regime' | 'sector',
  warnings: DriftWarning[],
): Promise<EnvironmentSlice[]> {
  const field = dimension === 'regime' ? 'regime' : 'sector';

  const evaluated = await prisma.prediction.findMany({
    where: { evaluationStatus: 'EVALUATED', wasCorrect: { not: null }, [field]: { not: null } },
    select: { wasCorrect: true, [field]: true, predictedAt: true },
  });

  // Overall accuracy for comparison
  const overallAcc = evaluated.length > 0
    ? (evaluated.filter(p => p.wasCorrect === true).length / evaluated.length) * 100
    : 0;

  // Group by dimension value
  const groups: Record<string, { correct: number; total: number; recentCorrect: number; recentTotal: number }> = {};
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  for (const p of evaluated) {
    const key = (p as any)[field] as string;
    if (!key) continue;
    if (!groups[key]) groups[key] = { correct: 0, total: 0, recentCorrect: 0, recentTotal: 0 };
    groups[key].total++;
    if (p.wasCorrect === true) groups[key].correct++;
    if (new Date(p.predictedAt) >= since7d) {
      groups[key].recentTotal++;
      if (p.wasCorrect === true) groups[key].recentCorrect++;
    }
  }

  const slices: EnvironmentSlice[] = Object.entries(groups)
    .filter(([, g]) => g.total >= 5)
    .map(([name, g]) => {
      const accuracy = Math.round((g.correct / g.total) * 1000) / 10;
      const accuracy7d = g.recentTotal >= 5
        ? Math.round((g.recentCorrect / g.recentTotal) * 1000) / 10
        : null;
      const driftVsOverall = Math.round((accuracy - overallAcc) * 10) / 10;

      let warning: string | null = null;
      if (g.total >= MIN_SAMPLES_FOR_TREND && accuracy < overallAcc - 10) {
        warning = `${dimension} accuracy ${Math.abs(driftVsOverall)}% below overall`;
        warnings.push({
          level: 'WARNING',
          category: dimension as DriftWarning['category'],
          message: `${name}: ${dimension} underperformance`,
          detail: `${name} accuracy is ${accuracy}% vs overall ${Math.round(overallAcc * 10) / 10}% (${g.total} samples). Consider reducing exposure.`,
        });
      } else if (g.total >= MIN_SAMPLES_FOR_TREND && accuracy7d !== null && accuracy7d < accuracy - 10) {
        warning = `recent 7d accuracy dropped sharply`;
        warnings.push({
          level: 'WARNING',
          category: dimension as DriftWarning['category'],
          message: `${name}: recent degradation`,
          detail: `${name} 7d accuracy ${accuracy7d}% vs all-time ${accuracy}%. Possible regime shift.`,
        });
      }

      return { name, accuracy, sampleSize: g.total, accuracy7d, driftVsOverall, warning };
    })
    .sort((a, b) => b.accuracy - a.accuracy);

  return slices;
}

// ─── History: Get drift snapshots over time ─────────────────

export async function getDriftHistory(days: number = 30): Promise<DriftHistoryPoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const snapshots = await prisma.driftSnapshot.findMany({
    where: { date: { gte: since } },
    orderBy: { date: 'asc' },
  });

  return snapshots.map(s => ({
    date: s.date.toISOString().split('T')[0],
    accuracy1d: s.accuracy1d,
    accuracy5d: s.accuracy5d,
    accuracy20d: s.accuracy20d,
    brierScore: s.brierScore,
    ece: s.ece,
    noTradeRate: s.noTradeRate,
    warnings: (s.warnings as string[]) ?? [],
  }));
}

// ─── Record: Persist daily drift snapshot ───────────────────

export async function recordDailySnapshot(): Promise<DriftSnapshot | null> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const review = await computeDriftReview();

    const warnings = review.warnings.map(w =>
      `[${w.level}] ${w.category}: ${w.message}`
    );

    const regimeMap: Record<string, number> = {};
    for (const s of review.regimeSlices) {
      regimeMap[s.name] = s.accuracy;
    }

    const sectorMap: Record<string, number> = {};
    for (const s of review.sectorSlices) {
      sectorMap[s.name] = s.accuracy;
    }

    const snapshot = await prisma.driftSnapshot.upsert({
      where: { date: today },
      create: {
        date: today,
        accuracy1d: review.horizons.find(h => h.horizonDays === 1)?.accuracy ?? null,
        accuracy5d: review.horizons.find(h => h.horizonDays === 5)?.accuracy ?? null,
        accuracy20d: review.horizons.find(h => h.horizonDays === 20)?.accuracy ?? null,
        sample1d: review.horizons.find(h => h.horizonDays === 1)?.sampleSize ?? 0,
        sample5d: review.horizons.find(h => h.horizonDays === 5)?.sampleSize ?? 0,
        sample20d: review.horizons.find(h => h.horizonDays === 20)?.sampleSize ?? 0,
        brierScore: review.calibration.brierScore,
        ece: review.calibration.ece,
        noTradeRate: review.noTrade.currentRate,
        regimeAccuracies: regimeMap,
        sectorAccuracies: sectorMap,
        warnings: warnings.length > 0 ? warnings : null,
      },
      update: {
        accuracy1d: review.horizons.find(h => h.horizonDays === 1)?.accuracy ?? undefined,
        accuracy5d: review.horizons.find(h => h.horizonDays === 5)?.accuracy ?? undefined,
        accuracy20d: review.horizons.find(h => h.horizonDays === 20)?.accuracy ?? undefined,
        sample1d: review.horizons.find(h => h.horizonDays === 1)?.sampleSize ?? undefined,
        sample5d: review.horizons.find(h => h.horizonDays === 5)?.sampleSize ?? undefined,
        sample20d: review.horizons.find(h => h.horizonDays === 20)?.sampleSize ?? undefined,
        brierScore: review.calibration.brierScore ?? undefined,
        ece: review.calibration.ece ?? undefined,
        noTradeRate: review.noTrade.currentRate ?? undefined,
        regimeAccuracies: Object.keys(regimeMap).length > 0 ? regimeMap : undefined,
        sectorAccuracies: Object.keys(sectorMap).length > 0 ? sectorMap : undefined,
        warnings: warnings.length > 0 ? warnings : null,
      },
    });

    console.log(`[DRIFT] Recorded daily snapshot: 1D=${snapshot.accuracy1d}%, 5D=${snapshot.accuracy5d}%, 20D=${snapshot.accuracy20d}%, Brier=${snapshot.brierScore}, warnings=${warnings.length}`);
    return snapshot;
  } catch (err) {
    console.error('[DRIFT] recordDailySnapshot failed:', err);
    return null;
  }
}

// Re-export DriftSnapshot type for convenience
type DriftSnapshot = {
  id: string;
  date: Date;
  accuracy1d: number | null;
  accuracy5d: number | null;
  accuracy20d: number | null;
  sample1d: number;
  sample5d: number;
  sample20d: number;
  brierScore: number | null;
  ece: number | null;
  noTradeRate: number | null;
  regimeAccuracies: any;
  sectorAccuracies: any;
  warnings: any;
  createdAt: Date;
};
