// ============================================================
// Save Prediction — Brier-calibration-ready persistence layer
// Wraps the existing savePredictionToDB but adds transitionRisk
// and returns the full prediction record for downstream use.
// ============================================================

import prisma from './prisma';
import type { FactorInput } from './prediction-factors';
import { savePredictionFactors } from './prediction-factors';

export type SavePredictionInput = {
  ticker: string;
  sector?: string;
  horizonDays: number;
  modelVersion: string;
  regime?: string;
  regimeConfidence?: number;
  transitionRisk?: number;
  rawScore: number;
  calibratedConfidence: number;
  finalDecision: 'TRADE' | 'NO_TRADE';
  signal: string;
  combinedScore: number;
  technicalScore: number;
  fundamentalScore: number;
  regimeScore: number;
  eventRiskScore: number;
  predictedDir: string;
  predictedMovePct: number;
  entryPrice: number;
  gateStatus: string;
  gateReason?: string;
  noTradeReason?: string;
  regimePolicy?: Record<string, unknown>;
  snapshot?: {
    regime: string;
    regimeConfidence: number;
    spyPrice?: number;
    spyChange5d?: number;
    spyChange20d?: number;
    vixLevel?: number;
  };
  factors: FactorInput[];
};

/**
 * Save a prediction with all Brier calibration fields.
 * Returns the prediction ID for downstream tracking.
 */
export async function savePrediction(input: SavePredictionInput): Promise<string | null> {
  try {
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + input.horizonDays);

    const prediction = await prisma.prediction.create({
      data: {
        ticker: input.ticker,
        sector: input.sector || 'UNKNOWN',
        source: 'predict-api',
        modelVersion: input.modelVersion,
        signal: input.signal,
        confidence: Math.round(input.calibratedConfidence),
        combinedScore: input.combinedScore,
        technicalScore: input.technicalScore,
        fundamentalScore: input.fundamentalScore,
        regimeScore: input.regimeScore,
        eventRiskScore: input.eventRiskScore,
        horizonDays: input.horizonDays,
        predictedDir: input.predictedDir,
        predictedMovePct: input.predictedMovePct,
        entryPrice: input.entryPrice,
        dueAt,
        gateStatus: input.gateStatus,
        gateReason: input.gateReason,
        noTradeReason: input.noTradeReason,
        // Regime Intelligence — for per-regime Brier calibration
        regimeState: input.regime,
        regimeConfidence: input.regimeConfidence,
        transitionRisk: input.transitionRisk,
        regimePolicy: input.regimePolicy as any,
      },
    });

    // Save factors
    if (input.factors.length > 0) {
      await savePredictionFactors(prediction.id, input.factors);
    }

    // Save market snapshot
    if (input.snapshot) {
      await prisma.marketSnapshot.create({
        data: {
          predictionId: prediction.id,
          regime: input.snapshot.regime,
          regimeConfidence: input.snapshot.regimeConfidence,
          spyPrice: input.snapshot.spyPrice,
          spyChange5d: input.snapshot.spyChange5d,
          spyChange20d: input.snapshot.spyChange20d,
          vixLevel: input.snapshot.vixLevel,
        },
      });
    }

    return prediction.id;
  } catch (err) {
    console.error('[SAVE-PRED] savePrediction failed:', err);
    return null;
  }
}

/**
 * Batch save predictions for multiple horizons.
 * Returns array of prediction IDs (null for failures).
 */
export async function savePredictionBatch(
  baseInput: Omit<SavePredictionInput, 'horizonDays' | 'predictedDir' | 'predictedMovePct'>,
  horizons: { horizonDays: number; predictedDir: string; predictedMovePct: number }[],
): Promise<(string | null)[]> {
  return Promise.all(
    horizons.map(h => savePrediction({ ...baseInput, ...h })),
  );
}
