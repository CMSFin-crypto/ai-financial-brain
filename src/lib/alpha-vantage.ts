// ═══════════════════════════════════════════════════════════════
// REAL STOCK PRICES — Robust multi-source fetching
// Primary: Yahoo Finance v8 (multiple endpoints)
// Secondary: Yahoo Finance query2 (fallback host)
// Tertiary: Alpha Vantage (if API key configured)
// Strategy: Batched fetching with retry, longer timeouts
// ═══════════════════════════════════════════════════════════════

export interface LivePrice {
  price: number;
  change: number;     // % change
  previousClose: number;
  volume: number;
  source: 'alpha_vantage' | 'yahoo_finance';
  timestamp: string;
}

// In-memory cache to avoid hitting API limits
const priceCache = new Map<string, { data: LivePrice; fetchedAt: number }>();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes cache

// Historical chart data cache
const chartCache = new Map<string, { data: HistoricalDataPoint[]; fetchedAt: number }>();
const CHART_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

export interface HistoricalDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

// Yahoo Finance endpoints to try (in order)
const YAHOO_ENDPOINTS = [
  'https://query1.finance.yahoo.com',
  'https://query2.finance.yahoo.com',
  'https://query1.finance.yahoo.com', // Retry first endpoint
];

// Common browser headers to avoid being blocked
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'cross-site',
};

// ─── Yahoo Finance v8 chart API (PRIMARY — free, no key needed) ─────────────────
async function fetchFromYahooFinance(ticker: string, endpointIndex = 0): Promise<LivePrice | null> {
  const base = YAHOO_ENDPOINTS[endpointIndex] || YAHOO_ENDPOINTS[0];
  try {
    const url = `${base}/v8/finance/chart/${ticker}?range=1d&interval=1d&includePrePost=false`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000), // 8 second timeout
      headers: BROWSER_HEADERS,
    });

    if (!res.ok) {
      console.log(`[PRICE] ${ticker}: Yahoo ${base} returned ${res.status}`);
      return null;
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) {
      console.log(`[PRICE] ${ticker}: Yahoo ${base} returned no chart data`);
      return null;
    }

    const meta = result.meta;
    const price = meta?.regularMarketPrice;
    const prevClose = meta?.chartPreviousClose || meta?.previousClose;
    const volume = meta?.regularMarketVolume || 0;

    if (!price || price <= 0) {
      console.log(`[PRICE] ${ticker}: Yahoo ${base} returned invalid price: ${price}`);
      return null;
    }

    const change = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;

    console.log(`[PRICE] ${ticker}: $${price.toFixed(2)} (${change >= 0 ? '+' : ''}${change.toFixed(2)}%) [Yahoo ${endpointIndex + 1}]`);
    return {
      price: parseFloat(price.toFixed(2)),
      change: parseFloat(change.toFixed(2)),
      previousClose: prevClose ? parseFloat(prevClose.toFixed(2)) : price,
      volume,
      source: 'yahoo_finance',
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    const msg = err?.name === 'TimeoutError' ? 'timeout' : err?.message || 'unknown';
    console.log(`[PRICE] ${ticker}: Yahoo ${base} failed: ${msg}`);
    return null;
  }
}

// Try Yahoo with retry on different endpoint
async function fetchFromYahooWithRetry(ticker: string): Promise<LivePrice | null> {
  // Try endpoint 1 (query1)
  const result1 = await fetchFromYahooFinance(ticker, 0);
  if (result1) return result1;

  // Try endpoint 2 (query2) 
  const result2 = await fetchFromYahooFinance(ticker, 1);
  if (result2) return result2;

  return null;
}

