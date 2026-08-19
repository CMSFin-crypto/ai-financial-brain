// ═══════════════════════════════════════════════════════════════
// FLOAT FETCHER — Real float shares from StockAnalysis.com
// Yahoo Finance quoteSummary now requires crumb/cookie (blocked).
// StockAnalysis.com has accurate float, shares out, short % in HTML.
// Fallback: Finviz scraper (already separate module).
// ═══════════════════════════════════════════════════════════════

export interface YahooFloatData {
  floatShares: number | null;       // Float in actual shares (NOT millions)
  floatM: number | null;            // Float in millions (derived)
  sharesOutstanding: number | null;  // Total shares out
  sharesOutM: number | null;         // Total shares out in millions
  shortRatio: number | null;         // Short ratio (days to cover)
  shortPctOfFloat: number | null;    // Short % of float
  shortInterest: number | null;      // Short interest (actual shares)
  source: 'stockanalysis';
  fetchedAt: number;
}

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// In-memory cache
const cache = new Map<string, { data: YahooFloatData; time: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Parse a value like "14.57B", "214.14M", "1,234,567" into a number.
 */
function parseShareValue(str: string | null | undefined): number | null {
  if (!str || str === 'n/a') return null;
  const cleaned = str.replace(/,/g, '').trim();
  const bMatch = cleaned.match(/^([\d.]+)\s*B$/i);
  if (bMatch) return parseFloat(bMatch[1]) * 1e9;
  const mMatch = cleaned.match(/^([\d.]+)\s*M$/i);
  if (mMatch) return parseFloat(mMatch[1]) * 1e6;
  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
}

/**
 * Extract JSON-like data objects from StockAnalysis.com HTML.
 * They have format: {id:"float",title:"Float",value:"14.57B",hover:"14,569,172,097"}
 * We extract the hover value (exact number) when available, else the value field.
 */
function extractDataObjects(html: string): Map<string, { value: string; hover: string }> {
  const dataMap = new Map<string, { value: string; hover: string }>();

  // Match patterns like: {id:"float",title:"Float",value:"14.57B",hover:"14,569,172,097"}
  const regex = /\{id:"([^"]+)",title:"[^"]*",value:"([^"]*)",hover:"([^"]*)"\}/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    dataMap.set(match[1], { value: match[2], hover: match[3] });
  }

  return dataMap;
}

/**
 * Fetch float data for a single ticker from StockAnalysis.com.
 */
export async function fetchYahooFloat(ticker: string): Promise<YahooFloatData | null> {
  const key = ticker.toUpperCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.data;
  }

  try {
    const url = `https://stockanalysis.com/stocks/${key.toLowerCase()}/statistics/`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!res.ok) return null;

    const html = await res.text();

    // Extract all data objects from the embedded JSON
    const dataMap = extractDataObjects(html);

    // Get float — prefer hover (exact number), fallback to value (formatted)
    const floatObj = dataMap.get('float');
    const floatShares = floatObj
      ? (parseShareValue(floatObj.hover) || parseShareValue(floatObj.value))
      : null;

    // Get shares outstanding
    const sharesObj = dataMap.get('sharesOutClass');
    const sharesOutstanding = sharesObj
      ? (parseShareValue(sharesObj.hover) || parseShareValue(sharesObj.value))
      : null;

    // Get short % of float
    const shortFloatObj = dataMap.get('shortFloat');
    const shortPctOfFloat = shortFloatObj && shortFloatObj.value !== 'n/a'
      ? parseFloat(shortFloatObj.hover) || parseFloat(shortFloatObj.value.replace(/%/g, ''))
      : null;

    // Get short ratio (days to cover)
    const shortRatioObj = dataMap.get('shortRatio');
    const shortRatio = shortRatioObj && shortRatioObj.value !== 'n/a'
      ? parseFloat(shortRatioObj.hover) || parseFloat(shortRatioObj.value)
      : null;

    // Get short interest (actual shares)
    const shortIntObj = dataMap.get('shortInterest');
    const shortInterest = shortIntObj
      ? (parseShareValue(shortIntObj.hover) || parseShareValue(shortIntObj.value))
      : null;

    if (floatShares === null && sharesOutstanding === null) return null;

    const data: YahooFloatData = {
      floatShares,
      floatM: floatShares ? floatShares / 1e6 : null,
      sharesOutstanding,
      sharesOutM: sharesOutstanding ? sharesOutstanding / 1e6 : null,
      shortRatio: shortRatio !== null && !isNaN(shortRatio) ? shortRatio : null,
      shortPctOfFloat: shortPctOfFloat !== null && !isNaN(shortPctOfFloat) ? shortPctOfFloat : null,
      shortInterest,
      source: 'stockanalysis',
      fetchedAt: Date.now(),
    };

    cache.set(key, { data, time: Date.now() });
    return data;
  } catch {
    return null;
  }
}

/**
 * Fetch float data for multiple tickers (batched, concurrent).
 */
export async function fetchYahooFloatBatch(
  tickers: string[],
  concurrency = 4
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

    // Delay between batches to be respectful
    if (i + concurrency < tickers.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return results;
}

export type { YahooFloatData };
