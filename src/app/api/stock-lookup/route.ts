import { NextRequest, NextResponse } from 'next/server';
import { fetchLivePrices, getOrCreateStock } from '@/lib/market-data';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker required' }, { status: 400 });
  }

  const upper = ticker.toUpperCase();

  // Try to get stock profile (from database OR dynamically created)
  const [profile, livePrices] = await Promise.all([
    getOrCreateStock(upper),
    fetchLivePrices([upper]),
  ]);

  const live = livePrices[upper];
  const price = live?.price || profile?.price || 0;

  return NextResponse.json({
    ticker: upper,
    company: profile?.company || `${upper} Corp`,
    sector: profile?.sector || 'Technology',
    industry: profile?.industry || 'General',
    price,
    change: live?.change ?? profile?.change ?? 0,
    isLive: !!live,
    hasProfile: !!profile,
    isDynamic: !!profile && !getStaticStock(upper),
    volume: live?.volume || 0,
    timestamp: live?.timestamp || null,
    signal: profile?.signal || 'NEUTRAL',
    trend: profile?.trend || 'sideways',
    rating: profile?.rating || 'HOLD',
    strengths: profile?.strengths || [],
    weaknesses: profile?.weaknesses || [],
    position: profile?.position || '',
  });
}

function getStaticStock(ticker: string) {
  const { getStock } = require('@/lib/market-data');
  return getStock(ticker);
}
