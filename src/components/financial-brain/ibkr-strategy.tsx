'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Shield,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Target,
  BarChart3,
  DollarSign,
  Clock,
  Layers,
  Zap,
  ArrowRight,
  Calculator,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Eye,
  EyeOff,
  Activity,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

// ── Types ──
interface ScanResult {
  symbol: string;
  price: number;
  setup: 'PULLBACK' | 'BREAKOUT' | 'NONE';
  setupScore: number;
  aboveSMA50: boolean;
  aboveSMA200: boolean;
  sma50Above200: boolean;
  trendScore: number;
  pullbackDays: number;
  pullbackPct: number;
  distFromEMA10: number;
  distFromEMA20: number;
  rsi: number;
  atr: number;
  volRatio: number;
  volDeclining: boolean;
  lastDaySpike: boolean;
  rsVsSPY: number;
  rsVsQQQ: number;
  entry: number;
  stop: number;
  target1R: number;
  target2R: number;
  riskPct: number;
  rewardRiskRatio: number;
  swingLow: number;
  spyAbove50: boolean;
  spyAbove200: boolean;
  qqqAbove50: boolean;
  qqqAbove200: boolean;
  regimeOk: boolean;
  passed: boolean;
  reasons: string[];
  warnings: string[];
}

interface ScanResponse {
  scannedAt: string;
  regimeOk: boolean;
  regimeDetail: { spy: { above50: boolean; above200: boolean }; qqq: { above50: boolean; above200: boolean } };
  results: ScanResult[];
  summary: { total: number; passed: number; rejected: number };
}

// ── Strategy Data ──
const STRATEGY_RULES = [
  { element: 'Universe', icon: Layers, rule: 'Large-cap ose ETF likuide: NVDA, AMD, MSFT, AAPL, AMZN, META, GOOGL, ETF si QQQ/SPY/SMH', color: 'text-blue-400' },
  { element: 'Regjimi', icon: Shield, rule: 'Long vetem kur SPY dhe QQQ jane mesataren 50-ditore dhe 200-ditore', color: 'text-emerald-400' },
  { element: 'Trend', icon: TrendingUp, rule: 'Aksioni mbi 50 SMA dhe 200 SMA; 50 SMA mbi 200 SMA', color: 'text-emerald-400' },
  { element: 'Relative Strength', icon: BarChart3, rule: 'Aksioni duhet te jete me i forte se SPY/QQQ ne 1-3 muaj', color: 'text-blue-400' },
  { element: 'Setup Hyrjeje', icon: Target, rule: 'Pullback 3-8 dite drejt 10/20 EMA ose breakout mbi rezistencen', color: 'text-amber-400' },
  { element: 'Konfirmimi', icon: CheckCircle2, rule: 'Volum mbi mesataren ne diten e kthimit/breakout; RSI aferesisht 45-65, jo ekstrem', color: 'text-emerald-400' },
  { element: 'Risku', icon: AlertTriangle, rule: 'Maksimum 0.5-1% e llogarise ne nje trade', color: 'text-red-400' },
  { element: 'Dalja', icon: Zap, rule: 'Stop nen swing-low/1-1.5 ATR; target fillestar te pakten 2R', color: 'text-amber-400' },
];

const ENTRY_RULES = [
  'Tregu i pergjithshem eshte bullish; mos detyro long trades kur indekset jane ne trend te dobet.',
  'Kompania ka raport te mire earnings, rritje te te ardhurave/fitimit ose katalizator te qarte.',
  'Cmimi eshte mbi 50 SMA dhe 200 SMA.',
  'Ka bere pullback te kontrolluar me volum me te ulet, pastaj jep candle rikthimi me volum.',
  'Entry vendose mbi high-in e candle-it te konfirmimit, zakonisht me buy stop-limit ose limit ne pullback; mos e ndiq cmimin pas nje qiriu shume te zgjeruar.',
];

const DONT_RULES = [
  'Mos bej day trading te rastessishem vetem sepse IBKR e ben execution-in te lehte.',
  'Mos hy para earnings nese nuk je duke tregtuar qellimisht event risk; gap-i mund ta kaloje stop-in.',
  'Mos ble aksione qe jane 10-15% mbi 10/20 EMA pas nje rally te shpejte.',
  'Mos perdor leverage/margin derisa strategjia te jete e testuar me journal, paper trading dhe pozicione te vogla live.',
  'Mos u mbeshtet vetem te RSI ose MACD; keta jane filtra, jo edge i mjaftueshem me vete.',
];

