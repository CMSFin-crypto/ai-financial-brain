// ============================================================
// TASK 26 — POINT-IN-TIME FUNDAMENTALS
// ============================================================
// RREGULLI MË I RËNDËSISHËM I TESTIT (spec i userit):
//
//     available_at <= signal_timestamp
//
// Në testim përdoren VETËM të dhënat fundamentale që ishin të
// disponueshme në momentin e sinjalit. Revenue / EPS / estimates
// të rishikuara SOT nuk përdoren kurrë për të simuluar një sinjal
// të vjetër — kjo do të krijonte look-ahead bias dhe do të frynte
// rezultatet e testit.
//
// Burimi point-in-time i vërtetë: SEC EDGAR companyfacts (XBRL).
// Çdo fact vjen me datën `filed` — kur u bë e ditshme për publikun.
// Për testin e ardhshëm A/B (Technical-only vs Technical +
// Fundamental filter) motori i backtest-it thërret:
//
//     pointInTimeFundamentalContext(facts, signalTimestamp)
//
// i cili kthen kontekstin FUNDAMENTAL as-of kohës së sinjalit.
// ============================================================

import type { FundamentalContext } from './normalize';

// ─── 1. Filtri bazë — available_at <= signal_timestamp ───

export interface HasAvailableAt {
  availableAt: string;   // ISO date — kur u bë e ditshme (filed / published)
}

/**
 * Fakti i fundit i disponueshëm PARA momentit të sinjalit.
 * Kjo është e gjithë magjia kundër look-ahead bias.
 */
export function asOf<T extends HasAvailableAt>(records: T[], signalTimestamp: string | Date): T | null {
  const ts = typeof signalTimestamp === 'string' ? new Date(signalTimestamp).getTime() : signalTimestamp.getTime();
  let best: T | null = null;
  for (const r of records) {
    const at = new Date(r.availableAt).getTime();
    if (!isFinite(at)) continue;
    if (at <= ts && (best === null || at > new Date(best.availableAt).getTime())) {
      best = r;
    }
  }
  return best;
}

/** Versioni me listë: çdo grup ruajt një fakt të vetëm as-of. */
export function asOfLatest<T extends HasAvailableAt>(records: T[], signalTimestamp: string | Date): T[] {
  const ts = typeof signalTimestamp === 'string' ? new Date(signalTimestamp).getTime() : signalTimestamp.getTime();
  return records.filter(r => {
    const at = new Date(r.availableAt).getTime();
    return isFinite(at) && at <= ts;
  });
}

// ─── 2. EDGAR companyfacts — burimi historik point-in-time ───

const TICKER_MAP_URL = 'https://www.sec.gov/files/company_tickers.json';
const EDGAR_USER_AGENT = 'ai-financial-brain research@example.com';

let tickerMapCache: { data: Record<string, string>; fetchedAt: number } | null = null;
const TICKER_MAP_TTL = 24 * 3600 * 1000;

