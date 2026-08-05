// ============================================================
// Evaluation Engine — Post-evaluation intelligence.
//
// After evaluate-due-predictions fills outcomes, this module:
//   1. Updates AIStats (per-horizon accuracy, streaks)
//   2. Extracts AILessons with spillover/regime/event attribution
//   3. Updates ModelWeight for ALL 5 factor types
//   4. Computes per-factor attribution: which factors were right/wrong
// ============================================================

import prisma from './prisma';
import { updateWeightsAfterEvaluation } from './model-weights';

const BENCHMARK_TICKER = 'SPY';

export async function postEvaluationUpdate(): Promise<{
  statsUpdated: boolean;
  weightsUpdated: number;
  lessonsExtracted: number;
  attributionStats: { factorType: string; total: number; sameSidePct: number }[];
}> {
  let statsUpdated = false;
  let weightsUpdated = 0;
  let lessonsExtracted = 0;
  let attributionStats: { factorType: string; total: number; sameSidePct: number }[] = [];

  try {
    // 1. Update AIStats
    await updateAIStats();
    statsUpdated = true;

    // 2. Compute per-factor attribution
    attributionStats = await computeFactorAttribution();

    // 3. Update model weights (now learns from ALL 5 factor types)
    const weightResult = await updateWeightsAfterEvaluation();
    weightsUpdated = weightResult.updated;

    // 4. Extract lessons with rich context
    lessonsExtracted = await extractRichLessons();
  } catch (err) {
    console.error('[EVAL-ENGINE] postEvaluationUpdate failed:', err);
  }

  return { statsUpdated, weightsUpdated, lessonsExtracted, attributionStats };
}

// ─── AIStats ────────────────────────────────────────────────

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

// ─── Factor attribution ────────────────────────────────────

async function computeFactorAttribution(): Promise<{ factorType: string; total: number; sameSidePct: number }[]> {
  try {
    const recent = await prisma.prediction.findMany({
      where: { wasCorrect: { not: null }, evaluatedAt: { not: null } },
      include: { factors: true },
      orderBy: { evaluatedAt: 'desc' },
      take: 500,
    });

    const byType: Record<string, { sameSide: number; total: number }> = {};

    for (const pred of recent) {
      const ret = pred.actualReturn ?? 0;
      const actualUp = ret > 0.1;
      const actualDown = ret < -0.1;

      for (const f of pred.factors) {
        if (!byType[f.factorType]) byType[f.factorType] = { sameSide: 0, total: 0 };
        byType[f.factorType].total++;
        const factorBullish = f.score > 0;
        if ((factorBullish && actualUp) || (!factorBullish && actualDown)) {
          byType[f.factorType].sameSide++;
        }
      }
    }

    return Object.entries(byType).map(([type, t]) => ({
      factorType: type,
      total: t.total,
      sameSidePct: t.total > 0 ? Math.round((t.sameSide / t.total) * 100) : 0,
    }));
  } catch (err) {
    console.error('[EVAL-ENGINE] computeFactorAttribution failed:', err);
    return [];
  }
}

// ─── Rich lesson extraction ─────────────────────────────────

async function extractRichLessons(): Promise<number> {
  let count = 0;

  try {
    const recentWrong = await prisma.prediction.findMany({
      where: { wasCorrect: false, evaluatedAt: { not: null } },
      include: { factors: true, marketSnapshots: true },
      orderBy: { evaluatedAt: 'desc' },
      take: 20,
    });

    for (const wp of recentWrong) {
      // Dedup: one lesson per symbol per day
      const existing = await prisma.aILesson.findFirst({
        where: { ticker: wp.symbol, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      });
      if (existing) continue;

      const ret = wp.actualReturn ?? 0;
      const regime = wp.regime ?? 'UNKNOWN';
      const market = wp.marketSnapshots[0];

      // Identify which factors were wrong
      const wrongFactors = wp.factors.filter(f => {
        const factorBullish = f.score > 0;
        const actualDown = ret < -0.1;
        const actualUp = ret > 0.1;
        return (factorBullish && actualDown) || (!factorBullish && actualUp);
      });
      const worstFactor = wrongFactors.sort((a, b) => Math.abs(b.score) - Math.abs(a.score))[0];

      // Build rich lesson with attribution
      let category = 'wrong_direction';
      let mistake = `Predicted ${wp.finalDecision} for ${wp.symbol} (${wp.horizonDays}d), got ${ret > 0 ? '+' : ''}${ret.toFixed(1)}%`;
      let lesson = '';
      let severity = Math.abs(ret) > 3 ? 4 : Math.abs(ret) > 1.5 ? 3 : 2;

      // Attribution: what caused the error?
      const spilloverFactor = wrongFactors.find(f => f.factorType === 'spillover' || f.factorType === 'macro_global');
      const eventFactor = wrongFactors.find(f => f.factorType === 'event');
      const regimeFactor = wrongFactors.find(f => f.factorType === 'regime');

      if (regimeFactor && (regime.includes('BEAR') || regime.includes('PANIC'))) {
        category = 'regime_mismatch';
        lesson = `Regime was ${regime} but model predicted ${wp.finalDecision} — regime filter should have blocked or reduced`;
        severity = Math.min(5, severity + 1);
      } else if (spilloverFactor) {
        category = 'spillover_miss';
        lesson = `Global spillover signal (${spilloverFactor.factorName}=${spilloverFactor.score}) was misleading for ${wp.symbol}`;
      } else if (eventFactor) {
        category = 'event_surprise';
        lesson = `Event risk (${eventFactor.factorName}) contributed to wrong ${wp.finalDecision} for ${wp.symbol}`;
      } else if (worstFactor) {
        category = worstFactor.factorType === 'technical' ? 'technical_miss' : 'fundamental_miss';
        lesson = `${worstFactor.factorName} scored ${worstFactor.score.toFixed(1)} but actual move was ${ret > 0 ? '+' : ''}${ret.toFixed(1)}%`;
      }

      if (!lesson) lesson = 'Review factors contributing to this prediction';

      await prisma.aILesson.create({
        data: { category, ticker: wp.symbol, sector: wp.sector ?? undefined, mistake, lesson, severity },
      });
      count++;
    }
  } catch (err) {
    console.error('[EVAL-ENGINE] extractRichLessons failed:', err);
  }

  return count;
}

// ─── Legacy entry point (backward compat) ──────────────────

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
  await postEvaluationUpdate().catch(err => {
    console.error('[EVAL-ENGINE] post-eval failed:', err);
  });

  const ok = results.filter(r => r.status === 'ok');
  return {
    evaluated: ok.length,
    correct: ok.filter(r => (r.evaluated as any)?.wasCorrect).length,
    wrong: ok.filter(r => !(r.evaluated as any)?.wasCorrect).length,
    details: results.map(r => ({
      ticker: r.symbol,
      status: r.status,
      wasCorrect: r.status === 'ok' ? (r.evaluated as any)?.wasCorrect : undefined,
    })),
    weightsUpdated: 0,
  };
}
