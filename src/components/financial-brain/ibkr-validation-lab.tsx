'use client';

// ═══════════════════════════════════════════════════════════════
// Task 27 — IBKR VALIDATION LAB (OOS Dashboard)
// Shtresa e validimit, ekzekutimit dhe kontrollit të rrezikut:
//
//   IBKR Validation
//   ├── In-Sample
//   ├── Out-of-Sample
//   ├── Walk-Forward
//   ├── Paper Trading
//   └── Live Performance
//
//   Paper-Trading Gate para çdo urdhri live:
//   backtest → OOS → walk-forward → 50-100 paper trades →
//   kontroll slippage → live me 0.25% risk
//   + AUTO-PAUSE kur live largohet shumë nga OOS
// ═══════════════════════════════════════════════════════════════

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FlaskConical, Play, RefreshCw, CheckCircle2, XCircle, MinusCircle,
  TrendingUp, TrendingDown, ShieldAlert, Gauge, Layers,
  DollarSign, BarChart3, AlertTriangle, Clock, Info, Timer,
} from 'lucide-react';
import { useState, useCallback } from 'react';

// ── Tipet (në përputhje me src/lib/validation/) ──
interface MetricSet {
  trades: number; wins: number; losses: number; winRatePct: number;
  profitFactor: number; expectancy: number; avgR: number; netProfit: number;
  grossProfit: number; totalCosts: number; maxDrawdownPct: number;
  maxDrawdownDollars: number; avgHoldDays: number; returnPct: number; costDragPct: number;
}

interface Report {
  generatedAt: string;
  period: { from: string; to: string; days: number; isDays: number; oosDays: number };
  universe: { size: number; symbols: string[]; survivorship: { survivorPct: number; recommendedHaircutPct: number; note: string; knownDelistedExcluded: number } };
  equity: { startEquity: number; finalEquity: number };
  table: { inSample: MetricSet; outOfSample: MetricSet; walkForward: MetricSet; paper: MetricSet | null; live: MetricSet | null };
  walkForwardWindows: { window: number; from: string; to: string; trades: number; winRatePct: number; avgR: number; netProfit: number }[];
  scoreBuckets: { label: string; trades: number; winRatePct: number; avgR: number; netProfit: number }[];
  sectorStats: { sector: string; trades: number; winRatePct: number; avgR: number; netProfit: number }[];
  setupSplit: { setupType: string; trades: number; winRatePct: number; avgR: number; netProfit: number }[];
  costs: {
    totalCosts: number; commissionTotal: number; spreadTotal: number;
    slippageTotal: number; impactTotal: number; costDragPct: number;
  };
  execution: {
    signalsGenerated: number; entryOrdersRejected: number;
    rejectReasons: Record<string, number>; exitReasons: Record<string, number>;
  };
  gates: { gate: string; description: string; required: string; actual: string; passed: boolean | null }[];
  autoPause: { winRateDeviationPct: number; avgRDeviation: number; recommendation: 'OK' | 'MONITOR' | 'PAUSE'; note: string };
  topTrades: TradeRow[];
  worstTrades: TradeRow[];
  limitations: string[];
}

interface TradeRow {
  symbol: string; sector: string; entryDate: string; exitDate: string;
  entryPrice: number; exitPrice: number; shares: number; exitReason: string;
  r: number; pnlNet: number; pnlGross: number; costs: number; score: number;
  scoreBreakdown: { trend: number; pullback: number; rs: number; volume: number; market: number; event: number; risk: number; final: number; max: number };
  setupType: string;
}

