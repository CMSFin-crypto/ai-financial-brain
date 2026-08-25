// ═══════════════════════════════════════════════════════════════
// NEWS INGESTION SERVICE
// Fetches news from Google News RSS, classifies, and stores in DB.
// Designed for IBKR universe tickers + macro news.
// ═══════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';
import { classifyNews, getTickerSector, type ClassifiedNews } from './news-event-classifier';

const prisma = new PrismaClient();

export interface IngestedNews extends ClassifiedNews {
  source: string;
  publishedAt: string;
  url: string;
}

export interface IngestResult {
  total: number;
  newEvents: number;
  duplicates: number;
  errors: number;
  items: IngestedNews[];
}

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// ── RSS Parsing ──

interface RawNewsItem {
  headline: string;
  source: string;
  publishedAt: string;
  url: string;
}

function parseRSS(xml: string, maxItems: number): RawNewsItem[] {
  const items: RawNewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
    const block = match[1];
    const titleMatch = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)
      || block.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/);
    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);

    const headline = titleMatch ? decodeEntities(titleMatch[1].trim()) : '';
    const url = linkMatch ? linkMatch[1].trim() : '';
    const publishedAt = pubDateMatch ? pubDateMatch[1].trim() : '';
    const source = sourceMatch ? sourceMatch[1].trim() : 'Google News';

    if (headline && !headline.includes('Google News')) {
      items.push({ headline, source, publishedAt, url });
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
    .replace(/&#39;/g, "'");
}

// ── News Fetching ──

/**
 * Fetch news from Google News RSS for a specific query.
 */
async function fetchRSS(query: string, maxItems = 20): Promise<RawNewsItem[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': BROWSER_UA },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSS(xml, maxItems);
  } catch {
    return [];
  }
}

/**
 * Ingest news for a specific ticker.
 */
export async function ingestNewsForTicker(ticker: string, maxItems = 15): Promise<IngestResult> {
  const rawItems = await fetchRSS(`${ticker} stock news`, maxItems);
  return processItems(rawItems, ticker);
}

/**
 * Ingest macro news (market-wide events).
 */
export async function ingestMacroNews(maxItems = 20): Promise<IngestResult> {
  const rawItems = await fetchRSS('US stock market Fed interest rate inflation', maxItems);
  return processItems(rawItems);
}

/**
 * Ingest news for all IBKR universe tickers (batched).
 * Call this from a cron job, not from user requests.
 */
export async function ingestUniverseNews(tickers: string[]): Promise<IngestResult> {
  const BATCH_SIZE = 5;
  const DELAY_MS = 300;
  let totalNew = 0;
  let totalDupes = 0;
  let totalErrors = 0;
  const allItems: IngestedNews[] = [];

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(t => ingestNewsForTicker(t, 10))
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        totalNew += r.value.newEvents;
        totalDupes += r.value.duplicates;
        totalErrors += r.value.errors;
        allItems.push(...r.value.items);
      } else {
        totalErrors++;
      }
    }

    if (i + BATCH_SIZE < tickers.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  return {
    total: allItems.length,
    newEvents: totalNew,
    duplicates: totalDupes,
    errors: totalErrors,
    items: allItems,
  };
}

/**
 * Process raw news items: classify, deduplicate, store.
 */
async function processItems(items: RawNewsItem[], knownTicker?: string): Promise<IngestResult> {
  let newEvents = 0;
  let duplicates = 0;
  let errors = 0;
  const result: IngestedNews[] = [];

  for (const item of items) {
    try {
      const classified = classifyNews(item.headline, '', knownTicker);
      if (!classified.ticker && !knownTicker) continue; // skip if no ticker detected

      const ticker = classified.ticker || knownTicker || '';
      const sector = getTickerSector(ticker);

      // Parse published date
      const publishedAt = item.publishedAt ? new Date(item.publishedAt) : new Date();
      if (isNaN(publishedAt.getTime())) continue;

      // Check for duplicate (same ticker + same day + similar headline)
      const dayStart = new Date(publishedAt);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const existing = await prisma.historicalNewsEvent.findFirst({
        where: {
          ticker,
          publishedAtUtc: { gte: dayStart, lt: dayEnd },
          headline: { contains: item.headline.slice(0, 40) },
        },
      });

      if (existing) {
        duplicates++;
        continue;
      }

      // Store in DB
      await prisma.historicalNewsEvent.create({
        data: {
          ticker,
          publishedAtUtc: publishedAt,
          source: item.source,
          headline: item.headline,
          summary: item.headline.slice(0, 200), // use headline as summary for now
          eventType: classified.eventType,
          sentimentScore: classified.sentimentScore,
          sentimentLabel: classified.sentimentLabel,
          noveltyScore: 0, // will be computed later
          macroVsMicro: classified.macroVsMicro,
          sector,
          benchmarkSymbol: 'SPY',
        },
      });

      newEvents++;
      result.push({
        ...classified,
        source: item.source,
        publishedAt: item.publishedAt,
        url: item.url,
      });
    } catch (err) {
      console.error('[NewsIngest] Error processing item:', err);
      errors++;
    }
  }

  return { total: items.length, newEvents, duplicates, errors, items: result };
}

/**
 * Get recent news for a ticker from DB.
 */
export async function getRecentNews(ticker: string, days = 30): Promise<any[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  return prisma.historicalNewsEvent.findMany({
    where: { ticker: ticker.toUpperCase(), publishedAtUtc: { gte: since } },
    orderBy: { publishedAtUtc: 'desc' },
    take: 50,
  });
}
