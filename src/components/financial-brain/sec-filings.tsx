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
  ScrollText,
  Clock,
  FileCheck,
  Sparkles,
  AlertTriangle,
  ShieldCheck,
  Banknote,
  Target,
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

type SubTab = 'income' | 'balance' | 'cashflow' | 'meetings' | 'ai';

type FilingItem = {
  accessionNumber: string;
  filingDate: string;
  form: string;
  primaryDocDescription: string;
  act: string;
  items: string;
  size: number;
  edgarUrl: string;
};

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
  const [filings, setFilings] = useState<FilingItem[]>([]);
  const [filingsLoading, setFilingsLoading] = useState(false);

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
      // Also fetch 8-K filings in background
      fetch8K(sym);
    } catch {
      setError('Gabim rrjeti. Provo përsëri.');
    } finally {
      setLoading(false);
    }
  };

  const fetch8K = async (sym: string) => {
    setFilingsLoading(true);
    try {
      const res = await fetch(`/api/sec-filings?ticker=${encodeURIComponent(sym)}&type=8k&forms=8-K,DEF 14A`);
      const json = await res.json();
      if (res.ok && json.filings) {
        setFilings(json.filings);
      }
    } catch {
      // silent
    } finally {
      setFilingsLoading(false);
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
    { value: 'meetings', label: '8-K / Meetings', icon: ScrollText },
    { value: 'ai', label: 'AI Analysis', icon: Sparkles },
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
                    {subTab === 'meetings' && (
                      <>
                        {filingsLoading && (
                          <div className="space-y-2">
                            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                          </div>
                        )}
                        {!filingsLoading && filings.length === 0 && (
                          <div className="text-center py-8">
                            <ScrollText className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground">Nuk u gjetën 8-K filings. Kërko një ticker më sipër.</p>
                          </div>
                        )}
                        {!filingsLoading && filings.length > 0 && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 border-b border-border/30 pb-1.5 mb-2">
                              <ScrollText className="w-3.5 h-3.5 text-blue-400" />
                              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">8-K / DEF 14A — Vendime Bordi & Takime</span>
                            </div>
                            {filings.map((f, idx) => (
                              <a
                                key={f.accessionNumber}
                                href={f.edgarUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
                              >
                                <div className="flex-shrink-0 mt-0.5">
                                  <div className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold ${f.form === '8-K' ? 'bg-blue-500/15 text-blue-400' : 'bg-purple-500/15 text-purple-400'}`}>
                                    {f.form === '8-K' ? '8K' : '14A'}
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium text-foreground truncate">{f.primaryDocDescription || f.form}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${f.form === '8-K' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}>
                                      {f.form}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <Clock className="w-3 h-3 text-muted-foreground/60" />
                                    <span className="text-[11px] text-muted-foreground">{f.filingDate}</span>
                                    {f.act && <span className="text-[10px] text-muted-foreground/60 truncate">{f.act}</span>}
                                  </div>
                                </div>
                                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground flex-shrink-0 mt-1" />
                              </a>
                            ))}
                            <div className="mt-3 text-center">
                              <a
                                href={data?.edgarUrl?.replace('type=10-Q', 'type=8-K') || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
                              >
                                Shiko të gjitha filings në SEC EDGAR <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* AI Analysis Tab */}
      {data && subTab === 'ai' && <AIAnalysis quarters={quarters} companyName={data.companyName} ticker={data.ticker} />}

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

// ═══ AI Analysis Engine ═══
type Signal = 'bullish' | 'bearish' | 'neutral';

interface AnalysisPoint {
  title: string;
  icon: React.ElementType;
  signal: Signal;
  score: number; // -100 to +100
  summary: string;
  details: string[];
  dataPoints: { label: string; value: string; positive?: boolean }[];
}

function analyze10Q(quarters: QuarterData[]): { points: AnalysisPoint[]; overall: Signal; overallScore: number; summary: string } {
  const c = quarters[0]; // latest
  const p = quarters[1]; // previous
  const pp = quarters[2]; // 2 quarters ago
  const points: AnalysisPoint[] = [];
  let totalScore = 0;

  // ═══ 1. Earnings Surprise (Revenue & EPS) ═══
  const revGrowth = p?.revenue && c?.revenue ? ((c.revenue - p.revenue) / Math.abs(p.revenue)) * 100 : null;
  const epsGrowth = p?.epsBasic && c?.epsBasic ? ((c.epsBasic - p.epsBasic) / Math.abs(p.epsBasic)) * 100 : null;
  const revAccel = pp?.revenue && p?.revenue && c?.revenue
    ? ((c.revenue - p.revenue) / Math.abs(p.revenue)) - ((p.revenue - pp.revenue) / Math.abs(pp.revenue))
    : null;

  let earnSignal: Signal = 'neutral';
  let earnScore = 0;
  const earnDetails: string[] = [];
  const earnData: { label: string; value: string; positive?: boolean }[] = [];

  if (revGrowth !== null) {
    earnData.push({ label: 'Rritja e të Ardhurave (QoQ)', value: `${revGrowth >= 0 ? '+' : ''}${revGrowth.toFixed(1)}%`, positive: revGrowth > 0 });
    if (revGrowth > 5) { earnScore += 30; earnDetails.push('Të ardhurat rriten mbi 5% — sinjal pozitiv i fortë'); }
    else if (revGrowth > 0) { earnScore += 15; earnDetails.push('Të ardhurat rriten, por nën 5% — sinjal modest pozitiv'); }
    else if (revGrowth > -5) { earnScore -= 10; earnDetails.push('Të ardhura ranë lehtë — vëmendje'); }
    else { earnScore -= 35; earnDetails.push('Rënie e konsiderueshme e të ardhurave — sinjal negativ'); }
  }
  if (epsGrowth !== null) {
    earnData.push({ label: 'Rritja e EPS (QoQ)', value: `${epsGrowth >= 0 ? '+' : ''}${epsGrowth.toFixed(1)}%`, positive: epsGrowth > 0 });
    if (epsGrowth > 10) { earnScore += 25; earnDetails.push('EPS u rrit mbi 10% — fitimi për aksionarë po rritet'); }
    else if (epsGrowth > 0) { earnScore += 10; earnDetails.push('EPS u rrit — pozitiv'); }
    else if (epsGrowth > -10) { earnScore -= 15; earnDetails.push('EPS u ul — vëmendje'); }
    else { earnScore -= 30; earnDetails.push('Rënie e thellë e EPS — negativ për çmimin'); }
  }
  if (revAccel !== null) {
    earnData.push({ label: 'Accelerimi i të Ardhurave', value: `${revAccel >= 0 ? '+' : ''}${revAccel.toFixed(1)}pp`, positive: revAccel > 0 });
    if (revAccel > 2) { earnScore += 15; earnDetails.push('Rritja e të ardhurave po përshpejtohet — trend i fortë'); }
    else if (revAccel < -3) { earnScore -= 15; earnDetails.push('Rritja po ngadalësohet — vërehet degradim'); }
  }
  earnSignal = earnScore > 15 ? 'bullish' : earnScore < -15 ? 'bearish' : 'neutral';
  points.push({ title: '1. Earnings Surprise — Të Ardhura & EPS', icon: Target, signal: earnSignal, score: Math.max(-100, Math.min(100, earnScore)), summary: earnScore > 15 ? 'Të dhënat e fitimit tregojnë momentum pozitiv — çmimi ka potencial rritjeje.' : earnScore < -15 ? 'Të dhënat e fitimit janë në rënie — rrezik uljeje çmimi.' : 'Të dhënat e fitimit janë të përziera — asnjë sinjal i qartë.', details: earnDetails, dataPoints: earnData });
  totalScore += earnScore;

  // ═══ 2. MD&A Proxy — Revenue + Net Income Trend ═══
  const niTrend = p?.netIncome && c?.netIncome ? ((c.netIncome - p.netIncome) / Math.abs(p.netIncome)) * 100 : null;
  const oiTrend = p?.operatingIncome && c?.operatingIncome ? ((c.operatingIncome - p.operatingIncome) / Math.abs(p.operatingIncome)) * 100 : null;
  let mdaSignal: Signal = 'neutral';
  let mdaScore = 0;
  const mdaDetails: string[] = [];
  const mdaData: { label: string; value: string; positive?: boolean }[] = [];

  if (niTrend !== null) {
    mdaData.push({ label: 'Trendi i Fitimit Neto', value: `${niTrend >= 0 ? '+' : ''}${niTrend.toFixed(1)}%`, positive: niTrend > 0 });
    if (niTrend > 10) { mdaScore += 20; mdaDetails.push('Fitimi neto në rritje të fortë — menaxhimi po ekzekuton mirë'); }
    else if (niTrend > 0) { mdaScore += 10; mdaDetails.push('Fitimi neto po rritet — drejtim i qëndrueshëm'); }
    else { mdaScore -= 20; mdaDetails.push('Fitimi neto në rënie — mund të tregojë sfida operacionale'); }
  }
  if (oiTrend !== null) {
    mdaData.push({ label: 'Trendi i të Ardhurave Operative', value: `${oiTrend >= 0 ? '+' : ''}${oiTrend.toFixed(1)}%`, positive: oiTrend > 0 });
    if (oiTrend > 5) { mdaScore += 15; mdaDetails.push('Të ardhura operative në rritje — biznesi bazë është i fortë'); }
    else if (oiTrend < -5) { mdaScore -= 15; mdaDetails.push('Të ardhura operative në rënie — kostojet ose kërkesa po bëhen probleme'); }
  }
  // Revenue consistency over 4 quarters
  if (quarters.length >= 4) {
    const revDirs = quarters.slice(0, 4).map((q, i) => {
      if (i === 0 || !q.revenue || !quarters[i - 1]?.revenue) return 0;
      return q.revenue > quarters[i - 1].revenue! ? 1 : -1;
    });
    const consistent = revDirs.slice(1).every(d => d === revDirs[1]);
    if (consistent && revDirs[1] > 0) { mdaScore += 10; mdaDetails.push('4 kuartale rradha me rritje të ardhurave — trend shumë pozitiv'); }
    else if (consistent && revDirs[1] < 0) { mdaScore -= 15; mdaDetails.push('4 kuartale rradha me rënie — alarm për degradim të biznesit'); }
    mdaData.push({ label: 'Konsistenca (4Q)', value: consistent ? (revDirs[1] > 0 ? 'Rritje rradha' : 'Rënie rradha') : 'Variabel', positive: consistent && revDirs[1] > 0 });
  }
  mdaSignal = mdaScore > 15 ? 'bullish' : mdaScore < -15 ? 'bearish' : 'neutral';
  points.push({ title: '2. MD&A — Trendet e Biznesit', icon: TrendingUp, signal: mdaSignal, score: Math.max(-100, Math.min(100, mdaScore)), summary: mdaScore > 15 ? 'Trendet e biznesit janë pozitive — drejtimi strategjik po funksionon.' : mdaScore < -15 ? 'Biznesi po tregon shenja degradimi — kujdes.' : 'Trendet janë të përziera — nevojitet vëmendje e veçantë.', details: mdaDetails, dataPoints: mdaData });
  totalScore += mdaScore;

  // ═══ 3. Profit Margins ═══
  const gmNow = c?.grossProfit && c?.revenue ? (c.grossProfit / c.revenue) * 100 : null;
  const gmPrev = p?.grossProfit && p?.revenue ? (p.grossProfit / p.revenue) * 100 : null;
  const omNow = c?.operatingIncome && c?.revenue ? (c.operatingIncome / c.revenue) * 100 : null;
  const omPrev = p?.operatingIncome && p?.revenue ? (p.operatingIncome / p.revenue) * 100 : null;
  const nmNow = c?.netIncome && c?.revenue ? (c.netIncome / c.revenue) * 100 : null;
  const nmPrev = p?.netIncome && p?.revenue ? (p.netIncome / p.revenue) * 100 : null;

  let marginSignal: Signal = 'neutral';
  let marginScore = 0;
  const marginDetails: string[] = [];
  const marginData: { label: string; value: string; positive?: boolean }[] = [];

  if (gmNow !== null) { marginData.push({ label: 'Marzhi Bruto (tani)', value: `${gmNow.toFixed(1)}%` }); }
  if (gmPrev !== null) { marginData.push({ label: 'Marzhi Bruto (parapr)', value: `${gmPrev.toFixed(1)}%` }); }
  if (gmNow !== null && gmPrev !== null) {
    const diff = gmNow - gmPrev;
    marginData.push({ label: 'Ndryshimi GM', value: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}pp`, positive: diff >= 0 });
    if (diff > 1) { marginScore += 15; marginDetails.push('Marzhi bruto po zgjerohet — fuqia çmimore apo efikasiteti'); }
    else if (diff < -1.5) { marginScore -= 20; marginDetails.push('Marzhi bruto po ngushtohet — kosto në rritje ose ulje çmimesh'); }
  }
  if (omNow !== null) { marginData.push({ label: 'Marzhi Operativ (tani)', value: `${omNow.toFixed(1)}%` }); }
  if (omPrev !== null) { marginData.push({ label: 'Marzhi Operativ (parapr)', value: `${omPrev.toFixed(1)}%` }); }
  if (omNow !== null && omPrev !== null) {
    const diff = omNow - omPrev;
    marginData.push({ label: 'Ndryshimi OM', value: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}pp`, positive: diff >= 0 });
    if (diff > 1) { marginScore += 15; marginDetails.push('Marzhi operativ po përmirësohet — kontroll i mirë i kostove'); }
    else if (diff < -2) { marginScore -= 25; marginDetails.push('Marzhi operativ po bëhet negativ — sinjal rreziku'); }
  }
  if (nmNow !== null && nmPrev !== null) {
    const diff = nmNow - nmPrev;
    marginData.push({ label: 'Ndryshimi NM', value: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}pp`, positive: diff >= 0 });
    if (diff < -3) { marginScore -= 10; marginDetails.push('Marzhi neto në rënie të thellë — kosto tatimore ose interesesh?'); }
  }
  marginSignal = marginScore > 10 ? 'bullish' : marginScore < -10 ? 'bearish' : 'neutral';
  points.push({ title: '3. Profit Margins — Marzhet e Fitimit', icon: BarChart3, signal: marginSignal, score: Math.max(-100, Math.min(100, marginScore)), summary: marginScore > 10 ? 'Marzhet e fitimit po zgjerohen — kompania po bëhet më efikase.' : marginScore < -10 ? 'Marzhet po ngushtohen — rreziku i uljes së çmimit.' : 'Marzhet janë stabile — asnjë sinjal i qartë.', details: marginDetails, dataPoints: marginData });
  totalScore += marginScore;

  // ═══ 4. Risk Assessment (Debt growth, interest burden) ═══
  const deNow = c?.totalDebt;
  const dePrev = p?.totalDebt;
  const intNow = c?.interestExpense;
  const intPrev = p?.interestExpense;
  const debtEquity = c?.totalDebt && c?.totalEquity ? c.totalDebt / c.totalEquity : null;
  const debtEquityPrev = p?.totalDebt && p?.totalEquity ? p.totalDebt / p.totalEquity : null;

  let riskSignal: Signal = 'neutral';
  let riskScore = 0;
  const riskDetails: string[] = [];
  const riskData: { label: string; value: string; positive?: boolean }[] = [];

  if (deNow !== undefined && dePrev !== undefined && dePrev !== 0) {
    const debtGrowth = ((deNow - dePrev) / Math.abs(dePrev)) * 100;
    riskData.push({ label: 'Rritja e Borxhit', value: `${debtGrowth >= 0 ? '+' : ''}${debtGrowth.toFixed(1)}%`, positive: debtGrowth < 0 });
    if (debtGrowth > 10) { riskScore -= 20; riskDetails.push('Borxhi u rrit mbi 10% në një tremujor — rrezik i lartë'); }
    else if (debtGrowth < -5) { riskScore += 15; riskDetails.push('Borxhi u ul — kompania po shlyen detyrimet'); }
  }
  if (debtEquity !== null) {
    riskData.push({ label: 'Debt/Equity (tani)', value: debtEquity.toFixed(2), positive: debtEquity < 0.5 });
    if (debtEquity > 2) { riskScore -= 15; riskDetails.push(`D/E = ${debtEquity.toFixed(2)} — borxhi i lartë në raport me kapitalin`); }
    else if (debtEquity < 0.3) { riskScore += 10; riskDetails.push('D/E shumë i ulët — bilanc i shëndetshëm'); }
  }
  if (debtEquityPrev !== null && debtEquity !== null) {
    const deDiff = debtEquity - debtEquityPrev;
    riskData.push({ label: 'Ndryshimi D/E', value: `${deDiff >= 0 ? '+' : ''}${deDiff.toFixed(2)}`, positive: deDiff < 0 });
    if (deDiff > 0.2) { riskScore -= 10; riskDetails.push('D/E po rritet — kompania po merr më shumë borxhe'); }
  }
  if (intNow !== undefined && intPrev !== undefined && intPrev !== 0) {
    const intGrowth = ((intNow - intPrev) / Math.abs(intPrev)) * 100;
    riskData.push({ label: 'Ndryshimi i Shpenzimeve te Interesit', value: `${intGrowth >= 0 ? '+' : ''}${intGrowth.toFixed(1)}%`, positive: intGrowth < 0 });
    if (intGrowth > 15) { riskScore -= 15; riskDetails.push('Shpenzimet e interesit po rriten shpejt — ftohtë mbi fitimin'); }
  }
  // Interest coverage
  if (c?.operatingIncome && c?.interestExpense && c.interestExpense !== 0) {
    const coverage = c.operatingIncome / Math.abs(c.interestExpense);
    riskData.push({ label: 'Interest Coverage', value: `${coverage.toFixed(1)}x`, positive: coverage > 5 });
    if (coverage < 2) { riskScore -= 20; riskDetails.push(`Interest coverage vetëm ${coverage.toFixed(1)}x — rrezik falimentimi`); }
    else if (coverage > 10) { riskScore += 10; riskDetails.push('Interest coverage shumë i lartë — borxhi nuk është problem'); }
  }
  riskSignal = riskScore > 5 ? 'bullish' : riskScore < -10 ? 'bearish' : 'neutral';
  points.push({ title: '4. Risk Factors — Rreziqet nga 10-Q', icon: AlertTriangle, signal: riskSignal, score: Math.max(-100, Math.min(100, riskScore)), summary: riskScore > 5 ? 'Rreziqet janë të ulëta — bilanci i shëndetshëm.' : riskScore < -10 ? 'Rreziqet janë në rritje — kujdes për pozicionin tuaj.' : 'Rreziqet janë në nivel normal.', details: riskDetails, dataPoints: riskData });
  totalScore += riskScore;

  // ═══ 5. Liquidity — Cash & Debt ═══
  const cashNow = c?.cashAndEquivalents;
  const cashPrev = p?.cashAndEquivalents;
  const fcfNow = c?.freeCashFlow;
  const fcfPrev = p?.freeCashFlow;
  const buybacks = c?.shareRepurchases;
  const divs = c?.dividendsPaid;
  const currentR = c?.currentAssets && c?.currentLiabilities ? c.currentAssets / c.currentLiabilities : null;

  let liqSignal: Signal = 'neutral';
  let liqScore = 0;
  const liqDetails: string[] = [];
  const liqData: { label: string; value: string; positive?: boolean }[] = [];

  if (cashNow !== undefined) { liqData.push({ label: 'Kasa & Ekivalentë', value: formatCompact(cashNow) }); }
  if (cashNow !== undefined && cashPrev !== undefined && cashPrev !== 0) {
    const cashChg = ((cashNow - cashPrev) / Math.abs(cashPrev)) * 100;
    liqData.push({ label: 'Ndryshimi i Kasës', value: `${cashChg >= 0 ? '+' : ''}${cashChg.toFixed(1)}%`, positive: cashChg > 0 });
    if (cashChg > 10) { liqScore += 15; liqDetails.push('Kasa u rrit mbi 10% — likuiditeti po forcohet'); }
    else if (cashChg < -15) { liqScore -= 15; liqDetails.push('Kasa u pakësua — kontrolli i likuiditetit?'); }
  }
  if (fcfNow !== undefined && fcfPrev !== undefined && fcfPrev !== 0) {
    const fcfChg = ((fcfNow - fcfPrev) / Math.abs(fcfPrev)) * 100;
    liqData.push({ label: 'Ndryshimi FCF', value: `${fcfChg >= 0 ? '+' : ''}${fcfChg.toFixed(1)}%`, positive: fcfChg > 0 });
    if (fcfNow > 0 && fcfChg > 0) { liqScore += 20; liqDetails.push('Free Cash Flow pozitiv dhe në rritje — gjeneron para reale'); }
    else if (fcfNow < 0) { liqScore -= 15; liqDetails.push('FCF negativ — kompania po shpenzon më shumë se fiton'); }
  }
  if (currentR !== null) {
    liqData.push({ label: 'Current Ratio', value: currentR.toFixed(2), positive: currentR > 1.5 });
    if (currentR < 1) { liqScore -= 25; liqDetails.push(`Current ratio ${currentR.toFixed(2)} — rrezik likuiditeti!`); }
    else if (currentR > 2) { liqScore += 10; liqDetails.push('Current ratio i lartë — likuiditet i fortë'); }
  }
  if (buybacks !== undefined && buybacks < 0) {
    liqData.push({ label: 'Buybacks', value: formatCompact(Math.abs(buybacks)), positive: true });
    liqScore += 10;
    liqDetails.push('Kompania po blejnë mbrapsht aksionet — ul vëllimin, rrit çmimin');
  }
  if (divs !== undefined && divs < 0) {
    liqData.push({ label: 'Dividendet', value: formatCompact(Math.abs(divs)) });
    if (fcfNow !== undefined && fcfNow > 0 && Math.abs(divs) < fcfNow * 0.5) {
      liqScore += 5;
      liqDetails.push('Dividendet mbulohen lehtë nga FCF — e qëndrueshme');
    }
  }
  liqSignal = liqScore > 10 ? 'bullish' : liqScore < -10 ? 'bearish' : 'neutral';
  points.push({ title: '5. Likuiditeti — Kasa & Borxhi', icon: Banknote, signal: liqSignal, score: Math.max(-100, Math.min(100, liqScore)), summary: liqScore > 10 ? 'Pozicioni i kasës është i fortë — mundësi investimi ose buybacks.' : liqScore < -10 ? 'Likuiditeti po ngushtohet — rrezik për operacionet.' : 'Likuiditeti është adekuat.', details: liqDetails, dataPoints: liqData });
  totalScore += liqScore;

  const overall: Signal = totalScore > 30 ? 'bullish' : totalScore < -30 ? 'bearish' : 'neutral';
  const maxPossible = 5 * 100;
  const normalizedScore = Math.round((totalScore / maxPossible) * 100);

  let summary: string;
  if (overall === 'bullish') summary = `${quarters[0].companyName || 'Kompania'} tregon sinjale pozitive në shumicën e pikave. Të dhënat 10-Q sugjerojnë rritje të ardhurave, marzhe të qëndrueshme ose në përmirësim, dhe një bilanc të shëndetshëm. Çmimi i aksionit ka potencialisht hapësirë rritjeje.`;
  else if (overall === 'bearish') summary = `${quarters[0].companyName || 'Kompania'} tregon sinjale negativë në disa pika kyçe. Kujdes: rënia e të ardhurave, ngushtimi i marzheve, ose rritja e borxhit mund të shtypin çmimin e aksionit.`;
  else summary = `${quarters[0].companyName || 'Kompania'} tregon sinjale të përziera. Disa metrika janë pozitive, të tjera negative. Monitoroni me kujdes — vendosni një pozicion vetëm pas konfirmimit të trendit.`;

  return { points, overall, overallScore: normalizedScore, summary };
}

function SignalBadge({ signal }: { signal: Signal }) {
  const cfg = {
    bullish: { bg: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400', label: 'BULLISH', icon: TrendingUp },
    bearish: { bg: 'bg-red-500/15 border-red-500/40 text-red-400', label: 'BEARISH', icon: TrendingDown },
    neutral: { bg: 'bg-amber-500/15 border-amber-500/40 text-amber-400', label: 'NEUTRAL', icon: Minus },
  }[signal];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${cfg.bg}`}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

function AIAnalysis({ quarters, companyName, ticker }: { quarters: QuarterData[]; companyName: string; ticker: string }) {
  if (quarters.length < 2) return (
    <Card className="border-blue-500/10">
      <CardContent className="pt-8 pb-8 text-center">
        <Sparkles className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground"> nevojiten të paktën 2 kuartale për analizë.</p>
      </CardContent>
    </Card>
  );

  const { points, overall, overallScore, summary } = analyze10Q(quarters);
  const signalCfg = {
    bullish: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', bar: 'bg-emerald-500', text: 'text-emerald-400', label: 'BULLISH', desc: 'Sinjale pozitive — potencial rritjeje' },
    bearish: { border: 'border-red-500/30', bg: 'bg-red-500/5', bar: 'bg-red-500', text: 'text-red-400', label: 'BEARISH', desc: 'Sinjale negative — rrezik uljeje' },
    neutral: { border: 'border-amber-500/30', bg: 'bg-amber-500/5', bar: 'bg-amber-500', text: 'text-amber-400', label: 'NEUTRAL', desc: 'Sinjale të përziera — vërehet me kujdes' },
  }[overall];

  return (
    <div className="space-y-4">
      {/* Overall Score Card */}
      <Card className={`${signalCfg.border} ${signalCfg.bg}`}>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3 mb-3">
            <div className={`${signalCfg.bar}/20 rounded-lg p-2.5`}><Sparkles className={`w-5 h-5 ${signalCfg.text}`} /></div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">Analiza AI 10-Q</span>
                <SignalBadge signal={overall} />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{companyName} ({ticker}) — {signalCfg.desc}</p>
            </div>
          </div>
          {/* Score Bar */}
          <div className="mt-2">
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
              <span>BEARISH</span><span>NEUTRAL</span><span>BULLISH</span>
            </div>
            <div className="h-2 bg-muted/30 rounded-full overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500 opacity-30" />
              <div className="relative h-full w-1/3 bg-muted-foreground/20" style={{ marginLeft: '33.3%' }} />
              <div className="absolute top-0 h-full w-1 bg-foreground/80 rounded-full transition-all" style={{ left: `${Math.max(0, Math.min(100, 50 + overallScore / 2))}%` }} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">{summary}</p>
        </CardContent>
      </Card>

      {/* 5 Analysis Points */}
      {points.map((pt, idx) => {
        const sCfg = {
          bullish: { border: 'border-emerald-500/20', dot: 'bg-emerald-400' },
          bearish: { border: 'border-red-500/20', dot: 'bg-red-400' },
          neutral: { border: 'border-amber-500/20', dot: 'bg-amber-400' },
        }[pt.signal];
        return (
          <Card key={idx} className={sCfg.border}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <pt.icon className={`w-4 h-4 ${pt.signal === 'bullish' ? 'text-emerald-400' : pt.signal === 'bearish' ? 'text-red-400' : 'text-amber-400'}`} />
                  <span className="text-sm font-semibold">{pt.title}</span>
                </div>
                <SignalBadge signal={pt.signal} />
              </div>
              <p className="text-xs text-muted-foreground mb-3">{pt.summary}</p>
              {/* Data Points Grid */}
              {pt.dataPoints.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mb-3">
                  {pt.dataPoints.map((dp, di) => (
                    <div key={di} className="bg-muted/20 rounded px-2 py-1.5">
                      <div className="text-[10px] text-muted-foreground">{dp.label}</div>
                      <div className={`text-xs font-medium tabular-nums ${dp.positive === true ? 'text-emerald-400' : dp.positive === false ? 'text-red-400' : ''}`}>{dp.value}</div>
                    </div>
                  ))}
                </div>
              )}
              {/* Details */}
              {pt.details.length > 0 && (
                <div className="space-y-1">
                  {pt.details.map((d, di) => (
                    <div key={di} className="flex items-start gap-2 text-xs">
                      <div className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${sCfg.dot}`} />
                      <span className="text-muted-foreground">{d}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
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