const SYSTEM_GATES = [
  { gate: 'Market Regime', desc: 'SPY/QQQ mbi 50 dhe 200 SMA', icon: Shield },
  { gate: 'Sector Confirmation', desc: 'Sektori perkates (p.sh. SMH per NVDA/AMD) duhet te jete i forte', icon: Layers },
  { gate: 'Stock Trend + RS', desc: 'Mbi 50/200 SMA dhe outperform ndaj SPY', icon: TrendingUp },
  { gate: 'Pullback Quality', desc: 'ATR, volum, distance nga EMA dhe strukture support/resistance', icon: BarChart3 },
  { gate: 'Event-Risk Gate', desc: 'Earnings, CPI, FOMC, jobs report', icon: AlertTriangle },
  { gate: 'Position Sizing', desc: 'IBKR bracket order automatik', icon: DollarSign },
  { gate: 'Auto-Pause', desc: 'Nese slippage, drawdown ose performanca out-of-sample degradojne', icon: Clock },
];

// ── Section wrapper ──
function Section({ title, icon: Icon, children, color = 'text-emerald-400', defaultOpen = true }: {
  title: string; icon: any; children: React.ReactNode; color?: string; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="border-border/50 bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/5 transition-colors rounded-t-lg"
      >
        <Icon className={`w-5 h-5 ${color} flex-shrink-0`} />
        <span className="font-semibold text-[15px] text-foreground flex-1">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <CardContent className="pt-0 pb-4 px-4">{children}</CardContent>}
    </Card>
  );
}

