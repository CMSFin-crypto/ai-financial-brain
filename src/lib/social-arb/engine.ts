// ═══════════════════════════════════════════════════════════════
// SOCIAL ARB — motori i zbulimit automatik (v4 — i varur nga provat)
//
// 1. Merr termat në rritje nga Google Trends "Trending now" (US/GB/CA/AU)
//    → DISCOVERED: u gjet termi dhe marka.
// 2. WATCH: lidhja me ticker-in u verifikua (GDELT u lexua me sukses),
//    por kërkesa reale ose reagimi i tregut mungon.
// 3. RESEARCH — VETËM me të GJITHA provat:
//    (a) shkaku i trendit klasifikohet potencialisht pozitiv (tituj
//        me provë kërkece — jo thjesht lançim/lajm),
//    (b) provë e pavarur e kërkesës (GDELT ≥ +25% 7d kundrejt bazës 28d),
//    (c) çmimet e vlefshme DHE të freskëta (dritarja e balancuar me
//        të NJËJTAT data për aksionin dhe SPY; feed-i s'dështoi),
//    (d) pa flamur bllokues (promo/event/mainstream).
//    Score-i ≥ 60 mbetet kusht SEKONDAR — 75 pa prova s'anashkalon asgjë.
// 4. REMOVED (REJECT): shkak negativ, lidhja e gabuar, mainstream
//    (≥200 artikuj/24h — rregulli i Camillo), çmimi ka reaguar >+10%
//    ndaj indeksit, ose interesi u ftoh.
// 5. Çdo kandidat — PËRFSHI refuzuarit — gjurmohet për rezultatin e
//    çmimit pas 5 dhe 20 ditësh tregtimi, kundrejt SPY.
// 6. Çdo matje arkivohet në CSV (prapavijë) për backtest.
//
// Çmimet: kur feed-i dështon, gabimi konkret (burimi + statusi HTTP)
// ruhet në kandidat dhe shfaqet në panel — mungesa e të dhënave NUK
// kthehet kurrë në 0% apo «pa reagim».
// ═══════════════════════════════════════════════════════════════

import { classifyTerm, effectiveMateriality, type BrandEntry } from './brands';
import {
  fetchTrendingNow, gdeltDailySeries, gdeltArticleList, fetchPriceSeries, fetchIndexCloses,
  type GdeltDailyPoint, type GdeltArticle, type PricePoint, type TrendingTerm,
} from './sources';
import { readStore, writeStore, mergeMeasurements, archiveToCsv, acquireScanLock } from './store';
import type {
  Candidate, CandidateStatus, CauseArticle, CauseInfo, CauseType, Measurement, OutcomePoint, Region,
  ScanRecord, ScanResultSummary, ScoreBreakdown, SocialArbStore,
} from './types';

const REGIONS: Region[] = ['US', 'GB', 'CA', 'AU'];
const MAINSTREAM_ARTICLES = 200;   // Camillo: dil kur bëhet mainstream
const CONFIRM_GROWTH = 0.25;       // provë e pavarur: +25% 7d kundrejt bazës 28d
const PRICE_WINDOW_OPEN = 0.03;     // ≤ +3% vs SPY — dritarja e hyrjes e hapur
const PRICE_WINDOW_CLOSED = 0.10;   // > +10% vs SPY — e mbyllur
const PRICE_WINDOW_DAYS = 7;       // dritarja kalendarike e reagimit
const STALE_DAYS = 10;             // pa matje të reja → ftohje
const RESEARCH_SCORE = 60;         // kusht SEKONDAR — kurrë zëvendës i provave
const MAX_GDELT_CANDIDATES = 10;   // kufi kohor: 2 thirrje GDELT × 6s secila
const MAX_OUTCOME_TRACKED = 12;    // kufi gjurmimesh rezultatesh për skanim
const MEASUREMENTS_CAP = 6000;     // kufizi i store-it (arkivi CSV mbetet i plotë)

// Buxheti kohor i skanimit: në Vercel Hobby funksionet ndalen në 60s —
// skanimi duhet ta mbyllë veten me nder përpara. 0 = pa limit (lokal/sandbox).
const SCAN_BUDGET_MS: number = (() => {
  const v = Number(process.env.SCAN_BUDGET_MS);
  if (Number.isFinite(v) && v > 0) return v;
  return process.env.VERCEL ? 35_000 : 0;
})();

// ── ndihmës ──────────────────────────────────────────────────────

const todayISO = () => new Date().toISOString().slice(0, 10);
const dayMs = (s: string) => Date.parse(`${s}T00:00:00Z`);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[Math.floor((s.length - 1) / 2)] + s[Math.floor(s.length / 2)]) / 2 : 0;
};
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const pct = (n: number | null) => (n === null ? 'n/a' : `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`);

// ── mutex — një skanim në akt ────────────────────────────────────

let scanning: Promise<ScanResultSummary> | null = null;
export function scanInProgress(): boolean {
  return scanning !== null;
}

/** Një skanim po ekzekutohet në një proces/instancë tjetër (lock Redis). */
export class ScanLockError extends Error {
  constructor() {
    super('Një skanim po ekzekutohet në një instancë tjetër (lock).');
    this.name = 'ScanLockError';
  }
}

export function runScan(): Promise<ScanResultSummary> {
  if (scanning) return scanning;
  const p = (async () => {
    const release = await acquireScanLock(900);
    if (!release) throw new ScanLockError();
    try {
      return await doScan();
    } finally {
      void release();
    }
  })();
  scanning = p.finally(() => { scanning = null; });
  return scanning;
}

