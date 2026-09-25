// ═══════════════════════════════════════════════════════════════
// Task 27 — IBKR VALIDATION / metrics.ts
// Metrikat e standardit të backtest-it profesional:
//   numri i tregtive · win rate · profit factor · expectancy ·
//   fitimi neto · max drawdown · sipas score-it · sipas sektorit ·
//   continuation kundrejt fade
// ═══════════════════════════════════════════════════════════════

export interface BacktestTrade {
  symbol: string;
  sector: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  stop: number;
  target: number;
  shares: number;
  exitReason: string;
  /** R-multiple: fitimi / rreziku fillestar */
  r: number;
  /** PnL neto në $ (pas kostove) */
  pnlNet: number;
  pnlGross: number;
  costs: number;
  /** Dekompozimi i kostos së kësaj tregtie */
  costsBreakdown: {
    commission: number;
    spread: number;
    slippage: number;
    impact: number;
  };
  /** score final në momentin e sinjalit */
  score: number;
  /** 0-10 breakdown (confidence score) */
  scoreBreakdown: {
    trend: number; pullback: number; rs: number; volume: number;
    market: number; event: number; risk: number; final: number; max: number;
  };
  setupType: 'PULLBACK' | 'BREAKOUT' | 'TREND_CONT';
  /** equity pas kësaj tregtie */
  equityAfter: number;
}

export interface MetricSet {
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  profitFactor: number;
  /** $ mesatar për tregti */
  expectancy: number;
  /** R mesatar */
  avgR: number;
  netProfit: number;
  grossProfit: number;
  totalCosts: number;
  maxDrawdownPct: number;
  maxDrawdownDollars: number;
  avgHoldDays: number;
  /** fitim në % të kapitalit fillestar */
  returnPct: number;
  /** rrëshqitja e ekzekutimit si % e fitimit bruto */
  costDragPct: number;
  /** Task 26 Faza 2 — fitimi mesatar i fitimtarëve ($) */
  avgWin: number;
  /** humbja mesatare e humbësve ($) — pozitive si vlerë absolute */
  avgLoss: number;
  /** Task 26 Faza 2 — humbje radhazi: max korekutive të humbjura (tregti në rend kohor) */
  maxConsecutiveLosses: number;
}

