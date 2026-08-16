// ═══════════════════════════════════════════════════════════════
// SEC EDGAR — Free 10-Q / 10-K financial statement data
// Uses the SEC Company Facts API (no API key required)
// ═══════════════════════════════════════════════════════════════

const SEC_HEADERS: Record<string, string> = {
  'User-Agent': 'FinancialBrain/1.0 (contact@example.com)',
  'Accept': 'application/json',
};

const SEC_BASE = 'https://data.sec.gov';
const TICKER_URL = 'https://www.sec.gov/files/company_tickers.json';

// ═══ Static CIK map for popular tickers (fallback when SEC lookup is slow) ═══
const STATIC_CIK: Record<string, number> = {
  AAPL: 320193, MSFT: 789019, GOOG: 1652044, GOOGL: 1652044,
  AMZN: 1018724, NVDA: 1045810, META: 1326801, TSLA: 1318605,
  BRK_B: 1067983, BRK_A: 1067983, JPM: 19617, V: 1403161,
  JNJ: 200406, WMT: 104169, PG: 80424, MA: 1141391,
  HD: 354950, UNH: 731566, KO: 21344, PEP: 77476,
  BAC: 707218, ADBE: 796343, CRM: 1103155, NFLX: 1564708,
  AMD: 2488, INTC: 50863, CSCO: 858877, ORCL: 1341439,
  AVGO: 833324, QCOM: 804328, PYPL: 1633917, UBER: 1543151,
  DIS: 1744489, BA: 12927, CAT: 18230, GE: 40545,
  IBM: 51143, INTC: 50863, MCD: 63908, NKE: 320187,
  MRK: 779152, PFE: 780036, TMO: 86130, ABT: 1800,
  LLY: 59478, COST: 909832, TGT: 27419, LOW: 60667,
  CVX: 93410, XOM: 34088, COP: 1166056, SLB: 875320,
  GS: 886982, MS: 891140, SCHW: 895421, SPGI: 1564708,
  C: 831001, WFC: 72971, USB: 92976, PNC: 713458,
  COIN: 1576264, RIVN: 1965251, PLTR: 1321655,
  SOFI: 1845638, HOOD: 1847418, SQ: 1510295,
  RBLX: 1829949, SNOW: 1640147, DDOG: 1603952,
  NET: 1478245, MDB: 1437107, DASH: 1739383,
  ABNB: 1559720, UBER: 1543151, LYFT: 1755156,
  DKNG: 1848264, PLC: 1603952,
  AXP: 4962, AIG: 5272, MET: 1099856, PRU: 1137775,
  BLK: 1364742, SCHW: 895421, MS: 891140, CME: 1167171,
  ICE: 1066194, NDAQ: 1159138, CBOE: 1378038,
  LULU: 1043604, TJX: 1091989, ROST: 867507, DLTR: 867548,
  WBA: 1084968, CVS: 66740, RAD: 812350, ELV: 1755950,
  UNH: 731566, HUM: 867473, CI: 728038, CB: 19500,
  AET: 1000697, MO: 976913, PM: 968363, DE: 30767,
  MMM: 66740, HON: 773840, UTX: 972617, LMT: 936468,
  RTX: 964536, BA: 12927, LHX: 928464, GD: 40545,
  NOC: 806262, F: 37996, GM: 1467858, STLA: 313807,
  TM: 1560975, HMC: 354639, FCAU: 313807, RACE: 1848804,
  HOG: 794367, FCX: 831258, NEM: 1166302, GOLD: 936100,
  FCX: 831258, NUE: 1114448, X: 1067983, AA: 16762,
  DD: 22162, EMN: 1166302, DOW: 310158, APD: 1093697,
  SHW: 1093498, VMC: 852086, MLM: 870857, ULH: 870876,
};

// ═══ CIK Cache ═══
let cikCache: Record<string, number> | null = null;
let cikCacheTime = 0;
const CIK_CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * Map ticker → SEC CIK. Uses static map first, then SEC API as fallback.
 */
export async function getCIK(ticker: string): Promise<number | null> {
  const upper = ticker.toUpperCase().trim();

  // 1. Static lookup (instant)
  if (STATIC_CIK[upper]) return STATIC_CIK[upper];

  // 2. In-memory cache
  if (cikCache && Date.now() - cikCacheTime < CIK_CACHE_TTL) {
    const v = cikCache[upper];
    if (v) return v;
  }

  // 3. Fetch from SEC (with timeout — can be slow)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(TICKER_URL, { headers: SEC_HEADERS, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();

    const map: Record<string, number> = { ...STATIC_CIK };
    for (const entry of Object.values(data) as Array<{ ticker: string; cik_str: string }>) {
    map[entry.ticker.toUpperCase()] = parseInt(entry.cik_str, 10);
  }
    cikCache = map;
  cikCacheTime = Date.now();
  return map[upper] ?? null;
  } catch (err) {
    console.error('[SEC EDGAR] CIK lookup failed:', (err as Error).message);
    return null;
  }
}