// ── Setup Card ──
function SetupCard({ stock, rank, showRejected }: { stock: ScanResult; rank: number; showRejected: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isGood = stock.passed;
  const setupColor = stock.setup === 'PULLBACK' ? 'text-amber-400' : stock.setup === 'BREAKOUT' ? 'text-blue-400' : 'text-muted-foreground';
  const setupBg = stock.setup === 'PULLBACK' ? 'bg-amber-500/15 border-amber-500/30' : 'bg-blue-500/15 border-blue-500/30';

  if (!showRejected && !isGood) return null;

  return (
    <Card className={`${isGood ? 'border-emerald-500/30' : 'border-border/30'} bg-card hover:border-border transition-all`}>
      <CardContent className="p-4">
        {/* Top row */}
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${rank <= 3 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-muted/30 text-muted-foreground'}`}>
            {rank}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-base text-foreground">{stock.symbol}</span>
              <Badge className={`${setupBg} ${setupColor} text-[12px] px-2.5 py-0.5 font-semibold`} variant="outline">
                {stock.setup === 'PULLBACK' ? 'PULLBACK' : 'BREAKOUT'}
              </Badge>
              <Badge className={`${isGood ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-red-500/15 text-red-400 border-red-500/30'} text-[12px] px-2.5 py-0.5 font-semibold`} variant="outline">
                {isGood ? 'GATE PASS' : 'WATCHER'}
              </Badge>
              {!stock.regimeOk && (
                <Badge className="bg-red-500/10 text-red-400/80 border-red-500/20 text-[11px] px-2 py-0.5" variant="outline">
                  REGJIMI JO OK
                </Badge>
              )}
            </div>
            <p className="text-[13px] text-muted-foreground mt-1">
              ${stock.price.toFixed(2)} · {stock.pullbackDays}d pullback ({stock.pullbackPct > 0 ? '+' : ''}{stock.pullbackPct.toFixed(1)}%)
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <div className={`text-2xl font-bold ${stock.setupScore >= 70 ? 'text-emerald-400' : stock.setupScore >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
              {stock.setupScore}
            </div>
            <div className="text-[12px] text-muted-foreground">Setup Score</div>
          </div>
        </div>

        {/* Quick metrics row */}
        <div className="mt-3 grid grid-cols-6 gap-2">
          <div className="rounded-md p-2 text-center bg-muted/5">
            <p className="text-[11px] text-muted-foreground font-medium">Trend</p>
            <p className={`text-[14px] font-bold ${stock.trendScore >= 70 ? 'text-emerald-400' : stock.trendScore >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{stock.trendScore}</p>
          </div>
          <div className="rounded-md p-2 text-center bg-muted/5">
            <p className="text-[11px] text-muted-foreground font-medium">RSI</p>
            <p className={`text-[14px] font-bold ${stock.rsi >= 45 && stock.rsi <= 65 ? 'text-emerald-400' : stock.rsi > 65 ? 'text-amber-400' : 'text-red-400'}`}>{stock.rsi}</p>
          </div>
          <div className="rounded-md p-2 text-center bg-muted/5">
            <p className="text-[11px] text-muted-foreground font-medium">RS vs SPY</p>
            <p className={`text-[14px] font-bold ${stock.rsVsSPY > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{stock.rsVsSPY > 0 ? '+' : ''}{stock.rsVsSPY.toFixed(1)}%</p>
          </div>
          <div className="rounded-md p-2 text-center bg-muted/5">
            <p className="text-[11px] text-muted-foreground font-medium">Risk</p>
            <p className={`text-[14px] font-bold ${stock.riskPct <= 4 ? 'text-emerald-400' : stock.riskPct <= 6 ? 'text-amber-400' : 'text-red-400'}`}>{stock.riskPct.toFixed(1)}%</p>
          </div>
          <div className="rounded-md p-2 text-center bg-muted/5">
            <p className="text-[11px] text-muted-foreground font-medium">Vol</p>
            <p className={`text-[14px] font-bold ${stock.volDeclining ? 'text-emerald-400' : 'text-muted-foreground'}`}>{stock.volDeclining ? 'Bije' : 'Normale'}</p>
          </div>
          <div className="rounded-md p-2 text-center bg-muted/5">
            <p className="text-[11px] text-muted-foreground font-medium">R:R</p>
            <p className="text-[14px] font-bold text-emerald-400">1:{stock.rewardRiskRatio}</p>
          </div>
        </div>

        {/* Entry/Stop/Target box */}
        <div className="mt-3 grid grid-cols-4 gap-2">
          <div className="rounded-lg bg-blue-500/5 border border-blue-500/15 p-3 text-center">
            <p className="text-[11px] text-blue-400 font-medium">ENTRY</p>
            <p className="text-[15px] font-bold text-foreground">${stock.entry.toFixed(2)}</p>
          </div>
          <div className="rounded-lg bg-red-500/5 border border-red-500/15 p-3 text-center">
            <p className="text-[11px] text-red-400 font-medium">STOP</p>
            <p className="text-[15px] font-bold text-red-400">${stock.stop.toFixed(2)}</p>
          </div>
          <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-3 text-center">
            <p className="text-[11px] text-emerald-400 font-medium">TARGET 1R</p>
            <p className="text-[15px] font-bold text-emerald-400">${stock.target1R.toFixed(2)}</p>
          </div>
          <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3 text-center">
            <p className="text-[11px] text-emerald-400 font-medium">TARGET 2R</p>
            <p className="text-[15px] font-bold text-emerald-400">${stock.target2R.toFixed(2)}</p>
          </div>
        </div>

        {/* Reasons */}
        {stock.reasons.length > 0 && (
          <div className="mt-3 flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-blue-500/5 border border-blue-500/15">
            <CheckCircle2 className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="space-y-1 min-w-0">
              {stock.reasons.map((r, i) => (
                <p key={i} className="text-[13px] text-blue-300/80 leading-relaxed">· {r}</p>
              ))}
            </div>
          </div>
        )}

        {/* Warnings */}
        {stock.warnings.length > 0 && (
          <div className="mt-2 flex items-start gap-2.5 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/15">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="space-y-1 min-w-0">
              {stock.warnings.map((w, i) => (
                <p key={i} className="text-[13px] text-amber-300/80 leading-relaxed">· {w}</p>
              ))}
            </div>
          </div>
        )}

        {/* Expanded detail */}
        {expanded && (
          <div className="mt-3 border-t border-border/50 pt-3 space-y-2 text-[13px] text-muted-foreground">
            <div className="grid grid-cols-2 gap-2">
              <div>SMA 50: <span className={stock.aboveSMA50 ? 'text-emerald-400' : 'text-red-400'}>{stock.aboveSMA50 ? 'Mbi' : 'Nen'}</span></div>
              <div>SMA 200: <span className={stock.aboveSMA200 ? 'text-emerald-400' : 'text-red-400'}>{stock.aboveSMA200 ? 'Mbi' : 'Nen'}</span></div>
              <div>50 / 200 SMA: <span className={stock.sma50Above200 ? 'text-emerald-400' : 'text-red-400'}>{stock.sma50Above200 ? 'Po' : 'Jo'}</span></div>
              <div>ATR: ${stock.atr.toFixed(2)}</div>
              <div>Distanca EMA10: {stock.distFromEMA10 > 0 ? '+' : ''}{stock.distFromEMA10.toFixed(1)}%</div>
              <div>Distanca EMA20: {stock.distFromEMA20 > 0 ? '+' : ''}{stock.distFromEMA20.toFixed(1)}%</div>
              <div>RS vs QQQ: {stock.rsVsQQQ > 0 ? '+' : ''}{stock.rsVsQQQ.toFixed(1)}%</div>
              <div>Swing Low: ${stock.swingLow.toFixed(2)}</div>
            </div>
          </div>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1.5 mt-2.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {expanded ? 'Fshi detajet' : 'Shiko me shume detaje'}
        </button>
      </CardContent>
    </Card>
  );
}

// ── Regime Banner ──
function RegimeBanner({ data }: { data: ScanResponse }) {
  const { regimeDetail, regimeOk } = data;
  return (
    <Card className={`${regimeOk ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Shield className={`w-5 h-5 ${regimeOk ? 'text-emerald-400' : 'text-red-400'} flex-shrink-0`} />
          <div className="flex-1">
            <p className={`text-[14px] font-semibold ${regimeOk ? 'text-emerald-400' : 'text-red-400'}`}>
              {regimeOk ? 'REGJIMI OK — Mund te besh Long Trades' : 'REGJIMI JO OK — Vetem Watcher Mode'}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[13px]">
              <span className="text-muted-foreground">
                SPY: <span className={regimeDetail.spy.above50 ? 'text-emerald-400' : 'text-red-400'}>{regimeDetail.spy.above50 ? 'Mbi 50' : 'Nen 50'}</span> · <span className={regimeDetail.spy.above200 ? 'text-emerald-400' : 'text-red-400'}>{regimeDetail.spy.above200 ? 'Mbi 200' : 'Nen 200'}</span>
              </span>
              <span className="text-muted-foreground">
                QQQ: <span className={regimeDetail.qqq.above50 ? 'text-emerald-400' : 'text-red-400'}>{regimeDetail.qqq.above50 ? 'Mbi 50' : 'Nen 50'}</span> · <span className={regimeDetail.qqq.above200 ? 'text-emerald-400' : 'text-red-400'}>{regimeDetail.qqq.above200 ? 'Mbi 200' : 'Nen 200'}</span>
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Component ──
export function IBKRStrategy() {
  const [data, setData] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  const runScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ibkr-scan?_t=' + Date.now(), { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gabim');
      setData(json);
      setHasScanned(true);
    } catch (err: any) {
      setError(err?.message || 'Gabim rrjeti');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-scan on mount
  useEffect(() => { runScan(); }, [runScan]);

  const passedStocks = data?.results.filter(r => r.passed) || [];
  const rejectedStocks = data?.results.filter(r => !r.passed) || [];

  return (
    <div className="space-y-4">
      {/* Strategy Overview */}
      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-emerald-500/15 rounded-lg p-2.5">
              <TrendingUp className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Strategjia: Trend Pullback Swing</h2>
              <p className="text-[13px] text-muted-foreground">Syno trade 5-20 ditore, jo day trading te vazhdueshme</p>
            </div>
          </div>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            Per ty, strategjia me e mire ne IBKR eshte <strong className="text-foreground">swing trading i rregulluar nga trendi</strong>, duke kombinuar
            <Badge variant="outline" className="mx-1 text-[12px] border-blue-500/30 text-blue-400 bg-blue-500/10">fundamentet</Badge> +
            <Badge variant="outline" className="mx-1 text-[12px] border-violet-500/30 text-violet-400 bg-violet-500/10">momentum/relative strength</Badge> +
            <Badge variant="outline" className="mx-1 text-[12px] border-red-500/30 text-red-400 bg-red-500/10">risk management strikt</Badge>.
            Kjo i pershtatet mire aksioneve likuide amerikane dhe mund te zbatohet paster me bracket orders ne IBKR.
          </p>
        </CardContent>
      </Card>

      {/* ── LIVE SCAN SECTION ── */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-blue-400" />
              <div>
                <h3 className="text-[15px] font-bold text-foreground">Skanimi Live i Setup-eve</h3>
                <p className="text-[13px] text-muted-foreground">Aksione qe plotesojne kriteret e strategjise ne kohe reale</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {data && (
                <button
                  onClick={() => setShowRejected(!showRejected)}
                  className={`flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-md border transition-colors ${showRejected ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-border/50 text-muted-foreground hover:text-foreground'}`}
                >
                  {showRejected ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showRejected ? 'Fshi Watcher' : 'Shiko Watcher'}
                </button>
              )}
              <button
                onClick={runScan}
                disabled={loading}
                className="flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Duke skanuar...' : 'Rifresko' }
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-[200px] rounded-xl" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <span className="text-sm text-red-400">{error}</span>
            <button onClick={runScan} className="ml-auto text-sm text-red-500 hover:underline">Provo perseri</button>
          </CardContent>
        </Card>
      )}

      {/* Scan Results */}
      {data && !loading && (
        <>
          {/* Regime Check */}
          <RegimeBanner data={data} />

          {/* Summary */}
          <div className="flex items-center gap-4 text-[13px] text-muted-foreground">
            <span><strong className="text-foreground">{data.summary.total}</strong> aksione te skanuar</span>
            <span>·</span>
            <span><strong className="text-emerald-400">{data.summary.passed}</strong> plotesojne kriteret</span>
            <span>·</span>
            <span><strong className="text-amber-400">{data.summary.rejected}</strong> ne watcher list</span>
            {data.scannedAt && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{new Date(data.scannedAt).toLocaleTimeString('sq-AL')}</span>
              </>
            )}
          </div>

          {/* Passed setups */}
          {passedStocks.length > 0 && (
            <div className="space-y-3">
              {passedStocks.map((stock, i) => (
                <SetupCard key={stock.symbol} stock={stock} rank={i + 1} showRejected={true} />
              ))}
            </div>
          )}

          {/* Watcher setups (rejected but notable) */}
          {showRejected && rejectedStocks.length > 0 && (
            <div className="space-y-3">
              <p className="text-[13px] text-amber-400 font-medium flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Watcher List ({rejectedStocks.length} aksione)
              </p>
              {rejectedStocks.map((stock, i) => (
                <SetupCard key={stock.symbol} stock={stock} rank={passedStocks.length + i + 1} showRejected={true} />
              ))}
            </div>
          )}

          {/* No results */}
          {data.results.length === 0 && hasScanned && (
            <Card className="border-border/50 bg-muted/5">
              <CardContent className="py-8 text-center">
                <Target className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-[14px] text-muted-foreground font-medium">Asnje setup i pershtatshem tani</p>
                <p className="text-[13px] text-muted-foreground/60 mt-1.5">
                  Asnje aksion nuk ploteson kriteret e strategjise ne momentin. Provo perseri me vone.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Strategy Reference (collapsed by default after scan) */}
      <Section title="Tabela e Rregullave" icon={Calculator} color="text-blue-400" defaultOpen={!hasScanned}>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border/50">
                <th className="pb-2 text-[13px] font-semibold text-muted-foreground w-44">Elementi</th>
                <th className="pb-2 text-[13px] font-semibold text-muted-foreground">Rregulli Praktik</th>
              </tr>
            </thead>
            <tbody>
              {STRATEGY_RULES.map((r, i) => (
                <tr key={i} className="border-b border-border/30 last:border-0">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <r.icon className={`w-4 h-4 ${r.color} flex-shrink-0`} />
                      <span className="font-semibold text-[13px] text-foreground">{r.element}</span>
                    </div>
                  </td>
                  <td className="py-3 text-[13px] text-muted-foreground leading-relaxed">{r.rule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Entry Rules */}
      <Section title="Rregullat e Hyrjes" icon={Target} color="text-emerald-400" defaultOpen={false}>
        <p className="text-[13px] text-muted-foreground mb-3">Hyn vetem kur plotesohen keto kushte:</p>
        <ul className="space-y-2.5">
          {ENTRY_RULES.map((rule, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              <span className="text-[13px] text-muted-foreground leading-relaxed">{rule}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-lg bg-blue-500/5 border border-blue-500/15 p-4">
          <div className="flex items-start gap-2.5">
            <BarChart3 className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-[13px] text-blue-300/90 leading-relaxed">
              <strong>Shembull:</strong> NVDA eshte mbi 50/200 SMA, SMH dhe QQQ jane bullish, NVDA bie 4 dite te 20 EMA me volum ne renie dhe pastaj mbyllet fort mbi high-in e dites paraprake. Hyrja mund te jete pak mbi at high; stop-i nen low-in e pullback-ut. Nese distanca deri te stop-i eshte 4%, targeti minimal duhet te jete rreth 8% per nje raport risk/reward 1:2.
            </p>
          </div>
        </div>
      </Section>

      {/* Position Sizing */}
      <Section title="Madhesia e Pozicionit" icon={DollarSign} color="text-amber-400" defaultOpen={false}>
        <div className="space-y-4">
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Mos zgjidh numrin e aksioneve sipas ndjenjes; llogarite nga rreziku:
          </p>
          <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 p-4 text-center">
            <p className="text-[14px] font-mono font-semibold text-amber-300">
              Shares = Risku ne dollar / (Entry - Stop)
            </p>
          </div>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Nese llogaria eshte $10,000 dhe rrezikon 0.75% per trade, rreziku maksimal eshte $75. Nese entry eshte $150 dhe stop $144, rreziku per aksion eshte $6, prandaj pozicioni maksimal eshte afersisht 12 aksione.
          </p>
          <ul className="space-y-2.5">
            <li className="flex items-start gap-2.5">
              <DollarSign className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <span className="text-[13px] text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Rrezik per trade:</strong> 0.5% ne fillim; maksimum 1% vetem pasi ke statistike te provuar.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <span className="text-[13px] text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Ekspozim total:</strong> Mos i vendos 5 trade te gjitha ne semiconductors, sepse jane realisht nje bast i vetem sektorial.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <span className="text-[13px] text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Auto-pause:</strong> Ndal hyrjet e reja nese ke 3 humbje radhazi ose drawdown javor mbi 2-3%.
              </span>
            </li>
          </ul>
        </div>
      </Section>

      {/* How to use IBKR */}
      <Section title="Si ta Perdorosh IBKR" icon={Zap} color="text-violet-400" defaultOpen={false}>
        <div className="space-y-4">
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Per cdo trade perdor <strong className="text-foreground">Bracket Order</strong>: entry, take-profit dhe stop-loss te lidhur. Kur mbushet njerja dalje, tjetra anulohet automatikisht; kjo e ben disiplinen shume me te lehte.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg bg-violet-500/5 border border-violet-500/15 p-4">
              <p className="font-semibold text-[13px] text-violet-400 mb-1.5">Entry</p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">Buy limit per pullback ose buy stop-limit per breakout.</p>
            </div>
            <div className="rounded-lg bg-violet-500/5 border border-violet-500/15 p-4">
              <p className="font-semibold text-[13px] text-violet-400 mb-1.5">Stop-Loss</p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">Vendose sipas struktures se chart-it, jo nje perqindje arbitrare.</p>
            </div>
            <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-4">
              <p className="font-semibold text-[13px] text-emerald-400 mb-1.5">Take-Profit</p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">Vendos target fillestar 2R; ne 1R mund te shesh 25-50% dhe stop-in e pjeses se mbetur ta cosh ne breakeven.</p>
            </div>
            <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 p-4">
              <p className="font-semibold text-[13px] text-amber-400 mb-1.5">Trailing Stop</p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">Perdore vetem kur trade-i eshte tashme ne fitim dhe trendi eshte i forte; IBKR e leviz stop-in lart me cmimin, por stop-i nuk leviz prapa kur cmimi bie.</p>
            </div>
          </div>
        </div>
      </Section>

      {/* What NOT to do */}
      <Section title="Cka te Mos Bejesh" icon={XCircle} color="text-red-400" defaultOpen={false}>
        <ul className="space-y-2.5">
          {DONT_RULES.map((rule, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <span className="text-[13px] text-muted-foreground leading-relaxed">{rule}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* System Version */}
      <Section title="Versioni per Sistemin tend (CMS Finance)" icon={Layers} color="text-emerald-400" defaultOpen={false}>
        <div className="space-y-4">
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Per CMS Finance, ktheje kete ne nje <strong className="text-foreground">NO_TRADE-first gate</strong>: sistemi vepron vetem kur tregu, sektori dhe setup-i jane ne harmoni.
          </p>
          <div className="space-y-2">
            {SYSTEM_GATES.map((g, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg bg-muted/5 p-3">
                <g.icon className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-[13px] text-foreground">{g.gate}</p>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">{g.desc}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-emerald-400/50 mt-1 flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Footer disclaimer */}
      <div className="border border-amber-500/20 rounded-lg px-4 py-3 bg-amber-500/5">
        <p className="text-[12px] text-amber-400/70 leading-relaxed">
          <strong>Evidenca historike</strong> sugjeron se trend-following/time-series momentum ka funksionuar ne shume tregje dhe horizonte kohore, por nuk garanton fitim ne cdo periudhe. Kjo nuk permban keshille financiare.
        </p>
      </div>
    </div>
  );
}
