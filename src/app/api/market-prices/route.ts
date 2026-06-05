import { NextRequest, NextResponse } from 'next/server';
import { getStock, getAllTickers, fetchLivePrices, getAllStocks } from '@/lib/market-data';

export const maxDuration = 60;

// GET /api/market-prices — fetches live prices with fallback to centralized data
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('tickers');
    const sector = searchParams.get('sector');

    let tickers: string[] = [];

    if (tickersParam) {
      tickers = tickersParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
    } else if (sector) {
      // Get all tickers in a sector
      const allStocks = getAllStocks();
      tickers = Object.values(allStocks)
        .filter(s => s.sector === sector)
        .map(s => s.ticker);
    } else {
      // Return all tickers
      tickers = getAllTickers();
    }

    // Try to fetch live prices from Finance API
    const livePrices = await fetchLivePrices(tickers);

    // Build response with full stock data + live prices
    const stocks = tickers.map(ticker => {
      const profile = getStock(ticker);
      const live = livePrices[ticker];

      if (profile) {
        return {
          ticker: profile.ticker,
          company: profile.company,
          sector: profile.sector,
          price: live?.price ?? profile.price,
          change: live?.change ?? profile.change,
          volume: profile.volume,
          marketCap: profile.marketCap,
          signal: profile.signal,
          trend: profile.trend,
          rating: profile.rating,
          isLive: !!live && live.price !== profile.price,
        };
      }
      return null;
    }).filter(Boolean);

    const overview = {
      timestamp: new Date().toISOString(),
      totalStocks: stocks.length,
      sectors: ['Technology', 'Healthcare', 'Finance', 'Energy', 'Consumer Discretionary'],
    };

    return NextResponse.json({ overview, stocks });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('Market prices error:', message);
    return NextResponse.json({ error: 'Çmimet e tregut nuk u gjetën. Provo përsëri.' }, { status: 500 });
  }
}
