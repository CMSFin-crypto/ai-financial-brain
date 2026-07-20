// ============================================================
// Hybrid Prediction Engine — Combines Technical + Fundamental + Learning
// 60% technical, 40% fundamental (if available)
// Weights adjusted by learning system based on historical accuracy
// All AI insights generated in Albanian
// ============================================================

import { predictStock, type PredictionResult, type PricePoint } from '@/lib/prediction-engine';
import { analyzeFundamentals, type FundamentalScore } from '@/lib/fundamental-engine';
import type { YahooFundamentals } from '@/lib/alpha-vantage';
import {
  recordFromHybridResult,
  getAdjustedWeights,
  getLearningContext,
  getStats,
  type LearningSnapshot,
} from '@/lib/indicator-learning';

// ─── Types ──────────────────────────────────────────────────

export interface HybridPredictionResult extends PredictionResult {
  fundamentalScore: FundamentalScore | null;
  fundamentalAvailable: boolean;
  aiInsight: string;
  totalScore: number;
  hybridConfidence: number;
  learningInsight?: string;
  learningStats?: LearningSnapshot;
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
  learningCtx: string,
): string {
  const techDirection = directionLabel(techResult.direction);
  const techScore = techResult.score;

  // Start with base insight
  let insight = '';

  if (!fundScore) {
    insight = `${symbol} tregon sinjale ${techDirection} bazuar në 15 indikatorë teknikë me besim ${techResult.confidence.toFixed(0)}%.`;
  } else {
    const fundSignal = fundScore.signal;
    const fundDirection = directionLabelFund(fundSignal);
    const fundScoreVal = fundScore.score;

    const techBullish = techScore > 0;
    const fundBullish = fundScoreVal > 0;
    const agree = techBullish === fundBullish;

    if (agree && techBullish) {
      const peInfo = fundScore.factors.valuation.description;
      insight = `${symbol} shfaq sinjale bulliz të forta nga analiza teknike (pikët: ${techScore > 0 ? '+' : ''}${techScore}) dhe konfirmon me fundamente ${fundDirection} (${peInfo.split('.')[0]}). Besimi hibrid: ${hybridConf.toFixed(0)}%.`;
    } else if (agree && !techBullish) {
      insight = `${symbol} tregon sinjale negative si nga teknika (pikët: ${techScore}) ashtu edhe nga fundamentet (${fundScoreVal}). Kujdes i lartë i këshilluar.`;
    } else {
      const techDominant = Math.abs(techScore) > Math.abs(fundScoreVal);
      const dominantSide = techDominant ? 'teknika' : 'fundamentet';
      insight = `${symbol} tregon sinjale të përzier. Teknika tregon ${techDirection} (pikët: ${techScore > 0 ? '+' : ''}${techScore}), por fundamentet janë ${fundDirection} (pikët: ${fundScoreVal > 0 ? '+' : ''}${fundScoreVal}). ${dominantSide} mbizotëron.`;
    }
  }

  // Add learning context if available
  if (learningCtx) {
    insight += '\n\n' + learningCtx;
  }

  return insight;
}

// ─── Main Prediction Function ───────────────────────────────

export function predictHybrid(
  symbol: string,
  priceData: PricePoint[],
  fundamentals?: YahooFundamentals | null,
  currentPrice?: number,
  recordForLearning: boolean = true,
): HybridPredictionResult {
  // Get learning context (for AI insight)
  const learningCtx = getLearningContext();
  const stats = getStats();

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
    const techBullish = techScore > 0;
    const fundBullish = fundScore > 0;
    const agree = techBullish === fundBullish;

    if (agree) {
      hybridConfidence = clamp(techResult.confidence * 1.15, 0, 100);
    } else {
      hybridConfidence = clamp(techResult.confidence * 0.90, 0, 100);
    }
  }
  hybridConfidence = Math.round(hybridConfidence * 10) / 10;

  // Generate AI insight (includes learning context)
  const aiInsight = generateInsight(symbol, techResult, fundamentalScore, totalScore, hybridConfidence, learningCtx);

  // Generate learning insight
  let learningInsight: string | undefined;
  if (stats.totalEvaluated >= 5) {
    const parts: string[] = [];
    parts.push(`Saktesia e përgjithshme: ${(stats.overallAccuracy * 100).toFixed(0)}% (${stats.totalEvaluated} parashikime)`);

    // Best and worst indicators
    const accs = Object.values(stats.indicatorAccuracies)
      .filter(a => a.totalPredictions >= 3)
      .sort((a, b) => b.accuracy - a.accuracy);

    if (accs.length > 0) {
      const best = accs[0];
      const worst = accs[accs.length - 1];
      parts.push(`Indikatori më i saktë: ${best.description} (${(best.accuracy * 100).toFixed(0)}%)`);
      parts.push(`Indikatori më i paktë i saktë: ${worst.description} (${(worst.accuracy * 100).toFixed(0)}%)`);
    }

    if (stats.lessons.length > 0) {
      parts.push(`Mësime të mësuar: ${stats.lessons.length}`);
    }

    learningInsight = parts.join('. ') + '.';
  }

  const result: HybridPredictionResult = {
    ...techResult,
    fundamentalScore,
    fundamentalAvailable,
    aiInsight,
    totalScore,
    hybridConfidence,
    learningInsight,
    learningStats: stats.totalEvaluated >= 5 ? stats : undefined,
  };

  // Record for learning if requested and we have a price
  if (recordForLearning && currentPrice && currentPrice > 0) {
    try {
      recordFromHybridResult(symbol, {
        score: techResult.score,
        direction: techResult.direction,
        confidence: techResult.confidence,
        indicatorScores: techResult.indicatorScores,
        fundamentalScore: fundamentalScore ? {
          score: fundamentalScore.score,
          signal: fundamentalScore.signal,
          factors: fundamentalScore.factors,
        } : null,
        fundamentalAvailable,
        totalScore: result.totalScore,
        shortTerm: techResult.shortTerm,
        mediumTerm: techResult.mediumTerm,
      });
    } catch (err: any) {
      console.log(`[HYBRID] Failed to record ${symbol} for learning: ${err.message}`);
    }
  }

  return result;
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