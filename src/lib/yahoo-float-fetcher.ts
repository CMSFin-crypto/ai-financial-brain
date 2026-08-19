// ═══════════════════════════════════════════════════════════════
// YAHOO FINANCE FLOAT FETCHER — Real float shares from Yahoo
// Returns floatShares, sharesOutstanding, shortRatio, etc.
// Primary source: Yahoo quoteSummary API (most accurate free data)
// ═══════════════════════════════════════════════════════════════

export interface YahooFloatData {
  floatShares: number | null;       // Float in actual shares (NOT millions)
  floatM: number | null;            // Float in millions (derived)
  sharesOutstanding: number | null;  // Total shares out
  sharesOutM: number | null;         // Total shares out in millions
  shortRatio: number | null;         // Short ratio (days to cover)
  shortPctOfFloat: number | null;    // Short % of float
  name: string;
  sector: string;
  industry: string;
  source: 'yahoo';
  fetchedAt: number;
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

// In-memory cache
const cache = new Map<string, { data: YahooFloatData; time: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Fetch float data for a single ticker from Yahoo Finance.
 */
export async function fetchYahooFloat(ticker: string): Promise<YahooFloatData | null> {
  const key = ticker.toUpperCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.data;
  }

  // Try multiple Yahoo endpoints
  const endpoints = [
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${key}?modules=defaultKeyStatistics,summaryDetail,financialData&corsDomain=finance.yahoo.com`,
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${key}?modules=defaultKeyStatistics,summaryDetail,financialData&corsDomain=finance.yahoo.com`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: BROWSER_HEADERS,
      });

      if (!res.ok) continue;

      const json = await res.json();
      const result = json?.quoteSummary?.result?.[0];
      if (!result) continue;

      // Extract from defaultKeyStatistics
      const stats = result.defaultKeyStatistics || {};
      const detail = result.summaryDetail || {};
      const finData = result.financialData || {};

      // Float shares (raw number of shares)
      const floatRaw = stats.floatShares?.raw ?? stats.floatShares ?? null;
      // Shares outstanding
      const sharesOutRaw = stats.sharesOutstanding?.raw ?? detail.sharesOutstanding?.raw ?? null;
      // Short ratio (days to cover)
      const shortRatio = detail.shortRatio?.raw ?? null;
      // Short % of float
      const shortPct = stats.shortPercentOfFloat?.raw ?? detail.shortPercentOfFloat?.raw ?? null;

      // Company info
      const priceInfo = result.price || {};
      const name = priceInfo.shortName || priceInfo.longName || key;
      const sector = priceInfo.sector || '';
      const industry = priceInfo.industry || '';

      if (floatRaw === null && sharesOutRaw === null) continue;

      const floatShares = typeof floatRaw === 'number' && floatRaw > 0 ? floatRaw : null;
      const sharesOut = typeof sharesOutRaw === 'number' && sharesOutRaw > 0 ? sharesOutRaw : null;

      const data: YahooFloatData = {
        floatShares,
        floatM: floatShares ? floatShares / 1e6 : null,
        sharesOutstanding: sharesOut,
        sharesOutM: sharesOut ? sharesOut / 1e6 : null,
        shortRatio: typeof shortRatio === 'number' ? shortRatio : null,
        shortPctOfFloat: typeof shortPct === 'number' ? shortPct : null,
        name,
        sector,
        industry,
        source: 'yahoo',
        fetchedAt: Date.now(),
      };

      cache.set(key, { data, time: Date.now() });
      return data;
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Fetch float data for multiple tickers (batched, concurrent).
 * Higher concurrency than Finviz since Yahoo API is more reliable.
 */
export async function fetchYahooFloatBatch(
  tickers: string[],
  concurrency = 5
): Promise<Record<string, YahooFloatData>> {
  const results: Record<string, YahooFloatData> = {};

  for (let i = 0; i < tickers.length; i += concurrency) {
    const batch = tickers.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(t => fetchYahooFloat(t))
    );

    batchResults.forEach((r, idx) => {
      if (r.status === 'fulfilled' && r.value && r.value.floatM !== null) {
        results[batch[idx].toUpperCase()] = r.value;
      }
    });

    // Small delay between batches
    if (i + concurrency < tickers.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return results;
}

export type { YahooFloatData };
