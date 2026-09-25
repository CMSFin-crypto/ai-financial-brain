import { NextRequest, NextResponse } from 'next/server';
import { getWhyMoving } from '@/lib/market-map-news';

// "Pse lëviz" — lajmet më të fundit për një ticker të mapës së tregut.
// Përdoret nga popup-i Finviz-style në hover. Cache 5 min brenda lib-it.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get('symbol') || '').trim().toUpperCase();
  if (!/^[A-Z]{1,6}(-[A-Z])?$/.test(symbol)) {
    return NextResponse.json(
      { ok: false, error: 'Simbol i pavlefshëm', symbol, items: [] },
      { status: 400 },
    );
  }
  try {
    const { items, fetchedAt, cached } = await getWhyMoving(symbol, 3);
    return NextResponse.json({
      ok: true,
      symbol,
      items,
      count: items.length,
      fetchedAt,
      cached,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gabim i panjohur';
    console.error(`[API market-map/why ${symbol}]:`, message);
    return NextResponse.json(
      { ok: false, error: `Lajmet s'u ngarkuan: ${message}`, symbol, items: [] },
      { status: 500 },
    );
  }
}
