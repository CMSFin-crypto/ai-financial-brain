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

/** Entitete që u ristrukturuan (ticker kaloi te një entitet i RI me histori XBRL
 *  të hollë) — historiku i vërtetë point-in-time mbetet te CIK-ja e VJETËR.
 *  Shembull: XOM → ExxonMobil Holdings Corp (CIK 2115436, 30 filings) mori
 *  ticker-in, por 10 vitet e historikut fondamental janë te EXXON MOBIL CORP
 *  (CIK 34088, 1000 filings). Pa këtë override, të dhënat dilnin bosh. */
const CIK_OVERRIDES: Record<string, string> = {
  XOM: '0000034088',
};

/** ticker → CIK (10-shifror pa zero të para). Cache 24h. */
export async function resolveCIK(ticker: string): Promise<string | null> {
  const t = ticker.toUpperCase().trim();
  if (CIK_OVERRIDES[t]) return CIK_OVERRIDES[t];
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

/** companyfacts JSON për një CIK. Cache 12h (të dhëna statike historike).
 *  noCache: true — për run-et e backtest-it me qindra simbole: JSON i papërpunuar
 *  (1-3MB/secili) NUK ruhet në memorie — vetëm faktet e ekstraktuara (KB). */
export async function fetchCompanyFacts(cik: string, opts?: { noCache?: boolean }): Promise<any | null> {
  const key = cik.padStart(10, '0');
  const cached = opts?.noCache ? undefined : companyFactsCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < COMPANY_FACTS_TTL) return cached.data;
  try {
    const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${key}.json`, {
      headers: { 'User-Agent': EDGAR_USER_AGENT, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!opts?.noCache) companyFactsCache.set(key, { data: json, fetchedAt: Date.now() });
    return json;
  } catch {
    return null;
  }
}

// ─── 3. Ekstraktimi i fakteve tremujore ───

/** Konceptet US-GAAP që na interesojnë për kontekstin fundamental.
 *  Fallback-at (Alt) mbulojnë tag-at moderne të XBRL — p.sh. shumë emisione
 *  nuk raportojnë më `LongTermDebt` si një të vetme, por `LongTermDebtNoncurrent`
 *  (+ Current); capex ka dy tag-a të zakonshme. */
export const FACT_CONCEPTS = {
  revenues: 'Revenues',
  revenueAlt: 'RevenueFromContractWithCustomerExcludingAssessedTax',
  netIncome: 'NetIncomeLoss',
  grossProfit: 'GrossProfit',
  operatingIncome: 'OperatingIncomeLoss',
  epsDiluted: 'EarningsPerShareDiluted',
  equity: 'StockholdersEquity',
  equityAlt: 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
  longTermDebt: 'LongTermDebt',
  longTermDebtAlt: 'LongTermDebtNoncurrent',
  longTermDebtAlt2: 'LongTermDebtAndCapitalLeaseObligations',
  totalDebt: 'DebtLongtermAndShorttermCombinedAmount',
  cash: 'CashAndCashEquivalentsAtCarryingValue',
  operatingCashFlow: 'NetCashProvidedByUsedInOperatingActivities',
  operatingCashFlowAlt: 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
  capex: 'PaymentsToAcquirePropertyPlantAndEquipment',
  capexAlt: 'PaymentsToAcquireProductiveAssets',
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

/** Ekstrakton faktet tremujore/ vjetore me datën e publikimit.
 *  LLOJET E KONCEPTEVE (kritike për korrektesë):
 *   - 'flow'    (tatimet, revenue, eps, ocf, capex): kanë start + end — periudhë
 *               e vërtetë. Filtri i vazhdimësisë (80-100 ditë) mbetet më vonë
 *               në factsAsOfByQuarter — këtu pranohen të gjitha.
 *   - 'instant' (bilanci: equity, debt, cash): KANË VETËM `end` (pa start) —
 *               pa këtë degë, çdo fakt bilanci hidhej poshtë dhe D/E mbetej
 *               përjetë N/A (bug i zbuluar nga diagnostika e Task 26 Fazës 2).
 *  Një concept mund të raportohet disa herë (fillimese 10-Q, rivlerësim
 *  10-K) — mbahen TË GJITHA, asOf() zgjedhë të duhurën sipas kohës.
 */
export function extractPointInTimeFacts(
  raw: any,
  concept: string,
  kind: 'flow' | 'instant' = 'flow',
): PointInTimeFact[] {
  const facts: PointInTimeFact[] = [];
  const gaap = raw?.facts?.['us-gaap'];
  const units = gaap?.[concept]?.units;
  if (!units) return facts;
  for (const arr of Object.values(units) as any[]) {
    if (!Array.isArray(arr)) continue;
    for (const u of arr) {
      const filed = typeof u.filed === 'string' ? u.filed : null;
      if (!filed || typeof u.val !== 'number') continue;
      if (kind === 'flow') {
        if (u.start === undefined || u.end === undefined) continue;
        facts.push({
          concept, value: u.val,
          start: u.start, end: u.end,
          availableAt: filed,
          form: String(u.form || ''),
          fy: Number(u.fy || 0), fp: String(u.fp || ''),
        });
      } else {
        // instant: vetëm end; start mund të mungojë ose të jetë == end
        if (u.end === undefined) continue;
        if (u.start !== undefined && u.start !== u.end) continue; // shmang periudhat e gjata
        facts.push({
          concept, value: u.val,
          start: u.start ?? u.end, end: u.end,
          availableAt: filed,
          form: String(u.form || ''),
          fy: Number(u.fy || 0), fp: String(u.fp || ''),
        });
      }
    }
  }
  return facts;
}

/** Cilët koncepte janë të bilancit (instant) — pjesa tjetër është flow. */
const INSTANT_CONCEPTS = new Set<string>([
  FACT_CONCEPTS.equity,
  FACT_CONCEPTS.equityAlt,
  FACT_CONCEPTS.longTermDebt,
  FACT_CONCEPTS.longTermDebtAlt,
  FACT_CONCEPTS.longTermDebtAlt2,
  FACT_CONCEPTS.totalDebt,
  FACT_CONCEPTS.cash,
]);

/** Faktet e një simboli për konceptet që na duhen (batch). */
export async function fetchPointInTimeFacts(
  ticker: string,
  opts?: { noRawCache?: boolean },
): Promise<Record<string, PointInTimeFact[]>> {
  const cik = await resolveCIK(ticker);
  if (!cik) return {};
  const raw = await fetchCompanyFacts(cik, { noCache: opts?.noRawCache });
  if (!raw) return {};
  const out: Record<string, PointInTimeFact[]> = {};
  for (const concept of new Set(Object.values(FACT_CONCEPTS))) {
    const facts = extractPointInTimeFacts(raw, concept, INSTANT_CONCEPTS.has(concept) ? 'instant' : 'flow');
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
 * quarterlyFlow: VETËM periudha reale tremujore (80-100 ditë) — eliminon
 * miksimin e faktit vjetor/9-mujor me tremujorin në të njëjtën çelës
 * (shkaku i "rritjeve" absurde si +484% në diagnostikë).
 */
function daysBetweenDates(a: string, b: string): number {
  return Math.round(Math.abs(
    new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime(),
  ) / 86400000);
}

function factsAsOfByQuarter(
  facts: PointInTimeFact[],
  signalTimestamp: string | Date,
  opts: { quarterlyFlow?: boolean } = {},
): Map<string, QuarterFact> {
  const ts = typeof signalTimestamp === 'string' ? new Date(signalTimestamp).getTime() : signalTimestamp.getTime();
  const byQuarter = new Map<string, QuarterFact>();
  for (const f of facts) {
    if (opts.quarterlyFlow) {
      const dur = daysBetweenDates(f.start, f.end);
      if (dur < 80 || dur > 100) continue; // jo tremujor i vërtetë (vjetor/9-mujor/YTD e gjatë)
    }
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
 * TTM nga deklaratat KUMULATIVE YTD të cash flow (10-Q raporton 3/6/9-mujore
 * kumulative — JO tremujore të veçanta, prandaj filtri 80-100 ditë i elimanon
 * të gjitha dhe FCM dilte N/A për gjithë universin — bug i zbuluar nga
 * diagnostika):
 *
 *     TTM = YTD_tani + FY_e_mëparshme − YTD_pika_e_vjetër
 *
 * Shembull (XOM, qershor 2025): TTM = YTD_6muj_2025 + FY2024 − YTD_6muj_2024.
 * Kur fakti më i fundit është vjetor i plotë (330-380 ditë), TTM = vetë ai.
 * Rregulli point-in-time: merren VETËM faktet me available_at <= ts.
 */
function ttmFromCumulativeFacts(facts: PointInTimeFact[], ts: number): number | undefined {
  // dedupe sipas (start, end) → fiton i fundit i publikuar
  const best = new Map<string, PointInTimeFact>();
  for (const f of facts) {
    const at = new Date(f.availableAt).getTime();
    if (!isFinite(at) || at > ts) continue;
    const key = f.start + '|' + f.end;
    const cur = best.get(key);
    if (!cur || at > new Date(cur.availableAt).getTime()) best.set(key, f);
  }
  if (best.size === 0) return undefined;
  const byEnd = [...best.values()].sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : 0));
  const latest = byEnd[byEnd.length - 1];
  const durLatest = daysBetweenDates(latest.start, latest.end);
  if (durLatest < 75 || durLatest > 380) return undefined; // jashtë logjikës YTD
  if (durLatest >= 330) return latest.value; // FY e plotë = TTM vetë

  const minus1y = (iso: string) => new Date(new Date(iso + 'T00:00:00Z').getTime() - 365 * 86400000).toISOString().slice(0, 10);
  const targetEnd = minus1y(latest.end);
  const targetStart = minus1y(latest.start);

  // pika e njëjtë fiskale një vit më parë (end ±45 ditë, start ±60)
  const priorCandidates = byEnd.filter(f =>
    Math.abs(daysBetweenDates(f.end, targetEnd)) <= 45 &&
    Math.abs(daysBetweenDates(f.start, targetStart)) <= 60,
  );
  const prior = priorCandidates.length > 0
    ? priorCandidates.reduce((a, b) =>
        Math.abs(daysBetweenDates(a.end, targetEnd)) <= Math.abs(daysBetweenDates(b.end, targetEnd)) ? a : b)
    : undefined;

  // viti fiskal që mbivendos pikën e vjetër (mbaron pas prior.end, para latest.end)
  const annualCandidates = byEnd.filter(f => {
    const dur = daysBetweenDates(f.start, f.end);
    return dur >= 330 && dur <= 380 && f.end > prior!.end && f.end < latest.end;
  });
  const annual = annualCandidates.length > 0 ? annualCandidates[annualCandidates.length - 1] : undefined;

  if (!prior || !annual) return undefined;
  return latest.value + annual.value - prior.value;
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
  // Revenue: MERGE i tag-ut kryesor me alternativën — për çdo tremujor fiton
  // fakti i fundit i publikuar (komp panitë që ndërruan tag pas ASC 606
  // ngrinin latestQuarter-në). VETËM periudha tremujore.
  const revFacts = [
    ...(factsByConcept[FACT_CONCEPTS.revenues] || []),
    ...(factsByConcept[FACT_CONCEPTS.revenueAlt] || []),
  ];
  const rev = factsAsOfByQuarter(revFacts, signalTimestamp, { quarterlyFlow: true });
  const ni = factsAsOfByQuarter(factsByConcept[FACT_CONCEPTS.netIncome] || [], signalTimestamp, { quarterlyFlow: true });
  const gp = factsAsOfByQuarter(factsByConcept[FACT_CONCEPTS.grossProfit] || [], signalTimestamp, { quarterlyFlow: true });
  const oi = factsAsOfByQuarter(factsByConcept[FACT_CONCEPTS.operatingIncome] || [], signalTimestamp, { quarterlyFlow: true });
  const eps = factsAsOfByQuarter(factsByConcept[FACT_CONCEPTS.epsDiluted] || [], signalTimestamp, { quarterlyFlow: true });
  // Equity / Debt / OCF / Capex: MERGE i tag-ut kryesor me fallback-in — për
  // çdo tremujor fiton fakti i fundit i publikuar. Kompanitë që ndërruan tag
  // (p.sh. LongTermDebt → LongTermDebtNoncurrent) mbeten të mbuluara në
  // TË DYJA periudhat (rregulli: data e publikimit vendos, jo emri i tag-ut).
  const eq = factsAsOfByQuarter([
    ...(factsByConcept[FACT_CONCEPTS.equity] || []),
    ...(factsByConcept[FACT_CONCEPTS.equityAlt] || []),
  ], signalTimestamp);
  const debt = factsAsOfByQuarter([
    ...(factsByConcept[FACT_CONCEPTS.longTermDebt] || []),
    ...(factsByConcept[FACT_CONCEPTS.longTermDebtAlt] || []),
    ...(factsByConcept[FACT_CONCEPTS.longTermDebtAlt2] || []),
  ], signalTimestamp);

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

  // FCF (operating cash flow − capex) — TTM nga deklaratat KUMULATIVE YTD
  // (10-Q: 3/6/9-mujore) me metodën: YTD_tani + FY_e_mëparshme − YTD_vjeçar
  const ocfFacts = [
    ...(factsByConcept[FACT_CONCEPTS.operatingCashFlow] || []),
    ...(factsByConcept[FACT_CONCEPTS.operatingCashFlowAlt] || []),
  ];
  const capexFacts = [
    ...(factsByConcept[FACT_CONCEPTS.capex] || []),
    ...(factsByConcept[FACT_CONCEPTS.capexAlt] || []),
  ];
  const tsMs = typeof signalTimestamp === 'string'
    ? new Date(signalTimestamp).getTime() : signalTimestamp.getTime();
  const ocfTtm = ttmFromCumulativeFacts(ocfFacts, tsMs);
  const capexTtm = ttmFromCumulativeFacts(capexFacts, tsMs);
  if (ocfTtm !== undefined && capexTtm !== undefined) {
    context.freeCashFlow = ocfTtm + capexTtm; // capex është negativ në XBRL
  }

  // Valuation KËRKON çmimin e ditës së sinjalit — shtohet nga thirrësi
  // (peRatio/psRatio/evToEbitda mbeten undefined këtu; motori i
  // backtest-it i plotëson me çmimin + shumën e aksioneve as-of.)

  context.asOf = latestQuarter;
  return context;
}
