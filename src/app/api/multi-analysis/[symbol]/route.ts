import { NextRequest, NextResponse } from 'next/server';
import { fetchHistoricalData, getRealPrice } from '@/lib/alpha-vantage';
import {
  calculateConfidenceScore,
  calculateRSI,
  calculateMACD,
  calculateBollinger,
  calculateSMA,
} from '@/lib/indicators';
import { callAI, parseAIResponse } from '@/lib/ai';

export const maxDuration = 60;

// ─── Types ──────────────────────────────────────────────────────

interface Trade {
  type: 'BUY' | 'SELL';
  date: string;
  price: number;
  shares: number;
  pnl?: number;
  pnlPercent?: number;
}

interface BacktestResult {
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

interface ConfidenceResult {
  score: number;
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
  indicators: {
    RSI: { value: number; signal: 'BUY' | 'SELL' | 'NEUTRAL'; score: number };
    MACD: { value: number; signal: 'BUY' | 'SELL' | 'NEUTRAL'; score: number };
    Bollinger: { position: string; signal: 'BUY' | 'SELL' | 'NEUTRAL'; score: number };
    Volume: { ratio: number; signal: 'BUY' | 'SELL' | 'NEUTRAL'; score: number };
  };
}

interface SentimentResult {
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  score: number;
  summary: string;
}

// ─── Backtest helpers (replicated from /api/backtest) ──────────

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
): Omit<BacktestResult, 'strategy' | 'trades'> {
  const sellTrades = trades.filter(t => t.type === 'SELL' && t.pnl !== undefined);
  const wins = sellTrades.filter(t => (t.pnl ?? 0) > 0);
  const winRate = sellTrades.length > 0 ? (wins.length / sellTrades.length) * 100 : 0;

  const totalReturn = ((finalEquity - initialCapital) / initialCapital) * 100;

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

  let sharpeRatio = 0;
  if (dailyReturns.length > 1) {
    const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((a, b) => a + (b - avgReturn) ** 2, 0) / dailyReturns.length;
    const stdDev = Math.sqrt(variance);
    sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
  }

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

// ─── Individual analysis runners ───────────────────────────────

async function runConfidenceScore(
  ticker: string,
  range: string
): Promise<ConfidenceResult> {
  const historicalData = await fetchHistoricalData(ticker, range);

  if (!historicalData || historicalData.length < 30) {
    throw new Error('Të dhëna të pamjaftueshme historike për pikët e besimit');
  }

  const result = calculateConfidenceScore(historicalData);
  return result;
}

async function runBacktest(
  ticker: string,
  strategy: string,
  range: string,
  stopLoss: number,
  takeProfit: number
): Promise<BacktestResult> {
  const historicalData = await fetchHistoricalData(ticker, range);

  if (!historicalData || historicalData.length < 60) {
    throw new Error('Të dhëna të pamjaftueshme historike për backtesting');
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
      if (sma20[i] > sma50[i] && i > 0 && !isNaN(sma20[i - 1]) && !isNaN(sma50[i - 1]) && sma20[i - 1] <= sma50[i - 1]) {
        signals[i] = 'BUY';
      }
      if (sma20[i] < sma50[i] && i > 0 && !isNaN(sma20[i - 1]) && !isNaN(sma50[i - 1]) && sma20[i - 1] >= sma50[i - 1]) {
        signals[i] = 'SELL';
      }
    }
  }

  const initialCapital = 10000;
  const { trades, finalEquity, returns } = simulateTrades(
    historicalData,
    signals,
    initialCapital,
    stopLoss,
    takeProfit
  );

  const metrics = computeMetrics(initialCapital, finalEquity, trades, returns);

  return {
    strategy,
    ...metrics,
    trades: trades.slice(-5),
  };
}

