import { NextRequest, NextResponse } from 'next/server';
import { fetchHistoricalData } from '@/lib/alpha-vantage';
import {
  calculateRSI,
  calculateMACD,
  calculateBollinger,
  calculateSMA,
} from '@/lib/indicators';

export const maxDuration = 60;

interface Trade {
  type: 'BUY' | 'SELL';
  date: string;
  price: number;
  shares: number;
  pnl?: number;
  pnlPercent?: number;
}

interface BacktestResult {
  symbol: string;
  strategy: string;
  totalTrades: number;
  winRate: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  finalEquity: number;
  trades: Trade[];
}

function simulateTrades(
  data: Array<{ date: string; close: number; high: number; low: number; volume: number }>,
  signals: ('BUY' | 'SELL' | null)[],
  initialCapital: number,
  stopLoss: number,
  takeProfit: number
): { trades: Trade[]; finalEquity: number; returns: number[] } {
  const trades: Trade[] = [];
  let equity = initialCapital;
  let position: { entryPrice: number; shares: number; date: string } | null = null;
  const dailyReturns: number[] = [];

  for (let i = 1; i < data.length; i++) {
    const prevClose = data[i - 1].close;
    const dayReturn = (data[i].close - prevClose) / prevClose;
    dailyReturns.push(dayReturn);

    if (position) {
      // Check stop-loss and take-profit
      const currentPnL = (data[i].close - position.entryPrice) / position.entryPrice;

      if (currentPnL <= -stopLoss || currentPnL >= takeProfit) {
        const pnl = (data[i].close - position.entryPrice) * position.shares;
        const pnlPct = ((data[i].close - position.entryPrice) / position.entryPrice) * 100;
        equity += position.shares * data[i].close;
        trades.push({
          type: 'SELL',
          date: data[i].date,
          price: data[i].close,
          shares: position.shares,
          pnl: Math.round(pnl * 100) / 100,
          pnlPercent: Math.round(pnlPct * 100) / 100,
        });
        position = null;
      }
    }

    if (!position && signals[i] === 'BUY') {
      const shares = Math.floor(equity / data[i].close);
      if (shares > 0) {
        position = { entryPrice: data[i].close, shares, date: data[i].date };
        equity -= shares * data[i].close;
        trades.push({
          type: 'BUY',
          date: data[i].date,
          price: data[i].close,
          shares,
        });
      }
    } else if (position && signals[i] === 'SELL') {
      const pnl = (data[i].close - position.entryPrice) * position.shares;
      const pnlPct = ((data[i].close - position.entryPrice) / position.entryPrice) * 100;
      equity += position.shares * data[i].close;
      trades.push({
        type: 'SELL',
        date: data[i].date,
        price: data[i].close,
        shares: position.shares,
        pnl: Math.round(pnl * 100) / 100,
        pnlPercent: Math.round(pnlPct * 100) / 100,
      });
      position = null;
    }
  }

  // Close any open position at the end
  if (position) {
    const lastPrice = data[data.length - 1].close;
    const pnl = (lastPrice - position.entryPrice) * position.shares;
    const pnlPct = ((lastPrice - position.entryPrice) / position.entryPrice) * 100;
    equity += position.shares * lastPrice;
    trades.push({
      type: 'SELL',
      date: data[data.length - 1].date,
      price: lastPrice,
      shares: position.shares,
      pnl: Math.round(pnl * 100) / 100,
      pnlPercent: Math.round(pnlPct * 100) / 100,
    });
  }

  return { trades, finalEquity: equity, returns: dailyReturns };
}

