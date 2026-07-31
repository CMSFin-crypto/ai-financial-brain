// ============================================================
// Calibration Service — thin service layer consumed by routes
// and UI. Decouples API surface from lib internals.
// ============================================================

import { prisma } from '@/lib/prisma';
import {
  computeCalibrationReport,
  computeCalibrationByRegime,
  computeCalibrationByVersion,
  getCalibrationTimeSeries,
  type CalibrationReport,
} from '@/lib/calibration-metrics';
import { trainCalibrator, getCalibratorState, invalidateCalibratorCache, type CalibratorState } from '@/lib/probability-calibrator';

// ─── Types ────────────────────────────────────────────────────

export interface CalibrationServiceParams {
  modelVersion?: string;
  regime?: string;
  horizonDays?: number;
  bins?: number;
}

export interface CalibrationServiceReport {
  sampleSize: number;
  brier: number | null;
  ece: number | null;
  mce: number | null;
  reliability: ReliabilityBin[];
  bucketCalibrator: BucketCalibrationMap[];
  diagnosis: 'WELL_CALIBRATED' | 'OVERCONFIDENT' | 'UNDERCONFIDENT' | 'POORLY_CALIBRATED' | 'INSUFFICIENT_DATA';
}

export interface ReliabilityBin {
  rangeStart: number;
  rangeEnd: number;
  avgProbability: number;
  observedFrequency: number;
  count: number;
  calibrationError: number;
}

export interface BucketCalibrationMap {
  bucketStart: number;
  bucketEnd: number;
  calibratedProbability: number;
  sampleCount: number;
}

// ─── Core: Get Calibration Report ─────────────────────────────

export async function getCalibrationReport(
  params: CalibrationServiceParams,
): Promise<CalibrationServiceReport> {
  const binCount = params.bins ?? 10;

  // Build bucket edges from bin count
  const bucketEdges = Array.from({ length: binCount + 1 }, (_, i) => i / binCount);

  const report = await computeCalibrationReport({
    modelVersion: params.modelVersion,
    regime: params.regime,
    horizonDays: params.horizonDays,
    bucketEdges,
  });

  // Map reliability buckets to simplified shape for the service
  const reliability: ReliabilityBin[] = report.buckets.map(b => ({
    rangeStart: b.rangeStart,
    rangeEnd: b.rangeEnd,
    avgProbability: b.avgPredictedProb,
    observedFrequency: b.avgActualFreq,
    count: b.count,
    calibrationError: b.calibrationError,
  }));

  // Build bucket calibrator: maps each bucket to its observed frequency
  const bucketCalibrator: BucketCalibrationMap[] = report.buckets
    .filter(b => b.count > 0)
    .map(b => ({
      bucketStart: b.rangeStart,
      bucketEnd: b.rangeEnd,
      calibratedProbability: b.avgActualFreq,
      sampleCount: b.count,
    }));

  return {
    sampleSize: report.sampleSize,
    brier: report.brierScore,
    ece: report.ece,
    mce: report.mce,
    reliability,
    bucketCalibrator,
    diagnosis: report.diagnosis.overallLabel,
  };
}

// ─── Apply bucket calibration to a single probability ─────────

export function applyBucketCalibration(
  probability: number,
  bucketCalibrator: BucketCalibrationMap[],
): number {
  // Find which bucket the probability falls into
  for (const bucket of bucketCalibrator) {
    if (probability >= bucket.bucketStart && probability < bucket.bucketEnd) {
      // Weighted blend: observed frequency for this bucket, with fallback
      if (bucket.sampleCount < 3) return probability; // too few samples, don't adjust
      return bucket.calibratedProbability;
    }
  }
  // If probability is exactly 1.0, use the last bucket
  if (probability >= 1.0 && bucketCalibrator.length > 0) {
    const last = bucketCalibrator[bucketCalibrator.length - 1];
    return last.sampleCount >= 3 ? last.calibratedProbability : probability;
  }
  return probability;
}

// ─── By-Regime Breakdown ───────────────────────────────────────

export async function getCalibrationByRegime(
  params: Omit<CalibrationServiceParams, 'regime'>,
): Promise<Record<string, CalibrationServiceReport>> {
  const raw = await computeCalibrationByRegime({
    modelVersion: params.modelVersion,
    horizonDays: params.horizonDays,
  });
  const result: Record<string, CalibrationServiceReport> = {};
  for (const [regime, report] of Object.entries(raw)) {
    result[regime] = {
      sampleSize: report.sampleSize,
      brier: report.brierScore,
      ece: report.ece,
      mce: report.mce,
      reliability: report.buckets.map(b => ({
        rangeStart: b.rangeStart,
        rangeEnd: b.rangeEnd,
        avgProbability: b.avgPredictedProb,
        observedFrequency: b.avgActualFreq,
        count: b.count,
        calibrationError: b.calibrationError,
      })),
      bucketCalibrator: [],
      diagnosis: report.diagnosis.overallLabel,
    };
  }
  return result;
}

// ─── By-Version Breakdown ──────────────────────────────────────

export async function getCalibrationByVersion(
  params: Omit<CalibrationServiceParams, 'modelVersion'>,
): Promise<Record<string, CalibrationServiceReport>> {
  const raw = await computeCalibrationByVersion(params.horizonDays);
  const result: Record<string, CalibrationServiceReport> = {};
  for (const [version, report] of Object.entries(raw)) {
    result[version] = {
      sampleSize: report.sampleSize,
      brier: report.brierScore,
      ece: report.ece,
      mce: report.mce,
      reliability: report.buckets.map(b => ({
        rangeStart: b.rangeStart,
        rangeEnd: b.rangeEnd,
        avgProbability: b.avgPredictedProb,
        observedFrequency: b.avgActualFreq,
        count: b.count,
        calibrationError: b.calibrationError,
      })),
      bucketCalibrator: [],
      diagnosis: report.diagnosis.overallLabel,
    };
  }
  return result;
}

// ─── Time Series ───────────────────────────────────────────────

export async function getCalibrationTimeSeriesData(
  params: CalibrationServiceParams & { days?: number },
) {
  return getCalibrationTimeSeries({
    modelVersion: params.modelVersion,
    horizonDays: params.horizonDays,
    days: params.days,
  });
}

// ─── Train Calibrator ──────────────────────────────────────────

export async function trainCalibrationModel(
  params: CalibrationServiceParams,
): Promise<CalibratorState & { improvement?: { brierDelta: number; improved: boolean } }> {
  invalidateCalibratorCache();
  const state = await trainCalibrator({
    modelVersion: params.modelVersion,
    horizonDays: params.horizonDays,
    regime: params.regime,
  });

  return {
    ...state,
    improvement: state.preCalibrationBrier !== null && state.postCalibrationBrier !== null
      ? {
          brierDelta: Math.round((state.postCalibrationBrier - state.preCalibrationBrier) * 10000) / 10000,
          improved: state.postCalibrationBrier < state.preCalibrationBrier,
        }
      : undefined,
  };
}

// ─── Get Calibrator State ──────────────────────────────────────

export async function getCalibratorInfo(
  params: Omit<CalibrationServiceParams, 'bins' | 'regime'>,
) {
  try {
    const state = await getCalibratorState({
      modelVersion: params.modelVersion,
      horizonDays: params.horizonDays,
    });
    return {
      method: state.method,
      trainedAt: state.trainedAt,
      sampleSize: state.sampleSize,
      preBrier: state.preCalibrationBrier,
      postBrier: state.postCalibrationBrier,
      eceBefore: state.eceBefore,
      eceAfter: state.eceAfter,
    };
  } catch {
    return null;
  }
}
