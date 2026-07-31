// ============================================================
// Train Meta-Model — walk-forward training pipeline.
//
// Responsible for:
//   1. Fetching historical predictions with outcomes from DB
//   2. Building feature vectors for each historical prediction
//   3. Constructing binary labels (trade_success = 1/0)
//   4. Time-ordered train/val/test split (NO leakage)
//   5. Walk-forward cross-validation
//   6. Training the gradient-boosted ensemble
//   7. Fitting isotonic calibration on validation set
//   8. Evaluating on held-out test set
//   9. Persisting ModelTrainingRun + model artifact to DB
//
// CRITICAL: This file NEVER looks at future data.
// All splits are strictly time-ordered.
// ============================================================

import prisma from '@/lib/prisma';
import { FEATURE_NAMES, FEATURE_SCHEMA_VERSION, computeSchemaHash, type FeatureName } from './feature-definitions';
import { featureVectorToArray, buildFeaturesFromOptions, type FeatureBuildOptions } from './feature-builder';
import { trainMetaModel, evaluateMetaModel, predictMetaModel, serializeModel, deserializeModel, DEFAULT_CONFIG, type MetaModelConfig, type TreeEnsemble, type TrainingSample } from './meta-model';
import { fitIsotonicCalibration, serializeCalibrationState, type CalibrationState } from './calibration';

// ─── Types ──────────────────────────────────────────────────

export interface TrainingResult {
  trainingRunId: string;
  modelVersion: string;
  status: string;
  trainAccuracy: number;
  valAccuracy: number;
  testAccuracy: number;
  trainBrier: number;
  valBrier: number;
  testBrier: number;
  valAuc: number;
  testAuc: number;
  calibrationEce: number;
  overfittingRatio: number;
  wfFoldCount: number;
  wfAvgAccuracy: number;
  wfStdAccuracy: number;
  wfAvgBrier: number;
  featureImportance: Record<string, number>;
  sampleSize: number;
}

export interface WalkForwardConfig {
  /** Total training days minimum */
  minTrainSamples: number;
  /** Validation set size (days) */
  valDays: number;
  /** Test set size (days) */
  testDays: number;
  /** Number of walk-forward folds */
  nFolds: number;
  /** Step size between folds (days) */
  foldStepDays: number;
  /** Purge gap between train and val (days) — prevents leakage */
  purgeGapDays: number;
}

export const DEFAULT_WF_CONFIG: WalkForwardConfig = {
  minTrainSamples: 200,
  valDays: 30,
  testDays: 30,
  nFolds: 3,
  foldStepDays: 14,
  purgeGapDays: 1,
};

// ─── Label construction ─────────────────────────────────────

/**
 * Construct binary label from a Prediction record.
 * trade_success = 1 if:
 *   - decision was BUY and actualReturn > 0 (after costs)
 *   - decision was SELL and actualReturn < 0 (after costs)
 * trade_success = 0 otherwise.
 */
function constructLabel(
  finalDecision: string,
  actualReturn: number | null,
  costBps: number = 10, // 10 bps execution cost
): number | null {
  if (actualReturn === null) return null;

  const netReturn = actualReturn - costBps / 10000;

  if (finalDecision === 'BUY' || finalDecision === 'STRONG_BUY') {
    return netReturn > 0 ? 1 : 0;
  } else if (finalDecision === 'SELL' || finalDecision === 'STRONG_SELL') {
    return netReturn < 0 ? 1 : 0;
  }
  // HOLD / NO_TRADE — exclude from training
  return null;
}

// ─── Data fetching ──────────────────────────────────────────

interface HistoricalPredictionRow {
  id: string;
  symbol: string;
  sector: string | null;
  regime: string | null;
  rawScore: number;
  calibratedConfidence: number;
  finalDecision: string;
  actualReturn: number | null;
  wasCorrect: boolean | null;
  predictedAt: Date;
  evaluationStatus: string;
  // Factors (from relation)
  factors: { factorName: string; factorType: string; score: number }[];
  // Market snapshot (from relation)
  marketSnapshot?: { regime: string; vixLevel: number | null } | null;
}

/**
 * Fetch evaluated predictions from DB for training.
 * Only includes predictions with known outcomes.
 */
async function fetchTrainingData(
  fromDate?: Date,
  toDate?: Date,
): Promise<HistoricalPredictionRow[]> {
  const where: any = {
    evaluationStatus: 'EVALUATED',
    actualReturn: { not: null },
  };

  if (fromDate) where.predictedAt = { ...where.predictedAt, gte: fromDate };
  if (toDate) where.predictedAt = { ...where.predictedAt, lte: toDate };

  return prisma.prediction.findMany({
    where,
    include: {
      factors: { select: { factorName: true, factorType: true, score: true } },
      marketSnapshots: {
        select: { regime: true, vixLevel: true },
        take: 1,
      },
    },
    orderBy: { predictedAt: 'asc' },
  });
}

// ─── Feature extraction from DB row ────────────────────────

