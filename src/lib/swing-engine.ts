// ============================================================
// Swing Trading Engine — Technical analysis for swing positions
// Uses 3-month historical data to compute real indicators
// Returns: swing score, entry, stop loss, target, risk/reward
// ============================================================

import { fetchHistoricalData, type HistoricalDataPoint } from '@/lib/alpha-vantage';

// ─── Types ──────────────────────────────────────────────────

export interface SwingAnalysis {
  swingScore: number;          // 0-100, higher = better swing buy
  rsi: number;
  macdSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  macdHistogram: number;
  bollingerPosition: number;   // -1 (lower) to +1 (upper)
  bollingerSqueeze: boolean;
  sma20vs50: 'GOLDEN_CROSS' | 'DEATH_CROSS' | 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  ema9vs21: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  atrPercent: number;          // ATR as % of price
  volumeTrend: 'RISING' | 'FALLING' | 'NORMAL';
  supportLevel: number;
  resistanceLevel: number;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  riskRewardRatio: number;
  swingReasons: string[];
  warningFlags: string[];
}

// ─── Indicator Calculations (pure functions, no API calls) ───

function calcSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += data[j];
      result.push(sum / period);
    }
  }
  return result;
}

function calcEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const k = 2 / (period + 1);
  let ema = NaN;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += data[j];
      ema = sum / period;
      result.push(ema);
    } else {
      ema = data[i] * k + ema * (1 - k);
      result.push(ema);
    }
  }
  return result;
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50; // neutral default
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  // Use simple average for initial, then smoothed
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= period;
  avgLoss /= period;
  // Smoothed for remaining
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calcMACD(closes: number[]): { macdLine: number[]; signalLine: number[]; histogram: number[] } {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine: number[] = ema12.map((v, i) => (isNaN(v) || isNaN(ema26[i])) ? NaN : v - ema26[i]);
  // Signal line = 9-period EMA of MACD
  const validMacd = macdLine.filter(v => !isNaN(v));
  const signalEma = calcEMA(validMacd, 9);
  // Align signal back
  const signalLine: number[] = [];
  let si = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (isNaN(macdLine[i])) {
      signalLine.push(NaN);
    } else {
      signalLine.push(si < signalEma.length ? signalEma[si] : NaN);
      si++;
    }
  }
  const histogram = macdLine.map((v, i) => (isNaN(v) || isNaN(signalLine[i])) ? 0 : v - signalLine[i]);
  return { macdLine, signalLine, histogram };
}

function calcBollinger(closes: number[], period = 20, mult = 2): { upper: number[]; middle: number[]; lower: number[] } {
  const sma = calcSMA(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(sma[i])) {
      upper.push(NaN);
      lower.push(NaN);
    } else {
      let sumSq = 0;
      for (let j = i - period + 1; j <= i; j++) sumSq += Math.pow(closes[j] - sma[i], 2);
      const std = Math.sqrt(sumSq / period);
      upper.push(sma[i] + mult * std);
      lower.push(sma[i] - mult * std);
    }
  }
  return { upper, middle: sma, lower };
}

function calcATR(data: HistoricalDataPoint[], period = 14): number {
  if (data.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const tr = Math.max(
      data[i].high - data[i].low,
      Math.abs(data[i].high - data[i - 1].close),
      Math.abs(data[i].low - data[i - 1].close)
    );
    trs.push(tr);
  }
  // Simple average of last `period` true ranges
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / period;
}

