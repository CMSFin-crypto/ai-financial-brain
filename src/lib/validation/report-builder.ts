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
import type { BacktestVariant } from './backtest-engine';

export interface GateCheck {
  gate: string;
  description: string;
  required: string;
  actual: string;
  passed: boolean | null; // null = N/A (pritet live)
}

// ── Task 29: Walk-Forward kalendarike — 5 dritare train(5v) → test(1v) ──
export interface WfCalendarWindow {
  window: number;
  label: string;
  trainFrom: string; trainTo: string;
  testFrom: string; testTo: string;
  train: { trades: number; winRatePct: number; profitFactor: number; netProfit: number };
  test: { trades: number; winRatePct: number; profitFactor: number; expectancy: number; maxDrawdownPct: number; netProfit: number; avgR: number };
}

// ── Task 29: Krahasimi i universit (120 vs 400) — vetëm strategjia FULL (D) ──
export interface UniverseComparisonSide {
  size: number;
  /** numri total i sinjaleve (IS+OOS statike, varianti full) */
  signals: number;
  /** sinjale me score ≥ 80 (8+/10) */
  signalsScore80Plus: number;
  oos: MetricSet;
  /** test-i i agreguar i dritareve kalendarike */
  wfTest: MetricSet;
}

export interface UniverseComparison {
  primaryLabel: string;
  baselineLabel: string;
  primary: UniverseComparisonSide;
  baseline: UniverseComparisonSide;
  note: string;
}

// ── Task 29: Paper trading me event real (journal Top10 + EDGAR as-of) ──
export interface PaperSignalRecord {
  signalDate: string;
  /** të dhënat e disponueshme në momentin e sinjalit (EOD Yahoo + EDGAR) */
  dataAvailableAt: string;
  ticker: string;
  score: number | null;
  /** event score real as-of ditën e sinjalit (EDGAR 8-K 2.02) */
  eventScore: number | null;
  daysToEarnings: number | null;
  entry: number | null;
  stop: number | null;
  target: number | null;
  fillStatus: string | null;
  exitStatus: string | null;
  resultR: number | null;
  /** estimim i slippage sipas modelit të kostos (4bps + 1.2bps/ATR%) */
  slippageEstPct: number | null;
}

export interface PaperVsOos {
  paperTradesClosed: number;
  paperWinRatePct: number | null;
  paperExpectancyR: number | null;
  oosWinRatePct: number;
  oosAvgR: number;
  winRateDeviationPct: number | null;
  avgRDeviation: number | null;
  /** sinjale paper me earnings brenda 2 ditësh (event score -3) */
  eventSignalsNear: number;
  eventSignalsWithScore: number;
  enoughSample: boolean;
  note: string;
}

// ── Task 29: VERDIKTI AUTOMATIK — APPROVE / HOLD / REJECT ──
export interface FinalVerdictCriterion {
  key: string;
  label: string;
  required: string;
  actual: string;
  passed: boolean | null; // null = mostër e pamjaftueshme
}

export interface FinalVerdict {
  decision: 'APPROVE' | 'HOLD' | 'REJECT';
  criteria: FinalVerdictCriterion[];
  stableWindows: number;
  totalWindows: number;
  top3SymbolsProfitSharePct: number | null;
  paperDeviationPct: number | null;
  thresholds: {
    oosProfitFactor: number;
    maxDrawdownPct: number;
    minStableWindows: number;
    paperMaxDeviationPct: number;
    concentrationMaxPct: number;
  };
  note: string;
}

// ── Task 28: Testi A/B/C/D i Event Score (të njëjtat të dhëna, të njëjtat rregulla) ──
export interface VariantComparison {
  key: BacktestVariant;
  label: string;
  description: string;
  is: MetricSet;
  oos: MetricSet;
}

