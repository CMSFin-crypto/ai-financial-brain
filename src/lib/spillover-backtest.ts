// ============================================================
// Spillover Backtest V2
// Walk-forward backtest supporting: v1_only, v2_only, v1_plus_v2
// Applies realistic costs. Computes Sharpe, Sortino, Brier score.
// ============================================================

import { getDailyHistory, pctChange, type EnrichedMarketData } from './global-market-data';
import { buildSpilloverFeatures, featuresToArray, type SpilloverFeatures } from './spillover-features';
import { computeSpilloverFromFeatures, type SpilloverSetup } from './global-spillover';
import {
  trainSpilloverModel,
  predictSpilloverV2,
  buildSpilloverDataset,
  type SpilloverDatasetRow,
  type SpilloverV2Prediction,
  walkForwardValidate,
  type WalkForwardWindow,
} from './spillover-v2';

// ─── Cost model ───────────────────────────────────────────────

const COMMISSION_PCT = 0.10;
const SLIPPAGE_PCT = 0.05;
const SPREAD_PCT = 0.05;
const ROUND_TRIP_COST_PCT = COMMISSION_PCT + SLIPPAGE_PCT + SPREAD_PCT;

// ─── Types ─────────────────────────────────────────────────────

export type BacktestMode = 'v1_only' | 'v2_only' | 'v1_plus_v2';

export interface BacktestTrade {
  date: string;
  entryDate: string;
  exitDate: string;
  setupType: SpilloverSetup;
  direction: 'LONG' | 'SHORT' | 'NONE';
  entryPrice: number;
  exitPrice: number;
  grossReturnPct: number;
  netReturnPct: number;
  spilloverScore: number;
  confidence: number;
  holdDays: number;
  v2ProbUp?: number;
  v2ProbDown?: number;
  v2Class?: string;
}

export interface BacktestResult {
  symbol: string;
  mode: BacktestMode;
  period: string;
  totalDays: number;
  tradeCount: number;
  noTradeCount: number;
  longCount: number;
  shortCount: number;
  totalReturnPct: number;
  benchmarkReturnPct: number;
  alphaPct: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  winRate: number;
  avgGrossReturnPct: number;
  avgNetReturnPct: number;
  expectancy: number;
  profitFactor: number;
  brierScore: number;
  walkForwardWindows: number;
  // Per-setup
  reliefRally: { count: number; winRate: number; avgNetReturnPct: number; totalNetReturnPct: number };
  continuation: { count: number; winRate: number; avgNetReturnPct: number; totalNetReturnPct: number };
  // V2 specific
  v2WalkForward?: WalkForwardWindow[];
  trades: BacktestTrade[];
}

// ─── Helpers ───────────────────────────────────────────────────

function round2(n: number): number { return Math.round(n * 100) / 100; }

// ─── V1 Backtest (feature-based) ───────────────────────────────

