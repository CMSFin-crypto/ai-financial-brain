// ============================================================
// Regime Policy — Per-regime trading parameters
// Defines confidence floors, allowed directions, weight multipliers,
// and NO_TRADE behavior for each market regime state.
// ============================================================

import type { IntelligentRegimeState } from './regime-intelligence';

// ─── Types ────────────────────────────────────────────────────

export interface RegimePolicy {
  regime: IntelligentRegimeState;
  confidenceFloor: number;     // minimum confidence to trade (0-100)
  allowLongs: boolean;
  allowShorts: boolean;
  noTradeBias: boolean;         // if true, lean toward NO_TRADE
  scoreMultiplier: number;      // multiplier for combined score
  spilloverWeightMultiplier: number; // boost/reduce spillover influence
  technicalWeightMultiplier: number;
  fundamentalWeightMultiplier: number;
  maxPositionSize: number;      // 0-1, fraction of normal position
  stopLossTightening: number;   // multiplier <1 = tighter stops
  // Weight overrides: which factor types get boosted/suppressed
  boostedFactors: string[];     // factor names to boost
  suppressedFactors: string[];  // factor names to suppress
}

// ─── Policy Definitions ───────────────────────────────────────

const POLICIES: Record<IntelligentRegimeState, RegimePolicy> = {
  BULL_LOW_VOL: {
    regime: 'BULL_LOW_VOL',
    confidenceFloor: 35,          // lower floor — trend is your friend
    allowLongs: true,
    allowShorts: true,             // shorts allowed but with lower conviction
    noTradeBias: false,
    scoreMultiplier: 1.05,         // slight boost
    spilloverWeightMultiplier: 0.6,  // less spillover influence
    technicalWeightMultiplier: 1.1,
    fundamentalWeightMultiplier: 1.2, // fundamentals matter more in calm trends
    maxPositionSize: 1.0,
    stopLossTightening: 1.0,       // normal stops
    boostedFactors: ['revenue_growth', 'profitability', 'valuation', 'maTrend', 'macdHistogram'],
    suppressedFactors: ['atr', 'vix1d'],
  },

  BEAR_HIGH_VOL: {
    regime: 'BEAR_HIGH_VOL',
    confidenceFloor: 55,          // higher floor — dangerous environment
    allowLongs: true,              // allowed but risky
    allowShorts: true,
    noTradeBias: true,             // lean toward NO_TRADE
    scoreMultiplier: 0.85,         // reduce conviction
    spilloverWeightMultiplier: 1.3,  // spillover more important
    technicalWeightMultiplier: 0.9,
    fundamentalWeightMultiplier: 0.7, // fundamentals less reliable in panic
    maxPositionSize: 0.6,
    stopLossTightening: 0.7,       // tighter stops
    boostedFactors: ['atr', 'vix1d', 'global_spillover', 'market_regime'],
    suppressedFactors: ['valuation', 'analystSentiment'],
  },

  PANIC_CAPITULATION: {
    regime: 'PANIC_CAPITULATION',
    confidenceFloor: 75,          // very high floor
    allowLongs: false,             // NO longs during capitulation
    allowShorts: false,            // NO shorts either — too risky
    noTradeBias: true,             // default to NO_TRADE
    scoreMultiplier: 0.5,          // heavy reduction
    spilloverWeightMultiplier: 1.8,  // spillover dominates
    technicalWeightMultiplier: 0.4,
    fundamentalWeightMultiplier: 0.2, // fundamentals meaningless in panic
    maxPositionSize: 0.0,          // no new positions
    stopLossTightening: 0.5,       // very tight if forced
    boostedFactors: ['global_spillover', 'atr', 'vix1d'],
    suppressedFactors: ['valuation', 'growth', 'profitability', 'analystSentiment', 'momentum'],
  },

  RELIEF_RALLY: {
    regime: 'RELIEF_RALLY',
    confidenceFloor: 50,          // moderate floor
    allowLongs: true,              // longs OK — that's the play
    allowShorts: false,            // no shorts during relief
    noTradeBias: false,
    scoreMultiplier: 1.15,         // boost conviction for longs
    spilloverWeightMultiplier: 1.6,  // spillover is KEY signal
    technicalWeightMultiplier: 1.0,
    fundamentalWeightMultiplier: 0.6, // fundamentals lag in relief
    maxPositionSize: 0.8,          // moderate size
    stopLossTightening: 0.8,       // slightly tighter
    boostedFactors: ['global_spillover', 'rsi', 'stochastic', 'oversoldScore', 'asiaDeceleration'],
    suppressedFactors: ['analystSentiment', 'valuation'],
  },

  RANGE_NEUTRAL: {
    regime: 'RANGE_NEUTRAL',
    confidenceFloor: 50,          // moderate floor — no edge
    allowLongs: true,
    allowShorts: true,
    noTradeBias: false,
    scoreMultiplier: 0.90,         // slight reduction
    spilloverWeightMultiplier: 0.8,
    technicalWeightMultiplier: 1.0,
    fundamentalWeightMultiplier: 1.0,
    maxPositionSize: 0.7,          // smaller positions
    stopLossTightening: 0.9,
    boostedFactors: ['rsi', 'bollinger', 'stochastic'], // mean-reversion factors
    suppressedFactors: ['maTrend', 'macdHistogram'], // trend-following less useful
  },
};

// ─── Public API ────────────────────────────────────────────────

/** Get the policy for a given regime state */
export function getRegimePolicy(regime: IntelligentRegimeState): RegimePolicy {
  return POLICIES[regime];
}

/** Get all policies (for API display) */
export function getAllRegimePolicies(): Record<IntelligentRegimeState, Omit<RegimePolicy, 'regime'>> {
  const result = {} as Record<IntelligentRegimeState, Omit<RegimePolicy, 'regime'>>;
  for (const [key, policy] of Object.entries(POLICIES)) {
    const { regime: _r, ...rest } = policy;
    result[key as IntelligentRegimeState] = rest;
  }
  return result;
}

/** Apply policy to a confidence value — returns adjusted confidence */
export function applyConfidenceFloor(raw: number, policy: RegimePolicy): number {
  return Math.max(raw, policy.noTradeBias ? policy.confidenceFloor + 10 : policy.confidenceFloor);
}

/** Check if a signal direction is allowed under the current policy */
export function isDirectionAllowed(
  signal: string,
  policy: RegimePolicy
): { allowed: boolean; reason?: string } {
  const isBuy = signal === 'BUY' || signal === 'STRONG_BUY';
  const isSell = signal === 'SELL' || signal === 'STRONG_SELL';

  if (isBuy && !policy.allowLongs) {
    return { allowed: false, reason: `Regimi ${policy.regime} nuk lejon BLERJET` };
  }
  if (isSell && !policy.allowShorts) {
    return { allowed: false, reason: `Regimi ${policy.regime} nuk lejon SHITJET` };
  }
  return { allowed: true };
}

/** Apply score multiplier from policy */
export function applyScoreMultiplier(score: number, policy: RegimePolicy): number {
  return Math.round(score * policy.scoreMultiplier * 100) / 100;
}
