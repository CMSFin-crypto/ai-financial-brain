import { NextResponse } from 'next/server';

export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════════════
// REAL FINANCIAL NEWS — Multiple RSS sources, no API key needed
// All news in one unified list, sorted by market impact
// ═══════════════════════════════════════════════════════════════════

interface NewsItem {
  title: string;
  snippet: string;
  source: string;
  url: string;
  publishedAt: string;
  impactLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  impactReasons: string[];
  affectedTickers: string[];
}

// Multiple RSS sources — financial focus, real-time
const RSS_FEEDS = [
  {
    url: 'https://news.google.com/rss/search?q=stock+market+earnings+fed+trading+nyse+nasdaq&hl=en-US&gl=US&ceid=US:en',
    name: 'Market News',
  },
  {
    url: 'https://news.google.com/rss/search?q=nvidia+apple+tesla+microsoft+amazon+google+meta+alphabet+broadcom&hl=en-US&gl=US&ceid=US:en',
    name: 'Big Tech Stocks',
  },
  {
    url: 'https://news.google.com/rss/search?q=federal+reserve+interest+rate+inflation+cpi+jobs+gdp+economy&hl=en-US&gl=US&ceid=US:en',
    name: 'Macro & Fed',
  },
  {
    url: 'https://news.google.com/rss/search?q=AI+semiconductor+chip+artificial+intelligence+openai+tech&hl=en-US&gl=US&ceid=US:en',
    name: 'AI & Tech',
  },
  {
    url: 'https://news.google.com/rss/search?q=oil+gold+treasury+bond+opec+commodities+dollar&hl=en-US&gl=US&ceid=US:en',
    name: 'Commodities & FX',
  },
  {
    url: 'https://news.google.com/rss/search?q=ipo+merger+acquisition+buyout+earnings+revenue+profit&hl=en-US&gl=US&ceid=US:en',
    name: 'M&A & Earnings',
  },
  {
    url: 'https://news.google.com/rss/search?q=trump+tariff+trade+war+sanctions+geopolitical+risk&hl=en-US&gl=US&ceid=US:en',
    name: 'Geopolitics & Trade',
  },
];

// Impact scoring keywords
const IMPACT_KEYWORDS: Record<string, number> = {
  // Very high impact (3 points)
  'fed': 3, 'federal reserve': 3, 'rate cut': 3, 'rate hike': 3, 'interest rate': 3,
  'recession': 3, 'crash': 3, 'plunge': 3, 'surge': 3, 'rally': 3,
  'bankruptcy': 3, 'default': 3,

  // High impact (2 points)
  'earnings': 2, 'revenue': 2, 'profit': 2, 'loss': 2, 'gdp': 2,
  'inflation': 2, 'cpi': 2, 'employment': 2, 'jobs report': 2,
  'merger': 2, 'acquisition': 2, 'ipo': 2, 'buyout': 2,
  'tariff': 2, 'trade war': 2, 'sanctions': 2, 'geopolitical': 2,
  'apple': 2, 'nvidia': 2, 'tesla': 2, 'microsoft': 2, 'google': 2,
  'amazon': 2, 'meta': 2, 'broadcom': 2, 'amd': 2,
  'semiconductor': 2, 'chip': 2, 'ai': 2, 'artificial intelligence': 2,
  's&p': 2, 'nasdaq': 2, 'dow jones': 2, 'stock market': 2,
  'ceo': 2, 'downgrade': 2, 'upgrade': 2, 'guidance': 2,

  // Medium impact (1 point)
  'oil price': 1, 'gold': 1, 'treasury': 1, 'bond': 1, 'opec': 1,
  'dividend': 1, 'buyback': 1, 'split': 1, 'regulation': 1,
  'forecast': 1, 'analyst': 1, 'target price': 1,
  'trump': 1, 'biden': 1, 'white house': 1, 'congress': 1,
  'elon musk': 1, 'warren buffett': 1,
};

const TICKER_MAP: Record<string, string[]> = {
  'apple': ['AAPL'], 'iphone': ['AAPL'], 'macbook': ['AAPL'], 'ios': ['AAPL'],
  'nvidia': ['NVDA'], 'gpu': ['NVDA'], 'cuda': ['NVDA'], 'blackwell': ['NVDA'],
  'tesla': ['TSLA'], 'elon musk': ['TSLA'], 'ev ': ['TSLA'],
  'microsoft': ['MSFT'], 'azure': ['MSFT'], 'copilot': ['MSFT'],
  'google': ['GOOGL'], 'alphabet': ['GOOGL'], 'youtube': ['GOOGL'], 'gemini': ['GOOGL'],
  'amazon': ['AMZN'], 'aws': ['AMZN'], 'prime': ['AMZN'],
  'meta': ['META'], 'facebook': ['META'], 'instagram': ['META'],
  'broadcom': ['AVGO'], 'vmware': ['AVGO'],
  'amd': ['AMD'], 'zen': ['AMD'],
  'netflix': ['NFLX'],
  'salesforce': ['CRM'],
  'oracle': ['ORCL'],
  'intel': ['INTC'],
  ' eli lilly': ['LLY'], 'lilly': ['LLY'], 'mounjaro': ['LLY'], 'zepbound': ['LLY'],
  'pfizer': ['PFE'], 'seagen': ['PFE'],
  'jpmorgan': ['JPM'], 'jpm': ['JPM'],
  'visa': ['V'], 'mastercard': ['MA'],
  'goldman': ['GS'],
  'unitedhealth': ['UNH'],
  'chevron': ['CVX'], 'exxon': ['XOM'],
};

