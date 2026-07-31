// ============================================================
// ML Predict — meta-model inference endpoint.
//
// GET /api/ml-predict/[symbol]
//
// Pipeline:
//   1. Build feature vector from existing engines (live)
//   2. Load latest trained model from DB
//   3. Run inference: raw prob → calibrated prob
//   4. Apply decision gates (drift, health, event-risk)
//   5. Return: winProbability, confidence, recommendedAction,
//            expectedEdge, feature vector, explainability
//
// If no trained model exists, returns a "no model" status
// with the raw feature vector (useful for data collection).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { buildFeaturesLive, saveFeatureSnapshot, featureVectorToArray, type FeatureBuildResult } from '@/lib/ml/feature-builder';
import { validateFeatureVector } from '@/lib/ml/feature-definitions';
import { predictMetaModel, type MetaModelPredictResult } from '@/lib/ml/meta-model';
import { calibrateProbability } from '@/lib/ml/calibration';
import { loadLatestModel } from '@/lib/ml/train-meta-model';
import prisma from '@/lib/prisma';

export const maxDuration = 60;

// ─── Types ──────────────────────────────────────────────────

interface MLPredictResponse {
  symbol: string;
  timestamp: string;
  modelVersion: string | null;
  modelAvailable: boolean;

  // Feature info
  features: Record<string, number>;
  featureVersion: string;
  featureCount: number;
  schemaHash: string;
  missingSources: string[];
  featureValidation: { valid: boolean; missing: string[]; extra: string[] };

  // Model output
  rawWinProbability: number | null;
  rawLossProbability: number | null;
  calibratedWinProb: number | null;
  confidenceCalibrated: number | null;

  // Decision
  recommendedAction: 'TRADE' | 'PAPER_ONLY' | 'SKIP';
  actionReason: string;
  expectedEdge: number | null;

  // Explainability
  leafPath: string[] | null;
  featureImportance: Record<string, number> | null;

  // Gates
  gates: {
    driftOk: boolean;
    healthOk: boolean;
    eventRiskOk: boolean;
    modelTrained: boolean;
  };
}

// ─── Decision logic ─────────────────────────────────────────

function decideAction(
  calibratedProb: number,
 confidence: number,
 gates: { driftOk: boolean; healthOk: boolean; eventRiskOk: boolean },
): { action: 'TRADE' | 'PAPER_ONLY' | 'SKIP'; reason: string } {
  // Gate checks: if any gate fails, cannot auto-trade
  if (!gates.driftOk) {
    return { action: 'SKIP', reason: 'Drift CRITICAL — model inputs have shifted significantly' };
  }
  if (!gates.healthOk) {
    return { action: 'PAPER_ONLY', reason: 'Strategy health below threshold — paper trading only' };
  }
  if (!gates.eventRiskOk) {
    return { action: 'PAPER_ONLY', reason: 'Event risk within 24h — reduced size or skip' };
  }

  // Decision based on calibrated probability and confidence
  if (calibratedProb >= 0.6 && confidence >= 0.3) {
    return { action: 'TRADE', reason: `Strong signal: P(win)=${calibratedProb.toFixed(3)}, confidence=${confidence.toFixed(3)}` };
  }

  if (calibratedProb >= 0.55 && confidence >= 0.2) {
    return { action: 'PAPER_ONLY', reason: `Marginal signal: P(win)=${calibratedProb.toFixed(3)}, confidence=${confidence.toFixed(3)} — paper trade to gather data` };
  }

  return { action: 'SKIP', reason: `Insufficient edge: P(win)=${calibratedProb.toFixed(3)}, confidence=${confidence.toFixed(3)}` };
}

// ─── Gate checks ─────────────────────────────────────────────

async function checkGates(features: Record<string, number>) {
  // Drift check
  const driftOk = (features.drift_score ?? 0) < 0.25;

  // Health check
  const healthOk = (features.strategy_health ?? 0) >= 0.4;

  // Event risk check
  const eventRiskOk = (features.event_risk_flag ?? 0) === 0;

  return { driftOk, healthOk, eventRiskOk };
}

