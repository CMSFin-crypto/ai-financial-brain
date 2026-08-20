import { NextRequest, NextResponse } from 'next/server';
import { fetchHistoricalData, getRealFundamentals, getRealPrice } from '@/lib/alpha-vantage';
import { predictHybridV2 } from '@/lib/hybrid-prediction';

export const maxDuration = 120;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const ticker = symbol.toUpperCase().trim();

    if (!ticker) {
      return NextResponse.json({ error: 'Ticker i pavlefshëm' }, { status: 400 });
    }

    const horizonParam = request.nextUrl.searchParams.get('horizon');
    const sectorParam = request.nextUrl.searchParams.get('sector');
    // Default: all 3 horizons. ?horizon=3 → only 3D
    const horizons = horizonParam
      ? [parseInt(horizonParam, 10)].filter(h => [1, 3, 7].includes(h))
      : [1, 3, 7];

    const historicalData = await fetchHistoricalData(ticker, '6mo');
    if (!historicalData || historicalData.length < 60) {
      return NextResponse.json({ error: 'Të dhëna të pamjaftueshme' }, { status: 404 });
    }

    const [priceResult, fundamentals] = await Promise.all([
      getRealPrice(ticker).catch(() => null),
      getRealFundamentals(ticker).catch(() => null),
    ]);

    const currentPrice = priceResult?.price || (historicalData[historicalData.length - 1]?.close ?? 0);

    const result = await predictHybridV2(ticker, historicalData, fundamentals, currentPrice, {
      horizons,
      sector: sectorParam ?? undefined,
      saveToDb: true,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[AI-PREDICT] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
