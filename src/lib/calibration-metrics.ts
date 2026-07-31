// ============================================================
// Calibration Metrics — ECE, MCE, Brier, Reliability Table
// Measures whether model probabilities match real frequencies.
// Financial ML models (tree-based, probabilistic) are often
// poorly calibrated — this directly hurts position sizing.
// ============================================================

import { prisma } from '@/lib/prisma';

// ─── Types ────────────────────────────────────────────────────

export interface ReliabilityBucket {
  rangeStart: number;   // e.g. 0.0
  rangeEnd: number;     // e.g. 0.1
  avgPredictedProb: number;  // mean f in bucket
  avgActualFreq: number;     // mean o in bucket
  count: number;              // n in bucket
  calibrationError: number;   // |avgPredicted - avgActual|
  overconfidence: number;     // predicted - actual (positive = overconfident)
}

export interface CalibrationReport {
  brierScore: number | null;
  ece: number | null;           // Expected Calibration Error
  mce: number | null;           // Maximum Calibration Error
  bucketCount: number;
  sampleSize: number;
  buckets: ReliabilityBucket[];
  filteredBy: {
    modelVersion?: string;
    horizonDays?: number;
    regime?: string;
    minSamples?: number;
  };
  diagnosis: CalibrationDiagnosis;
}

export interface CalibrationDiagnosis {
  overallLabel: 'WELL_CALIBRATED' | 'OVERCONFIDENT' | 'UNDERCONFIDENT' | 'POORLY_CALIBRATED' | 'INSUFFICIENT_DATA';
  summary: string;
  worstBucketIndex: number | null;
  worstBucketError: number | null;
  recommendations: string[];
}

export interface CalibrationTimeSeries {
  date: string;
  brierScore: number | null;
  ece: number | null;
  sampleSize: number;
}

// ─── Defaults ──────────────────────────────────────────────────

const DEFAULT_BUCKET_EDGES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

// ─── Core: Compute Reliability Table ──────────────────────────

function buildReliabilityTable(
  probabilities: number[],
  outcomes: number[],
  bucketEdges: number[] = DEFAULT_BUCKET_EDGES,
): ReliabilityBucket[] {
  const buckets: ReliabilityBucket[] = [];

  for (let i = 0; i < bucketEdges.length - 1; i++) {
    const start = bucketEdges[i];
    const end = bucketEdges[i + 1];
    const indices: number[] = [];

    for (let j = 0; j < probabilities.length; j++) {
      // Last bucket is inclusive on both ends
      if (i === bucketEdges.length - 2) {
        if (probabilities[j] >= start && probabilities[j] <= end) indices.push(j);
      } else {
        if (probabilities[j] >= start && probabilities[j] < end) indices.push(j);
      }
    }

    if (indices.length === 0) {
      buckets.push({
        rangeStart: start, rangeEnd: end,
        avgPredictedProb: 0, avgActualFreq: 0, count: 0,
        calibrationError: 0, overconfidence: 0,
      });
      continue;
    }

    const sumP = indices.reduce((s, j) => s + probabilities[j], 0);
    const sumO = indices.reduce((s, j) => s + outcomes[j], 0);
    const avgP = sumP / indices.length;
    const avgO = sumO / indices.length;

    buckets.push({
      rangeStart: start, rangeEnd: end,
      avgPredictedProb: Math.round(avgP * 1000) / 1000,
      avgActualFreq: Math.round(avgO * 1000) / 1000,
      count: indices.length,
      calibrationError: Math.round(Math.abs(avgP - avgO) * 1000) / 1000,
      overconfidence: Math.round((avgP - avgO) * 1000) / 1000,
    });
  }

  return buckets;
}

// ─── ECE (Expected Calibration Error) ─────────────────────────
// Weighted average of |avg_predicted - avg_actual| per bucket,
// weighted by the fraction of samples in each bucket.

function computeECE(buckets: ReliabilityBucket[], totalSamples: number): number {
  if (totalSamples === 0) return 0;
  let ece = 0;
  for (const b of buckets) {
    if (b.count > 0) {
      ece += (b.count / totalSamples) * b.calibrationError;
    }
  }
  return ece;
}

// ─── MCE (Maximum Calibration Error) ──────────────────────────
// Max |avg_predicted - avg_actual| across all non-empty buckets.

function computeMCE(buckets: ReliabilityBucket[]): number {
  let maxErr = 0;
  for (const b of buckets) {
    if (b.count > 0) {
      maxErr = Math.max(maxErr, b.calibrationError);
    }
  }
  return maxErr;
}

// ─── Brier Score ───────────────────────────────────────────────
// mean((f - o)^2) where f=predicted probability, o=actual outcome

