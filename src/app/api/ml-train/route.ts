// ============================================================
// ML Train — trigger meta-model training pipeline.
//
// POST /api/ml-train
//
// Triggers the full walk-forward training pipeline:
//   1. Fetch evaluated predictions from DB
//   2. Build feature vectors + labels
//   3. Walk-forward CV
//   4. Train final model
//   5. Fit isotonic calibration
//   6. Persist model artifact + metrics
//
// Query params:
//   ?dryRun=true — compute metrics but don't persist model
//   ?nEstimators=200 — override hyperparams
//   ?maxDepth=4
//   ?learningRate=0.03
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { runTrainingPipeline, DEFAULT_WF_CONFIG } from '@/lib/ml/train-meta-model';
import { DEFAULT_CONFIG } from '@/lib/ml/meta-model';
import prisma from '@/lib/prisma';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get('dryRun') === 'true';

    // Optional hyperparameter overrides
    const modelOverrides: Record<string, any> = {};
    if (searchParams.get('nEstimators')) modelOverrides.nEstimators = Number(searchParams.get('nEstimators'));
    if (searchParams.get('maxDepth')) modelOverrides.maxDepth = Number(searchParams.get('maxDepth'));
    if (searchParams.get('learningRate')) modelOverrides.learningRate = Number(searchParams.get('learningRate'));
    if (searchParams.get('subsample')) modelOverrides.subsample = Number(searchParams.get('subsample'));

    const wfOverrides: Record<string, any> = {};
    if (searchParams.get('nFolds')) wfOverrides.nFolds = Number(searchParams.get('nFolds'));
    if (searchParams.get('minTrainSamples')) wfOverrides.minTrainSamples = Number(searchParams.get('minTrainSamples'));

    if (dryRun) {
      return NextResponse.json({
        status: 'DRY_RUN',
        message: 'Training not executed. Remove ?dryRun=true to run.',
        config: {
          model: { ...DEFAULT_CONFIG, ...modelOverrides },
          walkForward: { ...DEFAULT_WF_CONFIG, ...wfOverrides },
        },
        dataCheck: {
          evaluatedPredictions: await prisma.prediction.count({
            where: { evaluationStatus: 'EVALUATED', actualReturn: { not: null } },
          }),
          latestTrainingRun: await prisma.modelTrainingRun.findFirst({
            orderBy: { createdAt: 'desc' },
            select: { modelVersion: true, status: true, createdAt: true, testAccuracy: true },
          }),
        },
      });
    }

    const result = await runTrainingPipeline(modelOverrides, wfOverrides);

    return NextResponse.json({
      status: result.status,
      modelVersion: result.modelVersion,
      trainingRunId: result.trainingRunId,
      sampleSize: result.sampleSize,
      metrics: {
        train: { accuracy: result.trainAccuracy, brier: result.trainBrier },
        validation: { accuracy: result.valAccuracy, brier: result.valBrier, auc: result.valAuc },
        test: { accuracy: result.testAccuracy, brier: result.testBrier, auc: result.testAuc },
      },
      calibration: {
        ece: result.calibrationEce,
      },
      overfitting: {
        ratio: result.overfittingRatio,
        severity: result.overfittingRatio > 1.3 ? 'HIGH' : result.overfittingRatio > 1.15 ? 'MEDIUM' : 'LOW',
      },
      walkForward: {
        folds: result.wfFoldCount,
        avgAccuracy: result.wfAvgAccuracy,
        stdAccuracy: result.wfStdAccuracy,
        avgBrier: result.wfAvgBrier,
      },
      topFeatures: Object.entries(result.featureImportance)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, importance]) => ({ name, importance })),
    });
  } catch (error: any) {
    console.error('[ml-train] Error:', error);
    return NextResponse.json(
      { error: error.message ?? 'Training failed', stack: process.env.NODE_ENV === 'development' ? error.stack : undefined },
      { status: 500 },
    );
  }
}

export async function GET() {
  // Return training history
  const runs = await prisma.modelTrainingRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      modelVersion: true,
      algorithm: true,
      status: true,
      trainSamples: true,
      valSamples: true,
      testSamples: true,
      trainAccuracy: true,
      valAccuracy: true,
      testAccuracy: true,
      valAuc: true,
      testAuc: true,
      calibrationEce: true,
      overfittingRatio: true,
      wfFoldCount: true,
      wfAvgAccuracy: true,
      wfStdAccuracy: true,
      error: true,
      createdAt: true,
      completedAt: true,
    },
  });

  return NextResponse.json({ runs });
}
