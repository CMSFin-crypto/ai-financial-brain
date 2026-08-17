// ============================================================
// Ross Cameron 5 Pillars Momentum Scanner
//
// Bazuar nė metodologjine e famshme tė Warrior Trading:
//   1. RELATIVE VOLUME ≥ 5x  — Volumi aktual vs mesatarja 30-ditore
//   2. FLOAT < 100M shares  — Shares outstanding tė ulėta
//   3. PRICE RANGE $2-$20   — Çmimi nė zonėn optimale pėr day trading
//   4. FIRST GREEN CANDLE   — First bullish candle pas red candles
//   5. PRE-MARKET GAP UP   — Gap up para hapjes sė tregut
//
// Pėrshtatje pėr tė dhėnat tona:
//   - Pillar 1: Llogaritet nga historical data (30-ditorë avg volume)
//   - Pillar 2: Pėrdor shares nga StockProfile (miliona)
//   - Pillar 3: Çmimi aktual nga live prices
//   - Pillar 4: Candle pattern nga historical data e fundit
//   - Pillar 5: Price change % si proxy pėr gap (nėse ≥ 2% gap up)
//
// Scoring: 
//   - 5/5 pillars = "Setup i Plotė" (mė i miri)
//   - 4/5 = "Setup i Fortė"
//   - 3/5 = "Setup i Mirė"
//   - 2/5 = "Potencial i Limituar"
//   - 0-1/5 = "Asnje Setup"
// ============================================================

import { fetchHistoricalData, type HistoricalDataPoint } from '@/lib/alpha-vantage';

// ─── Types ──────────────────────────────────────────────────

export interface PillarResult {
  passed: boolean;
  value: number;        // vlera aktuale
  threshold: string;    // kufiri
  detail: string;       // shprehje e shkurtė
}

export interface FivePillarsResult {
  ticker: string;
  company: string;
  sector: string;
  currentPrice: number;
  priceChange: number;
  pillarsPassed: number;
  pillar1_relVolume: PillarResult;
  pillar2_float: PillarResult;
  pillar3_priceRange: PillarResult;
  pillar4_greenCandle: PillarResult;
  pillar5_gapUp: PillarResult;
  overallGrade: 'PERFECT' | 'STRONG' | 'GOOD' | 'LIMITED' | 'NONE';
  momentumScore: number; // 0-100 composite
  reasons: string[];
  warnings: string[];
}

// ─── Thresholds (konfigurueshme) ─────────────────────────────

const CONFIG = {
  relVolumeMin: 5,          // 5x mesatarja
  floatMaxMillions: 100,    // 100M shares
  priceMin: 2,
  priceMax: 50,             // Adapted for our stock universe
  gapUpMin: 2,              // 2% gap up
  volumeLookback: 30,       // 30 ditė pėr mesataren e volumit
};

// ─── Individual Pillar Checkers ──────────────────────────────

function checkPillar1_RelativeVolume(
  history: HistoricalDataPoint[],
  currentVolume: number
): PillarResult {
  if (history.length < 10) {
    return { passed: false, value: 0, threshold: `≥ ${CONFIG.relVolumeMin}x`, detail: 'Tė dhėna tė pamjaftueshme' };
  }

  // Calculate 30-day average volume
  const lookback = Math.min(CONFIG.volumeLookback, history.length - 1); // exclude today
  const volumes = history.slice(-lookback - 1, -1).map(d => d.volume);
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;

  if (avgVolume === 0) {
    return { passed: false, value: 0, threshold: `≥ ${CONFIG.relVolumeMin}x`, detail: 'Volumi mesatar = 0' };
  }

  // Use the latest day's volume if currentVolume not provided
  const todayVol = currentVolume > 0 ? currentVolume : history[history.length - 1].volume;
  const relVol = todayVol / avgVolume;

  return {
    passed: relVol >= CONFIG.relVolumeMin,
    value: parseFloat(relVol.toFixed(1)),
    threshold: `≥ ${CONFIG.relVolumeMin}x`,
    detail: `RelVol: ${relVol.toFixed(1)}x (mesatarja: ${(avgVolume / 1e6).toFixed(1)}M)`,
  };
}

function checkPillar2_Float(sharesOutstandingM: number): PillarResult {
  // sharesOutstandingM is in millions
  const floatM = sharesOutstandingM;

  return {
    passed: floatM > 0 && floatM <= CONFIG.floatMaxMillions,
    value: floatM,
    threshold: `≤ ${CONFIG.floatMaxMillions}M`,
    detail: floatM > 0 ? `Float: ${floatM >= 1000 ? (floatM / 1000).toFixed(1) + 'B' : floatM.toFixed(0) + 'M'} shares` : 'Nuk ka tė dhėna pėr float',
  };
}

