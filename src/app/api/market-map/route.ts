import { NextRequest, NextResponse } from 'next/server';
import { getMarketMapData } from '@/lib/market-map';

// Map e Tregut (Finviz-style) — të dhëna live nga Yahoo v7 quote.
// Cache 60s brenda lib-it; route-i vetëm proxy.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const force = req.nextUrl.searchParams.get('refresh') === '1';
    const { stocks, fetchedAt, cached } = await getMarketMapData(force);

    if (stocks.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Nuk morën dot të dhëna nga Yahoo — provo përsëri pas një momenti.',
          stocks: [],
          count: 0,
          fetchedAt,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      stocks,
      count: stocks.length,
      fetchedAt,
      cached,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gabim i panjohur';
    console.error('[API market-map]:', message);
    return NextResponse.json(
      { ok: false, error: `Gabim i brendshëm: ${message}`, stocks: [], count: 0 },
      { status: 500 },
    );
  }
}
