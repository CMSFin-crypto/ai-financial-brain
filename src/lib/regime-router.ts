// ============================================================
// Regime Router — Adjusts score, confidence, and signal
// based on the current regime policy.
// This is where the same indicators get interpreted differently.
// ============================================================

import type { MarketRegimeState } from './regime-intelligence';
import type { RegimePolicy } from './regime-policy';

// ─── Types ────────────────────────────────────────────────────

export type RoutedWeights = Record<string, number>;

export type RegimeRoutingResult = {
  weights: RoutedWeights;
  adjustedScore: number;
  adjustedConfidence: number;
  blockedReason?: string;
};

// ─── Per-regime weight modifiers ─────────────────────────────

interface FactorMod { multiplier: number; reason: string; }

const MODIFIERS: Partial<Record<MarketRegimeState, Record<string, FactorMod>>> = {
  BULL_LOW_VOL: {
    maTrend:          { multiplier: 1.5, reason: 'Trend-following efektiv në bull të qetë' },
    macdHistogram:    { multiplier: 1.3, reason: 'Momentum i besueshëm' },
    valuation:        { multiplier: 1.2, reason: 'Vlerësimi i rëndësishëm' },
    growth:           { multiplier: 1.3, reason: 'Rritja çxon fituesit' },
    profitability:    { multiplier: 1.1, reason: 'Rentabiliteti mbështet tendencën' },
    atr:              { multiplier: 0.3, reason: 'Volatiliteti ulët' },
    stochastic:       { multiplier: 0.7, reason: 'Mean-reversion më pak i rëndësishëm' },
    global_spillover: { multiplier: 0.5, reason: 'Spillover më pak i rëndësishëm' },
  },
  BEAR_HIGH_VOL: {
    atr:              { multiplier: 1.8, reason: 'Volatiliteti lartë — risk critical' },
    global_spillover: { multiplier: 1.6, reason: 'Spillover çaktojnë selloff' },
    market_regime:    { multiplier: 1.4, reason: 'Regimi tregues kryesor' },
    maTrend:          { multiplier: 0.6, reason: 'Trend-following rrezikuar' },
    valuation:        { multiplier: 0.5, reason: 'Vlerësimi jo i besueshëm' },
    analystSentiment: { multiplier: 0.4, reason: 'Analistët vonohen' },
    growth:           { multiplier: 0.6, reason: 'Rritja nuk realizohet' },
  },
  PANIC_CAPITULATION: {
    global_spillover: { multiplier: 2.0, reason: 'Spillover DOMINON' },
    atr:              { multiplier: 2.0, reason: 'Volatiliteti i vetmi sinjal' },
    market_regime:    { multiplier: 1.5, reason: 'Regimi është gjithçka' },
    event_risk:       { multiplier: 1.5, reason: 'Ngjarjet shkaktojnë panic' },
    maTrend:          { multiplier: 0.1, reason: 'Trendi i thyer' },
    macdHistogram:    { multiplier: 0.1, reason: 'MACD i paqartë' },
    rsi:              { multiplier: 0.2, reason: 'RSI i paqartë' },
    valuation:        { multiplier: 0.0, reason: 'Pa kuptim' },
    growth:           { multiplier: 0.0, reason: 'Pa kuptim' },
    profitability:    { multiplier: 0.0, reason: 'Pa kuptim' },
    analystSentiment: { multiplier: 0.0, reason: 'Pa kuptim' },
    momentum:         { multiplier: 0.0, reason: 'Pa kuptim' },
    debtHealth:       { multiplier: 0.0, reason: 'Pa kuptim' },
    stochastic:       { multiplier: 0.1, reason: 'Paqartë' },
    obv:              { multiplier: 0.2, reason: 'Paqartë' },
    volumeConfirm:    { multiplier: 0.2, reason: 'Paqartë' },
    bollinger:        { multiplier: 0.3, reason: 'Paqartë' },
    divergence:       { multiplier: 0.2, reason: 'Paqartë' },
  },
  RELIEF_RALLY: {
    global_spillover: { multiplier: 2.0, reason: 'Spillover DOMINON' },
    rsi:              { multiplier: 1.5, reason: 'RSI oversold → bounce' },
    stochastic:       { multiplier: 1.5, reason: 'Stochastic oversold → bounce' },
    bollinger:        { multiplier: 1.3, reason: 'Bollinger lower band bounce' },
    atr:              { multiplier: 1.2, reason: 'Volatiliteti tregon potencial' },
    maTrend:          { multiplier: 0.4, reason: 'Trend-following vonohet' },
    macdHistogram:    { multiplier: 0.5, reason: 'MACD vonohet' },
    valuation:        { multiplier: 0.3, reason: 'Vlerësimi nuk çon relief' },
    analystSentiment: { multiplier: 0.3, reason: 'Analistët nuk e parë' },
  },
  BULL_HIGH_VOL: {
    atr:              { multiplier: 1.3, reason: 'Volatilitet i lartë — rrezik' },
    market_regime:    { multiplier: 1.2, reason: 'Regimi i rëndësishëm' },
    maTrend:          { multiplier: 1.2, reason: 'Trend mbështetet por volatilitet' },
    rsi:              { multiplier: 0.8, reason: 'RSI jopreciz në vol' },
    global_spillover: { multiplier: 0.7, reason: 'Spillover më pak' },
  },
  BEAR_LOW_VOL: {
    maTrend:          { multiplier: 1.2, reason: 'Trend i ulët në bear' },
    rsi:              { multiplier: 1.1, reason: 'RSI mean-reversion' },
    bollinger:        { multiplier: 1.1, reason: 'Bollinger bands' },
    global_spillover: { multiplier: 0.7, reason: 'Spillover më pak' },
    growth:           { multiplier: 0.6, reason: 'Rritja e ulët' },
  },
  RANGE_NEUTRAL: {
    rsi:              { multiplier: 1.4, reason: 'RSI mean-reversion' },
    bollinger:        { multiplier: 1.4, reason: 'Bollinger bands' },
    stochastic:       { multiplier: 1.3, reason: 'Stochastic mean-reversion' },
    maTrend:          { multiplier: 0.5, reason: 'Trend jo efektiv' },
    macdHistogram:    { multiplier: 0.6, reason: 'MACD jopreciz' },
    global_spillover: { multiplier: 0.7, reason: 'Spillover më pak' },
    adx:              { multiplier: 0.5, reason: 'ADX konfirmon range' },
  },
};

