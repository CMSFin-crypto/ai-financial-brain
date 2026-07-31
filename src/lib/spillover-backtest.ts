// ============================================================
// Spillover Backtest
// Walk-forward 1-year backtest of the spillover engine.
// For each trading day, computes the spillover score and simulates:
//   RELIEF_RALLY  → long next open
//   CONTINUATION  → short or no-trade
//   NEUTRAL       → no-trade
// Applies realistic costs: 0.1% commission + 0.05% slippage + 0.05% spread
// ============================================================

import { computeSpilloverFromDrivers, type SpilloverSetup } from './global-spillover';
import { getMarketHistory, pctChange, type EnrichedMarketData } from './global-market-data';

// ─── Cost model ───────────────────────────────────────────────

const COMMISSION_PCT = 0.10;
const SLIPPAGE_PCT = 0.05;
const SPREAD_PCT = 0.05;
const ROUND_TRIP_COST_PCT = COMMISSION_PCT + SLIPPAGE_PCT + SPREAD_PCT; // 0.20%

// ─── Types ─────────────────────────────────────────────────────

export interface BacktestTrade {
  date: string;           // signal date
  entryDate: string;      // next trading day
  exitDate: string;       // exit trading day
  setupType: SpilloverSetup;
  direction: 'LONG' | 'SHORT' | 'NONE';
  entryPrice: number;
  exitPrice: number;
  grossReturnPct: number;
  netReturnPct: number;   // after costs
  spilloverScore: number;
  confidence: number;
  holdDays: number;
}

export interface BacktestResult {
  symbol: string;
  period: string;
  totalDays: number;
  tradeCount: number;
  noTradeCount: number;
  longCount: number;
  shortCount: number;

  // Returns
  totalReturnPct: number;
  benchmarkReturnPct: number;
  alphaPct: number;         // totalReturn - benchmarkReturn

  // Risk metrics
  maxDrawdownPct: number;
  sharpeRatio: number;
  sortinoRatio: number;

  // Accuracy
  winRate: number;
  avgGrossReturnPct: number;
  avgNetReturnPct: number;
  expectancy: number;       // avg net return per trade
  profitFactor: number;     // gross profit / gross loss

  // Per-setup breakdown
  reliefRally: {
    count: number;
    winRate: number;
    avgNetReturnPct: number;
    totalNetReturnPct: number;
  };
  continuation: {
    count: number;
    winRate: number;
    avgNetReturnPct: number;
    totalNetReturnPct: number;
  };

  // Trades for inspection
  trades: BacktestTrade[];
}

// ─── Helper functions ──────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Walk-forward backtest: iterates day by day, computes spillover,
 * simulates trade, tracks P&L.
 */