// ─── GET handler ────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();

  try {
    // ── 1. Build features from existing engines ──
    const featureResult: FeatureBuildResult = await buildFeaturesLive(upperSymbol);
    const { features, version, schemaHash, featureCount, missingSources } = featureResult;

    // ── 2. Validate feature vector ──
    const featureValidation = validateFeatureVector(features as any);

    // ── 3. Save feature snapshot ──
    await saveFeatureSnapshot(upperSymbol, features).catch(() => {/* non-critical */});

    // ── 4. Load model ──
    const modelData = await loadLatestModel();
    const modelAvailable = modelData !== null;

    // ── 5. Check gates ──
    const gates = await checkGates(features);
    gates.modelTrained = modelAvailable;

    // ── 6. If no model, return features only ──
    if (!modelData) {
      return NextResponse.json({
        symbol: upperSymbol,
        timestamp: new Date().toISOString(),
        modelVersion: null,
        modelAvailable: false,
        features: features as unknown as Record<string, number>,
        featureVersion: version,
        featureCount,
        schemaHash,
        missingSources,
        featureValidation,
        rawWinProbability: null,
        rawLossProbability: null,
        calibratedWinProb: null,
        confidenceCalibrated: null,
        recommendedAction: 'SKIP',
        actionReason: 'No trained model available — collect data first via /api/ml-train',
        expectedEdge: null,
        leafPath: null,
        featureImportance: null,
        gates,
      } satisfies MLPredictResponse);
    }

    const { model, calibration, version: modelVersion } = modelData;

    // ── 7. Run inference ──
    const featureArray = featureVectorToArray(features);
    const result: MetaModelPredictResult = predictMetaModel(featureArray, model);

    // ── 8. Calibrate ──
    const { calibratedProb, method } = calibrateProbability(
      result.rawWinProbability,
      calibration,
    );

    // ── 9. Decision ──
    const confidence = Math.abs(calibratedProb - 0.5) * 2;
    const { action, reason } = decideAction(calibratedProb, confidence, gates);

    // ── 10. Expected edge (simplified) ──
    const expectedEdge = calibratedProb > 0.5
      ? (calibratedProb - 0.5) * 2  // 0 to 1
      : -((0.5 - calibratedProb) * 2);

    // ── 11. Persist prediction to DB ──
    await prisma.modelPrediction.create({
      data: {
        modelVersion,
        symbol: upperSymbol,
        regime: null, // could be populated from features
        features: features as any,
        featureVersion: version,
        rawWinProbability: result.rawWinProbability,
        rawLossProbability: result.rawLossProbability,
        calibratedWinProb: calibratedProb,
        confidenceCalibrated: confidence,
        expectedEdge,
        recommendedAction: action,
        actionReason: reason,
      },
    });

    // ── 12. Response ──
    return NextResponse.json({
      symbol: upperSymbol,
      timestamp: new Date().toISOString(),
      modelVersion,
      modelAvailable: true,
      features: features as unknown as Record<string, number>,
      featureVersion: version,
      featureCount,
      schemaHash,
      missingSources,
      featureValidation,
      rawWinProbability: result.rawWinProbability,
      rawLossProbability: result.rawLossProbability,
      calibratedWinProb: calibratedProb,
      confidenceCalibrated: confidence,
      recommendedAction: action,
      actionReason: reason,
      expectedEdge,
      leafPath: result.leafPath,
      featureImportance: model.featureImportance,
      gates,
    } satisfies MLPredictResponse);
  } catch (error: any) {
    console.error(`[ml-predict] Error for ${upperSymbol}:`, error);
    return NextResponse.json(
      { error: error.message ?? 'Internal server error', symbol: upperSymbol },
      { status: 500 },
    );
  }
}
