import { NextRequest, NextResponse } from 'next/server';
import { runValidationLab } from '@/lib/validation/validation-lab';

// Task 27 — IBKR Validation Lab: Backtest + OOS + Walk-Forward + Gates
// Task 28 — Universe 300 default + kalendar earnings EDGAR + testi A/B/C/D
// GET /api/ibkr-backtest?universe=300&years=5&force=1
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const universeSize = parseInt(searchParams.get('universe') || '300', 10);
    const years = parseInt(searchParams.get('years') || '5', 10);
    const force = searchParams.get('force') === '1';

    const report = await runValidationLab({
      universeSize: Number.isFinite(universeSize) ? universeSize : 300,
      years: Number.isFinite(years) ? years : 5,
      force,
    });

    return NextResponse.json(report, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gabim i panjohur';
    console.error('[IBKR-BACKTEST] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