/** ticker → CIK (10-shifror pa zero të para). Cache 24h. */
export async function resolveCIK(ticker: string): Promise<string | null> {
  const t = ticker.toUpperCase().trim();
  if (!tickerMapCache || Date.now() - tickerMapCache.fetchedAt > TICKER_MAP_TTL) {
    try {
      const res = await fetch(TICKER_MAP_URL, {
        headers: { 'User-Agent': EDGAR_USER_AGENT, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const json = await res.json() as Record<string, { ticker: string; cik_str: number }>;
        const map: Record<string, string> = {};
        for (const entry of Object.values(json)) {
          map[entry.ticker.toUpperCase()] = String(entry.cik_str);
        }
        tickerMapCache = { data: map, fetchedAt: Date.now() };
      }
    } catch {
      // mbetet cache e vjetër ose bosh
    }
  }
  const cik = tickerMapCache?.data[t];
  return cik ? String(Number(cik)).padStart(10, '0') : null;
}

const companyFactsCache = new Map<string, { data: unknown; fetchedAt: number }>();
const COMPANY_FACTS_TTL = 12 * 3600 * 1000;

/** companyfacts JSON për një CIK. Cache 12h (të dhëna statike historike). */
export async function fetchCompanyFacts(cik: string): Promise<any | null> {
  const key = cik.padStart(10, '0');
  const cached = companyFactsCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < COMPANY_FACTS_TTL) return cached.data;
  try {
    const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${key}.json`, {
      headers: { 'User-Agent': EDGAR_USER_AGENT, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    companyFactsCache.set(key, { data: json, fetchedAt: Date.now() });
    return json;
  } catch {
    return null;
  }
}

// ─── 3. Ekstraktimi i fakteve tremujore ───

/** Konceptet US-GAAP që na interesojnë për kontekstin fundamental. */
export const FACT_CONCEPTS = {
  revenues: 'Revenues',
  revenueAlt: 'RevenueFromContractWithCustomerExcludingAssessedTax',
  netIncome: 'NetIncomeLoss',
  grossProfit: 'GrossProfit',
  operatingIncome: 'OperatingIncomeLoss',
  epsDiluted: 'EarningsPerShareDiluted',
  equity: 'StockholdersEquity',
  longTermDebt: 'LongTermDebt',
  totalDebt: 'DebtLongtermAndShorttermCombinedAmount',
  cash: 'CashAndCashEquivalentsAtCarryingValue',
  operatingCashFlow: 'NetCashProvidedByUsedInOperatingActivities',
  capex: 'PaymentsToAcquirePropertyPlantAndEquipment',
} as const;

export interface PointInTimeFact {
  concept: string;
  value: number;
  start: string;        // fillimi i periudhës faktike (ISO)
  end: string;          // fundi i periudhës faktike (ISO)
  availableAt: string; // data e filing-ut — PËRDOR VETËM KJO për point-in-time
  form: string;        // 10-Q / 10-K / 8-K
  fy: number;
  fp: string;           // Q1..Q4 / FY
}

/**
 * Ekstrakton faktet tremujore/ vjetore me datën e publikimit.
 * Një concept mund të raportohet disa herë (fillimese 10-Q, rivlerësim
 * 10-K) — mbahen TË GJITHA, asOf() zgjedjë të duhurën sipas kohës.
 */
export function extractPointInTimeFacts(raw: any, concept: string): PointInTimeFact[] {
  const facts: PointInTimeFact[] = [];
  const gaap = raw?.facts?.['us-gaap'];
  const units = gaap?.[concept]?.units;
  if (!units) return facts;
  for (const arr of Object.values(units) as any[]) {
    if (!Array.isArray(arr)) continue;
    for (const u of arr) {
      if (u.start === undefined || u.end === undefined || typeof u.val !== 'number') continue;
      const filed = typeof u.filed === 'string' ? u.filed : null;
      if (!filed) continue;
      facts.push({
        concept,
        value: u.val,
        start: u.start,
        end: u.end,
        availableAt: filed,   // ← rregulli: disponueshme vetëm nga kjo datë
        form: String(u.form || ''),
        fy: Number(u.fy || 0),
        fp: String(u.fp || ''),
      });
    }
  }
  return facts;
}

/** Faktet e një simboli për konceptet që na duhen (batch). */
export async function fetchPointInTimeFacts(ticker: string): Promise<Record<string, PointInTimeFact[]>> {
  const cik = await resolveCIK(ticker);
  if (!cik) return {};
  const raw = await fetchCompanyFacts(cik);
  if (!raw) return {};
  const out: Record<string, PointInTimeFact[]> = {};
  for (const concept of new Set(Object.values(FACT_CONCEPTS))) {
    const facts = extractPointInTimeFacts(raw, concept);
    if (facts.length > 0) out[concept] = facts;
  }
  return out;
}

// ─── 4. Konteksti fundamental as-of — për testin A/B të ardhshëm ───

interface QuarterFact extends PointInTimeFact {
  quarterKey: string; // "2024-Q3" — end month është fund tremujori
}

function quarterOf(end: string): string {
  const d = new Date(end);
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${q}`;
}

/**
 * Zgjedh, për çdo tremujor, versionin e fundit të faktit të
 * disponueshëm PARA signalTimestamp — pa look-ahead.
 */
function factsAsOfByQuarter(
  facts: PointInTimeFact[],
  signalTimestamp: string | Date,
): Map<string, QuarterFact> {
  const ts = typeof signalTimestamp === 'string' ? new Date(signalTimestamp).getTime() : signalTimestamp.getTime();
  const byQuarter = new Map<string, QuarterFact>();
  for (const f of facts) {
    const at = new Date(f.availableAt).getTime();
    if (!isFinite(at) || at > ts) continue;   // ← available_at <= signal_timestamp
    const q = quarterOf(f.end);
    const cur = byQuarter.get(q);
    if (!cur || at > new Date(cur.availableAt).getTime()) {
      byQuarter.set(q, { ...f, quarterKey: q });
    }
  }
  return byQuarter;
}

function quarterShift(q: string, delta: number): string {
  const m = q.match(/^(\d{4})-Q([1-4])$/);
  if (!m) return q;
  let year = Number(m[1]);
  let quarter = Number(m[2]) + delta;
  while (quarter > 4) { quarter -= 4; year++; }
  while (quarter < 1) { quarter += 4; year--; }
  return `${year}-Q${quarter}`;
}

function quarterValue(map: Map<string, QuarterFact>, q: string): number | undefined {
  const f = map.get(q);
  return f ? f.value : undefined;
}

/**
 * Ndërton FundamentalContext NGA faktet e disponueshme në momentin e
 * sinjalit (EDGAR point-in-time). Përdoret nga motori i backtest-it në
 * testin "Version A: Technical-only vs Version B: Technical +
 * Fundamental filter" — i njëjti univers, e njëjta periudhë, i njëjti
 * stop/target/risk/kosto/walk-forward (spec i userit).
 *
 * Metrikat që s'kanë fakt para signalTimestamp mbeten undefined —
 * asnjëherë zero fallco (rregulli i normalize).
 */
export function pointInTimeFundamentalContext(
  factsByConcept: Record<string, PointInTimeFact[]>,
  signalTimestamp: string | Date,
): FundamentalContext {
  const revConcept = factsByConcept[FACT_CONCEPTS.revenues]?.length
    ? FACT_CONCEPTS.revenues : FACT_CONCEPTS.revenueAlt;
  const rev = factsAsOfByQuarter(factsByConcept[revConcept] || [], signalTimestamp);
  const ni = factsAsOfByQuarter(factsByConcept[FACT_CONCEPTS.netIncome] || [], signalTimestamp);
  const gp = factsAsOfByQuarter(factsByConcept[FACT_CONCEPTS.grossProfit] || [], signalTimestamp);
  const oi = factsAsOfByQuarter(factsByConcept[FACT_CONCEPTS.operatingIncome] || [], signalTimestamp);
  const eps = factsAsOfByQuarter(factsByConcept[FACT_CONCEPTS.epsDiluted] || [], signalTimestamp);
  const eq = factsAsOfByQuarter(factsByConcept[FACT_CONCEPTS.equity] || [], signalTimestamp);
  const debt = factsAsOfByQuarter(factsByConcept[FACT_CONCEPTS.longTermDebt] || [], signalTimestamp);

  // Tremujori më i fundit me revenue të disponueshme para sinjalit
  const latestQuarter = (() => {
    const qs = [...rev.keys()].sort();
    return qs.length ? qs[qs.length - 1] : null;
  })();

  const context: FundamentalContext = { riskFlags: [] };
  if (!latestQuarter) return context;

  const yearAgo = quarterShift(latestQuarter, -4);
  const qNow = quarterValue(rev, latestQuarter);
  const qPrev = quarterValue(rev, yearAgo);
  if (qNow !== undefined && qPrev !== undefined && qPrev !== 0) {
    context.revenueGrowth = (qNow - qPrev) / Math.abs(qPrev);
  }

  const epsNow = quarterValue(eps, latestQuarter);
  const epsPrev = quarterValue(eps, yearAgo);
  if (epsNow !== undefined && epsPrev !== undefined && epsPrev !== 0) {
    context.epsGrowth = (epsNow - epsPrev) / Math.abs(epsPrev);
  }

  const gpNow = quarterValue(gp, latestQuarter);
  if (gpNow !== undefined && qNow !== undefined && qNow !== 0) {
    context.grossMargin = gpNow / Math.abs(qNow);
  }
  const oiNow = quarterValue(oi, latestQuarter);
  if (oiNow !== undefined && qNow !== undefined && qNow !== 0) {
    context.operatingMargin = oiNow / Math.abs(qNow);
  }
  const niNow = quarterValue(ni, latestQuarter);
  if (niNow !== undefined && qNow !== undefined && qNow !== 0) {
    context.netMargin = niNow / Math.abs(qNow);
  }

  const debtNow = quarterValue(debt, latestQuarter);
  const eqNow = quarterValue(eq, latestQuarter);
  if (debtNow !== undefined && eqNow !== undefined && eqNow !== 0) {
    context.debtToEquity = (debtNow / Math.abs(eqNow)) * 100;
  }

  // FCF (operating cash flow − capex) — TTM nga 4 tremujorët e fundit
  const ocf = factsAsOfByQuarter(factsByConcept[FACT_CONCEPTS.operatingCashFlow] || [], signalTimestamp);
  const capex = factsAsOfByQuarter(factsByConcept[FACT_CONCEPTS.capex] || [], signalTimestamp);
  let fcf = 0;
  let have = 0;
  for (let i = 0; i < 4; i++) {
    const q = quarterShift(latestQuarter, -i);
    const o = quarterValue(ocf, q);
    const c = quarterValue(capex, q);
    if (o !== undefined && c !== undefined) { fcf += o + c; have++; } // capex është negativ në XBRL
  }
  if (have === 4) context.freeCashFlow = fcf;

  // Valuation KËRKON çmimin e ditës së sinjalit — shtohet nga thirrësi
  // (peRatio/psRatio/evToEbitda mbeten undefined këtu; motori i
  // backtest-it i plotëson me çmimin + shumën e aksioneve as-of.)

  context.asOf = latestQuarter;
  return context;
}
