// ============================================================
// TRADABILITY SCORE — Execution Quality Gate
//
// Separates "good forecast" from "good trade candidate".
// Even if a prediction is bullish, the stock may be untradeable
// due to poor liquidity, wide spreads, excessive gaps, or
// high expected slippage.
//
// Components:
// - Average daily dollar volume (liquidity)
// - Bid-ask spread estimate (from high-low range)
// - ATR relative to price (volatility for sizing)
// - Gap tendency (overnight gap frequency)
// - Slippage expectation
// - Minimum price filter (penny stock gate)
//
// Score: 0 to 100. Below 30 = UNTRADEABLE.
// ============================================================

import type { HistoricalDataPoint } from './alpha-vantage';

// ─── Types ────────────────────────────────────────────────────

export interface TradabilityInput {
  symbol: string;
  priceHistory: HistoricalDataPoint[];
  currentPrice: number;
  marketCap?: number;
  avgDollarVolume?: number;   // pre-computed if available
}

export interface TradabilityScore {
  symbol: string;
  /** Overall tradability: 0 to 100 */
  tradabilityScore: number;
  /** Gate: is this stock tradeable? */
  isTradeable: boolean;
  /** Liquidity score: 0-30 */
  liquidityScore: number;
  /** Spread estimate score: 0-25 */
  spreadScore: number;
  /** Volatility/ATR score: 0-20 */
  volatilityScore: number;
  /** Gap tendency score: 0-15 */
  gapScore: number;
  /** Price quality score: 0-10 */
  priceScore: number;
  /** Estimated spread in bps */
  estimatedSpreadBps: number;
  /** Estimated slippage per $100k in bps */
  estimatedSlippageBps: number;
  /** ATR as % of price */
  atrPct: number;
  /** Average daily dollar volume */
  avgDollarVolume: number;
  /** Reasons */
  reasons: string[];
  /** Risk flags */
  riskFlags: string[];
  /** Recommendation */
  recommendation: 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'POOR' | 'UNTRADEABLE';
}

// ─── ATR Computation ───────────────────────────────────────────

function computeATR(data: HistoricalDataPoint[], period: number = 14): number {
  if (data.length < period + 1) return 0;

  const trueRanges: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose),
    );
    trueRanges.push(tr);
  }

  // Simple average of last `period` true ranges
  const recent = trueRanges.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / period;
}

// ─── Core Computation ──────────────────────────────────────────

