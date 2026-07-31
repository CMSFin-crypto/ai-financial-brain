// ============================================================
// Drift Monitor — PSI-based feature & score distribution drift.
//
// Monitors whether the distribution of model inputs/outputs has
// shifted significantly from a baseline. Uses Population Stability
// Index (PSI) to quantify drift.
//
// PSI thresholds:
//   < 0.10  — STABLE (no action)
//   0.10–0.25 — DRIFT_WARNING (monitor closely)
//   > 0.25  — DRIFT_CRITICAL (freeze auto weight updates)
//
// When drift is critical, the learning engine should NOT adapt
// weights, because the relationship it learned no longer holds.
// ============================================================

import prisma from './prisma';

// ─── Types ────────────────────────────────────────────────────

export type DriftLevel = 'STABLE' | 'DRIFT_WARNING' | 'DRIFT_CRITICAL';

export type FeatureDriftResult = {
  featureName: string;
  psi: number;
  level: DriftLevel;
  baselineMean: number;
  currentMean: number;
  baselineStd: number;
  currentStd: number;
  sampleSizeBaseline: number;
  sampleSizeCurrent: number;
};

export type DriftReport = {
  assessedAt: string;
  baselinePeriod: { from: string; to: string };
  currentPeriod: { from: string; to: string };
  features: FeatureDriftResult[];
  overallLevel: DriftLevel;
  freezeLearning: boolean;
  regimeContext?: string;
  summary: string;
};

export type DriftConfig = {
  baselineDays?: number;       // days for baseline window (default 60)
  currentDays?: number;       // days for current window (default 30)
  psiWarningThreshold?: number;
  psiCriticalThreshold?: number;
  minSampleSize?: number;     // minimum samples per window
};

const DEFAULT_CONFIG: Required<DriftConfig> = {
  baselineDays: 60,
  currentDays: 30,
  psiWarningThreshold: 0.10,
  psiCriticalThreshold: 0.25,
  minSampleSize: 30,
};

// ─── PSI Calculation ─────────────────────────────────────────

/**
 * Compute Population Stability Index between two numeric arrays.
 * Both arrays are binned into the same percentile buckets.
 *
 * PSI = sum( (current_pct - baseline_pct) * ln(current_pct / baseline_pct) )
 *
 * Handles edge cases: zero bins, empty arrays, identical distributions.
 */
export function computePSI(baseline: number[], current: number[]): number {
  if (baseline.length < 5 || current.length < 5) return 0;

  // Create bins from baseline percentiles
  const NUM_BINS = 10;
  const sorted = [...baseline].sort((a, b) => a - b);
  const binEdges: number[] = [sorted[0] - 0.001]; // slightly below min

  for (let i = 1; i < NUM_BINS; i++) {
    const idx = Math.floor((i / NUM_BINS) * sorted.length);
    binEdges.push(sorted[Math.min(idx, sorted.length - 1)]);
  }
  binEdges.push(sorted[sorted.length - 1] + 0.001); // slightly above max

  // Count frequencies in each bin
  const baselineCounts = new Array(NUM_BINS + 1).fill(0);
  const currentCounts = new Array(NUM_BINS + 1).fill(0);

  for (const v of baseline) {
    let binIdx = 0;
    for (let i = 1; i < binEdges.length; i++) {
      if (v <= binEdges[i]) { binIdx = i - 1; break; }
      binIdx = i;
    }
    baselineCounts[binIdx]++;
  }

  for (const v of current) {
    let binIdx = 0;
    for (let i = 1; i < binEdges.length; i++) {
      if (v <= binEdges[i]) { binIdx = i - 1; break; }
      binIdx = i;
    }
    currentCounts[binIdx]++;
  }

  // Compute PSI
  let psi = 0;
  const bTotal = baseline.length;
  const cTotal = current.length;

  for (let i = 0; i <= NUM_BINS; i++) {
    const bPct = baselineCounts[i] / bTotal;
    const cPct = currentCounts[i] / cTotal;

    // Skip bins where both are zero
    if (bPct === 0 && cPct === 0) continue;

    // Handle zero baseline bins to avoid division by zero
    if (bPct === 0) {
      // Current has values where baseline didn't — significant drift
      psi += 0.01; // small penalty
      continue;
    }

    psi += (cPct - bPct) * Math.log(cPct / bPct);
  }

  return Math.max(0, psi);
}

