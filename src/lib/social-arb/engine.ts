// ═══════════════════════════════════════════════════════════════
// SOCIAL ARB — motori i zbulimit automatik (v5 — Pjesa 3)
//
// ZBULIMI ka dy rrugë:
//   A) Google Trends "Trending now" (US/GB/CA/AU) → termi përputhet me
//      fjalorin → DISCOVERED (rruga e vjetër — kërkon zhurmë që tashmë ekziston).
//   B) PROAKTIV: çdo skanim lexon një grup artikujsh të fjalorit me
//      Wikipedia (rrotullim me kursor) — kur seria tregon rritje të
//      vazhdueshme (growth ≥ prag + risingWeeks ≥ 2) krijohet kandidat
//      DISCOVERED me region WW. Trendi Camillo-style (rritje 8-javore pa
//      spike) S'shfaqet kurrë në «Trending now» — por Wikipedia e sheh.
//      Kandidatët nga Wikipedia NUK anashkalojnë asnjë gate.
//
// RESEARCH — VETËM me të GJITHA 5 provat:
//    1. burime të pavarura kërkese jo-lajne (Trends + Wikipedia ≥ +25%),
//    2. materialiteti efektiv ≥ 15%,
//    3. S'ËSHTË ÇMUAR: kthimi aksion−SPY që nga FILLIMI I TRENDIT
//       (trendStartAt nga seria Wikipedia; fallback firstSeenAt) ≤ +8%,
//    4. likuiditeti ≥ $2M/ditë,
//    5. qëndrueshmëria: 3+ javë rritje pa model spike-i.
//    Score-i vetëm renditje — s'ka më pikë falas për inFeed.
//
// REMOVED (REJECT): shkak negativ, lidhja e gabuar, mainstream
// (≥200 artikuj/24h — rregulli i Camillo), flamuj bllokues, ose
// ftohja — por jo sa kohë Wikipedia tregon rritje të vazhdueshme.
//
// MATJET RROTOOLLOHEN: kandidatët ekzistues me matjet më të vjetra
// marrin radhën e parë (lastMeasuredAt ASC), pastaj termat e rinj —
// asnjë kandidat aktiv s'mbetet i uritur për shkak të buxhetit kohor.
//
// Çdo kandidat — PËRFSHI refuzuarit — gjurmohet për rezultatin 5/20
// ditë tregtimi kundrejt SPY, nga baza = close-i i ditës së tregtimit
// PAS zbulimit; të promovuarit gjurmohen edhe nga ngjitja në RESEARCH.
// Çdo matje arkivohet në CSV (prapavijë) për backtest.
//
// Çmimet: kur feed-i dështon, gabimi konkret (burimi + statusi HTTP)
// ruhet në kandidat dhe shfaqet në panel — mungesa e të dhënave NUK
// kthehet kurrë në 0% apo «pa reagim».
// ═══════════════════════════════════════════════════════════════

import { BRANDS, classifyTerm, effectiveMateriality, wikiArticleFor, type BrandEntry } from './brands';
import {
  fetchTrendingNow, gdeltDailySeries, gdeltArticleList, fetchPriceSeries, fetchIndexCloses, fetchWikiPageviews,
  fetchNextEarningsDate,
  type GdeltDailyPoint, type GdeltArticle, type PricePoint, type TrendingTerm, type WikiPoint,
} from './sources';
import { readStore, writeStore, mergeMeasurements, archiveToCsv, acquireScanLock } from './store';
import { SOCIAL_ARB_CONFIG as CFG } from './config';
import {
  wikiStats, computeTrendStart, computeReturnSinceStart, computeAvgDollarVolume, evaluateGates,
  allGatesPassed, isAlreadyMoved, groupKeyOf, type WikiStats,
} from './gates';
import type {
  Candidate, CandidateStatus, CauseArticle, CauseInfo, CauseType, GateEval, GateName, Measurement,
  OutcomeBase, OutcomePoint, Region, ScanRecord, ScanResultSummary, ScoreBreakdown, SocialArbStore, TrendStart,
} from './types';

const REGIONS: Region[] = ['US', 'GB', 'CA', 'AU'];
const MAINSTREAM_ARTICLES = CFG.scan.mainstreamArticles;   // Camillo: dil kur bëhet mainstream (< maxRecords 250)
const CONFIRM_GROWTH = 0.25;       // referencë mediatike: GDELT +25% 7d (media_confirmation, jo burim kërkese)
const PRICE_WINDOW_OPEN = CFG.score.priceWindowOpen;     // ≤ +3% vs SPY — vetëm për panelin informativ
const PRICE_WINDOW_CLOSED = CFG.score.priceWindowClosed; // > +10% — vetëm për panelin informativ
const PRICE_WINDOW_DAYS = CFG.scan.priceWindowDays;       // dritarja kalendarike e reagimit (panel)
const STALE_DAYS = CFG.scan.staleDays;             // pa matje të reja → ftohje (jo kur Wikipedia rritet)
const MAX_GDELT_CANDIDATES = CFG.scan.maxGdeltCandidates;   // kufi kohor: 2 thirrje GDELT × 6s secila
const MAX_OUTCOME_TRACKED = CFG.scan.maxOutcomeTracked;    // kufi gjurmimesh rezultatesh për skanim
const MEASUREMENTS_CAP = CFG.scan.measurementsCap;     // kufizi i store-it (arkivi CSV mbetet i plotë)
const WIKI_PARALLEL = CFG.discovery.concurrency;    // kërkesa njëkohëse ndaj Wikipedia-s

// ftohja s'mund të trokasë deri sa qëndrueshmëria të matet — përndryshe një
// trend i ngadaltë ftohet PARA se të mund të kalojë gate-in e 5-të.
if (STALE_DAYS < CFG.gates.persistence.minRisingWeeks * 7 + 7) {
  console.warn(`[social-arb config] ⚠️ staleDays=${STALE_DAYS} < minRisingWeeks×7+7 — një trend i ngadaltë do të ftohej para se të matej qëndrueshmëria. Rrite në ≥ ${CFG.gates.persistence.minRisingWeeks * 7 + 7}.`);
}