// ═══ Company Facts Cache ═══
const factsCache = new Map<string, { data: SecCompanyFacts; fetchedAt: number }>();
const FACTS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export interface SecCompanyFacts {
  cik: number;
  ticker: string;
  companyName: string;
  quarters: QuarterData[];
}

export interface QuarterData {
  fiscalDate: string;
  fiscalYear: number;
  fiscalQuarter: number;
  filedDate?: string;
  // Income Statement
  revenue?: number;
  costOfRevenue?: number;
  grossProfit?: number;
  operatingIncome?: number;
  netIncome?: number;
  epsBasic?: number;
  epsDiluted?: number;
  ebitda?: number;
  interestExpense?: number;
  incomeTaxExpense?: number;
  // Balance Sheet
  totalAssets?: number;
  totalLiabilities?: number;
  totalEquity?: number;
  cashAndEquivalents?: number;
  currentAssets?: number;
  currentLiabilities?: number;
  totalDebt?: number;
  inventory?: number;
  accountsReceivable?: number;
  accountsPayable?: number;
  retainedEarnings?: number;
  // Cash Flow
  operatingCashFlow?: number;
  investingCashFlow?: number;
  financingCashFlow?: number;
  freeCashFlow?: number;
  capitalExpenditures?: number;
  dividendsPaid?: number;
  shareRepurchases?: number;
}

// Tag → field mapping (NO 'us-gaap/' prefix — the facts object uses bare tag names)
// Some fields have multiple possible tag names; the first match wins.
const TAG_MAP: Array<{ tags: string[]; field: keyof QuarterData; unit?: string }> = [
  // Income Statement
  { tags: ['SalesRevenueNet', 'Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax'], field: 'revenue', unit: 'USD' },
  { tags: ['CostOfGoodsAndServicesSold', 'CostOfGoodsSold'], field: 'costOfRevenue', unit: 'USD' },
  { tags: ['GrossProfit'], field: 'grossProfit', unit: 'USD' },
  { tags: ['OperatingIncomeLoss'], field: 'operatingIncome', unit: 'USD' },
  { tags: ['NetIncomeLoss'], field: 'netIncome', unit: 'USD' },
  { tags: ['EarningsPerShareBasic'], field: 'epsBasic', unit: 'USD/shares' },
  { tags: ['EarningsPerShareDiluted'], field: 'epsDiluted', unit: 'USD/shares' },
  { tags: ['EBITDA'], field: 'ebitda', unit: 'USD' },
  { tags: ['InterestExpense'], field: 'interestExpense', unit: 'USD' },
  { tags: ['IncomeTaxExpenseBenefit'], field: 'incomeTaxExpense', unit: 'USD' },
  // Balance Sheet
  { tags: ['Assets'], field: 'totalAssets', unit: 'USD' },
  { tags: ['AssetsCurrent'], field: 'currentAssets', unit: 'USD' },
  { tags: ['CashAndCashEquivalentsAtCarryingValue'], field: 'cashAndEquivalents', unit: 'USD' },
  { tags: ['Liabilities'], field: 'totalLiabilities', unit: 'USD' },
  { tags: ['LiabilitiesCurrent'], field: 'currentLiabilities', unit: 'USD' },
  { tags: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], field: 'totalEquity', unit: 'USD' },
  { tags: ['LongTermDebt'], field: 'totalDebt', unit: 'USD' },
  { tags: ['InventoryNet'], field: 'inventory', unit: 'USD' },
  { tags: ['ReceivablesNetCurrent'], field: 'accountsReceivable', unit: 'USD' },
  { tags: ['AccountsPayableCurrent'], field: 'accountsPayable', unit: 'USD' },
  { tags: ['RetainedEarningsAccumulatedDeficit'], field: 'retainedEarnings', unit: 'USD' },
  // Cash Flow
  { tags: ['NetCashProvidedByUsedInOperatingActivities'], field: 'operatingCashFlow', unit: 'USD' },
  { tags: ['NetCashProvidedByUsedInInvestingActivities'], field: 'investingCashFlow', unit: 'USD' },
  { tags: ['NetCashProvidedByUsedInFinancingActivities'], field: 'financingCashFlow', unit: 'USD' },
  { tags: ['PaymentsToAcquirePropertyPlantAndEquipment'], field: 'capitalExpenditures', unit: 'USD' },
  { tags: ['PaymentsOfDividends'], field: 'dividendsPaid', unit: 'USD' },
  { tags: ['PaymentsForRepurchaseOfCommonStock'], field: 'shareRepurchases', unit: 'USD' },
];

interface FactEntry {
  val: number;
  end: string;
  filed?: string;
  fy?: string;
  fp?: string;
  accn?: string;
  start?: string;
}

/**
 * Fetch 10-Q quarterly financial data from SEC EDGAR.
 * Returns the last 12 quarters of data (3 years).
 */
