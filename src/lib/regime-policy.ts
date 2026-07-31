// ============================================================
// Regime Policy — Per-regime trading parameters
// Defines confidence floors, allowed directions, weight multipliers.
// ============================================================

import type { MarketRegimeState } from './regime-intelligence';

// ─── Types ────────────────────────────────────────────────────

export type RegimePolicy = {
  confidenceFloor: number;
  allowLongs: boolean;
  allowShorts: boolean;
  noTradeBias: boolean;
  scoreMultiplier: number;
  spilloverWeightMultiplier: number;
  technicalWeightMultiplier: number;
  fundamentalWeightMultiplier: number;
};

// ─── Policy Definitions ───────────────────────────────────────

const POLICIES: Record<MarketRegimeState, RegimePolicy> = {
  BULL_LOW_VOL: {
    confidenceFloor: 55,
    allowLongs: true,
    allowShorts: false,
    noTradeBias: false,
    scoreMultiplier: 1.05,
    spilloverWeightMultiplier: 0.60,
    technicalWeightMultiplier: 1.10,
    fundamentalWeightMultiplier: 1.20,
  },
  BEAR_HIGH_VOL: {
    confidenceFloor: 65,
    allowLongs: true,
    allowShorts: true,
    noTradeBias: true,
    scoreMultiplier: 0.85,
    spilloverWeightMultiplier: 1.30,
    technicalWeightMultiplier: 0.90,
    fundamentalWeightMultiplier: 0.70,
  },
  PANIC_CAPITULATION: {
    confidenceFloor: 75,
    allowLongs: false,
    allowShorts: false,
    noTradeBias: true,
    scoreMultiplier: 0.70,
    spilloverWeightMultiplier: 1.80,
    technicalWeightMultiplier: 0.40,
    fundamentalWeightMultiplier: 0.20,
  },
  RELIEF_RALLY: {
    confidenceFloor: 62,
    allowLongs: true,
    allowShorts: false,
    noTradeBias: false,
    scoreMultiplier: 1.10,
    spilloverWeightMultiplier: 1.35,
    technicalWeightMultiplier: 0.95,
    fundamentalWeightMultiplier: 0.80,
  },
  BULL_HIGH_VOL: {
    confidenceFloor: 60,
    allowLongs: true,
    allowShorts: true,
    noTradeBias: false,
    scoreMultiplier: 1.0,
    spilloverWeightMultiplier: 0.80,
    technicalWeightMultiplier: 1.05,
    fundamentalWeightMultiplier: 0.90,
  },
  BEAR_LOW_VOL: {
    confidenceFloor: 55,
    allowLongs: false,
    allowShorts: true,
    noTradeBias: false,
    scoreMultiplier: 0.95,
    spilloverWeightMultiplier: 1.00,
    technicalWeightMultiplier: 0.90,
    fundamentalWeightMultiplier: 0.80,
  },
  RANGE_NEUTRAL: {
    confidenceFloor: 60,
    allowLongs: true,
    allowShorts: true,
    noTradeBias: false,
    scoreMultiplier: 0.90,
    spilloverWeightMultiplier: 0.80,
    technicalWeightMultiplier: 1.00,
    fundamentalWeightMultiplier: 1.00,
  },
};

// ─── Public API ────────────────────────────────────────────────

export function getRegimePolicy(regime: MarketRegimeState): RegimePolicy {
  return POLICIES[regime];
}

export function getAllPolicies(): Record<MarketRegimeState, RegimePolicy> {
  return { ...POLICIES };
}

/** Check if a signal direction is allowed under the policy */
export function isDirectionAllowed(
  signal: string,
  policy: RegimePolicy,
): { allowed: boolean; reason?: string } {
  const isBuy = signal === 'BUY' || signal === 'STRONG_BUY';
  const isSell = signal === 'SELL' || signal === 'STRONG_SELL';
  if (isBuy && !policy.allowLongs) {
    return { allowed: false, reason: `Regimi ${policy.regime ?? ''} nuk lejon BLERJET` };
  }
  if (isSell && !policy.allowShorts) {
    return { allowed: false, reason: `Regimi ${policy.regime ?? ''} nuk lejon SHITJET` };
  }
  return { allowed: true };
}
