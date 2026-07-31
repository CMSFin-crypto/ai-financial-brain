// ============================================================
// Lead-Lag Score — Integration point for the prediction pipeline.
// Wraps leadlag-features into a lightweight scoring function
// compatible with the existing factor system.
// ============================================================

import { computeLeadLagFeatures, type LeadLagFeatures } from './leadlag-features';

// ─── Types ────────────────────────────────────────────────────

export interface LeadLagScoreResult {
  score: number;            // -100 to +100
  weight: number;           // suggested weight in the model
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  features: LeadLagFeatures;
  description: string;
}

// ─── Cache ─────────────────────────────────────────────────────

const scoreCache = new Map<string, { result: LeadLagScoreResult; computedAt: number }>();
const SCORE_CACHE_MS = 30 * 60 * 1000;

// ─── Main Scoring Function ─────────────────────────────────────

export async function scoreLeadLag(symbol: string): Promise<LeadLagScoreResult> {
  // Check cache
  const cached = scoreCache.get(symbol);
  if (cached && Date.now() - cached.computedAt < SCORE_CACHE_MS) {
    return cached.result;
  }

  const features = await computeLeadLagFeatures(symbol);

  // Determine weight based on how much cross-market structure matters
  // Semis and tech benefit most from lead-lag analysis
  const isSemiOrTech = ['NVDA', 'AMD', 'MU', 'MRVL', 'INTC', 'TSM', 'AVGO', 'QCOM', 'SMH', 'SOXX', 'QQQ'].includes(symbol.toUpperCase());
  const baseWeight = isSemiOrTech ? 0.06 : 0.03;

  // Increase weight if there's active shock propagation
  let weight = baseWeight;
  if (features.activeShockOrigin && features.shockPropagationRisk > 40) {
    weight *= 1.5; // Boost weight when shock is propagating
  }

  const result: LeadLagScoreResult = {
    score: features.leadLagScore,
    weight: Math.round(weight * 1000) / 1000,
    signal: features.leadLagSignal as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
    features,
    description: features.leadLagReason,
  };

  scoreCache.set(symbol, { result, computedAt: Date.now() });
  return result;
}

// ─── Quick Check: Is Lead-Lag Relevant? ────────────────────────
// Returns true if the symbol has meaningful lead-lag structure.

export function isLeadLagRelevant(symbol: string): boolean {
  // Always compute for semis, tech, and major indices
  const alwaysRelevant = ['NVDA', 'AMD', 'MU', 'MRVL', 'INTC', 'TSM', 'AVGO', 'QCOM',
    'SMH', 'SOXX', 'QQQ', 'SPY', 'XLK', 'XLF'];
  return alwaysRelevant.includes(symbol.toUpperCase());
}

// ─── Invalidate Cache ──────────────────────────────────────────

export function invalidateLeadLagScoreCache(): void {
  scoreCache.clear();
}