export function computeMetrics(trades: BacktestTrade[], startEquity: number): MetricSet {
  if (trades.length === 0) {
    return {
      trades: 0, wins: 0, losses: 0, winRatePct: 0, profitFactor: 0,
      expectancy: 0, avgR: 0, netProfit: 0, grossProfit: 0, totalCosts: 0,
      maxDrawdownPct: 0, maxDrawdownDollars: 0, avgHoldDays: 0, returnPct: 0, costDragPct: 0,
      avgWin: 0, avgLoss: 0, maxConsecutiveLosses: 0,
    };
  }

  let wins = 0, losses = 0;
  let grossWin = 0, grossLoss = 0;
  let netProfit = 0, grossProfit = 0, totalCosts = 0, rSum = 0;
  let holdDaysSum = 0;

  // Max drawdown mbi ekuilibrin kumulativ
  let peak = startEquity;
  let maxDD = 0, maxDDPct = 0;

  // Humbje radhazi — max korekutive (tregti në rend kohor)
  let consecLosses = 0, maxConsecLosses = 0;

  for (const t of trades) {
    netProfit += t.pnlNet;
    grossProfit += t.pnlGross;
    totalCosts += t.costs;
    rSum += t.r;
    if (t.pnlNet > 0) { wins++; grossWin += t.pnlNet; consecLosses = 0; }
    else if (t.pnlNet < 0) {
      losses++; grossLoss += Math.abs(t.pnlNet);
      consecLosses++;
      if (consecLosses > maxConsecLosses) maxConsecLosses = consecLosses;
    }

    const days = Math.max(1, Math.round(
      (new Date(t.exitDate + 'T00:00:00Z').getTime() - new Date(t.entryDate + 'T00:00:00Z').getTime()) / 86400000,
    ));
    holdDaysSum += Math.min(days, 30);

    peak = Math.max(peak, t.equityAfter);
    const dd = peak - t.equityAfter;
    if (dd > maxDD) { maxDD = dd; maxDDPct = peak > 0 ? (dd / peak) * 100 : 0; }
  }

  const n = trades.length;
  return {
    trades: n,
    wins,
    losses,
    winRatePct: Math.round((wins / n) * 1000) / 10,
    profitFactor: grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : grossWin > 0 ? 99.99 : 0,
    expectancy: Math.round((netProfit / n) * 100) / 100,
    avgR: Math.round((rSum / n) * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    grossProfit: Math.round(grossProfit * 100) / 100,
    totalCosts: Math.round(totalCosts * 100) / 100,
    maxDrawdownPct: Math.round(maxDDPct * 10) / 10,
    maxDrawdownDollars: Math.round(maxDD * 100) / 100,
    avgHoldDays: Math.round((holdDaysSum / n) * 10) / 10,
    returnPct: startEquity > 0 ? Math.round((netProfit / startEquity) * 1000) / 10 : 0,
    costDragPct: grossProfit > 0 ? Math.round((totalCosts / Math.abs(grossProfit)) * 1000) / 10 : 0,
    avgWin: wins > 0 ? Math.round((grossWin / wins) * 100) / 100 : 0,
    avgLoss: losses > 0 ? Math.round((grossLoss / losses) * 100) / 100 : 0,
    maxConsecutiveLosses: maxConsecLosses,
  };
}

// ── Buketet e score-it: a janë sinjalet 8+ vërtet më të mira? ──
export interface ScoreBucket {
  label: string;
  minScore: number;
  maxScore: number;
  trades: number;
  winRatePct: number;
  avgR: number;
  netProfit: number;
}

export function scoreBuckets(trades: BacktestTrade[]): ScoreBucket[] {
  const defs = [
    { label: '45-54 (e dobët)', minScore: 45, maxScore: 54.99 },
    { label: '55-64', minScore: 55, maxScore: 64.99 },
    { label: '65-74', minScore: 65, maxScore: 74.99 },
    { label: '75-84', minScore: 75, maxScore: 84.99 },
    { label: '85+ (elite)', minScore: 85, maxScore: 1000 },
  ];
  return defs.map(d => {
    const ts = trades.filter(t => t.score >= d.minScore && t.score <= d.maxScore);
    const m = computeMetrics(ts, 1);
    return {
      label: d.label,
      minScore: d.minScore,
      maxScore: Math.min(d.maxScore, 100),
      trades: ts.length,
      winRatePct: m.winRatePct,
      avgR: m.avgR,
      netProfit: m.netProfit,
    };
  });
}

// ── Sipas sektorit ──
export interface SectorStat {
  sector: string;
  trades: number;
  winRatePct: number;
  avgR: number;
  netProfit: number;
}

export function sectorStats(trades: BacktestTrade[]): SectorStat[] {
  const bySec = new Map<string, BacktestTrade[]>();
  for (const t of trades) {
    if (!bySec.has(t.sector)) bySec.set(t.sector, []);
    bySec.get(t.sector)!.push(t);
  }
  return [...bySec.entries()]
    .map(([sector, ts]) => {
      const m = computeMetrics(ts, 1);
      return { sector, trades: ts.length, winRatePct: m.winRatePct, avgR: m.avgR, netProfit: m.netProfit };
    })
    .sort((a, b) => b.netProfit - a.netProfit);
}

// ── Continuation kundrejt fade ──
export interface SetupSplit {
  setupType: string;
  trades: number;
  winRatePct: number;
  avgR: number;
  netProfit: number;
}

export function setupSplit(trades: BacktestTrade[]): SetupSplit[] {
  const bySetup = new Map<string, BacktestTrade[]>();
  for (const t of trades) {
    if (!bySetup.has(t.setupType)) bySetup.set(t.setupType, []);
    bySetup.get(t.setupType)!.push(t);
  }
  return [...bySetup.entries()]
    .map(([setupType, ts]) => {
      const m = computeMetrics(ts, 1);
      return { setupType, trades: ts.length, winRatePct: m.winRatePct, avgR: m.avgR, netProfit: m.netProfit };
    })
    .sort((a, b) => b.trades - a.trades);
}
