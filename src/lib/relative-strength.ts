// ============================================================
// Relative Strength — stock performance vs SPY benchmark
// ============================================================

import { fetchHistoricalData } from './alpha-vantage';

export interface RelativeStrengthResult {
  ticker: string;
  rsScore: number;       // -100 to +100
  stockRoc5d: number;
  stockRoc20d: number;
  spyRoc5d: number;
  spyRoc20d: number;
  relativeRoc5d: number;
  relativeRoc20d: number;
  detectedAt: string;
}

// Cache
const rsCache = new Map<string, { data: RelativeStrengthResult; fetchedAt: number }>();
const RS_CACHE_MS = 15 * 60 * 1000; // 15 minutes

export async function calculateRelativeStrength(ticker: string): Promise<RelativeStrengthResult> {
  const cached = rsCache.get(ticker);
  if (cached && Date.now() - cached.fetchedAt < RS_CACHE_MS) {
    return cached.data;
  }

  const fallback: RelativeStrengthResult = {
    ticker,
    rsScore: 0,
    stockRoc5d: 0,
    stockRoc20d: 0,
    spyRoc5d: 0,
    spyRoc20d: 0,
    relativeRoc5d: 0,
    relativeRoc20d: 0,
    detectedAt: new Date().toISOString(),
  };

  try {
    const [stockData, spyData] = await Promise.all([
      fetchHistoricalData(ticker, '1mo'),
      fetchHistoricalData('SPY', '1mo'),
    ]);

    if (!stockData || stockData.length < 21 || !spyData || spyData.length < 21) {
      return fallback;
    }

    const stockCloses = stockData.map(d => d.close);
    const spyCloses = spyData.map(d => d.close);
    const sLast = stockCloses.length - 1;
    const spLast = spyCloses.length - 1;

    // ROC calculations
    const stockRoc5d = ((stockCloses[sLast] - stockCloses[sLast - 5]) / stockCloses[sLast - 5]) * 100;
    const stockRoc20d = ((stockCloses[sLast] - stockCloses[sLast - 20]) / stockCloses[sLast - 20]) * 100;
    const spyRoc5d = ((spyCloses[spLast] - spyCloses[spLast - 5]) / spyCloses[spLast - 5]) * 100;
    const spyRoc20d = ((spyCloses[spLast] - spyCloses[spLast - 20]) / spyCloses[spLast - 20]) * 100;

    const relativeRoc5d = stockRoc5d - spyRoc5d;
    const relativeRoc20d = stockRoc20d - spyRoc20d;

    // Normalize to -100..+100 (5% relative outperformance = +100)
    const rsScore = Math.max(-100, Math.min(100, relativeRoc5d * 10 + relativeRoc20d * 5));

    const result: RelativeStrengthResult = {
      ticker,
      rsScore: Math.round(rsScore * 100) / 100,
      stockRoc5d: Math.round(stockRoc5d * 100) / 100,
      stockRoc20d: Math.round(stockRoc20d * 100) / 100,
      spyRoc5d: Math.round(spyRoc5d * 100) / 100,
      spyRoc20d: Math.round(spyRoc20d * 100) / 100,
      relativeRoc5d: Math.round(relativeRoc5d * 100) / 100,
      relativeRoc20d: Math.round(relativeRoc20d * 100) / 100,
      detectedAt: new Date().toISOString(),
    };

    rsCache.set(ticker, { data: result, fetchedAt: Date.now() });
    return result;
  } catch (err) {
    console.error(`[RS] Failed for ${ticker}:`, err);
    return fallback;
  }
}