function parseRSS(xml: string, sourceName: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const titleMatch = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)
      || block.match(/<title>([\s\S]*?)<\/title>/);
    const title = titleMatch?.[1]?.trim();
    if (!title || title.length < 20) continue;

    const descMatch = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)
      || block.match(/<description>([\s\S]*?)<\/description>/);
    let snippet = descMatch?.[1]?.trim() || '';
    snippet = snippet.replace(/<[^>]*>/g, '').substring(0, 400);

    const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/)
      || block.match(/<link>([\s\S]*?)<\/link>/);
    const url = linkMatch?.[1]?.trim() || '';

    const dateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const publishedAt = dateMatch?.[1]?.trim() || new Date().toISOString();

    const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);
    const source = sourceMatch?.[1]?.trim() || sourceName;

    // Calculate impact score
    const lowerText = (title + ' ' + snippet).toLowerCase();
    let impactScore = 0;
    const impactReasons: string[] = [];
    const affectedTickers: string[] = [];
    const seenTickers = new Set<string>();

    for (const [keyword, points] of Object.entries(IMPACT_KEYWORDS)) {
      if (lowerText.includes(keyword)) {
        impactScore += points;
        if (impactReasons.length < 3) impactReasons.push(keyword);
      }
    }

    // Find affected tickers
    for (const [keyword, tickers] of Object.entries(TICKER_MAP)) {
      if (lowerText.includes(keyword) && !seenTickers.has(tickers[0])) {
        affectedTickers.push(tickers[0]);
        seenTickers.add(tickers[0]);
      }
    }

    let impactLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (impactScore >= 6) impactLevel = 'HIGH';
    else if (impactScore >= 3) impactLevel = 'MEDIUM';

    items.push({
      title,
      snippet,
      source,
      url,
      publishedAt,
      impactLevel,
      impactReasons,
      affectedTickers,
    });
  }

  return items;
}

// Cache for 3 minutes
let cachedNews: { items: NewsItem[]; fetchedAt: number } | null = null;
const NEWS_CACHE_TTL = 3 * 60 * 1000;

export async function GET() {
  try {
    if (cachedNews && Date.now() - cachedNews.fetchedAt < NEWS_CACHE_TTL) {
      return NextResponse.json({ news: cachedNews.items, cached: true });
    }

    console.log('[NEWS] Fetching fresh news from', RSS_FEEDS.length, 'RSS feeds...');

    const results = await Promise.allSettled(
      RSS_FEEDS.map(async (feed) => {
        try {
          const res = await fetch(feed.url, {
            signal: AbortSignal.timeout(6000),
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
              'Accept': 'application/rss+xml, application/xml, text/xml, text/html',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const xml = await res.text();
          const items = parseRSS(xml, feed.name);
          console.log(`[NEWS] ${feed.name}: ${items.length} items`);
          return items;
        } catch (err) {
          console.error(`[NEWS] ${feed.name} failed:`, err);
          return [] as NewsItem[];
        }
      })
    );

    // Merge and deduplicate
    const allItems = results
      .filter((r): r is PromiseFulfilledResult<NewsItem[]> => r.status === 'fulfilled')
      .flatMap(r => r.value);

    const seen = new Set<string>();
    const unique = allItems.filter(item => {
      const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort: HIGH first, then MEDIUM, then LOW; newest within same level
    const impactOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    unique.sort((a, b) => {
      const impDiff = impactOrder[a.impactLevel] - impactOrder[b.impactLevel];
      if (impDiff !== 0) return impDiff;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

    const topItems = unique.slice(0, 40);
    cachedNews = { items: topItems, fetchedAt: Date.now() };

    const counts = {
      HIGH: topItems.filter(i => i.impactLevel === 'HIGH').length,
      MEDIUM: topItems.filter(i => i.impactLevel === 'MEDIUM').length,
      LOW: topItems.filter(i => i.impactLevel === 'LOW').length,
    };
    console.log(`[NEWS] Total: ${unique.length}, returning ${topItems.length} [H:${counts.HIGH} M:${counts.MEDIUM} L:${counts.LOW}]`);

    return NextResponse.json({ news: topItems, cached: false });
  } catch (error) {
    console.error('[NEWS] Fetch error:', error);
    if (cachedNews) {
      return NextResponse.json({ news: cachedNews.items, cached: true, stale: true });
    }
    return NextResponse.json({ error: 'Lajmet nuk mund te ngarkohen.' }, { status: 502 });
  }
}
