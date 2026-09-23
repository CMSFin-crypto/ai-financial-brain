// ═══════════════════════════════════════════════════════════════
// Task 28 — IBKR VALIDATION / earnings-history.ts
// KALENDARI HISTORIK I EARNINGS — 100% POINT-IN-TIME.
//
// Burimi: SEC EDGAR Submissions API (pa key, 10 req/s, publik).
//   → Çdo raportim tremujor publikohet me formë 8-K, Item 2.02
//     "Results of Operations and Financial Condition".
//   → Data e filing-ut = dita e publikimit të earnings (BMO para
//     9:30 ose AMC pas 16:00 — EDGAR jep datën e pranimit).
//   → 1000 filings e fundit për kompani ≈ 5-11 vjet historik.
//
// Surprise + PEAD (proxy nga çmimi — estimates historike nuk
// ekzistojnë pa burim me pagesë):
//   reaction2d = kthimi close(D−1) → close(D+1) — kap si BMO ashtu AMC
//   drift5d    = kthimi close(D+1) → close(D+6) — PEAD
//   Njihen VETËM pasi ditët përkatëse të kenë kaluar (pa look-ahead).
// ═══════════════════════════════════════════════════════════════
import { HistoricalDataPoint } from '@/lib/alpha-vantage';

const SEC_HEADERS: Record<string, string> = {
  'User-Agent': 'FinancialBrain/1.0 (contact@example.com)',
  'Accept': 'application/json',
};
const TICKER_URL = 'https://www.sec.gov/files/company_tickers.json';
const SEC_BASE = 'https://data.sec.gov';

export interface EarningsEvent {
  symbol: string;
  /** data e filing-ut 8-K Item 2.02 (YYYY-MM-DD) = dita e publikimit */
  announceDate: string;
  /** proxy surprise: kthimi 2-ditor rreth ditës së publikimit (close D-1 → close D+1) */
  reaction2dPct: number | null;
  /** proxy PEAD: kthimi 5-ditor pas reagimit (close D+1 → close D+6) */
  drift5dPct: number | null;
}

export interface EarningsTimeline {
  symbol: string;
  events: EarningsEvent[]; // të renditura sipas announceDate
  /** indeks datash për kërkim të shpejtë */
  dateIdx: Map<string, number>;
}

// ── Cache-t (module-level, për serverless warm invocations) ──
let tickerCikMap: { map: Map<string, number>; at: number } | null = null;
const TICKER_MAP_TTL = 24 * 3600 * 1000;

const submissionsCache = new Map<string, { dates: string[]; at: number }>();
const SUBMISSIONS_TTL = 12 * 3600 * 1000;

