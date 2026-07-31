// ============================================================
// Monte Carlo Robustness — resampling engine for strategy evaluation.
//
// A single backtest is one path. Monte Carlo shows the DISTRIBUTION
// of outcomes by randomizing trade order, adding slippage jitter,
// and resampling returns. This reveals tail risk that averages hide.
//
// Key outputs:
//   - P5 / P50 / P95 final equity
//   - P95 max drawdown (the real constraint)
//   - Probability of profit / ruin
//   - Robustness score (0-100)
//
// Usage: feed actual trade results from DB, get distribution.
// ============================================================

import prisma from './prisma';

// ─── Types ────────────────────────────────────────────────────

export type TradeRecord = {
  returnPct: number;   // e.g. 1.5 for +1.5%
  riskPct?: number;    // % of equity risked (for drawdown calc)
  timestamp?: number;  // epoch ms (for ordered bootstrap)
};

export type SimulationPath = {
  pathIndex: number;
  finalEquity: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  maxDrawdownDuration: number; // in trades
  sharpeRatio: number;
  profitFactor: number;
  trades: number;
};

export type MonteCarloResult = {
  config: {
    numSimulations: number;
    startingEquity: number;
    tradeCount: number;
    slippageJitterBps: number;
    method: 'shuffle' | 'bootstrap' | 'parametric';
  };
  // Distribution of final equity
  finalEquityP5: number;
  finalEquityP50: number;
  finalEquityP95: number;
  // Return distribution
  returnP5: number;
  returnP50: number;
  returnP95: number;
  // Drawdown distribution (the critical one)
  maxDrawdownP50: number;
  maxDrawdownP95: number;
  maxDrawdownP99: number;
  // Risk metrics
  probabilityOfProfit: number;   // % of paths with final equity > starting
  probabilityOfRuin: number;     // % of paths that draw down > 50%
  avgSharpe: number;
  sharpeP5: number;
  // Robustness
  robustnessScore: number;       // 0-100
  robustnessLevel: 'STRONG' | 'ADEQUATE' | 'MARGINAL' | 'WEAK' | 'FAIL';
  warnings: string[];
};

export type MonteCarloConfig = {
  numSimulations?: number;       // default 2000
  startingEquity?: number;      // default 25000
  slippageJitterBps?: number;   // default 3 (add random ±3 bps per trade)
  method?: 'shuffle' | 'bootstrap' | 'parametric';
  ruinThresholdPct?: number;    // default 50 (ruin = drawdown > 50%)
  maxDrawdownLimitPct?: number; // default 25 (fail if P95 DD > this)
};

const DEFAULT_MC_CONFIG: Required<MonteCarloConfig> = {
  numSimulations: 2000,
  startingEquity: 25000,
  slippageJitterBps: 3,
  method: 'shuffle',
  ruinThresholdPct: 50,
  maxDrawdownLimitPct: 25,
};

// ─── Helpers ────────────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stdDev(arr: number[], avg: number): number {
  if (arr.length < 2) return 0;
  return Math.sqrt(arr.reduce((s, v) => s + (v - avg) ** 2, 0) / (arr.length - 1));
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

/** Fisher-Yates shuffle (in-place) */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Block bootstrap: sample blocks of consecutive trades to preserve autocorrelation */
function blockBootstrap(trades: TradeRecord[], blockSize = 5): TradeRecord[] {
  const result: TradeRecord[] = [];
  while (result.length < trades.length) {
    const startIdx = Math.floor(Math.random() * (trades.length - blockSize + 1));
    const block = trades.slice(startIdx, startIdx + blockSize);
    result.push(...block);
  }
  return result.slice(0, trades.length);
}

/** Parametric: generate synthetic returns from observed mean + std */
function parametricSample(trades: TradeRecord[]): TradeRecord[] {
  const returns = trades.map(t => t.returnPct);
  const avg = mean(returns);
  const sd = stdDev(returns, avg);
  return trades.map(t => ({
    ...t,
    returnPct: avg + (Math.random() + Math.random() + Math.random() - 1.5) * sd * 1.2,
  }));
}

/** Add random slippage jitter to each trade */
function addSlippageJitter(trades: TradeRecord[], jitterBps: number): TradeRecord[] {
  return trades.map(t => {
    // Random bps between -jitter and +jitter
    const jitter = (Math.random() * 2 - 1) * jitterBps / 100; // convert bps to %
    return { ...t, returnPct: t.returnPct - jitter };
  });
}

// ─── Single Path Simulation ───────────────────────────────────

