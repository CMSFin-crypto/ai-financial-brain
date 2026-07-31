// ============================================================
// GET /api/global-spillover/backtest
// Run 1-year walk-forward backtest of the spillover engine.
// Params:
//   symbol=SMH (default) or NVDA, AMD, MU, etc.
//   hold=3 (days to hold, default 3)
//   range=1y (default)
//   multi=true → run on SMH, NVDA, AMD, MU, MRVL
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { runSpilloverBacktest, runMultiTickerBacktest } from '@/lib/spillover-backtest';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get('symbol') || 'SMH').toUpperCase();
    const holdDays = parseInt(searchParams.get('hold') || '3', 10);
    const range = searchParams.get('range') || '1y';
    const multi = searchParams.get('multi') === 'true';

    if (multi) {
      const tickers = ['SMH', 'NVDA', 'AMD', 'MU', 'MRVL'];
      const results = await runMultiTickerBacktest(tickers, holdDays, range);

      // Summary across all tickers
      const allTrades = results.flatMap(r => r.trades);
      const wins = allTrades.filter(t => t.netReturnPct > 0).length;
      const totalNet = allTrades.reduce((s, t) => s + t.netReturnPct, 0);
      const reliefTrades = allTrades.filter(t => t.setupType === 'RELIEF_RALLY');
      const reliefWins = reliefTrades.filter(t => t.netReturnPct > 0).length;

      return NextResponse.json({
        multi: true,
        tickers: results.map(r => ({
          symbol: r.symbol,
          tradeCount: r.tradeCount,
          noTradeCount: r.noTradeCount,
          totalReturnPct: r.totalReturnPct,
          benchmarkReturnPct: r.benchmarkReturnPct,
          alphaPct: r.alphaPct,
          winRate: r.winRate,
          sharpeRatio: r.sharpeRatio,
          maxDrawdownPct: r.maxDrawdownPct,
          expectancy: r.expectancy,
          reliefRally: r.reliefRally,
          continuation: r.continuation,
        })),
        summary: {
          totalTrades: allTrades.length,
          totalNoTrade: results.reduce((s, r) => s + r.noTradeCount, 0),
          overallWinRate: allTrades.length > 0 ? Math.round(wins / allTrades.length * 100) : 0,
          totalNetReturnPct: Math.round(totalNet * 100) / 100,
          reliefRallyWinRate: reliefTrades.length > 0 ? Math.round(reliefWins / reliefTrades.length * 100) : 0,
          reliefRallyCount: reliefTrades.length,
        },
        processingTimeMs: Date.now() - startTime,
      });
    }

    // Single ticker backtest
    const result = await runSpilloverBacktest(symbol, holdDays, range);

    // Return summary + last 50 trades (full trades array can be huge)
    return NextResponse.json({
      ...result,
      trades: result.trades.slice(-50),
      totalTradesInPeriod: result.trades.length,
      processingTimeMs: Date.now() - startTime,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[SPILLOVER-BT-API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