// fjalori i artikujve Wikipedia të kuruar (unike) — për zbulimin proaktiv
const WIKI_DICTIONARY: [article: string, entry: BrandEntry][] = (() => {
  const seen = new Set<string>();
  const out: [string, BrandEntry][] = [];
  for (const b of BRANDS) {
    const a = b.wikiArticle;
    if (!a || seen.has(a)) continue;
    seen.add(a);
    out.push([a, b]);
  }
  return out;
})();

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

/** Map me kufizim njëkohësie — pa bibliotekë të jashtme. Funksioni e kap
 *  vetë gabimin e fetch-it (pattern .catch) — pMap s'ka çfarë të propagojë. */
async function pMap<T>(items: T[], fn: (item: T, idx: number) => Promise<unknown>, concurrency: number): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

/** Wikipedia tregon rritje të vazhdueshme? (për freskimin e lastSeenAt —
 *  një trend i ngadaltë s'ftohet vetëm se s'është më «i nxehtë» sot). */
function wikiAlive(w: { growth: number | null; risingWeeks: number | null } | null | undefined): boolean {
  return !!w && (w.growth ?? -1) > 0 && (w.risingWeeks ?? 0) >= 1;
}

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
    // TTL 120s — skanimi zgjat ≤60s në Vercel (maxDuration) dhe ~90s lokalisht.
    // TTL-i është vetëm rrjetë e sigurisë: nëse release-i dështon, bllokimi
    // max 2 min (dikur 900s — skanimet manuale mbeteshin pa ajër 1/15 min).
    const release = await acquireScanLock(120);
    if (!release) throw new ScanLockError();
    try {
      return await doScan();
    } finally {
      // KRITIKE në serverless: release-i DUHET pritur — `void release()` kthehej
      // fire-and-forget dhe Vercel-i e ngrinte funksionin para se DEL-i të
      // arrinte në Upstash → lock i ndenjur deri me TTL (provuar live 2×).
      // Kufizohet me 5s që një rrjet i varur të mos e hajë kohën e funksionit.
      try {
        await Promise.race([release(), new Promise(r => setTimeout(r, 5000))]);
      } catch (e) {
        console.error('[social-arb engine] release-i i lock-ut dështoi — TTL 120s do ta pastrojë:', (e as Error).message);
      }
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

// ⚠️ FJALËT E SHUMËNUANÇUARA JANË HEQUR (v5): 'crash' përputhej me «Crash
// Bandicoot», 'cut' me «execute», 'falls' me «Niagara Falls», 'strike' me
// «strike zone»… Zëvendësuar me fraza specifike + kufij fjalësh + pragje
// raporti: një titull me «investigation» mes 100 s'refuzon dot kërkimin.
const CAUSE_NEGATIVE_STRONG = [
  'lawsuit', 'sued', 'sues', 'recall', 'recalled', 'layoffs', 'layoff', 'bankruptcy', 'fraud',
  'scandal', 'outage', 'data breach', 'shooting', 'explosion', 'arrested', 'investigation',
  'plunge', 'plunged', 'collaps', 'resigns', 'resignation',
  'workers strike', 'stock falls', 'stock plunges', 'shares fall', 'shares plunge',
];
const CAUSE_NEGATIVE_WEAK = [
  'dropped', 'slump', 'slides', 'missed', 'misses',
  'warns', 'warning', 'downgrade', 'probe', 'halts', 'slashed',
  'price cut', 'price cuts',
];
const CAUSE_POSITIVE = [
  'sales surge', 'surge in demand', 'demand rises', 'demand jumps', 'sold out', 'sells out',
  'record sales', 'beats estimates', 'strong sales', 'subscribers add', 'added subscribers',
  'bestseller', 'best-seller', 'waitlist', 'waiting list', 'backlog', 'orders jump', 'orders surge',
  'revenue rises', 'revenue jumps', 'profit jumps', 'raises guidance', 'raised guidance',
];
const CAUSE_LAUNCH = [
  'launch', 'launches', 'launched', 'announces', 'announced', 'release', 'releases', 'released',
  'trailer', 'teaser', 'new season', 'new episode', 'premiere', 'unveils', 'debuts', 'rumor',
  'rumour', 'leak', 'leaked', 'coming soon', 'schedule', 'lineup', 'line-up', 'new releases',
  'what\'s new', 'whats new', 'coming to', 'set to release', 'drops on',
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const kwCache = new Map<string, RegExp>();
function kwRe(kw: string): RegExp {
  let r = kwCache.get(kw);
  if (!r) {
    r = new RegExp(`(?:^|[^a-z0-9])${escapeRe(kw)}(?:$|[^a-z0-9])`, 'i');
    kwCache.set(kw, r);
  }
  return r;
}

/** total = numri i TITUJVE me të paktën një fjalë kyçe (jo çifte fjalë-titull).
 *  Kufijtë e fjalëve: «cut» s'përputhet më me «execute», «falls» jo me
 *  «Niagara Falls», «crash» as me «Crash Bandicoot» (fjalë e hequr nga listat). */
function countKeywordHits(texts: string[], keywords: string[]): { total: number; hits: string[] } {
  const hits = new Set<string>();
  let titlesHit = 0;
  for (const t of texts) {
    let any = false;
    for (const kw of keywords) {
      if (kwRe(kw).test(t)) { hits.add(kw); any = true; }
    }
    if (any) titlesHit++;
  }
  return { total: titlesHit, hits: [...hits] };
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

  if (!texts.length) {
    return {
      type: 'unclear',
      reason: 'S\'ka artikuj 24h për këtë term — shkaku s\'mund të verifikohet pa materiale.',
      keywords: [],
      articles: [],
      newsTitle, newsSource, checkedAt,
    };
  }

  // pragjet raportuale: një titull «recall» mes 100 s'refuzon; refuzimi
  // kërkon ≥2 tituj të FORTË (≥20% e titujve) ose ≥3 të dobët (≥30%).
  const n = Math.max(texts.length, 1);
  const strongNeg = neg.total >= Math.min(2, n) && neg.total / n >= 0.2;
  const weakNeg = negWeak.total >= Math.min(3, n) && negWeak.total / n >= 0.3;

  let type: CauseType;
  let reason: string;
  let keywords: string[];

  if (strongNeg || weakNeg) {
    type = 'negative_event';
    keywords = neg.hits.length ? neg.hits : negWeak.hits;
    reason = `Titujt e lajmeve flasin për zhvillime negative (${[...neg.hits, ...negWeak.hits].slice(0, 5).join(', ')} — ${neg.total}/${n} tituj të fortë + ${negWeak.total}/${n} të dobët) — kjo S'është kërkesë pozitive për produktin; kandidati refuzohet sipas rregullit të provave.`;
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
 * Mbush gjurmimin e rezultatit nga një ankora (zbulimi ose ngjitja në
 * RESEARCH): baza = close-i i ditës së TREGTIMIT PAS ankorës — e pasme,
 * jo e njëjta ditë (close-i i ditës së skanimit mund të mos kishte
 * qenë i tregtueshëm ende kur u zbulua); d5/d20 = pas 5/20 ditësh
 * TREGTIMI, aksioni kundrejt SPY në të njëjtat data. Faqet e mbushura
 * nuk ridekzistojnë kurrë.
 */
export function fillOutcomeFromAnchor(
  o: OutcomeBase,
  stock: PricePoint[] | null,
  spy: PricePoint[] | null,
  anchorDate: string,
  now: string,
): void {
  o.lastCheckedAt = now;
  if (!stock || !stock.length || !spy || !spy.length) {
    o.pendingNote = 'çmimet për gjurmimin e rezultatit s\'u morën këtë kontroll — provohet sërish herën tjetër';
    return;
  }
  const spyMap = new Map(spy.map(p => [p.date, p.close]));
  const common = stock.filter(p => spyMap.has(p.date)).sort((a, b) => a.date.localeCompare(b.date));
  if (common.length < 2) { o.pendingNote = 's\'ka close të përbashkët aksion/SPY për gjurmim'; return; }

  // baza: close-i i përbashkët i ditës së PARË të tregtimit PAS ankorës
  if (!o.baseDate || !o.baseStock || !o.baseIndex) {
    const anchor = anchorDate.slice(0, 10);
    const idx = common.findIndex(p => dayMs(p.date) > dayMs(anchor));
    if (idx === -1) {
      o.pendingNote = `prit mbylljen e ditës së parë të tregtimit pas ${anchor}`;
      return;
    }
    o.baseDate = common[idx].date;
    o.baseStock = common[idx].close;
    o.baseIndex = spyMap.get(common[idx].date) as number;
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

/** Rezultati 5/20 ditë nga ZBULIMI (ankora = firstSeenAt) — për të gjithë. */
export function updateOutcome(
  cand: Candidate,
  stock: PricePoint[] | null,
  spy: PricePoint[] | null,
  now: string,
): void {
  fillOutcomeFromAnchor(cand.outcome, stock, spy, cand.firstSeenAt, now);
}

/** Rezultati 5/20 ditë nga NGJITJA në RESEARCH (ankora = promotedAt) — mas
 *  tezën e «hendekut të paçmuar» edhe kur promovimi vjen ditë pas zbulimit. */
export function updatePromotionOutcome(
  cand: Candidate,
  stock: PricePoint[] | null,
  spy: PricePoint[] | null,
  now: string,
): void {
  const o = cand.outcomeFromPromotion;
  if (!o) return;
  if (!o.promotedAt) {
    // rikonztruktohet nga historia kur mungon (migrim i vjetër)
    o.promotedAt = cand.history?.find(h => h.to === 'RESEARCH')?.at ?? null;
  }
  if (!o.promotedAt) return;
  fillOutcomeFromAnchor(o, stock, spy, o.promotedAt, now);
}

// ── struktura pune e skanimit ────────────────────────────────────

interface WorkCandidate {
  key: string;
  entry: BrandEntry;
  term: string;
  region: string;
  isNew: boolean;
  discoveredVia: 'google_trends' | 'wikipedia';
  google: { inFeed: boolean; approxTraffic: string | null; traffic: number | null; newsTitle: string | null; newsSource: string | null };
  gdeltQuery: string;
}

function candidateKey(term: string, ticker: string, region: string): string {
  return `${term.toLowerCase()}|${ticker}|${region}`;
}

/**
 * RADHA e matjeve (anti-urie): kandidatët ekzistues sipas lastMeasuredAt
 * ASC (kurrë të matur → në krye), pastaj termat e rinj të feed-it. Pa
 * këtë, termat e ditës zinin gjithmonë MAX_GDELT_CANDIDATES radhët dhe
 * kandidatët ekzistues uriheshin përjetësisht — i njëjti lloj livelock-u
 * i çmimeve që u rregullua më parë. Garancia: çdo kandidat aktiv merr
 * radhën brenda ⌈aktivë/MAX⌉ skanimesh (testohet me rrotullim).
 */
export function orderCandidatesForMeasurement<T extends { key: string; isNew: boolean }>(
  items: T[],
  lastMeasuredAtOf: (key: string) => string | null,
): T[] {
  return [...items].sort((a, b) => {
    if (a.isNew !== b.isNew) return a.isNew ? 1 : -1; // ekzistuesit (jo të rinj) të parët
    const av = Date.parse(lastMeasuredAtOf(a.key) ?? '');
    const bv = Date.parse(lastMeasuredAtOf(b.key) ?? '');
    const an = Number.isFinite(av) ? av : 0;
    const bn = Number.isFinite(bv) ? bv : 0;
    return an - bn; // më e vjetra → radha e parë; kurrë e matur (0) → në krye
  });
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
      discoveredVia: 'google_trends' as const,
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
      discoveredVia: c.discoveredVia ?? 'google_trends',
      google: { inFeed: false, approxTraffic: null, traffic: null, newsTitle: null, newsSource: null },
      gdeltQuery: entry.gdeltQuery ?? entry.aliases[0],
    });
  }

  // 3-b) ZBULIMI PROAKTIV — skanimi i fjalorit me Wikipedia, jo vetëm
  //      «Trending now». Trendi Camillo-style (rritje e ngadaltë javësh,
  //      pa spike) s'shfaqet KURRAJ në feed — por seria e pageviews e sheh.
  //      Grupi rrotullohet me kursorin (store.meta.wikiScanCursor) brenda
  //      buxhetit kohor. Kandidatët e krijuar NUK anashkalojnë asnjë gate:
  //      hyjnë në WATCH/DISCOVERED si të tjerë dhe duhet të kalojnë të 5.
  const wikiCache = new Map<string, WikiPoint[]>();   // artikull → seri (e ndarë me hapin 4-b)
  const wikiErrors = new Map<string, string>();       // artikull → gabimi konkret
  let wikiDiscovered = 0;
  if (WIKI_DICTIONARY.length) {
    const cursor = ((store.meta?.wikiScanCursor ?? 0) % WIKI_DICTIONARY.length + WIKI_DICTIONARY.length) % WIKI_DICTIONARY.length;
    const batch: typeof WIKI_DICTIONARY = [];
    for (let i = 0; i < Math.min(CFG.discovery.batchSize, WIKI_DICTIONARY.length); i++) {
      batch.push(WIKI_DICTIONARY[(cursor + i) % WIKI_DICTIONARY.length]);
    }
    store.meta = { wikiScanCursor: (cursor + batch.length) % WIKI_DICTIONARY.length };
    await pMap(batch, ([article]) => {
      if (!withinBudget() || wikiCache.has(article)) return Promise.resolve();
      return fetchWikiPageviews(article, CFG.gates.sources.wikiSeriesDays)
        .then(pts => { wikiCache.set(article, pts); })
        .catch(e => {
          wikiErrors.set(article, (e as Error).message);
          errors.push(`Wikipedia (fjalori) "${article}": ${(e as Error).message}`);
        });
    }, WIKI_PARALLEL);
    // kandidatë të rinj nga rritja e vazhdueshme e serisë — asnjë gate e anashkaluar
    for (const [article, entry] of batch) {
      const pts = wikiCache.get(article);
      if (!pts) continue;
      const st = wikiStats(pts, today);
      if (st.growth === null || st.risingWeeks === null) continue;
      if (st.growth < CFG.discovery.wikiGrowth || st.risingWeeks < CFG.discovery.minRisingWeeks) continue;
      const term = entry.aliases[0];
      const key = candidateKey(term, entry.ticker, 'WW');
      if (matched.has(key)) continue; // tashmë i pranishëm (p.sh. i krijuar në skanimin e kaluar)
      matched.set(key, {
        key,
        entry,
        term,
        region: 'WW',
        isNew: !store.candidates[key],
        discoveredVia: 'wikipedia' as const,
        google: { inFeed: false, approxTraffic: null, traffic: null, newsTitle: null, newsSource: null },
        gdeltQuery: entry.gdeltQuery ?? entry.aliases[0],
      });
      if (!store.candidates[key]) wikiDiscovered++;
    }
  }

  // 3-c) RADHA e matjeve — kandidatët ekzistues me matjen më të vjetër marrin
  //      radhën e parë (lastMeasuredAt ASC), pastaj termat e rinj të feed-it.
  //      Pa këtë, termat e ditës zinin gjithmonë MAX radhët dhe kandidatët
  //      ekzistues uriheshin përjetësisht — i njëjti lloj livelock-u i çmimeve.
  const orderedWork = orderCandidatesForMeasurement(
    [...matched.values()],
    k => store.candidates[k]?.lastMeasuredAt ?? null,
  );
  const measuredBatch = orderedWork.slice(0, MAX_GDELT_CANDIDATES);
  const measuredBatchKeys = new Set(measuredBatch.map(w => w.key));

  // 4) çmimet — PRIMARE ndaj GDELT-t. Dikur ekzekutoheshin PAS GDELT-t dhe,
  //    sa herë GDELT-i ishte 429 (timeout 12s + 3×gap 6s ≈ gjithë buxheti 35s),
  //    rruga e çmimeve pritej me `withinBudget()` ÇDO skanim — çmimet për
  //    ticker-a nuk morën kurrë radhën (livelock i provuar live 2 skanime).
  //    Tani çmimet (shpejt, ~5s via stockanalysis.com) marrin radhën e parë.
  //      SPY merret 6M: ankora e gate-it not_priced (fillimi i trendit nga
  //      Wikipedia) mund të bie mbrapa dritares 3M — indeksi duhet ta mbulojë.
  let spySeries: { source: string; closes: PricePoint[] } | null = null;
  try {
    const spy = await fetchPriceSeries('SPY', '6M');
    spySeries = { source: spy.source, closes: spy.closes };
    sources.prices = 'ok';
  } catch (e) {
    sources.prices = 'error';
    errors.push(`SPY: ${(e as Error).message}`);
  }
  const priceErrors = new Map<string, string>();
  const priceCache = new Map<string, PricePoint[]>();
  const priceSource = new Map<string, string>();
  const priceSkipped = new Set<string>(); // ticker-at e kapërcyer nga buxheti — arsye e sinqertë
  for (const w of orderedWork) {
    if (priceCache.has(w.entry.ticker)) continue;
    if (!withinBudget()) { priceSkipped.add(w.entry.ticker); continue; }
    try {
      const s = await fetchPriceSeries(w.entry.ticker, '3M');
      priceCache.set(w.entry.ticker, s.closes);
      priceSource.set(w.entry.ticker, s.source);
    } catch (e) {
      priceErrors.set(w.entry.ticker, (e as Error).message);
      errors.push(`Çmimet ${w.entry.ticker}: ${(e as Error).message}`);
    }
  }

  // 4-b) Wikipedia pageviews për radhën e matjes — PARALELE (5 kërkesa
  //      njëkohësisht; seritë e fjalorit prej hapit 3-b janë tashmë në
  //      cache, pa kosto shtesë). Merr radhën PARA GDELT-t: është provë
  //      kryesore e kërkesës, ndërsa GDELT mbetet konfirmim mediatik.
  //      Vetëm artikujt e kuruar — pa artikull të njohur, kandidati
  //      mbetet me gate null (fail-closed).
  await pMap(measuredBatch, w => {
    const article = wikiArticleFor(w.entry);
    if (!article || wikiCache.has(article)) return Promise.resolve();
    if (!withinBudget()) return Promise.resolve();
    return fetchWikiPageviews(article, CFG.gates.sources.wikiSeriesDays)
      .then(pts => { wikiCache.set(article, pts); })
      .catch(e => {
        const msg = (e as Error).message;
        wikiErrors.set(article, msg);
        errors.push(`Wikipedia "${article}": ${msg}`);
      });
  }, WIKI_PARALLEL);
  const wikiOkCount = [...new Set(measuredBatch.map(w => wikiArticleFor(w.entry)).filter(Boolean))].length;
  sources.wikipedia = wikiOkCount === 0
    ? 'ok' // s'ka artikuj të kuruar — s'ka çfarë të dështojë
    : wikiCache.size > 0 ? 'ok' : 'error';

  // 5) GDELT — seri 30-ditore + lista e artikujve (numri DHE titujt për shkakun).
  //    Me buxhetin e MBBETUR: kur është 429, thirrjet e ngadalta e shterojnë —
  //    në atë rast matjet e fundit të vlefshme mbahen (carry-over, hapi 6).
  const gdeltBudget = measuredBatch; // radha e rrotulluar e matjeve (3-c)
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

  // 5-b) katalizatori i fitimeve (opsional — VETËM renditje, JO gate):
  //      me FINNHUB_API_KEY merr datën e ardhshme të fitimeve për radhën e
  //      matjes. Pa çelës s'kërkohet fare — catalyst mbetet null (e sinqertë).
  const earningsMap = new Map<string, { date: string | null; error: string | null }>();
  const finnhubEnabled = !!process.env.FINNHUB_API_KEY;
  if (finnhubEnabled) {
    await pMap(measuredBatch, w => {
      if (!withinBudget() || earningsMap.has(w.entry.ticker)) return Promise.resolve();
      return fetchNextEarningsDate(w.entry.ticker, CFG.catalyst.lookaheadDays)
        .then(d => earningsMap.set(w.entry.ticker, { date: d, error: null }))
        .catch(e => earningsMap.set(w.entry.ticker, { date: null, error: (e as Error).message }));
    }, WIKI_PARALLEL);
    sources.finnhub = [...earningsMap.values()].some(v => v.error) ? 'error' : 'ok';
  }

  if (budgetHit) {
    errors.push(`Buxheti kohor i skanimit (${Math.round(SCAN_BUDGET_MS / 1000)}s) u plotësua — disa pyetje GDELT u kapërcyen; matja e fundit e vlefshme mbahet (carry-over) dhe vijon në skanimin tjetër.`);
  }

  // ndihmës lokal: seria Wikipedia e kandidatit (nga cache e 3-b/4-b) ose null
  const wikiSeriesFor = (w: WorkCandidate): WikiPoint[] | null => {
    const article = wikiArticleFor(w.entry);
    return article !== null ? wikiCache.get(article) ?? null : null;
  };

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

    // rreshti i ditës — Google Trends kur është në feed sot; kandidatët e
    // zbuluar proaktivisht (WW) mbulohen nga rreshtat e Wikipedia-s më poshtë.
    if (w.discoveredVia !== 'wikipedia' || w.google.inFeed) {
      newRows.push({
        observed_at: today, available_at: today,
        trend: w.term, source: 'google_trends', region: w.region,
        interest: w.google.traffic ?? 50,
        ticker: b.ticker, product: b.product, company: b.company,
        materiality: mat, promo_risk: b.promoRisk, event_risk: b.eventRisk,
        stock_price: lastCloseOnOrBefore(priceCache.get(b.ticker), today),
        index_price: lastCloseOnOrBefore(spySeries?.closes, today),
      });
    }

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

    // rreshtat e serisë Wikipedia (30 ditët e fundit — prova e kërkesës jo-lajne;
    // edhe për kandidatët e zbuluar proaktivisht, me region WW)
    if (wikiSeriesFor(w)) {
      for (const p of wikiSeriesFor(w)!.slice(-30)) {
        if (dayMs(p.date) > dayMs(today)) continue;
        const recent7 = dayMs(p.date) > dayMs(today) - 7 * 86400000;
        newRows.push({
          observed_at: p.date, available_at: p.date,
          trend: w.term, source: 'wikipedia', region: w.region,
          interest: p.views,
          ticker: b.ticker, product: b.product, company: b.company,
          materiality: mat, promo_risk: b.promoRisk, event_risk: b.eventRisk,
          stock_price: recent7 ? lastCloseOnOrBefore(priceCache.get(b.ticker), p.date) : null,
          index_price: recent7 ? lastCloseOnOrBefore(spySeries?.closes, p.date) : null,
        });
      }
    }

    // ── provat ──
    // (a) rritja GDELT 7d vs baza 28d — VETËM konfirmim mediatik (jo burim
    //     kërkese: s'jep pikë në score, s'numërohet në gate-in e burimeve)
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

    // (d) score — Wikipedia është prova e kërkesës (demand); GDELT mbetet
    //     vetëm te komponenti i konfirmimit mediatik. Qenia në feed S'JEP
    //     më pikë falas (dikur jepte 12.5). Komponentët pa data japin 0
    //     pikë DHE s'numërohen — componentsAvailable tregon sa prej 6 kan
    //     data reale (materiality/quality/event janë vlerësime manuale).
    const breakdown: ScoreBreakdown = {
      demand: 0, // mbushet PAS wikiStats (më poshtë) — këtu vetëm deklarimi
      confirmation: confirmed ? 20 : (growth !== null && growth > 0 ? 8 : 0),
      materiality: 20 * mat,
      price: priceVsIndex === null ? 0 : priceVsIndex <= PRICE_WINDOW_OPEN ? 15 : priceVsIndex <= PRICE_WINDOW_CLOSED ? 8 : 0,
      quality: 10 * (1 - b.promoRisk) * (confirmed ? 1 : 0.5),
      event: 10 * (1 - b.eventRisk),
    };
    let componentsAvailable = [
      growth !== null, true, priceVsIndex !== null, true, true,
    ].filter(Boolean).length; // +1 kur wikiStats ka growth — mbushet më poshtë
    let score = 0;

    // ── makina e statusit (e varur nga provat) ──
    const reasons: string[] = [];
    reasons.push(w.discoveredVia === 'wikipedia'
      ? `Zbuluar PROAKTIVISHT nga seria Wikipedia (rritje e vazhdueshme pageviews, ${w.region}) → marka i përket ${b.company} (${b.ticker}).`
      : `Zbuluar në Google Trends ${w.region}: «${w.term}»${w.google.approxTraffic ? ` (trafik ~${w.google.approxTraffic})` : ''} → marka i përket ${b.company} (${b.ticker}).`);

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
    } else if (priceSkipped.has(b.ticker)) {
      reasons.push(`Çmimet: KRAHASIMI NUK U KRYE — kapërcyer nga buxheti kohor i skanimit (kontrolluar ${today}); radha e rrotulluar e matjeve e merr me përparësi në skanimin e radhës.`);
    } else {
      reasons.push(`Çmimet: s'ka ≥2 close të përbashkët aksion/SPY për dritaren ${PRICE_WINDOW_DAYS}-ditore — kontrolli i reagimit nuk u krye (e pamatshme, jo 0%).`);
    }

    // ── gate-t (v4): 5 provat e RESEARCH — secila me arsye pse kaloi/dështoi ──
    const article = wikiArticleFor(b);
    const noArticle = article === null;
    const wikiFailed = article !== null && wikiErrors.has(article);
    const wikiExcluded = !measuredBatchKeys.has(w.key); // jashtë radhës së matjes së këtij skanimi
    const wikiSeries = article !== null ? wikiCache.get(article) ?? null : null;
    let wstats = wikiSeries ? wikiStats(wikiSeries, today) : null;
    const wikiErr = noArticle
      ? "artikulli Wikipedia i pakuruar për këtë markë — s'matet dot"
      : wikiFailed
        ? (wikiErrors.get(article as string) ?? 'fetch-i dështoi')
        : wikiExcluded && !wikiSeries
          ? `jashtë radhës së matjes së këtij skanimi (${MAX_GDELT_CANDIDATES} të parët sipas lastMeasuredAt — radha rrotullohet me skanimet)`
          : null;
    // carry-over: kur API dështoi, mbaj matjen e fundit të vlefshme (të datuar) —
    // pa democione për gabime infrastrukture (e njëjta filozofi si GDELT-u).
    let carriedWiki = false;
    if (!wstats && wikiFailed && prev?.wiki && (prev.wiki.growth !== null || prev.wiki.risingWeeks !== null)) {
      wstats = {
        growth: prev.wiki.growth, pageviews7dMedian: prev.wiki.pageviews7dMedian,
        baselineMedian: prev.wiki.baselineMedian, risingWeeks: prev.wiki.risingWeeks, peakToAvg: prev.wiki.peakToAvg,
      };
      carriedWiki = true;
    }

    // FILLIMI I TRENDIT — ankora e gate-it not_priced: dita e parë e rritjes
    // së vazhdueshme në serinë Wikipedia (jo dita kur e pa SISTEMI termin);
    // fallback firstSeenAt, i shënuar si i tillë (i mangët, jo i fshehur).
    const wikiTrendStart = wikiSeries ? computeTrendStart(wikiSeries, today) : null;
    const trendStart: TrendStart = wikiTrendStart
      ? { at: wikiTrendStart, source: 'wiki' }
      : prev?.trendStart ?? { at: (prev?.firstSeenAt ?? now).slice(0, 10), source: 'firstSeen' };
    // kur fillimi i trendit bie mbrapa serisë 3M, merret historia 6M (rrallë —
    // vetëm fallback-i firstSeen mund të bie kaq prapa; Wikipedia ka 90 ditë)
    if (stockCloses && stockCloses.length
        && dayMs(stockCloses[0].date) > dayMs(trendStart.at) + 3 * 86400000 && withinBudget()) {
      try {
        const s6 = await fetchPriceSeries(b.ticker, '6M');
        priceCache.set(b.ticker, s6.closes);
        priceSource.set(b.ticker, s6.source);
      } catch { /* mbetet 3M — matja kufizohet në historinë që ka */ }
    }
    const stockClosesLong = priceCache.get(b.ticker) ?? stockCloses;
    let retSince = stockClosesLong && spyCloses ? computeReturnSinceStart(stockClosesLong, spyCloses, trendStart.at) : null;
    let carriedSince = false;
    const ps = !retSince && !stockCloses ? prev?.sinceStart : undefined;
    if (ps && ps.relative !== null && ps.stockRet !== null && ps.indexRet !== null
      && ps.fromDate !== null && ps.asOf !== null && ps.tradingDays !== null) {
      retSince = {
        stockRet: ps.stockRet, indexRet: ps.indexRet, relative: ps.relative,
        fromDate: ps.fromDate, asOf: ps.asOf, tradingDays: ps.tradingDays,
      };
      carriedSince = true;
    }
    const avgDollarVol = stockCloses
      ? computeAvgDollarVolume(stockCloses)
      : prev?.liquidity.avgDollarVolume ?? null;

    const gateResults = evaluateGates({
      googleInFeed: w.google.inFeed,
      wiki: wstats,
      wikiError: wikiErr,
      effectiveMateriality: mat,
      exposurePct: b.materiality,
      capBucket: b.cap,
      linkType: b.linkType ?? 'direct',
      materialityReason: `vlerësim manual i fjalorit (materiality ${b.materiality.toFixed(2)}, kufizuar nga kova ${b.cap})`,
      returnSinceStart: retSince,
      returnError: stockCloses && spyCloses ? null : "seritë e çmimeve mungojnë ose s'kanë close të përbashkët",
      avgDollarVolume: avgDollarVol,
      volumeError: avgDollarVol === null ? (stockCloses ? "burimi i çmimeve s'jon volumet për këtë seri" : undefined) : undefined,
    });
    const gatesList: GateEval[] = [
      { gate: 'sources', passed: gateResults.sources.passed, detail: gateResults.sources.detail, checkedAt: now },
      { gate: 'materiality', passed: gateResults.materiality.passed, detail: gateResults.materiality.detail, checkedAt: now },
      { gate: 'not_priced', passed: gateResults.not_priced.passed, detail: gateResults.not_priced.detail, checkedAt: now },
      { gate: 'liquidity', passed: gateResults.liquidity.passed, detail: gateResults.liquidity.detail, checkedAt: now },
      { gate: 'persistence', passed: gateResults.persistence.passed, detail: gateResults.persistence.detail, checkedAt: now },
    ];
    const gatesOk = allGatesPassed(gateResults);
    const alreadyMovedFlag = isAlreadyMoved(retSince);
    if (carriedWiki) {
      reasons.push(`Wikipedia e padisponueshme këtë skanim (${wikiErr}) — u mbajt matja e fundit e vlefshme për gate-t; s'ka democion për gabim infrastrukture.`);
    }
    if (carriedSince) {
      reasons.push("Kthimi që nga fillimi i trendit: çmimet s'u morën këtë skanim — u mbajt matja e fundit (e datuar).");
    }
    reasons.push(`Fillimi i trendit (ankora e «s'është çmuar»): ${trendStart.at} — ${trendStart.source === 'wiki'
      ? 'dita e parë e rritjes së vazhdueshme në serinë Wikipedia (mediana 7d ≥ +15% mbi bazën 28d të matur 14 ditë më parë)'
      : 'fallback: dita kur e pa sistemi për herë të parë — seria Wikipedia s\'mjafton për t\'gjetur fillimin e vërtetë'}.`);

    // score (v5): demand nga Wikipedia (prova e kërkesës) — këtu, pas wikiStats
    if (wstats && wstats.growth !== null) {
      breakdown.demand = 25 * clamp01(wstats.growth);
      componentsAvailable += 1;
    }
    score = Math.round(breakdown.demand + breakdown.confirmation + breakdown.materiality + breakdown.price + breakdown.quality + breakdown.event);
    reasons.push(`Score ${score}/100 · ${componentsAvailable}/6 komponentë me data (demand = Wikipedia; konfirmimi = GDELT; materialiteti/çmimi/cilësia/eventi — vlerësime manuale ose dritare çmimesh) — vetëm RENDITJE, jo gate.`);

    // flamujt bllokues + makina e statusit (e varur nga gate-t)
    const promoBlock = b.promoRisk >= 0.7;
    const eventBlock = b.eventRisk >= 0.8;
    const mainstream = carriedArticlesN !== null && carriedArticlesN >= MAINSTREAM_ARTICLES;
    const causeBad = cause?.type === 'negative_event';

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
    } else if (gatesOk) {
      status = 'RESEARCH';
      reasons.push(`NGJITJE në RESEARCH: të 5 gate-t kaluan — 2+ burime kërkese të pavarura në rritje (Google Trends + Wikipedia; GDELT vetëm si konfirmim mediatik) · materialitet i mjaftueshëm · s'është çmuar ende · likuiditet i mjaftueshëm · 3+ javë qëndrueshmëri pa model spike-i. Score ${score} = vetëm renditje. Kandidat për hulumtim thelbësor — jo rekomandim tregtimi.`);
    } else if (w.isNew && !series && !articles && !cause) {
      status = 'DISCOVERED';
      reasons.push('DISCOVERED: u gjet termi dhe marka — pritet verifikimi i lidhjes me kompaninë (GDELT) në skanimin e radhës.');
    } else {
      status = 'WATCH';
      const missing: string[] = [];
      for (const g of gatesList) {
        if (g.passed === false) missing.push(`${g.gate}: ${g.detail}`);
        else if (g.passed === null) missing.push(`${g.gate}: e pamatshme — ${g.detail}`);
      }
      reasons.push(`Në WATCH — lidhja me ${b.ticker} u verifikua, por gate-t e RESEARCH s'janë të gjitha të kaluara: ${missing.length ? missing.join(' · ') : 'pa detaje'}.`);
      if (alreadyMovedFlag) {
        reasons.push('Flamuri ALREADY_MOVED: çmimi ka reaguar që nga fillimi i trendit — teza e «hendekut të paçmuar» s\'qëndron më; rikthehet në kërkim vetëm kur të ketë hendek të re me kërkesë të re.');
      }
    }

    // ftohja: kandidat aktiv pa matje të reja — POR jo sa kohë Wikipedia
    // tregon rritje të vazhdueshme (një trend i ngadaltë s'ftohet vetëm
    // se s'është më «i nxehtë» sot në feed).
    if (status !== 'REMOVED' && prev && prev.status !== 'REMOVED') {
      const lastSeen = Date.parse(prev.lastSeenAt);
      if (Number.isFinite(lastSeen) && Date.now() - lastSeen > STALE_DAYS * 86400000
          && !w.google.inFeed && !wikiAlive(wstats) && !wikiAlive(prev.wiki)) {
        status = 'REMOVED';
        reasons.push(`DALJE: interesi u ftoh — pa matje të reja për më shumë se ${STALE_DAYS} ditë (as në feed, as rritje në Wikipedia).`);
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
      wiki: { article: null, growth: null, pageviews7dMedian: null, baselineMedian: null, risingWeeks: null, peakToAvg: null, error: null, checkedAt: null },
      liquidity: { avgDollarVolume: null, error: null, checkedAt: null },
      sinceStart: { fromDate: null, asOf: null, tradingDays: null, stockRet: null, indexRet: null, relative: null, checkedAt: null },
      materialityInfo: { exposurePct: null, reason: 'vlerësohet në këtë skanim', capBucket: b.cap, linkType: b.linkType ?? 'direct' },
      gates: [],
      alreadyMoved: false,
      // ── fushat v5 ──
      groupKey: groupKeyOf(w.term, b.ticker),
      discoveredVia: w.discoveredVia,
      lastMeasuredAt: null,
      trendStart: null,
      componentsAvailable: 6,
      outcomeFromPromotion: emptyPromotionOutcome(),
      catalyst: { nextEarningsDate: null, daysToEarnings: null, error: null, checkedAt: null },
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

    // ngjitja e parë në RESEARCH → ankora e rezultatit nga promovimi (F);
    // rikondensohet nga historia kur vjen nga një store i vjetër
    if (!cand.outcomeFromPromotion?.promotedAt) {
      const fromHistory = cand.history.find(h => h.to === 'RESEARCH')?.at ?? null;
      if (status === 'RESEARCH' || fromHistory) {
        cand.outcomeFromPromotion = { ...(cand.outcomeFromPromotion ?? emptyPromotionOutcome()), promotedAt: fromHistory ?? now };
      }
    }

    cand.status = status;
    // freskimi i lastSeenAt: në feed SOT ose Wikipedia ende në rritje —
    // një trend i ngadaltë s'ftohet vetëm se s'është më «i nxehtë» sot.
    cand.lastSeenAt = (w.google.inFeed || wikiAlive(wstats) || wikiAlive(prev?.wiki)) ? now : (prev?.lastSeenAt ?? now);
    if (measuredBatchKeys.has(w.key)) cand.lastMeasuredAt = now; // radha e matjes u krye këtë skanim
    cand.groupKey = groupKeyOf(cand.trend, cand.ticker);
    cand.trendStart = trendStart;
    if (!cand.discoveredVia) cand.discoveredVia = w.discoveredVia;
    cand.score = score;
    cand.componentsAvailable = componentsAvailable;
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
        error: feedError ?? (priceSkipped.has(b.ticker)
          ? 'kapërcyer nga buxheti kohor i skanimit — radha e matjeve e merr në skanimin e radhës'
          : stockCloses && spyCloses
            ? `vetëm ${new Set([...stockCloses.map(p => p.date), ...spyCloses.map(p => p.date)].filter((d, i, a) => a.indexOf(d) === i)).size} data të përbashkëta — duhen ≥2`
            : 'seritë e çmimeve mungojnë'),
        checkedAt: now,
      };
      if (!win) {
        // fshi kthimet e vjetra kur s'ka dritare të re — asOf/source mbeten si dëshmi e matjes së fundit
        cand.price.stockReturn = prev?.price.stockReturn ?? null;
        cand.price.indexReturn = prev?.price.indexReturn ?? null;
        cand.price.priceVsIndex = prev?.price.priceVsIndex ?? null;
      }
    }

    // rezultati 5/20 ditë — përfshi refuzuarit (në këtë hap: aktivët).
    // Seritë e gjata (6M kur u ngjiten për trendStart) përdoren edhe këtu.
    updateOutcome(cand, stockClosesLong, spyCloses, now);
    // rezultati nga NGJITJA në RESEARCH — vetëm për të promovuarit
    if (status === 'RESEARCH' || cand.outcomeFromPromotion?.promotedAt) {
      updatePromotionOutcome(cand, stockClosesLong, spyCloses, now);
    }

    // fushat e gate-ve (v4): matjet e reja ose gabimi konkret, kurrë të fabrikuara
    cand.wiki = wstats && wikiSeries
      ? {
          article, growth: wstats.growth, pageviews7dMedian: wstats.pageviews7dMedian,
          baselineMedian: wstats.baselineMedian, risingWeeks: wstats.risingWeeks, peakToAvg: wstats.peakToAvg,
          error: wikiErr, checkedAt: now,
        }
      : carriedWiki && prev
        ? { ...prev.wiki, error: wikiErr } // matja e fundit e vlefshme (checkedAt i saj = data e matjes)
        : {
            article, growth: null, pageviews7dMedian: null, baselineMedian: null,
            risingWeeks: null, peakToAvg: null, error: wikiErr, checkedAt: now,
          };
    cand.liquidity = {
      avgDollarVolume: avgDollarVol,
      error: avgDollarVol === null
        ? (stockCloses ? "burimi i çmimeve s'jon volumet për këtë seri" : 'çmimet s\u2019u morën këtë skanim')
        : null,
      checkedAt: now,
    };
    cand.sinceStart = retSince
      ? { fromDate: retSince.fromDate, asOf: retSince.asOf, tradingDays: retSince.tradingDays, stockRet: retSince.stockRet, indexRet: retSince.indexRet, relative: retSince.relative, checkedAt: now }
      : { fromDate: null, asOf: null, tradingDays: null, stockRet: null, indexRet: null, relative: null, checkedAt: now };
    cand.materialityInfo = {
      exposurePct: b.materiality,
      reason: `vlerësim manual i fjalorit: materiality ${b.materiality.toFixed(2)} mbi kovën ${b.cap} → efektiv ${mat.toFixed(2)}`,
      capBucket: b.cap,
      linkType: b.linkType ?? 'direct',
    };
    cand.gates = gatesList;
    cand.alreadyMoved = alreadyMovedFlag;
    // katalizatori i fitimeve — vetëm shfaqje/renditje, JO gate; pa çelës = null
    const finn = earningsMap.get(b.ticker);
    if (finnhubEnabled) {
      const days = finn?.date ? Math.round((dayMs(finn.date) - dayMs(today)) / 86400000) : null;
      cand.catalyst = { nextEarningsDate: finn?.date ?? null, daysToEarnings: days, error: finn?.error ?? null, checkedAt: now };
    } else {
      cand.catalyst = { ...(prev?.catalyst ?? { nextEarningsDate: null, daysToEarnings: null, error: null }), checkedAt: now };
    }

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
    if (Number.isFinite(lastSeen) && Date.now() - lastSeen > STALE_DAYS * 86400000 && !wikiAlive(c.wiki)) {
      c.status = 'REMOVED';
      c.lastChangedAt = now;
      c.history.push({ at: now, from: 'WATCH', to: 'REMOVED', reason: `DALJE: interesi u ftoh — pa matje të reja për më shumë se ${STALE_DAYS} ditë (as në feed, as rritje në Wikipedia).` });
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
    discoveredWiki: wikiDiscovered,
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
    discoveredWiki: wikiDiscovered,
    newCandidates, promoted, removed, activeCount, sources, errors, archived,
  };
}

// ── ndihmës të vegjël ────────────────────────────────────────────

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Skeleti bosh i rezultatit nga promovimi (mbushet nga motori kur ngjitet). */
function emptyPromotionOutcome() {
  return { promotedAt: null, baseDate: null, baseStock: null, baseIndex: null, d5: null, d20: null, pendingNote: null, lastCheckedAt: null };
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