// ─── Stats helpers ────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stdDev(arr: number[], avg: number): number {
  if (arr.length < 2) return 0;
  return Math.sqrt(arr.reduce((s, v) => s + (v - avg) ** 2, 0) / (arr.length - 1));
}

// ─── Core: Assess Drift ──────────────────────────────────────

/**
 * Load predictions from DB for two time windows and compute PSI
 * for key features (rawScore, calibratedConfidence, finalDecision dist).
 * Also checks technical indicators if PredictionFactor rows exist.
 */
export async function assessDrift(config?: DriftConfig): Promise<DriftReport> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const now = new Date();
  const currentFrom = new Date(now.getTime() - cfg.currentDays * 86400000);
  const baselineFrom = new Date(now.getTime() - (cfg.baselineDays + cfg.currentDays) * 86400000);
  const baselineTo = currentFrom;

  // Fetch both windows in parallel
  const [baselinePreds, currentPreds] = await Promise.all([
    prisma.prediction.findMany({
      where: {
        predictedAt: { gte: baselineFrom, lt: baselineTo },
        rawScore: { not: null },
      },
      select: {
        rawScore: true,
        calibratedConfidence: true,
        finalDecision: true,
        regime: true,
        factors: { select: { factorName: true, factorType: true, score: true } },
      },
      take: 5000,
    }),
    prisma.prediction.findMany({
      where: {
        predictedAt: { gte: currentFrom, lte: now },
        rawScore: { not: null },
      },
      select: {
        rawScore: true,
        calibratedConfidence: true,
        finalDecision: true,
        regime: true,
        factors: { select: { factorName: true, factorType: true, score: true } },
      },
      take: 5000,
    }),
  ]);

  // Determine dominant regime in current period
  const regimeCounts: Record<string, number> = {};
  for (const p of currentPreds) {
    const r = p.regime || 'UNKNOWN';
    regimeCounts[r] = (regimeCounts[r] || 0) + 1;
  }
  const dominantRegime = Object.entries(regimeCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  // Extract features for PSI computation
  const features: FeatureDriftResult[] = [];

  // --- Core score features ---
  const scorePairs: Array<{ name: string; base: number[]; curr: number[] }> = [
    {
      name: 'rawScore',
      base: baselinePreds.map(p => p.rawScore as number),
      curr: currentPreds.map(p => p.rawScore as number),
    },
    {
      name: 'calibratedConfidence',
      base: baselinePreds.map(p => p.calibratedConfidence),
      curr: currentPreds.map(p => p.calibratedConfidence),
    },
  ];

  // --- Decision distribution (encoded as numeric) ---
  const decisionMap: Record<string, number> = { BUY: 1, SELL: -1, HOLD: 0, NO_TRADE: 0 };
  scorePairs.push({
    name: 'finalDecision',
    base: baselinePreds.map(p => decisionMap[p.finalDecision] ?? 0),
    curr: currentPreds.map(p => decisionMap[p.finalDecision] ?? 0),
  });

  // --- Technical indicator factors ---
  // Collect factor names that appear in both windows
  const baseFactorMap = new Map<string, number[]>();
  const currFactorMap = new Map<string, number[]>();

  for (const p of baselinePreds) {
    for (const f of p.factors) {
      if (f.factorType === 'technical') {
        if (!baseFactorMap.has(f.factorName)) baseFactorMap.set(f.factorName, []);
        baseFactorMap.get(f.factorName)!.push(f.score);
      }
    }
  }
  for (const p of currentPreds) {
    for (const f of p.factors) {
      if (f.factorType === 'technical') {
        if (!currFactorMap.has(f.factorName)) currFactorMap.set(f.factorName, []);
        currFactorMap.get(f.factorName)!.push(f.score);
      }
    }
  }

  for (const [name, curr] of currFactorMap) {
    const base = baseFactorMap.get(name);
    if (base && base.length >= cfg.minSampleSize && curr.length >= cfg.minSampleSize) {
      scorePairs.push({ name, base, curr });
    }
  }

  // --- Compute PSI for each feature ---
  let maxPSI = 0;
  let criticalCount = 0;

  for (const pair of scorePairs) {
    if (pair.base.length < cfg.minSampleSize || pair.curr.length < cfg.minSampleSize) continue;

    const psi = computePSI(pair.base, pair.curr);
    const baseAvg = mean(pair.base);
    const currAvg = mean(pair.curr);
    const baseSD = stdDev(pair.base, baseAvg);
    const currSD = stdDev(pair.curr, currAvg);

    const level: DriftLevel =
      psi >= cfg.psiCriticalThreshold ? 'DRIFT_CRITICAL'
        : psi >= cfg.psiWarningThreshold ? 'DRIFT_WARNING'
        : 'STABLE';

    if (psi > maxPSI) maxPSI = psi;
    if (level === 'DRIFT_CRITICAL') criticalCount++;

    features.push({
      featureName: pair.name,
      psi: Math.round(psi * 10000) / 10000,
      level,
      baselineMean: Math.round(baseAvg * 100) / 100,
      currentMean: Math.round(currAvg * 100) / 100,
      baselineStd: Math.round(baseSD * 100) / 100,
      currentStd: Math.round(currSD * 100) / 100,
      sampleSizeBaseline: pair.base.length,
      sampleSizeCurrent: pair.curr.length,
    });
  }

  // --- Overall assessment ---
  const overallLevel: DriftLevel =
    criticalCount >= 2 ? 'DRIFT_CRITICAL'
      : maxPSI >= cfg.psiCriticalThreshold ? 'DRIFT_CRITICAL'
        : maxPSI >= cfg.psiWarningThreshold ? 'DRIFT_WARNING'
        : 'STABLE';

  const freezeLearning = overallLevel === 'DRIFT_CRITICAL';

  // Build human-readable summary
  const driftFeatures = features.filter(f => f.level !== 'STABLE');
  const summary = driftFeatures.length === 0
    ? 'All features stable. No drift detected.'
    : `Drift detected in ${driftFeatures.length} feature(s). ${driftFeatures.filter(f => f.level === 'DRIFT_CRITICAL').length} critical. ${freezeLearning ? 'Learning weights FROZEN.' : 'Monitor closely.'}`;

  return {
    assessedAt: new Date().toISOString(),
    baselinePeriod: { from: baselineFrom.toISOString(), to: baselineTo.toISOString() },
    currentPeriod: { from: currentFrom.toISOString(), to: now.toISOString() },
    features,
    overallLevel,
    freezeLearning,
    regimeContext: dominantRegime,
    summary,
  };
}

