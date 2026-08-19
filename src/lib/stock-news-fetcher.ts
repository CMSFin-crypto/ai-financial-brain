// ═══════════════════════════════════════════════════════════════
// STOCK NEWS FETCHER — Google News RSS (no API key needed)
// Fetches recent headlines for specific stocks to explain
// why they are moving.
// ═══════════════════════════════════════════════════════════════

export interface StockNewsItem {
  headline: string;
  source: string;
  publishedAt: string;
  url: string;
}

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Cache
const newsCache = new Map<string, { items: StockNewsItem[]; time: number }>();
const NEWS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Fetch recent news headlines for a specific stock ticker.
 * Uses Google News RSS — no API key required.
 */
export async function fetchStockNews(ticker: string, maxItems = 5): Promise<StockNewsItem[]> {
  const cacheKey = ticker.toUpperCase();
  const cached = newsCache.get(cacheKey);
  if (cached && Date.now() - cached.time < NEWS_CACHE_TTL) {
    return cached.items;
  }

  try {
    // Search Google News for the ticker
    const query = encodeURIComponent(ticker + ' stock news');
    const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': BROWSER_UA },
    });

    if (!res.ok) return [];

    const xml = await res.text();
    const items = parseRSS(xml, maxItems);

    if (items.length > 0) {
      newsCache.set(cacheKey, { items, time: Date.now() });
    }

    return items;
  } catch {
    return [];
  }
}

/**
 * Fetch news for multiple tickers in parallel (for top candidates only).
 */
export async function fetchStockNewsBatch(tickers: string[], maxPerTicker = 3): Promise<Record<string, StockNewsItem[]>> {
  const results: Record<string, StockNewsItem[]> = {};

  // Fetch in parallel (max 5 at a time to avoid rate limits)
  for (let i = 0; i < tickers.length; i += 5) {
    const batch = tickers.slice(i, i + 5);
    const batchResults = await Promise.allSettled(
      batch.map(t => fetchStockNews(t, maxPerTicker))
    );

    batchResults.forEach((r, idx) => {
      if (r.status === 'fulfilled' && r.value.length > 0) {
        results[batch[idx]] = r.value;
      }
    });
  }

  return results;
}

/**
 * Parse Google News RSS XML into structured items.
 */
function parseRSS(xml: string, maxItems: number): StockNewsItem[] {
  const items: StockNewsItem[] = [];

  // Simple regex parsing (no XML parser needed)
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
    const block = match[1];

    const titleMatch = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)
      || block.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/);
    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);

    const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : '';
    const link = linkMatch ? linkMatch[1].trim() : '';
    const pubDate = pubDateMatch ? pubDateMatch[1].trim() : '';
    const source = sourceMatch ? sourceMatch[1].trim() : 'Google News';

    if (title && !title.includes('Google News')) {
      items.push({ headline: title, source, publishedAt: pubDate, url: link });
    }
  }

  return items;
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * Generate a "why is it moving" explanation based on price action data.
 * This works for ALL stocks without any API call.
 */
