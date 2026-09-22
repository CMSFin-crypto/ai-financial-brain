import { NextRequest, NextResponse } from 'next/server';
import {
  fetchFinvizChartData,
  isValidFinvizSymbol,
  FINVIZ_RANGES,
  FINVIZ_INTERVALS,
} from '@/lib/finviz-chart';

// GET /api/finviz-chart?symbol=EXPE&range=1y&interval=1d
// Kthen candle-e realë OHLCV + meta (kompani, bursë, çmim live) nga Yahoo Finance.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const symbol = (sp.get('symbol') || '').toUpperCase().trim();
  const range = sp.get('range') || '1y';
  const interval = sp.get('interval') || '1d';

  if (!symbol || !isValidFinvizSymbol(symbol)) {
    return NextResponse.json({ ok: false, error: 'Simbol i pavlefshëm' }, { status: 400 });
  }
  if (!(FINVIZ_RANGES as readonly string[]).includes(range)) {
    return NextResponse.json({ ok: false, error: 'Periudha e pavlefshme' }, { status: 400 });
  }
  if (!(FINVIZ_INTERVALS as readonly string[]).includes(interval)) {
    return NextResponse.json({ ok: false, error: 'Intervali i pavlefshëm' }, { status: 400 });
  }

  const data = await fetchFinvizChartData(symbol, range, interval);
  if (!data) {
    return NextResponse.json(
      {
        ok: false,
        error: `Nuk u gjetën të dhëna për "${symbol}" — kontrollo simbolin (burimi: Yahoo Finance)`,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, ...data });
}