async function runV1Backtest(
  targetSymbol: string,
  kospi: EnrichedMarketData[],
  smh: EnrichedMarketData[],
  qqq: EnrichedMarketData[],
  vix: EnrichedMarketData[],
  nikkei: EnrichedMarketData[],
  hsi: EnrichedMarketData[],
  target: EnrichedMarketData[],
  holdDays: number = 3
): Promise<{ trades: BacktestTrade[]; noTradeCount: number }> {
  // Reverse all to oldest-first
  const tR = [...target].reverse();
  const kR = [...kospi].reverse();
  const sR = [...smh].reverse();
  const qR = [...qqq].reverse();
  const vR = [...vix].reverse();
  const nR = [...nikkei].reverse();
  const hR = [...hsi].reverse();

  // Build date maps
  const kByDate = new Map<string, EnrichedMarketData>();
  for (const d of kR) kByDate.set(d.date, d);
  const qByDate = new Map<string, EnrichedMarketData>();
  for (const d of qR) qByDate.set(d.date, d);
  const vByDate = new Map<string, EnrichedMarketData>();
  for (const d of vR) vByDate.set(d.date, d);
  const nByDate = new Map<string, EnrichedMarketData>();
  for (const d of nR) nByDate.set(d.date, d);
  const hByDate = new Map<string, EnrichedMarketData>();
  for (const d of hR) hByDate.set(d.date, d);

  const trades: BacktestTrade[] = [];
  let noTradeCount = 0;

  for (let i = 6; i < tR.length - holdDays - 1; i++) {
    const today = tR[i];
    const kToday = kByDate.get(today.date);
    const qToday = qByDate.get(today.date);
    const vToday = vByDate.get(today.date);
    const nToday = nByDate.get(today.date);
    const hToday = hByDate.get(today.date);
    if (!kToday || !qToday || !vToday || !nToday || !hToday) { noTradeCount++; continue; }

    // Build features with history up to this day
    const kSlice = kR.slice(0, i + 1).slice(-60);
    const nSlice = nR.slice(0, i + 1).slice(-60);
    const hSlice = hR.slice(0, i + 1).slice(-60);
    const sSlice = sR.slice(0, i + 1).slice(-60);
    const qSlice = qR.slice(0, i + 1).slice(-60);
    const vSlice = vR.slice(0, i + 1).slice(-60);
    const tSlice = tR.slice(0, i + 1).slice(-60);

    const features = buildSpilloverFeatures({
      kospi: kSlice, nikkei: nSlice, hsi: hSlice,
      smh: sSlice, qqq: qSlice, vix: vSlice, target: tSlice,
    });

    const result = computeSpilloverFromFeatures(features);

    let direction: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
    if (result.setupType === 'RELIEF_RALLY') direction = 'LONG';
    else if (result.setupType === 'CONTINUATION') direction = 'SHORT';

    if (direction === 'NONE') { noTradeCount++; continue; }

    const entryDay = tR[i + 1];
    const exitDay = tR[i + 1 + holdDays];
    if (!entryDay || !exitDay) { noTradeCount++; continue; }

    const grossReturnPct = pctChange(exitDay.close, entryDay.close);
    const costPct = ROUND_TRIP_COST_PCT;
    const signedGross = direction === 'SHORT' ? -grossReturnPct : grossReturnPct;
    const netReturnPct = signedGross - costPct;

    trades.push({
      date: today.date, entryDate: entryDay.date, exitDate: exitDay.date,
      setupType: result.setupType, direction,
      entryPrice: entryDay.close, exitPrice: exitDay.close,
      grossReturnPct, netReturnPct,
      spilloverScore: result.spilloverScore, confidence: result.confidence, holdDays,
    });
  }

  return { trades, noTradeCount };
}

// ─── V2 Backtest (walk-forward model) ──────────────────────────