// Find support and resistance levels from recent data
function calcSupportResistance(data: HistoricalDataPoint[]): { support: number; resistance: number } {
  if (data.length < 20) {
    const lows = data.map(d => d.low);
    const highs = data.map(d => d.high);
    return { support: Math.min(...lows), resistance: Math.max(...highs) };
  }
  const recent = data.slice(-40); // Last ~40 trading days (2 months)
  const currentPrice = recent[recent.length - 1].close;
  const lows = recent.map(d => d.low).filter(l => l < currentPrice);
  const highs = recent.map(d => d.high).filter(h => h > currentPrice);
  // Support: most common low cluster below current price
  // Simple approach: find the highest low that's below current price (nearest support)
  const support = lows.length > 0 ? Math.max(...lows) : currentPrice * 0.97;
  // Resistance: find the lowest high above current price (nearest resistance)
  const resistance = highs.length > 0 ? Math.min(...highs) : currentPrice * 1.03;
  return { support, resistance };
}

// Detect volume trend
function calcVolumeTrend(data: HistoricalDataPoint[]): 'RISING' | 'FALLING' | 'NORMAL' {
  if (data.length < 20) return 'NORMAL';
  const recent5 = data.slice(-5).reduce((s, d) => s + d.volume, 0) / 5;
  const prev15 = data.slice(-20, -5).reduce((s, d) => s + d.volume, 0) / 15;
  if (prev15 === 0) return 'NORMAL';
  const ratio = recent5 / prev15;
  if (ratio > 1.3) return 'RISING';
  if (ratio < 0.7) return 'FALLING';
  return 'NORMAL';
}

// ─── Main Swing Analysis Function ──────────────────────────

/**
 * Fetches 3-month historical data and computes swing trading signals.
 * Designed for positions held 2-10 trading days.
 */
