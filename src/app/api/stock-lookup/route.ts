import { NextRequest, NextResponse } from 'next/server';
import { fetchLivePrices, getStock } from '@/lib/market-data';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker required' }, { status: 400 });
  }

  const upper = ticker.toUpperCase();
  const profile = getStock(upper);
  const livePrices = await fetchLivePrices([upper]);
  const live = livePrices[upper];

  return NextResponse.json({
    ticker: upper,
    company: profile?.company || `${upper} Corp`,
    sector: profile?.sector || 'Unknown',
    price: live?.price || profile?.price || 0,
    change: live?.change || profile?.change || 0,
    isLive: !!live,
    hasProfile: !!profile,
    volume: live?.volume || 0,
    dayHigh: live?.dayHigh || null,
    dayLow: live?.dayLow || null,
    prevClose: live?.prevClose || null,
    timestamp: live?.timestamp || null,
  });
}
