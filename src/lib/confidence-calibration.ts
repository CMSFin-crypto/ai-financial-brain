// ============================================================
// Confidence Calibration
// Maps raw confidence to calibrated confidence based on
// historical accuracy per confidence bucket
// ============================================================

import prisma from './prisma';

interface CalibrationBucket {
  minConf: number;
  maxConf: number;
  total: number;
  correct: number;
  accuracy: number;
}

const BUCKET_RANGES: { min: number; max: number }[] = [
  { min: 0, max: 40 },
  { min: 40, max: 50 },
  { min: 50, max: 60 },
  { min: 60, max: 70 },
  { min: 70, max: 80 },
  { min: 80, max: 90 },
  { min: 90, max: 101 },
];

let cachedBuckets: CalibrationBucket[] | null = null;
let bucketsFetchedAt = 0;
const BUCKET_CACHE_MS = 10 * 60 * 1000; // 10 minutes

async function loadBuckets(): Promise<CalibrationBucket[]> {
  const now = Date.now();
  if (cachedBuckets && now - bucketsFetchedAt < BUCKET_CACHE_MS) {
    return cachedBuckets;
  }

  try {
    // Get all evaluated predictions from DB
    const evaluated = await prisma.prediction.findMany({
      where: { wasCorrect: { not: null } },
      select: { confidence: true, wasCorrect: true },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });

    const buckets: CalibrationBucket[] = BUCKET_RANGES.map(r => ({
      minConf: r.min,
      maxConf: r.max,
      total: 0,
      correct: 0,
      accuracy: 50, // default
    }));

    for (const pred of evaluated) {
      const conf = pred.confidence;
      const bucket = buckets.find(b => conf >= b.minConf && conf < b.maxConf);
      if (bucket) {
        bucket.total++;
        if (pred.wasCorrect) bucket.correct++;
      }
    }

    // Calculate accuracy per bucket
    for (const bucket of buckets) {
      if (bucket.total >= 10) {
        bucket.accuracy = Math.round((bucket.correct / bucket.total) * 100);
      } else {
        bucket.accuracy = 50; // Not enough data
      }
    }

    cachedBuckets = buckets;
    bucketsFetchedAt = now;
    return buckets;
  } catch (err) {
    console.error('[CALIBRATION] Failed to load buckets:', err);
    return BUCKET_RANGES.map(r => ({
      minConf: r.min, maxConf: r.max, total: 0, correct: 0, accuracy: 50,
    }));
  }
}

/**
 * Calibrate a raw confidence value.
 * If bucket says 65% accuracy for 70-80 range, then 75 * 0.65 = 48.75
 */
export async function calibrateConfidence(rawConfidence: number): Promise<number> {
  const buckets = await loadBuckets();
  const bucket = buckets.find(b => rawConfidence >= b.minConf && rawConfidence < b.maxConf);

  if (!bucket || bucket.total < 10) {
    // No calibration data — apply a general conservatism penalty
    // If we don't have enough data, assume slightly overconfident
    return Math.round(rawConfidence * 0.85 * 100) / 100;
  }

  const calibrated = rawConfidence * (bucket.accuracy / 100);
  return Math.round(Math.max(0, Math.min(100, calibrated)) * 100) / 100;
}

/** Get all calibration buckets for debug/display */
export async function getCalibrationBuckets(): Promise<CalibrationBucket[]> {
  return loadBuckets();
}
