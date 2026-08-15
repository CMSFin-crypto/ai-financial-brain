'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StockSearch } from './stock-search';
import {
  FileText,
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  BarChart3,
  Wallet,
  CircleDollarSign,
} from 'lucide-react';
import { formatCompact } from '@/lib/sec-edgar';

type QuarterData = {
  fiscalDate: string;
  fiscalYear: number;
  fiscalQuarter: number;
  filedDate?: string;
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
  operatingCashFlow?: number;
  investingCashFlow?: number;
  financingCashFlow?: number;
  freeCashFlow?: number;
  capitalExpenditures?: number;
  dividendsPaid?: number;
  shareRepurchases?: number;
};

type FilingResponse = {
  ticker: string;
  companyName: string;
  cik: number;
  edgarUrl: string;
  quarters: QuarterData[];
  quarterCount: number;
};

type SubTab = 'income' | 'balance' | 'cashflow';

// ═══ Helpers ═══
function qLabel(q: QuarterData): string {
  const y = q.fiscalYear;
  return `Q${q.fiscalQuarter} ${y}`;
}

function shortDate(d?: string): string {
  if (!d) return '';
  return d.substring(0, 10);
}

function pctChange(current: number | undefined, previous: number | undefined): number | null {
  if (current === undefined || previous === undefined || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function ChangeIndicator({ current, previous }: { current: number | undefined; previous: number | undefined }) {
  const pct = pctChange(current, previous);
  if (pct === null) return <span className="text-muted-foreground text-xs">—</span>;
  if (Math.abs(pct) < 0.5) return <span className="text-muted-foreground text-xs flex items-center gap-0.5"><Minus className="w-2.5 h-2.5" />{Math.abs(pct).toFixed(1)}%</span>;
  if (pct > 0) return <span className="text-emerald-400 text-xs flex items-center gap-0.5"><ArrowUpRight className="w-2.5 h-2.5" />+{pct.toFixed(1)}%</span>;
  return <span className="text-red-400 text-xs flex items-center gap-0.5"><ArrowDownRight className="w-2.5 h-2.5" />{pct.toFixed(1)}%</span>;
}

function CellValue({ value, prev, fmt = 'compact' }: { value: number | undefined; prev?: number; fmt?: 'compact' | 'currency' | 'shares' }) {
  if (value === undefined) return <span className="text-muted-foreground">—</span>;
  let display: string;
  if (fmt === 'shares') {
    display = formatCompact(value);
  } else if (fmt === 'currency') {
    display = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  } else {
    display = formatCompact(value);
  }
  const isNeg = value < 0;
  return (
    <span className={isNeg ? 'text-red-400' : ''}>
      {display}
    </span>
  );
}

// ═══ Row component ═══
function FinRow({ label, quarters, field, fmt = 'compact', indent = false }: {
  label: string;
  quarters: QuarterData[];
  field: keyof QuarterData;
  fmt?: 'compact' | 'currency' | 'shares';
  indent?: boolean;
}) {
  return (
    <tr className={indent ? 'pl-4' : ''}>
      <td className={`py-1.5 px-2 text-xs font-medium whitespace-nowrap ${indent ? 'pl-6 text-muted-foreground' : 'text-foreground'}`}>
        {label}
      </td>
      {quarters.map((q, i) => (
        <td key={q.fiscalDate} className="py-1.5 px-2 text-xs text-right tabular-nums whitespace-nowrap">
          <div><CellValue value={q[field] as number | undefined} prev={quarters[i + 1]?.[field] as number | undefined} fmt={fmt} /></div>
          <div className="mt-0.5"><ChangeIndicator current={q[field] as number | undefined} previous={quarters[i + 1]?.[field] as number | undefined} /></div>
        </td>
      ))}
    </tr>
  );
}

// ═══ Section divider ═══
function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <tr>
      <td colSpan={20} className="pt-3 pb-1">
        <div className="flex items-center gap-1.5 border-b border-border/30 pb-1.5">
          <Icon className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">{label}</span>
        </div>
      </td>
    </tr>
  );
}