export async function analyzeSwing(ticker: string, currentPrice: number): Promise<SwingAnalysis | null> {
  try {
    const history = await fetchHistoricalData(ticker, '3mo');
    if (!history || history.length < 30) {
      console.log(`[SWING] ${ticker}: Not enough historical data (${history?.length || 0} days)`);
      return null;
    }

    const closes = history.map(d => d.close);
    const last = closes.length - 1;

    // ── Compute indicators ──
    const rsi = calcRSI(closes);
    const rsiValue = rsi; // current RSI

    const macd = calcMACD(closes);
    const macdHist = macd.histogram[last] || 0;
    const macdPrev = macd.histogram[last - 1] || 0;
    const macdSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
      macdHist > 0 && macdHist > macdPrev ? 'BULLISH' :
      macdHist < 0 && macdHist < macdPrev ? 'BEARISH' : 'NEUTRAL';

    const boll = calcBollinger(closes);
    const bollUpper = boll.upper[last] || 0;
    const bollLower = boll.lower[last] || 0;
    const bollMiddle = boll.middle[last] || 0;
    const bollWidth = bollUpper - bollLower;
    const bollPosition = bollWidth > 0 ? ((currentPrice - bollLower) / bollWidth) * 2 - 1 : 0;
    const bollSqueeze = bollWidth > 0 && bollWidth / bollMiddle < 0.04; // < 4% of price

    const sma20 = calcSMA(closes, 20);
    const sma50 = calcSMA(closes, 50);
    const sma20Val = sma20[last] || 0;
    const sma50Val = sma50[last] || 0;
    const sma20Prev = sma20[last - 1] || 0;
    const sma50Prev = sma50[last - 1] || 0;

    let sma20vs50: SwingAnalysis['sma20vs50'] = 'NEUTRAL';
    if (sma20Val > 0 && sma50Val > 0) {
      if (sma20Prev <= sma50Prev && sma20Val > sma50Val) sma20vs50 = 'GOLDEN_CROSS';
      else if (sma20Prev >= sma50Prev && sma20Val < sma50Val) sma20vs50 = 'DEATH_CROSS';
      else if (sma20Val > sma50Val) sma20vs50 = 'BULLISH';
      else sma20vs50 = 'BEARISH';
    }

    const ema9 = calcEMA(closes, 9);
    const ema21 = calcEMA(closes, 21);
    const ema9vs21: SwingAnalysis['ema9vs21'] =
      (!isNaN(ema9[last]) && !isNaN(ema21[last]))
        ? (ema9[last] > ema21[last] ? 'BULLISH' : ema9[last] < ema21[last] ? 'BEARISH' : 'NEUTRAL')
        : 'NEUTRAL';

    const atr = calcATR(history);
    const atrPercent = currentPrice > 0 ? (atr / currentPrice) * 100 : 0;

    const volumeTrend = calcVolumeTrend(history);

    const { support, resistance } = calcSupportResistance(history);

    // ── SWING SCORING (0-100) ──
    let swingScore = 50; // neutral base
    const reasons: string[] = [];
    const warnings: string[] = [];

    // 1. RSI (max ±15 points)
    // Oversold (30-40) = great swing buy; Overbought (70-80) = avoid or short
    if (rsiValue >= 30 && rsiValue <= 45) {
      swingScore += 15;
      reasons.push(`RSI ${rsiValue.toFixed(0)} — zona e blerjes, potencial rikuperimi`);
    } else if (rsiValue < 30) {
      swingScore += 10;
      reasons.push(`RSI ${rsiValue.toFixed(0)} — mbiveçuar, por rreziku i rënies vazhdon`);
      warnings.push(`RSI < 30: Rrezik kapitulimi`);
    } else if (rsiValue <= 60) {
      swingScore += 5;
      reasons.push(`RSI ${rsiValue.toFixed(0)} — neutral, hapësirë për rritje`);
    } else if (rsiValue <= 70) {
      swingScore -= 3;
      warnings.push(`RSI ${rsiValue.toFixed(0)}: Duke u afruar në zonën e shitjes`);
    } else {
      swingScore -= 15;
      warnings.push(`RSI ${rsiValue.toFixed(0)}: Mbishitur — rrezik kthimi`);
    }

    // 2. MACD Histogram (max ±12 points)
    if (macdSignal === 'BULLISH') {
      swingScore += 12;
      reasons.push('MACD histogram rritet — momentum pozitiv');
    } else if (macdSignal === 'BEARISH') {
      swingScore -= 12;
      warnings.push('MACD histogram bie — momentum negativ');
    }

    // 3. Bollinger Band position (max ±10 points)
    // Best swing buy: near lower band (bollPosition near -1)
    if (bollPosition <= -0.5) {
      swingScore += 10;
      reasons.push(`Çmimi af Bollinger Lower Band — potencial rikuperimi`);
    } else if (bollPosition <= 0) {
      swingScore += 5;
    } else if (bollPosition >= 0.7) {
      swingScore -= 10;
      warnings.push(`Çmimi af Bollinger Upper Band — rrezik kthimi poshtë`);
    } else {
      swingScore -= 3;
    }

    // Bollinger Squeeze bonus (breakout incoming)
    if (bollSqueeze) {
      swingScore += 5;
      reasons.push('Bollinger Squeeze — potencial breakout i afërt');
    }

    // 4. SMA 20/50 Crossover (max ±10 points)
    if (sma20vs50 === 'GOLDEN_CROSS') {
      swingScore += 10;
      reasons.push('Golden Cross (SMA20 > SMA50) — sinjal i fortë bullish');
    } else if (sma20vs50 === 'DEATH_CROSS') {
      swingScore -= 10;
      warnings.push('Death Cross (SMA20 < SMA50) — sinjal i fortë bearish');
    } else if (sma20vs50 === 'BULLISH') {
      swingScore += 6;
    } else if (sma20vs50 === 'BEARISH') {
      swingScore -= 6;
    }

    // 5. EMA 9/21 Short-term trend (max ±6 points)
    if (ema9vs21 === 'BULLISH') {
      swingScore += 6;
    } else if (ema9vs21 === 'BEARISH') {
      swingScore -= 6;
    }

    // 6. Volume confirmation (max ±5 points)
    if (volumeTrend === 'RISING') {
      swingScore += 5;
      reasons.push('Volumi rritet — konfirmon drejtimin');
    } else if (volumeTrend === 'FALLING') {
      swingScore -= 3;
      warnings.push('Volumi bie — mungon konfirmimi');
    }

    // 7. Price above key MAs (max ±4 points)
    if (sma20Val > 0 && currentPrice > sma20Val) {
      swingScore += 2;
    } else if (sma20Val > 0) {
      swingScore -= 4;
      warnings.push('Çmimi nën SMA20 — trend afatshkurtër negativ');
    }
    if (sma50Val > 0 && currentPrice > sma50Val) {
      swingScore += 2;
    }

    // ── Compute Entry / Stop Loss / Target ──
    let entryPrice = currentPrice;
    let stopLoss: number;
    let targetPrice: number;

    if (swingScore >= 55) {
      // BULLISH SWING SETUP
      // Entry: at or slightly below current price (pullback entry)
      entryPrice = Math.min(currentPrice, support + (currentPrice - support) * 0.3);
      // Stop: below support or 2x ATR below entry
      stopLoss = Math.max(support - atr * 0.5, entryPrice - atr * 2);
      // Target: near resistance or 3x ATR above entry
      targetPrice = Math.min(resistance, entryPrice + atr * 3);
    } else {
      // NEUTRAL/BEARISH — use ATR-based levels
      entryPrice = currentPrice;
      stopLoss = currentPrice - atr * 1.5;
      targetPrice = currentPrice + atr * 2;
    }

    // Risk/Reward ratio
    const risk = entryPrice - stopLoss;
    const reward = targetPrice - entryPrice;
    const riskRewardRatio = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 0;

    // Cap score
    swingScore = Math.max(0, Math.min(100, swingScore));

    // Sort reasons (best first) and warnings
    reasons.sort((a, b) => {
      const scoreA = a.includes('RSI') && !a.includes('Rrezik') ? 3 : a.includes('MACD') ? 2 : a.includes('Golden') ? 3 : 1;
      const scoreB = b.includes('RSI') && !b.includes('Rrezik') ? 3 : b.includes('MACD') ? 2 : b.includes('Golden') ? 3 : 1;
      return scoreB - scoreA;
    });

    return {
      swingScore,
      rsi: parseFloat(rsiValue.toFixed(1)),
      macdSignal,
      macdHistogram: parseFloat(macdHist.toFixed(4)),
      bollingerPosition: parseFloat(bollPosition.toFixed(2)),
      bollingerSqueeze,
      sma20vs50,
      ema9vs21,
      atrPercent: parseFloat(atrPercent.toFixed(2)),
      volumeTrend,
      supportLevel: parseFloat(support.toFixed(2)),
      resistanceLevel: parseFloat(resistance.toFixed(2)),
      entryPrice: parseFloat(entryPrice.toFixed(2)),
      stopLoss: parseFloat(stopLoss.toFixed(2)),
      targetPrice: parseFloat(targetPrice.toFixed(2)),
      riskRewardRatio,
      swingReasons: reasons.slice(0, 4),
      warningFlags: warnings.slice(0, 3),
    };
  } catch (err) {
    console.error(`[SWING] ${ticker}: Error:`, err);
    return null;
  }
}

/**
 * Batch analyze swing for multiple tickers (parallel, with concurrency limit)
 */
export async function analyzeSwingBatch(
  tickers: string[],
  prices: Record<string, { price: number; change: number }>,
  concurrency = 5
): Promise<Record<string, SwingAnalysis>> {
  const results: Record<string, SwingAnalysis> = {};

  for (let i = 0; i < tickers.length; i += concurrency) {
    const batch = tickers.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (ticker) => {
        const priceData = prices[ticker];
        const price = priceData?.price || 0;
        if (price <= 0) return null;
        return analyzeSwing(ticker, price);
      })
    );

    batchResults.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) {
        results[batch[idx]] = result.value;
      }
    });

    // Small delay between batches
    if (i + concurrency < tickers.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return results;
}
