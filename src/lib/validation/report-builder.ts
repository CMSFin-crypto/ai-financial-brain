// ═══════════════════════════════════════════════════════════════
// Task 27 — IBKR VALIDATION / report-builder.ts
// Ndërton raportin final të validimit:
//
//   IBKR Validation
//   ├── In-Sample
//   ├── Out-of-Sample
//   ├── Walk-Forward
//   ├── Paper Trading
//   └── Live Performance
//
//   + Paper-Trading Gate (para urdhrit live):
//     backtest → OOS → walk-forward → 50-100 paper trades →
//     kontroll slippage → live me 0.25% risk
//   + Auto-pause kur performanca live largohet shumë nga OOS
// ═══════════════════════════════════════════════════════════════
import { BacktestTrade, MetricSet, computeMetrics, scoreBuckets, sectorStats, setupSplit } from './metrics';
import { SurvivorshipReport } from './universe-history';
import { CostAssumptions } from './cost-model';

export interface GateCheck {
  gate: string;
  description: string;
  required: string;
  actual: string;
  passed: boolean | null; // null = N/A (pritet live)
}

export interface ValidationReport {
  generatedAt: string;
  period: { from: string; to: string; days: number; isDays: number; oosDays: number };
  universe: {
    size: number;
    symbols: string[];
    survivorship: SurvivorshipReport;
  };
  equity: { startEquity: number; finalEquity: number };
  /** Tabela kryesore: rreshtat = metrikat, kolonat = IS / OOS / WF / Paper / Live */
  table: {
    inSample: MetricSet;
    outOfSample: MetricSet;
    walkForward: MetricSet;          // OOS e bashkuar e 4 dritareve
    paper: MetricSet | null;         // nga journal-i live (nëse ka)
    live: MetricSet | null;          // ende pa eksport real
  };
  walkForwardWindows: {
    window: number;
    from: string; to: string;
    trades: number; winRatePct: number; avgR: number; netProfit: number;
  }[];
  /** Rezultatet sipas score-it (a janë sinjalet 8+ vërtet më të mira?) */
  scoreBuckets: ReturnType<typeof scoreBuckets>;
  sectorStats: ReturnType<typeof sectorStats>;
  setupSplit: ReturnType<typeof setupSplit>;
  /** Kosto totale të simuluara */
  costs: {
    assumptions: CostAssumptions;
    totalCosts: number;
    commissionTotal: number;
    spreadTotal: number;
    slippageTotal: number;
    impactTotal: number;
    costDragPct: number;
  };
  execution: {
    signalsGenerated: number;
    entryOrdersRejected: number;
    rejectReasons: Record<string, number>;
    /** distribucioni i daljeve */
    exitReasons: Record<string, number>;
  };
  /** Pipeline: backtest → OOS → WF → paper → live */
  gates: GateCheck[];
  /** Auto-pause: rekomandim mbi bazën e deviacionit OOS vs IS */
  autoPause: {
    winRateDeviationPct: number;
    avgRDeviation: number;
    thresholdWinRateDevPct: number;
    recommendation: 'OK' | 'MONITOR' | 'PAUSE';
    note: string;
  };
  topTrades: BacktestTrade[];
  worstTrades: BacktestTrade[];
  limitations: string[];
}

