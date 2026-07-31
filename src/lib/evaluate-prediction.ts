// ============================================================
// Evaluate Prediction — Single-prediction evaluator with Brier outcome
// Computes actualOutcome (binary 0/1) for Brier score calibration.
// Unlike evaluation-engine.ts (batch evaluator), this is for
// individual prediction evaluation and can be called by cron.
// ============================================================

import prisma from './prisma';
import { fetchHistoricalData } from './alpha-vantage';

const BENCHMARK_TICKER = 'SPY';

type MarketPriceProvider = (symbol: string) => Promise<number | null>;

/**
 * Infer binary outcome for Brier score.
 * - BUY/UP prediction: outcome=1 if return > 0, else 0
 * - SELL/DOWN prediction: outcome=1 if return < 0, else 0
 * - HOLD/SIDEWAYS/NO_TRADE: outcome=0 (not a directional bet)
 */
function inferOutcome(
  predictedDir: string,
  actualReturnPct: number,
): { actualOutcome: number; wasCorrect: boolean } {
  if (predictedDir === 'SIDEWAYS') {
    return { actualOutcome: 0, wasCorrect: Math.abs(actualReturnPct) < 1.0 };
  }

  if (predictedDir === 'UP') {
    const outcome = actualReturnPct > 0.1 ? 1 : 0;
    return { actualOutcome: outcome, wasCorrect: outcome === 1 };
  }

  if (predictedDir === 'DOWN') {
    const outcome = actualReturnPct < -0.1 ? 1 : 0;
    return { actualOutcome: outcome, wasCorrect: outcome === 1 };
  }

  return { actualOutcome: 0, wasCorrect: false };
}

/**
 * Evaluate a single prediction by ID.
 * Fetches current price, computes return, sets actualOutcome for Brier.
 */
export async function evaluatePredictionById(
  predictionId: string,
  getCurrentPrice?: MarketPriceProvider,
) {
  const prediction = await prisma.prediction.findUnique({
    where: { id: predictionId },
  });

  if (!prediction) throw new Error('Prediction not found');
  if (prediction.actualPrice !== null && prediction.actualOutcome !== null) {
    return prediction; // Already evaluated
  }

  // Get current price — use provided provider or fetch directly
  let currentPrice: number | null = null;
  if (getCurrentPrice) {
    currentPrice = await getCurrentPrice(prediction.ticker);
  } else {
    const data = await fetchHistoricalData(prediction.ticker, '5d');
    if (data && data.length > 0) {
      currentPrice = data[data.length - 1].close;
    }
  }

  if (currentPrice == null || currentPrice <= 0) {
    throw new Error(`Current price unavailable for ${prediction.ticker}`);
  }

  // Compute return using the real entryPrice stored at prediction time
  const returnPct = ((currentPrice - prediction.entryPrice) / prediction.entryPrice) * 100;

  // Compute benchmark return
  let benchmarkReturnPct: number | null = null;
  try {
    const benchData = await fetchHistoricalData(BENCHMARK_TICKER, '1mo');
    if (benchData && benchData.length > 0) {
      const benchEnd = benchData[benchData.length - 1].close;
      // Use prediction creation date as start
      const predDate = new Date(prediction.createdAt);
      let benchStart = benchData[0]?.close ?? 0;
      for (const bd of benchData) {
        if (new Date(bd.date) <= predDate) benchStart = bd.close;
      }
      if (benchStart > 0) {
        benchmarkReturnPct = ((benchEnd - benchStart) / benchStart) * 100;
      }
    }
  } catch (e) {
    console.error('[EVAL-PRED] Benchmark fetch failed:', e);
  }

  // Determine correctness + binary outcome
  const THRESHOLD = 0.1; // 0.1% dead zone
  let wasCorrect: boolean;
  if (prediction.predictedDir === 'UP') wasCorrect = returnPct > THRESHOLD;
  else if (prediction.predictedDir === 'DOWN') wasCorrect = returnPct < -THRESHOLD;
  else if (prediction.predictedDir === 'SIDEWAYS') wasCorrect = Math.abs(returnPct) < 1.0;
  else wasCorrect = false;

  const { actualOutcome } = inferOutcome(prediction.predictedDir, returnPct);

  return prisma.prediction.update({
    where: { id: predictionId },
    data: {
      actualPrice: currentPrice,
      returnPct: Math.round(returnPct * 100) / 100,
      benchmarkReturnPct: benchmarkReturnPct !== null
        ? Math.round(benchmarkReturnPct * 100) / 100 : null,
      actualOutcome,
      wasCorrect,
      evaluatedAt: new Date(),
    },
  });
}

/**
 * Evaluate all due predictions (dueAt <= now, not yet evaluated).
 * This is the cron-friendly batch evaluator.
 * Returns count of evaluated predictions.
 */
export async function evaluateDuePredictionsBrier(): Promise<{
  evaluated: number;
  correct: number;
  wrong: number;
}> {
  const now = new Date();

  const duePredictions = await prisma.prediction.findMany({
    where: {
      dueAt: { lte: now },
      actualPrice: null,
      actualOutcome: null,
    },
    orderBy: { dueAt: 'asc' },
    take: 100,
  });

  let evaluated = 0;
  let correct = 0;
  let wrong = 0;

  for (const pred of duePredictions) {
    try {
      const result = await evaluatePredictionById(pred.id);
      evaluated++;
      if (result.wasCorrect) correct++;
      else wrong++;
    } catch (err) {
      console.error(`[EVAL-BRIER] Failed to evaluate ${pred.id}:`, err);
    }
  }

  return { evaluated, correct, wrong };
}
