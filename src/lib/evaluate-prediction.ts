import { prisma } from "@/lib/prisma";

type PriceProvider = (symbol: string) => Promise<number | null>;

function calculateReturnPct(entry: number, current: number) {
  return ((current - entry) / entry) * 100;
}

function inferOutcome(decision: string, actualReturn: number) {
  if (decision === "BUY") {
    const actualOutcome = actualReturn > 0 ? 1 : 0;
    return { actualOutcome, wasCorrect: actualOutcome === 1 };
  }

  if (decision === "SELL") {
    const actualOutcome = actualReturn < 0 ? 1 : 0;
    return { actualOutcome, wasCorrect: actualOutcome === 1 };
  }

  if (decision === "HOLD" || decision === "NO_TRADE") {
    const flat = Math.abs(actualReturn) < 1;
    return { actualOutcome: flat ? 1 : 0, wasCorrect: flat };
  }

  return { actualOutcome: 0, wasCorrect: false };
}

export async function evaluatePredictionById(
  predictionId: string,
  getPrice: PriceProvider
) {
  const prediction = await prisma.prediction.findUnique({
    where: { id: predictionId },
  });

  if (!prediction) throw new Error("Prediction not found");
  if (prediction.evaluationStatus === "EVALUATED") return prediction;

  const actualPrice = await getPrice(prediction.symbol);
  if (actualPrice == null)
    throw new Error(`Missing actual price for ${prediction.symbol}`);

  const benchmarkActualPrice = prediction.benchmarkSymbol
    ? await getPrice(prediction.benchmarkSymbol)
    : null;

  const actualReturn = calculateReturnPct(prediction.entryPrice, actualPrice);

  const benchmarkReturn =
    prediction.benchmarkEntryPrice && benchmarkActualPrice
      ? calculateReturnPct(prediction.benchmarkEntryPrice, benchmarkActualPrice)
      : null;

  const excessReturn =
    benchmarkReturn !== null ? actualReturn - benchmarkReturn : null;

  const { actualOutcome, wasCorrect } = inferOutcome(
    prediction.finalDecision,
    actualReturn
  );

  return prisma.$transaction(async (tx) => {
    const updated = await tx.prediction.update({
      where: { id: predictionId },
      data: {
        actualPrice,
        benchmarkActualPrice,
        actualReturn,
        benchmarkReturn,
        excessReturn,
        actualOutcome,
        wasCorrect,
        evaluationStatus: "EVALUATED",
        evaluatedAt: new Date(),
      },
    });

    await tx.predictionSnapshot.create({
      data: {
        predictionId,
        snapshotType: "EVALUATED",
        price: actualPrice,
        benchmarkPrice: benchmarkActualPrice ?? undefined,
        note: `Outcome evaluated: ${wasCorrect ? "correct" : "incorrect"}`,
      },
    });

    return updated;
  });
}

export async function evaluateDuePredictionsBrier() {
  // TODO: Implement Brier score evaluation pipeline
  return { evaluated: 0, brierScores: [] };
}
