// ============================================================
// Hybrid Prediction Engine — Combines Technical + Fundamental
// 60% technical, 40% fundamental (if available)
// All AI insights generated in Albanian
// ============================================================

import { predictStock, type PredictionResult, type PricePoint } from '@/lib/prediction-engine';
import { analyzeFundamentals, type FundamentalScore } from '@/lib/fundamental-engine';
import type { YahooFundamentals } from '@/lib/alpha-vantage';

// ─── Types ──────────────────────────────────────────────────

export interface HybridPredictionResult extends PredictionResult {
  fundamentalScore: FundamentalScore | null;
  fundamentalAvailable: boolean;
  aiInsight: string;
  totalScore: number;
  hybridConfidence: number;
}

// ─── Helpers ────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function directionLabel(direction: string): string {
  switch (direction) {
    case 'STRONG_BUY': return 'blerje të forta';
    case 'BUY': return 'blerje';
    case 'NEUTRAL': return 'neutralitet';
    case 'SELL': return 'shitje';
    case 'STRONG_SELL': return 'shitje të forta';
    default: return direction;
  }
}

function directionLabelFund(signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL'): string {
  switch (signal) {
    case 'BULLISH': return 'pozitive';
    case 'BEARISH': return 'negative';
    case 'NEUTRAL': return 'neutrale';
  }
}

function generateInsight(
  symbol: string,
  techResult: PredictionResult,
  fundScore: FundamentalScore | null,
  totalScore: number,
  hybridConf: number,
): string {
  const techDirection = directionLabel(techResult.direction);
  const techScore = techResult.score;

  if (!fundScore) {
    // Technical only
    return `${symbol} tregon sinjale ${techDirection} bazuar në 15 indikatorë teknikë me besim ${techResult.confidence.toFixed(0)}%.`;
  }

  const fundSignal = fundScore.signal;
  const fundDirection = directionLabelFund(fundSignal);
  const fundScoreVal = fundScore.score;
  const earningsGrowth = fundScore.factors.growth.score;
  const revGrowth = fundScore.factors.growth.score;

  // Check if they agree
  const techBullish = techScore > 0;
  const fundBullish = fundScoreVal > 0;
  const agree = techBullish === fundBullish;

  if (agree && techBullish) {
    // Both bullish
    const earningsGr = (techResult as unknown as Record<string, unknown>)._earningsGrowth;
    const peInfo = fundScore.factors.valuation.description;

    return `${symbol} shfaq sinjale bulliz të forta nga analiza teknike (pikët: ${techScore > 0 ? '+' : ''}${techScore}) dhe konfirmon me fundamente ${fundDirection} (${peInfo.split('.')[0]}). Besimi hibrid: ${hybridConf.toFixed(0)}%.`;
  }

  if (agree && !techBullish) {
    // Both bearish
    return `${symbol} tregon sinjale negative si nga teknika (pikët: ${techScore}) ashtu edhe nga fundamentet (${fundScoreVal}). Kujdes i lartë i këshilluar.`;
  }

  // Mixed signals
  const techDominant = Math.abs(techScore) > Math.abs(fundScoreVal);
  const dominantSide = techDominant ? 'teknika' : 'fundamentet';
  const dominantScore = techDominant ? techScore : fundScoreVal;

  return `${symbol} tregon sinjale të përzier. Teknika tregon ${techDirection} (pikët: ${techScore > 0 ? '+' : ''}${techScore}), por fundamentet janë ${fundDirection} (pikët: ${fundScoreVal > 0 ? '+' : ''}${fundScoreVal}). ${dominantSide} mbizotëron.`;
}

// ─── Main Prediction Function ───────────────────────────────

export function predictHybrid(
  symbol: string,
  priceData: PricePoint[],
  fundamentals?: YahooFundamentals | null,
): HybridPredictionResult {
  // Run technical analysis
  const techResult = predictStock(symbol, priceData);

  // Run fundamental analysis if data available
  let fundamentalScore: FundamentalScore | null = null;
  let fundamentalAvailable = false;

  if (fundamentals && fundamentals.currentPrice > 0) {
    try {
      fundamentalScore = analyzeFundamentals(symbol, fundamentals);
      fundamentalAvailable = true;
    } catch {
      // If fundamental analysis fails, continue with technical only
      fundamentalScore = null;
      fundamentalAvailable = false;
    }
  }

  // Combine scores
  const techScore = techResult.score;
  const fundScore = fundamentalScore?.score ?? 0;
  const hasFundamentals = fundamentalAvailable;

  const totalScore = hasFundamentals
    ? clamp(Math.round((techScore * 0.6 + fundScore * 0.4) * 10) / 10, -100, 100)
    : techScore;

  // Hybrid confidence
  let hybridConfidence: number;
  if (!hasFundamentals) {
    hybridConfidence = techResult.confidence;
  } else {
    // Check agreement
    const techBullish = techScore > 0;
    const fundBullish = fundScore > 0;
    const agree = techBullish === fundBullish;

    if (agree) {
      // Boost by up to 15%
      hybridConfidence = clamp(techResult.confidence * 1.15, 0, 100);
    } else {
      // Reduce by 10%
      hybridConfidence = clamp(techResult.confidence * 0.90, 0, 100);
    }
  }
  hybridConfidence = Math.round(hybridConfidence * 10) / 10;

  // Generate AI insight
  const aiInsight = generateInsight(symbol, techResult, fundamentalScore, totalScore, hybridConfidence);

  return {
    ...techResult,
    fundamentalScore,
    fundamentalAvailable,
    aiInsight,
    totalScore,
    hybridConfidence,
  };
}

// ─── Ranking Functions ──────────────────────────────────────

export function rankHybridStocks(results: HybridPredictionResult[]): {
  topPicks: HybridPredictionResult[];
  topShorts: HybridPredictionResult[];
  mostConfident: HybridPredictionResult[];
  allResults: HybridPredictionResult[];
} {
  const byTotalScore = rankByTotalScore(results);

  const topPicks = byTotalScore
    .filter(r => r.direction === 'BUY' || r.direction === 'STRONG_BUY')
    .slice(0, 20);

  const topShorts = [...byTotalScore]
    .sort((a, b) => a.totalScore - b.totalScore)
    .filter(r => r.direction === 'SELL' || r.direction === 'STRONG_SELL')
    .slice(0, 10);

  const mostConfident = [...results]
    .sort((a, b) => b.hybridConfidence - a.hybridConfidence)
    .slice(0, 15);

  return {
    topPicks,
    topShorts,
    mostConfident,
    allResults: byTotalScore,
  };
}

export function rankByTotalScore(results: HybridPredictionResult[]): HybridPredictionResult[] {
  return [...results].sort((a, b) => b.totalScore - a.totalScore);
}