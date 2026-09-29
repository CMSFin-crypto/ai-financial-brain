'use client';

// ═══════════════════════════════════════════════════════════════════
// REV v1 — "Confirmed Short-Term Reversal" — TAB I VEÇANTË
// ═══════════════════════════════════════════════════════════════════
// FAMILJE E RE (REV_*) — krejtësisht e ndarë nga IBKR (CTC v2), CAMS
// dhe Social Arb. S'importon asgjë nga ata; metrikat s'përzihen.
// API-të e veta: /api/rev-scan · /api/rev-validate
// ═══════════════════════════════════════════════════════════════════

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TrendingDown, RefreshCw, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Info, Shield, Target, BarChart3, Clock, Ban, FlaskConical, Gauge,
  ArrowRight, GitCompareArrows, Activity, Layers, Eye, Snowflake,
} from 'lucide-react';
import { useState } from 'react';

// ── Tipet (pasqyrë e API response) ──

interface RevCandidate {
  symbol: string;
  companyName: string;
  sector: string;
  status: string;
  price: number;
  ret3Pct: number;
  rsi2: number;
  spyRet3Pct: number;
  idioSpreadPct: number;
  dollarVol20: number;
  liquidityPctile: number;
  atr: number;
  atrPct: number;
  stop: number;
  target: number;
  riskPerShare: number;
  position: { shares: number; riskDollars: number; notional: number };
  signalDate: string;
  confirmation?: { greenCandle: boolean; higherLow: boolean; volumeDeclining: boolean; newLow: boolean; confirmed: boolean };
  gate8k?: { blocked: boolean; lastFilingDate?: string; items?: string };
  slot: 'OPEN_OK' | 'SEKTOR_PLOT' | 'MAX_POZICIONE' | 'VETEM_WATCH';
  reasons: string[];
  warnings: string[];
}

interface RevScanData {
  scannedAt: string;
  durationSec: number;
  hypothesis: {
    version: number;
    name: string;
    frozen: Record<string, string | number | boolean>;
    noteSeparation: string;
  };
  regime: { spyLastMovePct: number; spyCrash: boolean; spyRet3Pct: number; note: string };
  universe: { total: number; withData: number; inZone: number };
  counts: { hyrjeTani: number; pritKonfirmim: number; bllokuar8k: number; bllokuarSpyCrash: number; invaliduarLowIRi: number; konfirmimPlotfullyem: number; paSinjal: number };
  hyrjeTani: RevCandidate[];
  pritKonfirmim: RevCandidate[];
  bllokuar: RevCandidate[];
  error?: string;
}

interface RevValidateData {
  validatedAt: string;
  durationSec: number;
  params: { universe: number; years: number };
  expectedProfile: { winRateRange: [number, number]; profitFactorRange: [number, number]; profitFactorSuspiciousAbove: number; annualCostDragPctRange: [number, number]; avgRPerTradeRange: [number, number] };
  backtest: {
    dataCoverage: { from: string; to: string };
    funnel: { symbolsRequested: number; symbolsWithData: number; tradingDays: number; signalsExamined: number; blockedBy8k: number; blockedBySpyCrash: number; blockedByNewLow: number; blockedByConfirmFail: number; blockedByCooldown: number; tradesTaken: number };
    tradesSample: Array<{ symbol: string; sector: string; signalDate: string; entryDate: string; exitDate: string; entry: number; stop: number; target: number; exitPrice: number; exitReason: string; rNet: number; madeNewLowAfterEntry: boolean }>;
  };
  is: { trades: number; profitFactor: number; winRate: number; maxDrawdownPct: number; totalR: number };
  oos: { trades: number; profitFactor: number; winRate: number; maxDrawdownPct: number; totalR: number };
  walkForward: Array<{ label: string; trades: number; netProfit: number; winRate: number }>;
  knifeRate: number;
  symbolConcentrationPct: number;
  costSensitivity: Record<string, number>;
  gates: Array<{ gateName: string; passed: boolean; detail: string }>;
  verdict: 'PASS' | 'REJECT';
  verdictNote: string;
  profileCheck: { winRateInRange: boolean; profitFactorInRange: boolean; suspiciouslyHighPf: boolean; note: string };
  error?: string;
}