function checkPillar3_PriceRange(price: number): PillarResult {
  const inRange = price >= CONFIG.priceMin && price <= CONFIG.priceMax;

  return {
    passed: inRange,
    value: price,
    threshold: `$${CONFIG.priceMin}-$${CONFIG.priceMax}`,
    detail: inRange
      ? `Çmimi $${price.toFixed(2)} ėshtė nė zonėn optimale`
      : price > CONFIG.priceMax
        ? `Çmimi $${price.toFixed(2)} ėshtė mė i lartė se $${CONFIG.priceMax}`
        : `Çmimi $${price.toFixed(2)} ėshtė mė i ulėt se $${CONFIG.priceMin}`,
  };
}

function checkPillar4_GreenCandle(history: HistoricalDataPoint[]): PillarResult {
  if (history.length < 5) {
    return { passed: false, value: 0, threshold: 'First Green Candle', detail: 'Tė dhėna tė pamjaftueshme' };
  }

  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  const prev2 = history.length >= 3 ? history[history.length - 3] : null;

  // Current candle is green (bullish): close > open
  const isGreen = last.close > last.open;
  // Previous candle was red
  const prevWasRed = prev.close < prev.open;
  // The green candle has meaningful body (at least 0.5% range)
  const bodyPercent = last.open > 0 ? ((last.close - last.open) / last.open) * 100 : 0;
  const hasBody = bodyPercent >= 0.3;

  // Strong green candle: green after 1-3 red candles with decent body
  const prev2WasRed = prev2 ? prev2.close < prev2.open : false;
  const consecutiveRedBefore = prevWasRed ? (prev2WasRed ? 2 : 1) : 0;

  // Scoring: ideal is first green after red candle(s)
  let passed = false;
  let detail = '';

  if (isGreen && hasBody && prevWasRed) {
    passed = true;
    detail = `Green candle (+${bodyPercent.toFixed(1)}%) pas ${consecutiveRedBefore} red candle(s) — First Green!`;
  } else if (isGreen && hasBody) {
    // Green but no prior red — still counts as momentum candle
    passed = true;
    detail = `Green candle (+${bodyPercent.toFixed(1)}%) me trupė të fortė`;
  } else if (isGreen) {
    passed = false;
    detail = `Green candle por trupa e vogėl (+${bodyPercent.toFixed(2)}%)`;
  } else {
    const redBody = last.open > 0 ? ((last.open - last.close) / last.open) * 100 : 0;
    passed = false;
    detail = `Red candle (-${redBody.toFixed(1)}%) — nuk ėshtė green`;
  }

  return {
    passed,
    value: parseFloat(bodyPercent.toFixed(2)),
    threshold: 'First Green Candle',
    detail,
  };
}

function checkPillar5_GapUp(priceChange: number, history: HistoricalDataPoint[]): PillarResult {
  // Price change as proxy for pre-market gap
  // A true gap up means today's open > yesterday's high
  let realGap = 0;
  let isRealGap = false;

  if (history.length >= 2) {
    const last = history[history.length - 1];
    const prev = history[history.length - 2];
    if (prev.high > 0) {
      realGap = ((last.open - prev.high) / prev.high) * 100;
      isRealGap = realGap > 0;
    }
  }

  // Use real gap if available, otherwise use price change
  const gapValue = isRealGap ? realGap : priceChange;
  const passed = gapValue >= CONFIG.gapUpMin;

  return {
    passed,
    value: parseFloat(gapValue.toFixed(2)),
    threshold: `≥ +${CONFIG.gapUpMin}%`,
    detail: isRealGap
      ? `Real Gap: ${realGap >= 0 ? '+' : ''}${realGap.toFixed(2)}% (open vs prev high)`
      : `Price Change: ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}% (proxy pėr gap)`,
  };
}

// ─── Compute Overall Grade ──────────────────────────────────

function computeGrade(passed: number): FivePillarsResult['overallGrade'] {
  if (passed >= 5) return 'PERFECT';
  if (passed >= 4) return 'STRONG';
  if (passed >= 3) return 'GOOD';
  if (passed >= 2) return 'LIMITED';
  return 'NONE';
}

// ─── Compute Momentum Score (0-100) ─────────────────────────

