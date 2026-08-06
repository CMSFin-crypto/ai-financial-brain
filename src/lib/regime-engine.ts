// ============================================================
// Regime Engine — Unified regime detection + policy application.
//
// Wraps the existing regime-intelligence and regime-policy modules
// into a single coherent API that the prediction pipeline calls.
// Returns regime state, policy, and a single numeric score that
// the scoring pipeline can use directly.
// ============================================================

import { getRegimeWithPolicy, classifyRegime, type RegimeIntelligence, type MarketRegimeState, type RegimeDrivers } from './regime-intelligence';
import { getRegimePolicy, type RegimePolicy } from './regime-policy';

// ─── Types ──────────────────────────────────────────────────

export interface RegimeAssessment {
  regime: MarketRegimeState;
  confidence: number;       // 0 to 1
  transitionRisk: number;   // 0 to 1
  policy: RegimePolicy;
  drivers: RegimeDrivers;
  reasons: string[];

  /** Composite regime score: -100 to +100. Positive = favorable for longs. */
  regimeScore: number;

  /** Quick-access flags for scoring pipeline */
  isBullish: boolean;
  isBearish: boolean;
  isVolatile: boolean;
  allowLongs: boolean;
  allowShorts: boolean;
  scoreMultiplier: number;
}

// ─── Cache (reuse regime-intelligence's 30min cache) ───────

let cached: RegimeAssessment | null = null;
let cachedAt = 0;
const CACHE_MS = 15 * 60 * 1000; // 15 min — shorter than underlying cache

// ─── Core ──────────────────────────────────────────────────

/**
 * Get the current regime assessment.
 * This is the single entry point the prediction pipeline calls.
 */
export async function getRegimeAssessment(targetSymbol?: string): Promise<RegimeAssessment> {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;

  try {
    const intel = await getRegimeWithPolicy(targetSymbol ? { targetSymbol } : {});
    const policy = getRegimePolicy(intel.regime);

    const isBullish = intel.regime === 'BULL_LOW_VOL' || intel.regime === 'BULL_HIGH_VOL' || intel.regime === 'RELIEF_RALLY';
    const isBearish = intel.regime === 'BEAR_LOW_VOL' || intel.regime === 'BEAR_HIGH_VOL' || intel.regime === 'PANIC_CAPITULATION';
    const isVolatile = intel.regime.includes('HIGH_VOL') || intel.regime === 'PANIC_CAPITULATION';

    // Composite score: map regime to a numeric value
    // Based on confidence * direction + transition risk penalty
    const directionSign = isBullish ? 1 : isBearish ? -1 : 0;
    const confidenceComponent = intel.confidence * directionSign * 100;
    const transitionPenalty = intel.transitionRisk * -30; // high transition risk = uncertainty
    const regimeScore = Math.round(
      Math.max(-100, Math.min(100, confidenceComponent + transitionPenalty))
    );

    const result: RegimeAssessment = {
      regime: intel.regime,
      confidence: intel.confidence,
      transitionRisk: intel.transitionRisk,
      policy,
      drivers: intel.drivers,
      reasons: intel.reasons,
      regimeScore,
      isBullish,
      isBearish,
      isVolatile,
      allowLongs: policy.allowLongs,
      allowShorts: policy.allowShorts,
      scoreMultiplier: policy.scoreMultiplier,
    };

    cached = result;
    cachedAt = Date.now();
    return result;
  } catch (err) {
    console.warn('[REGIME-ENGINE] Detection failed, using fallback:', err);
    return getFallbackAssessment();
  }
}

/** Fallback regime when detection fails */
function getFallbackAssessment(): RegimeAssessment {
  return {
    regime: 'RANGE_NEUTRAL',
    confidence: 0.3,
    transitionRisk: 0.5,
    policy: getRegimePolicy('RANGE_NEUTRAL'),
    drivers: {
      spy1d: 0, spy5d: 0, spy20d: 0, qqq1d: 0, smh1d: 0,
      vixLevel: 18, vix1d: 0, kospi1d: 0, kospi2d: 0,
      semisBreadth: 0.5, spilloverScore: 0, marketAtrZ: 0,
    },
    reasons: ['Regime detection failed — using RANGE_NEUTRAL fallback'],
    regimeScore: 0,
    isBullish: false,
    isBearish: false,
    isVolatile: false,
    allowLongs: true,
    allowShorts: true,
    scoreMultiplier: 1.0,
  };
}

/** Clear cache (for testing) */
export function clearRegimeCache(): void {
  cached = null;
  cachedAt = 0;
}

// ─── Horizon-specific regime scoring ───────────────────────

/**
 * Get the regime weight for a given horizon.
 * Regime matters more for longer horizons.
 */
export function getRegimeWeight(horizonDays: number): number {
  switch (horizonDays) {
    case 1:  return 0.10;
    case 5:  return 0.15;
    case 20: return 0.20;
    default: return 0.10;
  }
}

/**
 * Compute regime contribution to the final score.
 * Returns a value in the range [-100, +100].
 */
export function computeRegimeContribution(assessment: RegimeAssessment, horizonDays: number): number {
  const weight = getRegimeWeight(horizonDays);
  return assessment.regimeScore * weight;
}