const CTC_COMPARISON = [
  { dimension: 'Beti', ctc: 'Vazhdon lëvizja', rev: 'Kthehet mbrapsht lëvizja' },
  { dimension: 'Likuiditeti', ctc: 'Top kuintil (top 20%)', rev: 'Zona e mesme (20-80 percentile)' },
  { dimension: 'Regjimi i preferuar', ctc: 'Trending (ADX i lartë)', rev: 'Edhe në chop; kujdes te crash sistemik' },
  { dimension: 'Win rate i pritur', ctc: '~35-45%', rev: '~60-70% (profili i GLM-it)' },
  { dimension: 'R mesatar', ctc: 'I vogël pozitiv, R:R>1', rev: 'Target modest, win rate kompenson' },
  { dimension: 'Rreziku kryesor', ctc: 'Hyrje e vonuar', rev: '"Falling knife" — vazhdim i rënies' },
];

const fmtPct = (v: number, d = 1) => `${v >= 0 ? '' : ''}${v.toFixed(d)}%`;
const fmtMoney = (v: number) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

// ── Kartela e kandidatit ──────────────────────────────────────────────

function CandidateCard({ c, kind }: { c: RevCandidate; kind: 'hyrje' | 'prit' | 'bllokuar' }) {
  const border =
    kind === 'hyrje' ? 'border-emerald-500/40 bg-emerald-500/5' : kind === 'prit' ? 'border-amber-500/40 bg-amber-500/5' : 'border-red-500/30 bg-red-500/5';
  const statusLabel =
    c.status === 'HYRJE_TANI' ? 'HYRJE E KONFIRMUAR' :
    c.status === 'PRIT_KONFIRMIM' ? 'PRIT KONFIRMIMIN NESËR' :
    c.status === 'BLLOKUAR_8K' ? 'BLLOKUAR — 8-K MATERIAL' :
    c.status === 'BLLOKUAR_SPY_CRASH' ? 'BLLOKUAR — SPY CRASH' :
    c.status === 'INVALIDUAR_LOW_I_RI' ? 'INVALIDUAR — LOW I RI' :
    'KONFIRMIMI DËSHTOI';
  const slotBadge =
    c.slot === 'OPEN_OK' ? <Badge className="bg-emerald-600 text-white text-[9px]">SLOT OK</Badge> :
    c.slot === 'SEKTOR_PLOT' ? <Badge className="bg-amber-600 text-white text-[9px]">SEKTORI PLOT</Badge> :
    c.slot === 'MAX_POZICIONE' ? <Badge className="bg-red-600 text-white text-[9px]">MAX 3 POZICIONE</Badge> : null;

  return (
    <div className={`rounded-lg border p-3 ${border}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm">{c.symbol}</span>
          <span className="text-[10px] text-muted-foreground hidden sm:inline">{c.companyName}</span>
          <Badge variant="outline" className="text-[9px]">{c.sector}</Badge>
          {slotBadge}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-semibold ${c.ret3Pct <= -8 ? 'text-red-400' : 'text-amber-400'}`}>
            ret3d {fmtPct(c.ret3Pct)}
          </span>
          <span className="text-xs text-muted-foreground">RSI2 {c.rsi2.toFixed(0)}</span>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-center">
        <div className="rounded bg-muted/10 p-1">
          <p className="text-[9px] text-muted-foreground">Çmimi</p>
          <p className="text-xs font-bold">${c.price.toFixed(2)}</p>
        </div>
        <div className="rounded bg-muted/10 p-1">
          <p className="text-[9px] text-muted-foreground">Idio vs SPY</p>
          <p className={`text-xs font-bold ${c.idioSpreadPct < 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtPct(c.idioSpreadPct)}</p>
        </div>
        <div className="rounded bg-muted/10 p-1">
          <p className="text-[9px] text-muted-foreground">Stop (1.3×ATR)</p>
          <p className="text-xs font-bold text-red-400">${c.stop.toFixed(2)}</p>
        </div>
        <div className="rounded bg-muted/10 p-1">
          <p className="text-[9px] text-muted-foreground">Target (1.2R)</p>
          <p className="text-xs font-bold text-emerald-400">${c.target.toFixed(2)}</p>
        </div>
        <div className="rounded bg-muted/10 p-1">
          <p className="text-[9px] text-muted-foreground">ATR%</p>
          <p className="text-xs font-bold">{c.atrPct.toFixed(1)}%</p>
        </div>
        <div className="rounded bg-muted/10 p-1">
          <p className="text-[9px] text-muted-foreground">Likuid. pct</p>
          <p className="text-xs font-bold">{c.liquidityPctile}</p>
        </div>
      </div>

      {c.confirmation && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
          <span className={`px-1.5 py-0.5 rounded ${c.confirmation.greenCandle ? 'bg-emerald-500/15 text-emerald-400' : 'bg-muted/10 text-muted-foreground'}`}>
            {c.confirmation.greenCandle ? '✓' : '✗'} Green candle
          </span>
          <span className={`px-1.5 py-0.5 rounded ${c.confirmation.higherLow ? 'bg-emerald-500/15 text-emerald-400' : 'bg-muted/10 text-muted-foreground'}`}>
            {c.confirmation.higherLow ? '✓' : '✗'} Higher low
          </span>
          <span className={`px-1.5 py-0.5 rounded ${c.confirmation.volumeDeclining ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
            {c.confirmation.volumeDeclining ? '✓' : '✗'} Volum në rënie
          </span>
          {c.confirmation.newLow && <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">✗ LOW I RI — invalide</span>}
        </div>
      )}

      <ul className="mt-2 space-y-0.5">
        {c.reasons.map((r, i) => (
          <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1">
            <ArrowRight className="w-2.5 h-2.5 mt-0.5 flex-shrink-0 text-cyan-500" />{r}
          </li>
        ))}
        {c.warnings.map((w, i) => (
          <li key={`w${i}`} className="text-[10px] text-amber-400/90 flex items-start gap-1">
            <AlertTriangle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />{w}
          </li>
        ))}
        {c.gate8k?.blocked && (
          <li className="text-[10px] text-red-400 flex items-start gap-1">
            <Ban className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
            8-K material më {c.gate8k.lastFilingDate}{c.gate8k.items ? ` (items: ${c.gate8k.items})` : ''} — lajmi real, jo overreaction
          </li>
        )}
      </ul>

      {kind === 'hyrje' && (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
          <Layers className="w-3 h-3" />
          Sizing (0.5% risk / $25K assum.): {c.position.shares} aksione · rrezik {fmtMoney(c.position.riskDollars)} · notional {fmtMoney(c.position.notional)}
        </div>
      )}
      <div className="mt-1 text-[9px] text-muted-foreground/60">{statusLabel} · sinjal më {c.signalDate}</div>
    </div>
  );
}

// ── Komponenti kryesor ────────────────────────────────────────────────

export function REVStrategy() {
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<RevScanData | null>(null);
  const [scanErr, setScanErr] = useState('');

  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<RevValidateData | null>(null);
  const [valErr, setValErr] = useState('');
  const [valUniverse, setValUniverse] = useState(200);
  const [valYears, setValYears] = useState(3);

  const runScan = async () => {
    setScanning(true);
    setScanErr('');
    try {
      const res = await fetch('/api/rev-scan', { cache: 'no-store' });
      const data = (await res.json()) as RevScanData;
      if (data.error) setScanErr(data.error);
      else setScan(data);
    } catch {
      setScanErr('Skanimi dështoi — provo përsëri');
    } finally {
      setScanning(false);
    }
  };

  const runValidation = async () => {
    setValidating(true);
    setValErr('');
    setValidation(null);
    try {
      const res = await fetch(`/api/rev-validate?universe=${valUniverse}&years=${valYears}&force=1`, { cache: 'no-store' });
      const data = (await res.json()) as RevValidateData;
      if (data.error) setValErr(data.error);
      else setValidation(data);
    } catch {
      setValErr('Validimi dështoi — provo përsëri (ose zvogëlo universin)');
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <Card className="border-cyan-500/30 bg-cyan-500/5">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-cyan-400" />
              <h2 className="text-lg font-bold">REV v1 — Confirmed Short-Term Reversal</h2>
              <Badge className="bg-cyan-600 text-white text-[10px]">v1 · HIPOTEZË E NGRIRË</Badge>
            </div>
            <Badge variant="outline" className="text-[10px] border-cyan-500/40 text-cyan-400">
              <GitCompareArrows className="w-3 h-3 mr-1" /> Familje e VEÇANTË nga CTC (IBKR)
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Reversal 1-javor me <span className="text-cyan-400 font-semibold">konfirmim kundër &quot;falling knife&quot;</span> — univers
            me likuiditet <span className="text-cyan-400">mesatar (20-80 percentile)</span>, jo top-kuintil si CTC.
            Baza teorike: Lehmann (1990), Jegadeesh (1990), Nagel (2012). Parametrat janë{' '}
            <span className="inline-flex items-center gap-1 text-cyan-400 font-semibold"><Snowflake className="w-3 h-3" />të ngrirë</span> —
            s&apos;ndryshohen duke parë rezultatet; REJECT mbetet REJECT.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
            <span className="px-2 py-1 rounded bg-muted/15">Likuiditeti: 20-80 percentile · ≥$10M/ditë · ≥$10</span>
            <span className="px-2 py-1 rounded bg-muted/15">Sinjal: ret3d ≤ -8% OSE RSI(2) &lt; 10 · idiosinkratik vs SPY</span>
            <span className="px-2 py-1 rounded bg-muted/15">Gates: 8-K material brenda 2d → blloko · SPY ≤ -3% → blloko</span>
            <span className="px-2 py-1 rounded bg-muted/15">Konfirmim: green candle / higher low + volum në rënie</span>
            <span className="px-2 py-1 rounded bg-muted/15">Exit: stop 1.3×ATR14 · target 1.2R · time-stop 3d · max 5d</span>
            <span className="px-2 py-1 rounded bg-muted/15">Risk: 0.5%/tregti · max 3 pozicione · 1/sektor · cooldown 5d</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Dallimi nga CTC ── */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-2">
            <GitCompareArrows className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold">Dallimi themelor nga CTC v2 — mos i përziej</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border/50">
                  <th className="py-1.5 pr-3 font-medium"></th>
                  <th className="py-1.5 pr-3 font-medium text-emerald-400/80">CTC v2 (tab-i IBKR)</th>
                  <th className="py-1.5 font-medium text-cyan-400">REV v1 (ky tab)</th>
                </tr>
              </thead>
              <tbody>
                {CTC_COMPARISON.map((row) => (
                  <tr key={row.dimension} className="border-b border-border/30 last:border-0">
                    <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">{row.dimension}</td>
                    <td className="py-1.5 pr-3">{row.ctc}</td>
                    <td className="py-1.5 font-medium">{row.rev}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Metrikat e REV raportohen veç e veç (spec Seks. 9) — s&apos;përzihen kurrë me Validation Lab-in e CTC. Win rate
            i lartë s&apos;do të thotë &quot;më i mirë&quot; — krahaso Profit Factor dhe Expectancy neto.
          </p>
        </CardContent>
      </Card>

      {/* ── Skanimi live ── */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold">Skanimi Live — sinjale REV për sot</h3>
            </div>
            <button
              onClick={runScan}
              disabled={scanning}
              className="inline-flex items-center gap-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 transition-colors"
            >
              {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {scanning ? 'Po skanon… (deri ~2 min)' : 'Skano tani'}
            </button>
          </div>

          {scanErr && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-400 flex items-center gap-2">
              <XCircle className="w-4 h-4" />{scanErr}
            </div>
          )}

          {scanning && (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          )}

          {scan && !scanning && (
            <div className="space-y-3">
              {/* Regjimi */}
              <div className={`rounded-md border p-2.5 text-xs flex items-start gap-2 ${scan.regime.spyCrash ? 'border-red-500/50 bg-red-500/10 text-red-300' : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'}`}>
                <Gauge className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-semibold">SPY {fmtPct(scan.regime.spyLastMovePct, 2)} (3d: {fmtPct(scan.regime.spyRet3Pct)})</span> — {scan.regime.note}
                </div>
              </div>

              {/* Funnel */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-center">
                {[
                  { l: 'Univers', v: scan.universe.total },
                  { l: 'Me të dhëna', v: scan.universe.withData },
                  { l: 'Zona 20-80p', v: scan.universe.inZone },
                  { l: 'Hyrje tani', v: scan.counts.hyrjeTani },
                  { l: 'Prit konfirmim', v: scan.counts.pritKonfirmim },
                  { l: 'Bllokuar', v: scan.counts.bllokuar8k + scan.counts.bllokuarSpyCrash },
                ].map((s) => (
                  <div key={s.l} className="rounded-md bg-muted/10 p-1.5">
                    <p className="text-[9px] text-muted-foreground">{s.l}</p>
                    <p className="text-sm font-bold">{s.v}</p>
                  </div>
                ))}
              </div>

              {/* Hyrje të konfirmuara */}
              <div>
                <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Hyrje të konfirmuara ({scan.hyrjeTani.length})
                </p>
                {scan.hyrjeTani.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground bg-muted/5 rounded p-2">
                    Pa hyrje të konfirmuara sot — konform disiplinës: pa konfirmim, pa hyrje (kjo është veti, jo mangësi).
                  </p>
                ) : (
                  <div className="space-y-2">
                    {scan.hyrjeTani.map((c) => <CandidateCard key={c.symbol} c={c} kind="hyrje" />)}
                  </div>
                )}
              </div>

              {/* Prit konfirmim */}
              {scan.pritKonfirmim.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-amber-400" /> Prit konfirmimin nesër ({scan.pritKonfirmim.length})
                  </p>
                  <div className="space-y-2">
                    {scan.pritKonfirmim.map((c) => <CandidateCard key={c.symbol} c={c} kind="prit" />)}
                  </div>
                </div>
              )}

              {/* Bllokuar / invaliduar */}
              {scan.bllokuar.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                    <Ban className="w-3.5 h-3.5 text-red-400" /> Bllokuar / invaliduar ({scan.bllokuar.length})
                  </p>
                  <div className="space-y-2">
                    {scan.bllokuar.slice(0, 8).map((c) => <CandidateCard key={c.symbol + c.signalDate} c={c} kind="bllokuar" />)}
                  </div>
                </div>
              )}

              <p className="text-[9px] text-muted-foreground/60 flex items-center gap-1">
                <Info className="w-2.5 h-2.5" />
                Skanimi më {new Date(scan.scannedAt).toLocaleString('sq-AL')} · {scan.durationSec}s · {scan.hypothesis.noteSeparation}
              </p>
            </div>
          )}

          {!scan && !scanning && !scanErr && (
            <p className="text-[11px] text-muted-foreground bg-muted/5 rounded p-3">
              Shtyp <span className="font-semibold text-cyan-400">Skano tani</span> për të skanuar universin 400-emërat me
              filtra REV: zona e mesme e likuiditetit, rënie 3-ditore ≤ -8% ose RSI(2) &lt; 10, idiosinkratike vs SPY, pa 8-K
              material, pa crash SPY, pastaj konfirmim green candle / higher low me volum në rënie.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Validation Lab REV ── */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold">Validimi REV — IS / OOS / Walk-Forward + Falling-Knife</h3>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={valUniverse}
                onChange={(e) => setValUniverse(Number(e.target.value))}
                className="rounded-md bg-muted/20 border border-border text-xs px-2 py-1.5"
              >
                <option value={100}>Univers 100</option>
                <option value={200}>Univers 200</option>
                <option value={300}>Univers 300</option>
                <option value={400}>Univers 400</option>
              </select>
              <select
                value={valYears}
                onChange={(e) => setValYears(Number(e.target.value))}
                className="rounded-md bg-muted/20 border border-border text-xs px-2 py-1.5"
              >
                <option value={2}>2 vitet</option>
                <option value={3}>3 vitet</option>
                <option value={5}>5 vitet</option>
              </select>
              <button
                onClick={runValidation}
                disabled={validating}
                className="inline-flex items-center gap-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 transition-colors"
              >
                {validating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BarChart3 className="w-3.5 h-3.5" />}
                {validating ? 'Po validon… (deri ~5 min)' : 'Ekzekuto validimin'}
              </button>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground mb-2 flex items-start gap-1">
            <Shield className="w-3 h-3 mt-0.5 flex-shrink-0 text-cyan-500" />
            Kujtesë e disiplinës: parametrat e ngrirë — nëse verdikti del REJECT, MOS i shtrëngo pragjet derisa PASS.
            Krahaso kundrejt profilit REV (WR 60-70%), JO kundrejt profilit të CTC (35-45%).
          </p>

          {valErr && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-400 flex items-center gap-2">
              <XCircle className="w-4 h-4" />{valErr}
            </div>
          )}

          {validating && (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}

          {validation && !validating && (
            <div className="space-y-3">
              {/* Verdikti */}
              <div className={`rounded-lg border p-4 text-center ${validation.verdict === 'PASS' ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Verdikti i hipotezës REV v1</p>
                <p className={`text-3xl font-black mt-1 ${validation.verdict === 'PASS' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {validation.verdict}
                </p>
                <p className="text-xs text-muted-foreground mt-2 max-w-xl mx-auto">{validation.verdictNote}</p>
                <p className="text-[9px] text-muted-foreground/60 mt-1">
                  {validation.params.universe} emra · {validation.params.years} vjet · mbulimi {validation.backtest.dataCoverage.from} → {validation.backtest.dataCoverage.to} · {validation.durationSec}s
                </p>
              </div>

              {/* Metrikat IS/OOS */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                {[
                  { l: 'IS tregti', v: String(validation.is.trades), c: '' },
                  { l: 'IS PF', v: validation.is.profitFactor.toFixed(2), c: validation.is.profitFactor >= 1.3 ? 'text-emerald-400' : 'text-amber-400' },
                  { l: 'IS WR', v: `${(validation.is.winRate * 100).toFixed(0)}%`, c: '' },
                  { l: 'IS totalR', v: validation.is.totalR.toFixed(1), c: validation.is.totalR > 0 ? 'text-emerald-400' : 'text-red-400' },
                  { l: 'OOS tregti', v: String(validation.oos.trades), c: '' },
                  { l: 'OOS PF', v: validation.oos.profitFactor.toFixed(2), c: validation.oos.profitFactor >= 1.15 ? 'text-emerald-400' : 'text-amber-400' },
                  { l: 'OOS WR', v: `${(validation.oos.winRate * 100).toFixed(0)}%`, c: '' },
                  { l: 'OOS DD', v: `${validation.oos.maxDrawdownPct.toFixed(1)}%`, c: validation.oos.maxDrawdownPct <= 20 ? 'text-emerald-400' : 'text-red-400' },
                ].map((m) => (
                  <div key={m.l} className="rounded-md bg-muted/10 p-2">
                    <p className="text-[9px] text-muted-foreground">{m.l}</p>
                    <p className={`text-sm font-bold ${m.c}`}>{m.v}</p>
                  </div>
                ))}
              </div>

              {/* Kontrolli i profilit */}
              <div className="rounded-md border border-cyan-500/30 bg-cyan-500/5 p-2.5 text-[11px]">
                <p className="font-semibold text-cyan-300 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" /> Profili i pritshëm REV (60-70% WR)
                </p>
                <p className="text-muted-foreground mt-1">{validation.profileCheck.note}</p>
                {validation.profileCheck.suspiciouslyHighPf && (
                  <p className="text-amber-400 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> PF mbi {validation.expectedProfile.profitFactorSuspiciousAbove} = dyshim bias/bug — kontrollo para çdo konkluzioni.
                  </p>
                )}
              </div>

              {/* Gates */}
              <div>
                <p className="text-xs font-semibold mb-1.5">Portat e validimit (REV_GATES — të ngrira)</p>
                <div className="space-y-1">
                  {validation.gates.map((gt) => (
                    <div key={gt.gateName} className={`flex items-center gap-2 rounded px-2.5 py-1.5 text-xs ${gt.passed ? 'bg-emerald-500/8' : 'bg-red-500/8'}`}>
                      {gt.passed ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                      <span className="font-medium flex-shrink-0">{gt.gateName}:</span>
                      <span className="text-muted-foreground">{gt.detail}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Walk-forward */}
              <div>
                <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" /> Dritaret Walk-Forward
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-center">
                  {validation.walkForward.map((w) => (
                    <div key={w.label} className={`rounded-md p-1.5 ${w.netProfit > 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                      <p className="text-[9px] text-muted-foreground">{w.label.split(' (')[0]}</p>
                      <p className={`text-xs font-bold ${w.netProfit > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{w.netProfit.toFixed(1)}R</p>
                      <p className="text-[9px] text-muted-foreground">{w.trades} tregti · {(w.winRate * 100).toFixed(0)}% WR</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Funnel + falling knife */}
              <div className="grid sm:grid-cols-2 gap-2">
                <div className="rounded-md bg-muted/10 p-2.5 text-[11px] space-y-0.5">
                  <p className="font-semibold">Funnel-i i backtest-it</p>
                  <p className="text-muted-foreground">Simbole me të dhëna: {validation.backtest.funnel.symbolsWithData}/{validation.backtest.funnel.symbolsRequested} · ditë tregtimi: {validation.backtest.funnel.tradingDays}</p>
                  <p className="text-muted-foreground">Sinjale të shqyrtuara: {validation.backtest.funnel.signalsExamined} · tregti: {validation.backtest.funnel.tradesTaken}</p>
                  <p className="text-muted-foreground">Bllokime: 8-K {validation.backtest.funnel.blockedBy8k} · SPY crash {validation.backtest.funnel.blockedBySpyCrash} · low i ri {validation.backtest.funnel.blockedByNewLow} · konfirmim dështoi {validation.backtest.funnel.blockedByConfirmFail} · cooldown {validation.backtest.funnel.blockedByCooldown}</p>
                </div>
                <div className="rounded-md bg-muted/10 p-2.5 text-[11px] space-y-0.5">
                  <p className="font-semibold">Gate specifik REV</p>
                  <p className={validation.knifeRate <= 0.4 ? 'text-emerald-400' : 'text-red-400'}>
                    Falling-knife rate: <span className="font-bold">{(validation.knifeRate * 100).toFixed(0)}%</span> (kufiri 40%)
                  </p>
                  <p className="text-muted-foreground">Koncentrim top-3 simbole: {validation.symbolConcentrationPct.toFixed(1)}% (kufiri 60%)</p>
                  <p className="text-muted-foreground">PF me +10bp/krah: {validation.costSensitivity['10']?.toFixed(2) ?? '—'} (kufiri 1.05)</p>
                  {validation.knifeRate > 0.4 && (
                    <p className="text-amber-400">Gjetje SPECIFIKE: rishiko logjikën e konfirmimit (Sec. 3), jo target/stop.</p>
                  )}
                </div>
              </div>

              {/* Tregtitë e fundit */}
              {validation.backtest.tradesSample.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-1.5">Tregtitë më të fundit (kampion)</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="text-left text-muted-foreground border-b border-border/50">
                          <th className="py-1 pr-2 font-medium">Simboli</th>
                          <th className="py-1 pr-2 font-medium">Hyrja</th>
                          <th className="py-1 pr-2 font-medium">Dalja</th>
                          <th className="py-1 pr-2 font-medium">Entry</th>
                          <th className="py-1 pr-2 font-medium">Stop</th>
                          <th className="py-1 pr-2 font-medium">Target</th>
                          <th className="py-1 pr-2 font-medium">Exit</th>
                          <th className="py-1 pr-2 font-medium">Arsyeja</th>
                          <th className="py-1 pr-2 font-medium">R neto</th>
                          <th className="py-1 font-medium">Knife</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validation.backtest.tradesSample.slice(0, 15).map((t, i) => (
                          <tr key={t.symbol + t.entryDate + i} className="border-b border-border/20">
                            <td className="py-1 pr-2 font-semibold">{t.symbol}</td>
                            <td className="py-1 pr-2 text-muted-foreground">{t.entryDate}</td>
                            <td className="py-1 pr-2 text-muted-foreground">{t.exitDate}</td>
                            <td className="py-1 pr-2">${t.entry.toFixed(2)}</td>
                            <td className="py-1 pr-2 text-red-400/80">${t.stop.toFixed(2)}</td>
                            <td className="py-1 pr-2 text-emerald-400/80">${t.target.toFixed(2)}</td>
                            <td className="py-1 pr-2">${t.exitPrice.toFixed(2)}</td>
                            <td className="py-1 pr-2 text-muted-foreground">{t.exitReason}</td>
                            <td className={`py-1 pr-2 font-bold ${t.rNet > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{t.rNet.toFixed(2)}</td>
                            <td className="py-1">{t.madeNewLowAfterEntry ? <span className="text-amber-400">po</span> : <span className="text-muted-foreground">jo</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <p className="text-[9px] text-muted-foreground/60">
                Validuar më {new Date(validation.validatedAt).toLocaleString('sq-AL')} · Kosto/vit e pritur 3-6% · R mesatar i pritur 0.03-0.12 (shumë fitore të vogla)
              </p>
            </div>
          )}

          {!validation && !validating && !valErr && (
            <p className="text-[11px] text-muted-foreground bg-muted/5 rounded p-3">
              Ekzekuto validimin për backtest historik me portat e ngrira: IS/OOS (70/30), 5 dritare walk-forward,
              ndjeshmëria e kostos (+10bp), koncentrimi top-3, dhe gate-i specifik REV —{' '}
              <span className="font-semibold">falling-knife rate ≤ 40%</span>.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
