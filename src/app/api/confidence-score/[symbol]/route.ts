import { NextRequest, NextResponse } from 'next/server';
import { fetchHistoricalData } from '@/lib/alpha-vantage';
import { calculateConfidenceScore } from '@/lib/indicators';

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
    const range = searchParams.get('range') || '6mo';

    // Fetch historical data
    const historicalData = await fetchHistoricalData(ticker, range);

    if (!historicalData || historicalData.length < 30) {
      return NextResponse.json(
        { error: 'Të dhëna të pamjaftueshme historike' },
        { status: 404 }
      );
    }

    // Calculate confidence score
    const result = calculateConfidenceScore(historicalData);

    return NextResponse.json({
      symbol: ticker,
      score: result.score,
      signal: result.signal,
      indicators: result.indicators,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[CONFIDENCE-SCORE] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}