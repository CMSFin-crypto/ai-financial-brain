// ═══════════════════════════════════════════════════════════════
// TECHNICAL INDICATORS LIBRARY — TypeScript
// RSI (Wilder's smoothing), MACD, Bollinger Bands, Confidence Score
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate RSI using Wilder's smoothing method.
 * Returns array of RSI values, same length as input (first `period` values are NaN).
 */
export function calculateRSI(closes: number[], period: number = 14): number[] {
  const rsi: number[] = new Array(closes.length).fill(NaN);

  if (closes.length < period + 1) return rsi;

  // Calculate initial average gain/loss
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) {
      avgGain += change;
    } else {
      avgLoss += Math.abs(change);
    }
  }

  avgGain /= period;
  avgLoss /= period;

  // First RSI value
  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

  // Subsequent values using Wilder's smoothing
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }

  return rsi;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence).
 * Returns { macd[], signal[], histogram[] }.
 * Leading NaN values equal to (slow - 1 + signal - 1) entries.
 */
export function calculateMACD(
  closes: number[],
  fast: number = 12,
  slow: number = 26,
  signal: number = 9
): { macd: number[]; signal: number[]; histogram: number[] } {
  const macdLine: number[] = new Array(closes.length).fill(NaN);
  const signalLine: number[] = new Array(closes.length).fill(NaN);
  const histogram: number[] = new Array(closes.length).fill(NaN);

  if (closes.length < slow) {
    return { macd: macdLine, signal: signalLine, histogram };
  }

  // Calculate EMA helper
  const ema = (data: number[], p: number): number[] => {
    const result: number[] = new Array(data.length).fill(NaN);
    if (data.length < p) return result;

    // First EMA value = SMA
    let sum = 0;
    for (let i = 0; i < p; i++) sum += data[i];
    result[p - 1] = sum / p;

    const k = 2 / (p + 1);
    for (let i = p; i < data.length; i++) {
      result[i] = data[i] * k + result[i - 1] * (1 - k);
    }

    return result;
  };

  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);

  // MACD line = fast EMA - slow EMA
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(emaFast[i]) && !isNaN(emaSlow[i])) {
      macdLine[i] = emaFast[i] - emaSlow[i];
    }
  }

  // Collect valid MACD values for signal calculation
  const validMacd: number[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (!isNaN(macdLine[i])) validMacd.push(macdLine[i]);
  }

  if (validMacd.length < signal) {
    return { macd: macdLine, signal: signalLine, histogram };
  }

  // Calculate signal line (EMA of MACD)
  const emaSignal = ema(validMacd, signal);

  // Map signal back
  let validIdx = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (!isNaN(macdLine[i])) {
      if (!isNaN(emaSignal[validIdx])) {
        signalLine[i] = emaSignal[validIdx];
        histogram[i] = macdLine[i] - signalLine[i];
      }
      validIdx++;
    }
  }

  return { macd: macdLine, signal: signalLine, histogram };
}

/**
 * Calculate Bollinger Bands.
 * Returns { upper[], middle[], lower[] }.
 */
export function calculateBollinger(
  closes: number[],
  period: number = 20,
  stdDev: number = 2
): { upper: number[]; middle: number[]; lower: number[] } {
  const upper: number[] = new Array(closes.length).fill(NaN);
  const middle: number[] = new Array(closes.length).fill(NaN);
  const lower: number[] = new Array(closes.length).fill(NaN);

  if (closes.length < period) {
    return { upper, middle, lower };
  }

  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;

    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);

    middle[i] = mean;
    upper[i] = mean + stdDev * std;
    lower[i] = mean - stdDev * std;
  }

  return { upper, middle, lower };
}

/**
 * Calculate a composite confidence score (0-100) from multiple indicators.
 * Weights: RSI 30%, MACD 30%, Bollinger 25%, Volume 15%
 */
