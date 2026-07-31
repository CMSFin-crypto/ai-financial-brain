// ============================================================
// Probability Calibrator — Isotonic Regression & Platt Scaling
// Transforms raw model probabilities into well-calibrated ones.
// Financial ML models (tree-based, ensemble) are notoriously
// poorly calibrated. This module provides V2 calibration.
// ============================================================

import { prisma } from '@/lib/prisma';
import { computeCalibrationReport } from './calibration-metrics';

// ─── Types ────────────────────────────────────────────────────

export interface CalibratorState {
  method: 'isotonic' | 'platt' | 'none';
  trainedAt: string | null;
  sampleSize: number;
  // For isotonic: piecewise-constant mapping [input, output] pairs sorted by input
  isotonicMap: { input: number; output: number }[];
  // For Platt: a, b params for sigmoid 1 / (1 + exp(-(a*x + b)))
  plattA: number;
  plattB: number;
  // Pre-calibration Brier
  preCalibrationBrier: number | null;
  postCalibrationBrier: number | null;
  eceBefore: number | null;
  eceAfter: number | null;
}

export interface CalibrateResult {
  rawProbability: number;
  calibratedProbability: number;
  method: string;
  adjustment: number;
}

// ─── Cache ─────────────────────────────────────────────────────

let cachedState: CalibratorState | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ─── Isotonic Regression (PAVA — Pool Adjacent Violators) ──────
// Fits a monotone non-decreasing step function that minimizes
// squared error. No distributional assumptions.

function isotonicRegression(values: { x: number; y: number }[]): { input: number; output: number }[] {
  if (values.length === 0) return [];

  // Sort by x (predicted probability)
  const sorted = [...values].sort((a, b) => a.x - b.x);

  // PAVA: maintain blocks. Each block has a mean y and size.
  interface Block { startIdx: number; endIdx: number; mean: number; size: number; }
  const blocks: Block[] = sorted.map((v, i) => ({
    startIdx: i, endIdx: i, mean: v.y, size: 1,
  }));

  // Merge violating adjacent blocks
  let changed = true;
  while (changed) {
    changed = false;
    const merged: Block[] = [blocks[0]];
    for (let i = 1; i < blocks.length; i++) {
      const prev = merged[merged.length - 1];
      if (blocks[i].mean < prev.mean) {
        // Violation: merge prev and current
        const totalSize = prev.size + blocks[i].size;
        const totalMean = (prev.mean * prev.size + blocks[i].mean * blocks[i].size) / totalSize;
        merged[merged.length - 1] = {
          startIdx: prev.startIdx,
          endIdx: blocks[i].endIdx,
          mean: totalMean,
          size: totalSize,
        };
        changed = true;
      } else {
        merged.push(blocks[i]);
      }
    }
    blocks.length = 0;
    blocks.push(...merged);
  }

  // Build the isotonic map: input = midpoint of x range, output = block mean
  const map: { input: number; output: number }[] = [];
  for (const block of blocks) {
    const xStart = sorted[block.startIdx].x;
    const xEnd = sorted[block.endIdx].x;
    map.push({
      input: (xStart + xEnd) / 2,
      output: Math.round(block.mean * 10000) / 10000,
    });
  }

  return map;
}

// ─── Platt Scaling (Logistic Calibration) ──────────────────────
// Fits a logistic regression: P(calibrated) = 1/(1+exp(-(a*x+b)))
// where x = raw probability. Uses simple gradient descent.

function plattScaling(values: { x: number; y: number }[]): { a: number; b: number } {
  if (values.length < 10) return { a: 1, b: 0 };

  // Initialize N(R+) = count positives, N(R-) = count negatives, B = log(N+/N-)
  const nPos = values.filter(v => v.y === 1).length;
  const nNeg = values.length - nPos;
  let a = 1;
  let b = Math.log(nPos > 0 && nNeg > 0 ? nPos / nNeg : 1);
  const lr = 0.01;
  const epochs = 200;

  // Shift x to avoid extreme logits: map [0,1] → [-1,1]
  const shifted = values.map(v => ({ x: 2 * v.x - 1, y: v.y }));

  for (let epoch = 0; epoch < epochs; epoch++) {
    let gradA = 0;
    let gradB = 0;
    for (const v of shifted) {
      const z = a * v.x + b;
      // Clamp to prevent overflow
      const clampedZ = Math.max(-500, Math.min(500, z));
      const p = 1 / (1 + Math.exp(-clampedZ));
      const err = p - v.y;
      gradA += err * v.x;
      gradB += err;
    }
    a -= lr * gradA / values.length;
    b -= lr * gradB / values.length;
  }

  return { a, b };
}

// ─── Apply Isotonic Map ────────────────────────────────────────

function applyIsotonic(probability: number, map: { input: number; output: number }[]): number {
  if (map.length === 0) return probability;
  if (probability <= map[0].input) return map[0].output;
  if (probability >= map[map.length - 1].input) return map[map.length - 1].output;

  // Find the segment
  for (let i = 0; i < map.length - 1; i++) {
    if (probability >= map[i].input && probability < map[i + 1].input) {
      return map[i].output;
    }
  }
  return map[map.length - 1].output;
}

// ─── Apply Platt Sigmoid ───────────────────────────────────────

