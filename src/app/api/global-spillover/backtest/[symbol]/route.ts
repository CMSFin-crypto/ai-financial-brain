// ============================================================
// GET /api/global-spillover/backtest/[symbol]
// Run backtest: ?mode=v1_only|v2_only|v1_plus_v2
//   &hold=3 &range=1y
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { runSpilloverBacktest, runMultiTickerBacktest, type BacktestMode } from '@/lib/spillover-backtest';

export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const startTime = Date.now();
  try {
    const { symbol } = await params;
    const ticker = symbol.toUpperCase();

    const { searchParams } = new URL(request.url);
    const mode = (searchParams.get('mode') || 'v1_only') as BacktestMode;
    const holdDays = parseInt(searchParams.get('hold') || '3', 10);
    const range = searchParams.get('range') || '1y';
    const multi = searchParams.get('multi') === 'true';

    if (multi) {
      const tickers = ['SMH', 'NVDA', 'AMD', 'MU', 'MRVL'];
      const results = await runMultiTickerBacktest(tickers, mode, holdDays, range);

      const allTrades = results.flatMap(r => r.trades);
      const wins = allTrades.filter(t => t.netReturnPct > 0).length;
      const reliefTrades = allTrades.filter(t => t.setupType === 'RELIEF_RALLY');
      const reliefWins = reliefTrades.filter(t => t.netReturnPct > 0).length;

      return NextResponse.json({
        multi: true, mode,
        tickers: results.map(r => ({
          symbol: r.symbol, tradeCount: r.tradeCount, noTradeCount: r.noTradeCount,
          totalReturnPct: r.totalReturnPct, benchmarkReturnPct: r.benchmarkReturnPct,
          alphaPct: r.alphaPct, winRate: r.winRate, sharpeRatio: r.sharpeRatio,
          maxDrawdownPct: r.maxDrawdownPct, expectancy: r.expectancy,
          brierScore: r.brierScore, walkForwardWindows: r.walkForwardWindows,
          reliefRally: r.reliefRally, continuation: r.continuation,
        })),
        summary: {
          totalTrades: allTrades.length,
          totalNoTrade: results.reduce((s, r) => s + r.noTradeCount, 0),
          overallWinRate: allTrades.length > 0 ? Math.round(wins / allTrades.length * 100) : 0,
          totalNetReturnPct: Math.round(allTrades.reduce((s, t) => s + t.netReturnPct, 0) * 100) / 100,
          reliefRallyWinRate: reliefTrades.length > 0 ? Math.round(reliefWins / reliefTrades.length * 100) : 0,
          reliefRallyCount: reliefTrades.length,
        },
        processingTimeMs: Date.now() - startTime,
      });
    }

    const result = await runSpilloverBacktest(ticker, mode, holdDays, range);
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
