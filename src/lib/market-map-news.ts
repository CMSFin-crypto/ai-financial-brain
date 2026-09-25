// ═══════════════════════════════════════════════════════════════
// MARKET MAP NEWS — "Pse lëviz" (why is it moving) për popup-in e mapës.
//
// Burimi primar: Yahoo Finance RSS për ticker (titujt më të freskët —
// i njëjti koncept si tooltip-i i Finviz: lajmi i fundit shpjegon lëvizjen).
// Fallback: Google News RSS me kërkim "SYMBOL stock".
//
// Cache 5 min në memorie — mouse-hover s'duhet të bombardojë Yahoo-n.
// Vetëm lexim (pa DB) — ngritja e popup-it s'krijon asgjë të përhershme.
// ═══════════════════════════════════════════════════════════════

export interface WhyNewsItem {
  headline: string;
  source: string;
  url: string;
  publishedAt: string; // ISO 8601
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ── Parse RSS (e njëjta qasje regex si news-ingestion.ts, pa varësi) ──

interface RawItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

function domainToSource(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Yahoo Finance';
  }
}

function parseRssItems(xml: string, maxItems: number): RawItem[] {
  const items: RawItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
    const block = match[1];
    const title =
      block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
      block.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    const link = block.match(/<link[^>]*>([\s\S]*?)<\/link>/);
    const pubDate = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/);
    const srcTag = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);

    const headline = title ? decodeEntities(title[1].trim()) : '';
    if (!headline || headline.includes('Google News')) continue;
    const url = link ? link[1].trim() : '';
    items.push({
      title: headline,
      link: url,
      pubDate: pubDate ? pubDate[1].trim() : '',
      source: srcTag ? decodeEntities(srcTag[1].trim()) : domainToSource(url),
    });
  }
  return items;
}

// ── Fetch me timeout + falje të heshtur ──

async function fetchYahooRss(symbol: string, maxItems: number): Promise<RawItem[]> {
  try {
    const res = await fetch(
      `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`,
      {
        signal: AbortSignal.timeout(7000),
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'application/rss+xml, application/xml, text/xml, */*',
        },
        cache: 'no-store',
      },
    );
    if (!res.ok) return [];
    return parseRssItems(await res.text(), maxItems);
  } catch {
    return [];
  }
}

async function fetchGoogleRss(symbol: string, maxItems: number): Promise<RawItem[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`"${symbol}" stock`)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(7000),
      headers: { 'User-Agent': BROWSER_UA },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return parseRssItems(await res.text(), maxItems);
  } catch {
    return [];
  }
}

// ── Cache 5 min për simbol (hover i shpeshtë mbi të njëjtin ticker) ──

const whyCache = new Map<string, { items: WhyNewsItem[]; fetchedAt: number }>();
const WHY_CACHE_TTL_MS = 5 * 60 * 1000;

function toIso(pubDate: string, fallbackNow: number): string {
  if (pubDate) {
    const ts = new Date(pubDate).getTime();
    if (Number.isFinite(ts)) return new Date(ts).toISOString();
  }
  return new Date(fallbackNow).toISOString();
}

/**
 * Lajmet më të fundit për një ticker — "arsyeja pse lëviz".
 * Renditur si vjen nga feed-i (më i riu i pari), max `maxItems` tituj.
 */
export async function getWhyMoving(
  symbol: string,
  maxItems = 3,
): Promise<{ symbol: string; items: WhyNewsItem[]; fetchedAt: number; cached: boolean }> {
  const key = symbol.toUpperCase();
  const hit = whyCache.get(key);
  if (hit && Date.now() - hit.fetchedAt < WHY_CACHE_TTL_MS) {
    return { symbol: key, items: hit.items, fetchedAt: hit.fetchedAt, cached: true };
  }

  // 1) Yahoo RSS — titujt e dedikuar për ticker
  let raw = await fetchYahooRss(key, maxItems * 2);
  // 2) Fallback — Google News kërkim
  if (raw.length === 0) raw = await fetchGoogleRss(key, maxItems * 2);

  const now = Date.now();
  const seen = new Set<string>();
  const items: WhyNewsItem[] = [];
  for (const r of raw) {
    if (items.length >= maxItems) break;
    const dedupeKey = r.title.slice(0, 60).toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    items.push({
      headline: r.title,
      source: r.source || domainToSource(r.link),
      url: r.link,
      publishedAt: toIso(r.pubDate, now),
    });
  }

  // Rezultat bosh ruhet gjithashtu — të mos rrahim Yahoo-n kot për tickers pa lajme
  whyCache.set(key, { items, fetchedAt: now });
  return { symbol: key, items, fetchedAt: now, cached: false };
}