export function generateRiseReason(data: {
  symbol: string;
  dailyChangePct: number;
  relativeVolume: number;
  price: number;
  prevClose: number;
  history: { close: number; high: number; low: number; volume: number; date: string }[];
}): string {
  const { dailyChangePct, relativeVolume, price, prevClose, history, symbol } = data;
  const reasons: string[] = [];

  // Gap analysis
  if (history.length >= 2) {
    const prevHigh = history[history.length - 2]?.high || prevClose;
    const prevLow = history[history.length - 2]?.low || prevClose;
    const gapPct = ((price - prevHigh) / prevHigh) * 100;

    if (gapPct > 5) {
      reasons.push(`Gap up ${gapPct.toFixed(1)}% mbi High e dites se kaluar ($${prevHigh.toFixed(2)})`);
    } else if (gapPct > 2) {
      reasons.push(`Gap i vogel ${gapPct.toFixed(1)}% — hapur mbi High e dites se kaluar`);
    }
  }

  // Volume explanation
  if (relativeVolume >= 20) {
    reasons.push(`Volumi 20x+ mesataren — institucionale ose short squeeze e mundshem`);
  } else if (relativeVolume >= 10) {
    reasons.push(`Volumi 10x+ mesataren — vëmendje e larteinstitutionale`);
  } else if (relativeVolume >= 5) {
    reasons.push(`Volumi 5x+ mesataren — interes i zgjeruar`);
  }

  // Trend context
  if (history.length >= 5) {
    const last5 = history.slice(-6, -1);
    const avgClose5 = last5.reduce((a, d) => a + d.close, 0) / last5.length;
    const trendPct = ((avgClose5 - last5[0].close) / last5[0].close) * 100;

    if (trendPct > 10) {
      reasons.push(`Ne nje uptrend te fort — rritje ${trendPct.toFixed(1)}% ne 5 diten e fundit`);
    } else if (trendPct < -10 && dailyChangePct > 5) {
      reasons.push(`Rikthim pas renies se fundit — mund te jete reversal`);
    }

    // Breakout detection
    const recentHighs = last5.map(d => d.high);
    const resistance = Math.max(...recentHighs);
    if (price > resistance && resistance > 0) {
      reasons.push(`Breakout mbi rezistencen $${resistance.toFixed(2)} (5-ditore)`);
    }
  }

  // Momentum type classification
  if (dailyChangePct >= 30) {
    reasons.push('Lëvizje parabolike — zakonisht e shkaktuar nga lajm i forte (FDA, kontrate, ose short squeeze)');
  } else if (dailyChangePct >= 20) {
    reasons.push('Rritje e forte — ka gjasë të ketë lajm themeltare (earnings, partnership, ose miratim rregullator)');
  } else if (dailyChangePct >= 15) {
    reasons.push('Momentum i lartë — zakonisht lajm pozitiv ose short interest i lartë');
  } else if (dailyChangePct >= 10) {
    reasons.push('Momentum i fortë — lajm ose katalizator i mundshëm');
  }

  // Support bounce
  if (history.length >= 10) {
    const last10 = history.slice(-11, -1);
    const recentLow = Math.min(...last10.map(d => d.low));
    const lowDaysAgo = last10.find(d => d.low === recentLow);
    if (lowDaysAgo && price > recentLow * 1.03 && dailyChangePct >= 5) {
      const daysSince = history.length - 1 - history.indexOf(lowDaysAgo);
      reasons.push(`Bounce nga suporti $${recentLow.toFixed(2)} (${daysSince} dite me pare)`);
    }
  }

  if (reasons.length === 0) {
    reasons.push(`Rritje ${dailyChangePct.toFixed(1)}% me volum ${relativeVolume.toFixed(1)}x — verifikoni lajmin e fundit`);
  }

  return reasons.join('. ') + '.';
}

/**
 * Generate caution signals — when to be careful.
 * Based on price action, timing, and pattern analysis.
 */
