// ============================================================
// Regime Router - Adjusts weights, score, confidence per regime.
// User-provided base: category-level weight multipliers.
// ============================================================

import type { MarketRegimeState } from './regime-intelligence';
import type { RegimePolicy } from './regime-policy';
import { getRegimePolicy } from './regime-policy';

// --- Types ---------------------------------------------------

export type RoutedWeights = Record<string, number>;

export type RegimeRoutingResult = {
  weights: RoutedWeights;
  adjustedScore: number;
  adjustedConfidence: number;
  blockedReason?: string;
};

// --- Helpers -------------------------------------------------

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// --- Main routing function -----------------------------------

export function routeByRegime(params: {
  regime: MarketRegimeState;
  policy: RegimePolicy;
  baseWeights: Record<string, number>;
  rawScore: number;
  rawConfidence: number;
  signal: 'BUY' | 'SELL' | 'HOLD';
}): RegimeRoutingResult {
  const { policy, baseWeights, rawScore, rawConfidence, signal } = params;

  // 1. Apply category-level weight multipliers
  const weights: RoutedWeights = {};
  for (const [k, v] of Object.entries(baseWeights)) {
    if (k.includes('spillover')) weights[k] = v * policy.spilloverWeightMultiplier;
    else if (k.includes('technical') || k === 'maTrend' || k === 'macdHistogram' || k === 'rsi' || k === 'bollinger' || k === 'stochastic' || k === 'atr' || k === 'obv' || k === 'volumeConfirm' || k === 'divergence' || k === 'adx')
      weights[k] = v * policy.technicalWeightMultiplier;
    else if (k.includes('fundamental') || k === 'valuation' || k === 'growth' || k === 'profitability' || k === 'analystSentiment' || k === 'debtHealth' || k === 'momentum')
      weights[k] = v * policy.fundamentalWeightMultiplier;
    else weights[k] = v;
  }

  // 2. Adjust score and confidence
  const adjustedScore = rawScore * policy.scoreMultiplier;
  let adjustedConfidence = clamp(rawConfidence * policy.scoreMultiplier, 0, 100);

  if (policy.noTradeBias) adjustedConfidence = clamp(adjustedConfidence - 5, 0, 100);

  // 3. Check direction blocking
  if (signal === 'BUY' && !policy.allowLongs) {
    return {
      weights,
      adjustedScore,
      adjustedConfidence,
      blockedReason: 'Regime nuk lejon long signals.',
    };
  }

  if (signal === 'SELL' && !policy.allowShorts) {
    return {
      weights,
      adjustedScore,
      adjustedConfidence,
      blockedReason: 'Regime nuk lejon short signals.',
    };
  }

  // 4. Check confidence floor
  if (adjustedConfidence < policy.confidenceFloor) {
    return {
      weights,
      adjustedScore,
      adjustedConfidence,
      blockedReason: `Confidence nen threshold-in te regjimit (${policy.confidenceFloor}).`,
    };
  }

  return { weights, adjustedScore, adjustedConfidence };
}

// --- Category multiplier summary (for API display) ------------

export function getRegimeModifierDetails(regime: MarketRegimeState): {
  category: string; multiplier: number;
}[] {
  const policy = getRegimePolicy(regime);
  return [
    { category: 'spillover', multiplier: policy.spilloverWeightMultiplier },
    { category: 'technical', multiplier: policy.technicalWeightMultiplier },
    { category: 'fundamental', multiplier: policy.fundamentalWeightMultiplier },
  ];
}