export function buildGateChecks(params: {
  is: MetricSet;
  oos: MetricSet;
  wf: MetricSet;
  paperTradesCount: number;
  slippageEstimatePct: number;
  oosWinRate: number;
  isWinRate: number;
}): GateCheck[] {
  const { is, oos, wf, paperTradesCount, slippageEstimatePct } = params;
  const backtestPositive = is.netProfit > 0 && is.profitFactor >= 1.3 && is.trades >= 20;
  const oosPositive = oos.netProfit > 0 && oos.profitFactor >= 1.1;
  const wfPositive = wf.trades >= 10 && wf.winRatePct >= Math.max(35, is.winRatePct - 25);
  const paperEnough = paperTradesCount >= 50;
  const slippageOk = slippageEstimatePct <= 0.35; // kosto totale per tregti ≤ 0.35% të pozicionit

  return [
    {
      gate: '1. Backtest pozitiv',
      description: 'Fitim neto pozitiv, PF ≥ 1.3, ≥ 20 tregti in-sample',
      required: 'netProfit > 0, PF ≥ 1.3, trades ≥ 20',
      actual: `net $${is.netProfit.toFixed(0)}, PF ${is.profitFactor}, ${is.trades} tregti`,
      passed: backtestPositive,
    },
    {
      gate: '2. OOS pozitiv',
      description: 'Out-of-sample (30% e fundit) mban fitim dhe PF ≥ 1.1',
      required: 'netProfit > 0, PF ≥ 1.1',
      actual: `net $${oos.netProfit.toFixed(0)}, PF ${oos.profitFactor}, ${oos.trades} tregti`,
      passed: oosPositive,
    },
    {
      gate: '3. Walk-forward pozitiv',
      description: '4 dritare OOS rrëshqitëse: së paku 10 tregti dhe win rate jo më shumë se 25pk nën IS',
      required: 'trades ≥ 10, WR ≥ max(35%, IS−25pk)',
      actual: `${wf.trades} tregti, WR ${wf.winRatePct}% (IS ${is.winRatePct}%)`,
      passed: wfPositive,
    },
    {
      gate: '4. Paper trading',
      description: '50–100 paper trades përpara çdo urdhri live (IBKR Paper me kushte reale tregu)',
      required: '≥ 50 paper trades',
      actual: `${paperTradesCount} paper trades`,
      passed: paperTradesCount === 0 ? null : paperEnough,
    },
    {
      gate: '5. Kontroll slippage',
      description: 'Kosto totale e ekzekutimit (komision+spread+slippage+impact) nën 0.35% të pozicionit',
      required: '≤ 0.35%',
      actual: `${slippageEstimatePct.toFixed(3)}%`,
      passed: slippageOk,
    },
    {
      gate: '6. LIVE me 0.25% risk',
      description: 'Vetëm pas gates 1-5: rreziku real për tregti gjysmë i rrezikut të backtest-it (1% → 0.25%)',
      required: 'gates 1-5 kaluar',
      actual: 'pritet aktivizimi manual',
      passed: null,
    },
  ];
}

export function buildAutoPause(params: {
  is: MetricSet;
  oos: MetricSet;
}): ValidationReport['autoPause'] {
  const { is, oos } = params;
  const wrDev = oos.winRatePct - is.winRatePct;
  const rDev = Math.round((oos.avgR - is.avgR) * 100) / 100;

  let recommendation: 'OK' | 'MONITOR' | 'PAUSE' = 'OK';
  if (oos.trades >= 10 && wrDev <= -20) recommendation = 'PAUSE';
  else if (oos.trades >= 10 && wrDev <= -10) recommendation = 'MONITOR';

  const note =
    recommendation === 'PAUSE'
      ? `AUTO-PAUSE: OOS (${oos.winRatePct}%) bie ${Math.abs(wrDev)} pikë nën IS (${is.winRatePct}%) — strategjia është tepër e optimizuar. Ndalo tregtimin live dhe rishiko parametrat.`
      : recommendation === 'MONITOR'
        ? `MONITOR: devijim i moderuar ${wrDev} pikë IS→OOS. Vazhdo me paper trading dhe kontrollo çdo javë.`
        : `OK: OOS (${oos.winRatePct}%) vs IS (${is.winRatePct}%) — devijim ${wrDev} pikë. Devijimi i pranueshëm (≤ 10 pk) tregon se strategjia nuk është vetëm rezultat i optimizimit.`;

  return {
    winRateDeviationPct: Math.round(wrDev * 10) / 10,
    avgRDeviation: rDev,
    thresholdWinRateDevPct: -20,
    recommendation,
    note,
  };
}