function extractFeaturesFromRow(row: HistoricalPredictionRow): FeatureBuildOptions {
  const indicatorScores: Record<string, number> = {};
  for (const f of row.factors) {
    if (f.factorType === 'technical') {
      indicatorScores[f.factorName] = f.score;
    }
  }

  return {
    indicatorScores,
    technicalScore: row.rawScore,
    fundamentalScore: row.factors
      .filter(f => f.factorType === 'fundamental')
      .reduce((sum, f) => sum + f.score, 0),
    regime: row.regime ?? row.marketSnapshot?.regime,
    vixLevel: row.marketSnapshot?.vixLevel ?? undefined,
  };
}

// ─── Walk-forward training ──────────────────────────────────

/**
 * Build a single train/val/test split with time ordering.
 */
function timeSplit(
  data: TrainingSample[],
  valPct: number = 0.15,
  testPct: number = 0.15,
 purgeGap: number = 1,
): { train: TrainingSample[]; val: TrainingSample[]; test: TrainingSample[] } {
  const n = data.length;
  const testStart = Math.floor(n * (1 - testPct));
  const valStart = Math.floor(n * (1 - testPct - valPct));

  // Apply purge gap: remove `purgeGap` samples between train and val
  const valActualStart = Math.min(valStart + purgeGap, testStart);

  return {
    train: data.slice(0, valStart),
    val: data.slice(valActualStart, testStart),
    test: data.slice(testStart),
  };
}

/**
 * Run walk-forward cross-validation.
 * Returns per-fold metrics.
 */
function walkForwardCV(
  data: TrainingSample[],
  config: WalkForwardConfig,
  modelConfig: MetaModelConfig,
): { foldAccuracies: number[]; foldBriers: number[] } {
  const foldAccuracies: number[] = [];
  const foldBriers: number[] = [];

  const n = data.length;
  if (n < config.minTrainSamples + config.valDays + config.testDays) {
    return { foldAccuracies: [], foldBriers: [] };
  }

  for (let fold = 0; fold < config.nFolds; fold++) {
    const testEnd = n - fold * config.foldStepDays;
    const testStart = Math.max(0, testEnd - config.testDays);
    const valEnd = testStart - config.purgeGapDays;
    const valStart = Math.max(0, valEnd - config.valDays);
    const trainEnd = Math.max(0, valStart - config.purgeGapDays);

    if (trainEnd < config.minTrainSamples) break;

    const train = data.slice(0, trainEnd);
    const val = data.slice(valStart, valEnd);
    const test = data.slice(testStart, testEnd);

    if (val.length < 10 || test.length < 10) break;

    try {
      const model = trainMetaModel(train, modelConfig);
      const eval_ = evaluateMetaModel(test, model);
      foldAccuracies.push(eval_.accuracy);
      foldBriers.push(eval_.brierScore);
    } catch {
      // Skip fold if training fails (e.g., all same class)
    }
  }

  return { foldAccuracies, foldBriers };
}

// ─── Main training function ─────────────────────────────────

/**
 * Run the full meta-model training pipeline.
 * This is the entry point called by the /api/ml-train route.
 */