function computeMomentumScore(pillars: PillarResult[], priceChange: number): number {
  let score = 0;

  // Each pillar contributes up to 18 points
  for (const p of pillars) {
    if (p.passed) score += 18;
  }

  // Bonus for relative volume strength (up to +5 extra)
  const relVol = pillars[0]?.value || 0;
  if (relVol >= 10) score += 5;       // 10x+ volume = massive momentum
  else if (relVol >= 7) score += 3;    // 7x+ volume
  else if (relVol >= 5) score += 1;    // 5x = minimum

  // Bonus for gap strength (up to +5 extra)
  const gap = pillars[4]?.value || 0;
  if (gap >= 5) score += 5;
  else if (gap >= 3) score += 3;
  else if (gap >= 2) score += 1;

  // Small bonus for price momentum direction
  if (priceChange >= 3) score += 2;
  else if (priceChange >= 1) score += 1;

  return Math.max(0, Math.min(100, score));
}

// ─── Main Analysis Function ──────────────────────────────────

export async function analyzeFivePillars(
  ticker: string,
  currentPrice: number,
  priceChange: number,
  sharesOutstandingM: number,
  currentVolume?: number
): Promise<FivePillarsResult | null> {
  try {
    const history = await fetchHistoricalData(ticker, '3mo');
    if (!history || history.length < 15) {
      return null;
    }

    // Run all 5 pillar checks
    const pillar1 = checkPillar1_RelativeVolume(history, currentVolume || 0);
    const pillar2 = checkPillar2_Float(sharesOutstandingM);
    const pillar3 = checkPillar3_PriceRange(currentPrice);
    const pillar4 = checkPillar4_GreenCandle(history);
    const pillar5 = checkPillar5_GapUp(priceChange, history);

    const pillars = [pillar1, pillar2, pillar3, pillar4, pillar5];
    const pillarsPassed = pillars.filter(p => p.passed).length;

    // Generate reasons
    const reasons: string[] = [];
    const warnings: string[] = [];

    if (pillar1.passed) reasons.push(`RelVol ${pillar1.value}x — volumi eksplodiv`);
    else if (pillar1.value > 0) warnings.push(`RelVol vetėm ${pillar1.value}x (duhet ≥ ${CONFIG.relVolumeMin}x)`);

    if (pillar2.passed) reasons.push(`Float i ulėt: ${pillar2.detail.split(':')[1]?.trim() || ''}`);
    else warnings.push(`Float i lartė — levizje mė e ngadaltė`);

    if (pillar3.passed) reasons.push(`Çmimi nė zonėn optimale pėr day trading`);
    else warnings.push(pillar3.detail);

    if (pillar4.passed) reasons.push(pillar4.detail);
    else warnings.push(pillar4.detail);

    if (pillar5.passed) reasons.push(`Gap Up: +${pillar5.value}%`);
    else if (priceChange > 0) warnings.push(`Momentum i ulėt: +${priceChange.toFixed(2)}% (duhet ≥ +${CONFIG.gapUpMin}%)`);

    return {
      ticker,
      company: '', // caller fills
      sector: '',   // caller fills
      currentPrice,
      priceChange,
      pillarsPassed,
      pillar1_relVolume: pillar1,
      pillar2_float: pillar2,
      pillar3_priceRange: pillar3,
      pillar4_greenCandle: pillar4,
      pillar5_gapUp: pillar5,
      overallGrade: computeGrade(pillarsPassed),
      momentumScore: computeMomentumScore(pillars, priceChange),
      reasons: reasons.slice(0, 5),
      warnings: warnings.slice(0, 3),
    };
  } catch (err) {
    console.error(`[5-PILLARS] ${ticker}: Error:`, err);
    return null;
  }
}

// ─── Batch Analysis ──────────────────────────────────────────

export async function analyzeFivePillarsBatch(
  tickers: string[],
  prices: Record<string, { price: number; change: number }>,
  sharesMap: Record<string, number>, // ticker -> shares outstanding in millions
  concurrency = 5
): Promise<Record<string, FivePillarsResult>> {
  const results: Record<string, FivePillarsResult> = {};

  for (let i = 0; i < tickers.length; i += concurrency) {
    const batch = tickers.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (ticker) => {
        const priceData = prices[ticker];
        const price = priceData?.price || 0;
        if (price <= 0) return null;
        return analyzeFivePillars(
          ticker,
          price,
          priceData?.change || 0,
          sharesMap[ticker] || 0
        );
      })
    );

    batchResults.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) {
        results[batch[idx]] = result.value;
      }
    });

    if (i + concurrency < tickers.length) {
      await new Promise(r => setTimeout(r, 250));
    }
  }

  return results;
}
