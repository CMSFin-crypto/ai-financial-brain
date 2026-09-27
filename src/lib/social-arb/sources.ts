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

// ── Çmimet (multi-burim, me gabime të eksplicite) ────────────────
//
// Rendit i provave: stockanalysis.com (pa çelës, i qëndrueshëm — close të
// ajustuar) → Yahoo query2 → Yahoo query1. Yahoo ndëshkon IP-të që bëjnë
// burst-kërkesa me HTTP 429 (kjo ishte shkaku që çmimet dilnin bosh);
// prandaj burimi primar është stockanalysis.com dhe çdo dështim ruhet
// me burimin + statusin konkrete, që gabimi të shfaqet në panelin teknik
// e jo si «0%» ose «pa të dhëna» misterioze.

export interface PricePoint { date: string; close: number } // YYYY-MM-DD

/** Historia e një gabimi të çmimit — shfaqet në panelin teknik. */
export interface PriceFetchError {
  source: string;       // 'stockanalysis' | 'yahoo-q2' | 'yahoo-q1'
  status: number | null; // HTTP status ose null (rrjet/timeout)
  message: string;
}

export interface PriceSeries {
  ticker: string;
  source: string;         // burimi që dha të dhënat
  closes: PricePoint[];   // renditur ngjitëse sipas datës
}

export class PriceFeedError extends Error {
  attempts: PriceFetchError[];
  constructor(ticker: string, attempts: PriceFetchError[]) {
    super(`${ticker}: ${attempts.map(a => `${a.source} ${a.status ?? ''} ${a.message}`.trim()).join('; ')}`);
    this.name = 'PriceFeedError';
    this.attempts = attempts;
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** stockanalysis.com — histori ditore (t=datë, c=close, a=close i ajustuar). */
async function fetchStockAnalysis(ticker: string, range: string): Promise<PricePoint[]> {
  const sym = encodeURIComponent(ticker.toUpperCase());
  const res = await fetchWithTimeout(
    `https://stockanalysis.com/api/symbol/s/${sym}/history?range=${range}&period=Daily`,
    12000,
  );
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { httpStatus: res.status });
  const j = (await res.json()) as { status?: number; data?: { t: string; c: number; a?: number }[] };
  const rows = j.data ?? [];
  if (!rows.length) throw Object.assign(new Error(`përgjigje bosh (${rows.length} rreshta)`), { httpStatus: res.status });
  // rreshtat vijnë zbritëse (më e reja e para) → ktheji ngjitëse
  return rows
    .map(r => ({ date: r.t, close: typeof r.a === 'number' && Number.isFinite(r.a) ? r.a : r.c }))
    .filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.close))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Yahoo v8 chart — fallback (i ndjeshëm ndaj 429 pas burst-esh). */
async function fetchYahoo(ticker: string, range: string, host: 'query1' | 'query2'): Promise<PricePoint[]> {
  const sym = encodeURIComponent(ticker.toUpperCase());
  const res = await fetchWithTimeout(
    `https://${host}.finance.yahoo.com/v8/finance/chart/${sym}?range=${range}&interval=1d`,
    12000,
  );
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { httpStatus: res.status });
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
  if (!out.length) throw Object.assign(new Error('përgjigje pa close të vlefshme'), { httpStatus: res.status });
  return out;
}

/**
 * Merr close-t ditore për një ticker — provon burimet në rend dhe
 kur dështon të gjithë, hedh PriceFeedError me listën e plotë të
 tentativave (burim + status + mesazh) për t'u ruajtur dhe shfaqur.
 */
export async function fetchDailyCloses(ticker: string, range = '3M'): Promise<PricePoint[]> {
  const series = await fetchPriceSeries(ticker, range);
  return series.closes;
}

/** Si fetchDailyCloses, por kthen edhe burimin (për panelin teknik). */
export async function fetchPriceSeries(ticker: string, range = '3M'): Promise<PriceSeries> {
  const attempts: PriceFetchError[] = [];
  const providers: { source: string; fn: () => Promise<PricePoint[]> }[] = [
    { source: 'stockanalysis', fn: () => fetchStockAnalysis(ticker, range) },
    { source: 'yahoo-q2', fn: () => fetchYahoo(ticker, range, 'query2') },
    { source: 'yahoo-q1', fn: () => fetchYahoo(ticker, range, 'query1') },
  ];
  for (const p of providers) {
    try {
      const closes = await p.fn();
      return { ticker: ticker.toUpperCase(), source: p.source, closes };
    } catch (e) {
      const err = e as Error & { httpStatus?: number };
      attempts.push({
        source: p.source,
        status: err.httpStatus ?? null,
        message: err.name === 'TimeoutError' || err.name === 'AbortError' ? 'timeout' : err.message,
      });
      await sleep(400); // mos i shty burimet në burst
    }
  }
  throw new PriceFeedError(ticker.toUpperCase(), attempts);
}

/** Close-i i fundit i SPY (indeks referimi). */
export async function fetchIndexCloses(): Promise<PricePoint[]> {
  return fetchDailyCloses('SPY', '3M');
}

// ── GDELT: lista e artikujve (për verifikimin e shkakut) ────────

export interface GdeltArticle {
  title: string;
  url: string;
  domain: string;
  seenAt: string; // ISO
}

/** Artikujt e fundit (deri 50): numri + titujt/URL-t — ushqen klasifikimin e shkakut. */
export async function gdeltArticleList(query: string, maxRecords = 50): Promise<{ count: number; articles: GdeltArticle[] }> {
  const data = (await gdeltFetch(
    `query=${encodeURIComponent(query)}&mode=artlist&maxrecords=${maxRecords}&timespan=1d&sort=datedesc`,
  )) as { articles?: { title?: string; url?: string; domain?: string; seendate?: string }[] };
  const articles: GdeltArticle[] = [];
  for (const a of data.articles ?? []) {
    if (!a.title || !a.url) continue;
    // seendate: "20260926T121500Z" → ISO
    const sd = a.seendate ?? '';
    const iso = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.test(sd)
      ? `${sd.slice(0, 4)}-${sd.slice(4, 6)}-${sd.slice(6, 8)}T${sd.slice(9, 11)}:${sd.slice(11, 13)}:${sd.slice(13, 15)}Z`
      : new Date().toISOString();
    articles.push({ title: a.title, url: a.url, domain: a.domain ?? '', seenAt: iso });
  }
  return { count: articles.length, articles };
}