// ─── Normalize helper ──────────────────────────────────────

function normalizeRecord(record: Record<string, number>): void {
  const sum = Object.values(record).reduce((a, b) => a + b, 0);
  if (sum > 0) {
    for (const key of Object.keys(record)) {
      record[key] = Math.round((record[key] / sum) * 10000) / 10000;
    }
  }
}

// ─── Main routing function ────────────────────────────────

export function routeByRegime(params: {
  regime: MarketRegimeState;
  policy: RegimePolicy;
  baseWeights: Record<string, number>;
  rawScore: number;
  rawConfidence: number;
  signal: 'BUY' | 'SELL' | 'HOLD';
}): RegimeRoutingResult {
  const { regime, policy, baseWeights, rawScore, rawConfidence, signal } = params;

  // 1. Check direction blocking
  if (signal === 'BUY' && !policy.allowLongs) {
    return {
      weights: baseWeights,
      adjustedScore: rawScore * policy.scoreMultiplier,
      adjustedConfidence: rawConfidence,
      blockedReason: `Regimi ${regime} nuk lejon BLERJET`,
    };
  }
  if (signal === 'SELL' && !policy.allowShorts) {
    return {
      weights: baseWeights,
      adjustedScore: rawScore * policy.scoreMultiplier,
      adjustedConfidence: rawConfidence,
      blockedReason: `Regimi ${regime} nuk lejon SHITJET`,
    };
  }

  // 2. noTradeBias: if confidence is not clearly above floor, block
  if (policy.noTradeBias && rawConfidence < policy.confidenceFloor + 10) {
    return {
      weights: baseWeights,
      adjustedScore: rawScore * policy.scoreMultiplier,
      adjustedConfidence: rawConfidence,
      blockedReason: `Regimi ${regime}: noTradeBias + confidence ${rawConfidence.toFixed(0)}% nuk mjafton ${policy.confidenceFloor + 10}%`,
    };
  }

  // 3. Apply factor modifiers
  const mods = MODIFIERS[regime] || {};
  const technical: Record<string, number> = {};
  for (const [name, base] of Object.entries(baseWeights)) {
    const mod = mods[name];
    const factorMod = mod ? mod.multiplier : 1.0;
    technical[name] = base * factorMod * policy.technicalWeightMultiplier;
  }
  normalizeRecord(technical);

  // 4. Adjust score and confidence
  const adjustedScore = Math.round(rawScore * policy.scoreMultiplier * 100) / 100;
  const adjustedConfidence = Math.max(rawConfidence, policy.confidenceFloor);

  return {
    weights: technical,
    adjustedScore,
    adjustedConfidence,
  };
}

/** Get modifier details for API display */
export function getRegimeModifierDetails(regime: MarketRegimeState): {
  factorName: string; multiplier: number; reason: string;
}[] {
  const mods = MODIFIERS[regime] || {};
  return Object.entries(mods)
    .map(([name, mod]) => ({ factorName: name, multiplier: mod.multiplier, reason: mod.reason }))
    .sort((a, b) => Math.abs(b.multiplier - 1) - Math.abs(a.multiplier - 1));
}