async function runV2Backtest(
  targetSymbol: string,
  kospi: EnrichedMarketData[],
  nikkei: EnrichedMarketData[],
  hsi: EnrichedMarketData[],
  smh: EnrichedMarketData[],
  qqq: EnrichedMarketData[],
  vix: EnrichedMarketData[],
  target: EnrichedMarketData[],
  holdDays: number = 3
): Promise<{ trades: BacktestTrade[]; noTradeCount: number; brierScore: number; wfWindows: WalkForwardWindow[] }> {
  // Build full dataset
  const dataset = buildSpilloverDataset(targetSymbol, kospi, nikkei, hsi, smh, qqq, vix, target);
  if (dataset.length < 100) {
    console.log(`[SPILLOVER-BT-V2] ${targetSymbol}: dataset too small (${dataset.length})`);
    return { trades: [], noTradeCount: 0, brierScore: 1, wfWindows: [] };
  }

  // Walk-forward validation
  const wfWindows = walkForwardValidate(dataset, 12, 1);
  if (wfWindows.length === 0) {
    return { trades: [], noTradeCount: 0, brierScore: 1, wfWindows: [] };
  }

  // Use last window's model for the final test period
  const lastWindow = wfWindows[wfWindows.length - 1];
  const trainEndIdx = dataset.findIndex(r => r.date === lastWindow.trainEnd);
  const testStartIdx = dataset.findIndex(r => r.date === lastWindow.testStart);
  if (trainEndIdx < 0 || testStartIdx < 0) {
    return { trades: [], noTradeCount: 0, brierScore: 1, wfWindows };
  }

  const trainRows = dataset.slice(trainEndIdx - lastWindow.trainSize + 1, trainEndIdx + 1);
  const { model, standardizer } = trainSpilloverModel(trainRows);

  // Test on last window
  const testRows = dataset.slice(testStartIdx, testStartIdx + lastWindow.testSize);
  const trades: BacktestTrade[] = [];
  let noTradeCount = 0;
  let brierSum = 0;

  // Get target prices for P&L
  const tR = [...target].reverse();
  const priceByDate = new Map<string, number>();
  for (const d of tR) priceByDate.set(d.date, d.close);

  for (const row of testRows) {
    const pred = predictSpilloverV2(row, model, standardizer);
    brierSum += (pred.probabilityUp - row.labelUp) ** 2;

    let direction: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
    if (pred.probabilityUp >= 0.6) direction = 'LONG';
    else if (pred.probabilityDown >= 0.6) direction = 'SHORT';

    if (direction === 'NONE') { noTradeCount++; continue; }

    // Find entry/exit prices
    const entryPrice = priceByDate.get(row.date);
    // Future price (holdDays ahead)
    const futureIdx = dataset.findIndex(r => r.date === row.date);
    const futureRow = futureIdx >= 0 && futureIdx + holdDays < dataset.length
      ? dataset[futureIdx + holdDays] ?? null : null;
    const exitPrice = futureRow ? priceByDate.get(futureRow.date) : undefined;

    if (!futureRow || !entryPrice || !exitPrice) { noTradeCount++; continue; }

    const grossReturnPct = pctChange(exitPrice, entryPrice);
    const signedGross = direction === 'SHORT' ? -grossReturnPct : grossReturnPct;
    const netReturnPct = signedGross - ROUND_TRIP_COST_PCT;

    trades.push({
      date: row.date, entryDate: row.date, exitDate: futureRow.date,
      setupType: pred.predictedClass as SpilloverSetup,
      direction, entryPrice, exitPrice,
      grossReturnPct, netReturnPct,
      spilloverScore: pred.score, confidence: Math.max(pred.probabilityUp, pred.probabilityDown),
      holdDays, v2ProbUp: pred.probabilityUp, v2ProbDown: pred.probabilityDown, v2Class: pred.predictedClass,
    });
  }

  return {
    trades,
    noTradeCount,
    brierScore: testRows.length > 0 ? brierSum / testRows.length : 1,
    wfWindows,
  };
}

// ─── V1+V2 Combined ─────────────────────────────────────────────

async function runCombinedBacktest(
  targetSymbol: string,
  v1Trades: BacktestTrade[],
  v2Trades: BacktestTrade[]
): Promise<{ trades: BacktestTrade[]; noTradeCount: number }> {
  // V1+V2 logic:
  // Both RELIEF_RALLY → LONG
  // V2 probUp >= 0.65 && V1 RELIEF_RALLY → strong LONG
  // Disagree → no trade
  const v2ByDate = new Map<string, BacktestTrade>();
  for (const t of v2Trades) v2ByDate.set(t.date, t);

  const trades: BacktestTrade[] = [];
  let noTradeCount = 0;

  for (const v1t of v1Trades) {
    if (v1t.direction === 'NONE') { noTradeCount++; continue; }
    const v2t = v2ByDate.get(v1t.date);

    if (!v2t || v2t.direction === 'NONE') {
      // Only V1 signal, use it with reduced confidence
      trades.push({ ...v1t, confidence: v1t.confidence * 0.7 });
      continue;
    }

    // Both have signals
    if (v1t.setupType === 'RELIEF_RALLY' && v2t.v2ProbUp && v2t.v2ProbUp >= 0.65) {
      // Strong agreement → LONG with boosted confidence
      trades.push({
        ...v1t,
        confidence: Math.min(1, (v1t.confidence + (v2t.v2ProbUp ?? 0)) / 2),
        v2ProbUp: v2t.v2ProbUp,
        v2Class: v2t.v2Class,
      });
    } else if (v2t.v2ProbDown && v2t.v2ProbDown >= 0.65) {
      // V2 strongly bearish → NO TRADE even if V1 says relief
      noTradeCount++;
    } else if (v1t.setupType === v2t.setupType) {
      // Agreement → trade
      trades.push({ ...v1t, v2ProbUp: v2t.v2ProbUp, v2Class: v2t.v2Class });
    } else {
      // Disagreement → no trade
      noTradeCount++;
    }
  }

  return { trades, noTradeCount };
}