export function computeTradabilityScore(input: TradabilityInput): TradabilityScore {
  const { symbol, priceHistory, currentPrice, marketCap, avgDollarVolume } = input;
  const reasons: string[] = [];
  const riskFlags: string[] = [];

  // Defaults for insufficient data
  if (!priceHistory || priceHistory.length < 20) {
    return {
      symbol,
      tradabilityScore: 25,
      isTradeable: false,
      liquidityScore: 5,
      spreadScore: 5,
      volatilityScore: 5,
      gapScore: 5,
      priceScore: 5,
      estimatedSpreadBps: 50,
      estimatedSlippageBps: 30,
      atrPct: 0,
      avgDollarVolume: avgDollarVolume || 0,
      reasons: ['Të dhëna të pamjaftueshme për analize'],
      riskFlags: ['Mpak me pak se 20 ditë të dhëna'],
      recommendation: 'UNTRADEABLE',
    };
  }

  const recent20 = priceHistory.slice(-20);
  const recent60 = priceHistory.slice(-60);

  // ── 1. Liquidity Score (0-30) ──
  let liquidityScore = 0;
  const avgVolume = recent20.reduce((s, d) => s + d.volume, 0) / recent20.length;
  const dollarVol = avgDollarVolume || (avgVolume * currentPrice);

  if (dollarVol >= 50_000_000) {
    liquidityScore = 30; // $50M+/day = excellent
    reasons.push('Likuiditet i lartë ($50M+/ditë)');
  } else if (dollarVol >= 20_000_000) {
    liquidityScore = 25;
    reasons.push('Likuiditet i mirë ($20M+/ditë)');
  } else if (dollarVol >= 5_000_000) {
    liquidityScore = 18;
  } else if (dollarVol >= 1_000_000) {
    liquidityScore = 10;
    riskFlags.push('Likuiditet i ulët — rrezik slippage');
  } else {
    liquidityScore = 3;
    riskFlags.push('Shumë pak likuid — mos e tregto');
  }

  // ── 2. Spread Estimate Score (0-25) ──
  // Use (High-Low)/Close as proxy for intraday spread
  let spreadScore = 0;
  const avgHLRange = recent20.reduce((s, d) => s + (d.high - d.low), 0) / recent20.length;
  const spreadPct = currentPrice > 0 ? (avgHLRange / currentPrice) * 100 : 10;
  const estimatedSpreadBps = Math.round(spreadPct * 25); // Rough: spread ~ 25% of daily range

  if (spreadPct <= 1.0) {
    spreadScore = 25; // Very tight
    reasons.push('Spread i ngushtë');
  } else if (spreadPct <= 2.0) {
    spreadScore = 20;
  } else if (spreadPct <= 4.0) {
    spreadScore = 12;
  } else if (spreadPct <= 7.0) {
    spreadScore = 5;
    riskFlags.push('Spread i gjerë — kosto të larta');
  } else {
    spreadScore = 0;
    riskFlags.push('Spread shumë i gjerë — untradeable');
  }

  // ── 3. Volatility / ATR Score (0-20) ──
  // Moderate ATR is best (enough movement for profit, not too much for risk)
  let volatilityScore = 0;
  const atr = computeATR(priceHistory);
  const atrPct = currentPrice > 0 ? (atr / currentPrice) * 100 : 5;

  if (atrPct >= 1.0 && atrPct <= 3.5) {
    volatilityScore = 20; // Sweet spot
    reasons.push(`ATR ${atrPct.toFixed(1)}% — ideal për swing`);
  } else if (atrPct >= 0.5 && atrPct < 1.0) {
    volatilityScore = 12; // Low vol — smaller edge
    riskFlags.push('Volatilitet i ulët — edge i vogël');
  } else if (atrPct > 3.5 && atrPct <= 6.0) {
    volatilityScore = 12; // High vol — bigger stops needed
    riskFlags.push('Volatilitet i lartë — stop i gjerë');
  } else if (atrPct > 6.0) {
    volatilityScore = 3; // Extreme vol
    riskFlags.push('Volatilitet ekstrem — shumë i rrezikshëm');
  } else {
    volatilityScore = 5;
  }

  // ── 4. Gap Tendency Score (0-15) ──
  // Count overnight gaps > 1% in last 20 days
  let gapScore = 0;
  let gapCount = 0;
  let largeGapCount = 0;

  for (let i = 1; i < recent20.length; i++) {
    const prevClose = recent20[i - 1].close;
    const currOpen = recent20[i].open;
    const gapPct = prevClose > 0 ? ((currOpen - prevClose) / prevClose) * 100 : 0;
    if (Math.abs(gapPct) > 1.0) gapCount++;
    if (Math.abs(gapPct) > 3.0) largeGapCount++;
  }

  const gapFreq = gapCount / recent20.length;
  if (gapFreq <= 0.1) {
    gapScore = 15; // Rare gaps = predictable
    reasons.push('Gap-i i rrallë — çmimi i qëndrueshëm');
  } else if (gapFreq <= 0.25) {
    gapScore = 10;
  } else if (gapFreq <= 0.4) {
    gapScore = 5;
    riskFlags.push('Gap-i i shpeshtë — rrezik slide');
  } else {
    gapScore = 0;
    riskFlags.push('Gap shumë i shpeshtë — evito');
  }

  if (largeGapCount > 0) {
    riskFlags.push(`${largeGapCount} gap-a > 3% në 20 ditë`);
  }

  // ── 5. Price Quality Score (0-10) ──
  let priceScore = 0;
  if (currentPrice >= 15 && currentPrice <= 500) {
    priceScore = 10; // Ideal range
  } else if (currentPrice >= 5 && currentPrice < 15) {
    priceScore = 6;
    riskFlags.push('Çmim i ulët — rrezik shtesë');
  } else if (currentPrice > 500) {
    priceScore = 6; // High price = larger position size needed
    reasons.push('Çmim i lartë — kërkon kapital të vogël');
  } else {
    priceScore = 0; // Penny stock
    riskFlags.push('Penny stock — mos e tregto');
  }

  // ── Composite Score ──
  const tradabilityScore = Math.round(
    liquidityScore + spreadScore + volatilityScore + gapScore + priceScore
  );

  // ── Slippage Estimate ──
  // Based on spread + volume + volatility
  const volumeFactor = dollarVol >= 20_000_000 ? 1 : dollarVol >= 5_000_000 ? 2 : dollarVol >= 1_000_000 ? 5 : 15;
  const estimatedSlippageBps = Math.round(
    (estimatedSpreadBps * 0.5 + atrPct * 2) * volumeFactor / 10
  );

  // ── Gate Decision ──
  const isTradeable = tradabilityScore >= 30;
  let recommendation: TradabilityScore['recommendation'];
  if (tradabilityScore >= 80) recommendation = 'EXCELLENT';
  else if (tradabilityScore >= 60) recommendation = 'GOOD';
  else if (tradabilityScore >= 40) recommendation = 'ACCEPTABLE';
  else if (tradabilityScore >= 30) recommendation = 'POOR';
  else recommendation = 'UNTRADEABLE';

  return {
    symbol,
    tradabilityScore,
    isTradeable,
    liquidityScore,
    spreadScore,
    volatilityScore,
    gapScore,
    priceScore,
    estimatedSpreadBps,
    estimatedSlippageBps,
    atrPct: Math.round(atrPct * 100) / 100,
    avgDollarVolume: Math.round(dollarVol),
    reasons,
    riskFlags,
    recommendation,
  };
}

// ─── Batch Computation ──────────────────────────────────────────

export async function computeTradabilityBatch(
  inputs: TradabilityInput[],
): Promise<Map<string, TradabilityScore>> {
  const results = new Map<string, TradabilityScore>();
  for (const input of inputs) {
    results.set(input.symbol, computeTradabilityScore(input));
  }
  return results;
}

// ─── Feature for ML pipeline ───────────────────────────────────

export interface TradabilityFeature {
  tradability_score: number;
  is_tradeable: number;
  liquidity_score: number;
  spread_bps: number;
  atr_pct: number;
  gap_frequency: number;
  est_slippage_bps: number;
}

export function tradabilityToFeatures(t: TradabilityScore, gapFreq: number): TradabilityFeature {
  return {
    tradability_score: t.tradabilityScore,
    is_tradeable: t.isTradeable ? 1 : 0,
    liquidity_score: t.liquidityScore,
    spread_bps: t.estimatedSpreadBps,
    atr_pct: t.atrPct,
    gap_frequency: gapFreq,
    est_slippage_bps: t.estimatedSlippageBps,
  };
}