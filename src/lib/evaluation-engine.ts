// ============================================================
// Evaluation Engine — Auto-close predictions at 1/5/20 days
// Compares predicted direction with actual price movement
// ============================================================

import prisma from './prisma';
import { fetchHistoricalData } from './alpha-vantage';
import { updateWeightsAfterEvaluation } from './model-weights';

const BENCHMARK_TICKER = 'SPY';

export interface EvaluationResult {
  evaluated: number;
  correct: number;
  wrong: number;
  details: {
    ticker: string;
    horizonDays: number;
    predictedDir: string;
    actualPrice: number;
    returnPct: number;
    benchmarkReturnPct: number;
    wasCorrect: boolean;
  }[];
  weightsUpdated: number;
}

/**
 * Find and evaluate all due predictions.
 * Called by cron job or manually via /api/ai-learning/evaluate
 */
export async function evaluateDuePredictions(): Promise<EvaluationResult> {
  const result: EvaluationResult = {
    evaluated: 0,
    correct: 0,
    wrong: 0,
    details: [],
    weightsUpdated: 0,
  };

  try {
    const now = new Date();

    // Find predictions that are due but not yet evaluated
    const duePredictions = await prisma.prediction.findMany({
      where: {
        dueAt: { lte: now },
        wasCorrect: null,
        actualPrice: null,
      },
      orderBy: { dueAt: 'asc' },
      take: 100,
    });

    if (duePredictions.length === 0) {
      return result;
    }

    // Batch-fetch current prices + benchmark
    const symbols = [...new Set(duePredictions.map(p => p.ticker))];
    const allSymbols = [...new Set([...symbols, BENCHMARK_TICKER])];
    const priceMap = new Map<string, number>();
    const benchmarkPriceMap = new Map<string, { date: string; close: number }[]>();

    // Fetch benchmark data
    try {
      const benchData = await fetchHistoricalData(BENCHMARK_TICKER, '1mo');
      if (benchData && benchData.length > 0) {
        benchmarkPriceMap.set(BENCHMARK_TICKER, benchData);
      }
    } catch (e) {
      console.error('[EVAL] Failed to fetch benchmark:', e);
    }

    // Fetch current prices for each symbol
    for (const symbol of allSymbols) {
      try {
        const data = await fetchHistoricalData(symbol, '5d');
        if (data && data.length > 0) {
          priceMap.set(symbol, data[data.length - 1].close);
        }
      } catch (e) {
        console.error(`[EVAL] Failed to fetch ${symbol}:`, e);
      }
    }

    // Evaluate each prediction
    for (const pred of duePredictions) {
      const currentPrice = priceMap.get(pred.ticker);
      if (!currentPrice || currentPrice <= 0) continue;

      const returnPct = ((currentPrice - pred.entryPrice) / pred.entryPrice) * 100;

      // Calculate benchmark return for the same period
      const benchData = benchmarkPriceMap.get(BENCHMARK_TICKER);
      let benchmarkReturnPct: number | null = null;
      if (benchData) {
        const predDate = new Date(pred.createdAt);
        // Find closest bench price to prediction date
        let benchStart = benchData[0]?.close ?? 0;
        for (const bd of benchData) {
          if (new Date(bd.date) <= predDate) benchStart = bd.close;
        }
        const benchEnd = benchData[benchData.length - 1].close;
        if (benchStart > 0) {
          benchmarkReturnPct = ((benchEnd - benchStart) / benchStart) * 100;
        }
      }

      // Determine correctness
      const wasCorrect = isPredictionCorrect(
        pred.predictedDir,
        returnPct,
        pred.predictedMovePct,
      );

      // Update prediction in DB
      try {
        await prisma.prediction.update({
          where: { id: pred.id },
          data: {
            actualPrice: currentPrice,
            returnPct: Math.round(returnPct * 100) / 100,
            benchmarkReturnPct: benchmarkReturnPct !== null ? Math.round(benchmarkReturnPct * 100) / 100 : null,
            wasCorrect,
            evaluatedAt: now,
            updatedAt: now,
          },
        });

        result.evaluated++;
        if (wasCorrect) result.correct++;
        else result.wrong++;

        result.details.push({
          ticker: pred.ticker,
          horizonDays: pred.horizonDays,
          predictedDir: pred.predictedDir,
          actualPrice: currentPrice,
          returnPct: Math.round(returnPct * 100) / 100,
          benchmarkReturnPct: benchmarkReturnPct !== null ? Math.round(benchmarkReturnPct * 100) / 100 : 0,
          wasCorrect,
        });
      } catch (e) {
        console.error(`[EVAL] Failed to update prediction ${pred.id}:`, e);
      }
    }

    // Update AIStats
    await updateAIStats(result);

    // Update model weights if we have enough new evaluations
    if (result.evaluated >= 5) {
      const weightUpdate = await updateWeightsAfterEvaluation();
      result.weightsUpdated = weightUpdate.updated;
    }

    // Extract lessons from wrong predictions
    if (result.wrong > 0) {
      await extractLessons(result.details.filter(d => !d.wasCorrect));
    }

  } catch (err) {
    console.error('[EVAL] evaluateDuePredictions failed:', err);
  }

  return result;
}

