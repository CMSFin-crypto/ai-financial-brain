// ═══════════════════════════════════════════════════════════════
// ALL US STOCKS UNIVERSE — Comprehensive ticker fetching
//
// Fetches ALL US-listed stocks (NASDAQ, NYSE, AMEX) with
// current prices, changes, and volumes from free APIs.
// Caches the ticker list and refreshes periodically.
// ═══════════════════════════════════════════════════════════════

export interface USStockSnapshot {
  symbol: string;
  price: number;
  change: number;        // % change
  volume: number;
  marketCap: number;      // approximate
  exchange: string;
  name?: string;
}

// Cache
let cachedSnapshots: USStockSnapshot[] | null = null;
let cachedTickerList: string[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.nasdaq.com',
  'Referer': 'https://www.nasdaq.com/',
};

// ═══════════════════════════════════════════════════════════════
// METHOD 1: NASDAQ Screener API — Returns ALL stocks with prices
// ═══════════════════════════════════════════════════════════════

async function fetchFromNasdaqScreener(): Promise<USStockSnapshot[]> {
  const url = 'https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=9999&offset=0';
  
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: BROWSER_HEADERS,
    });

    if (!res.ok) {
      console.log('[US-UNIVERSE] NASDAQ screener returned', res.status);
      return [];
    }

    const data = await res.json();
    const rows = data?.data?.table?.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      console.log('[US-UNIVERSE] NASDAQ screener: no rows');
      return [];
    }

    const snapshots: USStockSnapshot[] = [];
    for (const row of rows) {
      const symbol = String(row?.symbol || '').trim();
      if (!symbol || symbol.includes('/') || symbol.includes('.') || symbol.length > 5) continue;
      if (symbol.endsWith('$') || symbol.endsWith('+') || symbol.endsWith('-')) continue;

      // lastsale is like "$220.3585" — strip the $
      const priceStr = String(row?.lastsale || '0').replace(/[$,]/g, '');
      const price = parseFloat(priceStr);

      // pctchange is like "-2.067%" or "+15.5%" — strip the %
      const pctStr = String(row?.pctchange || '0').replace(/%/g, '');
      const pctChange = parseFloat(pctStr);

      if (price <= 0) continue;

      // marketCap is like "5,332,675,700,000" — strip commas
      const mcStr = String(row?.marketCap || '0').replace(/,/g, '');
      const marketCap = parseFloat(mcStr);

      const name = String(row?.name || '').trim();

      snapshots.push({
        symbol: symbol.toUpperCase(),
        price,
        change: pctChange,
        volume: 0,  // NASDAQ screener doesn't provide volume
        marketCap,
        exchange: 'US',
        name: name || undefined,
      });
    }

    console.log(`[US-UNIVERSE] NASDAQ screener: ${snapshots.length} stocks`);
    return snapshots;
  } catch (err: any) {
    const msg = err?.name === 'TimeoutError' ? 'timeout' : err?.message || 'unknown';
    console.log(`[US-UNIVERSE] NASDAQ screener failed: ${msg}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// METHOD 2: NASDAQ Trader TXT files — All listed tickers
// Only tickers, no prices — used as fallback for ticker list
// ═══════════════════════════════════════════════════════════════

async function fetchTickerListFromNasdaqTrader(): Promise<string[]> {
  const urls = [
    'https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt',
    'https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt',
  ];

  const tickers = new Set<string>();

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': BROWSER_HEADERS['User-Agent'] },
      });
      if (!res.ok) continue;

      const text = await res.text();
      const lines = text.split('\n');
      for (const line of lines) {
        const parts = line.split('|');
        const symbol = (parts[0] || '').trim();
        // Skip test issues, headers, etc.
        if (!symbol || symbol === 'Symbol' || symbol.includes('^') || symbol.includes('/')) continue;
        if (symbol.length > 5) continue;
        // Filter only NASDAQ, NYSE, AMEX, ARCA
        const exchange = (parts[2] || '').trim();
        if (['N', 'Q', 'A'].includes(exchange) || exchange === '' || exchange === 'Nasdaq') {
          tickers.add(symbol.toUpperCase());
        }
      }
    } catch {
      continue;
    }
  }

  console.log(`[US-UNIVERSE] NASDAQ Trader: ${tickers.size} tickers`);
  return Array.from(tickers);
}

// ═══════════════════════════════════════════════════════════════
// METHOD 3: Yahoo Finance — Top gainers (for stocks with 10%+ moves)
// ═══════════════════════════════════════════════════════════════

async function fetchFromYahooGainers(): Promise<USStockSnapshot[]> {
  // Yahoo Finance has predefined screeners - try day_gainers
  const endpoints = [
    'https://query1.finance.yahoo.com',
    'https://query2.finance.yahoo.com',
  ];

  for (const base of endpoints) {
    try {
      const url = `${base}/v1/finance/screener/predefined/saved?scrIds=day_gainers&count=250&start=0`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: {
          'User-Agent': BROWSER_HEADERS['User-Agent'],
          'Accept': 'application/json',
        },
      });

      if (!res.ok) continue;

      const data = await res.json();
      const quotes = data?.finance?.result?.[0]?.quotes;
      if (!Array.isArray(quotes)) continue;

      const snapshots: USStockSnapshot[] = [];
      for (const q of quotes) {
        const price = q?.regularMarketPrice;
        const change = q?.regularMarketChangePercent;
        const volume = q?.regularMarketVolume || 0;
        const symbol = q?.symbol;
        if (!symbol || !price || price <= 0) continue;

        snapshots.push({
          symbol: symbol.toUpperCase(),
          price: parseFloat(price.toFixed(2)),
          change: parseFloat((change || 0).toFixed(2)),
          volume,
          marketCap: q?.marketCap || 0,
          exchange: q?.exchange || 'UNKNOWN',
          name: q?.shortName || q?.longName || undefined,
        });
      }

      console.log(`[US-UNIVERSE] Yahoo gainers: ${snapshots.length} stocks from ${base}`);
      return snapshots;
    } catch {
      continue;
    }
  }

  return [];
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

/**
 * Get ALL US stocks with current prices.
 * Tries NASDAQ screener first (single API call for ALL stocks),
 * then falls back to Yahoo Finance gainers.
 * Returns cached result if fresh.
 */
export async function getAllUSStockSnapshots(): Promise<USStockSnapshot[]> {
  if (cachedSnapshots && Date.now() - cacheTime < CACHE_TTL) {
    return cachedSnapshots;
  }

  // Try Method 1: NASDAQ Screener (best — ALL stocks with prices in one call)
  let snapshots = await fetchFromNasdaqScreener();

  // Try Method 3: Yahoo Gainers (good for finding 10%+ movers)
  if (snapshots.length < 50) {
    const yahooGainers = await fetchFromYahooGainers();
    if (yahooGainers.length > 0) {
      // Merge, deduplicate by symbol
      const existing = new Set(snapshots.map(s => s.symbol));
      for (const y of yahooGainers) {
        if (!existing.has(y.symbol)) {
          snapshots.push(y);
          existing.add(y.symbol);
        }
      }
    }
  }

  if (snapshots.length > 0) {
    cachedSnapshots = snapshots;
    cachedTickerList = snapshots.map(s => s.symbol);
    cacheTime = Date.now();
  }

  return snapshots;
}

/**
 * Get a list of ALL US stock tickers (no prices).
 * Used as fallback when we need tickers but can't get prices.
 */
export async function getAllUSTickers(): Promise<string[]> {
  if (cachedTickerList && Date.now() - cacheTime < CACHE_TTL) {
    return cachedTickerList;
  }

  // If we already have snapshots, use those
  if (cachedSnapshots && cachedSnapshots.length > 0) {
    return cachedSnapshots.map(s => s.symbol);
  }

  // Otherwise, fetch just the ticker list
  const tickers = await fetchTickerListFromNasdaqTrader();
  if (tickers.length > 0) {
    cachedTickerList = tickers;
    cacheTime = Date.now();
  }

  return tickers;
}

/**
 * Pre-filter ALL US stocks to find candidates worth deep analysis.
 * Uses the snapshot data (price, change) to quickly narrow down.
 */
export function prefilterCandidates(
  snapshots: USStockSnapshot[],
  options: {
    minPrice?: number;
    maxPrice?: number;
    minChange?: number;
    maxCandidates?: number;
  } = {}
): { tickers: string[]; priceMap: Record<string, { price: number; change: number }> } {
  const {
    minPrice = 0.8,  // slightly below $1 to catch stocks near the boundary
    maxPrice = 25,   // slightly above $20
    minChange = 2,   // must have at least 2% move (relaxed from 10% to catch more)
    maxCandidates = 100,
  } = options;

  // Filter
  const candidates = snapshots.filter(s =>
    s.price >= minPrice &&
    s.price <= maxPrice &&
    s.change >= minChange
  );

  // Sort by change descending (biggest movers first)
  candidates.sort((a, b) => b.change - a.change);

  // Take top N
  const top = candidates.slice(0, maxCandidates);

  const priceMap: Record<string, { price: number; change: number }> = {};
  const tickers: string[] = [];

  for (const s of top) {
    priceMap[s.symbol] = { price: s.price, change: s.change };
    tickers.push(s.symbol);
  }

  return { tickers, priceMap };
}
