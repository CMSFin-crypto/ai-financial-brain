// ═══════════════════════════════════════════════════════════════════
// REV v1 — Hipoteza e NGRIRË ("Confirmed Short-Term Reversal")
// ═══════════════════════════════════════════════════════════════════
// FAMILJE KREJT E RE (REV_*) — e VEÇANTË nga CTC v2 (trend continuation,
// tab-i IBKR). S'e ndryshon, s'e prek funnel-in e CTC, rendet paralel.
//
// Burimi i vërtetës: REV_v1_strategy_spec.md (rregullat e plota) dhe
// scripts/rev_v1_validator.py (kontrata e validimit Python).
//
// DISIPLINA: parametrat janë të NGRIRË — s'ndryshohen duke parë
// rezultatet. Nëse REV del REJECT, s'e "rregullohet" duke i shtrënguar
// pragjet derisa PASS (i njëjti gabim si me v1 e CTC).
//
// Baza teorike: Lehmann (1990), Jegadeesh (1990) — reversal 1-javor;
// Nagel (2012) — edge më i fortë te likuiditeti MESATAR (jo mega-cap,
// ku CTC operon).
// ═══════════════════════════════════════════════════════════════════

export const REV_HYPOTHESIS_VERSION = 1;

export interface RevChangeLogEntry {
  version: number;
  date: string;
  note: string;
}

export const REV_CHANGE_LOG: RevChangeLogEntry[] = [
  {
    version: 1,
    date: '2026-09-29',
    note:
      'REV v1 fillestare: reversal 1-javor me konfirmim 2-ditor kundër ' +
      'falling-knife, universe mesatar likuiditeti (20-80 percentile, jo ' +
      'top-kuintil si CTC), event-gate kundër lajmeve fondamentale reale, ' +
      'circuit-breaker kundër crash sistemik. E ndarë plotësisht nga CTC — ' +
      "s'e ndryshon, s'e prek funnel-in e saj.",
  },
];

// ── Hipoteza e ngrirë (pasqyrë 1:1 e REVHypothesis në rev_v1_validator.py) ──

export interface RevHypothesis {
  name: string;

  // Universi & likuiditeti (zona e mesme, JO top-kuintil si CTC)
  liquidityPercentileLow: number;
  liquidityPercentileHigh: number;
  liquidityLookbackDays: number;
  minPrice: number;
  minDollarVolumeFloor: number;

  // Sinjali i hyrjes
  min3DayCumReturnPct: number; // ose RSI(2) < rsi2Oversold
  rsi2Oversold: number;
  idiosyncraticVsSpyRequired: boolean; // rënia duhet MË E MADHE se SPY
  blockIfReal8kWithinDays: number; // event-gate real (EDGAR)
  blockIfSpyDailyMovePctBelow: number; // circuit-breaker crash

  // Konfirmimi (MBROJTJA kryesore kundër falling knife)
  requireGreenCandleOrHigherLow: boolean;
  requireVolumeDecliningOnConfirmation: boolean;
  invalidateIfNewLowOnConfirmationDay: boolean;

  // Exit — më i shkurtër/konservativ se CTC
  stopAtrMultiple: number;
  targetRMultiple: number;
  timeStopDays: number;
  maxHoldingDays: number;
  minHoldingDays: number;

  // Risk / sizing — më konservativ se CTC
  riskPerTradePct: number;
  maxOpenPositions: number;
  maxPositionsPerSector: number;
  symbolCooldownDays: number;

  // Kostot
  commissionPerShare: number;
  commissionMin: number;
  slippageBps: number; // pak më i lartë se CTC (likuiditet më i ulët)
  spreadBpsEstimate: number;
}

