import { NextRequest, NextResponse } from 'next/server';
import { getAllStocks } from '@/lib/market-data';
import { getRealPrices, fetchPreMarketVolumeBatch, isPreMarketHours, type LivePrice, type PreMarketData } from '@/lib/alpha-vantage';

export const maxDuration = 60;

interface ScreenerFilters {
  sector?: string;
  marketCapMin?: string;
  marketCapMax?: string;
  peMin?: number;
  peMax?: number;
  changeMin?: number;
  changeMax?: number;
  volumeMin?: number;
  signal?: string;
  sort?: string;
  limit?: number;
}

function parseMarketCap(marketCapStr: string): number {
  if (!marketCapStr) return 0;
  const str = marketCapStr.replace(/[$,]/g, '').trim();
  if (str.endsWith('T')) return parseFloat(str) * 1e12;
  if (str.endsWith('B')) return parseFloat(str) * 1e9;
  if (str.endsWith('M')) return parseFloat(str) * 1e6;
  return parseFloat(str) || 0;
}

// Derive signal DYNAMICALLY from live change % (not from static data)
function deriveSignal(change: number): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  if (change >= 1.5) return 'BULLISH';
  if (change <= -1.5) return 'BEARISH';
  return 'NEUTRAL';
}

function deriveTrend(change: number): 'uptrend' | 'downtrend' | 'sideways' {
  if (change >= 1.0) return 'uptrend';
  if (change <= -1.0) return 'downtrend';
  return 'sideways';
}

// Derive rating DYNAMICALLY from live change + fundamentals
function deriveRating(change: number, pe: number, revGrowth: number, epsGrowth: number): string {
  // Strong bullish: big gain + good fundamentals
  if (change >= 3 && revGrowth > 15) return 'STRONG_BUY';
  if (change >= 2 && epsGrowth > 10) return 'STRONG_BUY';

  // Strong bearish: big drop
  if (change <= -3) return 'SELL';

  // Moderate bullish
  if (change >= 1) return 'BUY';

  // Moderate bearish
  if (change <= -2) return 'SELL';

  // Value play: low PE + decent growth
  if (pe > 0 && pe < 18 && revGrowth > 8) return 'BUY';

  return 'HOLD';
}