function isPredictionCorrect(
  predictedDir: string,
  returnPct: number,
  _expectedMovePct: number,
): boolean {
  const THRESHOLD = 0.1; // 0.1% dead zone

  if (predictedDir === 'UP') return returnPct > THRESHOLD;
  if (predictedDir === 'DOWN') return returnPct < -THRESHOLD;
  if (predictedDir === 'SIDEWAYS') return Math.abs(returnPct) < 1.0;
  return false;
}

async function updateAIStats(evalResult: EvaluationResult): Promise<void> {
  try {
    // Get overall stats from all evaluated predictions
    const allEvaluated = await prisma.prediction.findMany({
      where: { wasCorrect: { not: null } },
    });

    const total = allEvaluated.length;
    const correct = allEvaluated.filter(p => p.wasCorrect === true).length;

    const h1 = allEvaluated.filter(p => p.horizonDays === 1);
    const h5 = allEvaluated.filter(p => p.horizonDays === 5);
    const h20 = allEvaluated.filter(p => p.horizonDays === 20);

    const acc1d = h1.length > 0 ? Math.round((h1.filter(p => p.wasCorrect === true).length / h1.length) * 100) : 0;
    const acc5d = h5.length > 0 ? Math.round((h5.filter(p => p.wasCorrect === true).length / h5.length) * 100) : 0;
    const acc20d = h20.length > 0 ? Math.round((h20.filter(p => p.wasCorrect === true).length / h20.length) * 100) : 0;

    // Get or create AIStats row
    let stats = await prisma.aIStats.findFirst();
    if (!stats) {
      stats = await prisma.aIStats.create({ data: {} });
    }

    // Calculate streaks
    const recent20 = allEvaluated.slice(-20);
    let streakCorrect = 0;
    let streakWrong = 0;
    for (const p of [...recent20].reverse()) {
      if (p.wasCorrect === true && streakWrong === 0) streakCorrect++;
      else if (p.wasCorrect === false && streakCorrect === 0) streakWrong++;
      else break;
    }

    await prisma.aIStats.update({
      where: { id: stats.id },
      data: {
        totalPredictions: total,
        correctPredictions: correct,
        avgAccuracy: total > 0 ? Math.round((correct / total) * 100 * 100) / 100 : 0,
        streakCorrect,
        streakWrong,
        accuracy1d: acc1d,
        accuracy5d: acc5d,
        accuracy20d: acc20d,
        updatedAt: new Date(),
      },
    });
  } catch (err) {
    console.error('[EVAL] updateAIStats failed:', err);
  }
}

async function extractLessons(wrongPredictions: EvaluationResult['details']): Promise<void> {
  try {
    for (const wp of wrongPredictions) {
      // Skip if already extracted
      const existing = await prisma.aILesson.findFirst({
        where: { ticker: wp.ticker, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      });
      if (existing) continue;

      let category = 'wrong_direction';
      let mistake = '';
      let lesson = '';

      if (wp.returnPct < -2 && wp.predictedDir === 'UP') {
        category = 'wrong_direction';
        mistake = `Predikoi UP për ${wp.ticker} por u bë -${Math.abs(wp.returnPct).toFixed(1)}% (horizon ${wp.horizonDays}d)`;
        lesson = 'Kur tregu tregon rrezik uljeje, redukto konfidencën e blerjes';
      } else if (wp.returnPct > 2 && wp.predictedDir === 'DOWN') {
        category = 'wrong_direction';
        mistake = `Predikoi DOWN për ${wp.ticker} por u bë +${wp.returnPct.toFixed(1)}% (horizon ${wp.horizonDays}d)`;
        lesson = 'Shitjet kundër trendit të fortë janë të rrezikshme';
      } else {
        mistake = `Predikim i gabuar për ${wp.ticker}: ${wp.predictedDir}, aktualisht ${wp.returnPct > 0 ? '+' : ''}${wp.returnPct.toFixed(1)}%`;
        lesson = 'Rishiko faktorët që kontribuan në këtë predikim';
      }

      await prisma.aILesson.create({
        data: {
          category,
          ticker: wp.ticker,
          mistake,
          lesson,
          severity: Math.abs(wp.returnPct) > 3 ? 4 : 2,
        },
      });
    }
  } catch (err) {
    console.error('[EVAL] extractLessons failed:', err);
  }
}