export async function runTrainingPipeline(
  modelConfig?: Partial<MetaModelConfig>,
  wfConfig?: Partial<WalkForwardConfig>,
): Promise<TrainingResult> {
  const cfg = { ...DEFAULT_CONFIG, ...modelConfig };
  const wfc = { ...DEFAULT_WF_CONFIG, ...wfConfig };

  // Generate model version
  const today = new Date().toISOString().split('T')[0];
  const modelVersion = `meta-v1-${today}`;

  // ── 1. Create training run record ──
  const run = await prisma.modelTrainingRun.create({
    data: {
      modelVersion,
      algorithm: 'gradient-boosted-trees',
      status: 'RUNNING',
      hyperParams: cfg as any,
      featureList: [...FEATURE_NAMES] as any,
    },
  });

  try {
    // ── 2. Fetch historical data ──
    const rows = await fetchTrainingData();
    if (rows.length < wfc.minTrainSamples) {
      await prisma.modelTrainingRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', error: `Insufficient data: ${rows.length} < ${wfc.minTrainSamples}` },
      });
      throw new Error(`Insufficient training data: ${rows.length} samples (need ${wfc.minTrainSamples})`);
    }

    // ── 3. Build training samples ──
    const samples: TrainingSample[] = [];
    for (const row of rows) {
      const label = constructLabel(row.finalDecision, row.actualReturn);
      if (label === null) continue; // skip HOLD/NO_TRADE

      const opts = extractFeaturesFromRow(row);
      const result = buildFeaturesFromOptions(opts);
      const featureArray = featureVectorToArray(result.features);

      samples.push({ features: featureArray, label });
    }

    if (samples.length < wfc.minTrainSamples) {
      await prisma.modelTrainingRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', error: `Insufficient labeled samples: ${samples.length}` },
      });
      throw new Error(`Insufficient labeled samples: ${samples.length}`);
    }

    // Record window
    const firstDate = rows[0].predictedAt;
    const lastDate = rows[rows.length - 1].predictedAt;

    // ── 4. Time-ordered split ──
    const { train, val, test } = timeSplit(samples, 0.15, 0.15, wfc.purgeGapDays);

    // ── 5. Walk-forward CV ──
    const wfResult = walkForwardCV(samples, wfc, cfg);

    // ── 6. Train final model on train + val ──
    const fullTrain = [...train, ...val];
    const model = trainMetaModel(fullTrain, cfg);

    // ── 7. Evaluate on train, val, test ──
    const trainEval = evaluateMetaModel(train, model);
    const valEval = evaluateMetaModel(val, model);
    const testEval = evaluateMetaModel(test, model);

    // ── 8. Fit calibration on validation set ──
    const valProbs = val.map(s => {
      const pred = predictMetaModel(s.features, model);
      return pred.rawWinProbability;
    });
    const valLabels = val.map(s => s.label);
    const calibrationState = fitIsotonicCalibration(valProbs, valLabels);

    // Re-evaluate test with calibration
    const testEvalCal = evaluateMetaModel(test, model, calibrationState);

    // ── 9. Overfitting check ──
    const overfittingRatio = testEval.accuracy > 0
      ? trainEval.accuracy / testEval.accuracy
      : 999;

    // ── 10. Persist results ──
    const artifact = serializeModel(model);
    const calState = serializeCalibrationState(calibrationState);

    const splitIdx = Math.floor(samples.length * 0.7);
    const valSplitIdx = Math.floor(samples.length * 0.85);

    await prisma.modelTrainingRun.update({
      where: { id: run.id },
      data: {
        status: 'COMPLETED',
        trainingWindowFrom: firstDate,
        trainingWindowTo: lastDate,
        validationWindowFrom: firstDate,
        validationWindowTo: lastDate,
        trainSamples: train.length,
        valSamples: val.length,
        testSamples: test.length,
        trainAccuracy: trainEval.accuracy,
        valAccuracy: valEval.accuracy,
        testAccuracy: testEvalCal.accuracy,
        trainBrier: trainEval.brierScore,
        valBrier: valEval.brierScore,
        testBrier: testEvalCal.brierScore,
        valAuc: valEval.auc,
        testAuc: testEvalCal.auc,
        calibrationEce: calibrationState.ece,
        overfittingRatio,
        modelArtifact: artifact,
        calibrationState: calState as any,
        wfFoldCount: wfResult.foldAccuracies.length,
        wfAvgAccuracy: wfResult.foldAccuracies.length > 0
          ? wfResult.foldAccuracies.reduce((a, b) => a + b, 0) / wfResult.foldAccuracies.length
          : null,
        wfStdAccuracy: wfResult.foldAccuracies.length > 1
          ? std(wfResult.foldAccuracies)
          : null,
        wfAvgBrier: wfResult.foldBriers.length > 0
          ? wfResult.foldBriers.reduce((a, b) => a + b, 0) / wfResult.foldBriers.length
          : null,
        completedAt: new Date(),
      },
    });

    return {
      trainingRunId: run.id,
      modelVersion,
      status: 'COMPLETED',
      trainAccuracy: trainEval.accuracy,
      valAccuracy: valEval.accuracy,
      testAccuracy: testEvalCal.accuracy,
      trainBrier: trainEval.brierScore,
      valBrier: valEval.brierScore,
      testBrier: testEvalCal.brierScore,
      valAuc: valEval.auc,
      testAuc: testEvalCal.auc,
      calibrationEce: calibrationState.ece,
      overfittingRatio,
      wfFoldCount: wfResult.foldAccuracies.length,
      wfAvgAccuracy: wfResult.foldAccuracies.length > 0
        ? wfResult.foldAccuracies.reduce((a, b) => a + b, 0) / wfResult.foldAccuracies.length
        : 0,
      wfStdAccuracy: wfResult.foldAccuracies.length > 1
        ? std(wfResult.foldAccuracies)
        : 0,
      wfAvgBrier: wfResult.foldBriers.length > 0
        ? wfResult.foldBriers.reduce((a, b) => a + b, 0) / wfResult.foldBriers.length
        : 0,
      featureImportance: model.featureImportance,
      sampleSize: samples.length,
    };
  } catch (error: any) {
    await prisma.modelTrainingRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        error: error.message ?? 'Unknown error',
      },
    });
    throw error;
  }
}

// ─── Inference helpers ──────────────────────────────────────

/** Load the latest trained model from DB */
export async function loadLatestModel(): Promise<{ model: TreeEnsemble; calibration: CalibrationState; version: string } | null> {
  const run = await prisma.modelTrainingRun.findFirst({
    where: { status: 'COMPLETED', modelArtifact: { not: null } },
    orderBy: { createdAt: 'desc' },
  });

  if (!run?.modelArtifact || !run.calibrationState) return null;

  const model = deserializeModel(run.modelArtifact);
  const calibration = typeof run.calibrationState === 'string'
    ? deserializeCalibrationState(run.calibrationState)
    : run.calibrationState as unknown as CalibrationState;

  return { model, calibration, version: run.modelVersion };
}

// ─── Internal imports ──────────────────────────────────────

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, x) => s + (x - mean) ** 2, 0) / (arr.length - 1));
}

// Re-export for external consumers
export { deserializeModel } from './meta-model';
export { deserializeCalibrationState } from './calibration';