function applyPlatt(probability: number, a: number, b: number): number {
  const x = 2 * probability - 1; // map [0,1] → [-1,1]
  const z = a * x + b;
  const clampedZ = Math.max(-500, Math.min(500, z));
  return 1 / (1 + Math.exp(-clampedZ));
}

// ─── Train Calibrator ──────────────────────────────────────────

export async function trainCalibrator(params?: {
  modelVersion?: string;
  horizonDays?: number;
  regime?: string;
  method?: 'isotonic' | 'platt' | 'auto';
}): Promise<CalibratorState> {
  const rows = await prisma.prediction.findMany({
    where: {
      evaluationStatus: 'EVALUATED',
      actualOutcome: { not: null },
      ...(params?.modelVersion ? { modelVersion: params.modelVersion } : {}),
      ...(params?.horizonDays ? { horizonDays: params.horizonDays } : {}),
      ...(params?.regime ? { regime: params.regime } : {}),
    },
    select: { calibratedConfidence: true, actualOutcome: true },
    orderBy: { predictedAt: 'desc' },
    take: 5000,
  });

  const values = rows.map(r => ({
    x: r.calibratedConfidence / 100,
    y: r.actualOutcome as number,
  }));

  // Pre-calibration Brier
  const preBrier = values.length > 0
    ? values.reduce((s, v) => s + (v.x - v.y) ** 2, 0) / values.length
    : null;

  // Pre-calibration ECE
  const preReport = await computeCalibrationReport(params);
  const preECE = preReport.ece;

  // Choose method
  let method: 'isotonic' | 'platt' | 'none';
  if (params?.method && params.method !== 'auto') {
    method = params.method;
  } else if (values.length < 50) {
    method = 'none';
  } else {
    method = 'isotonic'; // Default: isotonic is distribution-free, ideal for financial data
  }

  let isotonicMap: { input: number; output: number }[] = [];
  let plattA = 1;
  let plattB = 0;
  let postBrier = preBrier;
  let postECE = preECE;

  if (method === 'isotonic') {
    isotonicMap = isotonicRegression(values);
    // Compute post-calibration Brier using isotonic
    if (values.length > 0) {
      const calProbs = values.map(v => applyIsotonic(v.x, isotonicMap));
      postBrier = calProbs.reduce((s, p, i) => s + (p - values[i].y) ** 2, 0) / calProbs.length;
    }
  } else if (method === 'platt') {
    const platt = plattScaling(values);
    plattA = platt.a;
    plattB = platt.b;
    if (values.length > 0) {
      const calProbs = values.map(v => applyPlatt(v.x, plattA, plattB));
      postBrier = calProbs.reduce((s, p, i) => s + (p - values[i].y) ** 2, 0) / calProbs.length;
    }
  }

  const state: CalibratorState = {
    method,
    trainedAt: new Date().toISOString(),
    sampleSize: values.length,
    isotonicMap,
    plattA: Math.round(plattA * 10000) / 10000,
    plattB: Math.round(plattB * 10000) / 10000,
    preCalibrationBrier: preBrier !== null ? Math.round(preBrier * 10000) / 10000 : null,
    postCalibrationBrier: postBrier !== null ? Math.round(postBrier * 10000) / 10000 : null,
    eceBefore: preECE,
    eceAfter: postECE,
  };

  cachedState = state;
  cachedAt = Date.now();

  console.log(
    `[CALIBRATOR] Trained ${method} on ${values.length} samples. ` +
    `Brier: ${state.preCalibrationBrier} → ${state.postCalibrationBrier} | ` +
    `ECE: ${state.eceBefore} → ${state.eceAfter}`,
  );

  return state;
}

// ─── Calibrate a Single Probability ────────────────────────────

export async function calibrateProbability(
  rawProbability: number,
  params?: { modelVersion?: string; horizonDays?: number; regime?: string },
): Promise<CalibrateResult> {
  let state = cachedState;
  if (!state || Date.now() - cachedAt > CACHE_TTL_MS) {
    state = await trainCalibrator({ ...params, method: 'auto' });
  }

  let calibrated: number;
  let method: string;

  switch (state.method) {
    case 'isotonic':
      calibrated = applyIsotonic(rawProbability, state.isotonicMap);
      method = 'isotonic';
      break;
    case 'platt':
      calibrated = applyPlatt(rawProbability, state.plattA, state.plattB);
      method = 'platt';
      break;
    default:
      calibrated = rawProbability;
      method = 'none';
      break;
  }

  return {
    rawProbability: Math.round(rawProbability * 10000) / 10000,
    calibratedProbability: Math.round(Math.max(0, Math.min(1, calibrated)) * 10000) / 10000,
    method,
    adjustment: Math.round((calibrated - rawProbability) * 10000) / 10000,
  };
}

// ─── Get Current Calibrator State ──────────────────────────────

export async function getCalibratorState(params?: {
  modelVersion?: string;
  horizonDays?: number;
}): Promise<CalibratorState> {
  if (cachedState && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedState;
  }
  return trainCalibrator(params);
}

// ─── Invalidate Cache ──────────────────────────────────────────

export function invalidateCalibratorCache(): void {
  cachedState = null;
  cachedAt = 0;
}
