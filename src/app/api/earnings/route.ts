import { NextResponse } from 'next/server';

export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════════
// KALENDARI I FITIMEVE — data REALE të raportimeve (s'ka më hardcoded)
//
// Burimi primar:  Nasdaq Calendar API (api.nasdaq.com/api/calendar/earnings)
//                 → datat e raportimeve të ardhshme, BMO/AMC, EPS consensus.
// Fallback:       Yahoo Finance quoteSummary (calendarEvents + price)
//                 për një listë tickera-sh popullore — data e raportimit
//                 të radhës për secilën kompani.
//                 Nëse asnjë burim s'përgjigjet → source:'none' (UI e shfaq
//                 sinqerisht; s'falim të dhëna të trukuara).
// Cache in-memory 60 min.
// ═══════════════════════════════════════════════════════════════

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const WINDOW_DAYS = 75;        // sa ditë përpara mbulohen (≈ 3 muaj)
const CONCURRENCY = 12;        // kërkesa paralele në batch
const REQ_TIMEOUT_MS = 5000;   // timeout për kërkesë
const CACHE_TTL_MS = 60 * 60 * 1000;

export interface EarningEntry {
  ticker: string;
  company: string;
  date: string;          // "2026-10-13" — data e raportimit
  time: string;          // 'BMO' | 'AMC' | 'TBD'
  epsEstimate: number | null;
  epsActual: number | null;
  estimated?: boolean;   // true = data është parashikim (jo e konfirmuar)
}

export interface EarningsPayload {
  earnings: EarningEntry[];
  byDate: Record<string, EarningEntry[]>;
  months: string[];
  totalEntries: number;
  source: 'nasdaq' | 'yahoo' | 'none';
  fetchedAt: string;
}

let cache: { data: EarningsPayload; at: number } | null = null;
let inflight: Promise<EarningsPayload> | null = null;