// ─── Regime-specific weight freeze ─────────────────────────────
// When a regime has very few samples, don't trust its learned
// weights. Return the DEFAULT weights instead.

export type RegimeWeightBucket = {
  regime: string;
  sampleSize: number;
  minSample: number;
  canAdapt: boolean;
  weights: Record<string, number> | null;
  decayFactor: number;  // 0..1, how much to trust regime-specific vs default
};

/**
 * Check if there are enough predictions per regime to trust
 * regime-specific weights. If sample is too small, return
 * decay factor < 1 to blend with defaults.
 */
export async function getRegimeWeightBuckets(
  minSamplePerRegime = 100,
): Promise<RegimeWeightBucket[]> {
  const cutoff = new Date(Date.now() - 90 * 86400000);

  const rows = await prisma.prediction.groupBy({
    by: ['regime'],
    where: {
      regime: { not: null },
      predictedAt: { gte: cutoff },
      wasCorrect: { not: null },
    },
    _count: { id: true },
  });

  return rows.map(r => {
    const count = r._count.id;
    const canAdapt = count >= minSamplePerRegime;
    // Smooth decay: 0 at 0 samples, 1 at minSample, using sqrt curve
    const decayFactor = count >= minSamplePerRegime
      ? 1
      : Math.sqrt(count / minSamplePerRegime);

    return {
      regime: r.regime || 'UNKNOWN',
      sampleSize: count,
      minSample: minSamplePerRegime,
      canAdapt,
      weights: null, // caller fills from ModelWeight table
      decayFactor: Math.round(decayFactor * 1000) / 1000,
    };
  });
}
