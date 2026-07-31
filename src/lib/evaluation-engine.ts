// ============================================================
// Evaluation Engine — Extended evaluation: AIStats, lessons, weights.
// Basic evaluation (price, return, outcome) is handled by
// evaluate-prediction.ts + evaluate-due-predictions.ts.
// This module handles post-evaluation intelligence.
// ============================================================

import prisma from './prisma';
import { updateWeightsAfterEvaluation } from './model-weights';

const BENCHMARK_TICKER = 'SPY';

/**
 * Refresh AIStats + extract lessons + update weights after evaluation.
 * Called after evaluate-due-predictions has run.
 */
export async function postEvaluationUpdate(): Promise<{
  statsUpdated: boolean;
  weightsUpdated: number;
  lessonsExtracted: number;
}> {
  let statsUpdated = false;
  let weightsUpdated = 0;
  let lessonsExtracted = 0;

  try {
    // 1. Update AIStats
    await updateAIStats();
    statsUpdated = true;

    // 2. Update model weights
    const weightResult = await updateWeightsAfterEvaluation();
    weightsUpdated = weightResult.updated;

    // 3. Extract lessons from recent wrong predictions
    const recentWrong = await prisma.prediction.findMany({
      where: {
        wasCorrect: false,
        evaluatedAt: { not: null },
      },
      orderBy: { evaluatedAt: 'desc' },
      take: 10,
    });

    for (const wp of recentWrong) {
      const existing = await prisma.aILesson.findFirst({
        where: {
          ticker: wp.symbol,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      if (existing) continue;

      const ret = wp.actualReturn ?? 0;
      let category = 'wrong_direction';
      let mistake = '';
      let lesson = '';

      if (ret < -2 && wp.finalDecision === 'BUY') {
        mistake = `Predicted BUY for ${wp.symbol} but got ${ret.toFixed(1)}% (horizon ${wp.horizonDays}d)`;
        lesson = 'Reduce buy confidence when downside risk is elevated';
      } else if (ret > 2 && wp.finalDecision === 'SELL') {
        mistake = `Predicted SELL for ${wp.symbol} but got +${ret.toFixed(1)}% (horizon ${wp.horizonDays}d)`;
        lesson = 'Shorting strong trends is risky';
      } else {
        mistake = `Wrong prediction for ${wp.symbol}: ${wp.finalDecision}, actual ${ret > 0 ? '+' : ''}${ret.toFixed(1)}%`;
        lesson = 'Review factors contributing to this prediction';
      }

      await prisma.aILesson.create({
        data: {
          category,
          ticker: wp.symbol,
          mistake,
          lesson,
          severity: Math.abs(ret) > 3 ? 4 : 2,
        },
      });
      lessonsExtracted++;
    }
  } catch (err) {
    console.error('[EVAL-ENGINE] postEvaluationUpdate failed:', err);
  }

  return { statsUpdated, weightsUpdated, lessonsExtracted };
}

async function updateAIStats(): Promise<void> {
  try {
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

    let stats = await prisma.aIStats.findFirst();
    if (!stats) {
      stats = await prisma.aIStats.create({ data: {} });
    }

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
    console.error('[EVAL-ENGINE] updateAIStats failed:', err);
  }
}

/**
 * @deprecated Use evaluateDuePredictions from evaluate-due-predictions.ts instead.
 * Kept for backward compatibility — calls the new evaluator internally.
 */
export async function evaluateDuePredictions() {
  const { evaluateDuePredictions: evaluateNew } = await import('./evaluate-due-predictions');
  const { fetchHistoricalData } = await import('./alpha-vantage');

  async function getPrice(symbol: string): Promise<number | null> {
    try {
      const data = await fetchHistoricalData(symbol, '5d');
      if (data && data.length > 0) return data[data.length - 1].close;
      return null;
    } catch { return null; }
  }

  const results = await evaluateNew(getPrice, 100);

  // Run post-evaluation intelligence
  await postEvaluationUpdate().catch(err => {
    console.error('[EVAL-ENGINE] post-eval failed:', err);
  });

  return {
    evaluated: results.filter(r => r.status === 'ok').length,
    correct: results.filter(r => r.status === 'ok' && (r.evaluated as any)?.wasCorrect).length,
    wrong: results.filter(r => r.status === 'ok' && !(r.evaluated as any)?.wasCorrect).length,
    details: results.map(r => ({
      ticker: r.symbol,
      status: r.status,
      wasCorrect: r.status === 'ok' ? r.evaluated?.wasCorrect : undefined,
    })),
    weightsUpdated: 0,
  };
}
