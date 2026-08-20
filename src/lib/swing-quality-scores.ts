// ═══════════════════════════════════════════════════════════════
// SWING QUALITY SCORES — Trend Quality, Sector Strength, Timeframe Alignment
// Bazuar në evidencë historike: trend-following, momentum, multi-timeframe
// ═══════════════════════════════════════════════════════════════════════════

// ── 1. Trend Quality Score ──
// Mat nëse aksioni është në trend të shëndetshëm për swing

export type TrendQualityInput = {
  price: number;
  sma20: number;
  sma50: number;
  sma200: number;
  return20d: number;
  return60d: number;
  isHigherHighsHigherLows: boolean;
};

export function computeTrendQualityScore(i: TrendQualityInput): number {
  let score = 0;

  if (i.price > i.sma20) score += 20;
  if (i.price > i.sma50) score += 20;
  if (i.sma50 > i.sma200) score += 20;
  if (i.return20d > 0) score += 10;
  if (i.return60d > 0) score += 10;
  if (i.isHigherHighsHigherLows) score += 10;

  // Penalties: i zgjatur ose i paqëndrueshëm
  const dist20 = i.sma20 > 0 ? ((i.price - i.sma20) / i.sma20) * 100 : 0;
  const dist50 = i.sma50 > 0 ? ((i.price - i.sma50) / i.sma50) * 100 : 0;

  if (dist20 > 12) score -= 10;
  if (dist50 > 18) score -= 10;
  if (i.return20d > 0 && i.return60d < 0) score -= 10;

  return Math.max(-100, Math.min(100, score));
}

// ── 2. Sector Relative Strength Score ──
// Preferon aksione me forcë relative ndaj SPY + sektori

export type SectorRelativeStrengthInput = {
  stockReturn20d: number;
  stockReturn60d: number;
  spyReturn20d: number;
  spyReturn60d: number;
  sectorReturn20d: number;
  sectorReturn60d: number;
  sectorRankPct?: number;
};

export function computeSectorRelativeStrengthScore(
  i: SectorRelativeStrengthInput,
): number {
  let score = 0;

  if (i.stockReturn20d > i.spyReturn20d) score += 25;
  if (i.stockReturn60d > i.spyReturn60d) score += 25;
  if (i.sectorReturn20d > i.spyReturn20d) score += 20;
  if (i.sectorReturn60d > i.spyReturn60d) score += 20;
  if ((i.sectorRankPct ?? 1) <= 0.33) score += 10;

  // Penalty: stock kalon SPY por sektori ngec
  if (i.stockReturn20d > i.spyReturn20d && i.sectorReturn20d < i.spyReturn20d - 3) {
    score -= 10;
  }
  // Penalty: sektori ecën mirë por stock-u ngec
  if (i.sectorReturn20d > i.spyReturn20d && i.stockReturn20d < i.sectorReturn20d - 5) {
    score -= 10;
  }

  return Math.max(-100, Math.min(100, score));
}

// ── 3. Multi-Timeframe Alignment ──
// Shmang BUY kur daily është bullish por 4H/weekly janë kundër

export type TimeframeAlignmentInput = {
  dailyBullish: boolean;
  h4BullishOrNeutral: boolean;
  weeklyBullishOrNeutral: boolean;
  weeklyStrongBearish: boolean;
  h4LostSwingSupport: boolean;
  counterTrendVsWeeklyAndSector: boolean;
};

export function computeTimeframeAlignmentScore(i: TimeframeAlignmentInput) {
  let score = 0;

  if (i.dailyBullish) score += 40;
  if (i.h4BullishOrNeutral) score += 30;
  if (i.weeklyBullishOrNeutral) score += 30;
  if (i.weeklyStrongBearish) score -= 25;
  if (i.h4LostSwingSupport) score -= 20;
  if (i.counterTrendVsWeeklyAndSector) score -= 15;

  const clamped = Math.max(-100, Math.min(100, score));
  const status =
    clamped >= 70 ? 'ALIGNED' :
    clamped >= 35 ? 'MIXED' :
    'CONFLICTED';

  return { score: clamped, status };
}