export function calculateConfidenceScore(data: Array<{
  close: number;
  high: number;
  low: number;
  volume: number;
}>): {
  score: number;
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
  indicators: {
    RSI: { value: number; signal: 'BUY' | 'SELL' | 'NEUTRAL'; score: number };
    MACD: { value: number; signal: 'BUY' | 'SELL' | 'NEUTRAL'; score: number };
    Bollinger: { position: string; signal: 'BUY' | 'SELL' | 'NEUTRAL'; score: number };
    Volume: { ratio: number; signal: 'BUY' | 'SELL' | 'NEUTRAL'; score: number };
  };
} {
  const closes = data.map(d => d.close);

  // RSI
  const rsiValues = calculateRSI(closes);
  const rsiValue = rsiValues.filter(v => !isNaN(v)).pop() ?? 50;
  let rsiSignal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
  let rsiScore = 50;
  if (rsiValue < 30) {
    rsiSignal = 'BUY';
    // Score from 50 to 100 as RSI goes from 30 to 0
    rsiScore = 50 + ((30 - rsiValue) / 30) * 50;
  } else if (rsiValue > 70) {
    rsiSignal = 'SELL';
    // Score from 0 to 50 as RSI goes from 70 to 100
    rsiScore = 50 - ((rsiValue - 70) / 30) * 50;
  } else {
    // In neutral zone, slightly center-weighted
    rsiScore = 50 - ((rsiValue - 50) / 20) * 20;
  }

  // MACD
  const { histogram } = calculateMACD(closes);
  const macdHistValue = histogram.filter(v => !isNaN(v)).pop() ?? 0;
  let macdSignal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
  let macdScore = 50;
  if (macdHistValue > 0) {
    macdSignal = 'BUY';
    macdScore = Math.min(100, 50 + Math.abs(macdHistValue) * 5);
  } else if (macdHistValue < 0) {
    macdSignal = 'SELL';
    macdScore = Math.max(0, 50 - Math.abs(macdHistValue) * 5);
  }

  // Bollinger
  const { upper, lower } = calculateBollinger(closes);
  const lastIdx = closes.length - 1;
  const bbUpper = upper[lastIdx] ?? closes[lastIdx] * 1.05;
  const bbLower = lower[lastIdx] ?? closes[lastIdx] * 0.95;
  const bbMiddle = (bbUpper + bbLower) / 2;
  const bbRange = bbUpper - bbLower;
  let bollingerPosition = 'MID';
  let bollingerSignal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
  let bollingerScore = 50;

  if (bbRange > 0) {
    const pctPosition = (closes[lastIdx] - bbLower) / bbRange;
    if (closes[lastIdx] <= bbLower) {
      bollingerPosition = 'LOWER';
      bollingerSignal = 'BUY';
      bollingerScore = 80 + (bbLower - closes[lastIdx]) / bbRange * 20;
    } else if (closes[lastIdx] >= bbUpper) {
      bollingerPosition = 'UPPER';
      bollingerSignal = 'SELL';
      bollingerScore = 20 - (closes[lastIdx] - bbUpper) / bbRange * 20;
    } else {
      bollingerPosition = 'MID';
      bollingerSignal = 'NEUTRAL';
      bollingerScore = 100 - pctPosition * 100;
    }
  }

  // Volume
  const volumes = data.map(d => d.volume);
  const recentVolume = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length);
  const volumeRatio = avgVolume > 0 ? recentVolume / avgVolume : 1;
  let volumeSignal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
  let volumeScore = 50;

  if (volumeRatio > 1.5) {
    volumeSignal = 'BUY';
    volumeScore = Math.min(100, 50 + (volumeRatio - 1.5) * 20);
  } else if (volumeRatio < 0.5) {
    volumeSignal = 'SELL';
    volumeScore = Math.max(0, 50 - (0.5 - volumeRatio) * 20);
  }

  // Composite score
  const compositeScore =
    rsiScore * 0.30 +
    macdScore * 0.30 +
    bollingerScore * 0.25 +
    volumeScore * 0.15;

  const finalScore = Math.round(Math.max(0, Math.min(100, compositeScore)) * 10) / 10;

  // Determine overall signal
  let overallSignal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
  if (finalScore > 65) {
    overallSignal = 'BUY';
  } else if (finalScore < 35) {
    overallSignal = 'SELL';
  }

  return {
    score: finalScore,
    signal: overallSignal,
    indicators: {
      RSI: {
        value: Math.round(rsiValue * 100) / 100,
        signal: rsiSignal,
        score: Math.round(rsiScore * 10) / 10,
      },
      MACD: {
        value: Math.round(macdHistValue * 10000) / 10000,
        signal: macdSignal,
        score: Math.round(macdScore * 10) / 10,
      },
      Bollinger: {
        position: bollingerPosition,
        signal: bollingerSignal,
        score: Math.round(bollingerScore * 10) / 10,
      },
      Volume: {
        ratio: Math.round(volumeRatio * 100) / 100,
        signal: volumeSignal,
        score: Math.round(volumeScore * 10) / 10,
      },
    },
  };
}

/**
 * Calculate Simple Moving Average.
 */
export function calculateSMA(closes: number[], period: number): number[] {
  const sma: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period) return sma;

  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    sma[i] = slice.reduce((a, b) => a + b, 0) / period;
  }

  return sma;
}