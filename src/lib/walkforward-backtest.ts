// ============================================================
// Walk-Forward Backtest with Realistic Costs
// Simulates: commission 0.1%, slippage 0.05%, spread 0.05%
// Entry delay: 1 bar
// ============================================================

import { fetchHistoricalData, type HistoricalDataPoint } from './alpha-vantage';
import { predictStock, type PredictionResult } from './prediction-engine';
import { runNoTradeGate, type NoTradeGateInput } from './no-trade-gate';
import type { Regime } from './market-regime';

export interface BacktestConfig {
  commissionPct: number;
  slippagePct: number;
  spreadPct: number;
  entryDelayBars: number;
  windowSize: number;      // training window in days
  stepSize: number;         // step forward in days
  minTrades: number;
}

export interface BacktestTrade {
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  signal: string;
  predictedDir: string;
  actualReturnPct: number;
  netReturnPct: number;
  benchmarkReturnPct: number;
  wasCorrect: boolean;
  noTrade: boolean;
  noTradeReason?: string;
}

export interface BacktestResult {
  ticker: string;
  totalReturnPct: number;
  benchmarkReturnPct: number;
  maxDrawdownPct: number;
  winRate: number;
  sharpeRatio: number;
  tradeCount: number;
  noTradeCount: number;
  avgReturnPerTrade: number;
  totalCostsPct: number;
  trades: BacktestTrade[];
}

const DEFAULT_CONFIG: BacktestConfig = {
  commissionPct: 0.1,
  slippagePct: 0.05,
  spreadPct: 0.05,
  entryDelayBars: 1,
  windowSize: 60,
  stepSize: 5,
  minTrades: 5,
};

