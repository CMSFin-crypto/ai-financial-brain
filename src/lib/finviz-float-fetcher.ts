// ═══════════════════════════════════════════════════════════════
// FINVIZ FLOAT FETCHER — Scrapes real float shares from Finviz
// No API key needed. Used to verify float for 5 Pillars scanner.
// ═══════════════════════════════════════════════════════════════

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Cache: ticker → { floatM, sharesOutM, shortFloat, name, sector, industry, fetchedAt }
interface FinvizData {
  floatM: number | null;      // Float in millions
  sharesOutM: number | null;  // Shares Outstanding in millions
  shortFloat: number | null;  // Short % of float
  name: string;
  sector: string;
  industry: string;
  marketCap: string;
  avgVolume: string;
  relVolume: number;
}

const floatCache = new Map<string, { data: FinvizData; time: number }>();
const FLOAT_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Fetch float data for a single ticker from Finviz.
 * Returns null if fetch fails.
 */
export async function fetchFinvizFloat(ticker: string): Promise<FinvizData | null> {
  const key = ticker.toUpperCase();
  const cached = floatCache.get(key);
  if (cached && Date.now() - cached.time < FLOAT_CACHE_TTL) {
    return cached.data;
  }

  try {
    const url = `https://finviz.com/quote.ashx?t=${key}`;
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
    const data = parseFinvizHtml(html);

    if (data) {
      floatCache.set(key, { data, time: Date.now() });
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Fetch float data for multiple tickers (batched, max 3 concurrent).
 */
export async function fetchFinvizFloatBatch(tickers: string[]): Promise<Record<string, FinvizData>> {
  const results: Record<string, FinvizData> = {};

  for (let i = 0; i < tickers.length; i += 3) {
    const batch = tickers.slice(i, i + 3);
    const batchResults = await Promise.allSettled(
      batch.map(t => fetchFinvizFloat(t))
    );

    batchResults.forEach((r, idx) => {
      if (r.status === 'fulfilled' && r.value) {
        results[batch[idx].toUpperCase()] = r.value;
      }
    });

    // Delay between batches to avoid rate limiting
    if (i + 3 < tickers.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

/**
 * Parse Finviz HTML to extract key data.
 */
function parseFinvizHtml(html: string): FinvizData | null {
  try {
    // Extract all table cells with their labels
    const data: Record<string, string> = {};

    // Finviz uses snapshot-table with td pairs: label + value
    const tableRegex = /<td[^>]*class="[^"]*snapshot-td[^"]*"[^>]*>([\s\S]*?)<\/td>/gi;
    let match;
    const cells: string[] = [];

    while ((match = tableRegex.exec(html)) !== null) {
      cells.push(cleanHtml(match[1]));
    }

    // Process pairs: even index = label, odd index = value
    for (let i = 0; i < cells.length - 1; i += 2) {
      const label = cells[i].trim();
      const value = cells[i + 1].trim();
      if (label && value) {
        data[label] = value;
      }
    }

    // Also try the newer tab-link format
    if (Object.keys(data).length === 0) {
      const linkRegex = /<a[^>]*class="tab-link"[^>]*>([\s\S]*?)<\/a>/gi;
      const valueRegex = /<b[^>]*>([\s\S]*?)<\/b>/gi;

      const labels: string[] = [];
      const values: string[] = [];

      let m;
      while ((m = linkRegex.exec(html)) !== null) {
        labels.push(cleanHtml(m[1]).trim());
      }
      while ((m = valueRegex.exec(html)) !== null) {
        values.push(cleanHtml(m[1]).trim());
      }

      for (let i = 0; i < Math.min(labels.length, values.length); i++) {
        if (labels[i] && values[i]) {
          data[labels[i]] = values[i];
        }
      }
    }

    // Extract company name from title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const name = titleMatch ? cleanHtml(titleMatch[1]).split(' Stock ')[0].trim() : '';

    // Parse float (Shs Float)
    const floatStr = findValue(data, ['Shs Float', 'Float', 'Float (Mil)']);
    const floatM = parseMillions(floatStr);

    // Parse shares outstanding (Shs Outstand)
    const sharesStr = findValue(data, ['Shs Outstand', 'Outstanding', 'Shares Out', 'Shares Outstanding']);
    const sharesOutM = parseMillions(sharesStr);

    // Parse short interest (% of Float)
    const shortStr = findValue(data, ['Short Float', 'Short % of Float', 'Short Interest', 'Short Ratio']);
    const shortFloat = parsePercent(shortStr);

    // Parse sector/industry
    const sector = findValue(data, ['Sector']) || '';
    const industry = findValue(data, ['Industry']) || '';

    // Market cap
    const marketCap = findValue(data, ['Market Cap', 'Cap']) || '';

    // Avg volume & rel volume
    const avgVolume = findValue(data, ['Avg Volume', 'Average Volume']) || '';
    const relVolStr = findValue(data, ['Rel Volume', 'Relative Volume']);
    const relVolume = parseFloat(relVolStr.replace(/x/i, '')) || 0;

    return {
      floatM,
      sharesOutM,
      shortFloat,
      name,
      sector,
      industry,
      marketCap,
      avgVolume,
      relVolume,
    };
  } catch {
    return null;
  }
}

/**
 * Find a value from data map with multiple possible keys.
 */
function findValue(data: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    if (data[key]) return data[key];
    // Case insensitive
    const lowerKey = key.toLowerCase();
    for (const [k, v] of Object.entries(data)) {
      if (k.toLowerCase() === lowerKey) return v;
    }
  }
  return '';
}

/**
 * Parse a string like "15.5M" or "1.2B" into millions.
 */
function parseMillions(str: string): number | null {
  if (!str) return null;
  const cleaned = str.replace(/,/g, '').trim();

  const bMatch = cleaned.match(/^([\d.]+)\s*B/i);
  if (bMatch) return parseFloat(bMatch[1]) * 1000;

  const mMatch = cleaned.match(/^([\d.]+)\s*M/i);
  if (mMatch) return parseFloat(mMatch[1]);

  const kMatch = cleaned.match(/^([\d.]+)\s*K/i);
  if (kMatch) return parseFloat(kMatch[1]) / 1000;

  // Plain number (assume millions if > 1000)
  const num = parseFloat(cleaned);
  if (!isNaN(num) && num > 0) {
    return num > 10000 ? num / 1e6 : num;
  }

  return null;
}

/**
 * Parse percentage string.
 */
function parsePercent(str: string): number | null {
  if (!str) return null;
  const cleaned = str.replace(/%/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Clean HTML tags and entities.
 */
function cleanHtml(str: string): string {
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type { FinvizData };
