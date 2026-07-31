import { NextRequest, NextResponse } from 'next/server';
import { runMonteCarloFromDB, runMonteCarlo, type TradeRecord } from '@/lib/monte-carlo';

/**
 * GET /api/robustness?days=90&simulations=2000
 * Runs Monte Carlo on actual DB trade results.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const days = Number(url.searchParams.get('days') ?? '90');
    const simulations = Number(url.searchParams.get('simulations') ?? '2000');
    const method = (url.searchParams.get('method') ?? 'shuffle') as 'shuffle' | 'bootstrap' | 'parametric';
    const jitter = Number(url.searchParams.get('jitterBps') ?? '3');

    const result = await runMonteCarloFromDB('predict-v3-regime-spillover', days, {
      numSimulations: simulations,
      slippageJitterBps: jitter,
      method,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ROBUSTNESS] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/robustness
 * Runs Monte Carlo on custom trade array (useful for paper-trade results).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { trades, config } = body as {
      trades: TradeRecord[];
      config?: {
        numSimulations?: number;
        startingEquity?: number;
        slippageJitterBps?: number;
        method?: 'shuffle' | 'bootstrap' | 'parametric';
      };
    };

    if (!trades || !Array.isArray(trades) || trades.length < 5) {
      return NextResponse.json(
        { error: 'At least 5 trades required' },
        { status: 400 },
      );
    }

    const result = runMonteCarlo(trades, config);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ROBUSTNESS] POST Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
