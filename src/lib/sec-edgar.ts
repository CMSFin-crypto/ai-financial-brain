// ═══════════════════════════════════════════════════════════════
// SEC EDGAR — Free 10-Q / 10-K financial statement data
// Uses the SEC Company Facts API (no API key required)
// ═══════════════════════════════════════════════════════════════

// SEC EDGAR requires a User-Agent header identifying the requester
const SEC_HEADERS: Record<string, string> = {
  'User-Agent': 'FinancialBrain/1.0 (contact@example.com)',
  'Accept': 'application/json',
};

const SEC_BASE = 'https://data.sec.gov';
const TICKER_URL = 'https://www.sec.gov/files/company_tickers.json';

// ═══ CIK Cache ═══
let cikCache: Record<string, number> | null = null;
let cikCacheTime = 0;
const CIK_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Map a ticker symbol (e.g. "AAPL") to its SEC CIK number.
 * The SEC tickers JSON maps CIK → { ticker, exchange }, so we build a reverse map.
 */
export async function getCIK(ticker: string): Promise<number | null> {
  const upper = ticker.toUpperCase().trim();

  // Use cache if fresh
  if (cikCache && Date.now() - cikCacheTime < CIK_CACHE_TTL) {
    return cikCache[upper] ?? null;
  }

  try {
    const res = await fetch(TICKER_URL, { headers: SEC_HEADERS, next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const data = await res.json();

    // Build reverse map: ticker → CIK
    const map: Record<string, number> = {};
    for (const entry of Object.values(data) as Array<{ ticker: string; cik_str: string }>) {
      map[entry.ticker.toUpperCase()] = parseInt(entry.cik_str, 10);
    }
    cikCache = map;
    cikCacheTime = Date.now();
    return map[upper] ?? null;
  } catch (err) {
    console.error('[SEC EDGAR] Failed to fetch CIK map:', err);
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
  fiscalDate: string;      // e.g. "2024-06-30"
  fiscalYear: number;
  fiscalQuarter: number;   // 1-4
  filedDate?: string;      // when the 10-Q was filed
  // Income Statement
  revenue?: number;
  costOfRevenue?: number;
  grossProfit?: number;
  operatingExpenses?: number;
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

// XBRL taxonomy tags we want to extract (quarterly)
const INCOME_STATEMENT_TAGS: Record<string, keyof QuarterData> = {
  'us-gaap/Revenues': 'revenue',
  'us-gaap/SalesRevenueNet': 'revenue',
  'us-gaap/RevenueFromContractWithCustomerExcludingAssessedTax': 'revenue',
  'us-gaap/CostOfGoodsAndServicesSold': 'costOfRevenue',
  'us-gaap/CostOfGoodsSold': 'costOfRevenue',
  'us-gaap/GrossProfit': 'grossProfit',
  'us-gaap/OperatingExpenses': 'operatingExpenses',
  'us-gaap/OperatingIncomeLoss': 'operatingIncome',
  'us-gaap/IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsAndNoncontrollingInterest': 'operatingIncome',
  'us-gaap/NetIncomeLoss': 'netIncome',
  'us-gaap/EarningsPerShareBasic': 'epsBasic',
  'us-gaap/EarningsPerShareDiluted': 'epsDiluted',
  'us-gaap/EBITDA': 'ebitda',
  'us-gaap/InterestExpense': 'interestExpense',
  'us-gaap/IncomeTaxExpenseBenefit': 'incomeTaxExpense',
};

const BALANCE_SHEET_TAGS: Record<string, keyof QuarterData> = {
  'us-gaap/Assets': 'totalAssets',
  'us-gaap/AssetsCurrent': 'currentAssets',
  'us-gaap/CashAndCashEquivalentsAtCarryingValue': 'cashAndEquivalents',
  'us-gaap/Liabilities': 'totalLiabilities',
  'us-gaap/LiabilitiesCurrent': 'currentLiabilities',
  'us-gaap/StockholdersEquity': 'totalEquity',
  'us-gaap/StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest': 'totalEquity',
  'us-gaap/LongTermDebt': 'totalDebt',
  'us-gaap/InventoryNet': 'inventory',
  'us-gaap/ReceivablesNetCurrent': 'accountsReceivable',
  'us-gaap/AccountsPayableCurrent': 'accountsPayable',
  'us-gaap/RetainedEarningsAccumulatedDeficit': 'retainedEarnings',
};

const CASH_FLOW_TAGS: Record<string, keyof QuarterData> = {
  'us-gaap/NetCashProvidedByUsedInOperatingActivities': 'operatingCashFlow',
  'us-gaap/NetCashUsedForInvestingActivities': 'investingCashFlow',
  'us-gaap/NetCashUsedForFinancingActivities': 'financingCashFlow',
  'us-gaap/PaymentsForRepurchaseOfCommonStock': 'shareRepurchases',
  'us-gaap/CapitalExpenditures': 'capitalExpenditures',
};

const ALL_TAGS = { ...INCOME_STATEMENT_TAGS, ...BALANCE_SHEET_TAGS, ...CASH_FLOW_TAGS };

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

  // CIK must be zero-padded to 10 digits
  const cikStr = String(cik).padStart(10, '0');
  const url = `${SEC_BASE}/api/xbrl/companyfacts/CIK${cikStr}.json`;

  try {
    const res = await fetch(url, {
      headers: SEC_HEADERS,
      next: { revalidate: 1800 }, // 30 min ISR cache
    });
    if (!res.ok) {
      console.error(`[SEC EDGAR] ${res.status} for ${upper} (CIK ${cikStr})`);
      return null;
    }

    const raw = await res.json();
    const facts = raw?.facts?.us_gaap;
    if (!facts) {
      console.error(`[SEC EDGAR] No US-GAAP facts for ${upper}`);
      return null;
    }

    const companyName = raw?.entityName || upper;

    // Extract quarterly data from all relevant tags
    // Each tag has a `units.USD` array with { val, end, filed, fy, fp }
    interface FactEntry { val: number; end: string; filed?: string; fy?: string; fp?: string; accn?: string }

    const quarterMap = new Map<string, QuarterData>();

    for (const [tag, field] of Object.entries(ALL_TAGS)) {
      const tagData = facts[tag];
      if (!tagData) continue;
      const entries: FactEntry[] = tagData?.units?.USD;
      if (!Array.isArray(entries)) continue;

      for (const entry of entries) {
        // Only use quarterly data (fp = "Q1", "Q2", "Q3", "Q4")
        if (!entry.fp?.startsWith('Q')) continue;

        const key = entry.end; // fiscal period end date
        if (!key) continue;

        let qd = quarterMap.get(key);
        if (!qd) {
          const quarterNum = parseInt(entry.fp?.replace('Q', '') || '0', 10);
          qd = {
            fiscalDate: key,
            fiscalYear: parseInt(entry.fy || '0', 10),
            fiscalQuarter: quarterNum,
            filedDate: entry.filed,
          };
          quarterMap.set(key, qd);
        }

        // Set the field if not already set (first tag wins for duplicates)
        if (qd[field] === undefined && typeof entry.val === 'number') {
          (qd as Record<string, unknown>)[field] = entry.val;
        }
      }
    }

    // Calculate derived metrics
    for (const qd of quarterMap.values()) {
      // Free Cash Flow = Operating CF - Capital Expenditures
      if (qd.operatingCashFlow !== undefined && qd.capitalExpenditures !== undefined) {
        qd.freeCashFlow = qd.operatingCashFlow - Math.abs(qd.capitalExpenditures);
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

    const result: SecCompanyFacts = {
      cik,
      ticker: upper,
      companyName,
      quarters,
    };

    factsCache.set(upper, { data: result, fetchedAt: Date.now() });
    console.log(`[SEC EDGAR] Fetched ${quarters.length} quarters for ${upper}`);
    return result;
  } catch (err) {
    console.error(`[SEC EDGAR] Error fetching ${upper}:`, err);
    return null;
  }
}

/**
 * Get the direct SEC EDGAR filing URL for a company's 10-Q/10-K filings
 */
export function getEdgarFilingUrl(cik: number): string {
  const cikStr = String(cik).padStart(10, '0');
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cikStr}&type=10-Q&dateb=&owner=include&count=8`;
}

/**
 * Format a number as compact currency (e.g. $1.23B, $456.7M)
 */
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

/**
 * Format a number as full currency (e.g. $1,234,567,890)
 */
export function formatFullCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}
