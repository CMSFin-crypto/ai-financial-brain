import { NextRequest, NextResponse } from 'next/server';
import { runWalkForwardBacktest } from '@/lib/walkforward-backtest';

export const maxDuration = 120;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const ticker = symbol.toUpperCase().trim();

    if (!ticker) {
      return NextResponse.json({ error: 'Simboli është i nevojshëm' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const windowSize = parseInt(searchParams.get('windowSize') || '60');
    const stepSize = parseInt(searchParams.get('stepSize') || '5');
    const commissionPct = parseFloat(searchParams.get('commission') || '0.1');
    const slippagePct = parseFloat(searchParams.get('slippage') || '0.05');

    console.log(`[AI-BACKTEST] Starting walk-forward backtest for ${ticker}...`);

    const result = await runWalkForwardBacktest(ticker, {
      windowSize,
      stepSize,
      commissionPct,
      slippagePct,
    });

    return NextResponse.json({
      ticker,
      summary: {
        totalReturnPct: result.totalReturnPct,
        benchmarkReturnPct: result.benchmarkReturnPct,
        alphaPct: Math.round((result.totalReturnPct - result.benchmarkReturnPct) * 100) / 100,
        maxDrawdownPct: result.maxDrawdownPct,
        winRate: result.winRate,
        sharpeRatio: result.sharpeRatio,
        tradeCount: result.tradeCount,
        noTradeCount: result.noTradeCount,
        avgReturnPerTrade: result.avgReturnPerTrade,
        totalCostsPct: result.totalCostsPct,
      },
      trades: result.trades.slice(-30),
      allTradeCount: result.trades.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[AI-BACKTEST] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