function simulatePath(
  trades: TradeRecord[],
  startingEquity: number,
  ruinThresholdPct: number,
  pathIndex: number,
): SimulationPath {
  let equity = startingEquity;
  const equityCurve: number[] = [equity];
  const returnList: number[] = [];
  let peak = equity;
  let maxDD = 0;
  let maxDDDuration = 0;
  let currentDDDuration = 0;
  let inDrawdown = false;
  let grossProfit = 0;
  let grossLoss = 0;

  for (const trade of trades) {
    const pnl = equity * (trade.returnPct / 100);
    equity += pnl;
    equity = Math.max(0.01, equity); // prevent negative equity
    equityCurve.push(equity);
    returnList.push(trade.returnPct);

    if (pnl > 0) grossProfit += pnl;
    else grossLoss += Math.abs(pnl);

    // Drawdown tracking
    if (equity > peak) {
      peak = equity;
      inDrawdown = false;
      currentDDDuration = 0;
    } else {
      const dd = (peak - equity) / peak * 100;
      if (dd > maxDD) maxDD = dd;
      if (dd > 0.5) {
        if (!inDrawdown) { inDrawdown = true; currentDDDuration = 0; }
        currentDDDuration++;
        if (currentDDDuration > maxDDDuration) maxDDDuration = currentDDDuration;
      } else {
        inDrawdown = false;
        currentDDDuration = 0;
      }
    }

    // Early exit if ruined
    if (equity < startingEquity * (1 - ruinThresholdPct / 100)) break;
  }

  // Compute Sharpe for this path
  const avgReturn = mean(returnList);
  const sdReturn = stdDev(returnList, avgReturn);
  const sharpe = sdReturn > 0 ? (avgReturn / sdReturn) * Math.sqrt(252) : 0;

  const totalReturnPct = ((equity - startingEquity) / startingEquity) * 100;

  return {
    pathIndex,
    finalEquity: Math.round(equity * 100) / 100,
    totalReturnPct: Math.round(totalReturnPct * 100) / 100,
    maxDrawdownPct: Math.round(maxDD * 100) / 100,
    maxDrawdownDuration,
    sharpeRatio: Math.round(sharpe * 100) / 100,
    profitFactor: grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : 99,
    trades: returnList.length,
  };
}

// ─── Core: Run Monte Carlo ────────────────────────────────────