// ═══ Main Component ═══
export function SecFilings() {
  const [ticker, setTicker] = useState('');
  const [data, setData] = useState<FilingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<SubTab>('income');

  const fetchFilings = async (symbol?: string) => {
    const sym = (symbol || ticker).trim().toUpperCase();
    if (!sym) return;
    setTicker(sym);
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch(`/api/sec-filings?ticker=${encodeURIComponent(sym)}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Gabim');
        return;
      }
      setData(json);
    } catch {
      setError('Gabim rrjeti. Provo përsëri.');
    } finally {
      setLoading(false);
    }
  };

  const quarters = data?.quarters || [];
  const latestQ = quarters[0];

  // Calculate summary metrics for the latest quarter
  const grossMargin = latestQ?.grossProfit && latestQ?.revenue ? (latestQ.grossProfit / latestQ.revenue) * 100 : null;
  const operatingMargin = latestQ?.operatingIncome && latestQ?.revenue ? (latestQ.operatingIncome / latestQ.revenue) * 100 : null;
  const netMargin = latestQ?.netIncome && latestQ?.revenue ? (latestQ.netIncome / latestQ.revenue) * 100 : null;
  const debtToEquity = latestQ?.totalDebt && latestQ?.totalEquity ? latestQ.totalDebt / latestQ.totalEquity : null;
  const currentRatio = latestQ?.currentAssets && latestQ?.currentLiabilities ? latestQ.currentAssets / latestQ.currentLiabilities : null;

  const subTabs: { value: SubTab; label: string; icon: React.ElementType }[] = [
    { value: 'income', label: 'Income Statement', icon: DollarSign },
    { value: 'balance', label: 'Balance Sheet', icon: BarChart3 },
    { value: 'cashflow', label: 'Cash Flow', icon: Wallet },
  ];

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex gap-2">
        <StockSearch
          onSelect={(t) => fetchFilings(t)}
          placeholder="Kërko ticker-in... AAPL, MSFT, NVDA"
          className="flex-1"
        />
        <Button
          onClick={() => fetchFilings()}
          disabled={loading || !ticker}
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {loading ? <span className="animate-spin">⏳</span> : <FileText className="w-4 h-4 mr-1" />}
          10-Q
        </Button>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <Card className="border-blue-500/20">
          <CardContent className="pt-4 space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-32" />
            <div className="space-y-2 mt-4">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="pt-4">
            <p className="text-sm text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Data */}
      {data && !loading && (
        <>
          {/* Header Card */}
          <Card className="border-blue-500/20">
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold">{data.companyName} <span className="text-muted-foreground font-normal">({data.ticker})</span></h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    SEC CIK: {data.cik} · {data.quarterCount} kuartale · {latestQ ? `Fund Q${latestQ.fiscalQuarter} ${latestQ.fiscalYear}` : ''}
                  </p>
                </div>
                <a
                  href={data.edgarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  SEC EDGAR
                </a>
              </div>

              {/* Quick metrics bar */}
              {latestQ && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mt-4">
                  <MetricPill label="Fitimi Bruto" value={grossMargin !== null ? `${grossMargin.toFixed(1)}%` : '—'} positive={grossMargin !== null && grossMargin > 30} />
                  <MetricPill label="Marzhi Operativ" value={operatingMargin !== null ? `${operatingMargin.toFixed(1)}%` : '—'} positive={operatingMargin !== null && operatingMargin > 15} />
                  <MetricPill label="Marzhi Net" value={netMargin !== null ? `${netMargin.toFixed(1)}%` : '—'} positive={netMargin !== null && netMargin > 10} />
                  <MetricPill label="Debt/Equity" value={debtToEquity !== null ? debtToEquity.toFixed(2) : '—'} positive={debtToEquity !== null && debtToEquity < 1} />
                  <MetricPill label="Current Ratio" value={currentRatio !== null ? currentRatio.toFixed(2) : '—'} positive={currentRatio !== null && currentRatio > 1.5} />
                  <MetricPill label="EPS (Basic)" value={latestQ.epsBasic !== undefined ? `$${latestQ.epsBasic.toFixed(2)}` : '—'} positive={latestQ.epsBasic !== undefined && latestQ.epsBasic > 0} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sub-tabs: Income / Balance / Cash Flow */}
          <div className="flex gap-1.5">
            {subTabs.map((st) => (
              <button
                key={st.value}
                onClick={() => setSubTab(st.value)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors font-medium ${
                  subTab === st.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                <st.icon className="w-3 h-3" />
                {st.label}
              </button>
            ))}
          </div>

          {/* Financial Table */}
          <Card className="border-blue-500/10">
            <CardContent className="pt-3 pb-4 overflow-x-auto">
              <div className="min-w-[700px]">
                {/* Quarter headers */}
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/40">
                      <th className="py-1.5 px-2 text-xs font-semibold text-left text-muted-foreground w-40">Rreshti</th>
                      {quarters.map((q, i) => (
                        <th key={q.fiscalDate} className={`py-1.5 px-2 text-xs font-semibold text-right tabular-nums whitespace-nowrap ${i === 0 ? 'text-blue-400' : 'text-muted-foreground'}`}>
                          {qLabel(q)}
                          <div className="text-[10px] font-normal text-muted-foreground/60 mt-0.5">{shortDate(q.filedDate)}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {subTab === 'income' && (
                      <>
                        <SectionHeader icon={DollarSign} label="Income Statement (10-Q)" />
                        <FinRow label="Të Ardhura (Revenue)" quarters={quarters} field="revenue" />
                        <FinRow label="Kostoja e të Ardhurave" quarters={quarters} field="costOfRevenue" indent />
                        <FinRow label="Fitimi Bruto" quarters={quarters} field="grossProfit" />
                        <FinRow label="Shpenzimet Operative" quarters={quarters} field="operatingExpenses" indent />
                        <FinRow label="Të Ardhura Operative" quarters={quarters} field="operatingIncome" />
                        <FinRow label="Shpenzimet e Interesit" quarters={quarters} field="interestExpense" indent />
                        <FinRow label="Tatimi mbi të Ardhurat" quarters={quarters} field="incomeTaxExpense" indent />
                        <FinRow label="Të Ardhura Neto (Net Income)" quarters={quarters} field="netIncome" />
                        <FinRow label="EBITDA" quarters={quarters} field="ebitda" />
                        <SectionHeader icon={CircleDollarSign} label="Per Share" />
                        <FinRow label="EPS — Basic" quarters={quarters} field="epsBasic" fmt="shares" />
                        <FinRow label="EPS — Diluted" quarters={quarters} field="epsDiluted" fmt="shares" />
                      </>
                    )}
                    {subTab === 'balance' && (
                      <>
                        <SectionHeader icon={BarChart3} label="Balance Sheet (10-Q)" />
                        <FinRow label="Kasa dhe Ekivalentët" quarters={quarters} field="cashAndEquivalents" />
                        <FinRow label="Konto Pritëse" quarters={quarters} field="accountsReceivable" indent />
                        <FinRow label="Inventari" quarters={quarters} field="inventory" indent />
                        <FinRow label="Aktiva Aktuale" quarters={quarters} field="currentAssets" />
                        <FinRow label="Aktiva Totale" quarters={quarters} field="totalAssets" />
                        <FinRow label="Konto Pagesëse" quarters={quarters} field="accountsPayable" indent />
                        <FinRow label="Detyrime Aktuale" quarters={quarters} field="currentLiabilities" />
                        <FinRow label="Detyrime Totale" quarters={quarters} field="totalLiabilities" />
                        <FinRow label="Dëborë Gjatë Afati" quarters={quarters} field="totalDebt" />
                        <FinRow label="Kapitali i Aksionarëve" quarters={quarters} field="totalEquity" />
                        <FinRow label="Fitimet e Akumuluarara" quarters={quarters} field="retainedEarnings" indent />
                      </>
                    )}
                    {subTab === 'cashflow' && (
                      <>
                        <SectionHeader icon={Wallet} label="Cash Flow (10-Q)" />
                        <FinRow label="CF Operativ" quarters={quarters} field="operatingCashFlow" />
                        <FinRow label="CF Investim" quarters={quarters} field="investingCashFlow" />
                        <FinRow label="CF Financim" quarters={quarters} field="financingCashFlow" />
                        <FinRow label="KapitalExpenditures" quarters={quarters} field="capitalExpenditures" indent />
                        <FinRow label="Free Cash Flow" quarters={quarters} field="freeCashFlow" />
                        <FinRow label="Dividendet e Paguara" quarters={quarters} field="dividendsPaid" indent />
                        <FinRow label="Blerjet e Aksioneve" quarters={quarters} field="shareRepurchases" indent />
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Empty state */}
      {!data && !loading && !error && (
        <Card className="border-blue-500/10">
          <CardContent className="pt-8 pb-8 text-center">
            <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Shkruaj një ticker për të parë raportet 10-Q tremujore nga SEC EDGAR.
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Të dhënat vijnë direkt nga SEC — Income Statement, Balance Sheet, Cash Flow për çdo kuartal.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══ Metric Pill ═══
function MetricPill({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <div className="bg-muted/30 rounded-lg px-3 py-2 text-center">
      <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
      <div className={`text-sm font-bold ${positive ? 'text-emerald-400' : 'text-amber-400'}`}>{value}</div>
    </div>
  );
}