function computeBrier(probabilities: number[], outcomes: number[]): number {
  if (probabilities.length === 0) return 1;
  const sum = probabilities.reduce((s, f, i) => s + (f - outcomes[i]) ** 2, 0);
  return sum / probabilities.length;
}

// ─── Diagnosis ─────────────────────────────────────────────────

function diagnose(buckets: ReliabilityBucket[], ece: number, mce: number, sampleSize: number): CalibrationDiagnosis {
  if (sampleSize < 50) {
    return {
      overallLabel: 'INSUFFICIENT_DATA',
      summary: `Need ≥50 evaluated predictions, have ${sampleSize}. Calibration metrics unreliable.`,
      worstBucketIndex: null, worstBucketError: null,
      recommendations: [
        'Wait for more evaluated predictions before trusting calibration metrics.',
        'Ensure cron job is running daily to evaluate due predictions.',
      ],
    };
  }

  // Find worst bucket
  let worstIdx: number | null = null;
  let worstErr = 0;
  let totalOverconfidence = 0;
  let overconfidentBuckets = 0;
  let underconfidentBuckets = 0;

  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    if (b.count < 3) continue;
    if (b.calibrationError > worstErr) {
      worstErr = b.calibrationError;
      worstIdx = i;
    }
    if (b.overconfidence > 0.03) overconfidentBuckets++;
    else if (b.overconfidence < -0.03) underconfidentBuckets++;
    totalOverconfidence += b.overconfidence;
  }

  // Classification
  const recommendations: string[] = [];

  if (ece <= 0.05 && mce <= 0.12) {
    return {
      overallLabel: 'WELL_CALIBRATED',
      summary: `ECE=${ece.toFixed(4)} is within acceptable range (≤0.05). Probabilities are reliable.`,
      worstBucketIndex: worstIdx, worstBucketError: Math.round(worstErr * 1000) / 1000,
      recommendations: ['Continue monitoring. No calibration adjustment needed.'],
    };
  }

  if (totalOverconfidence > 0.05 && overconfidentBuckets >= 2) {
    recommendations.push(
      'Model is systematically overconfident. Apply isotonic calibration or Platt scaling.',
      'Consider adding a conservatism multiplier (e.g. 0.85×) as a quick fix.',
      'Overconfidence inflates position sizes and hurts P&L on wrong calls.',
    );
  }

  if (underconfidentBuckets >= 2) {
    recommendations.push(
      'Model is systematically underconfident. Some profitable signals may be gated out as NO_TRADE.',
      'Review confidence floor thresholds — they may be too aggressive.',
    );
  }

  if (mce > 0.20) {
    recommendations.push(
      `MCE=${mce.toFixed(3)} is high — at least one probability bucket is badly miscalibrated.`,
      'Investigate specific regime/decision combinations in that bucket.',
    );
  }

  if (worstIdx !== null && worstErr > 0.15) {
    const b = buckets[worstIdx];
    recommendations.push(
      `Worst bucket [${b.rangeStart.toFixed(1)}, ${b.rangeEnd.toFixed(1)}]: predicted=${b.avgPredictedProb.toFixed(3)}, actual=${b.avgActualFreq.toFixed(3)}, n=${b.count}.`,
    );
  }

  const overallLabel = overconfidentBuckets > underconfidentBuckets
    ? 'OVERCONFIDENT'
    : underconfidentBuckets > overconfidentBuckets
      ? 'UNDERCONFIDENT'
      : 'POORLY_CALIBRATED';

  return {
    overallLabel,
    summary: `ECE=${ece.toFixed(4)}, MCE=${mce.toFixed(4)}. ${overallLabel} across ${overconfidentBuckets} over / ${underconfidentBuckets} under confident buckets.`,
    worstBucketIndex: worstIdx,
    worstBucketError: Math.round(worstErr * 1000) / 1000,
    recommendations,
  };
}

// ─── Main: Compute Full Calibration Report ────────────────────

