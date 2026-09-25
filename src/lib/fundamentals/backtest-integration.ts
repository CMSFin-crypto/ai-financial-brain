// ============================================================
// TASK 26 — FAZA 2: LIDHJA E FUNDAMENTEVE ME BACKTEST-IN
// ============================================================
// Testi rigoroz i kërkuar nga useri:
//
//   Varianti A: Technical-only (baseline — NUK ndryshohet)
//     indikatorë teknikë + regjimi + sektor/RS + event rules
//   Varianti B: Technical + Fundamental filter
//     PIKËRISHT të njëjtat kushte teknike si A — ndryshimi i
//     vetëm është filtri fundamental.
//
// FILTRI FUNDAMENTAL (i thjeshtë dhe i shpjegueshëm):
//
//   standard (N/A ≠ FAIL):
//     - Revenue growth nuk është negativ      (mungesa → kalon)
//     - EPS growth nuk është negativ           (mungesa → kalon)
//     - FCF TTM nuk është negativ             (mungesa → kalon)
//     - Debt/equity nuk është ekstrem (≤250%) (mungesa → kalon)
//     - pa risk flag kritik (rënie e thellë, D/E ekstrem)
//   strict:
//     - revenue growth pozitiv   (e dhëna e detyrueshme)
//     - EPS growth pozitiv       (e dhëna e detyrueshme)
//     - FCF pozitiv              (e dhëna e detyrueshme)
//     - debt/equity nën prag (≤150%)
//     - N/A = FAIL (s'garantohet cilësia pa të dhëna)
//
// POINT-IN-TIME është i detyrueshëm (spec i userit):
//     data_available_at <= signal_timestamp
//     earnings_release_timestamp <= signal_timestamp
// Rregulli i publikimit pas mbylljes: një filing me datë D
// mund të jetë publikuar PAS mbylljes së ditës D — prandaj
// përdoret vetëm për sinjalet e ditës D+1 e tutje
// (usableFrom = filed + 1 ditë). Kjo parandalon look-ahead bias.
// ============================================================

import type { FundamentalContext } from './normalize';
import {
  fetchPointInTimeFacts, PointInTimeFact, pointInTimeFundamentalContext,
} from './point-in-time';

// ─── 1. Filtri fundamental ───

export type FundamentalFilterMode = 'standard' | 'strict';

/** Pragu i D/E: standard e lejon deri në "ekstrem" (250% = high severity);
 *  strict kërkon nën pragun e mesëm (150%). */
export const DE_THRESHOLD_STANDARD = 250;
export const DE_THRESHOLD_STRICT = 150;
/** Rënie e thellë = risk flag kritik (nënvizohet edhe kur rritja vetëm negative). */
export const REVENUE_CRASH_PCT = -0.10;
export const EPS_CRASH_PCT = -0.15;

export interface FundFilterResult {
  pass: boolean;
  /** arsyeja e parë e dështimit — kod për rejectReasons të motorit */
  reason: string | null;
  /** sa nga 4 kontrollet bazë ishin pa të dhëna (N/A) */
  naChecks: number;
  /** a kishte asnjë të dhënë fondamentale të vlefshme */
  hasAnyData: boolean;
}

/**
 * Vlerëson filtrin fundamental mbi një kontekst as-of (point-in-time).
 * ctx = null → s'ka asnjë të dhënë: standard KALON (N/A ≠ FAIL), strict DESHTON.
 */
