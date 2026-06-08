import { NextRequest, NextResponse } from 'next/server';

// In-memory cache for ticker search results
const searchCache = new Map<string, { data: any; fetchedAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes cache

interface YahooQuoteResult {
  symbol: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  quoteType?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  marketCap?: number;
  sector?: string;
  industry?: string;
}

// Search Yahoo Finance for any ticker
async function searchYahooFinance(query: string): Promise<YahooQuoteResult[]> {
  const endpoints = [
    'https://query1.finance.yahoo.com',
    'https://query2.finance.yahoo.com',
  ];

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  for (const base of endpoints) {
    try {
      // Use Yahoo Finance v1 search API
      const url = `${base}/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(6000),
        headers,
      });

      if (!res.ok) continue;

      const data = await res.json();
      const quotes = (data?.quotes || []).filter(
        (q: any) =>
          q.quoteType === 'EQUITY' &&
          q.symbol &&
          q.exchange &&
          // Filter out mutual funds, ETFs, indices unless specifically searched
          (q.exchange === 'NYQ' || q.exchange === 'NYS' || q.exchange === 'NAS' || q.exchange === 'NMS' ||
           q.exchange === 'ASE' || q.exchange === 'BTS' || q.exchange === 'ARCX' || q.exchange === 'NYSE' ||
           q.exchange === 'NASDAQ')
      );

      if (quotes.length > 0) {
        return quotes.map((q: any) => ({
          symbol: q.symbol,
          shortname: q.shortname || q.longname || q.symbol,
          longname: q.longname || q.shortname,
          exchange: q.exchange,
          quoteType: q.quoteType,
        }));
      }
    } catch (err: any) {
      console.log(`[SEARCH] Yahoo ${base} failed: ${err?.message || 'unknown'}`);
      continue;
    }
  }

  return [];
}

// Get price for a ticker not in our database
async function fetchExternalPrice(ticker: string): Promise<{ price: number; change: number; volume: number } | null> {
  const endpoints = [
    'https://query1.finance.yahoo.com',
    'https://query2.finance.yahoo.com',
  ];

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'application/json',
  };

  for (const base of endpoints) {
    try {
      const url = `${base}/v8/finance/chart/${ticker}?range=1d&interval=1d`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers,
      });
      if (!res.ok) continue;

      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (!result?.meta) continue;

      const price = result.meta.regularMarketPrice;
      const prevClose = result.meta.chartPreviousClose || result.meta.previousClose;
      const volume = result.meta.regularMarketVolume || 0;

      if (!price || price <= 0) continue;

      const change = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
      return {
        price: parseFloat(price.toFixed(2)),
        change: parseFloat(change.toFixed(2)),
        volume,
      };
    } catch {
      continue;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query || query.length < 1) {
    return NextResponse.json({ error: 'Query required' }, { status: 400 });
  }

  const q = query.trim().toUpperCase();

  // Check cache first
  const cached = searchCache.get(q);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  // Search Yahoo Finance for matching tickers
  const results = await searchYahooFinance(q);

  // Enrich results with live prices for top results
  const enriched = [];
  for (const item of results.slice(0, 5)) {
    const priceData = await fetchExternalPrice(item.symbol);
    enriched.push({
      ticker: item.symbol,
      company: item.longname || item.shortname || `${item.symbol} Corp`,
      exchange: item.exchange,
      price: priceData?.price || 0,
      change: priceData?.change || 0,
      volume: priceData?.volume || 0,
      isExternal: true,
    });
  }

  const responseData = { results: enriched, query: q };
  searchCache.set(q, { data: responseData, fetchedAt: Date.now() });

  return NextResponse.json(responseData);
}