function computeMetrics(
  initialCapital: number,
  finalEquity: number,
  trades: Trade[],
  dailyReturns: number[]
): Omit<BacktestResult, 'symbol' | 'strategy' | 'trades'> {
  // Win rate
  const sellTrades = trades.filter(t => t.type === 'SELL' && t.pnl !== undefined);
  const wins = sellTrades.filter(t => (t.pnl ?? 0) > 0);
  const winRate = sellTrades.length > 0 ? (wins.length / sellTrades.length) * 100 : 0;

  // Total return
  const totalReturn = ((finalEquity - initialCapital) / initialCapital) * 100;

  // Max drawdown
  let peak = initialCapital;
  let maxDrawdown = 0;
  let equity = initialCapital;

  for (const trade of trades) {
    if (trade.type === 'BUY') {
      equity -= trade.shares * trade.price;
    } else {
      equity += trade.shares * trade.price;
    }
    if (equity > peak) peak = equity;
    const dd = ((peak - equity) / peak) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Sharpe ratio (annualized, assuming 252 trading days)
  let sharpeRatio = 0;
  if (dailyReturns.length > 1) {
    const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((a, b) => a + (b - avgReturn) ** 2, 0) / dailyReturns.length;
    const stdDev = Math.sqrt(variance);
    sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
  }

  // Profit factor
  const grossProfit = sellTrades.filter(t => (t.pnl ?? 0) > 0).reduce((a, t) => a + (t.pnl ?? 0), 0);
  const grossLoss = Math.abs(sellTrades.filter(t => (t.pnl ?? 0) < 0).reduce((a, t) => a + (t.pnl ?? 0), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

  return {
    totalTrades: sellTrades.length,
    winRate: Math.round(winRate * 100) / 100,
    totalReturn: Math.round(totalReturn * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    finalEquity: Math.round(finalEquity * 100) / 100,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const ticker = symbol.toUpperCase().trim();

    if (!ticker) {
      return NextResponse.json({ error: 'Simboli është i nevojshëm' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const strategy = searchParams.get('strategy') || 'rsi_macd';
    const range = searchParams.get('range') || '1y';
    const stopLoss = parseFloat(searchParams.get('stopLoss') || '0.05');
    const takeProfit = parseFloat(searchParams.get('takeProfit') || '0.10');
    const initialCapital = parseFloat(searchParams.get('initialCapital') || '10000');

    // Fetch historical data
    const historicalData = await fetchHistoricalData(ticker, range);

    if (!historicalData || historicalData.length < 60) {
      return NextResponse.json(
        { error: 'Të dhëna të pamjaftueshme historike për backtesting' },
        { status: 404 }
      );
    }

    const closes = historicalData.map(d => d.close);
    const signals: ('BUY' | 'SELL' | null)[] = new Array(historicalData.length).fill(null);

    if (strategy === 'rsi_macd') {
      const rsi = calculateRSI(closes);
      const { histogram } = calculateMACD(closes);

      for (let i = 0; i < historicalData.length; i++) {
        if (isNaN(rsi[i]) || isNaN(histogram[i])) continue;
        if (rsi[i] < 30 && histogram[i] > 0) signals[i] = 'BUY';
        if (rsi[i] > 70 && histogram[i] < 0) signals[i] = 'SELL';
      }
    } else if (strategy === 'bollinger') {
      const { upper, lower } = calculateBollinger(closes);

      for (let i = 0; i < historicalData.length; i++) {
        if (isNaN(upper[i]) || isNaN(lower[i])) continue;
        if (closes[i] <= lower[i]) signals[i] = 'BUY';
        if (closes[i] >= upper[i]) signals[i] = 'SELL';
      }
    } else if (strategy === 'moving_average') {
      const sma20 = calculateSMA(closes, 20);
      const sma50 = calculateSMA(closes, 50);

      for (let i = 0; i < historicalData.length; i++) {
        if (isNaN(sma20[i]) || isNaN(sma50[i])) continue;
        // Buy when SMA20 crosses above SMA50
        if (sma20[i] > sma50[i] && i > 0 && !isNaN(sma20[i - 1]) && !isNaN(sma50[i - 1]) && sma20[i - 1] <= sma50[i - 1]) {
          signals[i] = 'BUY';
        }
        // Sell when SMA20 crosses below SMA50
        if (sma20[i] < sma50[i] && i > 0 && !isNaN(sma20[i - 1]) && !isNaN(sma50[i - 1]) && sma20[i - 1] >= sma50[i - 1]) {
          signals[i] = 'SELL';
        }
      }
    }

    // Simulate trades
    const { trades, finalEquity, returns } = simulateTrades(
      historicalData,
      signals,
      initialCapital,
      stopLoss,
      takeProfit
    );

    const metrics = computeMetrics(initialCapital, finalEquity, trades, returns);

    return NextResponse.json({
      symbol: ticker,
      strategy,
      ...metrics,
      trades: trades.slice(-20),
    } as BacktestResult);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[BACKTEST] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}