// ═══════════════════════════════════════════════════════════════
// P1 — dritarja e balancuar e çmimeve (e pastër, e testueshme)
// ═══════════════════════════════════════════════════════════════

export interface PriceWindow {
  asOf: string;             // data e fundit e PËRBASHKËT (të dyja anët kanë close)
  fromDate: string;         // data e parë e përbashkët e dritares
  stockPrice: number;        // close i aksionit në asOf
  indexPrice: number;        // close i SPY në asOf
  fromStockPrice: number;
  fromIndexPrice: number;
  stockReturn: number;
  indexReturn: number;
  priceVsIndex: number;
}

/**
 * Llogarit reagimin relativ në një dritare ku aksioni dhe SPY krahasohen
 * në të NJËJTAT data tregtimi (prerja e kalendareve të dy serive).
 * Kthen null kur s'ka ≥2 close të përbashkët — thjesht «e pamatshme»,
//  kurrë 0%.
 */
export function computePriceWindow(stock: PricePoint[], spy: PricePoint[], windowDays = PRICE_WINDOW_DAYS): PriceWindow | null {
  const spyMap = new Map(spy.map(p => [p.date, p.close]));
  const common = stock.filter(p => spyMap.has(p.date));
  if (common.length < 2) return null;
  const asOf = common[common.length - 1];
  const target = dayMs(asOf.date) - windowDays * 86400000;
  let fromIdx = common.findIndex(p => dayMs(p.date) >= target);
  if (fromIdx === -1 || fromIdx === common.length - 1) {
    fromIdx = common.length - 2; // zgjerohet pak prapa — s'ka pikë tjetër në dritare
  }
  if (fromIdx < 0) return null;
  const from = common[fromIdx];
  if (from.date >= asOf.date) return null;
  const stockReturn = asOf.close / from.close - 1;
  const indexReturn = (spyMap.get(asOf.date) as number) / (spyMap.get(from.date) as number) - 1;
  return {
    asOf: asOf.date, fromDate: from.date,
    stockPrice: asOf.close, indexPrice: spyMap.get(asOf.date) as number,
    fromStockPrice: from.close, fromIndexPrice: spyMap.get(from.date) as number,
    stockReturn, indexReturn, priceVsIndex: stockReturn - indexReturn,
  };
}

/** Close-i i fundit i vlefshëm në ose para datës (për rreshtat e matjeve). */
export function lastCloseOnOrBefore(closes: PricePoint[] | undefined, date: string): number | null {
  if (!closes || !closes.length) return null;
  let best: PricePoint | null = null;
  for (const p of closes) {
    if (p.date <= date && (!best || p.date > best.date)) best = p;
  }
  return best ? best.close : null;
}

// ═══════════════════════════════════════════════════════════════
// P2 — klasifikimi i shkakut të trendit (i pastër, i testueshëm)
// ═══════════════════════════════════════════════════════════════

const CAUSE_NEGATIVE_STRONG = [
  'lawsuit', 'sued', 'sues', 'recall', 'recalled', 'layoffs', 'layoff', 'bankruptcy', 'fraud',
  'scandal', 'outage', 'data breach', 'shooting', 'explosion', 'arrested', 'investigation',
  'plunge', 'plunged', 'crash', 'collaps', 'resigns', 'resignation', 'strike',
];
const CAUSE_NEGATIVE_WEAK = [
  'cut', 'cuts', 'dropped', 'drops', 'fell', 'falls', 'slump', 'slides', 'missed', 'misses',
  'warns', 'warning', 'downgrade', 'probe', 'halts', 'slashed',
];
const CAUSE_POSITIVE = [
  'sales surge', 'surge in demand', 'demand rises', 'demand jumps', 'sold out', 'sells out',
  'record sales', 'beats estimates', 'strong sales', 'subscribers add', 'added subscribers',
  'bestseller', 'best-seller', 'waitlist', 'waiting list', 'backlog', 'orders jump', 'orders surge',
  'revenue rises', 'revenue jumps', 'profit jumps', 'raises guidance', 'raised guidance', 'upgrade',
];
const CAUSE_LAUNCH = [
  'launch', 'launches', 'launched', 'announces', 'announced', 'release', 'releases', 'released',
  'trailer', 'teaser', 'new season', 'new episode', 'premiere', 'unveils', 'debuts', 'rumor',
  'rumour', 'leak', 'leaked', 'coming soon', 'schedule', 'lineup', 'line-up', 'new releases',
  'what\'s new', 'whats new', 'coming to', 'set to release', 'drops on',
];

function countKeywordHits(texts: string[], keywords: string[]): { total: number; hits: string[] } {
  const lower = texts.map(t => t.toLowerCase());
  const hits: string[] = [];
  let total = 0;
  for (const kw of keywords) {
    let n = 0;
    for (const t of lower) {
      if (t.includes(kw)) n++;
    }
    if (n > 0) { total += n; hits.push(kw); }
  }
  return { total, hits };
}

/**
 * Klasifikon PSE po kërkohet termi — nga titujt e artikujve të fundit
 * (GDELT) + lajmi i bashkangjitur në RSS të Trends. Kthen tipin,
 * arsyen dhe provat (fjalët kyçe) që ta mund të kontrollosh vetë.
 */