export async function computeCalibrationReport(params?: {
  modelVersion?: string;
  horizonDays?: number;
  regime?: string;
  bucketEdges?: number[];
}): Promise<CalibrationReport> {
  const rows = await prisma.prediction.findMany({
    where: {
      evaluationStatus: 'EVALUATED',
      actualOutcome: { not: null },
      ...(params?.modelVersion ? { modelVersion: params.modelVersion } : {}),
      ...(params?.horizonDays ? { horizonDays: params.horizonDays } : {}),
      ...(params?.regime ? { regime: params.regime } : {}),
    },
    select: {
      calibratedConfidence: true,
      actualOutcome: true,
    },
    orderBy: { predictedAt: 'desc' },
    take: 5000,
  });

  const probabilities = rows.map(r => r.calibratedConfidence / 100);
  const outcomes = rows.map(r => r.actualOutcome as number);
  const sampleSize = rows.length;

  const bucketEdges = params?.bucketEdges ?? DEFAULT_BUCKET_EDGES;
  const buckets = buildReliabilityTable(probabilities, outcomes, bucketEdges);

  const brierScore = sampleSize > 0 ? computeBrier(probabilities, outcomes) : null;
  const ece = sampleSize > 0 ? computeECE(buckets, sampleSize) : null;
  const mce = sampleSize > 0 ? computeMCE(buckets) : null;

  const diagnosis = diagnose(buckets, ece ?? 0, mce ?? 0, sampleSize);

  return {
    brierScore: brierScore !== null ? Math.round(brierScore * 10000) / 10000 : null,
    ece: ece !== null ? Math.round(ece * 10000) / 10000 : null,
    mce: mce !== null ? Math.round(mce * 10000) / 10000 : null,
    bucketCount: bucketEdges.length - 1,
    sampleSize,
    buckets,
    filteredBy: {
      modelVersion: params?.modelVersion,
      horizonDays: params?.horizonDays,
      regime: params?.regime,
    },
    diagnosis,
  };
}

// ─── Calibration by Regime Breakdown ──────────────────────────

export async function computeCalibrationByRegime(params?: {
  modelVersion?: string;
  horizonDays?: number;
}): Promise<Record<string, CalibrationReport>> {
  const regimes = [
    'PANIC_CAPITULATION', 'RELIEF_RALLY', 'BULL_LOW_VOL', 'BULL_HIGH_VOL',
    'BEAR_LOW_VOL', 'BEAR_HIGH_VOL', 'RANGE_NEUTRAL',
  ];

  const results: Record<string, CalibrationReport> = {};
  for (const regime of regimes) {
    const report = await computeCalibrationReport({ ...params, regime });
    if (report.sampleSize >= 10) {
      results[regime] = report;
    }
  }
  return results;
}

// ─── Calibration by Model Version Breakdown ───────────────────

export async function computeCalibrationByVersion(
  horizonDays?: number,
): Promise<Record<string, CalibrationReport>> {
  // Get distinct model versions from DB
  const versions = await prisma.prediction.groupBy({
    by: ['modelVersion'],
    where: { evaluationStatus: 'EVALUATED', actualOutcome: { not: null } },
    _count: { modelVersion: true },
    orderBy: { _count: { modelVersion: 'desc' } },
    take: 10,
  });

  const results: Record<string, CalibrationReport> = {};
  for (const v of versions) {
    results[v.modelVersion] = await computeCalibrationReport({
      modelVersion: v.modelVersion,
      horizonDays,
    });
  }
  return results;
}

// ─── Calibration Time Series (rolling window) ─────────────────

export async function getCalibrationTimeSeries(params?: {
  modelVersion?: string;
  horizonDays?: number;
  days?: number;
  windowDays?: number;
}): Promise<CalibrationTimeSeries[]> {
  const days = params?.days ?? 90;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await prisma.prediction.findMany({
    where: {
      evaluationStatus: 'EVALUATED',
      actualOutcome: { not: null },
      predictedAt: { gte: since },
      ...(params?.modelVersion ? { modelVersion: params.modelVersion } : {}),
      ...(params?.horizonDays ? { horizonDays: params.horizonDays } : {}),
    },
    select: {
      calibratedConfidence: true,
      actualOutcome: true,
      predictedAt: true,
    },
    orderBy: { predictedAt: 'asc' },
  });

  if (rows.length < 10) return [];

  // Group by week
  const byWeek = new Map<string, { probs: number[]; outcomes: number[] }>();
  for (const r of rows) {
    const d = new Date(r.predictedAt);
    const weekKey = `${d.getFullYear()}-W${String(Math.ceil(d.getDate() / 7)).padStart(2, '0')}`;
    if (!byWeek.has(weekKey)) byWeek.set(weekKey, { probs: [], outcomes: [] });
    const bucket = byWeek.get(weekKey)!;
    bucket.probs.push(r.calibratedConfidence / 100);
    bucket.outcomes.push(r.actualOutcome as number);
  }

  const series: CalibrationTimeSeries[] = [];
  for (const [date, data] of byWeek) {
    if (data.probs.length < 5) continue;
    series.push({
      date,
      brierScore: Math.round(computeBrier(data.probs, data.outcomes) * 10000) / 10000,
      ece: Math.round(computeECE(
        buildReliabilityTable(data.probs, data.outcomes),
        data.probs.length,
      ) * 10000) / 10000,
      sampleSize: data.probs.length,
    });
  }

  return series;
}
