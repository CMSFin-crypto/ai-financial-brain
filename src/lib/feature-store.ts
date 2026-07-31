// ============================================================
// Feature Store — snapshot, retrieve, and compare feature vectors.
//
// The feature store ensures training/inference consistency by:
//   1. Storing feature snapshots with version hash at prediction time
//   2. Validating feature vectors against definitions before use
//   3. Detecting schema drift between training and live features
//   4. Providing audit trail for what features were used when
//
// This is NOT a database-backed feature store (no Feast/Tecton).
// It's a lightweight consistency layer that uses the existing
// PredictionFactor table for storage.
// ============================================================

import prisma from './prisma';
import {
  getAllFeatures,
  getModelFeatureSet,
  validateFeatureVector,
  computeVersionHash,
  getFeatureStoreSummary,
  type FeatureDefinition,
  type FeatureStoreSummary as FeatureStoreSummaryType,
} from './feature-definitions';

// ─── Types ────────────────────────────────────────────────────

export type FeatureSnapshot = {
  predictionId: string;
  symbol: string;
  timestamp: string;
  modelVersion: string;
  featureHash: string;
  features: Record<string, unknown>;
  missingFeatures: string[];
  validationErrors: Record<string, string[]>;
  isValid: boolean;
};

export type ConsistencyReport = {
  currentHash: string;
  trainingHash: string | null;
  hashMatch: boolean;
  addedFeatures: string[];
  removedFeatures: string[];
  versionChangedFeatures: string[];
  risk: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  recommendation: string;
};

export type FeatureVector = Record<string, unknown>;

// ─── Core: Snapshot Features at Prediction Time ───────────────

/**
 * Create a feature snapshot for a prediction.
 * This should be called every time a prediction is made.
 * Stores features in the PredictionFactor table.
 */
export async function snapshotFeatures(
  predictionId: string,
  symbol: string,
  features: FeatureVector,
  modelVersion = 'predict-v3-regime-spillover',
): Promise<FeatureSnapshot> {
  const featureHash = computeVersionHash();
  const expectedFeatures = getModelFeatureSet(modelVersion);
  const validation = validateFeatureVector(features);

  // Determine missing features
  const providedNames = new Set(Object.keys(features));
  const missingFeatures = expectedFeatures.filter(n => !providedNames.has(n));

  const snapshot: FeatureSnapshot = {
    predictionId,
    symbol,
    timestamp: new Date().toISOString(),
    modelVersion,
    featureHash,
    features,
    missingFeatures,
    validationErrors: validation.featureErrors,
    isValid: validation.valid && missingFeatures.length === 0,
  };

  // Persist to PredictionFactor table
  const factorRecords = Object.entries(features).map(([name, value]) => ({
    predictionId,
    factorName: name,
    factorType: getFactorType(name),
    score: typeof value === 'number' ? value : (typeof value === 'string' ? 0 : 0),
    weight: 0, // weight is managed by learning engine
    signal: typeof value === 'string' ? value : (typeof value === 'number' ? (value > 0 ? 'BULLISH' : value < 0 ? 'BEARISH' : 'NEUTRAL') : null),
    description: getFeatureDescription(name),
  }));

  // Batch upsert
  if (factorRecords.length > 0) {
    // Delete existing factors for this prediction and re-create
    await prisma.predictionFactor.deleteMany({
      where: { predictionId },
    });
    await prisma.predictionFactor.createMany({
      data: factorRecords,
    });
  }

  return snapshot;
}

/**
 * Retrieve the feature snapshot for a past prediction.
 */
export async function retrieveSnapshot(predictionId: string): Promise<FeatureSnapshot | null> {
  const factors = await prisma.predictionFactor.findMany({
    where: { predictionId },
    orderBy: { factorName: 'asc' },
  });

  if (factors.length === 0) return null;

  const prediction = await prisma.prediction.findUnique({
    where: { id: predictionId },
    select: { symbol: true, modelVersion: true, predictedAt: true },
  });

  if (!prediction) return null;

  const features: FeatureVector = {};
  const validationErrors: Record<string, string[]> = {};

  for (const f of factors) {
    features[f.factorName] = f.score;
    if (f.signal && f.factorType !== 'technical') {
      // Store categorical values in signal field
      if (['BULLISH', 'BEARISH', 'NEUTRAL'].includes(f.signal)) continue;
      features[f.factorName] = f.signal;
    }
  }

  return {
    predictionId,
    symbol: prediction.symbol,
    timestamp: prediction.predictedAt.toISOString(),
    modelVersion: prediction.modelVersion,
    featureHash: computeVersionHash(), // current hash (may differ from when snapshot was taken)
    features,
    missingFeatures: [],
    validationErrors,
    isValid: true,
  };
}

// ─── Core: Consistency Check ──────────────────────────────────