function computeScore(stock: any): number {
  let score = 50;

  // Signal bonus — now from LIVE change
  if (stock.signal === 'BULLISH') score += 15;
  else if (stock.signal === 'BEARISH') score -= 15;

  // Change momentum — bigger moves = bigger score impact
  const changeAbs = Math.abs(stock.change);
  if (stock.change > 0) {
    score += Math.min(changeAbs * 2, 15); // up to +15 for strong gainers
  } else {
    score -= Math.min(changeAbs * 2, 15); // up to -15 for strong losers
  }

  // Rating bonus — now derived dynamically
  if (stock.rating === 'STRONG_BUY') score += 20;
  else if (stock.rating === 'BUY') score += 10;
  else if (stock.rating === 'SELL') score -= 15;

  // Growth bonus
  const revGrowth = parseFloat(stock.revGrowth) || 0;
  const epsGrowth = parseFloat(stock.epsGrowth) || 0;
  score += Math.min(revGrowth / 5, 10);
  score += Math.min(epsGrowth / 5, 10);

  // Moat bonus
  if (stock.moat === 'WIDE') score += 5;

  // P/E reasonableness (lower is better for value)
  if (stock.pe > 0 && stock.pe < 20) score += 5;
  else if (stock.pe > 50) score -= 5;

  // Margin bonus
  const netMargin = parseFloat(stock.netMargin) || 0;
  if (netMargin > 20) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const filters: ScreenerFilters = {
      sector: searchParams.get('sector') || undefined,
      marketCapMin: searchParams.get('marketCapMin') || undefined,
      marketCapMax: searchParams.get('marketCapMax') || undefined,
      peMin: searchParams.get('peMin') ? parseFloat(searchParams.get('peMin')!) : undefined,
      peMax: searchParams.get('peMax') ? parseFloat(searchParams.get('peMax')!) : undefined,
      changeMin: searchParams.get('changeMin') ? parseFloat(searchParams.get('changeMin')!) : undefined,
      changeMax: searchParams.get('changeMax') ? parseFloat(searchParams.get('changeMax')!) : undefined,
      volumeMin: searchParams.get('volumeMin') ? parseFloat(searchParams.get('volumeMin')!) : undefined,
      signal: searchParams.get('signal') || undefined,
      sort: searchParams.get('sort') || 'score',
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
    };

    const allStocks = getAllStocks();
    const stocks = Object.values(allStocks);

    // Fetch live prices — ALWAYS force refresh so every click gets fresh data
    const tickers = stocks.map(s => s.ticker);
    const forceRefresh = searchParams.get('refresh') === '1';
    const livePrices = await getRealPrices(tickers, { forceRefresh: true });

    // ── PRE-MARKET: Fetch pre-market volume from Yahoo chart API ──
    const preMarket = isPreMarketHours();
    let preMarketData: Record<string, PreMarketData> = {};
    if (preMarket) {
      console.log(`[SCREENER] Pre-market detected — fetching pre-market volume for ${tickers.length} stocks...`);
      preMarketData = await fetchPreMarketVolumeBatch(tickers);
      const withVol = Object.values(preMarketData).filter(d => d.preMarketVolume > 0).length;
      console.log(`[SCREENER] Pre-market volume obtained for ${withVol}/${tickers.length} stocks`);
    }

    // Apply filters — use LIVE data for dynamic signal/trend/rating/score
    let filtered = stocks.map(stock => {
      const live: LivePrice | undefined = livePrices[stock.ticker];
      const pre = preMarketData[stock.ticker];
      const price = live?.price ?? pre?.preMarketPrice ?? stock.price;
      const change = live?.change ?? pre?.preMarketChange ?? stock.change;
      const hasLiveData = (live && live.price > 0) || (pre && pre.preMarketPrice && pre.preMarketPrice > 0);

      // DYNAMIC signals based on live change (not static)
      const signal = hasLiveData ? deriveSignal(change) : stock.signal;
      const trend = hasLiveData ? deriveTrend(change) : stock.trend;
      const rating = hasLiveData
        ? deriveRating(change, stock.pe, parseFloat(stock.revGrowth) || 0, parseFloat(stock.epsGrowth) || 0)
        : stock.rating;

      // Use LIVE volume (regular or pre-market)
      const liveVol = live?.volume && live.volume > 0 ? live.volume : 0;
      const preVol = pre?.preMarketVolume || 0;
      const activeVol = pre ? preVol : liveVol; // pre-market: use pre-market vol
      const volume = activeVol > 0
        ? (activeVol >= 1e9 ? `${(activeVol / 1e9).toFixed(1)}B` : `${(activeVol / 1e6).toFixed(1)}M`)
        : stock.volume;

      // Pre-market RVol (relative volume vs 30-day avg)
      const rvol = pre?.preMarketRVol || 0;

      return {
        ticker: stock.ticker,
        company: stock.company,
        sector: stock.sector,
        industry: stock.industry,
        price,
        change,
        volume,
        _liveVolume: activeVol,
        _preMarketVolume: preVol,
        _rvol: rvol,
        _isPreMarket: pre,
        marketCap: stock.marketCap,
        marketCapNum: parseMarketCap(stock.marketCap),
        pe: stock.pe,
        fwdPE: stock.fwdPE,
        peg: stock.peg,
        ps: stock.ps,
        netMargin: stock.netMargin,
        revGrowth: stock.revGrowth,
        epsGrowth: stock.epsGrowth,
        moat: stock.moat,
        brandStrength: stock.brandStrength,
        rating,
        targetPrice: stock.targetPrice,
        signal,
        trend,
        fcf: stock.fcf,
        score: 0, // computed below
        _liveSource: hasLiveData ? 'live' : 'static',
      };
    });

    // Sector filter
    if (filters.sector && filters.sector !== 'All') {
      filtered = filtered.filter(s => s.sector === filters.sector);
    }

    // Market cap filter
    if (filters.marketCapMin) {
      const min = parseMarketCap(filters.marketCapMin);
      filtered = filtered.filter(s => s.marketCapNum >= min);
    }
    if (filters.marketCapMax) {
      const max = parseMarketCap(filters.marketCapMax);
      filtered = filtered.filter(s => s.marketCapNum <= max);
    }

    // P/E filter
    if (filters.peMin !== undefined) {
      filtered = filtered.filter(s => s.pe >= filters.peMin!);
    }
    if (filters.peMax !== undefined) {
      filtered = filtered.filter(s => s.pe <= filters.peMax!);
    }

    // Change filter
    if (filters.changeMin !== undefined) {
      filtered = filtered.filter(s => s.change >= filters.changeMin!);
    }
    if (filters.changeMax !== undefined) {
      filtered = filtered.filter(s => s.change <= filters.changeMax!);
    }

    // Volume filter
    if (filters.volumeMin !== undefined) {
      filtered = filtered.filter(s => {
        const volStr = s.volume.replace('M', '').replace('B', '');
        const vol = parseFloat(volStr) * (s.volume.includes('B') ? 1000 : 1);
        return vol >= filters.volumeMin!;
      });
    }

    // Signal filter
    if (filters.signal && filters.signal !== 'All') {
      filtered = filtered.filter(s => s.signal === filters.signal);
    }

    // Compute scores
    filtered = filtered.map(s => ({ ...s, score: computeScore(s) }));

    // Sort
    const sort = filters.sort || 'score';
    const sortDir = sort.startsWith('-') ? -1 : 1;
    const sortKey = sort.replace(/^-/, '');

    filtered.sort((a, b) => {
      const aVal = a[sortKey as keyof typeof a] ?? 0;
      const bVal = b[sortKey as keyof typeof b] ?? 0;
      return (Number(aVal) - Number(bVal)) * sortDir;
    });

    // Limit
    if (filters.limit) {
      filtered = filtered.slice(0, filters.limit);
    }

    // Available sectors
    const sectors = [...new Set(stocks.map(s => s.sector))].sort();

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      liveCount: Object.keys(livePrices).length,
      isPreMarket: preMarket,
      preMarketStocksWithVolume: Object.values(preMarketData).filter(d => d.preMarketVolume > 0).length,
      stocks: filtered,
      totalStocks: stocks.length,
      filteredCount: filtered.length,
      sectors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('Screener error:', message);
    return NextResponse.json({ error: 'Skaneri nuk funksionoi. Provo përsëri.' }, { status: 500 });
  }
}