const timelineCache = new Map<string, { timeline: EarningsTimeline; at: number }>();
const TIMELINE_TTL = 12 * 3600 * 1000;

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/** Map TICKER → CIK (një thirrje për të gjithë universin) */
async function getTickerCikMap(): Promise<Map<string, number>> {
  if (tickerCikMap && Date.now() - tickerCikMap.at < TICKER_MAP_TTL) {
    return tickerCikMap.map;
  }
  const res = await fetch(TICKER_URL, { headers: SEC_HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`company_tickers.json ${res.status}`);
  const raw = (await res.json()) as Record<string, { cik_str: number; ticker: string }>;
  const map = new Map<string, number>();
  for (const v of Object.values(raw)) map.set(v.ticker.toUpperCase(), v.cik_str);
  tickerCikMap = { map, at: Date.now() };
  return map;
}

/**
 * Datat e earnings për NJË simbol: 8-K me Item 2.02 (submissions JSON).
 * Cache 12h — bosh → [] (simboli do jetë event-neutral).
 */
async function fetchEarningsDates(symbol: string): Promise<string[]> {
  const cached = submissionsCache.get(symbol);
  if (cached && Date.now() - cached.at < SUBMISSIONS_TTL) return cached.dates;

  try {
    const cikMap = await getTickerCikMap();
    const cik = cikMap.get(symbol);
    if (!cik) { submissionsCache.set(symbol, { dates: [], at: Date.now() }); return []; }

    const url = `${SEC_BASE}/submissions/CIK${String(cik).padStart(10, '0')}.json`;
    const res = await fetch(url, { headers: SEC_HEADERS, signal: AbortSignal.timeout(15000) });
    if (!res.ok) { submissionsCache.set(symbol, { dates: [], at: Date.now() }); return []; }

    const raw = await res.json();
    const recent = raw?.filings?.recent || {};
    const forms: string[] = recent.form || [];
    const dates: string[] = recent.filingDate || [];
    const items: string[] = recent.items || [];

    const out: string[] = [];
    for (let i = 0; i < forms.length; i++) {
      if (forms[i] !== '8-K') continue;
      const it = items[i] || '';
      if (!it.includes('2.02')) continue; // vetëm "Results of Operations" = earnings
      if (dates[i]) out.push(dates[i]);
    }
    submissionsCache.set(symbol, { dates: out, at: Date.now() });
    return out;
  } catch {
    submissionsCache.set(symbol, { dates: [], at: Date.now() });
    return [];
  }
}

/**
 * PLOTËSON eventin me proxy surprise/PEAD nga baret ditore.
 *   reaction2d: close(D+1)/close(D-1) − 1
 *   drift5d:    close(D+6)/close(D+1) − 1
 * Këto janë KARAKTERISTIKA të eventit të kaluar — përdoren në Event
 * Score vetëm ditët kur dita e sinjalit i ka kaluar (pa look-ahead).
 */
function enrichWithPrice(events: EarningsEvent[], bars: HistoricalDataPoint[]): void {
  const dateIdx = new Map<string, number>();
  bars.forEach((b, i) => dateIdx.set(b.date, i));

  for (const ev of events) {
    const i = dateIdx.get(ev.announceDate);
    if (i === undefined || i < 1) { ev.reaction2dPct = null; ev.drift5dPct = null; continue; }
    const base = bars[i - 1].close;
    const r2 = i + 1 < bars.length ? bars[i + 1].close : null;
    const d5 = i + 6 < bars.length ? bars[i + 6].close : null;
    ev.reaction2dPct = base > 0 && r2 !== null ? +(((r2 - base) / base) * 100).toFixed(2) : null;
    ev.drift5dPct = r2 !== null && r2 > 0 && d5 !== null ? +(((d5 - r2) / r2) * 100).toFixed(2) : null;
  }
}

/**
 * Ndërton timeline-të e earnings për një listë simbolesh (me pacing EDGAR).
 * Kthen: { timelines, fetched, withEvents } — me cache 12h për simbol.
 */
export async function fetchEarningsTimelines(
  symbols: string[],
  hist: Record<string, HistoricalDataPoint[] | null>,
): Promise<{ timelines: Record<string, EarningsTimeline>; fetched: number; withEvents: number }> {
  const timelines: Record<string, EarningsTimeline> = {};
  let fetched = 0;
  let withEvents = 0;

  const BATCH = 6; // EDGAR: max 10 req/s — 6 me pauzë është e sigurt
  const list = [...new Set(symbols.map(s => s.toUpperCase()))];

  for (let i = 0; i < list.length; i += BATCH) {
    const batch = list.slice(i, i + BATCH);
    const cachedAll = batch.every(s => timelineCache.has(s));
    if (!cachedAll) {
      await Promise.all(batch.map(async (s) => {
        if (timelineCache.has(s)) return;
        const dates = await fetchEarningsDates(s);
        const events: EarningsEvent[] =
          dates.map(d => ({ symbol: s, announceDate: d, reaction2dPct: null, drift5dPct: null }));
        const bars = hist[s];
        if (bars && bars.length > 0) enrichWithPrice(events, bars);
        timelineCache.set(s, { timeline: { symbol: s, events, dateIdx: new Map() }, at: Date.now() });
      }));
      fetched += batch.length;
      if (i + BATCH < list.length) await sleep(250);
    }
  }

  for (const s of list) {
    const c = timelineCache.get(s);
    if (!c) continue;
    const tl = c.timeline;
    tl.events.sort((a, b) => a.announceDate.localeCompare(b.announceDate));
    tl.dateIdx = new Map(tl.events.map((e, i) => [e.announceDate, i]));
    timelines[s] = tl;
    if (tl.events.length > 0) withEvents++;
  }

  return { timelines, fetched, withEvents };
}

// ═══════════════════════════════════════════════════════════════
// EVENT STATE as-of — pika e integrimit me motorin e backtest-it
// ═══════════════════════════════════════════════════════════════

export interface EventStateAsOf {
  /** ditë TREGTIMIT deri në earnings-in e ardhshëm (nga nesërja); null = e panjohur */
  daysUntilNext: number | null;
  /** a ka earnings pikërisht nesër (ditën e hyrjes)? */
  earningsTomorrow: boolean;
  /** a ka earnings brenda 2 ditëve trading? */
  earningsWithin2d: boolean;
  /** a ka earnings brenda 3-7 ditëve trading? */
  earningsWithin7d: boolean;
  /** eventi i fundit i NDODHUR (i njohur plotësisht) */
  lastKnown: EarningsEvent | null;
  /** surprise i ditës së fundit pas earnings (reagimi 2-ditor i njohur) */
  lastReactionKnown: EarningsEvent | null;
  /** PEAD i ditës së fundit pas earnings (drift 5-ditor i njohur) */
  lastDriftKnown: EarningsEvent | null;
  hasData: boolean;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** gjej indeksin e parengjitur me binary search mbi datat e kalendrit */
function calendarFloor(calendar: string[], dateKey: string): number {
  let lo = 0, hi = calendar.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cmp(calendar[mid], dateKey) <= 0) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}

/**
 * Gjendja e eventeve as-of ditën e sinjalit (mbyllja e ditës t).
 *  - next earnings: datat ≥ t+1 (nesër është dita e parë e hyrjes)
 *  - i njohur: announceDate < t dhe (për surprise) t > D+1, (për drift) t > D+6
 */
export function eventStateAsOf(
  timeline: EarningsTimeline | undefined,
  signalDate: string,
  calendar: string[],
): EventStateAsOf {
  if (!timeline || timeline.events.length === 0) {
    return {
      daysUntilNext: null, earningsTomorrow: false, earningsWithin2d: false,
      earningsWithin7d: false, lastKnown: null, lastReactionKnown: null,
      lastDriftKnown: null, hasData: false,
    };
  }

  // ── ditët e ardhshme mbi kalendarin e tregtimit ──
  const sigIdx = calendarFloor(calendar, signalDate);
  const nextIdx = sigIdx + 1; // dita e parë e mundshme e hyrjes
  let nextEventIdx = -1;
  const evs = timeline.events;
  for (let i = 0; i < evs.length; i++) {
    if (cmp(evs[i].announceDate, signalDate) > 0) { nextEventIdx = i; break; }
  }

  let daysUntilNext: number | null = null;
  let earningsTomorrow = false;
  let earningsWithin2d = false;
  let earningsWithin7d = false;

  if (nextEventIdx >= 0 && nextIdx < calendar.length) {
    const evDate = evs[nextEventIdx].announceDate;
    // numëro ditët TREGTIMIT nga nesërshja deri në ditën e earnings
    let count = 0;
    let found = false;
    for (let d = nextIdx; d < calendar.length; d++) {
      if (cmp(calendar[d], evDate) >= 0) { found = true; break; }
      count++;
    }
    if (found) {
      daysUntilNext = count;
      earningsTomorrow = count === 0;
      earningsWithin2d = count <= 2;
      earningsWithin7d = count > 2 && count <= 7;
    }
  }

  // ── eventi i fundit i ndodhur + njohuria as-of ──
  let lastKnown: EarningsEvent | null = null;
  let lastReactionKnown: EarningsEvent | null = null;
  let lastDriftKnown: EarningsEvent | null = null;
  for (let i = nextEventIdx === -1 ? evs.length - 1 : nextEventIdx - 1; i >= 0; i--) {
    const ev = evs[i];
    if (!lastKnown && cmp(ev.announceDate, signalDate) < 0) lastKnown = ev;
    // surprise njihet pas D+1 (mbyllja e ditës pas reagimit)
    if (!lastReactionKnown && cmp(ev.announceDate, signalDate) < 0 && ev.reaction2dPct !== null) {
      const rIdx = calendarFloor(calendar, ev.announceDate);
      if (rIdx >= 0 && rIdx + 1 <= sigIdx) lastReactionKnown = ev;
    }
    // drift njihet pas D+6
    if (!lastDriftKnown && cmp(ev.announceDate, signalDate) < 0 && ev.drift5dPct !== null) {
      const rIdx = calendarFloor(calendar, ev.announceDate);
      if (rIdx >= 0 && rIdx + 6 <= sigIdx) lastDriftKnown = ev;
    }
    if (lastKnown && lastReactionKnown && lastDriftKnown) break;
  }

  return {
    daysUntilNext, earningsTomorrow, earningsWithin2d, earningsWithin7d,
    lastKnown, lastReactionKnown, lastDriftKnown, hasData: true,
  };
}

/**
 * PIKËT E AFËRSISË së earnings-it — Varianti B (Event filter):
 *   Earnings brenda 2 ditëve:  -3
 *   Earnings brenda 3-7 ditë:  -1
 *   Mbi 7 ditë larg:            0
 */
export function proximityPoints(st: EventStateAsOf): number {
  if (st.earningsWithin2d) return -3;
  if (st.earningsWithin7d) return -1;
  return 0;
}

/**
 * PIKËT E SURPRISE/PEAD — Varianti C+ (Event score):
 *   Surprise pozitiv (reagim >= +2%) + drift pozitiv (PEAD):  +2
 *   Surprise pozitiv pa drift:                                 +1
 *   Surprise negativ (reagim <= -2%):                         -2
 */
export function surprisePoints(st: EventStateAsOf): number {
  if (st.lastDriftKnown) {
    const r = st.lastDriftKnown.reaction2dPct ?? 0;
    const d = st.lastDriftKnown.drift5dPct ?? 0;
    if (r >= 2) return d > 0 ? 2 : 1;
    if (r <= -2) return -2;
  } else if (st.lastReactionKnown) {
    const r = st.lastReactionKnown.reaction2dPct ?? 0;
    if (r >= 2) return 1;
    if (r <= -2) return -2;
  }
  return 0;
}

/** Totali: Event Score i plotë (afërsia + surprise/PEAD) */
export function eventScorePoints(st: EventStateAsOf): number {
  return proximityPoints(st) + surprisePoints(st);
}