// ── Eligibility ──

export function isEligibleTopSwingStock(p: {
  finalDecision: string;
  hybridConfidence: number;
  trendQualityScore: number;
  sectorStrengthScore: number;
  timeframeAlignmentStatus: string;
  hasCriticalEventRisk: boolean;
  transitionRisk: number;
}): boolean {
  return (
    p.finalDecision === 'BUY' &&
    p.hybridConfidence >= 0.58 &&
    p.trendQualityScore >= 40 &&
    p.sectorStrengthScore >= 35 &&
    p.timeframeAlignmentStatus !== 'CONFLICTED' &&
    !p.hasCriticalEventRisk &&
    p.transitionRisk <= 0.65
  );
}

// ── Display Ranking Score ──

export function computeDisplayRankScore(params: {
  rawScore: number;
  hybridConfidence: number;
  trendQualityScore: number;
  sectorStrengthScore: number;
  timeframeAlignmentScore: number;
  riskFlagsCount: number;
}): number {
  const { rawScore, hybridConfidence, trendQualityScore, sectorStrengthScore, timeframeAlignmentScore, riskFlagsCount } = params;

  const base =
    rawScore * 0.40 +
    hybridConfidence * 100 * 0.25 +
    trendQualityScore * 0.15 +
    sectorStrengthScore * 0.10 +
    timeframeAlignmentScore * 0.10;

  // Bonus: pa risk flags
  const bonus = riskFlagsCount === 0 ? 3 : riskFlagsCount <= 1 ? 1 : -2;

  return Math.round(Math.max(0, Math.min(100, base + bonus)));
}

// ── Helpers: compute SMAs + returns from price array ──

export function computeSMA(closes: number[], period: number): number {
  if (closes.length < period) return 0;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function computeReturn(closes: number[], days: number): number {
  if (closes.length < days + 1) return 0;
  const current = closes[closes.length - 1];
  const past = closes[closes.length - 1 - days];
  return past > 0 ? ((current - past) / past) * 100 : 0;
}

export function detectHigherHighsHigherLows(closes: number[], lookback = 20): boolean {
  if (closes.length < lookback * 2) return false;
  const recent = closes.slice(-lookback);
  const prior = closes.slice(-lookback * 2, -lookback);

  const recentHigh = Math.max(...recent);
  const priorHigh = Math.max(...prior);
  const recentLow = Math.min(...recent);
  const priorLow = Math.min(...prior);

  return recentHigh > priorHigh && recentLow > priorLow;
}

// ── Determine timeframe alignment from price data ──

export function inferTimeframeAlignment(closes: number[], sma20: number, sma50: number, sma200: number): {
  dailyBullish: boolean;
  h4BullishOrNeutral: boolean;
  weeklyBullishOrNeutral: boolean;
  weeklyStrongBearish: boolean;
  h4LostSwingSupport: boolean;
  counterTrendVsWeeklyAndSector: boolean;
} {
  const price = closes[closes.length - 1];
  const shortTermReturn = closes.length >= 6 ? ((closes[closes.length - 1] - closes[closes.length - 6]) / closes[closes.length - 6]) * 100 : 0;
  const mediumTermReturn = closes.length >= 21 ? ((closes[closes.length - 1] - closes[closes.length - 21]) / closes[closes.length - 21]) * 100 : 0;

  const dailyBullish = price > sma20 && mediumTermReturn > -3;
  const h4BullishOrNeutral = shortTermReturn > -5;
  const weeklyBullishOrNeutral = price > sma50 && mediumTermReturn > -8;
  const weeklyStrongBearish = price < sma200 && mediumTermReturn < -15;
  const h4LostSwingSupport = shortTermReturn < -8 && price < sma20;
  const counterTrendVsWeeklyAndSector = !weeklyBullishOrNeutral && dailyBullish;

  return { dailyBullish, h4BullishOrNeutral, weeklyBullishOrNeutral, weeklyStrongBearish, h4LostSwingSupport, counterTrendVsWeeklyAndSector };
}