async function runSentiment(
  ticker: string
): Promise<SentimentResult> {
  // Fetch real price for context
  let priceContext = '';
  try {
    const priceData = await getRealPrice(ticker);
    if (priceData) {
      priceContext = `Çmimi aktual i ${ticker}: $${priceData.price.toFixed(2)} (Ndryshim: ${priceData.change >= 0 ? '+' : ''}${priceData.change.toFixed(2)}%)`;
    }
  } catch {
    // Price fetch failed, continue without it
  }

  const systemPrompt = `You are a financial sentiment analyst. Analyze the overall market sentiment for ${ticker} based on current market conditions. Respond in ALBANIAN. Return JSON: { "sentiment": "POSITIVE"|"NEGATIVE"|"NEUTRAL", "score": 0-100, "summary": "2-3 sentences in Albanian" }`;

  const userMessage = `Analizo sentimentin e tregut për ${ticker}. ${priceContext} Merr parasysh tendencat e përgjithshme, volumet, dhe situatën teknike. Kthe vetëm JSON.`;

  const aiResponse = await callAI({
    systemPrompt,
    userMessage,
    temperature: 0.3,
    timeoutMs: 25000,
    retries: 1,
  });

  const parsed = parseAIResponse<{
    sentiment: string;
    score: number;
    summary: string;
  }>(aiResponse, {
    sentiment: 'NEUTRAL',
    score: 50,
    summary: 'Nuk u mundësua analizimi.',
  });

  // Normalize sentiment value
  let sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' = 'NEUTRAL';
  const rawSentiment = String(parsed.sentiment).toUpperCase();
  if (rawSentiment.includes('POS') || rawSentiment.includes('BULL')) {
    sentiment = 'POSITIVE';
  } else if (rawSentiment.includes('NEG') || rawSentiment.includes('BEAR')) {
    sentiment = 'NEGATIVE';
  }

  // Clamp score
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 50)));

  return {
    sentiment,
    score,
    summary: parsed.summary || 'Nuk u mundësua analizimi.',
  };
}

// ─── Main GET handler ──────────────────────────────────────────

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
    const range = searchParams.get('range') || '6mo';
    const strategy = searchParams.get('strategy') || 'rsi_macd';
    const stopLoss = parseFloat(searchParams.get('stopLoss') || '0.05');
    const takeProfit = parseFloat(searchParams.get('takeProfit') || '0.10');

    // Run all 3 analyses in parallel using Promise.allSettled
    const [confidenceResult, backtestResult, sentimentResult] = await Promise.allSettled([
      runConfidenceScore(ticker, range),
      runBacktest(ticker, strategy, range, stopLoss, takeProfit),
      runSentiment(ticker),
    ]);

    // Extract results (null if failed)
    const confidenceScore: ConfidenceResult | null =
      confidenceResult.status === 'fulfilled' ? confidenceResult.value : null;

    const backtest: BacktestResult | null =
      backtestResult.status === 'fulfilled' ? backtestResult.value : null;

    const sentiment: SentimentResult | null =
      sentimentResult.status === 'fulfilled' ? sentimentResult.value : null;

    // Compute overall signal and score
    const overallSignal = computeOverallSignal(confidenceScore, sentiment);
    const overallScore = computeOverallScore(confidenceScore, sentiment);

    return NextResponse.json({
      symbol: ticker,
      timestamp: new Date().toISOString(),
      confidenceScore,
      backtest,
      sentiment,
      overallSignal,
      overallScore,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[MULTI-ANALYSIS] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Overall signal / score helpers ────────────────────────────

function computeOverallSignal(
  confidence: ConfidenceResult | null,
  sentiment: SentimentResult | null
): 'BUY' | 'SELL' | 'NEUTRAL' {
  if (!confidence && !sentiment) return 'NEUTRAL';

  const confScore = confidence?.score ?? 50;
  const sentimentVal = sentiment?.sentiment ?? 'NEUTRAL';

  if (confScore > 65 && sentimentVal === 'POSITIVE') return 'BUY';
  if (confScore < 35 && sentimentVal === 'NEGATIVE') return 'SELL';
  return 'NEUTRAL';
}

function computeOverallScore(
  confidence: ConfidenceResult | null,
  sentiment: SentimentResult | null
): number {
  const scores: number[] = [];

  if (confidence) {
    scores.push(confidence.score);
  }
  if (sentiment) {
    scores.push(sentiment.score);
  }

  if (scores.length === 0) return 50;

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(Math.max(0, Math.min(100, avg)));
}