export function classifyCause(
  articles: GdeltArticle[],
  newsTitle: string | null,
  newsSource: string | null,
  checkedAt: string,
): CauseInfo {
  const titles = articles.map(a => a.title);
  const texts = newsTitle ? [...titles, newsTitle] : titles;
  const neg = countKeywordHits(texts, CAUSE_NEGATIVE_STRONG);
  const negWeak = countKeywordHits(texts, CAUSE_NEGATIVE_WEAK);
  const pos = countKeywordHits(texts, CAUSE_POSITIVE);
  const launch = countKeywordHits(texts, CAUSE_LAUNCH);

  let type: CauseType;
  let reason: string;
  let keywords: string[];

  if (neg.total >= 1 || negWeak.total >= 2) {
    type = 'negative_event';
    keywords = neg.hits.length ? neg.hits : negWeak.hits;
    reason = `Titujt e lajmeve flasin për zhvillime negative (${[...neg.hits, ...negWeak.hits].slice(0, 5).join(', ')} në ${neg.total + negWeak.total} përmendje) — kjo S'është kërkesë pozitive për produktin; kandidati refuzohet sipas rregullit të provave.`;
  } else if (pos.total >= 2) {
    type = 'positive_demand_possible';
    keywords = pos.hits;
    reason = `Titujt përmbajnë prova të mundshme kërkece (${pos.hits.slice(0, 5).join(', ')} — ${pos.total} përmendje) që lidhen me shitje/kërkesë, jo thjesht me lançim. Kërkon verifikim shtesë, por ka bazë.`;
  } else if (launch.total >= 2 || (launch.total >= 1 && pos.total === 0 && !newsTitle)) {
    type = 'news_launch_no_proof';
    keywords = launch.hits;
    reason = `Titujt janë lajme/lançime (${launch.hits.slice(0, 5).join(', ')} — ${launch.total} përmendje) pa ndonjë provë shitjesh ose kërkece të matshme. Të qenit në lajme ≠ shitje në rritje.`;
  } else if (launch.total >= 1) {
    type = 'news_launch_no_proof';
    keywords = launch.hits;
    reason = `Pjesa dërrmuese e titujve janë lajme/lançime (${launch.hits.slice(0, 5).join(', ')}) dhe asnjë provë shitjesh (0 fjalë kyçese pozitive). Të qenit në lajme ≠ shitje në rritje.`;
  } else {
    type = 'unclear';
    keywords = [];
    reason = texts.length
      ? `Titujt (${texts.length}) s'përmbajnë fjalë kyçesh të mjaftueshme as për kërkesë pozitive, as për lançim, as për ngjarje negative — shkaku mbetet i paqartë dhe kandidati nuk mund të ngjitet pa prova.`
      : 'S\'ka artikuj 24h për këtë term — shkaku s\'mund të verifikohet pa materiale.';
  }

  const saved: CauseArticle[] = articles.slice(0, 5).map(a => ({
    title: a.title, url: a.url, domain: a.domain, seenAt: a.seenAt,
  }));

  return {
    type, reason, keywords,
    articles: saved,
    newsTitle, newsSource, checkedAt,
  };
}

export const CAUSE_LABELS: Record<CauseType, string> = {
  positive_demand_possible: 'Kërkesë pozitive e mundshme',
  news_launch_no_proof: 'Lajm/lançim pa provë shitjesh',
  negative_event: 'Ngjarje negative',
  unclear: 'E paqartë',
};

// ═══════════════════════════════════════════════════════════════
// P4 — gjurmimi i rezultatit 5/20 ditë (i pastër, i testueshëm)
// ═══════════════════════════════════════════════════════════════

/**
 * Përditëson rezultatin e kandidatit: baza = close-i i përbashkët më i
 * afërt me zbulimin; d5/d20 = pas 5/20 ditësh TREGTIMI, aksioni kundrejt
 * SPY në të njëjtat data. Faqet e mbushura nuk ridekzistojnë kurrë.
 */
export function updateOutcome(
  cand: Candidate,
  stock: PricePoint[] | null,
  spy: PricePoint[] | null,
  now: string,
): void {
  const o = cand.outcome;
  o.lastCheckedAt = now;
  if (!stock || !stock.length || !spy || !spy.length) {
    o.pendingNote = 'çmimet për gjurmimin e rezultatit s\'u morën këtë kontroll — provohet sërish herën tjetër';
    return;
  }
  const spyMap = new Map(spy.map(p => [p.date, p.close]));
  const common = stock.filter(p => spyMap.has(p.date)).sort((a, b) => a.date.localeCompare(b.date));
  if (common.length < 2) { o.pendingNote = 's\'ka close të përbashkët aksion/SPY për gjurmim'; return; }

  // baza: close-i i përbashkët më i afërt me datën e zbulimit (preferon të njëjtën ditë/pas)
  if (!o.baseDate || !o.baseStock || !o.baseIndex) {
    const seen = cand.firstSeenAt.slice(0, 10);
    let baseIdx = common.findIndex(p => p.date >= seen);
    if (baseIdx === -1) baseIdx = common.length - 1;
    if (baseIdx > 0 && dayMs(common[baseIdx].date) - dayMs(seen) > 3 * 86400000) baseIdx -= 1;
    const base = common[baseIdx];
    if (dayMs(base.date) < dayMs(seen) - 3 * 86400000) {
      o.baseDate = null; o.baseStock = null; o.baseIndex = null;
      o.pendingNote = `historia e çmimeve s'shkon prapa ${common[0].date} — baza e zbulimit (${seen}) s'mund të rikthehet`;
      return;
    }
    o.baseDate = base.date;
    o.baseStock = base.close;
    o.baseIndex = spyMap.get(base.date) as number;
  }

  const baseIdx = common.findIndex(p => p.date === o.baseDate);
  if (baseIdx === -1) { o.pendingNote = 'baza e ruajtur s\'gjendet më në seri — shtohet sërish'; o.baseDate = null; return; }

  const fill = (tradingDays: number): { point: OutcomePoint | null; pending: string | null } => {
    const idx = baseIdx + tradingDays;
    if (idx >= common.length) {
      const left = idx - (common.length - 1);
      return { point: null, pending: `prit edhe ${left} ditë tregtimi për d${tradingDays}` };
    }
    const p = common[idx];
    const stockRet = p.close / (o.baseStock as number) - 1;
    const indexRet = (spyMap.get(p.date) as number) / (o.baseIndex as number) - 1;
    return {
      point: {
        date: p.date, stockPrice: p.close, indexPrice: spyMap.get(p.date) as number,
        stockRet, indexRet, relative: stockRet - indexRet,
      },
      pending: null,
    };
  };

  if (!o.d5) { const r = fill(5); o.d5 = r.point; }
  if (!o.d20) { const r = fill(20); o.d20 = r.point; }
  o.pendingNote = (!o.d5 || !o.d20)
    ? [!o.d5 ? fill(5).pending : null, !o.d20 ? fill(20).pending : null].filter(Boolean).join(' · ')
    : null;
}