const fmt = (n: number, digits = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const sign = (n: number, digits = 0) => `${n >= 0 ? '+' : ''}${fmt(n, digits)}`;
const pnlColor = (n: number) => n >= 0 ? 'text-emerald-400' : 'text-red-400';

function GateIcon({ passed }: { passed: boolean | null }) {
  if (passed === true) return <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
  if (passed === false) return <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />;
  return <MinusCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />;
}

function MetricCell({ value, invert = false }: { value: number | string; invert?: boolean }) {
  if (typeof value === 'string') return <span className="text-muted-foreground">{value}</span>;
  const good = invert ? value <= 0 : value >= 0;
  return (
    <span className={good ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
      {fmt(value, Math.abs(value) < 100 ? 2 : 0)}
    </span>
  );
}

export function IBKRValidationLab() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const runBacktest = useCallback(async (force = false) => {
    setLoading(true); setError(null); setElapsed(0);
    const t0 = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    try {
      const res = await fetch(`/api/ibkr-backtest?universe=60&years=5${force ? '&force=1' : ''}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gabim në backtest');
      setReport(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gabim rrjeti');
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  }, []);

  const t = report?.table;

  return (
    <Card className="border-violet-500/20 bg-violet-500/5">
      <CardContent className="p-5">
        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-violet-500/15 rounded-lg p-2.5">
              <FlaskConical className="w-6 h-6 text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">IBKR Validation Lab</h2>
              <p className="text-[13px] text-muted-foreground">
                Backtest → Out-of-Sample → Walk-Forward → Paper → Live — shtresa e validimit të strategjisë
              </p>
            </div>
          </div>
          <button
            onClick={() => report ? runBacktest(true) : runBacktest(false)}
            disabled={loading}
            className="flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-md bg-violet-500/10 border border-violet-500/30 text-violet-400 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {loading ? `Duke ekzekutuar... ${elapsed}s` : report ? 'Rifresko (rindiz)' : 'Ndez Backtest-in (5v)'}
          </button>
        </div>

        {loading && (
          <div className="space-y-2 py-6">
            <div className="flex items-center justify-center gap-2 text-[13px] text-violet-300 mb-3">
              <Timer className="w-4 h-4 animate-pulse" />
              <span>Të dhënat ditorë 5-vjeçare shkarkohen + IS/OOS/Walk-Forward ekzekutohen (~60-120s)</span>
            </div>
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[13px] font-semibold text-red-400">Gabim gjatë backtest-it</p>
              <p className="text-[12px] text-muted-foreground mt-1">{error}</p>
              <button onClick={() => runBacktest(true)} className="mt-2 text-[12px] text-red-300 underline">Provo përsëri</button>
            </div>
          </div>
        )}

        {!loading && !report && !error && (
          <div className="py-6 text-center">
            <p className="text-[14px] text-muted-foreground">
              Strategjia ekzistuese ka vetëm skanimin live — pa ditari historik të testimit.
            </p>
            <p className="text-[13px] text-muted-foreground/70 mt-1.5 max-w-2xl mx-auto">
              Ky laborator zbaton <strong className="text-foreground">të njëjtën logjikë të skanerit</strong> (filtra → score → bracket order)
              mbi 5 vitet e fundit, me ekzekutim realist (hyrje në qirinë pasues, gap risk, supozime konservatore),
              kostot e vërteta (komisione + spread + slippage) dhe ndarje In-Sample / Out-of-Sample / Walk-Forward.
            </p>
          </div>
        )}

        {/* ═══════════ RAPORTI ═══════════ */}
        {!loading && report && t && (
          <div className="space-y-5">
            {/* ── Pipeline Gates ── */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <Layers className="w-4 h-4 text-violet-400" />
                <h3 className="text-[14px] font-bold text-foreground">Pipeline: Backtest → OOS → Walk-Forward → Paper → Live</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {report.gates.map((g, i) => (
                  <div key={i} className={`rounded-lg border p-3 flex items-start gap-2.5 ${
                    g.passed === true ? 'border-emerald-500/25 bg-emerald-500/5'
                    : g.passed === false ? 'border-red-500/25 bg-red-500/5'
                    : 'border-amber-500/25 bg-amber-500/5'}`}>
                    <GateIcon passed={g.passed} />
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold text-foreground">{g.gate}</p>
                      <p className="text-[11.5px] text-muted-foreground leading-snug mt-0.5">{g.description}</p>
                      <p className="text-[11.5px] mt-1">
                        <span className="text-muted-foreground">Aktual: </span>
                        <span className={g.passed === true ? 'text-emerald-400' : g.passed === false ? 'text-red-400' : 'text-amber-400'}>{g.actual}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── AUTO-PAUSE banner ── */}
            <div className={`rounded-lg border p-3.5 flex items-start gap-2.5 ${
              report.autoPause.recommendation === 'PAUSE' ? 'border-red-500/30 bg-red-500/10'
              : report.autoPause.recommendation === 'MONITOR' ? 'border-amber-500/30 bg-amber-500/10'
              : 'border-emerald-500/25 bg-emerald-500/5'}`}>
              <ShieldAlert className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                report.autoPause.recommendation === 'PAUSE' ? 'text-red-400'
                : report.autoPause.recommendation === 'MONITOR' ? 'text-amber-400' : 'text-emerald-400'}`} />
              <div>
                <p className="text-[13px] font-semibold text-foreground">
                  AUTO-PAUSE: {report.autoPause.recommendation}
                  <span className="ml-2 text-[12px] font-normal text-muted-foreground">
                    devijim IS→OOS: {sign(report.autoPause.winRateDeviationPct, 1)} pk win rate · {sign(report.autoPause.avgRDeviation, 2)}R
                  </span>
                </p>
                <p className="text-[12px] text-muted-foreground leading-relaxed mt-1">{report.autoPause.note}</p>
              </div>
            </div>

            {/* ── Tabela kryesore IS / OOS / WF / Paper / Live ── */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <BarChart3 className="w-4 h-4 text-violet-400" />
                <h3 className="text-[14px] font-bold text-foreground">Metrikat kryesore</h3>
                <span className="text-[11.5px] text-muted-foreground">
                  IS {report.period.isDays}d · OOS {report.period.oosDays}d · {report.period.from} → {report.period.to}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[680px]">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="pb-2 text-[12px] font-semibold text-muted-foreground">Metrika</th>
                      <th className="pb-2 text-[12px] font-semibold text-blue-400">In-Sample</th>
                      <th className="pb-2 text-[12px] font-semibold text-amber-400">Out-of-Sample</th>
                      <th className="pb-2 text-[12px] font-semibold text-violet-400">Walk-Forward</th>
                      <th className="pb-2 text-[12px] font-semibold text-cyan-400">Paper</th>
                      <th className="pb-2 text-[12px] font-semibold text-emerald-400">Live</th>
                    </tr>
                  </thead>
                  <tbody className="text-[12.5px]">
                    {[
                      { label: 'Tregti', get: (m: MetricSet) => <MetricCell value={m.trades} /> },
                      { label: 'Win rate', get: (m: MetricSet) => <MetricCell value={m.winRatePct >= 0 ? m.winRatePct : 0} /> },
                      { label: 'Profit factor', get: (m: MetricSet) => <span className="font-semibold text-foreground">{fmt(m.profitFactor, 2)}</span> },
                      { label: 'Expectancy / tregti', get: (m: MetricSet) => <MetricCell value={m.expectancy} /> },
                      { label: 'R mesatar', get: (m: MetricSet) => <MetricCell value={m.avgR} /> },
                      { label: 'Fitimi neto ($)', get: (m: MetricSet) => <MetricCell value={m.netProfit} /> },
                      { label: 'Max drawdown %', get: (m: MetricSet) => <span className="text-red-400 font-semibold">{fmt(m.maxDrawdownPct, 1)}%</span> },
                      { label: 'Kosto totale ($)', get: (m: MetricSet) => <span className="text-amber-400/80 font-semibold">{fmt(m.totalCosts)}</span> },
                      { label: 'Ditë mesatar mbajtje', get: (m: MetricSet) => <span className="text-foreground">{fmt(m.avgHoldDays, 1)}</span> },
                    ].map((row, ri) => (
                      <tr key={ri} className="border-b border-border/30 last:border-0">
                        <td className="py-2 pr-3 text-muted-foreground">{row.label}</td>
                        <td className="py-2 pr-3">{row.get(t.inSample)}</td>
                        <td className="py-2 pr-3">{row.get(t.outOfSample)}</td>
                        <td className="py-2 pr-3">{row.get(t.walkForward)}</td>
                        <td className="py-2 pr-3">{t.paper ? row.get(t.paper) : <span className="text-muted-foreground/50">—</span>}</td>
                        <td className="py-2 pr-3"><span className="text-muted-foreground/50">—</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-muted-foreground/70 mt-2">
                Kolona Paper mbushet nga journal-i Top10 i skanerit (kërkon ≥ 50 rezultate të gjurmuara); Live aktivizohet pasi kalohen gates 1-5.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* ── Walk-Forward windows ── */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <Gauge className="w-4 h-4 text-violet-400" />
                  <h3 className="text-[14px] font-bold text-foreground">Walk-Forward (4 dritare OOS)</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Dritarja</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Periudha</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Tregti</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">WR%</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">R</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Neto $</th>
                      </tr>
                    </thead>
                    <tbody className="text-[12px]">
                      {report.walkForwardWindows.map((w) => (
                        <tr key={w.window} className="border-b border-border/30 last:border-0">
                          <td className="py-1.5 text-violet-400 font-semibold">WF{w.window}</td>
                          <td className="py-1.5 text-muted-foreground">{w.from.slice(0, 7)} → {w.to.slice(0, 7)}</td>
                          <td className="py-1.5 text-foreground">{w.trades}</td>
                          <td className={`py-1.5 font-semibold ${w.winRatePct >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(w.winRatePct, 1)}%</td>
                          <td className={`py-1.5 font-semibold ${pnlColor(w.avgR)}`}>{sign(w.avgR, 2)}</td>
                          <td className={`py-1.5 font-semibold ${pnlColor(w.netProfit)}`}>{sign(w.netProfit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-muted-foreground/70 mt-1.5">
                  Parametrat nuk ndryshohen gjatë OOS — çdo dritare teston stabilitetin në kohë.
                </p>
              </div>

              {/* ── Rezultatet sipas score-it ── */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <TrendingUp className="w-4 h-4 text-violet-400" />
                  <h3 className="text-[14px] font-bold text-foreground">Performanca sipas score-it</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Score</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Tregti</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">WR%</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">R</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Neto $</th>
                      </tr>
                    </thead>
                    <tbody className="text-[12px]">
                      {report.scoreBuckets.map((b) => (
                        <tr key={b.label} className="border-b border-border/30 last:border-0">
                          <td className="py-1.5 text-foreground font-semibold">{b.label}</td>
                          <td className="py-1.5 text-foreground">{b.trades}</td>
                          <td className={`py-1.5 font-semibold ${b.winRatePct >= 50 ? 'text-emerald-400' : b.trades > 0 ? 'text-red-400' : 'text-muted-foreground/50'}`}>
                            {b.trades > 0 ? `${fmt(b.winRatePct, 1)}%` : '—'}
                          </td>
                          <td className={`py-1.5 font-semibold ${pnlColor(b.avgR)}`}>{b.trades > 0 ? sign(b.avgR, 2) : '—'}</td>
                          <td className={`py-1.5 font-semibold ${pnlColor(b.netProfit)}`}>{b.trades > 0 ? sign(b.netProfit) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-muted-foreground/70 mt-1.5">
                  Kështu shihet nëse sinjalet me score të lartë janë vërtet më të mira apo vetëm duken më të mira.
                </p>
              </div>

              {/* ── Sipas sektorit ── */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <Layers className="w-4 h-4 text-violet-400" />
                  <h3 className="text-[14px] font-bold text-foreground">Sipas sektorit</h3>
                </div>
                <div className="overflow-x-auto max-h-56 overflow-y-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Sektori</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Tregti</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">WR%</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">R</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Neto $</th>
                      </tr>
                    </thead>
                    <tbody className="text-[12px]">
                      {report.sectorStats.map((s) => (
                        <tr key={s.sector} className="border-b border-border/30 last:border-0">
                          <td className="py-1.5 text-foreground font-semibold">{s.sector}</td>
                          <td className="py-1.5 text-foreground">{s.trades}</td>
                          <td className={`py-1.5 font-semibold ${s.winRatePct >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(s.winRatePct, 1)}%</td>
                          <td className={`py-1.5 font-semibold ${pnlColor(s.avgR)}`}>{sign(s.avgR, 2)}</td>
                          <td className={`py-1.5 font-semibold ${pnlColor(s.netProfit)}`}>{sign(s.netProfit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Continuation vs fade + ekzekutimi ── */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <TrendingDown className="w-4 h-4 text-violet-400" />
                  <h3 className="text-[14px] font-bold text-foreground">Continuation kundrejt fade</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Setup-i</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Tregti</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">WR%</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">R</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Neto $</th>
                      </tr>
                    </thead>
                    <tbody className="text-[12px]">
                      {report.setupSplit.map((s) => (
                        <tr key={s.setupType} className="border-b border-border/30 last:border-0">
                          <td className="py-1.5 text-foreground font-semibold">{s.setupType}</td>
                          <td className="py-1.5 text-foreground">{s.trades}</td>
                          <td className={`py-1.5 font-semibold ${s.winRatePct >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(s.winRatePct, 1)}%</td>
                          <td className={`py-1.5 font-semibold ${pnlColor(s.avgR)}`}>{sign(s.avgR, 2)}</td>
                          <td className={`py-1.5 font-semibold ${pnlColor(s.netProfit)}`}>{sign(s.netProfit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Exit reasons */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {Object.entries(report.execution.exitReasons).map(([r, n]) => (
                    <Badge key={r} variant="outline" className={`text-[10.5px] ${
                      r.includes('TARGET') ? 'border-emerald-500/30 text-emerald-400'
                      : r.includes('STOP') ? 'border-red-500/30 text-red-400'
                      : 'border-border/50 text-muted-foreground'}`}>
                      {r.replace('_', ' ')}: {n}
                    </Badge>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground/70 mt-1.5">
                  GAP_STOP = hapur nën stop (humbje përtej stopit) · GAP_TARGET = hapur mbi target.
                  Nëse stop dhe target preken në të njëjtin qiri → supozimi KONSERVATIV (stop i pari).
                </p>
              </div>
            </div>

            {/* ── Kostot ── */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <DollarSign className="w-4 h-4 text-amber-400" />
                <h3 className="text-[14px] font-bold text-foreground">Modeli i kostos (çdo tregti zbritet)</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {[
                  { label: 'Komisione (IBKR)', value: report.costs.commissionTotal, hint: '$0.005/aksion, min $1' },
                  { label: 'Bid/Ask spread', value: report.costs.spreadTotal, hint: 'estimuar nga ADV' },
                  { label: 'Slippage', value: report.costs.slippageTotal, hint: '4bps + ATR factor' },
                  { label: 'Market impact', value: report.costs.impactTotal, hint: 'pjesëmarrja vs ADV' },
                  { label: 'TOTAL', value: report.costs.totalCosts, hint: `drag ${fmt(report.costs.costDragPct, 1)}% i fitimit bruto`, highlight: true },
                ].map((c, i) => (
                  <div key={i} className={`rounded-lg border p-3 ${c.highlight ? 'border-amber-500/30 bg-amber-500/10' : 'border-border/50 bg-muted/5'}`}>
                    <p className={`text-[11px] ${c.highlight ? 'text-amber-400' : 'text-muted-foreground'}`}>{c.label}</p>
                    <p className={`text-[16px] font-bold mt-1 ${c.highlight ? 'text-amber-400' : 'text-foreground'}`}>-${fmt(c.value)}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">{c.hint}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Ekzekutimi: sinjale / refuzime ── */}
            <div className="rounded-lg border border-border/50 bg-muted/5 p-3.5">
              <div className="flex items-center gap-2 mb-2">
                <ActivityIcon />
                <h3 className="text-[13px] font-bold text-foreground">Ekzekutimi realist</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
                <div>
                  <p className="text-muted-foreground">Sinjale të gjeneruara</p>
                  <p className="text-[16px] font-bold text-foreground mt-0.5">{fmt(report.execution.signalsGenerated)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Urdhra të pamjaftuar</p>
                  <p className="text-[16px] font-bold text-red-400 mt-0.5">{fmt(report.execution.entryOrdersRejected)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Kapitali fillestar</p>
                  <p className="text-[16px] font-bold text-foreground mt-0.5">${fmt(report.equity.startEquity)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Ekuilibri final (IS+OOS)</p>
                  <p className={`text-[16px] font-bold mt-0.5 ${pnlColor(report.equity.finalEquity - report.equity.startEquity)}`}>
                    ${fmt(report.equity.finalEquity)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {Object.entries(report.execution.rejectReasons).map(([r, n]) => (
                  <Badge key={r} variant="outline" className="text-[10.5px] border-border/50 text-muted-foreground">
                    {r.replace(/_/g, ' ')}: {n}
                  </Badge>
                ))}
              </div>
            </div>

            {/* ── Top / Worst trades ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[
                { title: '5 më të mirat', trades: report.topTrades, color: 'text-emerald-400', icon: TrendingUp },
                { title: '5 më të këqijat', trades: report.worstTrades, color: 'text-red-400', icon: TrendingDown },
              ].map((block) => (
                <div key={block.title}>
                  <div className="flex items-center gap-2 mb-2">
                    <block.icon className={`w-4 h-4 ${block.color}`} />
                    <h4 className="text-[13px] font-bold text-foreground">{block.title}</h4>
                  </div>
                  <div className="space-y-1.5">
                    {block.trades.map((tr, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 rounded-md bg-muted/5 border border-border/30 px-2.5 py-1.5 text-[12px]">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-foreground">{tr.symbol}</span>
                          <span className="text-muted-foreground/60 text-[10.5px]">{tr.setupType}</span>
                          <span className="text-muted-foreground/50 text-[10.5px] hidden sm:inline">
                            {tr.entryDate} → {tr.exitDate}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10.5px] text-muted-foreground" title="Confidence score">
                            {tr.scoreBreakdown.final}/10
                          </span>
                          <span className={`font-bold ${pnlColor(tr.r)}`}>{sign(tr.r, 2)}R</span>
                          <span className={`font-bold ${pnlColor(tr.pnlNet)}`}>{sign(tr.pnlNet)}$</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* ── Universe + kufizimet ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="w-4 h-4 text-blue-400" />
                  <h4 className="text-[13px] font-bold text-foreground">Universi & Survivorship</h4>
                </div>
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  Universi: <strong className="text-foreground">{report.universe.size} emra</strong> likuidë nga lista 400-e ·
                  mbijetuesit: {fmt(report.universe.survivorship.survivorPct, 1)}% ·
                  {report.universe.survivorship.knownDelistedExcluded} emra të delistuar përjashtohen sipas datës së zhdukjes.
                  Haircut i rekomanduar mbi fitimin: <strong className="text-amber-400">{report.universe.survivorship.recommendedHaircutPct}%</strong>.
                </p>
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/5 p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <h4 className="text-[13px] font-bold text-foreground">Kufizimet e njohura (lexo para se t'u besosh numrave)</h4>
                </div>
                <ul className="space-y-1">
                  {report.limitations.map((l, i) => (
                    <li key={i} className="text-[11.5px] text-muted-foreground leading-snug flex items-start gap-1.5">
                      <span className="text-amber-400/70 mt-px">•</span>{l}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground/60 text-center">
              Ky raport nuk garanton fitime — të tregon në mënyrë të matshme nëse strategjia ka avantazh real apo vetëm rezultat të bukur historik.
              Generuar: {new Date(report.generatedAt).toLocaleString('sq-AL')}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityIcon() {
  return <Clock className="w-4 h-4 text-muted-foreground" />;
}