export function evaluateFundamentalFilter(
  ctx: FundamentalContext | null,
  mode: FundamentalFilterMode,
): FundFilterResult {
  if (!ctx) {
    return mode === 'standard'
      ? { pass: true, reason: null, naChecks: 4, hasAnyData: false }
      : { pass: false, reason: 'MISSING_DATA', naChecks: 4, hasAnyData: false };
  }

  const rg = ctx.revenueGrowth;
  const eg = ctx.epsGrowth;
  const fcf = ctx.freeCashFlow;
  const de = ctx.debtToEquity;

  let naChecks = 0;
  if (rg === undefined) naChecks++;
  if (eg === undefined) naChecks++;
  if (fcf === undefined) naChecks++;
  if (de === undefined) naChecks++;
  const hasAnyData = naChecks < 4;

  if (mode === 'strict') {
    // E dhëna e detyrueshme: kushti pozitiv, mungesa = dështim
    if (rg === undefined || eg === undefined || fcf === undefined || de === undefined) {
      return { pass: false, reason: 'MISSING_DATA', naChecks, hasAnyData };
    }
    if (rg <= 0) return { pass: false, reason: 'REVENUE_NOT_POSITIVE', naChecks, hasAnyData };
    if (eg <= 0) return { pass: false, reason: 'EPS_NOT_POSITIVE', naChecks, hasAnyData };
    if (fcf <= 0) return { pass: false, reason: 'FCF_NOT_POSITIVE', naChecks, hasAnyData };
    if (de > DE_THRESHOLD_STRICT) return { pass: false, reason: 'DEBT_ABOVE_THRESHOLD', naChecks, hasAnyData };
    return { pass: true, reason: null, naChecks, hasAnyData };
  }

  // standard: mungesa ≠ dështim — kontrollo VETËM ato që janë të pranishme
  if (rg !== undefined && rg < 0) {
    return { pass: false, reason: rg <= REVENUE_CRASH_PCT ? 'REVENUE_CRASH' : 'REVENUE_NEGATIVE', naChecks, hasAnyData };
  }
  if (eg !== undefined && eg < 0) {
    return { pass: false, reason: eg <= EPS_CRASH_PCT ? 'EPS_CRASH' : 'EPS_NEGATIVE', naChecks, hasAnyData };
  }
  if (fcf !== undefined && fcf < 0) {
    return { pass: false, reason: 'FCF_NEGATIVE', naChecks, hasAnyData };
  }
  if (de !== undefined && de > DE_THRESHOLD_STANDARD) {
    return { pass: false, reason: 'DEBT_EXTREME', naChecks, hasAnyData };
  }
  return { pass: true, reason: null, naChecks, hasAnyData };
}

/** Rregullat si tekst — për UI / dokumentimin e testit. */
export const FUND_FILTER_RULES: Record<FundamentalFilterMode, string[]> = {
  standard: [
    'Revenue growth ≥ 0% (mungesa e të dhënës NUK është dështim)',
    'EPS growth ≥ 0% (mungesa NUK është dështim)',
    'FCF TTM ≥ 0 (mungesa NUK është dështim)',
    `Debt/Equity ≤ ${DE_THRESHOLD_STANDARD}% (mbi = ekstreme)`,
    `Risk flag kritik: revenue ≤ ${REVENUE_CRASH_PCT * 100}% ose EPS ≤ ${EPS_CRASH_PCT * 100}%`,
    'N/A ≠ FAIL — sinjalet pa të dhëna kalojnë dhe numërohen veç',
  ],
  strict: [
    'Revenue growth > 0% — e dhëna e detyrueshme',
    'EPS growth > 0% — e dhëna e detyrueshme',
    'FCF TTM > 0 — e dhëna e detyrueshme',
    `Debt/Equity ≤ ${DE_THRESHOLD_STRICT}%`,
    'N/A = FAIL — pa të dhëna nuk garantohet cilësia',
  ],
};

// ─── 2. Timeline-i fundamental point-in-time ───

export interface FundamentalTimelineEntry {
  /** data e parë nga e cila snapshot-i është i përdorshëm (filed + 1 ditë) */
  usableFrom: string;
  /** data e filing-ut që e prodhoi snapshot-in */
  filed: string;
  /** konteksti fundamental SI NJIHET në atë moment (as-of filed EOD) */
  context: FundamentalContext;
}