export interface EventScoreVerdict {
  /** ndryshimi i numrit të tregtive OOS: C kundrejt A (negative = më pak tregti) */
  oosTradesDelta: number;
  /** ndryshimi i expectancy OOS ($/tregti): C kundrejt A */
  oosExpectancyDelta: number;
  /** ndryshimi i win rate OOS (pikë përqindje): C kundrejt A */
  oosWinRateDelta: number;
  /** ndryshimi i max drawdown OOS (pikë përqindje): C kundrejt A (pozitiv = më mirë) */
  oosDrawdownDelta: number;
  /** rekomandimi: a ia vlen Event Score? */
  keep: boolean;
  note: string;
}

export interface EarningsDataInfo {
  symbolsWithTimeline: number;
  totalEvents: number;
  coveragePct: number;
  source: string;
}

// ── Task 26 Faza 2 — TESTI A/B: Technical-only kundrejt Technical + Fundamental ──
// Varianti A = 'full' (technical-only, NUK ndryshohet). Varianti B = 'full-fund'.
// Të njëjtat kushte teknike — ndryshimi i vetëm është filtri fundamental.

/** Njëra anë e krahasimit A/B fundamental (A, B standard ose B strict) */
export interface FundVariantSide {
  label: string;
  description: string;
  is: MetricSet;
  oos: MetricSet;
  /** sinjale teknike të bllokuara nga filtri (IS+OOS) */
  blockedSignals: number;
  /** sinjale që kaluan me ≥2 kontrolle pa të dhëna (vetëm standard — N/A ≠ FAIL) */
  naPassed: number;
}

/** Performca vjetore OOS: A kundrejt B — a mbështetet përmirësimi nga një vit i vetëm? */
export interface FundYearPerf {
  year: number;
  aNet: number;
  bNet: number;
  bTrades: number;
}

/** Dritare WF kalendarike: A kundrejt B në test-in e secilës dritare */
export interface FundWfWindow {
  label: string;
  testFrom: string;
  testTo: string;
  aNet: number;
  aTrades: number;
  bNet: number;
  bTrades: number;
  bPf: number;
}

export interface FundVerdict {
  /** keep = filtri bëhet pjesë e vendimit të sinjalit; false = mbetet vetëm kontekst */
  keep: boolean;
  criteria: FinalVerdictCriterion[];
  note: string;
}

export interface FundComparison {
  baselineLabel: string;
  /** A — Technical-only */
  a: FundVariantSide;
  /** B — Technical + Fundamental standard (N/A ≠ FAIL) */
  b: FundVariantSide;
  /** B-strict — kërkon të dhëna të plota pozitive (i matur, jo për vendim) */
  strict: FundVariantSide;
  perYear: FundYearPerf[];
  wfWindows: FundWfWindow[];
  /** top-3 simbolet si % e fitimit neto OOS të B (vetëm kur B > 0) */
  bTop3SymbolsProfitSharePct: number | null;
  /** arsyet e bllokimit (kodet FUND_* — IS+OOS të B standard) */
  blockedReasons: Record<string, number>;
  filterRules: { standard: string[]; strict: string[] };
  coverage: {
    symbolsWithData: number;
    universeSize: number;
    coveragePct: number;
    skippedForDeadline: number;
    source: string;
  };
  verdict: FundVerdict;
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
  /** Task 28 — testi A/B/C/D: baseline / event-filter / event-score / full */
  variants: VariantComparison[];
  /** verdikti i Event Score (C kundrejt A) */
  eventScoreVerdict: EventScoreVerdict;
  /** kalendarit real EDGAR — mbulimi */
  earningsData: EarningsDataInfo;
  /** Task 29 — dritaret kalendarike 5v train → 1v test (vetëm në run-et 10v) */
  wfCalendarWindows: WfCalendarWindow[];
  /** Task 29 — krahasimi i universit (120 vs 400), strategjia full */
  universeComparison: UniverseComparison | null;
  /** Task 29 — verdikti automatik APPROVE/HOLD/REJECT */
  finalVerdict: FinalVerdict;
  /** Task 29 — sinjalet e fundit paper me event score real */
  paperSignals: PaperSignalRecord[];
  /** Task 29 — krahasimi paper vs OOS */
  paperVsOos: PaperVsOos | null;
  /** Task 26 Faza 2 — testi rigoroz Technical-only vs Technical + Fundamental */
  fundComparison: FundComparison | null;
}