export const REV_HYPOTHESIS: RevHypothesis = {
  name: 'confirmed_short_term_reversal_v1',

  liquidityPercentileLow: 0.20,
  liquidityPercentileHigh: 0.80,
  liquidityLookbackDays: 20,
  minPrice: 10.0,
  minDollarVolumeFloor: 10_000_000.0,

  min3DayCumReturnPct: -8.0,
  rsi2Oversold: 10.0,
  idiosyncraticVsSpyRequired: true,
  blockIfReal8kWithinDays: 2,
  blockIfSpyDailyMovePctBelow: -3.0,

  requireGreenCandleOrHigherLow: true,
  requireVolumeDecliningOnConfirmation: true,
  invalidateIfNewLowOnConfirmationDay: true,

  stopAtrMultiple: 1.3,
  targetRMultiple: 1.2,
  timeStopDays: 3,
  maxHoldingDays: 5,
  minHoldingDays: 1,

  riskPerTradePct: 0.005,
  maxOpenPositions: 3,
  maxPositionsPerSector: 1,
  symbolCooldownDays: 5,

  commissionPerShare: 0.005,
  commissionMin: 1.0,
  slippageBps: 5.0,
  spreadBpsEstimate: 10.0,
};

// ── Profili i pritur — KËTU aplikohet 60-70% WR i GLM-it ─────────────
// Kujtesë: mos e krahaso REV kundër profilit CTC (35-45% WR) — janë
// familje strategjish të ndryshme me nënshkrime statistikore ndryshe.

export interface RevExpectedProfile {
  winRateRange: [number, number];
  profitFactorRange: [number, number];
  profitFactorSuspiciousAbove: number;
  annualCostDragPctRange: [number, number];
  avgRPerTradeRange: [number, number];
}

export const EXPECTED_PROFILE_REVERSAL: RevExpectedProfile = {
  winRateRange: [0.60, 0.70],
  profitFactorRange: [1.1, 1.5],
  profitFactorSuspiciousAbove: 2.0,
  annualCostDragPctRange: [3.0, 6.0],
  avgRPerTradeRange: [0.03, 0.12], // më i vogël se CTC — shumë fitore të vogla
};

// ── Portat e validimit (pasqyrë e REVValidationGates në Python) ───────

export interface RevValidationGates {
  minIsTrades: number;
  minIsProfitFactor: number;
  minOosProfitFactor: number;
  minOosTrades: number;
  minWfWindowsPositivePct: number;
  minTradesPerWfWindow: number;
  maxDrawdownPct: number;
  maxTop3SymbolProfitSharePct: number;
  maxIsOosWinrateDeviationPp: number;
  minPfAt10bpExtraCost: number;
  maxFallingKnifeRate: number;
}

export const FALLING_KNIFE_MAX_ACCEPTABLE = 0.40;

export const REV_GATES: RevValidationGates = {
  minIsTrades: 30,
  minIsProfitFactor: 1.3,
  minOosProfitFactor: 1.15,
  minOosTrades: 30,
  minWfWindowsPositivePct: 0.70,
  minTradesPerWfWindow: 8,
  maxDrawdownPct: 20.0,
  maxTop3SymbolProfitSharePct: 60.0,
  maxIsOosWinrateDeviationPp: 10.0,
  minPfAt10bpExtraCost: 1.05,
  maxFallingKnifeRate: FALLING_KNIFE_MAX_ACCEPTABLE,
};

// ── Vlerësimi i portave (pasqyrë e evaluate_rev_gates në Python) ──────

export interface GateResult {
  gateName: string;
  passed: boolean;
  detail: string;
}

export interface RevMetrics {
  trades: number;
  profitFactor: number;
  winRate: number; // 0..1
  maxDrawdownPct: number;
}

export interface WalkForwardWindowResult {
  label: string;
  trades: number;
  netProfit: number; // në R
  winRate: number;
}

export interface RevGateInput {
  isMetrics: RevMetrics;
  oosMetrics: RevMetrics;
  wfResults: WalkForwardWindowResult[];
  symbolProfitConcentrationPct: number;
  costSensitivityResults: Record<string, number>; // "10" → PF
  knifeRate: number;
}

