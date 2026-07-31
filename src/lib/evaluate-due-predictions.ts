import { prisma } from "@/lib/prisma";
import { evaluatePredictionById } from "@/lib/evaluate-prediction";

type PriceProvider = (symbol: string) => Promise<number | null>;

export async function evaluateDuePredictions(
  getPrice: PriceProvider,
  limit = 100
) {
  const due = await prisma.prediction.findMany({
    where: {
      evaluationStatus: "PENDING",
      dueAt: { lte: new Date() },
    },
    orderBy: { dueAt: "asc" },
    take: limit,
  });

  const results: { id: string; status: string; symbol: string; evaluated?: any; error?: string }[] = [];
  for (const row of due) {
    try {
      const evaluated = await evaluatePredictionById(row.id, getPrice);
      results.push({ id: row.id, status: "ok", symbol: row.symbol, evaluated });
    } catch (error) {
      results.push({
        id: row.id,
        status: "error",
        symbol: row.symbol,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}
