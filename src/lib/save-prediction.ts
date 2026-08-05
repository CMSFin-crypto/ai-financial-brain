// ============================================================
// Save Prediction — atomic persistence with full snapshots.
//
// Every prediction saves:
//   1. Prediction row (score, decision, confidence)
//   2. PredictionFactor[] (every factor with score/weight/signal)
//   3. PredictionSnapshot (CREATED snapshot)
//   4. MarketSnapshot (regime, VIX, SPY, breadth at prediction time)
//   5. FeatureSnapshot (full feature vector for meta-model training)
//   6. SpilloverSignal (cross-market spillover context)
//   7. EventSnapshot[] (earnings, Fed, CPI events)
//
// Uses Prisma transaction for atomicity.
// ============================================================

import { prisma } from "@/lib/prisma";

export type FactorInput = {
  factorName: string;
  factorType: string;
  score: number;
  weight: number;
  signal?: string;
  description?: string;
};

export type MarketSnapshotInput = {
  regime: string;
  regimeConfidence: number;
  spyPrice: number;
  spyChange5d?: number;
  spyChange20d?: number;
  vixLevel?: number;
  marketBreadth?: number;
  sectorAvg?: number;
};

export type FeatureSnapshotInput = {
  featureVector: Record<string, number>;
  featureVersion: string;
  schemaHash: string;
};

export type EventSnapshotInput = {
  eventType: string;
  eventDate?: Date;
  daysUntil?: number;
  severity: string;
  description?: string;
};

export type SpilloverSignalInput = {
  setupType: string;
  spilloverScore: number;
  confidence: number;
  asiaConsensus: number;
  riskAlignment: number;
  vixDirection: string;
  sectorTrend: string;
  asiaAligned: boolean;
  targetSymbol: string;
  targetSector?: string;
  reasons?: string[];
};

export type SavePredictionInput = {
  symbol: string;
  sector?: string;
  horizonDays?: number;
  modelVersion: string;
  entryPrice: number;
  benchmarkSymbol?: string;
  benchmarkEntryPrice?: number;
  regime?: string;
  regimeConfidence?: number;
  transitionRisk?: number;
  rawScore: number;
  calibratedConfidence: number;
  finalDecision: "BUY" | "SELL" | "HOLD" | "NO_TRADE";
  factors: FactorInput[];
  // Snapshots for full audit trail
  marketSnapshot?: MarketSnapshotInput;
  featureSnapshot?: FeatureSnapshotInput;
  eventSnapshots?: EventSnapshotInput[];
  spilloverSignal?: SpilloverSignalInput;
  // Attribution: why this decision was made
  decisionReasons?: string[];
};

export type SavedPrediction = {
  id: string;
  symbol: string;
  horizonDays: number;
  finalDecision: string;
  rawScore: number;
  calibratedConfidence: number;
  factorCount: number;
  hasMarketSnapshot: boolean;
  hasFeatureSnapshot: boolean;
  hasEventSnapshots: boolean;
  hasSpilloverSignal: boolean;
};

/**
 * Save a prediction with all snapshots in a single transaction.
 * If any part fails, the entire operation rolls back.
 */
