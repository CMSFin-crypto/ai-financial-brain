// ============================================================
// Regime Detection — lightweight facade over regime-intelligence.
// Provides the detectMarketRegime() API that the user spec expects,
// backed by the existing 7-state classifier with real SPY/VIX data.
// ============================================================

import { getRegimeWithPolicy, type RegimeIntelligence, type MarketRegimeState } from './regime-intelligence';
import { getRegimePolicy, type RegimePolicy } from './regime-policy';

// ─── Public type (simplified) ─────────────────────────────────

export type SimpleRegime = {
  regime: string;
  confidence: number;
  transitionRisk: number;
  features: {
    volRatio: number;
    breadth: number;
    trendUp: boolean;
    trendDown: boolean;
    highVol: boolean;
    lowVol: boolean;
    adx: number | null;
  };
  // For integration with position sizing
  regimeMultiplier: number;
  scoreMultiplier: number;
  allowLongs: boolean;
  allowShorts: boolean;
};

// ─── 30-min cache ──────────────────────────────────────────────

let cached: SimpleRegime | null = null;
let cachedAt = 0;
const CACHE_MS = 30 * 60 * 1000;

// ─── Core ──────────────────────────────────────────────────────

export async function detectMarketRegime(): Promise<SimpleRegime> {
  // Return cached if fresh
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;

  try {
    const intel: RegimeIntelligence & { policy: RegimePolicy } = await getRegimeWithPolicy({} as any) as any;
    const policy: RegimePolicy = intel.policy;
    const d = intel.drivers;

    const volRatio = d.vix1d > 0 ? (d.vixLevel + d.vix1d) / d.vixLevel : 1;
    const breadth = Math.max(0, Math.min(100, (1 - (d.semisBreadth ?? 0.5)) * 100));
    const trendUp = d.spy20d > 0 && d.qqq1d >= 0;
    const trendDown = d.spy20d < -1 && d.qqq1d < 0;
    const highVol = d.vixLevel >= 20 || d.vix1d >= 2;
    const lowVol = d.vixLevel <= 18 && Math.abs(d.vix1d) <= 1;

    const result: SimpleRegime = {
      regime: intel.regime,
      confidence: intel.confidence,
      transitionRisk: intel.transitionRisk,
      features: {
        volRatio: Math.round(volRatio * 100) / 100,
        breadth: Math.round(breadth * 10) / 10,
        trendUp,
        trendDown,
        highVol,
        lowVol,
        adx: null, // ADX not in current regime drivers; can be enriched later
      },
      // Position sizing multipliers from policy
      regimeMultiplier: policy.scoreMultiplier,
      scoreMultiplier: policy.scoreMultiplier,
      allowLongs: policy.allowLongs,
      allowShorts: policy.allowShorts,
    };

    cached = result;
    cachedAt = Date.now();
    return result;
  } catch (err) {
    console.warn('[REGIME-DETECT] Fallback to default:', err);
    return {
      regime: 'RANGE_NEUTRAL',
      confidence: 0.3,
      transitionRisk: 0.5,
      features: { volRatio: 1, breadth: 50, trendUp: false, trendDown: false, highVol: false, lowVol: false, adx: null },
      regimeMultiplier: 1,
      scoreMultiplier: 1,
      allowLongs: true,
      allowShorts: true,
    };
  }
}

// ─── Map regime to position sizing multiplier ─────────────────

export function regimeToSizingMultiplier(regime: MarketRegimeState): number {
  const map: Record<string, number> = {
    BULL_LOW_VOL: 1.0,
    BULL_HIGH_VOL: 0.8,
    RANGE_NEUTRAL: 0.7,
    RELIEF_RALLY: 0.6,
    BEAR_LOW_VOL: 0.5,
    BEAR_HIGH_VOL: 0.3,
    PANIC_CAPITULATION: 0.1,
  };
  return map[regime] ?? 0.5;
}