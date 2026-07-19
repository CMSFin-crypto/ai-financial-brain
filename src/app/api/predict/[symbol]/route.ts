import { NextRequest, NextResponse } from 'next/server';
import { fetchHistoricalData } from '@/lib/alpha-vantage';
import { predictStock } from '@/lib/prediction-engine';

export const maxDuration = 60;

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
    const range = searchParams.get('range') || '1y';

    const historicalData = await fetchHistoricalData(ticker, range);

    if (!historicalData || historicalData.length < 60) {
      return NextResponse.json(
        { error: 'Të dhëna të pamjaftueshme historike për predikim' },
        { status: 404 }
      );
    }

    const result = predictStock(ticker, historicalData);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[PREDICT] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}