export async function runSpilloverBacktest(
  targetSymbol: string = 'SMH',
  holdDays: number = 3,
  range: string = '1y'
): Promise<BacktestResult> {
  console.log(`[SPILLOVER-BT] Starting backtest: ${targetSymbol}, hold=${holdDays}d, range=${range}`);

  // Fetch all needed data in parallel
  const [kospiData, smhData, qqqData, vixData] = await Promise.all([
    getMarketHistory('^KS11', range),
    getMarketHistory(targetSymbol, range),
    getMarketHistory('QQQ', range),
    getMarketHistory('VIX', range),
  ]);

  if (smhData.length < 60) {
    throw new Error(`Insufficient data for ${targetSymbol}: ${smhData.length} days`);
  }

  // smhData is most-recent-first (index 0 = latest)
  // For walk-forward, we need oldest-first, so reverse
  const smhReversed = [...smhData].reverse(); // oldest first
  const kospiReversed = [...kospiData].reverse();
  const qqqReversed = [...qqqData].reverse();
  const vixReversed = [...vixData].reverse();

  // Build date-indexed maps for quick lookup
  const kospiByDate = new Map<string, EnrichedMarketData>();
  for (const d of kospiReversed) kospiByDate.set(d.date, d);

  const qqqByDate = new Map<string, EnrichedMarketData>();
  for (const d of qqqReversed) qqqByDate.set(d.date, d);

  const vixByDate = new Map<string, EnrichedMarketData>();
  for (const d of vixReversed) vixByDate.set(d.date, d);

  // Build a date-sorted list of common trading days (days where SMH has data)
  const trades: BacktestTrade[] = [];
  let noTradeCount = 0;
  let peakEquity = 1;
  let maxDrawdown = 0;
  let equity = 1;
  let dailyReturns: number[] = [];

  // Walk forward: for each day where we have enough lookback
  const minLookback = 6; // need at least 6 days of KOSPI for 5D return

  for (let i = minLookback; i < smhReversed.length - holdDays; i++) {
    const today = smhReversed[i];
    const kospiToday = kospiByDate.get(today.date);
    const qqqToday = qqqByDate.get(today.date);
    const vixToday = vixByDate.get(today.date);

    if (!kospiToday || !qqqToday || !vixToday) {
      noTradeCount++;
      continue;
    }

    // Compute drivers from today's enriched data
    const kospi1d = kospiToday.return1d;
    const kospi2d = kospiToday.return2d ?? 0;
    const kospi5d = kospiToday.return5d ?? 0;
    const smh1d = smhReversed[i].return1d;
    const smh2d = smhReversed[i].return2d ?? 0;
    const vix1d = vixToday.return1d;
    const qqq1d = qqqToday.return1d;

    const drivers = { kospi1d, kospi2d, kospi5d, smh1d, smh2d, vix1d, qqq1d };
    const result = computeSpilloverFromDrivers(drivers);

    // Determine trade direction
    let direction: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
    if (result.setupType === 'RELIEF_RALLY') {
      direction = 'LONG';
    } else if (result.setupType === 'CONTINUATION') {
      // In backtest, try shorts on continuation (aggressive)
      direction = 'SHORT';
    }

    if (direction === 'NONE') {
      noTradeCount++;
      continue;
    }

    // Entry: next trading day's close
    if (i + 1 >= smhReversed.length) continue;
    const entryDay = smhReversed[i + 1];
    const entryPrice = entryDay.close;

    // Exit: holdDays later
    if (i + 1 + holdDays >= smhReversed.length) continue;
    const exitDay = smhReversed[i + 1 + holdDays];
    const exitPrice = exitDay.close;

    const grossReturnPct = pctChange(exitPrice, entryPrice);
    const costPct = direction === 'NONE' ? 0 : ROUND_TRIP_COST_PCT;
    const signedGross = direction === 'SHORT' ? -grossReturnPct : grossReturnPct;
    const netReturnPct = signedGross - costPct;

    trades.push({
      date: today.date,
      entryDate: entryDay.date,
      exitDate: exitDay.date,
      setupType: result.setupType,
      direction,
      entryPrice,
      exitPrice,
      grossReturnPct,
      netReturnPct,
      spilloverScore: result.spilloverScore,
      confidence: result.confidence,
      holdDays,
    });

    // Track equity curve
    equity *= (1 + netReturnPct / 100);
    dailyReturns.push(netReturnPct);
    peakEquity = Math.max(peakEquity, equity);
    const drawdown = (peakEquity - equity) / peakEquity * 100;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }

  // ─── Compute aggregate metrics ─────────────────────────────

  const benchmarkReturnPct = smhReversed.length >= 2
    ? pctChange(smhReversed[smhReversed.length - 1].close, smhReversed[0].close)
    : 0;

  const totalReturnPct = (equity - 1) * 100;

  // Win rate
  const wins = trades.filter(t => t.netReturnPct > 0).length;
  const winRate = trades.length > 0 ? wins / trades.length : 0;

  // Average returns
  const avgGross = trades.length > 0
    ? trades.reduce((s, t) => s + t.grossReturnPct, 0) / trades.length : 0;
  const avgNet = trades.length > 0
    ? trades.reduce((s, t) => s + t.netReturnPct, 0) / trades.length : 0;
  const expectancy = avgNet; // per-trade expected return

  // Profit factor
  const grossProfit = trades.filter(t => t.netReturnPct > 0).reduce((s, t) => s + t.netReturnPct, 0);
  const grossLoss = Math.abs(trades.filter(t => t.netReturnPct < 0).reduce((s, t) => s + t.netReturnPct, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

  // Sharpe ratio (annualized, assuming ~252 trading days)
  const avgDailyNet = dailyReturns.length > 0
    ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : 0;
  const stdDaily = dailyReturns.length > 1
    ? Math.sqrt(dailyReturns.reduce((s, r) => s + (r - avgDailyNet) ** 2, 0) / (dailyReturns.length - 1))
    : 0;
  const sharpeRatio = stdDaily > 0 ? (avgDailyNet / stdDaily) * Math.sqrt(252) : 0;

  // Sortino ratio (only downside deviation)
  const negReturns = dailyReturns.filter(r => r < 0);
  const downsideDev = negReturns.length > 0
    ? Math.sqrt(negReturns.reduce((s, r) => s + r ** 2, 0) / negReturns.length)
    : 0;
  const sortinoRatio = downsideDev > 0 ? (avgDailyNet / downsideDev) * Math.sqrt(252) : 0;

  // Per-setup breakdown
  const reliefTrades = trades.filter(t => t.setupType === 'RELIEF_RALLY');
  const reliefWins = reliefTrades.filter(t => t.netReturnPct > 0).length;
  const contTrades = trades.filter(t => t.setupType === 'CONTINUATION');
  const contWins = contTrades.filter(t => t.netReturnPct > 0).length;

  const longCount = trades.filter(t => t.direction === 'LONG').length;
  const shortCount = trades.filter(t => t.direction === 'SHORT').length;

  const result2: BacktestResult = {
    symbol: targetSymbol,
    period: range,
    totalDays: smhReversed.length,
    tradeCount: trades.length,
    noTradeCount,
    longCount,
    shortCount,
    totalReturnPct: round2(totalReturnPct),
    benchmarkReturnPct: round2(benchmarkReturnPct),
    alphaPct: round2(totalReturnPct - benchmarkReturnPct),
    maxDrawdownPct: round2(maxDrawdown),
    sharpeRatio: round2(sharpeRatio),
    sortinoRatio: round2(sortinoRatio),
    winRate: round2(winRate * 100),
    avgGrossReturnPct: round2(avgGross),
    avgNetReturnPct: round2(avgNet),
    expectancy: round2(expectancy),
    profitFactor: round2(profitFactor),
    reliefRally: {
      count: reliefTrades.length,
      winRate: reliefTrades.length > 0 ? round2(reliefWins / reliefTrades.length * 100) : 0,
      avgNetReturnPct: reliefTrades.length > 0
        ? round2(reliefTrades.reduce((s, t) => s + t.netReturnPct, 0) / reliefTrades.length) : 0,
      totalNetReturnPct: round2(reliefTrades.reduce((s, t) => s + t.netReturnPct, 0)),
    },
    continuation: {
      count: contTrades.length,
      winRate: contTrades.length > 0 ? round2(contWins / contTrades.length * 100) : 0,
      avgNetReturnPct: contTrades.length > 0
        ? round2(contTrades.reduce((s, t) => s + t.netReturnPct, 0) / contTrades.length) : 0,
      totalNetReturnPct: round2(contTrades.reduce((s, t) => s + t.netReturnPct, 0)),
    },
    trades,
  };

  console.log(`[SPILLOVER-BT] Done: ${trades.length} trades, ${noTradeCount} no-trade, return=${result2.totalReturnPct}%, bench=${result2.benchmarkReturnPct}%, alpha=${result2.alphaPct}%, sharpe=${result2.sharpeRatio}, maxDD=${result2.maxDrawdownPct}%`);
  console.log(`[SPILLOVER-BT] RELIEF_RALLY: ${result2.reliefRally.count} trades, ${result2.reliefRally.avgNetReturnPct}% avg net, ${result2.reliefRally.winRate}% win`);
  console.log(`[SPILLOVER-BT] CONTINUATION:  ${result2.continuation.count} trades, ${result2.continuation.avgNetReturnPct}% avg net, ${result2.continuation.winRate}% win`);

  return result2;
}

/**
 * Run backtest on multiple tickers and return a summary comparison.
 */
export async function runMultiTickerBacktest(
  tickers: string[] = ['SMH', 'NVDA', 'AMD', 'MU', 'MRVL'],
  holdDays: number = 3,
  range: string = '1y'
): Promise<BacktestResult[]> {
  const results: BacktestResult[] = [];
  for (const ticker of tickers) {
    try {
      const r = await runSpilloverBacktest(ticker, holdDays, range);
      results.push(r);
    } catch (err: any) {
      console.error(`[SPILLOVER-BT] ${ticker} failed:`, err.message);
    }
  }
  return results;
}
