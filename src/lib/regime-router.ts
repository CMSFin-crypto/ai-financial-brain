// ============================================================
// Regime Router — Dynamic factor weighting per regime
// Decides which factors get boosted/suppressed based on the
// current intelligent regime state. This is the "smart routing"
// layer that makes the same indicators behave differently
// depending on market context.
// ============================================================

import type { RegimePolicy } from './regime-policy';
import type { IntelligentRegimeState } from './regime-intelligence';
import { getRegimePolicy } from './regime-policy';

// ─── Types ────────────────────────────────────────────────────

export interface RoutedWeights {
  technical: Record<string, number>;
  fundamental: Record<string, number>;
  horizonRatios: { technical: number; fundamental: number; event: number };
  spilloverWeight: number;
  regimeWeight: number;
  source: string; // 'default' | 'regime-routed'
  regimeState: IntelligentRegimeState;
}

// ─── Default weights (same as model-weights.ts defaults) ──────

const DEFAULT_TECHNICAL: Record<string, number> = {
  rsi: 0.10, macdHistogram: 0.08, bollinger: 0.08, maTrend: 0.12,
  stochastic: 0.06, adx: 0.06, atr: 0.03, roc: 0.08,
  obv: 0.07, volumeConfirm: 0.07, macdCrossover: 0.05, priceChannel: 0.05,
  divergence: 0.06, vwap: 0.04, pattern: 0.05,
};

const DEFAULT_FUNDAMENTAL: Record<string, number> = {
  valuation: 0.15, growth: 0.25, profitability: 0.15,
  analystSentiment: 0.20, debtHealth: 0.10, momentum: 0.15,
};

// ─── Regime-specific weight modifiers ────────────────────────
// For each regime, define which factors get a multiplier.
// These OVERRIDE the global model-weights for that regime.

interface FactorModifier {
  multiplier: number; // 0 = disabled, 2 = double weight
  reason: string;
}

const REGIME_MODIFIERS: Record<IntelligentRegimeState, Record<string, FactorModifier>> = {
  BULL_LOW_VOL: {
    // In calm bull: fundamentals + trend-following dominate
    maTrend:        { multiplier: 1.5, reason: 'Trend-following efektiv në bull të qetë' },
    macdHistogram:  { multiplier: 1.3, reason: 'Momentum i besueshëm' },
    valuation:      { multiplier: 1.2, reason: 'Vlerësimi i rëndësishëm në bull' },
    growth:         { multiplier: 1.3, reason: 'Rritja ççon fituesit' },
    profitability:  { multiplier: 1.1, reason: 'Rentabiliteti mbështet tendencën' },
    atr:            { multiplier: 0.3, reason: 'Volatiliteti ulët — më pak rrezik' },
    stochastic:     { multiplier: 0.7, reason: 'Mean-reversion më pak i rëndësishëm' },
    global_spillover: { multiplier: 0.5, reason: 'Spillover më pak i rëndësishëm në bull' },
  },
  BEAR_HIGH_VOL: {
    // In bear: risk management + spillover dominate
    atr:            { multiplier: 1.8, reason: 'Volatiliteti lartë — risk critical' },
    global_spillover: { multiplier: 1.6, reason: 'Spillover çaktojnë selloff' },
    vix1d:          { multiplier: 1.5, reason: 'VIX tregon nivelin e frikës' },
    market_regime:  { multiplier: 1.4, reason: 'Regimi është tregues kryesor' },
    maTrend:        { multiplier: 0.6, reason: 'Trend-following rrezikuar në bear' },
    valuation:      { multiplier: 0.5, reason: 'Vlerësimi jo i besueshëm në panic' },
    analystSentiment: { multiplier: 0.4, reason: 'Analistët vonohen në bear' },
    growth:         { multiplier: 0.6, reason: 'Rritja e pritur nuk realizohet' },
  },
  PANIC_CAPITULATION: {
    // In panic: almost everything suppressed, only risk signals
    global_spillover: { multiplier: 2.0, reason: 'Spillover DOMINON në panic' },
    atr:            { multiplier: 2.0, reason: 'Volatiliteti i vetmi sinjal i besueshëm' },
    market_regime:  { multiplier: 1.5, reason: 'Regimi është gjithçka' },
    event_risk:     { multiplier: 1.5, reason: 'Ngjarjet shkaktojnë panic' },
    maTrend:        { multiplier: 0.1, reason: 'Trendi i thyer në panic' },
    macdHistogram:  { multiplier: 0.1, reason: 'MACD i paqartë' },
    rsi:            { multiplier: 0.2, reason: 'RSI i paqartë në capitulation' },
    valuation:      { multiplier: 0.0, reason: 'Vlerësimi pa kuptim' },
    growth:         { multiplier: 0.0, reason: 'Rritja pa kuptim' },
    profitability:  { multiplier: 0.0, reason: 'Rentabiliteti pa kuptim' },
    analystSentiment: { multiplier: 0.0, reason: 'Analistët çrregullohen' },
    momentum:       { multiplier: 0.0, reason: 'Momentum pa kuptim' },
    debtHealth:     { multiplier: 0.0, reason: 'Shëndeti financiar pa kuptim' },
    stochastic:     { multiplier: 0.1, reason: 'Stochastic i paqartë' },
    obv:            { multiplier: 0.2, reason: 'Volumi i paqartë' },
    volumeConfirm:  { multiplier: 0.2, reason: 'Volumi i paqartë' },
    bollinger:      { multiplier: 0.3, reason: 'Bollinger i paqartë' },
    divergence:     { multiplier: 0.2, reason: 'Divergjenca e rrezikshme' },
  },
  RELIEF_RALLY: {
    // In relief: spillover + oversold indicators dominate
    global_spillover: { multiplier: 2.0, reason: 'Spillover DOMINON në relief' },
    rsi:            { multiplier: 1.5, reason: 'RSI oversold → bounce' },
    stochastic:     { multiplier: 1.5, reason: 'Stochastic oversold → bounce' },
    bollinger:      { multiplier: 1.3, reason: 'Bollinger lower band bounce' },
    atr:            { multiplier: 1.2, reason: 'Volatiliteti tregon potencial' },
    maTrend:        { multiplier: 0.4, reason: 'Trend-following vonohet' },
    macdHistogram:  { multiplier: 0.5, reason: 'MACD vonohet' },
    valuation:      { multiplier: 0.3, reason: 'Vlerësimi nuk çon relief' },
    analystSentiment: { multiplier: 0.3, reason: 'Analistët nuk e kanë parë relief' },
  },
  RANGE_NEUTRAL: {
    // In range: mean-reversion + RSI/Bollinger dominate
    rsi:            { multiplier: 1.4, reason: 'RSI mean-reversion efektiv' },
    bollinger:      { multiplier: 1.4, reason: 'Bollinger bands në range' },
    stochastic:     { multiplier: 1.3, reason: 'Stochastic mean-reversion' },
    maTrend:        { multiplier: 0.5, reason: 'Trend-following jo efektiv' },
    macdHistogram:  { multiplier: 0.6, reason: 'MACD jopreciz në range' },
    global_spillover: { multiplier: 0.7, reason: 'Spillover më pak i rëndësishëm' },
    adx:            { multiplier: 0.5, reason: 'ADX i ulët konfirmon range' },
  },
};