export function evaluateRevGates(input: RevGateInput): {
  allPassed: boolean;
  results: GateResult[];
} {
  const g = REV_GATES;
  const {
    isMetrics,
    oosMetrics,
    wfResults,
    symbolProfitConcentrationPct,
    costSensitivityResults,
    knifeRate,
  } = input;

  const results: GateResult[] = [];

  // 1. IS trades & PF
  results.push({
    gateName: 'IS tregti & PF',
    passed: isMetrics.trades >= g.minIsTrades && isMetrics.profitFactor >= g.minIsProfitFactor,
    detail: `trades=${isMetrics.trades}, PF=${isMetrics.profitFactor.toFixed(2)} (kërkojmë ≥${g.minIsTrades}, ≥${g.minIsProfitFactor})`,
  });

  // 2. OOS PF & trades
  results.push({
    gateName: 'OOS PF & tregti',
    passed: oosMetrics.trades >= g.minOosTrades && oosMetrics.profitFactor >= g.minOosProfitFactor,
    detail: `trades=${oosMetrics.trades}, PF=${oosMetrics.profitFactor.toFixed(2)} (kërkojmë ≥${g.minOosTrades}, ≥${g.minOosProfitFactor})`,
  });

  // 3. Walk-forward consistency
  const validWindows = wfResults.filter((w) => w.trades >= g.minTradesPerWfWindow);
  const wfPositive = validWindows.filter((w) => w.netProfit > 0).length;
  const wfPct = validWindows.length ? wfPositive / validWindows.length : 0;
  results.push({
    gateName: 'Konsistenca Walk-Forward',
    passed: wfPct >= g.minWfWindowsPositivePct,
    detail: `${wfPositive}/${validWindows.length} dritare pozitive (${Math.round(wfPct * 100)}%; kërkojmë ≥${Math.round(g.minWfWindowsPositivePct * 100)}%)`,
  });

  // 4. Max drawdown
  results.push({
    gateName: 'Max drawdown',
    passed: oosMetrics.maxDrawdownPct <= g.maxDrawdownPct,
    detail: `${oosMetrics.maxDrawdownPct.toFixed(1)}% (kufiri ${g.maxDrawdownPct}%)`,
  });

  // 5. Profit concentration
  results.push({
    gateName: 'Koncentrimi i profilit',
    passed: symbolProfitConcentrationPct <= g.maxTop3SymbolProfitSharePct,
    detail: `top-3 = ${symbolProfitConcentrationPct.toFixed(1)}% (kufiri ${g.maxTop3SymbolProfitSharePct}%)`,
  });

  // 6. IS→OOS win-rate stability
  const wrDev = Math.abs(isMetrics.winRate - oosMetrics.winRate) * 100;
  results.push({
    gateName: 'Stabiliteti IS→OOS i win-rate',
    passed: wrDev <= g.maxIsOosWinrateDeviationPp,
    detail: `devijim ${wrDev.toFixed(1)}pp (kufiri ${g.maxIsOosWinrateDeviationPp}pp)`,
  });

  // 7. Cost sensitivity (+10bp)
  const pfAt10bp = costSensitivityResults['10'] ?? 0;
  results.push({
    gateName: 'Ndjeshmëria e kostos (+10bp)',
    passed: pfAt10bp >= g.minPfAt10bpExtraCost,
    detail: `PF=${pfAt10bp.toFixed(2)} me +10bp/krah (kufiri ${g.minPfAt10bpExtraCost})`,
  });

  // 8. Falling-knife rate — GATE SPECIFIK REV
  results.push({
    gateName: 'Falling-knife rate (specifik REV)',
    passed: knifeRate <= g.maxFallingKnifeRate,
    detail: `${Math.round(knifeRate * 100)}% e tregtive bënë low të ri pas hyrjes (kufiri ${Math.round(g.maxFallingKnifeRate * 100)}%)`,
  });

  const allPassed = results.every((r) => r.passed);
  return { allPassed, results };
}

// ── Dallimi themelor nga CTC (tabela e Seksionit 0 të spec-it) ────────

export const REV_VS_CTC_COMPARISON = [
  { dimension: 'Beti', ctc: 'Vazhdon lëvizja', rev: 'Kthehet mbrapsht lëvizja' },
  { dimension: 'Likuiditeti', ctc: 'Top kuintil (top 20%)', rev: 'Zona e mesme (20-80 percentile)' },
  { dimension: 'Regjimi i preferuar', ctc: 'Trending (ADX i lartë)', rev: 'Edhe në chop; kujdes te crash sistemik' },
  { dimension: 'Win rate i pritur', ctc: '~35-45%', rev: '~60-70%' },
  { dimension: 'R mesatar', ctc: 'I vogël pozitiv, R:R>1', rev: 'Target modest, win rate kompenson' },
  { dimension: 'Rreziku kryesor', ctc: 'Hyrje e vonuar', rev: '"Falling knife" — vazhdim i rënies' },
];
