import { NextRequest, NextResponse } from 'next/server';
import { getStock, getAllTickers, fetchLivePrices, getAllStocks, getOrCreateStock } from '@/lib/market-data';

export const maxDuration = 60;

// ETF/Index name mapping for common market tickers
const ETF_NAMES: Record<string, string> = {
  SPY: 'S&P 500 ETF',
  QQQ: 'NASDAQ 100 ETF',
  DIA: 'DOW 30 ETF',
  VIX: 'CBOE VIX Index',
  IWM: 'Russell 2000 ETF',
  XLK: 'Technology Select SPDR',
  SMH: 'Semiconductor ETF',
  XLV: 'Health Care Select SPDR',
  XLF: 'Financial Select SPDR',
  XLE: 'Energy Select SPDR',
  XLI: 'Industrial Select SPDR',
  XLY: 'Consumer Discretionary SPDR',
  XLP: 'Consumer Staples SPDR',
  XLRE: 'Real Estate Select SPDR',
  XLU: 'Utilities Select SPDR',
  XLB: 'Materials Select SPDR',
  ITA: 'Aerospace & Defense ETF',
  BOTZ: 'AI & Robotics ETF',
  KWEB: 'China Tech ETF',
  TLT: 'Treasury Bond ETF',
  GLD: 'Gold ETF',
  SLV: 'Silver ETF',
  USO: 'Oil ETF',
  QQQM: 'NASDAQ 100 ETF Mini',
  VOO: 'S&P 500 ETF Vanguard',
  IVV: 'iShares Core S&P 500',
  ONEQ: 'NASDAQ Index ETF',
};

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
    const stocks = await Promise.all(tickers.map(async (ticker) => {
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

      // For ETFs/indices not in the hardcoded database, use live data directly
      if (live && live.price > 0) {
        return {
          ticker,
          company: ETF_NAMES[ticker] || `${ticker} ETF`,
          sector: 'ETF',
          price: live.price,
          change: live.change,
          volume: 'N/A',
          marketCap: 'N/A',
          signal: live.change >= 0.5 ? 'BULLISH' : live.change <= -0.5 ? 'BEARISH' : 'NEUTRAL',
          trend: live.change >= 0.5 ? 'uptrend' : live.change <= -0.5 ? 'downtrend' : 'sideways',
          rating: live.change >= 1 ? 'BUY' : live.change <= -1 ? 'SELL' : 'HOLD',
          isLive: true,
        };
      }

      // Last resort: try getOrCreateStock (fetches from Yahoo Finance dynamically)
      try {
        const dynamic = await getOrCreateStock(ticker);
        if (dynamic) {
          return {
            ticker: dynamic.ticker,
            company: dynamic.company,
            sector: dynamic.sector,
            price: dynamic.price,
            change: dynamic.change,
            volume: dynamic.volume,
            marketCap: dynamic.marketCap,
            signal: dynamic.signal,
            trend: dynamic.trend,
            rating: dynamic.rating,
            isLive: true,
          };
        }
      } catch {
        // Dynamic lookup failed, skip this ticker
      }

      return null;
    }));

    const filteredStocks = stocks.filter(Boolean);

    const overview = {
      timestamp: new Date().toISOString(),
      totalStocks: filteredStocks.length,
      sectors: ['Technology', 'Semiconductors', 'Healthcare', 'Finance', 'Energy', 'Industry', 'Retail', 'Defense', 'AI'],
    };

    return NextResponse.json({ overview, stocks: filteredStocks });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('Market prices error:', message);
    return NextResponse.json({ error: 'Çmimet e tregut nuk u gjetën. Provo përsëri.' }, { status: 500 });
  }
}
