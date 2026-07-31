import { prisma } from "@/lib/prisma";

export type FactorInput = {
  factorName: string;
  factorType: string;
  score: number;
  weight: number;
  signal?: string;
  description?: string;
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
};

export async function savePrediction(input: SavePredictionInput) {
  const horizonDays = input.horizonDays ?? 1;
  const dueAt = new Date(Date.now() + horizonDays * 24 * 60 * 60 * 1000);

  return prisma.prediction.create({
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
          note: "Prediction created",
        },
      },
    },
    include: {
      factors: true,
      snapshots: true,
    },
  });
}