export async function runWalkForwardBacktest(
  ticker: string,
  config: Partial<BacktestConfig> = {},
): Promise<BacktestResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const result: BacktestResult = {
    ticker,
    totalReturnPct: 0,
    benchmarkReturnPct: 0,
    maxDrawdownPct: 0,
    winRate: 0,
    sharpeRatio: 0,
    tradeCount: 0,
    noTradeCount: 0,
    avgReturnPerTrade: 0,
    totalCostsPct: 0,
    trades: [],
  };

  try {
    // Fetch data
    const [stockData, benchData] = await Promise.all([
      fetchHistoricalData(ticker, '1y'),
      fetchHistoricalData('SPY', '1y'),
    ]);

    if (!stockData || stockData.length < cfg.windowSize + cfg.stepSize + 10) {
      console.error(`[BACKTEST] Not enough data for ${ticker}`);
      return result;
    }

    const trades: BacktestTrade[] = [];
    const roundTripCost = (cfg.commissionPct + cfg.slippagePct + cfg.spreadPct) * 2;
    let totalCosts = 0;
    let cumulativeReturn = 0;
    let peakCumReturn = 0;
    let maxDD = 0;
    const returns: number[] = [];

    // Walk forward
    let startIdx = cfg.windowSize;
    const endIdx = stockData.length - cfg.stepSize - 5;

    while (startIdx < endIdx) {
      // Training window
      const trainingData = stockData.slice(startIdx - cfg.windowSize, startIdx);
      if (trainingData.length < cfg.windowSize) break;

      // Run prediction on training window
      const pred: PredictionResult = predictStock(ticker, trainingData);

      // Simple regime estimate from training data
      const closes = trainingData.map(d => d.close);
      const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const regime: Regime = closes[closes.length - 1] > sma20 ? 'BULL' : 'BEAR';

      // NO_TRADE gate
      const gateResult = runNoTradeGate({
        confidence: pred.confidence,
        combinedScore: pred.combinedScore,
        expectedMovePct: pred.shortTerm.expectedMove,
        signal: pred.direction,
        regime: {
          regime,
          confidence: 0.5,
          spyPrice: 0,
          spyChange5d: 0,
          spyChange20d: 0,
          detectedAt: new Date().toISOString(),
        },
        eventRisk: {
          eventType: 'none',
          severity: 'LOW',
          daysUntil: null,
          description: '',
          riskScore: 0,
        },
      });

      if (gateResult.status === 'NO_TRADE') {
        result.noTradeCount++;
        trades.push({
          entryDate: stockData[startIdx].date,
          entryPrice: stockData[startIdx].close,
          exitDate: stockData[startIdx + cfg.stepSize].date,
          exitPrice: stockData[startIdx + cfg.stepSize].close,
          signal: pred.direction,
          predictedDir: pred.shortTerm.prediction,
          actualReturnPct: 0,
          netReturnPct: 0,
          benchmarkReturnPct: 0,
          wasCorrect: false,
          noTrade: true,
          noTradeReason: gateResult.reason,
        });
        startIdx += cfg.stepSize;
        continue;
      }

      // Simulate entry (with delay and costs)
      const entryIdx = Math.min(startIdx + cfg.entryDelayBars, stockData.length - cfg.stepSize - 1);
      const entryPrice = stockData[entryIdx].close * (1 + cfg.spreadPct / 100 + cfg.slippagePct / 100);

      // Exit after stepSize bars
      const exitIdx = Math.min(entryIdx + cfg.stepSize, stockData.length - 1);
      const exitPrice = stockData[exitIdx].close * (1 - cfg.spreadPct / 100 - cfg.slippagePct / 100);

      const grossReturn = ((exitPrice - entryPrice) / entryPrice) * 100;
      const tradeCost = roundTripCost;
      const netReturn = grossReturn - tradeCost;

      // Benchmark return for same period
      let benchReturn = 0;
      if (benchData && benchData.length > exitIdx) {
        const benchEntry = benchData[entryIdx]?.close ?? 0;
        const benchExit = benchData[exitIdx]?.close ?? 0;
        if (benchEntry > 0) benchReturn = ((benchExit - benchEntry) / benchEntry) * 100;
      }

      const wasCorrect = (pred.shortTerm.prediction === 'UP' && grossReturn > 0.1) ||
                         (pred.shortTerm.prediction === 'DOWN' && grossReturn < -0.1) ||
                         (pred.shortTerm.prediction === 'SIDEWAYS' && Math.abs(grossReturn) < 1);

      trades.push({
        entryDate: stockData[entryIdx].date,
        entryPrice: Math.round(entryPrice * 100) / 100,
        exitDate: stockData[exitIdx].date,
        exitPrice: Math.round(exitPrice * 100) / 100,
        signal: pred.direction,
        predictedDir: pred.shortTerm.prediction,
        actualReturnPct: Math.round(grossReturn * 100) / 100,
        netReturnPct: Math.round(netReturn * 100) / 100,
        benchmarkReturnPct: Math.round(benchReturn * 100) / 100,
        wasCorrect,
        noTrade: false,
      });

      cumulativeReturn += netReturn;
      totalCosts += tradeCost;
      returns.push(netReturn);

      // Drawdown tracking
      if (cumulativeReturn > peakCumReturn) peakCumReturn = cumulativeReturn;
      const dd = peakCumReturn - cumulativeReturn;
      if (dd > maxDD) maxDD = dd;

      startIdx += cfg.stepSize;
    }

    // Calculate final stats
    const executedTrades = trades.filter(t => !t.noTrade);
    result.trades = trades;
    result.tradeCount = executedTrades.length;
    result.noTradeCount = trades.length - executedTrades.length;
    result.totalCostsPct = Math.round(totalCosts * 100) / 100;

    if (executedTrades.length > 0) {
      const wins = executedTrades.filter(t => t.wasCorrect).length;
      result.winRate = Math.round((wins / executedTrades.length) * 100);
      result.avgReturnPerTrade = Math.round(
        (executedTrades.reduce((s, t) => s + t.netReturnPct, 0) / executedTrades.length) * 100
      ) / 100;
      result.totalReturnPct = Math.round(
        executedTrades.reduce((s, t) => s + t.netReturnPct, 0) * 100
      ) / 100;
      result.benchmarkReturnPct = Math.round(
        executedTrades.reduce((s, t) => s + t.benchmarkReturnPct, 0) * 100
      ) / 100;
      result.maxDrawdownPct = Math.round(maxDD * 100) / 100;

      // Sharpe ratio (annualized, assuming 5-day periods)
      if (returns.length > 2) {
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length);
        // 252 trading days / 5 day period = ~50 periods per year
        result.sharpeRatio = std > 0 ? Math.round((mean / std) * Math.sqrt(50) * 100) / 100 : 0;
      }
    }

  } catch (err) {
    console.error(`[BACKTEST] Failed for ${ticker}:`, err);
  }

  return result;
}