export function generateCautionSignals(data: {
  symbol: string;
  dailyChangePct: number;
  relativeVolume: number;
  price: number;
  prevClose: number;
  floatShares: number | null;
  pillarCount: number;
  status: string;
  highMomentum: boolean;
  historicalScore: number;
  historicalPattern: { setupsFound: number; winRate1d: number; winRate5d: number; avgMaxDrawdown5d: number; historicalBias: string; avgReturn1d: number; };
}): string[] {
  const signals: string[] = [];
  const { dailyChangePct, relativeVolume, price, floatShares, pillarCount, status, highMomentum, historicalScore, historicalPattern } = data;

  // ⚠️ Timing signals
  const now = new Date();
  const hourET = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false })) || 12;
  const dayOfWeek = now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long' });
  const minuteET = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', minute: '2-digit' })) || 0;

  // Pre-market / first 15 min warning
  if (hourET >= 9 && hourET < 10 && minuteET < 15) {
    signals.push('9:30-9:45 ET — 15 min e para jane shume volatile, prit per konfirmim');
  }
  // Late day warning
  if (hourET >= 15) {
    signals.push('Pas ores 15:00 ET — rreziku i gap-it nese hapet me poshte neser');
  }
  // Friday afternoon
  if (dayOfWeek === 'Friday' && hourET >= 14) {
    signals.push('E premte pasdite — rrezik gap over weekend, mos hap pozicione te reja');
  }
  // Pre-holiday
  const month = now.getMonth();
  const date = now.getDate();
  if ((month === 11 && date >= 24) || (month === 0 && date <= 2)) {
    signals.push('Ditet festive — volumi i ulet, levizje te pakta, rrezik i larte');
  }

  // ⚠️ Pattern-based signals
  if (dailyChangePct >= 25) {
    signals.push('Rritje 25%+ — rrezik shume i larte i pullback-it neser. Mos ndiq ne opening.');
  }
  if (dailyChangePct >= 15 && relativeVolume >= 10) {
    signals.push('Volume climax — rritje e forte me volum te larte. Mund te jete topi i levizjes.');
  }
  if (relativeVolume >= 20) {
    signals.push('Volum 20x+ — ka gjas te jete short squeeze. Kujdes: kur terminojne shorti, rrenohet.');
  }

  // ⚠️ Price-level signals
  if (price <= 2) {
    signals.push('Penny stock — spread i gjere bid/ask, slippage i larte, manipulim i mundshem.');
  }
  if (price <= 1) {
    signals.push('Sub-dollar stock — rrezik ekstrem, shume broker nuk lejojne short, liquiditeti minimal.');
  }
  if (floatShares !== null && floatShares <= 2) {
    signals.push('Ultra-low float (<2M) — mund te rritet 100%+ por edhe te bie 50%+. Stop-i DUAJET te ngrohet.');
  }
  if (floatShares !== null && floatShares <= 5 && dailyChangePct >= 20) {
    signals.push('Float i vogel + rritje e madhe — maker-ja po kontrollon. Mos e ndiq nese nuk ke plan.');
  }

  // ⚠️ Historical pattern warnings
  if (historicalPattern.setupsFound >= 3) {
    if (historicalPattern.winRate1d < 40) {
      signals.push(`Historia tregon: vetem ${historicalPattern.winRate1d}% chance rritje diten neser (${historicalPattern.setupsFound} raste te ngjashme).`);
    }
    if (historicalPattern.avgMaxDrawdown5d >= 15) {
      signals.push(`Historia: drawdown mesatar ${historicalPattern.avgMaxDrawdown5d}% brenda 5 dites. Gati per rrezik?`);
    }
    if (historicalPattern.historicalBias === 'bearish') {
      signals.push('Bias historik BEARISH — rastet e ngjashme kane perfunduar me humbje mesatare.');
    }
  }

  // ⚠️ Status-specific
  if (status === 'FLOAT_REVIEW') {
    signals.push('Float i panjohur — verifikoni ne Finviz para se te hyni. Nese >20M, mos hyjni.');
  }
  if (pillarCount <= 2) {
    signals.push('Setup i dobet — vetem ' + pillarCount + '/5 pillar. Kjo nuk eshte trade sipas Ross Cameron.');
  }

  // ⚠️ General reminders
  if (highMomentum || (status === 'ELIGIBLE' && dailyChangePct >= 15)) {
    signals.push('Hapni pozicionin vetem pas konfirmimit (pullback ne VWAP, ose re-test i support).');
    signals.push('Stop loss DUAJET: nese nuk e keni vendosur stop, mos hyni.');
    signals.push('Max 1-2% e portfolio-se per nje trade. Mos rrisni pozicionin nese shkon kunder.');
  }

  return signals;
}
