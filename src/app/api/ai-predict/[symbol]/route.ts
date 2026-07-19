import { NextRequest, NextResponse } from 'next/server';
import { fetchHistoricalData, getRealFundamentals } from '@/lib/alpha-vantage';
import { predictHybrid } from '@/lib/hybrid-prediction';

export const maxDuration = 60;

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

    // Fetch historical data (6 months)
    const historicalData = await fetchHistoricalData(ticker, '6mo');
    if (!historicalData || historicalData.length < 60) {
      return NextResponse.json({ error: 'Të dhëna të pamjaftueshme' }, { status: 404 });
    }

    // Fetch fundamentals (with 15s timeout)
    let fundamentals = null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      // We use the cached function — it has its own timeout
      fundamentals = await getRealFundamentals(ticker);
      clearTimeout(timeoutId);
    } catch {
      // Ignore — use technical only
      console.log(`[AI-PREDICT] ${ticker}: Fundamentals unavailable, using technical only`);
    }

    const result = predictHybrid(ticker, historicalData, fundamentals);

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[AI-PREDICT] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}