/**
 * Check consistency between current feature definitions and
 * what was used during training (or a reference point).
 *
 * Returns a detailed diff and risk assessment.
 */
export function checkConsistency(
  referenceHash?: string,
): ConsistencyReport {
  const currentHash = computeVersionHash();
  const refHash = referenceHash || null;

  if (!refHash) {
    return {
      currentHash,
      trainingHash: null,
      hashMatch: false,
      addedFeatures: [],
      removedFeatures: [],
      versionChangedFeatures: [],
      risk: 'MEDIUM',
      recommendation: 'No reference hash provided. Set training hash when training a new model version.',
    };
  }

  const hashMatch = currentHash === refHash;

  if (hashMatch) {
    return {
      currentHash,
      trainingHash: refHash,
      hashMatch: true,
      addedFeatures: [],
      removedFeatures: [],
      versionChangedFeatures: [],
      risk: 'NONE',
      recommendation: 'Feature schema matches training. Safe to deploy.',
    };
  }

  // Hash doesn't match — figure out what changed
  // Since we can't diff against a stored snapshot easily,
  // we compare the model feature set against what's in the DB
  const currentFeatures = new Set(getModelFeatureSet());

  // We can't know the exact training set from hash alone,
  // so we report the current state
  const addedFeatures: string[] = [];
  const removedFeatures: string[] = [];
  const versionChangedFeatures: string[] = [];

  // Check for recently changed versions (heuristic)
  const allDefs = getAllFeatures({ enabledOnly: true });
  for (const def of allDefs) {
    if (def.version > 1) {
      versionChangedFeatures.push(`${def.name} (v${def.version})`);
    }
  }

  const risk = versionChangedFeatures.length >= 3 ? 'HIGH'
    : versionChangedFeatures.length >= 1 ? 'MEDIUM'
    : 'LOW';

  const recommendation = risk === 'HIGH'
    ? 'Multiple feature versions changed. Retrain model before deploying.'
    : risk === 'MEDIUM'
    ? 'Some feature versions changed. Review changes and consider retraining.'
    : 'Minor changes detected. Monitor closely for performance impact.';

  return {
    currentHash,
    trainingHash: refHash,
    hashMatch: false,
    addedFeatures,
    removedFeatures,
    versionChangedFeatures,
    risk,
    recommendation,
  };
}

/**
 * Get feature store summary (counts, hash, etc.)
 */
export function getSummary(): FeatureStoreSummaryType {
  return getFeatureStoreSummary();
}

/**
 * List recent feature snapshots from predictions.
 */
export async function listRecentSnapshots(
  limit = 20,
): Promise<Array<{ predictionId: string; symbol: string; timestamp: string; factorCount: number }>> {
  const predictions = await prisma.prediction.findMany({
    orderBy: { predictedAt: 'desc' },
    take: limit,
    select: { id: true, symbol: true, predictedAt: true },
  });

  const results: Array<{ predictionId: string; symbol: string; timestamp: string; factorCount: number }> = [];
  for (const p of predictions) {
    const count = await prisma.predictionFactor.count({
      where: { predictionId: p.id },
    });
    results.push({
      predictionId: p.id,
      symbol: p.symbol,
      timestamp: p.predictedAt.toISOString(),
      factorCount: count,
    });
  }
  return results;
}

// ─── Helpers ──────────────────────────────────────────────────

function getFactorType(featureName: string): string {
  if (featureName.startsWith('rsi') || featureName.startsWith('macd') ||
      featureName.startsWith('bollinger') || featureName.startsWith('sma') ||
      featureName.startsWith('stochastic') || featureName.startsWith('adx') ||
      featureName.startsWith('atr') || featureName.startsWith('obv') ||
      featureName.startsWith('volume_') || featureName.startsWith('vwap') ||
      featureName.startsWith('price_channel') || featureName.startsWith('divergence') ||
      featureName.startsWith('rate_of_change')) return 'technical';
  if (featureName.startsWith('pe_') || featureName.startsWith('revenue_') ||
      featureName.startsWith('earnings_') || featureName.startsWith('debt_') ||
      featureName.startsWith('profit_')) return 'fundamental';
  if (featureName.startsWith('regime_')) return 'regime';
  if (featureName.startsWith('vix') || featureName.startsWith('spy_') ||
      featureName.startsWith('market_') || featureName.startsWith('put_call')) return 'market';
  if (featureName.startsWith('asia_') || featureName.startsWith('europe_') ||
      featureName.startsWith('spillover')) return 'spillover';
  if (featureName.startsWith('event_')) return 'event';
  return 'derived';
}

function getFeatureDescription(featureName: string): string | undefined {
  const allDefs = getAllFeatures();
  const def = allDefs.find(f => f.name === featureName);
  return def?.description;
}
