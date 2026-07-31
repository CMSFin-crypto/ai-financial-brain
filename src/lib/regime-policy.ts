// ============================================================
// Regime Policy - Per-regime trading parameters
// Defines confidence floors, allowed directions, weight multipliers.
// User-provided base: switch/case with clear per-state values.
// ============================================================

import type { MarketRegimeState } from './regime-intelligence';

// --- Types ---------------------------------------------------

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

// --- Policy definitions (user-provided values) -----------------

export function getRegimePolicy(regime: MarketRegimeState): RegimePolicy {
  switch (regime) {
    case 'BULL_LOW_VOL':
      return {
        confidenceFloor: 55,
        allowLongs: true,
        allowShorts: false,
        noTradeBias: false,
        scoreMultiplier: 1.05,
        spilloverWeightMultiplier: 0.95,
        technicalWeightMultiplier: 1.05,
        fundamentalWeightMultiplier: 1.0,
      };
    case 'BULL_HIGH_VOL':
      return {
        confidenceFloor: 60,
        allowLongs: true,
        allowShorts: false,
        noTradeBias: false,
        scoreMultiplier: 0.95,
        spilloverWeightMultiplier: 1.0,
        technicalWeightMultiplier: 1.0,
        fundamentalWeightMultiplier: 1.0,
      };
    case 'BEAR_LOW_VOL':
      return {
        confidenceFloor: 65,
        allowLongs: false,
        allowShorts: true,
        noTradeBias: false,
        scoreMultiplier: 0.9,
        spilloverWeightMultiplier: 1.05,
        technicalWeightMultiplier: 0.95,
        fundamentalWeightMultiplier: 1.0,
      };
    case 'BEAR_HIGH_VOL':
      return {
        confidenceFloor: 70,
        allowLongs: false,
        allowShorts: true,
        noTradeBias: true,
        scoreMultiplier: 0.8,
        spilloverWeightMultiplier: 1.1,
        technicalWeightMultiplier: 0.9,
        fundamentalWeightMultiplier: 1.0,
      };
    case 'PANIC_CAPITULATION':
      return {
        confidenceFloor: 75,
        allowLongs: false,
        allowShorts: false,
        noTradeBias: true,
        scoreMultiplier: 0.7,
        spilloverWeightMultiplier: 1.2,
        technicalWeightMultiplier: 0.85,
        fundamentalWeightMultiplier: 1.0,
      };
    case 'RELIEF_RALLY':
      return {
        confidenceFloor: 62,
        allowLongs: true,
        allowShorts: false,
        noTradeBias: false,
        scoreMultiplier: 1.1,
        spilloverWeightMultiplier: 1.35,
        technicalWeightMultiplier: 0.95,
        fundamentalWeightMultiplier: 1.0,
      };
    case 'RANGE_NEUTRAL':
    default:
      return {
        confidenceFloor: 58,
        allowLongs: true,
        allowShorts: true,
        noTradeBias: true,
        scoreMultiplier: 0.9,
        spilloverWeightMultiplier: 1.0,
        technicalWeightMultiplier: 1.0,
        fundamentalWeightMultiplier: 1.0,
      };
  }
}

// --- All policies (for API /regime/current?policies=true) ----

const ALL_STATES: MarketRegimeState[] = [
  'BULL_LOW_VOL', 'BULL_HIGH_VOL', 'BEAR_LOW_VOL', 'BEAR_HIGH_VOL',
  'PANIC_CAPITULATION', 'RELIEF_RALLY', 'RANGE_NEUTRAL',
];

export function getAllPolicies(): Record<MarketRegimeState, RegimePolicy> {
  const out = {} as Record<MarketRegimeState, RegimePolicy>;
  for (const state of ALL_STATES) out[state] = getRegimePolicy(state);
  return out;
}
