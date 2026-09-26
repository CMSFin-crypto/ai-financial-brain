// ═══════════════════════════════════════════════════════════════
// SOCIAL ARB — burimet e dhënave
//
// 1. Google Trends "Trending now" RSS — zbulimi (termi + trafiku).
// 2. GDELT DOC API — konfirmimi (seri 30-ditore + numërim artikujsh
//    24h për pragun mainstream). Kufizohet 1 kërkesë / 6 sekonda.
// 3. Yahoo Finance chart API — çmimet (aksioni + SPY si indeks).
// ═══════════════════════════════════════════════════════════════

import type { Region } from './types';

// ── Google Trends RSS ────────────────────────────────────────────

export interface TrendingTerm {
  term: string;
  approxTraffic: string | null; // "1000+"
  traffic: number | null;      // 1000
  newsTitle: string | null;
  newsSource: string | null;
  region: Region;
}

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchWithTimeout(url: string, ms = 15000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: '*/*' },
      cache: 'no-store',
    });
  } finally {
    clearTimeout(t);
  }
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

export async function fetchTrendingNow(region: Region): Promise<TrendingTerm[]> {
  const url = `https://trends.google.com/trending/rss?geo=${region}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Google Trends ${region}: HTTP ${res.status}`);
  const xml = await res.text();
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  const terms: TrendingTerm[] = [];
  for (const item of items) {
    const title = decodeXmlEntities((item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').trim());
    if (!title) continue;
    const trafficRaw = (item.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/)?.[1] ?? '').trim();
    const traffic = trafficRaw ? Number(trafficRaw.replace(/[^0-9]/g, '')) : null;
    const newsTitle = decodeXmlEntities((item.match(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/)?.[1] ?? '').trim() || '');
    const newsSource = decodeXmlEntities((item.match(/<ht:news_item_source>([\s\S]*?)<\/ht:news_item_source>/)?.[1] ?? '').trim() || '');
    terms.push({
      term: title,
      approxTraffic: trafficRaw || null,
      traffic: traffic && Number.isFinite(traffic) ? traffic : null,
      newsTitle: newsTitle || null,
      newsSource: newsSource || null,
      region,
    });
  }
  return terms;
}

// ── GDELT (me throttle) ──────────────────────────────────────────

let lastGdeltAt = 0;
const GDELT_MIN_GAP_MS = 6000; // API kërkon 1 kërkesë / 5s — kemi 6s

export interface GdeltDailyPoint { date: string; value: number } // YYYY-MM-DD

async function gdeltFetch(params: string): Promise<unknown> {
  // prit deri sa të kalojë distanca minimale
  const wait = lastGdeltAt + GDELT_MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastGdeltAt = Date.now();
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?${params}&format=json`;
  let res = await fetchWithTimeout(url, 12000);
  if (res.status === 429 && !process.env.VERCEL) {
    // njëtentativë e dytë pas 12s — vetëm lokalisht: në serverless koha e funksionit
    // është e kufizuar (60s) dhe një 429 i menjëhershëm është më i shtrenjtë sesa
    // vlen; motori mban matjen e fundit të vlefshme (carry-over) në vend të saj.
    await new Promise(r => setTimeout(r, 12000));
    lastGdeltAt = Date.now();
    res = await fetchWithTimeout(url, 12000);
  }
  if (!res.ok) throw new Error(`GDELT: HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim().startsWith('{')) return {}; // "{}" bosh ose mesazh teksti
  return JSON.parse(text);
}

/** Seri ditore e intensitetit të volumenit për termi (agreguar nga orare). */
export async function gdeltDailySeries(query: string): Promise<GdeltDailyPoint[]> {
  const data = (await gdeltFetch(
    `query=${encodeURIComponent(query)}&mode=timelinevol&timespan=30d`,
  )) as { timeline?: { data?: { date: string; value: number }[] }[] };
  const hourly = data.timeline?.[0]?.data ?? [];
  const byDay = new Map<string, number>();
  for (const p of hourly) {
    const day = p.date.slice(0, 8);
    byDay.set(day, (byDay.get(day) ?? 0) + (p.value ?? 0));
  }
  return [...byDay.entries()]
    .map(([d, v]) => ({ date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, value: v }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Numri i artikujve 24h të fundit (deri 250) — testimi mainstream. */
export async function gdeltArticleCount(query: string): Promise<number> {
  const data = (await gdeltFetch(
    `query=${encodeURIComponent(query)}&mode=artlist&maxrecords=250&timespan=1d`,
  )) as { articles?: unknown[] };
  return data.articles?.length ?? 0;
}

// ── Çmimet (Yahoo chart API) ─────────────────────────────────────

export interface PricePoint { date: string; close: number } // YYYY-MM-DD

export async function fetchDailyCloses(ticker: string, range = '1mo'): Promise<PricePoint[]> {
  const sym = encodeURIComponent(ticker.toUpperCase());
  const res = await fetchWithTimeout(
    `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=${range}&interval=1d`,
    15000,
  );
  if (!res.ok) throw new Error(`Yahoo ${ticker}: HTTP ${res.status}`);
  const j = (await res.json()) as {
    chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] };
  };
  const r = j.chart?.result?.[0];
  const ts = r?.timestamp ?? [];
  const closes = r?.indicators?.quote?.[0]?.close ?? [];
  const out: PricePoint[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (typeof c !== 'number' || !Number.isFinite(c)) continue;
    out.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: c });
  }
  return out;
}

/** Close-i i fundit i SPY (indeks referimi). */
export async function fetchIndexCloses(): Promise<PricePoint[]> {
  return fetchDailyCloses('SPY', '1mo');
}
