// ============================================================
// GET /api/regime/backtest
// Per-regime performance breakdown from historical predictions.
// Shows win rate, avg return, NO_TRADE count per regime state.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getRegimeAccuracyStats, getRegimeHistory } from '@/lib/regime-intelligence';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const includeHistory = searchParams.get('history');

    // Get per-regime accuracy stats from DB
    const accuracyStats = await getRegimeAccuracyStats();

    // Get regime distribution
    const historyDays = includeHistory ? parseInt(includeHistory, 10) || 90 : 90;
    const history = await getRegimeHistory(historyDays);

    // Compute regime distribution
    const distribution: Record<string, { count: number; pct: number }> = {};
    for (const h of history) {
      if (!distribution[h.regimeState]) distribution[h.regimeState] = { count: 0, pct: 0 };
      distribution[h.regimeState].count++;
    }
    const total = history.length || 1;
    for (const d of Object.values(distribution)) {
      d.pct = Math.round((d.count / total) * 1000) / 10;
    }

    // Regime transition tracking
    let transitions = 0;
    for (let i = 0; i < history.length - 1; i++) {
      if (history[i].regimeState !== history[i + 1].regimeState) transitions++;
    }
    const avgDaysInRegime = history.length > 1 ? Math.round(history.length / (transitions || 1) * 10) / 10 : 0;

    // Summary metrics
    let totalPredictions = 0;
    let totalCorrect = 0;
    let totalNoTrade = 0;
    let totalAvgReturn = 0;

    for (const stats of Object.values(accuracyStats)) {
      totalPredictions += stats.total;
      totalCorrect += stats.correct;
      totalNoTrade += stats.noTradeCount;
      totalAvgReturn += stats.avgReturn * stats.total;
    }
    const overallWinRate = totalPredictions > 0 ? Math.round((totalCorrect / totalPredictions) * 1000) / 10 : 0;
    const overallAvgReturn = totalPredictions > 0 ? Math.round((totalAvgReturn / totalPredictions) * 100) / 100 : 0;

    return NextResponse.json({
      summary: {
        totalPredictions,
        overallWinRate,
        overallAvgReturn,
        totalNoTrade,
        noTradePct: totalPredictions > 0 ? Math.round((totalNoTrade / totalPredictions) * 1000) / 10 : 0,
        daysAnalyzed: historyDays,
        regimeTransitions: transitions,
        avgDaysPerRegime: avgDaysInRegime,
      },
      distribution,
      perRegime: accuracyStats,
      history: history.slice(0, 60),
      processingTimeMs: Date.now() - startTime,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[REGIME-BACKTEST] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