// ── struktura pune e skanimit ────────────────────────────────────

interface WorkCandidate {
  key: string;
  entry: BrandEntry;
  term: string;
  region: string;
  isNew: boolean;
  google: { inFeed: boolean; approxTraffic: string | null; traffic: number | null; newsTitle: string | null; newsSource: string | null };
  gdeltQuery: string;
}

function candidateKey(term: string, ticker: string, region: string): string {
  return `${term.toLowerCase()}|${ticker}|${region}`;
}

// ── skanimi kryesor ──────────────────────────────────────────────

async function doScan(): Promise<ScanResultSummary> {
  const started = Date.now();
  const now = new Date().toISOString();
  const today = todayISO();
  const errors: string[] = [];
  const sources: Record<string, 'ok' | 'error' | 'throttled'> = {};

  const deadline = SCAN_BUDGET_MS > 0 ? started + SCAN_BUDGET_MS : Number.POSITIVE_INFINITY;
  let budgetHit = false;
  const withinBudget = (): boolean => {
    if (Date.now() <= deadline) return true;
    budgetHit = true;
    return false;
  };

  const store = await readStore();

  // 1) termat trending nga të 4 rajonet — paralel
  const allTerms: TrendingTerm[] = [];
  const trendsResults = await Promise.allSettled(REGIONS.map(r => fetchTrendingNow(r)));
  REGIONS.forEach((region, i) => {
    const r = trendsResults[i];
    if (r.status === 'fulfilled') {
      allTerms.push(...r.value);
      sources[`google_trends_${region}`] = 'ok';
    } else {
      sources[`google_trends_${region}`] = 'error';
      errors.push(`Trends ${region}: ${(r.reason as Error).message}`);
    }
  });
  const googleOk = Object.values(sources).some(v => v === 'ok');
  sources.google_trends = googleOk ? 'ok' : 'error';

  // 2) klasifiko termat → markë/produkt (DISCOVERED)
  const matched = new Map<string, WorkCandidate>();
  for (const t of allTerms) {
    const hit = classifyTerm(t.term);
    if (!hit) continue;
    const key = candidateKey(t.term, hit.entry.ticker, t.region);
    const existing = matched.get(key);
    if (existing) {
      if ((t.traffic ?? 0) > (existing.google.traffic ?? 0)) {
        existing.google = { inFeed: true, approxTraffic: t.approxTraffic, traffic: t.traffic, newsTitle: t.newsTitle, newsSource: t.newsSource };
      }
      continue;
    }
    matched.set(key, {
      key,
      entry: hit.entry,
      term: t.term,
      region: t.region,
      isNew: !store.candidates[key],
      google: { inFeed: true, approxTraffic: t.approxTraffic, traffic: t.traffic, newsTitle: t.newsTitle, newsSource: t.newsSource },
      gdeltQuery: hit.entry.gdeltQuery ?? hit.entry.aliases[0],
    });
  }

  // 3) kandidatët ekzistues aktivë (edhe pa qenë në feed sot)
  for (const [key, c] of Object.entries(store.candidates)) {
    if (c.status === 'REMOVED') continue; // refuzuarit gjurmohen vetëm për rezultat (hapi 6-b)
    if (matched.has(key)) continue;
    const entry = entryFor(c);
    if (!entry) continue;
    matched.set(key, {
      key,
      entry,
      term: c.trend,
      region: c.region,
      isNew: false,
      google: { inFeed: false, approxTraffic: null, traffic: null, newsTitle: null, newsSource: null },
      gdeltQuery: entry.gdeltQuery ?? entry.aliases[0],
    });
  }

  // 4) GDELT — seri 30-ditore + lista e artikujve (numri DHE titujt për shkakun)
  const gdeltBudget = [...matched.values()].slice(0, MAX_GDELT_CANDIDATES);
  const seriesCache = new Map<string, GdeltDailyPoint[]>();
  const articlesCache = new Map<string, GdeltArticle[]>();
  const gdeltErrored = new Set<string>();
  let gdeltThrottled = false;
  for (const w of gdeltBudget) {
    if (seriesCache.has(w.gdeltQuery)) continue;
    if (!withinBudget()) break;
    try {
      seriesCache.set(w.gdeltQuery, await gdeltDailySeries(w.gdeltQuery));
    } catch (e) {
      const msg = (e as Error).message;
      gdeltErrored.add(w.gdeltQuery);
      if (msg.includes('429')) gdeltThrottled = true;
      errors.push(`GDELT "${w.gdeltQuery}": ${msg}`);
    }
  }
  for (const w of gdeltBudget) {
    if (articlesCache.has(w.gdeltQuery)) continue;
    if (!withinBudget()) break;
    try {
      const list = await gdeltArticleList(w.gdeltQuery);
      articlesCache.set(w.gdeltQuery, list.articles);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('429')) gdeltThrottled = true;
      errors.push(`GDELT artlist "${w.gdeltQuery}": ${msg}`);
    }
  }
  sources.gdelt = gdeltThrottled ? 'throttled' : errors.some(e => e.startsWith('GDELT')) ? 'error' : 'ok';

  // 5) çmimet — SPY një herë, secili ticker një herë; dështimet ruhen me gabimin konkret
  let spySeries: { source: string; closes: PricePoint[] } | null = null;
  try {
    const spy = await fetchPriceSeries('SPY', '3M');
    spySeries = { source: spy.source, closes: spy.closes };
    sources.prices = 'ok';
  } catch (e) {
    sources.prices = 'error';
    errors.push(`SPY: ${(e as Error).message}`);
  }
  const priceErrors = new Map<string, string>();
  const priceCache = new Map<string, PricePoint[]>();
  const priceSource = new Map<string, string>();
  for (const w of matched.values()) {
    if (priceCache.has(w.entry.ticker)) continue;
    if (!withinBudget()) break;
    try {
      const s = await fetchPriceSeries(w.entry.ticker, '3M');
      priceCache.set(w.entry.ticker, s.closes);
      priceSource.set(w.entry.ticker, s.source);
    } catch (e) {
      priceErrors.set(w.entry.ticker, (e as Error).message);
      errors.push(`Çmimet ${w.entry.ticker}: ${(e as Error).message}`);
    }
  }
  if (budgetHit) {
    errors.push(`Buxheti kohor i skanimit (${Math.round(SCAN_BUDGET_MS / 1000)}s) u plotësua — disa pyetje GDELT/çmime u kapërcyen dhe vijojnë në skanimin tjetër.`);
  }

  // 6) ndërto matjet dhe përditëso kandidatët
  const newRows: Measurement[] = [];
  const promoted: string[] = [];
  const removed: string[] = [];
  const newCandidates: string[] = [];

  for (const w of matched.values()) {
    const b = w.entry;
    const mat = effectiveMateriality(b);
    const prev = store.candidates[w.key];
    const series = seriesCache.get(w.gdeltQuery) ?? null;
    const articles = articlesCache.get(w.gdeltQuery) ?? null;
    const gdeltError = gdeltErrored.has(w.gdeltQuery);

    // rreshti i Google Trends (sot) — me close-in e fundit të vlefshëm
    newRows.push({
      observed_at: today, available_at: today,
      trend: w.term, source: 'google_trends', region: w.region,
      interest: w.google.traffic ?? 50,
      ticker: b.ticker, product: b.product, company: b.company,
      materiality: mat, promo_risk: b.promoRisk, event_risk: b.eventRisk,
      stock_price: lastCloseOnOrBefore(priceCache.get(b.ticker), today),
      index_price: lastCloseOnOrBefore(spySeries?.closes, today),
    });

    // rreshtat e serisë GDELT (30 ditë, histori publike — pa lookahead)
    if (series) {
      for (const p of series) {
        if (dayMs(p.date) > dayMs(today)) continue;
        const recent7 = dayMs(p.date) > dayMs(today) - 7 * 86400000;
        newRows.push({
          observed_at: p.date, available_at: p.date,
          trend: w.term, source: 'gdelt', region: w.region,
          interest: round4(p.value),
          ticker: b.ticker, product: b.product, company: b.company,
          materiality: mat, promo_risk: b.promoRisk, event_risk: b.eventRisk,
          stock_price: recent7 ? lastCloseOnOrBefore(priceCache.get(b.ticker), p.date) : null,
          index_price: recent7 ? lastCloseOnOrBefore(spySeries?.closes, p.date) : null,
        });
      }
    }

    // ── provat ──
    // (a) rritja GDELT 7d vs baza 28d — provë e pavarur e kërkesës
    let growth: number | null = null;
    if (series && series.length) {
      const asOf = dayMs(today);
      const recent = series.filter(p => dayMs(p.date) > asOf - 7 * 86400000 && dayMs(p.date) <= asOf).map(p => p.value);
      const baseline = series.filter(p => dayMs(p.date) > asOf - 35 * 86400000 && dayMs(p.date) <= asOf - 7 * 86400000).map(p => p.value);
      if (recent.length >= 2 && baseline.length >= 3 && median(baseline) > 0) {
        growth = median(recent) / median(baseline) - 1;
      }
    }
    const carried = gdeltError && prev ? prev.gdelt : null;
    if (growth === null && carried && carried.growth !== null) growth = carried.growth;
    const carriedArticlesN = articles ? articles.length : (gdeltError ? carried?.articles1d ?? null : null);
    const confirmed = growth !== null && growth >= CONFIRM_GROWTH;

    // (b) shkaku i trendit — klasifikim nga titujt (i ri-kontrolluar ose carry-over)
    let cause: CauseInfo | null = null;
    if (articles) {
      cause = classifyCause(articles, w.google.newsTitle, w.google.newsSource, now);
    } else if (gdeltError && prev?.cause) {
      cause = prev.cause; // keep the last classification — clearly dated
    } else if (!gdeltError) {
      // GDELT u lexua por s'ka artikuj — klasifiko nga lajmi i RSS-it
      cause = classifyCause([], w.google.newsTitle, w.google.newsSource, now);
    } else {
      cause = prev?.cause ?? null;
    }

    // (c) çmimet — dritarja e balancuar (të njëjtat data) ose gabimi konkret
    const stockCloses = priceCache.get(b.ticker) ?? null;
    const spyCloses = spySeries?.closes ?? null;
    const feedError = priceErrors.get(b.ticker) ?? null;
    const win = stockCloses && spyCloses ? computePriceWindow(stockCloses, spyCloses) : null;
    const priceFresh = win !== null && !feedError;
    const priceVsIndex = win ? win.priceVsIndex : null;

    // (d) score — komponentët e njëjtë; «e pamatshme» nuk është «0%»
    const demandStrength = Math.max(growth ?? 0, w.google.inFeed ? 0.5 : 0);
    const breakdown: ScoreBreakdown = {
      demand: 25 * clamp01(demandStrength),
      confirmation: confirmed ? 20 : (growth !== null && growth > 0 ? 8 : 0),
      materiality: 20 * mat,
      price: priceVsIndex === null ? 0 : priceVsIndex <= PRICE_WINDOW_OPEN ? 15 : priceVsIndex <= PRICE_WINDOW_CLOSED ? 8 : 0,
      quality: 10 * (1 - b.promoRisk) * (confirmed ? 1 : 0.5),
      event: 10 * (1 - b.eventRisk),
    };
    const score = Math.round(breakdown.demand + breakdown.confirmation + breakdown.materiality + breakdown.price + breakdown.quality + breakdown.event);

    // ── makina e statusit (e varur nga provat) ──
    const reasons: string[] = [];
    reasons.push(`Zbuluar në Google Trends ${w.region}: «${w.term}»${w.google.approxTraffic ? ` (trafik ~${w.google.approxTraffic})` : ''} → marka i përket ${b.company} (${b.ticker}).`);

    if (cause) {
      reasons.push(`Shkaku i trendit [${CAUSE_LABELS[cause.type]}]: ${cause.reason}${cause.articles.length ? ` (kontrolluar ${cause.checkedAt.slice(0, 10)}, ${cause.articles.length} tituj të ruajtur)` : ` (kontrolluar ${cause.checkedAt.slice(0, 10)})`}`);
    } else {
      reasons.push('Shkaku i trendit: S\'u verifikua dot këtë skanim (GDELT i padisponueshëm) — pa klasifikim, nuk ka ngritje.');
    }

    if (growth !== null) {
      reasons.push(confirmed
        ? `Prova e pavarur (GDELT): +${(growth * 100).toFixed(0)}% 7 ditët e fundit kundrejt bazës 28-ditore (pragu +25%) — kërkesa ka konfirmim të jashtëm.`
        : `GDELT: ${(growth * 100).toFixed(0)}% 7 ditë kundrejt bazës — NËN pragun e provës së pavarur (+25%).`);
    } else {
      reasons.push('GDELT: pa histori të mjaftueshme për matjen e rritjes (duhen 2 pika të freskëta + 3 bazë).');
    }
    if (gdeltError && carried) {
      reasons.push('GDELT i padisponueshëm këtë skanim (429/rrjet) — u mbajt matja e fundit e vlefshme; statusi nuk u demotua për shkak të gabimit infrastrukture.');
    }
    if (carriedArticlesN !== null) reasons.push(`GDELT artikuj 24h: ${carriedArticlesN}${carriedArticlesN >= MAINSTREAM_ARTICLES ? ' — trendi është bërë MAINSTREAM (rregulli i daljes së Camillo)' : ''}.`);

    if (win) {
      reasons.push(`Çmimet: burimi ${priceSource.get(b.ticker) ?? (spySeries?.source ?? '?')}, dritarja ${win.fromDate} → ${win.asOf} (të njëjtat data për aksionin dhe SPY): ${b.ticker} ${fmtPrice(win.fromStockPrice)} → ${fmtPrice(win.stockPrice)} (${pct(win.stockReturn)}), SPY ${fmtPrice(win.fromIndexPrice)} → ${fmtPrice(win.indexPrice)} (${pct(win.indexReturn)}) → diferencë ${pct(win.priceVsIndex)} ndaj indeksit.`);
    } else if (feedError) {
      reasons.push(`Çmimet: KRAHASIMI NUK U KRYE — feed-i dështoi [${feedError}] (kontrolluar ${today}). Mungesa e të dhënave NUK është «0%» ose «pa reagim» — thjesht e pamatshme; pa çmime të reja, nuk ka ngritje në RESEARCH.`);
    } else {
      reasons.push(`Çmimet: s'ka ≥2 close të përbashkët aksion/SPY për dritaren ${PRICE_WINDOW_DAYS}-ditore — kontrolli i reagimit nuk u krye (e pamatshme, jo 0%).`);
    }

    // flamujt bllokues + provat për RESEARCH
    const promoBlock = b.promoRisk >= 0.7;
    const eventBlock = b.eventRisk >= 0.8;
    const mainstream = carriedArticlesN !== null && carriedArticlesN >= MAINSTREAM_ARTICLES;
    const causeOk = cause?.type === 'positive_demand_possible';
    const causeBad = cause?.type === 'negative_event';
    const windowOpen = priceVsIndex !== null && priceVsIndex <= PRICE_WINDOW_OPEN;
    const windowClosed = priceVsIndex !== null && priceVsIndex > PRICE_WINDOW_CLOSED;

    let status: CandidateStatus;
    if (promoBlock || eventBlock) {
      status = 'REMOVED';
      if (promoBlock) reasons.push(`DALJE: rrezik promovimi artificial i lartë (promo_risk ${b.promoRisk.toFixed(1)} ≥ 0.7) — flamur bllokues.`);
      if (eventBlock) reasons.push(`DALJE: rrezik eventesh i lartë (event_risk ${b.eventRisk.toFixed(1)} ≥ 0.8) — flamur bllokues.`);
    } else if (causeBad) {
      status = 'REMOVED';
      reasons.push('DALJE (REJECT): shkaku i trendit u klasifikua NEGATIV — kërkimet nuk tregojnë kërkesë për produktin.');
    } else if (mainstream) {
      status = 'REMOVED';
      reasons.push(`DALJE: trendi u bë mainstream — ${carriedArticlesN} artikuj në 24h (pragu ${MAINSTREAM_ARTICLES}); sipas Camillo, lajmi tashmë është i çmimit.`);
    } else if (windowClosed) {
      status = 'REMOVED';
      reasons.push(`DALJE: aksioni ka tejkaluar indeksin me ${pct(priceVsIndex)} (>+10%) — lëvizja e çmimit ka zënë vend, pritja e reflektuar.`);
    } else if (causeOk && confirmed && priceFresh && windowOpen && score >= RESEARCH_SCORE) {
      status = 'RESEARCH';
      reasons.push(`NGJITJE në RESEARCH: të gjitha provat plotësohen — shkak potencialisht pozitiv + provë e pavarur e kërkesës (GDELT ≥+25%) + çmime të vlefshme e të freskëta me dritare të hapur (≤+3%) + pa flamur bllokues + score ${score} ≥ ${RESEARCH_SCORE}. Kandidat për hulumtim thelbësor — jo rekomandim tregtimi.`);
    } else if (w.isNew && !series && !articles && !cause) {
      status = 'DISCOVERED';
      reasons.push('DISCOVERED: u gjet termi dhe marka — pritet verifikimi i lidhjes me kompaninë (GDELT) në skanimin e radhës.');
    } else {
      status = 'WATCH';
      const missing: string[] = [];
      if (!causeOk) missing.push(cause ? `shkaku është «${CAUSE_LABELS[cause.type]}» — duhet provë kërkece, jo thjesht lançim/lajm` : 'shkaku i trendit s\'është verifikuar dot');
      if (!confirmed) missing.push(`prova e pavarur e kërkesës mungon (GDELT ${growth !== null ? pct(growth) : 'n/a'} < +25%)`);
      if (!priceFresh) missing.push(win ? 'çmimet e këtij skanimi nuk janë të freskëta/të plota' : `çmimet janë të pamatshme${feedError ? ` — feed-i dështoi: ${feedError}` : ''}`);
      else if (!windowOpen) missing.push(`dritarja e çmimit nuk është e hapur (${pct(priceVsIndex)} > +3%)`);
      if (score < RESEARCH_SCORE) missing.push(`score ${score} < ${RESEARCH_SCORE} (kusht sekondar)`);
      reasons.push(`Në WATCH — lidhja me ${b.ticker} u verifikua, por mungon: ${missing.join('; ')}.`);
    }

    // ftohja: kandidat aktiv pa matje të reja
    if (status !== 'REMOVED' && prev && prev.status !== 'REMOVED') {
      const lastSeen = Date.parse(prev.lastSeenAt);
      if (Number.isFinite(lastSeen) && Date.now() - lastSeen > STALE_DAYS * 86400000 && !w.google.inFeed) {
        status = 'REMOVED';
        reasons.push(`DALJE: interesi u ftoh — pa matje të reja për më shumë se ${STALE_DAYS} ditë.`);
      }
    }

    // dosja e kandidatit
    const cand: Candidate = prev ?? {
      key: w.key, trend: w.term, ticker: b.ticker, region: w.region,
      company: b.company, product: b.product,
      status: 'DISCOVERED', firstSeenAt: now, lastSeenAt: now, lastChangedAt: now,
      score: 0, breakdown, reasons: [], history: [],
      google: { inFeedToday: false, approxTraffic: null, traffic: null },
      gdelt: { articles1d: null, growth: null, confirmed: false },
      cause: null,
      price: { stockReturn: null, indexReturn: null, priceVsIndex: null, asOf: null, fromDate: null, stockPrice: null, indexPrice: null, source: null, error: null, checkedAt: null },
      outcome: { baseDate: null, baseStock: null, baseIndex: null, d5: null, d20: null, pendingNote: null, lastCheckedAt: null },
    };
    if (!prev) newCandidates.push(w.key);

    const prevStatus: CandidateStatus | 'NEW' = prev ? prev.status : 'NEW';
    if (prevStatus === 'NEW') {
      cand.history.push({ at: now, from: 'NEW', to: 'DISCOVERED', reason: `Zbuluar automatikisht në Google Trends ${w.region}: «${w.term}» → ${b.ticker}.` });
    }
    if (prevStatus !== 'NEW' && prevStatus !== status) {
      cand.history.push({ at: now, from: prevStatus, to: status, reason: reasons.find(r => r.startsWith('NGJITJE') || r.startsWith('DALJE')) ?? `Statusi u përditësua në ${status}.` });
      if (status === 'RESEARCH') promoted.push(w.key);
      if (status === 'REMOVED') removed.push(w.key);
      cand.lastChangedAt = now;
    }

    cand.status = status;
    cand.lastSeenAt = w.google.inFeed ? now : (prev?.lastSeenAt ?? now);
    if (w.google.inFeed) cand.lastSeenAt = now;
    cand.score = score;
    cand.breakdown = breakdown;
    cand.reasons = reasons;
    cand.google = { inFeedToday: w.google.inFeed, approxTraffic: w.google.approxTraffic, traffic: w.google.traffic };
    cand.gdelt = { articles1d: carriedArticlesN, growth, confirmed };
    if (cause) cand.cause = cause;

    // blloku i çmimeve: të dhënat e reja ose gabimi konkret mbi të vjetrat
    if (win) {
      cand.price = {
        stockReturn: win.stockReturn, indexReturn: win.indexReturn, priceVsIndex: win.priceVsIndex,
        asOf: win.asOf, fromDate: win.fromDate,
        stockPrice: win.stockPrice, indexPrice: win.indexPrice,
        source: priceSource.get(b.ticker) ?? spySeries?.source ?? null,
        error: null, checkedAt: now,
      };
    } else {
      // feed-i dështoi / s'ka dritare: mbaj të vjetrat (të datuara qartë) + gabimi konkret
      cand.price = {
        ...(prev?.price ?? cand.price),
        error: feedError ?? (stockCloses && spyCloses ? `vetëm ${new Set([...stockCloses.map(p => p.date), ...spyCloses.map(p => p.date)].filter((d, i, a) => a.indexOf(d) === i)).size} data të përbashkëta — duhen ≥2` : 'seritë e çmimeve mungojnë'),
        checkedAt: now,
      };
      if (!win) {
        // fshi kthimet e vjetra kur s'ka dritare të re — asOf/source mbeten si dëshmi e matjes së fundit
        cand.price.stockReturn = prev?.price.stockReturn ?? null;
        cand.price.indexReturn = prev?.price.indexReturn ?? null;
        cand.price.priceVsIndex = prev?.price.priceVsIndex ?? null;
      }
    }

    // rezultati 5/20 ditë — përfshi refuzuarit (në këtë hap: aktivët)
    updateOutcome(cand, stockCloses, spyCloses, now);
    store.candidates[w.key] = cand;
  }

  // 6-b) refuzuarit: vetëm gjurmimi i rezultatit (pa GDELT, pa ndryshim statusi)
  let outcomeTracked = 0;
  for (const [key, c] of Object.entries(store.candidates)) {
    if (outcomeTracked >= MAX_OUTCOME_TRACKED) break;
    if (c.status !== 'REMOVED' || matched.has(key)) continue;
    if (c.outcome.d20) continue; // rezultati i plotë — s'ka më gjë për të ndjekur
    let stockCloses = priceCache.get(c.ticker) ?? null;
    let spyCloses = spySeries?.closes ?? null;
    if (!stockCloses || !spyCloses) {
      try {
        const s = await fetchPriceSeries(c.ticker, '3M');
        priceCache.set(c.ticker, s.closes);
        priceSource.set(c.ticker, s.source);
        stockCloses = s.closes;
      } catch (e) {
        c.outcome.lastCheckedAt = now;
        c.outcome.pendingNote = `çmimet s'u morën: ${(e as Error).message}`;
        continue;
      }
    }
    updateOutcome(c, stockCloses, spyCloses, now);
    outcomeTracked++;
  }

  // 6-c) ftohja e kandidatëve aktivë që s'u përfshinë fare
  for (const [key, c] of Object.entries(store.candidates)) {
    if (matched.has(key) || c.status === 'REMOVED') continue;
    const lastSeen = Date.parse(c.lastSeenAt);
    if (Number.isFinite(lastSeen) && Date.now() - lastSeen > STALE_DAYS * 86400000) {
      c.status = 'REMOVED';
      c.lastChangedAt = now;
      c.history.push({ at: now, from: 'WATCH', to: 'REMOVED', reason: `DALJE: interesi u ftoh — pa matje të reja për më shumë se ${STALE_DAYS} ditë.` });
      removed.push(key);
    }
  }

  // 7) ruaj matjet + arkivi CSV
  mergeMeasurements(store, newRows);
  if (store.measurements.length > MEASUREMENTS_CAP) {
    store.measurements.sort((a, b) => a.observed_at.localeCompare(b.observed_at));
    store.measurements = store.measurements.slice(store.measurements.length - MEASUREMENTS_CAP);
  }
  let archived = 0;
  try {
    archived = await archiveToCsv(newRows);
  } catch (e) {
    errors.push(`Arkivi CSV: ${(e as Error).message}`);
  }

  const activeCount = Object.values(store.candidates).filter(c => c.status !== 'REMOVED').length;
  const record: ScanRecord = {
    at: now, durationMs: Date.now() - started, regions: [...REGIONS],
    termsScanned: allTerms.length, termsClassified: [...matched.values()].filter(w => w.google.inFeed).length,
    candidatesActive: activeCount, promoted: promoted.length, removed: removed.length,
    sources, errors,
  };
  store.lastScanAt = now;
  store.scans = [...store.scans, record].slice(-50);
  await writeStore(store);

  return {
    ok: googleOk, at: now, durationMs: record.durationMs, regions: [...REGIONS],
    termsScanned: allTerms.length,
    termsClassified: [...matched.values()].filter(w => w.google.inFeed).length,
    newCandidates, promoted, removed, activeCount, sources, errors, archived,
  };
}

// ── ndihmës të vegjël ────────────────────────────────────────────

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function fmtPrice(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : String(n);
}

/** Rikthen hyrjen e fjalorit për një kandidat të ruajtur. */
function entryFor(c: Candidate): BrandEntry | null {
  const hit = classifyTerm(c.trend);
  if (hit) return hit.entry;
  return null;
}