/** Dita kalendarike pasuese (UTC) — "pas mbylljes → dita pasuese". */
function nextCalendarDay(isoDate: string): string {
  const t = new Date(isoDate + 'T00:00:00Z').getTime() + 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Ndërton timeline-in e snapshot-eve fundamentale të një simboli:
 * një snapshot për ÇDO datë filing (10-Q/10-K/8-K…) — konteksti
 * as-of fundit të asaj dite. Snapshot-i bëhet i përdorshëm nga
 * ditja PASUESE (rregulli anti look-ahead i publikimit pas mbylljes).
 */
export function buildFundamentalTimeline(
  factsByConcept: Record<string, PointInTimeFact[]>,
): FundamentalTimelineEntry[] {
  const filedDates = new Set<string>();
  for (const facts of Object.values(factsByConcept)) {
    for (const f of facts) filedDates.add(f.availableAt.slice(0, 10));
  }
  if (filedDates.size === 0) return [];

  const entries: FundamentalTimelineEntry[] = [];
  for (const filed of [...filedDates].sort()) {
    const ts = filed + 'T23:59:59.999Z'; // fundi i ditës së filing-ut
    const context = pointInTimeFundamentalContext(factsByConcept, ts);
    entries.push({ usableFrom: nextCalendarDay(filed), filed, context });
  }
  entries.sort((a, b) => a.usableFrom < b.usableFrom ? -1 : 1);
  return entries;
}

/**
 * Konteksti fundamental për një sinjal në datën dateKey ('YYYY-MM-DD').
 * Kushti: usableFrom ≤ dateKey, pra filed < dateKey — një filing i
 * publikuar SOT (mund të jetë pas mbylljes) NUK përdoret dot.
 */
export function fundamentalContextAsOf(
  timeline: FundamentalTimelineEntry[] | undefined,
  dateKey: string,
): FundamentalContext | null {
  if (!timeline || timeline.length === 0) return null;
  // kërkim binar: i fundit me usableFrom <= dateKey
  let lo = 0, hi = timeline.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (timeline[mid].usableFrom <= dateKey) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans >= 0 ? timeline[ans].context : null;
}

// ─── 3. Fetch me batch për gjithë universin (EDGAR companyfacts) ───

/** Cache kompakte e timeline-ve të ekstraktuara (KB për simbol — jo JSON i
 *  papërpunuar): lambdat e ngrohta në Vercel akumulojnë mbulim nëpër run-e
 *  pa e rifetchuar EDGAR-in për të njëjtat simbole brenda 12 orësh. */
const timelineCache = new Map<string, { tl: FundamentalTimelineEntry[]; at: number }>();
const TIMELINE_CACHE_TTL = 12 * 3600 * 1000;

export interface FundamentalsFetchResult {
  /** symbol → timeline (vetëm simbolet me së paku një snapshot me të dhëna) */
  timelines: Record<string, FundamentalTimelineEntry[]>;
  symbolsWithData: number;
  totalAttempted: number;
  /** simbolet që u lënë jashtë për shkak të deadline-it (N/A ≠ FAIL) */
  skippedForDeadline: number;
  source: string;
}

/**
 * Fetch EDGAR companyfacts për një listë simbolesh dhe ndërton timeline-të
 * point-in-time. RENDI i listës ka rëndësi: simbolet që TREGTOJNë (kanë
 * tregti në variantet A-D) vijnë të parat — kështu, edhe kur server-i në
 * prod është i ngadaltë ndaj EDGAR-it, mbulimi fillimisht mbulon ato që
 * vendosin rezultatin e testit. Pacing: batch 8 + 120ms (EDGAR ≤10 req/s,
 * mesatarja reale ~3 req/s). Deadline-i mbron run-in nga timeout-i — simbolet
 * e mbetura jashtë mbeten N/A (standard: kalojnë, strict: dështojnë).
 */
export async function buildFundamentalTimelines(
  symbols: string[],
  opts: { deadlineMs?: number } = {},
): Promise<FundamentalsFetchResult> {
  const deadline = Date.now() + (opts.deadlineMs ?? 180_000);
  const timelines: Record<string, FundamentalTimelineEntry[]> = {};
  let symbolsWithData = 0;
  let skippedForDeadline = 0;
  const BATCH = 8;
  const DELAY_MS = 120;

  const fetchOne = async (sym: string) => {
    const cached = timelineCache.get(sym);
    if (cached && Date.now() - cached.at < TIMELINE_CACHE_TTL) {
      if (cached.tl.length > 0) { timelines[sym] = cached.tl; symbolsWithData++; }
      return;
    }
    const facts = await fetchPointInTimeFacts(sym, { noRawCache: true });
    const tl = buildFundamentalTimeline(facts);
    // mbaj vetëm snapshot-et që mbajnë së paku një metrikë filteri
    const meaningful = tl.filter(e => {
      const c = e.context;
      return c.revenueGrowth !== undefined || c.epsGrowth !== undefined
        || c.freeCashFlow !== undefined || c.debtToEquity !== undefined;
    });
    timelineCache.set(sym, { tl: meaningful, at: Date.now() });
    if (meaningful.length > 0) {
      timelines[sym] = meaningful;
      symbolsWithData++;
    }
  };

  for (let i = 0; i < symbols.length; i += BATCH) {
    if (Date.now() > deadline) {
      skippedForDeadline = symbols.length - i;
      break;
    }
    const batch = symbols.slice(i, i + BATCH);
    await Promise.allSettled(batch.map(fetchOne));
    if (i + BATCH < symbols.length) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  return {
    timelines,
    symbolsWithData,
    totalAttempted: symbols.length,
    skippedForDeadline,
    source: 'SEC EDGAR XBRL companyfacts (10-Q/10-K/8-K — data e filing-ut si available_at)',
  };
}