export async function fetchQuarterlyFinancials(ticker: string, maxQuarters = 12): Promise<SecCompanyFacts | null> {
  const upper = ticker.toUpperCase().trim();

  // Check cache
  const cached = factsCache.get(upper);
  if (cached && Date.now() - cached.fetchedAt < FACTS_CACHE_TTL) {
    return cached.data;
  }

  const cik = await getCIK(upper);
  if (!cik) {
    console.error(`[SEC EDGAR] No CIK found for ${upper}`);
    return null;
  }

  const cikStr = String(cik).padStart(10, '0');
  const url = `${SEC_BASE}/api/xbrl/companyfacts/CIK${cikStr}.json`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000); // 25s for large JSON
    const res = await fetch(url, { headers: SEC_HEADERS, signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[SEC EDGAR] ${res.status} for ${upper} (CIK ${cikStr})`);
      return null;
    }

    const raw = await res.json();
    // CRITICAL: The key is 'us-gaap' (with HYPHEN), not 'us_gaap'
    const facts = raw?.facts?.['us-gaap'];
    if (!facts) {
      console.error(`[SEC EDGAR] No US-GAAP facts for ${upper}`);
      return null;
    }

    const companyName = raw?.entityName || upper;

    // Extract quarterly data for each tag
    // KEY INSIGHT: SEC data has duplicate entries per (tag, end_date).
    // Some are taxonomy migrations (old + new tag name for same concept),
    // others are restatements. We must:
    //   1. Collect ALL tag variants (not break at first match)
    //   2. Prefer entries WITH a 'frame' field (properly framed quarter)
    //   3. Among same-frame, prefer latest 'filed' date
    const quarterMap = new Map<string, QuarterData>();

    // Helper: deduplicate entries for a single tag, preferring framed data
    function dedup(entries: FactEntry[]): Map<string, FactEntry> {
      const byEnd = new Map<string, FactEntry>();
      for (const entry of entries) {
        if (!entry.fp?.startsWith('Q')) continue;
        const existing = byEnd.get(entry.end);
        const hasFrame = !!entry.frame;
        const existingHasFrame = !!existing?.frame;
        // Prefer framed > unframed; among same, prefer later filed
        if (!existing || (hasFrame && !existingHasFrame) ||
            (hasFrame === existingHasFrame && entry.filed && existing.filed && entry.filed > existing.filed)) {
          byEnd.set(entry.end, entry);
        }
      }
      return byEnd;
    }

    for (const { tags, field, unit } of TAG_MAP) {
      // Collect entries from ALL tag variants, merged by end date
      const merged = new Map<string, FactEntry>();

      for (const tag of tags) {
        const tagData = facts[tag];
        if (!tagData) continue;
        const entries: FactEntry[] = tagData.units?.[unit || 'USD'];
        if (!Array.isArray(entries)) continue;

        const deduped = dedup(entries);
        for (const [endDate, entry] of deduped) {
          if (!merged.has(endDate)) {
            merged.set(endDate, entry);
          }
        }
      }

      // Populate quarter data from merged entries
      for (const [endDate, entry] of merged) {
        let qd = quarterMap.get(endDate);
        if (!qd) {
          const quarterNum = parseInt(entry.fp?.replace('Q', '') || '0', 10);
          qd = {
            fiscalDate: endDate,
            fiscalYear: parseInt(entry.fy || '0', 10),
            fiscalQuarter: quarterNum,
            filedDate: entry.filed,
          };
          quarterMap.set(endDate, qd);
        }
        if (qd[field] === undefined && typeof entry.val === 'number') {
          (qd as Record<string, unknown>)[field] = entry.val;
        }
      }
    }

    // Calculate derived metrics
    for (const qd of quarterMap.values()) {
      // Free Cash Flow = Operating CF - CapEx (CapEx is positive = outflow)
      if (qd.operatingCashFlow !== undefined && qd.capitalExpenditures !== undefined) {
        qd.freeCashFlow = qd.operatingCashFlow - qd.capitalExpenditures;
      }
      // Gross Profit if not directly provided
      if (qd.grossProfit === undefined && qd.revenue !== undefined && qd.costOfRevenue !== undefined) {
        qd.grossProfit = qd.revenue - qd.costOfRevenue;
      }
    }

    // Sort by fiscal date descending, take last N quarters
    const sorted = [...quarterMap.values()].sort((a, b) => b.fiscalDate.localeCompare(a.fiscalDate));
    const quarters = sorted.slice(0, maxQuarters);

    if (quarters.length === 0) {
      console.error(`[SEC EDGAR] No quarterly data extracted for ${upper}`);
      return null;
    }

    const result: SecCompanyFacts = { cik, ticker: upper, companyName, quarters };
    factsCache.set(upper, { data: result, fetchedAt: Date.now() });
    console.log(`[SEC EDGAR] Fetched ${quarters.length} quarters for ${upper}`);
    return result;
  } catch (err) {
    console.error(`[SEC EDGAR] Error fetching ${upper}:`, err);
    return null;
  }
}

export function getEdgarFilingUrl(cik: number): string {
  const cikStr = String(cik).padStart(10, '0');
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cikStr}&type=10-Q&dateb=&owner=include&count=8`;
}

export function formatCompact(value: number | undefined | null): string {
  if (value === undefined || value === null) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function formatFullCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}