export function runMonteCarlo(
  trades: TradeRecord[],
  config?: MonteCarloConfig,
): MonteCarloResult {
  const cfg = { ...DEFAULT_MC_CONFIG, ...config };

  if (trades.length < 10) {
    return {
      config: { ...cfg, tradeCount: trades.length },
      finalEquityP5: 0, finalEquityP50: 0, finalEquityP95: 0,
      returnP5: 0, returnP50: 0, returnP95: 0,
      maxDrawdownP50: 0, maxDrawdownP95: 0, maxDrawdownP99: 0,
      probabilityOfProfit: 0, probabilityOfRuin: 0,
      avgSharpe: 0, sharpeP5: 0,
      robustnessScore: 0, robustnessLevel: 'FAIL',
      warnings: ['Insufficient trade data for Monte Carlo'],
    };
  }

  const warnings: string[] = [];
  const paths: SimulationPath[] = [];

  for (let i = 0; i < cfg.numSimulations; i++) {
    let sampled: TradeRecord[];

    switch (cfg.method) {
      case 'bootstrap':
        sampled = blockBootstrap(trades);
        break;
      case 'parametric':
        sampled = parametricSample(trades);
        break;
      default:
        sampled = shuffle(trades);
    }

    // Add slippage jitter
    sampled = addSlippageJitter(sampled, cfg.slippageJitterBps);

    const path = simulatePath(sampled, cfg.startingEquity, cfg.ruinThresholdPct, i);
    paths.push(path);
  }

  // --- Aggregate statistics ---
  const finalEquities = paths.map(p => p.finalEquity).sort((a, b) => a - b);
  const returns = paths.map(p => p.totalReturnPct).sort((a, b) => a - b);
  const drawdowns = paths.map(p => p.maxDrawdownPct).sort((a, b) => a - b);
  const sharpes = paths.map(p => p.sharpeRatio).sort((a, b) => a - b);

  const profitCount = paths.filter(p => p.finalEquity > cfg.startingEquity).length;
  const ruinCount = paths.filter(p => p.maxDrawdownPct >= cfg.ruinThresholdPct).length;

  const probProfit = profitCount / paths.length;
  const probRuin = ruinCount / paths.length;

  // --- Robustness Score (0-100) ---
  // Based on: profit probability, P95 drawdown vs limit, Sharpe consistency
  let score = 0;

  // Profit probability (0-35 points)
  score += Math.min(35, probProfit * 40);

  // P95 drawdown vs limit (0-35 points)
  // If P95 DD < 50% of limit → full points
  // If P95 DD > limit → 0 points
  const p95DD = percentile(drawdowns, 95);
  const ddRatio = p95DD / cfg.maxDrawdownLimitPct;
  if (ddRatio <= 0.5) score += 35;
  else if (ddRatio <= 0.8) score += 25;
  else if (ddRatio <= 1.0) score += 15;
  else score += 0;

  // Sharpe consistency (0-30 points)
  // P5 Sharpe should still be positive
  const sharpeP5 = percentile(sharpes, 5);
  if (sharpeP5 > 0.5) score += 30;
  else if (sharpeP5 > 0) score += 20;
  else if (sharpeP5 > -0.5) score += 10;
  else score += 0;

  score = Math.min(100, Math.round(score));

  // Determine level
  const robustnessLevel:
    | 'STRONG' | 'ADEQUATE' | 'MARGINAL' | 'WEAK' | 'FAIL' =
    score >= 75 ? 'STRONG'
      : score >= 55 ? 'ADEQUATE'
        : score >= 35 ? 'MARGINAL'
          : score >= 15 ? 'WEAK'
          : 'FAIL';

  // Warnings
  if (p95DD > cfg.maxDrawdownLimitPct) {
    warnings.push(`P95 drawdown ${p95DD.toFixed(1)}% exceeds ${cfg.maxDrawdownLimitPct}% limit`);
  }
  if (probRuin > 0.05) {
    warnings.push(`Ruin probability ${(probRuin * 100).toFixed(1)}% > 5%`);
  }
  if (probProfit < 0.55) {
    warnings.push(`Profit probability only ${(probProfit * 100).toFixed(1)}%`);
  }
  if (sharpeP5 < 0) {
    warnings.push('P5 Sharpe is negative — tail risk of losses');
  }

  return {
    config: { ...cfg, tradeCount: trades.length },
    finalEquityP5: Math.round(percentile(finalEquities, 5) * 100) / 100,
    finalEquityP50: Math.round(percentile(finalEquities, 50) * 100) / 100,
    finalEquityP95: Math.round(percentile(finalEquities, 95) * 100) / 100,
    returnP5: Math.round(percentile(returns, 5) * 100) / 100,
    returnP50: Math.round(percentile(returns, 50) * 100) / 100,
    returnP95: Math.round(percentile(returns, 95) * 100) / 100,
    maxDrawdownP50: Math.round(percentile(drawdowns, 50) * 100) / 100,
    maxDrawdownP95: Math.round(p95DD * 100) / 100,
    maxDrawdownP99: Math.round(percentile(drawdowns, 99) * 100) / 100,
    probabilityOfProfit: Math.round(probProfit * 10000) / 100,
    probabilityOfRuin: Math.round(probRuin * 10000) / 100,
    avgSharpe: Math.round(mean(sharpes) * 100) / 100,
    sharpeP5: Math.round(sharpeP5 * 100) / 100,
    robustnessScore: score,
    robustnessLevel,
    warnings,
  };
}

// ─── DB-backed: Load trades and run MC ────────────────────────

export async function runMonteCarloFromDB(
  modelVersion = 'predict-v3-regime-spillover',
  days = 90,
  config?: MonteCarloConfig,
): Promise<MonteCarloResult> {
  const since = new Date(Date.now() - days * 86400000);

  const preds = await prisma.prediction.findMany({
    where: {
      modelVersion,
      actualReturn: { not: null },
      predictedAt: { gte: since },
    },
    orderBy: { predictedAt: 'asc' },
    select: {
      actualReturn: true,
      entryPrice: true,
      finalDecision: true,
    },
    take: 5000,
  });

  // Only include BUY/SELL decisions (not HOLD/NO_TRADE)
  const trades: TradeRecord[] = preds
    .filter(p => p.finalDecision === 'BUY' || p.finalDecision === 'SELL')
    .map(p => ({
      returnPct: (p.actualReturn as number) * (p.finalDecision === 'SELL' ? -1 : 1),
      riskPct: 1, // simplified; real implementation uses stop distance
    }));

  return runMonteCarlo(trades, config);
}