// ─── Routing function ──────────────────────────────────────────

/**
 * Route factor weights based on the current regime.
 * Takes base weights (from DB or defaults) and applies regime modifiers.
 */
export function routeWeightsByRegime(
  regimeState: IntelligentRegimeState,
  baseTechnical: Record<string, number>,
  baseFundamental: Record<string, number>,
  baseHorizonRatios: { technical: number; fundamental: number; event: number },
  isSemiOrTech: boolean = false,
): RoutedWeights {
  const policy = getRegimePolicy(regimeState);
  const modifiers = REGIME_MODIFIERS[regimeState];

  // Apply modifiers to technical weights
  const technical: Record<string, number> = {};
  for (const [name, baseWeight] of Object.entries(baseTechnical)) {
    const mod = modifiers[name];
    const regimeMultiplier = policy.technicalWeightMultiplier;
    const factorMod = mod ? mod.multiplier : 1.0;
    technical[name] = baseWeight * factorMod * regimeMultiplier;
  }

  // Apply modifiers to fundamental weights
  const fundamental: Record<string, number> = {};
  for (const [name, baseWeight] of Object.entries(baseFundamental)) {
    const mod = modifiers[name];
    const regimeMultiplier = policy.fundamentalWeightMultiplier;
    const factorMod = mod ? mod.multiplier : 1.0;
    fundamental[name] = baseWeight * factorMod * regimeMultiplier;
  }

  // Apply spillover weight multiplier
  const spilloverWeight = (isSemiOrTech ? 0.10 : 0.03) * policy.spilloverWeightMultiplier;

  // Regime weight in combined score
  const regimeWeight = 0.10 * (regimeState === 'PANIC_CAPITULATION' ? 2.0 : regimeState === 'RELIEF_RALLY' ? 1.5 : 1.0);

  // Adjust horizon ratios based on regime
  let { technical: techRatio, fundamental: fundRatio, event: eventRatio } = baseHorizonRatios;
  if (regimeState === 'RELIEF_RALLY') {
    techRatio = Math.min(0.85, techRatio * 1.15);
    fundRatio = Math.max(0.10, fundRatio * 0.6);
  } else if (regimeState === 'PANIC_CAPITULATION') {
    techRatio = Math.max(0.50, techRatio * 0.6);
    fundRatio = Math.max(0.05, fundRatio * 0.2);
    eventRatio = Math.min(0.40, eventRatio * 2.0);
  } else if (regimeState === 'BULL_LOW_VOL') {
    fundRatio = Math.min(0.40, fundRatio * 1.2);
  }

  // Re-normalize ratios
  const total = techRatio + fundRatio + eventRatio;
  if (total > 0) {
    techRatio = Math.round((techRatio / total) * 1000) / 1000;
    fundRatio = Math.round((fundRatio / total) * 1000) / 1000;
    eventRatio = Math.round((eventRatio / total) * 1000) / 1000;
  }

  // Normalize technical and fundamental to sum to 1
  normalizeRecord(technical);
  normalizeRecord(fundamental);

  return {
    technical,
    fundamental,
    horizonRatios: { technical: techRatio, fundamental: fundRatio, event: eventRatio },
    spilloverWeight: Math.round(spilloverWeight * 1000) / 1000,
    regimeWeight: Math.round(regimeWeight * 100) / 1000,
    source: 'regime-routed',
    regimeState,
  };
}

/** Get the modifier descriptions for a regime (for API display) */
export function getRegimeModifierDetails(regimeState: IntelligentRegimeState): {
  factorName: string;
  multiplier: number;
  reason: string;
}[] {
  const mods = REGIME_MODIFIERS[regimeState];
  return Object.entries(mods)
    .map(([name, mod]) => ({ factorName: name, multiplier: mod.multiplier, reason: mod.reason }))
    .sort((a, b) => Math.abs(b.multiplier - 1) - Math.abs(a.multiplier - 1));
}

function normalizeRecord(record: Record<string, number>): void {
  const sum = Object.values(record).reduce((a, b) => a + b, 0);
  if (sum > 0) {
    for (const key of Object.keys(record)) {
      record[key] = Math.round((record[key] / sum) * 10000) / 10000;
    }
  }
}
