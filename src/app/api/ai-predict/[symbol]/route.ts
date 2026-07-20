import { NextRequest, NextResponse } from 'next/server';
import { fetchHistoricalData, getRealFundamentals, getRealPrice } from '@/lib/alpha-vantage';
import { predictHybrid } from '@/lib/hybrid-prediction';
import { forceSave } from '@/lib/indicator-learning';

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

    // Fetch current price and fundamentals in parallel
    const [priceResult, fundamentals] = await Promise.all([
      getRealPrice(ticker).catch(() => null),
      getRealFundamentals(ticker).catch(() => null),
    ]);

    const currentPrice = priceResult?.price || (historicalData[historicalData.length - 1]?.close ?? 0);

    const result = predictHybrid(ticker, historicalData, fundamentals, currentPrice, true);

    // Save learning data
    try {
      forceSave();
    } catch {
      // Non-critical
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[AI-PREDICT] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}