// ─── Ndihmës ───
function localISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseEps(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = /-?\d+(?:\.\d+)?/.exec(raw.replace(/,/g, ''));
  if (!m) return null;
  const v = parseFloat(m[0]);
  return Number.isFinite(v) ? v : null;
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQ_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ─── Burimi 1: Nasdaq — një kërkesë për çdo ditë tregtare ───
function nasdaqTimeToSlot(time?: string): string {
  if (time === 'time-pre-market') return 'BMO';
  if (time === 'time-after-market') return 'AMC';
  return 'TBD';
}

async function fetchFromNasdaq(dates: string[]): Promise<EarningEntry[] | null> {
  const out: EarningEntry[] = [];
  let okDays = 0;
  const seen = new Set<string>();
  const headers = {
    'User-Agent': UA,
    Accept: 'application/json, text/plain, */*',
    Origin: 'https://www.nasdaq.com',
    Referer: 'https://www.nasdaq.com/',
  };

  for (let i = 0; i < dates.length; i += CONCURRENCY) {
    const batch = dates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (date) => {
      const json = await fetchJson(
        `https://api.nasdaq.com/api/calendar/earnings?date=${date}&limit=200`,
        headers
      ) as { data?: { rows?: Array<{ symbol?: string; name?: string; time?: string; epsForecast?: string }> } } | null;
      if (!json || !Array.isArray(json.data?.rows)) return null;
      return json.data.rows
        .map((r) => ({
          ticker: String(r.symbol || '').trim().toUpperCase(),
          company: String(r.name || '').trim(),
          date,
          time: nasdaqTimeToSlot(r.time),
          epsEstimate: parseEps(r.epsForecast),
          epsActual: null as number | null,
          estimated: false,
        }))
        .filter((e) => e.ticker && /^[A-Z.\-]{1,6}$/.test(e.ticker));
    }));
    for (const r of results) {
      if (!r) continue;
      okDays++;
      for (const e of r) {
        const key = `${e.ticker}:${e.date}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(e);
      }
    }
  }
  return okDays > 0 ? out : null;
}

// ─── Burimi 2 (fallback): Yahoo Finance — data e raportit të radhës ───
const FALLBACK_TICKERS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B', 'JPM', 'V',
  'JNJ', 'WMT', 'PG', 'MA', 'HD', 'UNH', 'KO', 'PEP', 'BAC', 'ADBE',
  'CRM', 'NFLX', 'AMD', 'INTC', 'CSCO', 'ORCL', 'AVGO', 'QCOM', 'PYPL', 'UBER',
  'DIS', 'BA', 'CAT', 'GE', 'IBM', 'MCD', 'NKE', 'MRK', 'PFE', 'TMO',
  'ABT', 'LLY', 'COST', 'TGT', 'LOW', 'CVX', 'XOM', 'COP', 'GS', 'MS',
  'SCHW', 'SPGI', 'C', 'WFC', 'USB', 'PNC', 'AXP', 'BLK', 'COIN', 'PLTR',
  'SOFI', 'HOOD', 'RIVN', 'SNOW', 'DDOG', 'NET', 'MDB', 'ABNB', 'LYFT', 'DASH',
  'DKNG', 'SBUX', 'CMG', 'MU', 'TXN', 'AMAT', 'LRCX', 'KLAC', 'ADP', 'GILD',
  'AMGN', 'BMY', 'CELG', 'FLT', 'DAL', 'LUV', 'MAR', 'AAL', 'UAL', 'T',
];

async function fetchFromYahoo(tickers: string[]): Promise<EarningEntry[] | null> {
  try {
    // Cookie + crumb (Yahoo i kërkon për quoteSummary)
    const ck = await fetch('https://fc.yahoo.com', {
      headers: { 'User-Agent': UA },
      cache: 'no-store',
    }).catch(() => null);
    const setCookie = ck?.headers.get('set-cookie') || '';
    const mCookie = /([A-Za-z_-]+=[^;,\s]+)/.exec(setCookie);
    const cookieStr = mCookie ? mCookie[1] : '';

    const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, ...(cookieStr ? { Cookie: cookieStr } : {}) },
      cache: 'no-store',
    });
    const crumb = crumbRes.ok ? (await crumbRes.text()).trim() : '';
    if (!crumb || crumb.length > 64) return null;

    const yHeaders = { 'User-Agent': UA, Accept: 'application/json', ...(cookieStr ? { Cookie: cookieStr } : {}) };
    const today = new Date();
    const maxDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + WINDOW_DAYS);
    const out: EarningEntry[] = [];

    for (let i = 0; i < tickers.length; i += CONCURRENCY) {
      const batch = tickers.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(async (ticker) => {
        const j = await fetchJson(
          `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=calendarEvents%2Cprice&crumb=${encodeURIComponent(crumb)}`,
          yHeaders
        ) as {
          quoteSummary?: {
            result?: Array<{
              calendarEvents?: { earnings?: { earningsDate?: Array<{ fmt?: string }>; isEarningsDateEstimate?: boolean; earningsAverage?: { raw?: number } } };
              price?: { shortName?: string };
            }>;
          };
        } | null;
        const r = j?.quoteSummary?.result?.[0];
        const ce = r?.calendarEvents?.earnings;
        const dateStr = ce?.earningsDate?.[0]?.fmt || '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
        const d = new Date(`${dateStr}T00:00:00`);
        if (d < new Date(today.getFullYear(), today.getMonth(), today.getDate())) return null;
        if (d > maxDate) return null;
        return {
          ticker,
          company: r?.price?.shortName || ticker,
          date: dateStr,
          time: 'TBD',
          epsEstimate: typeof ce?.earningsAverage?.raw === 'number' ? ce.earningsAverage.raw : null,
          epsActual: null as number | null,
          estimated: ce?.isEarningsDateEstimate !== false,
        } as EarningEntry;
      }));
      for (const r of results) if (r) out.push(r);
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

// ─── Ndërtimi i përgjigjes ───
function buildPayload(earnings: EarningEntry[], source: EarningsPayload['source']): EarningsPayload {
  const sorted = [...earnings].sort((a, b) =>
    a.date.localeCompare(b.date) || (a.time === 'BMO' ? -1 : b.time === 'BMO' ? 1 : 0)
  );
  const byDate: Record<string, EarningEntry[]> = {};
  for (const e of sorted) {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  }
  const months = [...new Set(sorted.map((e) => e.date.slice(0, 7)))].sort();
  return {
    earnings: sorted,
    byDate,
    months,
    totalEntries: sorted.length,
    source,
    fetchedAt: new Date().toISOString(),
  };
}

async function buildFresh(): Promise<EarningsPayload> {
  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i <= WINDOW_DAYS; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue; // vetëm ditë tregtare
    dates.push(localISODate(d));
  }

  let earnings = await fetchFromNasdaq(dates);
  let source: EarningsPayload['source'] = 'nasdaq';
  if (!earnings || earnings.length === 0) {
    earnings = await fetchFromYahoo(FALLBACK_TICKERS);
    source = 'yahoo';
  }
  if (!earnings || earnings.length === 0) {
    return buildPayload([], 'none');
  }
  return buildPayload(earnings, source);
}

export async function GET() {
  // Cache i ngrohtë
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return NextResponse.json({ ...cache.data, cached: true });
  }
  // Tjetër në fluturim — prite atë
  if (inflight) {
    return NextResponse.json({ ...(await inflight), cached: false });
  }
  inflight = buildFresh();
  try {
    const data = await inflight;
    // Mos cache-o dështimet ('none') — provo përsëri herën tjetër
    if (data.source !== 'none') {
      cache = { data, at: Date.now() };
    }
    return NextResponse.json({ ...data, cached: false });
  } finally {
    inflight = null;
  }
}