// ═══════════════════════════════════════════════════════════════
// Task 26 Faza 2 — VERDIKTI I FILTRIT FUNDAMENTAL (rregullat e userit)
//
// Mbaje filtrin fundamental VETËM nëse:
//   • përmirëson rezultatet në OOS (jo vetëm in-sample)
//   • expectancy rritet
//   • profit factor rritet ose mbetet i qëndrueshëm
//   • drawdown nuk rritet ndjeshëm
//   • rezultati nuk varet nga një vit ose disa aksione
//   • ka numër të mjaftueshëm tregtish
//
// Nëse B jep më pak tregti por cilësi më të mirë OOS → mund të jetë
// përmirësim. Nëse vetëm zvogëlon numrin pa rritur cilësinë →
// fundamentet mbeten VETËM si informacion në popup (Faza 1).
// ═══════════════════════════════════════════════════════════════
export function buildFundVerdict(params: {
  aOos: MetricSet;
  bOos: MetricSet;
  aIs: MetricSet;
  bIs: MetricSet;
  perYear: FundYearPerf[];
  bTop3SymbolsProfitSharePct: number | null;
}): FundVerdict {
  const { aOos, bOos, aIs, bIs, perYear, bTop3SymbolsProfitSharePct } = params;

  const expDelta = Math.round((bOos.expectancy - aOos.expectancy) * 100) / 100;
  const pfDelta = Math.round((bOos.profitFactor - aOos.profitFactor) * 100) / 100;
  const ddDelta = Math.round((bOos.maxDrawdownPct - aOos.maxDrawdownPct) * 10) / 10; // pozitiv = keq
  const tradesDelta = bOos.trades - aOos.trades;
  const netDelta = Math.round((bOos.netProfit - aOos.netProfit) * 100) / 100;
  const isExpDelta = Math.round((bIs.expectancy - aIs.expectancy) * 100) / 100;

  // vitet me përmirësim real (B më i mirë se A në vitin e daljes së tregtisë)
  const yearsWithTrades = perYear.filter(y => y.aNet !== 0 || y.bNet !== 0 || y.bTrades > 0);
  const improvementYears = yearsWithTrades.filter(y => y.bNet > y.aNet).length;

  const expUp = bOos.expectancy > aOos.expectancy;
  const pfStable = bOos.profitFactor >= aOos.profitFactor - 0.05;
  const ddOk = bOos.maxDrawdownPct <= aOos.maxDrawdownPct + 2.0;
  const tradesOk = bOos.trades >= 30 && bOos.trades >= 0.2 * aOos.trades;
  const yearOk = yearsWithTrades.length >= 2 ? improvementYears >= 2 : null;
  const concentrationOk = bTop3SymbolsProfitSharePct !== null
    ? bTop3SymbolsProfitSharePct <= 80
    : null; // pa vlerë kur B humb

  const criteria: FinalVerdictCriterion[] = [
    {
      key: 'expectancy',
      label: 'OOS expectancy rritet (B > A)',
      required: `> 0$ ndryshim`,
      actual: `${expDelta >= 0 ? '+' : ''}${expDelta}$/tregti (${aOos.expectancy.toFixed(2)} → ${bOos.expectancy.toFixed(2)})`,
      passed: expUp,
    },
    {
      key: 'profitFactor',
      label: 'OOS profit factor i qëndrueshëm',
      required: 'B ≥ A − 0.05',
      actual: `${bOos.profitFactor.toFixed(2)} kundrejt ${aOos.profitFactor.toFixed(2)} (${pfDelta >= 0 ? '+' : ''}${pfDelta})`,
      passed: pfStable,
    },
    {
      key: 'drawdown',
      label: 'Drawdown pa rritje të ndjeshme',
      required: 'B ≤ A + 2.0 pk',
      actual: `${bOos.maxDrawdownPct.toFixed(1)}% kundrejt ${aOos.maxDrawdownPct.toFixed(1)}% (${ddDelta >= 0 ? '+' : ''}${ddDelta} pk)`,
      passed: ddOk,
    },
    {
      key: 'trades',
      label: 'Numër i mjaftueshëm tregtish OOS',
      required: '≥ 30 dhe ≥ 20% e A-s',
      actual: `${bOos.trades} tregti (A: ${aOos.trades})`,
      passed: tradesOk,
    },
    {
      key: 'years',
      label: 'Përmirësimi nuk vjen nga një vit i vetëm',
      required: '≥ 2 vite me B > A',
      actual: yearsWithTrades.length >= 2
        ? `${improvementYears}/${yearsWithTrades.length} vite me B > A`
        : 'pa historian vjetor të mjaftueshëm',
      passed: yearOk,
    },
    {
      key: 'concentration',
      label: 'Fitimi i B jo i koncentruar',
      required: 'top-3 simbolet ≤ 80% (kur fitimi > 0)',
      actual: bTop3SymbolsProfitSharePct !== null
        ? `${bTop3SymbolsProfitSharePct.toFixed(0)}%`
        : 'B nuk ka fitim neto pozitiv — kriteri nuk aplikohet',
      passed: concentrationOk,
    },
  ];

  const required = criteria.filter(c => c.passed !== null);
  const keep = required.every(c => c.passed === true);

  const note = keep
    ? `FILTRI FUNDAMENTAL IA VLEN: ${tradesDelta <= 0 ? `${Math.abs(tradesDelta)} tregti më pak` : `${tradesDelta} tregti më shumë`} në OOS me expectancy ${expDelta >= 0 ? '+' : ''}${expDelta}$/tregti, PF ${pfDelta >= 0 ? '+' : ''}${pfDelta}, drawdown ${ddDelta <= 0 ? 'më i ulët' : `+${ddDelta}pk`}. Kalon si filtër i vërtetë në vendimin e sinjalit (Faza 3).`
    : `MBETET SI KONTEKST: ${tradesDelta < 0 ? `filtri reduktoi ${Math.abs(tradesDelta)} tregti OOS` : `filtri shtoi ${tradesDelta} tregti`} pa përmbushur kriteret e përmirësimit (expectancy ${expDelta >= 0 ? '+' : ''}${expDelta}$, PF ${pfDelta >= 0 ? '+' : ''}${pfDelta}, DD ${ddDelta >= 0 ? '+' : ''}${ddDelta}pk) — fundamentet vazhdojnë VETËM si panel informues në popup (Faza 1).`
      + (Math.abs(isExpDelta) > 0.01 ? ` IS: ${isExpDelta >= 0 ? '+' : ''}${isExpDelta}$ (përmirësimi duhet të mbahet në OOS, jo vetëm IS).` : '');

  return { keep, criteria, note };
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

// ═══════════════════════════════════════════════════════════════
// Task 29 — VERDIKTI AUTOMATIK (rregulla pune, jo garanci fitimi)
//
//   APPROVE  OOS PF ≥ 1.20 · expectancy pozitive · DD brenda kufirit ·
//            i qëndrueshëm në disa dritare · paper nuk devijon shumë
//   HOLD     rezultate pozitive por mostër e vogël, ose dallim i madh
//            mes OOS dhe paper
//   REJECT   expectancy negative · PF < 1 · DD shumë i lartë · fitimi
//            vjen nga një periudhë ose disa aksione
// ═══════════════════════════════════════════════════════════════
export function buildFinalVerdict(params: {
  oos: MetricSet;
  wfCalendarWindows: WfCalendarWindow[];
  trades: BacktestTrade[];
  paper: PaperVsOos | null;
  oosTradesCount: number;
}): FinalVerdict {
  const { oos, wfCalendarWindows, trades, paper } = params;
  const thresholds = {
    oosProfitFactor: 1.20,
    maxDrawdownPct: 25,
    minStableWindows: 3,
    paperMaxDeviationPct: 15,
    concentrationMaxPct: 80,
  };

  // ── 1. Qëndrueshmëria nëpër dritare (test-i vjetor pozitiv) ──
  const validWindows = wfCalendarWindows.filter(w => w.test.trades >= 5);
  const stableWindows = validWindows.filter(w => w.test.netProfit > 0 && w.test.profitFactor >= 1.0).length;
  const totalWindows = wfCalendarWindows.length;

  // ── 2. Koncentrimi i fitimit në disa aksione ──
  let top3SymbolsProfitSharePct: number | null = null;
  if (oos.netProfit > 0 && trades.length >= 10) {
    const bySym = new Map<string, number>();
    for (const t of trades) bySym.set(t.symbol, (bySym.get(t.symbol) || 0) + t.pnlNet);
    const tops = [...bySym.values()].sort((a, b) => b - a).slice(0, 3);
    top3SymbolsProfitSharePct =
      Math.round((tops.reduce((a, b) => a + b, 0) / oos.netProfit) * 1000) / 10;
  }

  // ── 3. Devijimi paper kundrejt OOS ──
  const paperDeviationPct = paper && paper.winRateDeviationPct !== null ? paper.winRateDeviationPct : null;

  // ── Kriteret (çdo rresht i tabelës së verdiktit) ──
  const criteria: FinalVerdictCriterion[] = [
    {
      key: 'oosPF',
      label: 'OOS profit factor',
      required: `≥ ${thresholds.oosProfitFactor.toFixed(2)}`,
      actual: oos.profitFactor.toFixed(2),
      passed: oos.profitFactor >= thresholds.oosProfitFactor,
    },
    {
      key: 'expectancy',
      label: 'OOS expectancy / tregti',
      required: '> 0$',
      actual: `${oos.expectancy >= 0 ? '+' : ''}${oos.expectancy.toFixed(2)}$`,
      passed: oos.expectancy > 0,
    },
    {
      key: 'drawdown',
      label: 'OOS max drawdown',
      required: `≤ ${thresholds.maxDrawdownPct}%`,
      actual: `${oos.maxDrawdownPct.toFixed(1)}%`,
      passed: oos.maxDrawdownPct <= thresholds.maxDrawdownPct,
    },
    {
      key: 'stability',
      label: 'I qëndrueshëm në dritare',
      required: `≥ ${thresholds.minStableWindows}/${totalWindows || 5} dritare test pozitive`,
      actual: totalWindows > 0 ? `${stableWindows}/${totalWindows} (me ≥ 5 tregti)` : 'pa dritare kalendarike',
      passed: totalWindows > 0 ? stableWindows >= thresholds.minStableWindows : null,
    },
    {
      key: 'paper',
      label: 'Paper nuk devijon shumë',
      required: `|WR paper − WR OOS| ≤ ${thresholds.paperMaxDeviationPct} pk (me ≥ 20 të mbyllura)`,
      actual: paper && paper.winRateDeviationPct !== null
        ? `dev ${paper.winRateDeviationPct >= 0 ? '+' : ''}${paper.winRateDeviationPct.toFixed(1)} pk (${paper.paperTradesClosed} të mbyllura)`
        : `mostër e pamjaftueshme (${paper ? paper.paperTradesClosed : 0} të mbyllura)`,
      passed: paper && paper.paperTradesClosed >= 20
        ? Math.abs(paper.winRateDeviationPct ?? 0) <= thresholds.paperMaxDeviationPct
        : null,
    },
    {
      key: 'concentration',
      label: 'Fitimi jo i koncentruar',
      required: `top-3 simbolet ≤ ${thresholds.concentrationMaxPct}% e fitimit OOS`,
      actual: top3SymbolsProfitSharePct !== null ? `${top3SymbolsProfitSharePct.toFixed(1)}%` : 'vetëm kur fitimi OOS > 0',
      passed: top3SymbolsProfitSharePct !== null ? top3SymbolsProfitSharePct <= thresholds.concentrationMaxPct : null,
    },
  ];

  // ── Vendimi: REJECT → APPROVE → HOLD ──
  const hardReject =
    oos.expectancy <= 0 ||
    oos.profitFactor < 1.0 ||
    oos.maxDrawdownPct > thresholds.maxDrawdownPct ||
    (top3SymbolsProfitSharePct !== null && top3SymbolsProfitSharePct > thresholds.concentrationMaxPct) ||
    (totalWindows > 0 && stableWindows <= 1);

  const paperFails = paper && paper.paperTradesClosed >= 20 && Math.abs(paper.winRateDeviationPct ?? 0) > thresholds.paperMaxDeviationPct;

  const approve =
    oos.profitFactor >= thresholds.oosProfitFactor &&
    oos.expectancy > 0 &&
    oos.maxDrawdownPct <= thresholds.maxDrawdownPct &&
    totalWindows > 0 &&
    stableWindows >= thresholds.minStableWindows &&
    !paperFails &&
    (top3SymbolsProfitSharePct === null || top3SymbolsProfitSharePct <= thresholds.concentrationMaxPct);

  const smallSample = params.oosTradesCount < 100;

  let decision: FinalVerdict['decision'];
  let note: string;
  if (hardReject) {
    decision = 'REJECT';
    const why: string[] = [];
    if (oos.expectancy <= 0) why.push(`expectancy negative (${oos.expectancy.toFixed(2)}$/tregti)`);
    if (oos.profitFactor < 1.0) why.push(`PF ${oos.profitFactor.toFixed(2)} < 1`);
    if (oos.maxDrawdownPct > thresholds.maxDrawdownPct) why.push(`drawdown ${oos.maxDrawdownPct.toFixed(1)}%`);
    if (top3SymbolsProfitSharePct !== null && top3SymbolsProfitSharePct > thresholds.concentrationMaxPct)
      why.push(`fitimi i koncentruar në 3 simbolet kryesore (${top3SymbolsProfitSharePct.toFixed(0)}%)`);
    if (totalWindows > 0 && stableWindows <= 1) why.push(`vetëm ${stableWindows}/${totalWindows} dritare test pozitive`);
    note = `REJECT: ${why.join(' · ')}. Strategjia nuk kalon kufijtë e punës — jo për tregti reale në këtë formë.`;
  } else if (approve) {
    decision = 'APPROVE';
    note = `APPROVE: OOS PF ${oos.profitFactor.toFixed(2)} ≥ 1.20, expectancy +${oos.expectancy.toFixed(2)}$/tregti, DD ${oos.maxDrawdownPct.toFixed(1)}%, ${stableWindows}/${totalWindows} dritare pozitive` +
      (paperFails === false && paper && paper.paperTradesClosed >= 20 ? `, paper brenda devijimit` : '') +
      `. Kalon te paper trading i vazhdueshëm para LIVE me 0.25% risk.`;
  } else {
    decision = 'HOLD';
    const why: string[] = [];
    if (oos.profitFactor < thresholds.oosProfitFactor && oos.profitFactor >= 1.0)
      why.push(`PF ${oos.profitFactor.toFixed(2)} nën 1.20 por mbi 1.0`);
    if (smallSample) why.push(`mostër OOS e vogël (${params.oosTradesCount} tregti)`);
    if (totalWindows > 0 && stableWindows > 1 && stableWindows < thresholds.minStableWindows)
      why.push(`qëndrueshmëria kufitare (${stableWindows}/${totalWindows} dritare)`);
    if (paperFails) why.push(`dallim i madh OOS ↔ paper (${paperDeviationPct?.toFixed(1)} pk)`);
    if (paper && paper.paperTradesClosed > 0 && paper.paperTradesClosed < 20)
      why.push(`paper ka vetëm ${paper.paperTradesClosed} rezultate të mbyllura`);
    note = `HOLD: ${why.length ? why.join(' · ') : 'kritere të pamezuara'}. Vazhdo paper trading dhe monitorim — jo ende për LIVE.`;
  }

  return {
    decision,
    criteria,
    stableWindows,
    totalWindows,
    top3SymbolsProfitSharePct,
    paperDeviationPct,
    thresholds,
    note,
  };
}