export async function savePrediction(input: SavePredictionInput): Promise<SavedPrediction> {
  const horizonDays = input.horizonDays ?? 1;
  const dueAt = new Date(Date.now() + horizonDays * 24 * 60 * 60 * 1000);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create Prediction + Factors + PredictionSnapshot
    const prediction = await tx.prediction.create({
      data: {
        symbol: input.symbol,
        sector: input.sector,
        horizonDays,
        dueAt,
        modelVersion: input.modelVersion,
        entryPrice: input.entryPrice,
        benchmarkSymbol: input.benchmarkSymbol ?? "SPY",
        benchmarkEntryPrice: input.benchmarkEntryPrice,
        regime: input.regime,
        regimeConfidence: input.regimeConfidence,
        transitionRisk: input.transitionRisk,
        rawScore: input.rawScore,
        calibratedConfidence: input.calibratedConfidence,
        finalDecision: input.finalDecision,
        factors: {
          createMany: {
            data: input.factors.map((f) => ({
              factorName: f.factorName,
              factorType: f.factorType,
              score: f.score,
              weight: f.weight,
              signal: f.signal,
              description: f.description,
            })),
          },
        },
        snapshots: {
          create: {
            snapshotType: "CREATED",
            price: input.entryPrice,
            benchmarkPrice: input.benchmarkEntryPrice,
            regime: input.regime,
            regimeConfidence: input.regimeConfidence,
            transitionRisk: input.transitionRisk,
            note: input.decisionReasons?.join("; ") ?? "Prediction created",
          },
        },
      },
      include: { factors: true, snapshots: true },
    });

    // 2. Create MarketSnapshot
    if (input.marketSnapshot) {
      const ms = input.marketSnapshot;
      await tx.marketSnapshot.create({
        data: {
          predictionId: prediction.id,
          regime: ms.regime,
          regimeConfidence: ms.regimeConfidence,
          spyPrice: ms.spyPrice,
          spyChange5d: ms.spyChange5d,
          spyChange20d: ms.spyChange20d,
          vixLevel: ms.vixLevel,
          marketBreadth: ms.marketBreadth,
          sectorAvg: ms.sectorAvg,
        },
      });
    }

    // 3. Create FeatureSnapshot
    if (input.featureSnapshot) {
      const fs = input.featureSnapshot;
      const today = new Date().toISOString().split("T")[0];
      await tx.featureSnapshot.upsert({
        where: {
          version_symbol_date: {
            version: fs.featureVersion,
            symbol: input.symbol,
            date: new Date(today),
          },
        },
        create: {
          version: fs.featureVersion,
          symbol: input.symbol,
          date: new Date(today),
          snapshot: fs.featureVector as any,
          schemaHash: fs.schemaHash,
          featureCount: Object.keys(fs.featureVector).length,
        },
        update: {
          snapshot: fs.featureVector as any,
          schemaHash: fs.schemaHash,
          featureCount: Object.keys(fs.featureVector).length,
        },
      });
    }

    // 4. Create EventSnapshots
    if (input.eventSnapshots && input.eventSnapshots.length > 0) {
      await tx.eventSnapshot.createMany({
        data: input.eventSnapshots.map((e) => ({
          ticker: input.symbol,
          eventType: e.eventType,
          eventDate: e.eventDate,
          daysUntil: e.daysUntil,
          severity: e.severity,
          description: e.description ?? "",
        })),
      });
    }

    // 5. Create SpilloverSignal
    if (input.spilloverSignal) {
      const ss = input.spilloverSignal;
      await tx.spilloverSignal.create({
        data: {
          date: new Date(),
          targetSymbol: ss.targetSymbol,
          targetSector: ss.targetSector,
          setupType: ss.setupType,
          spilloverScore: ss.spilloverScore,
          confidence: ss.confidence,
          modelVersion: 'spillover-prediction-pipeline',
          reasons: ss.reasons ?? [],
          predictionId: prediction.id,
          asiaConsensus: ss.asiaConsensus,
          riskAlignment: ss.riskAlignment,
          vixDirection: ss.vixDirection,
          sectorTrend: ss.sectorTrend,
          asiaAligned: ss.asiaAligned,
        },
      });
    }

    return prediction;
  });

  return {
    id: result.id,
    symbol: result.symbol,
    horizonDays: result.horizonDays,
    finalDecision: result.finalDecision,
    rawScore: result.rawScore,
    calibratedConfidence: result.calibratedConfidence,
    factorCount: result.factors.length,
    hasMarketSnapshot: !!input.marketSnapshot,
    hasFeatureSnapshot: !!input.featureSnapshot,
    hasEventSnapshots: (input.eventSnapshots?.length ?? 0) > 0,
    hasSpilloverSignal: !!input.spilloverSignal,
  };
}
