import { NextRequest, NextResponse } from 'next/server';
import { runValidationLab } from '@/lib/validation/validation-lab';

// Task 27 — IBKR Validation Lab: Backtest + OOS + Walk-Forward + Gates
// Task 28 — Universe 300 default + kalendar earnings EDGAR + testi A/B/C/D
// Task 29 — Verifikimi me universin 400: years=10, WF kalendarike 5 dritare,
//           krahasimi 120 vs 400, paper me event real, verdikti APPROVE/HOLD/REJECT
// GET /api/ibkr-backtest?universe=400&years=10&force=1
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const universeSize = parseInt(searchParams.get('universe') || '400', 10);
    const years = parseInt(searchParams.get('years') || '10', 10);
    const force = searchParams.get('force') === '1';

    const report = await runValidationLab({
      universeSize: Number.isFinite(universeSize) ? universeSize : 400,
      years: Number.isFinite(years) ? years : 10,
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