// ─── Aggregate metrics ──────────────────────────────────────────

function computeMetrics(
  trades: BacktestTrade[],
  noTradeCount: number,
  targetOldestFirst: EnrichedMarketData[]
): Omit<BacktestResult, 'symbol' | 'mode' | 'period' | 'totalDays' | 'walkForwardWindows' | 'v2WalkForward' | 'brierScore' | 'trades'> {
  const equity = trades.reduce((eq, t) => eq * (1 + t.netReturnPct / 100), 1);
  let peak = 1, maxDD = 0, current = 1;
  const dailyReturns: number[] = [];

  for (const t of trades) {
    current *= (1 + t.netReturnPct / 100);
    peak = Math.max(peak, current);
    maxDD = Math.max(maxDD, (peak - current) / peak * 100);
    dailyReturns.push(t.netReturnPct);
  }

  const benchmarkReturnPct = targetOldestFirst.length >= 2
    ? pctChange(targetOldestFirst[targetOldestFirst.length - 1].close, targetOldestFirst[0].close) : 0;
  const totalReturnPct = (equity - 1) * 100;

  const wins = trades.filter(t => t.netReturnPct > 0).length;
  const winRate = trades.length > 0 ? wins / trades.length : 0;
  const avgGross = trades.length > 0 ? trades.reduce((s, t) => s + t.grossReturnPct, 0) / trades.length : 0;
  const avgNet = trades.length > 0 ? trades.reduce((s, t) => s + t.netReturnPct, 0) / trades.length : 0;

  const grossProfit = trades.filter(t => t.netReturnPct > 0).reduce((s, t) => s + t.netReturnPct, 0);
  const grossLoss = Math.abs(trades.filter(t => t.netReturnPct < 0).reduce((s, t) => s + t.netReturnPct, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

  const avgDR = dailyReturns.length > 0 ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : 0;
  const stdDR = dailyReturns.length > 1
    ? Math.sqrt(dailyReturns.reduce((s, r) => s + (r - avgDR) ** 2, 0) / (dailyReturns.length - 1)) : 0;
  const sharpeRatio = stdDR > 0 ? (avgDR / stdDR) * Math.sqrt(252) : 0;

  const negR = dailyReturns.filter(r => r < 0);
  const downDev = negR.length > 0 ? Math.sqrt(negR.reduce((s, r) => s + r ** 2, 0) / negR.length) : 0;
  const sortinoRatio = downDev > 0 ? (avgDR / downDev) * Math.sqrt(252) : 0;

  const reliefTrades = trades.filter(t => t.setupType === 'RELIEF_RALLY');
  const contTrades = trades.filter(t => t.setupType === 'CONTINUATION');

  return {
    tradeCount: trades.length,
    noTradeCount,
    longCount: trades.filter(t => t.direction === 'LONG').length,
    shortCount: trades.filter(t => t.direction === 'SHORT').length,
    totalReturnPct: round2(totalReturnPct),
    benchmarkReturnPct: round2(benchmarkReturnPct),
    alphaPct: round2(totalReturnPct - benchmarkReturnPct),
    maxDrawdownPct: round2(maxDD),
    sharpeRatio: round2(sharpeRatio),
    sortinoRatio: round2(sortinoRatio),
    winRate: round2(winRate * 100),
    avgGrossReturnPct: round2(avgGross),
    avgNetReturnPct: round2(avgNet),
    expectancy: round2(avgNet),
    profitFactor: round2(profitFactor),
    reliefRally: {
      count: reliefTrades.length,
      winRate: reliefTrades.length > 0 ? round2(reliefTrades.filter(t => t.netReturnPct > 0).length / reliefTrades.length * 100) : 0,
      avgNetReturnPct: reliefTrades.length > 0 ? round2(reliefTrades.reduce((s, t) => s + t.netReturnPct, 0) / reliefTrades.length) : 0,
      totalNetReturnPct: round2(reliefTrades.reduce((s, t) => s + t.netReturnPct, 0)),
    },
    continuation: {
      count: contTrades.length,
      winRate: contTrades.length > 0 ? round2(contTrades.filter(t => t.netReturnPct > 0).length / contTrades.length * 100) : 0,
      avgNetReturnPct: contTrades.length > 0 ? round2(contTrades.reduce((s, t) => s + t.netReturnPct, 0) / contTrades.length) : 0,
      totalNetReturnPct: round2(contTrades.reduce((s, t) => s + t.netReturnPct, 0)),
    },
  };
}

// ─── Main entry point ───────────────────────────────────────────

export async function runSpilloverBacktest(
  targetSymbol: string = 'SMH',
  mode: BacktestMode = 'v1_only',
  holdDays: number = 3,
  range: string = '1y'
): Promise<BacktestResult> {
  console.log(`[SPILLOVER-BT] ${targetSymbol} mode=${mode} hold=${holdDays}d range=${range}`);

  // Map range string to days
  const rangeDays = range === '1mo' ? 30 : range === '3mo' ? 90 : range === '6mo' ? 180 : 260;

  // Fetch all data
  const [kospi, nikkei, hsi, smh, qqq, vix, target] = await Promise.all([
    getDailyHistory('^KS11', rangeDays),
    getDailyHistory('^N225', rangeDays),
    getDailyHistory('^HSI', rangeDays),
    getDailyHistory('SMH', rangeDays),
    getDailyHistory('QQQ', rangeDays),
    getDailyHistory('VIX', rangeDays),
    getDailyHistory(targetSymbol, rangeDays),
  ]);

  if (target.length < 60) throw new Error(`Insufficient data for ${targetSymbol}: ${target.length} days`);

  const tOldestFirst = [...target].reverse();

  if (mode === 'v1_only') {
    const { trades, noTradeCount } = await runV1Backtest(
      targetSymbol, kospi, smh, qqq, vix, nikkei, hsi, target, holdDays
    );
    const metrics = computeMetrics(trades, noTradeCount, tOldestFirst);
    return {
      symbol: targetSymbol, mode, period: range,
      totalDays: tOldestFirst.length,
      brierScore: 0, walkForwardWindows: 0,
      ...metrics, trades,
    };
  }

  if (mode === 'v2_only') {
    const { trades, noTradeCount, brierScore, wfWindows } = await runV2Backtest(
      targetSymbol, kospi, nikkei, hsi, smh, qqq, vix, target, holdDays
    );
    const metrics = computeMetrics(trades, noTradeCount, tOldestFirst);
    return {
      symbol: targetSymbol, mode, period: range,
      totalDays: tOldestFirst.length,
      brierScore: round2(brierScore),
      walkForwardWindows: wfWindows.length,
      v2WalkForward: wfWindows,
      ...metrics, trades,
    };
  }

  // v1_plus_v2
  const [v1Result, v2Result] = await Promise.all([
    runV1Backtest(targetSymbol, kospi, smh, qqq, vix, nikkei, hsi, target, holdDays),
    runV2Backtest(targetSymbol, kospi, nikkei, hsi, smh, qqq, vix, target, holdDays),
  ]);
  const { trades, noTradeCount } = await runCombinedBacktest(targetSymbol, v1Result.trades, v2Result.trades);
  const metrics = computeMetrics(trades, noTradeCount, tOldestFirst);
  return {
    symbol: targetSymbol, mode, period: range,
    totalDays: tOldestFirst.length,
    brierScore: round2(v2Result.brierScore),
    walkForwardWindows: v2Result.wfWindows.length,
    v2WalkForward: v2Result.wfWindows,
    ...metrics, trades,
  };
}

/** Multi-ticker backtest */
export async function runMultiTickerBacktest(
  tickers: string[] = ['SMH', 'NVDA', 'AMD', 'MU', 'MRVL'],
  mode: BacktestMode = 'v1_only',
  holdDays: number = 3,
  range: string = '1y'
): Promise<BacktestResult[]> {
  const results: BacktestResult[] = [];
  for (const ticker of tickers) {
    try {
      const r = await runSpilloverBacktest(ticker, mode, holdDays, range);
      results.push(r);
    } catch (err: any) {
      console.error(`[SPILLOVER-BT] ${ticker} failed:`, err.message);
    }
  }
  return results;
}