// ─── Alpha Vantage GLOBAL_QUOTE (SECONDARY — needs API key) ─────────────────
async function fetchFromAlphaVantage(ticker: string): Promise<LivePrice | null> {
  if (!ALPHA_VANTAGE_KEY) return null;
  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${ALPHA_VANTAGE_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;

    const data = await res.json();
    const quote = data?.['Global Quote'];
    if (!quote || !quote['05. price']) return null;

    const price = parseFloat(quote['05. price']);
    const prevClose = parseFloat(quote['08. previous close']) || price;
    const changePercent = parseFloat(quote['10. change percent']?.replace('%', '')) || 0;
    const volume = parseInt(quote['06. volume']) || 0;

    if (isNaN(price) || price <= 0) return null;

    console.log(`[PRICE] ${ticker}: $${price.toFixed(2)} (Alpha Vantage)`);
    return {
      price,
      change: changePercent,
      previousClose: prevClose,
      volume,
      source: 'alpha_vantage',
      timestamp: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ─── Batched fetching with delays to avoid rate limiting ─────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Fetch real-time price for a single ticker.
 * Tries Yahoo Finance (both endpoints), then Alpha Vantage.
 */
export async function getRealPrice(ticker: string): Promise<LivePrice | null> {
  const t = ticker.toUpperCase().trim();

  // Check cache first
  const cached = priceCache.get(t);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  // Try Yahoo Finance (with retry on secondary endpoint)
  const yfPrice = await fetchFromYahooWithRetry(t);
  if (yfPrice) {
    priceCache.set(t, { data: yfPrice, fetchedAt: Date.now() });
    return yfPrice;
  }

  // Try Alpha Vantage as fallback (if key is configured)
  const avPrice = await fetchFromAlphaVantage(t);
  if (avPrice) {
    priceCache.set(t, { data: avPrice, fetchedAt: Date.now() });
    return avPrice;
  }

  console.warn(`[PRICE] Could not fetch real price for ${ticker} from any source`);
  return null;
}

/**
 * Fetch real-time prices for multiple tickers (batched).
 * Processes in chunks of 6 with 800ms delay between chunks to avoid rate limiting.
 * Returns a map of ticker -> LivePrice (only successfully fetched).
 */
export async function getRealPrices(tickers: string[]): Promise<Record<string, LivePrice>> {
  const prices: Record<string, LivePrice> = {};
  const toFetch: string[] = [];

  // First, check which tickers have valid cached data
  for (const ticker of tickers) {
    const t = ticker.toUpperCase().trim();
    const cached = priceCache.get(t);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      prices[t] = cached.data;
    } else {
      toFetch.push(t);
    }
  }

  if (toFetch.length === 0) {
    console.log(`[PRICE] All ${tickers.length} prices from cache`);
    return prices;
  }

  console.log(`[PRICE] Cache hits: ${Object.keys(prices).length}, fetching: ${toFetch.length} tickers...`);

  // Process in batches of 6 with delay between batches
  const BATCH_SIZE = 6;
  const BATCH_DELAY_MS = 800;
  const chunks = chunkArray(toFetch, BATCH_SIZE);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // Fetch all tickers in this chunk in parallel
    const results = await Promise.allSettled(
      chunk.map(t => getRealPrice(t))
    );

    // Collect results
    chunk.forEach((ticker, j) => {
      const result = results[j];
      if (result.status === 'fulfilled' && result.value) {
        prices[ticker] = result.value;
      }
    });

    // Delay between batches (except after last batch)
    if (i < chunks.length - 1) {
      await delay(BATCH_DELAY_MS);
    }
  }

  const successCount = Object.keys(prices).length;
  const failCount = toFetch.length - (successCount - tickers.length + toFetch.length);
  console.log(`[PRICE] Batch complete: ${successCount}/${tickers.length} prices obtained`);

  return prices;
}

/**
 * Build a price context string for AI prompts.
 */
export function buildPriceContext(prices: Record<string, LivePrice>): string {
  return Object.entries(prices)
    .map(([ticker, data]) => {
      const sign = data.change >= 0 ? '+' : '';
      return `${ticker}: $${data.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${sign}${data.change.toFixed(2)}%)`;
    })
    .join('\n');
}

/**
 * Fetch 30-day historical chart data from Yahoo Finance.
 * Returns real OHLCV data for charting.
 */
export async function fetchHistoricalData(ticker: string, range?: string): Promise<HistoricalDataPoint[] | null> {
  const t = ticker.toUpperCase().trim();
  const r = range || '6mo';

  // Determine interval based on range
  const interval = r === '1d' ? '5m' : '1d';

  // Check cache first (include range in cache key)
  const cacheKey = `${t}_${r}`;
  const cached = chartCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CHART_CACHE_TTL_MS) {
    return cached.data;
  }

  // Try Yahoo Finance v8 chart API with specified range
  const endpoints = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];

  for (const base of endpoints) {
    try {
      const url = `${base}/v8/finance/chart/${t}?range=${r}&interval=${interval}&includePrePost=false`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: BROWSER_HEADERS,
      });

      if (!res.ok) continue;

      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (!result) continue;

      const timestamps: number[] = result.timestamp || [];
      const quote = result.indicators?.quote?.[0];
      if (!quote || !timestamps.length) continue;

      const points: HistoricalDataPoint[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const open = quote.open?.[i];
        const high = quote.high?.[i];
        const low = quote.low?.[i];
        const close = quote.close?.[i];
        const vol = quote.volume?.[i];

        if (close && close > 0 && open && high && low) {
          const d = new Date(timestamps[i] * 1000);
          // Skip weekends
          if (d.getDay() === 0 || d.getDay() === 6) continue;
          points.push({
            date: d.toISOString().split('T')[0],
            open: +open.toFixed(2),
            high: +high.toFixed(2),
            low: +low.toFixed(2),
            close: +close.toFixed(2),
            volume: vol || 0,
          });
        }
      }

      if (points.length >= 15) {
        console.log(`[CHART] ${t}: fetched ${points.length} days of real data from ${base}`);
        chartCache.set(cacheKey, { data: points, fetchedAt: Date.now() });
        return points;
      }
    } catch (err: any) {
      const msg = err?.name === 'TimeoutError' ? 'timeout' : err?.message || 'unknown';
      console.log(`[CHART] ${t}: ${base} failed: ${msg}`);
      continue;
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// YAHOO FINANCE FUNDAMENTALS — Real financial data
// Uses quoteSummary endpoint for PE, PEG, Revenue Growth, EPS Growth,
// analyst targets, margins, etc.
// ═══════════════════════════════════════════════════════════════

export interface YahooFundamentals {
  currentPrice: number;
  previousClose: number;
  // Valuation
  trailingPE: number;
  forwardPE: number;
  pegRatio: number;
  priceToBook: number;
  enterpriseToEbitda: number;
  // Margins (decimal, e.g. 0.46 = 46%)
  grossMargins: number;
  operatingMargins: number;
  profitMargins: number;
  // Growth
  revenueGrowth: number;      // e.g. 0.095 = 9.5%
  earningsGrowth: number;     // e.g. 0.142 = 14.2%
  revenueQuarterlyGrowth: number;
  earningsQuarterlyGrowth: number;
  // Analyst consensus
  targetMeanPrice: number;
  targetHighPrice: number;
  targetLowPrice: number;
  recommendationKey: string;   // 'buy', 'hold', 'sell', 'strong_buy'
  numberOfAnalystOpinions: number;
  // Other
  totalRevenue: number;
  ebitda: number;
  totalDebt: number;
  totalCash: number;
  debtToEquity: number;
  returnOnEquity: number;
  freeCashflow: number;
  epsForward: number;
  source: string;
  fetchedAt: string;
}

// Cache fundamentals for 15 minutes (longer than prices)
const fundCache = new Map<string, { data: YahooFundamentals; fetchedAt: number }>();
const FUND_CACHE_TTL_MS = 15 * 60 * 1000;

function extractNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const n = parseFloat(String(val).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

async function fetchQuoteSummary(ticker: string, endpointIndex = 0): Promise<YahooFundamentals | null> {
  const base = YAHOO_ENDPOINTS[endpointIndex] || YAHOO_ENDPOINTS[0];
  const modules = 'financialData,defaultKeyStatistics,earningsTrend,earningsHistory';
  try {
    const url = `${base}/v10/finance/quoteSummary/${ticker}?modules=${modules}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: BROWSER_HEADERS,
    });

    if (!res.ok) {
      console.log(`[FUND] ${ticker}: quoteSummary ${base} returned ${res.status}`);
      return null;
    }

    const data = await res.json();
    const body = data?.quoteSummary?.result?.[0];
    if (!body) {
      console.log(`[FUND] ${ticker}: No quoteSummary result from ${base}`);
      return null;
    }

    const fd = body.financialData || {};
    const dks = body.defaultKeyStatistics || {};
    const et = body.earningsTrend || {};
    const eh = body.earningsHistory || {};

    // Extract earnings trend for forward EPS
    const trendData = et.trend || [];
    let epsForward = extractNum(fd.forwardEps);
    if (!epsForward && trendData.length > 0) {
      epsForward = extractNum(trendData[0]?.earningsEstimate?.avgForecast);
    }

    // Extract quarterly growth from earnings history
    const historyData = eh.history || [];
    let earningsQuarterlyGrowth = extractNum(fd.earningsQuarterlyGrowth);
    let revenueQuarterlyGrowth = extractNum(fd.revenueQuarterlyGrowth);
    if (!earningsQuarterlyGrowth && historyData.length > 0) {
      const latest = historyData[0];
      const epsSurprise = extractNum(latest?.epsSurprisePercent);
      if (epsSurprise) earningsQuarterlyGrowth = epsSurprise;
    }

    // Revenue growth quarterly
    if (!revenueQuarterlyGrowth && historyData.length > 0) {
      const revSurprise = extractNum(historyData[0]?.revenueSurprisePercent);
      if (revSurprise) revenueQuarterlyGrowth = revSurprise;
    }

    // Calculate upside from target
    const currentPrice = extractNum(fd.currentPrice?.raw);
    const targetMean = extractNum(fd.targetMeanPrice?.raw);
    const upside = currentPrice > 0 && targetMean > 0
      ? ((targetMean - currentPrice) / currentPrice) * 100
      : 0;

    const result: YahooFundamentals = {
      currentPrice,
      previousClose: extractNum(fd.previousClose?.raw),
      trailingPE: extractNum(fd.trailingPE?.raw),
      forwardPE: extractNum(fd.forwardPE?.raw),
      pegRatio: extractNum(dks.pegRatio?.raw),
      priceToBook: extractNum(fd.priceToBook?.raw),
      enterpriseToEbitda: extractNum(dks.enterpriseToEbitda?.raw),
      grossMargins: extractNum(fd.grossMargins?.raw),
      operatingMargins: extractNum(fd.operatingMargins?.raw),
      profitMargins: extractNum(fd.profitMargins?.raw),
      revenueGrowth: extractNum(fd.revenueGrowth?.raw),
      earningsGrowth: extractNum(fd.earningsGrowth?.raw),
      revenueQuarterlyGrowth,
      earningsQuarterlyGrowth,
      targetMeanPrice: targetMean,
      targetHighPrice: extractNum(fd.targetHighPrice?.raw),
      targetLowPrice: extractNum(fd.targetLowPrice?.raw),
      recommendationKey: extractNum(fd.recommendationKey) ? String(fd.recommendationKey) : '',
      numberOfAnalystOpinions: extractNum(fd.numberOfAnalystOpinions?.raw),
      totalRevenue: extractNum(fd.totalRevenue?.raw),
      ebitda: extractNum(fd.ebitda?.raw),
      totalDebt: extractNum(fd.totalDebt?.raw),
      totalCash: extractNum(fd.totalCash?.raw),
      debtToEquity: extractNum(fd.debtToEquity?.raw),
      returnOnEquity: extractNum(fd.returnOnEquity?.raw),
      freeCashflow: extractNum(fd.freeCashflow?.raw),
      epsForward,
      source: `yahoo_finance (${base})`,
      fetchedAt: new Date().toISOString(),
    };

    console.log(`[FUND] ${ticker}: PE=${result.trailingPE} fwdPE=${result.forwardPE} PEG=${result.pegRatio} RevGr=${(result.revenueGrowth*100).toFixed(1)}% EPSGr=${(result.earningsGrowth*100).toFixed(1)}% Target=$${result.targetMeanPrice} Upside=${upside.toFixed(1)}%`);
    return result;
  } catch (err: any) {
    const msg = err?.name === 'TimeoutError' ? 'timeout' : err?.message || 'unknown';
    console.log(`[FUND] ${ticker}: quoteSummary ${base} failed: ${msg}`);
    return null;
  }
}

/**
 * Fetch real fundamental data for a single ticker from Yahoo Finance.
 * Returns null if all endpoints fail.
 */
export async function getRealFundamentals(ticker: string): Promise<YahooFundamentals | null> {
  const t = ticker.toUpperCase().trim();

  // Check cache first
  const cached = fundCache.get(t);
  if (cached && Date.now() - cached.fetchedAt < FUND_CACHE_TTL_MS) {
    return cached.data;
  }

  // Try endpoint 1
  const r1 = await fetchQuoteSummary(t, 0);
  if (r1 && r1.currentPrice > 0) {
    fundCache.set(t, { data: r1, fetchedAt: Date.now() });
    return r1;
  }

  // Try endpoint 2
  const r2 = await fetchQuoteSummary(t, 1);
  if (r2 && r2.currentPrice > 0) {
    fundCache.set(t, { data: r2, fetchedAt: Date.now() });
    return r2;
  }

  console.warn(`[FUND] Could not fetch fundamentals for ${ticker}`);
  return null;
}

/**
 * Fetch real fundamental data for multiple tickers (batched).
 * Returns a map of ticker -> YahooFundamentals (only successfully fetched).
 */
export async function getRealFundamentalsBatch(tickers: string[]): Promise<Record<string, YahooFundamentals>> {
  const results: Record<string, YahooFundamentals> = {};
  const toFetch: string[] = [];

  for (const ticker of tickers) {
    const t = ticker.toUpperCase().trim();
    const cached = fundCache.get(t);
    if (cached && Date.now() - cached.fetchedAt < FUND_CACHE_TTL_MS) {
      results[t] = cached.data;
    } else {
      toFetch.push(t);
    }
  }

  if (toFetch.length === 0) {
    console.log(`[FUND] All ${tickers.length} fundamentals from cache`);
    return results;
  }

  console.log(`[FUND] Cache hits: ${Object.keys(results).length}, fetching: ${toFetch.length} fundamentals...`);

  // Process in batches of 3 with longer delay (quoteSummary is heavier)
  const BATCH_SIZE = 3;
  const BATCH_DELAY_MS = 1200;
  const chunks = chunkArray(toFetch, BATCH_SIZE);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const fetchResults = await Promise.allSettled(
      chunk.map(t => getRealFundamentals(t))
    );

    chunk.forEach((ticker, j) => {
      const result = fetchResults[j];
      if (result.status === 'fulfilled' && result.value) {
        results[ticker] = result.value;
      }
    });

    if (i < chunks.length - 1) {
      await delay(BATCH_DELAY_MS);
    }
  }

  console.log(`[FUND] Batch complete: ${Object.keys(results).length}/${tickers.length} fundamentals obtained`);
  return results;
}

// ═══════════════════════════════════════════════════════════════
// YAHOO FINANCE BATCH QUOTE — Fast fundamentals for many tickers
// Uses v7/finance/quote endpoint — ONE request for up to 50 symbols
// Returns: PE, PEG, Revenue Growth, EPS Growth, Analyst Targets, etc.
// ═══════════════════════════════════════════════════════════════

const batchQuoteCache = new Map<string, { data: Record<string, YahooFundamentals>; fetchedAt: number }>();
const BATCH_QUOTE_CACHE_TTL = 10 * 60 * 1000; // 10 min

export async function getBatchQuotesFast(tickers: string[]): Promise<Record<string, YahooFundamentals>> {
  // Check cache first
  const cacheKey = tickers.sort().join(',');
  const cached = batchQuoteCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < BATCH_QUOTE_CACHE_TTL) {
    return cached.data;
  }

  const results: Record<string, YahooFundamentals> = {};

  // Fetch in chunks of 40 (v7 limit is ~50)
  const chunks = chunkArray(tickers, 40);

  for (const chunk of chunks) {
    const symbols = chunk.join(',');
    const fields = [
      'regularMarketPrice', 'regularMarketPreviousClose', 'trailingPE', 'forwardPE',
      'pegRatio', 'revenueGrowth', 'earningsGrowth', 'earningsQuarterlyGrowth',
      'revenueQuarterlyGrowth', 'targetMeanPrice', 'targetHighPrice', 'targetLowPrice',
      'recommendationKey', 'numberOfAnalystOpinions', 'operatingMargins', 'profitMargins',
      'grossMargins', 'debtToEquity', 'returnOnEquity', 'priceToBook', 'enterpriseToEbitda',
      'forwardEps', 'totalRevenue', 'ebitda', 'totalDebt', 'totalCash', 'freeCashflow',
      'financialData', 'defaultKeyStatistics'
    ].join(',');

    for (const base of ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']) {
      try {
        const url = `${base}/v7/finance/quote?symbols=${symbols}&fields=${fields}`;
        const res = await fetch(url, {
          signal: AbortSignal.timeout(15000),
          headers: BROWSER_HEADERS,
        });

        if (!res.ok) {
          console.log(`[BATCH-QUOTE] ${base} returned ${res.status}`);
          continue;
        }

        const data = await res.json();
        const quotes = data?.quoteResponse?.result || [];

        for (const q of quotes) {
          const sym = (q.symbol || '').toUpperCase();
          const price = extractNum(q.regularMarketPrice);
          if (price <= 0) continue;

          results[sym] = {
            currentPrice: price,
            previousClose: extractNum(q.regularMarketPreviousClose),
            trailingPE: extractNum(q.trailingPE),
            forwardPE: extractNum(q.forwardPE),
            pegRatio: extractNum(q.pegRatio),
            priceToBook: extractNum(q.priceToBook),
            enterpriseToEbitda: extractNum(q.enterpriseToEbitda),
            grossMargins: extractNum(q.grossMargins),
            operatingMargins: extractNum(q.operatingMargins),
            profitMargins: extractNum(q.profitMargins),
            revenueGrowth: extractNum(q.revenueGrowth),
            earningsGrowth: extractNum(q.earningsGrowth),
            revenueQuarterlyGrowth: extractNum(q.revenueQuarterlyGrowth),
            earningsQuarterlyGrowth: extractNum(q.earningsQuarterlyGrowth),
            targetMeanPrice: extractNum(q.targetMeanPrice),
            targetHighPrice: extractNum(q.targetHighPrice),
            targetLowPrice: extractNum(q.targetLowPrice),
            recommendationKey: q.recommendationKey ? String(q.recommendationKey) : '',
            numberOfAnalystOpinions: extractNum(q.numberOfAnalystOpinions),
            totalRevenue: extractNum(q.totalRevenue),
            ebitda: extractNum(q.ebitda),
            totalDebt: extractNum(q.totalDebt),
            totalCash: extractNum(q.totalCash),
            debtToEquity: extractNum(q.debtToEquity),
            returnOnEquity: extractNum(q.returnOnEquity),
            freeCashflow: extractNum(q.freeCashflow),
            epsForward: extractNum(q.forwardEps),
            source: `yahoo_batch (${base})`,
            fetchedAt: new Date().toISOString(),
          };

          // Also store in individual cache
          fundCache.set(sym, { data: results[sym], fetchedAt: Date.now() });
        }

        console.log(`[BATCH-QUOTE] Got ${quotes.length}/${chunk.length} quotes from ${base}`);
        break; // Don't try second endpoint if first succeeded
      } catch (err: any) {
        const msg = err?.name === 'TimeoutError' ? 'timeout' : err?.message || 'unknown';
        console.log(`[BATCH-QUOTE] ${base} failed: ${msg}`);
        continue;
      }
    }

    // Small delay between chunks
    if (chunks.indexOf(chunk) < chunks.length - 1) {
      await delay(500);
    }
  }

  // Cache the batch result
  batchQuoteCache.set(cacheKey, { data: results, fetchedAt: Date.now() });
  console.log(`[BATCH-QUOTE] Total: ${Object.keys(results).length}/${tickers.length} fundamentals obtained (fast batch)`);

  return results;
}

/**
 * Inject real price data into an AI user message prompt.
 * Appends a section with real prices so the AI uses them instead of hallucinating.
 */
export function injectPricesIntoPrompt(userMessage: string, prices: Record<string, LivePrice>): string {
  if (Object.keys(prices).length === 0) return userMessage;

  const priceSection = `\n\n═══ REAL-TIME STOCK PRICES (verified from live market data) ═══\n` +
    `CRITICAL RULE: You MUST use these EXACT prices. Do NOT make up, guess, or estimate any price.\n` +
    `All entry zones, stop losses, take profits, support/resistance levels, and currentPrice MUST be based on these real prices.\n\n` +
    buildPriceContext(prices) +
    `\n\nVIOLATION WARNING: If you output any price that contradicts these real prices, your analysis will be considered INVALID.`;

  return userMessage + priceSection;
}
