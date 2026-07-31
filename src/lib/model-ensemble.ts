// ============================================================
// Model Ensemble — weighted averaging of multiple sub-models.
//
// Instead of relying on a single score engine, the ensemble
// combines signals from:
//   1. Technical model  (prediction-engine.ts)
//   2. Fundamental model (fundamental-engine.ts)
//   3. Regime-sensitive model (regime-router + spillover)
//   4. Mean-reversion filter (overextended detection)
//   5. Event-risk override (event-risk-engine.ts)
//
// Output:
//   - Weighted average score
//   - Confidence band (disagreement = wider band)
//   - Disagreement score (0 = unanimous, 1 = maximally split)
//   - Per-model breakdown
//   - Action modifier based on disagreement
//
// Key insight: forecast averaging is often MORE stable out
// of sample than the single "best" model. The disagreement
// score is an actionable uncertainty measure.
// ============================================================

import type { PredictionResult } from './prediction-engine';
import { canEnterTrade, type TradeRestriction } from './event-risk-engine';
import type { FeatureVector } from './feature-store';

// ─── Types ────────────────────────────────────────────────────

export type SubModelResult = {
  modelName: string;
  score: number;            // -100 to +100
  confidence: number;       // 0 to 1
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  weight: number;           // this model's weight in ensemble
  reasons: string[];        // human-readable explanation
};

export type EnsembleResult = {
  symbol: string;
  // Final output
  ensembleScore: number;          // -100 to +100
  ensembleConfidence: number;     // 0 to 1
  ensembleDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  // Uncertainty
  confidenceLow: number;          // lower bound of confidence band
  confidenceHigh: number;         // upper bound
  disagreementScore: number;      // 0 = unanimous, 1 = maximally split
  // Disagreement action
  actionModifier: 'NORMAL' | 'REDUCE_SIZE' | 'SKIP';
  sizeMultiplier: number;         // 1.0, 0.5, or 0
  actionReason: string;
  // Per-model breakdown
  models: SubModelResult[];
  // Overrides
  eventRestriction: TradeRestriction | null;
  // Metadata
  assessedAt: string;
  featureHash?: string;
};

export type EnsembleConfig = {
  // Weights for each sub-model (must sum to 1.0)
  weights?: {
    technical?: number;       // default 0.35
    fundamental?: number;     // default 0.20
    regimeSensitive?: number; // default 0.25
    meanReversion?: number;   // default 0.10
    eventRisk?: number;       // default 0.10
  };
  // Disagreement thresholds
  highDisagreementThreshold?: number;  // default 0.6 → SKIP
  mediumDisagreementThreshold?: number; // default 0.35 → REDUCE_SIZE
  // Whether to include event-risk model
  includeEventRisk?: boolean; // default true
};

const DEFAULT_WEIGHTS = {
  technical: 0.35,
  fundamental: 0.20,
  regimeSensitive: 0.25,
  meanReversion: 0.10,
  eventRisk: 0.10,
};

// ─── Helpers ──────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scoreToDirection(score: number): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  if (score > 10) return 'BULLISH';
  if (score < -10) return 'BEARISH';
  return 'NEUTRAL';
}

function scoreToConfidence(score: number): number {
  return Math.min(1, Math.abs(score) / 100);
}

// ─── Sub-Model Functions ─────────────────────────────────────
// These are simplified "model stubs" that can be replaced
// with actual model calls. For now, they transform raw inputs
// into standardized SubModelResult format.

/**
 * Technical model: uses the prediction-engine score directly.
 */
function technicalModel(
  predictionResult: PredictionResult | null,
): SubModelResult {
  if (!predictionResult) {
    return {
      modelName: 'technical',
      score: 0,
      confidence: 0.3,
      direction: 'NEUTRAL',
      weight: DEFAULT_WEIGHTS.technical,
      reasons: ['No technical data available'],
    };
  }

  const score = predictionResult.score || 0;
  const confidence = (predictionResult.confidence || 50) / 100;
  const reasons: string[] = [];

  // Extract top factors
  if (predictionResult.keyFactors?.length) {
 for (const f of predictionResult.keyFactors.slice(0, 3)) {
      reasons.push(`${f.name}: ${f.signal} (${f.impact})`);
    }
  }

  return {
    modelName: 'technical',
    score: clamp(score, -100, 100),
    confidence,
    direction: scoreToDirection(score),
    weight: DEFAULT_WEIGHTS.technical,
    reasons: reasons.length ? reasons : ['Technical analysis complete'],
  };
}

/**
 * Fundamental model: uses the fundamental score if available.
 */
function fundamentalModel(
  predictionResult: PredictionResult | null,
): SubModelResult {
  if (!predictionResult?.fundamentalData) {
    return {
      modelName: 'fundamental',
      score: 0,
      confidence: 0.3,
      direction: 'NEUTRAL',
      weight: DEFAULT_WEIGHTS.fundamental,
      reasons: ['No fundamental data — using neutral prior'],
    };
  }

  const fd = predictionResult.fundamentalData;
  const score = clamp(fd.score || 0, -100, 100);
  const reasons: string[] = [];

  if (fd.scores) {
    for (const [key, val] of Object.entries(fd.scores)) {
      if (typeof val === 'number' && Math.abs(val) > 10) {
        reasons.push(`${key}: ${val > 0 ? '+' : ''}${val.toFixed(1)}`);
      }
    }
  }
  if (fd.summary) {
    reasons.unshift(fd.summary);
  }

  return {
    modelName: 'fundamental',
    score,
    confidence: Math.min(1, Math.abs(score) / 80),
    direction: scoreToDirection(score),
    weight: DEFAULT_WEIGHTS.fundamental,
    reasons: reasons.length ? reasons.slice(0, 4) : ['Fundamentals analyzed'],
  };
}

/**
 * Regime-sensitive model: adjusts score based on current regime.
 * In bear regimes, bullish signals get penalized.
 * In bull regimes, bearish signals get penalized.
 */
function regimeSensitiveModel(
  predictionResult: PredictionResult | null,
  regimeState?: string,
  regimeConfidence?: number,
  spilloverScore?: number,
): SubModelResult {
  const baseScore = predictionResult?.score || 0;
  const reasons: string[] = [];

  let adjustedScore = baseScore;
  const regConf = regimeConfidence ?? 0.5;

  // Apply regime adjustment
  switch (regimeState) {
    case 'BEAR_HIGH_VOL':
      // Reduce bullish bets in bear markets
      if (baseScore > 0) {
        adjustedScore = baseScore * 0.5;
        reasons.push('Bear regime: bullish signals discounted 50%');
      } else {
        adjustedScore = baseScore * 1.2; // amplify bearish signals
        reasons.push('Bear regime: bearish signals amplified 20%');
      }
      break;
    case 'PANIC_CAPITULATION':
      // Extreme caution — reduce everything
      adjustedScore = baseScore * 0.3;
      reasons.push('Panic regime: all signals heavily discounted');
      break;
    case 'BULL_LOW_VOL':
      if (baseScore < 0) {
        adjustedScore = baseScore * 0.6;
        reasons.push('Bull regime: bearish signals discounted 40%');
      } else {
        adjustedScore = baseScore * 1.1;
        reasons.push('Bull regime: bullish signals slightly amplified');
      }
      break;
    case 'RELIEF_RALLY':
      // Relief rallies favor bullish but are fragile
      if (baseScore > 0) {
        adjustedScore = baseScore * 1.15;
        reasons.push('Relief rally: bullish signals boosted 15%');
      } else {
        adjustedScore = baseScore * 0.7;
        reasons.push('Relief rally: bearish signals reduced 30%');
      }
      break;
    default:
      reasons.push(`Regime ${regimeState || 'UNKNOWN'}: no adjustment applied`);
      break;
  }

  // Add spillover influence
  if (spilloverScore !== undefined && Math.abs(spilloverScore) > 20) {
    adjustedScore += spilloverScore * 0.15;
    reasons.push(`Spillover score ${spilloverScore > 0 ? '+' : ''}${spilloverScore.toFixed(0)} applied as 15% weight`);
  }

  adjustedScore = clamp(adjustedScore, -100, 100);

  return {
    modelName: 'regime_sensitive',
    score: adjustedScore,
    confidence: regConf * Math.min(1, Math.abs(adjustedScore) / 60),
    direction: scoreToDirection(adjustedScore),
    weight: DEFAULT_WEIGHTS.regimeSensitive,
    reasons,
  };
}

/**
 * Mean-reversion filter: detects overextended conditions.
 * If price is too far from mean, signals a potential reversal.
 */
function meanReversionModel(
  features?: FeatureVector,
): SubModelResult {
  if (!features) {
    return {
      modelName: 'mean_reversion',
      score: 0,
      confidence: 0.3,
      direction: 'NEUTRAL',
      weight: DEFAULT_WEIGHTS.meanReversion,
      reasons: ['No feature data for mean-reversion check'],
    };
  }

  const rsi = Number(features['rsi_14'] ?? 50);
  const bollingerPos = Number(features['bollinger_position'] ?? 0.5);
  const roc = Number(features['rate_of_change_10'] ?? 0);
  const reasons: string[] = [];
  let score = 0;

  // RSI overextended check
  if (rsi > 75) {
    score -= (rsi - 75) * 1.5;
    reasons.push(`RSI at ${rsi.toFixed(0)} — overbought, mean-reversion favors downside`);
  } else if (rsi < 25) {
    score += (25 - rsi) * 1.5;
    reasons.push(`RSI at ${rsi.toFixed(0)} — oversold, mean-reversion favors upside`);
  } else {
    reasons.push(`RSI at ${rsi.toFixed(0)} — within normal range`);
  }

  // Bollinger Band position
  if (bollingerPos > 0.95) {
    score -= 20;
    reasons.push('Price above upper Bollinger Band — overextended');
  } else if (bollingerPos < 0.05) {
    score += 20;
    reasons.push('Price below lower Bollinger Band — oversold bounce candidate');
  }

  // Extreme rate of change (mean reversion after big moves)
  if (roc > 15) {
    score -= (roc - 15) * 2;
    reasons.push(`10-day ROC ${roc.toFixed(1)}% extreme — reversion likely`);
  } else if (roc < -15) {
    score += (-roc - 15) * 2;
    reasons.push(`10-day ROC ${roc.toFixed(1)}% extreme — reversion likely`);
  }

  score = clamp(score, -100, 100);
  const confidence = Math.min(1, Math.abs(score) / 60);

  return {
    modelName: 'mean_reversion',
    score,
    confidence,
    direction: scoreToDirection(score),
    weight: DEFAULT_WEIGHTS.meanReversion,
    reasons: reasons.length ? reasons : ['No mean-reversion signal'],
  };
}

/**
 * Event-risk model: converts event restrictions into a score modifier.
 */
function eventRiskModel(
  symbol: string,
  knownEarningsDate?: string,
): SubModelResult {
  const check = canEnterTrade(symbol, undefined, knownEarningsDate);
  const reasons: string[] = [];
  let score = 0;

  if (!check.allowed) {
    score = -60; // strong negative signal when events block trading
    reasons.push(`Event block: ${check.reason}`);
  } else if (check.sizeMultiplier < 1.0) {
    score = -20; // moderate negative when size is reduced
    reasons.push(`Event caution: ${check.reason}`);
  } else {
    reasons.push('No active event restrictions');
  }

  return {
    modelName: 'event_risk',
    score,
    confidence: check.allowed ? 0.5 : 0.8,
    direction: scoreToDirection(score),
    weight: DEFAULT_WEIGHTS.eventRisk,
    reasons,
  };
}

// ─── Core: Ensemble Combination ───────────────────────────────

/**
 * Compute disagreement score across models.
 * 0 = all models agree, 1 = maximally split.
 */
function computeDisagreement(models: SubModelResult[]): number {
  if (models.length < 2) return 0;

  const scores = models.map(m => m.score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((s, v) => s + (v - avg) ** 2, 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  // Normalize: stdDev of 50+ across -100..100 range = high disagreement
  // Using a sigmoid-like mapping
  return Math.min(1, stdDev / 50);
}

/**
 * Compute confidence band from model spread.
 */
function computeConfidenceBand(
  ensembleConfidence: number,
  disagreement: number,
): { low: number; high: number } {
  const spread = disagreement * 0.4; // max 40% spread in confidence
  return {
    low: Math.max(0, ensembleConfidence - spread),
    high: Math.min(1, ensembleConfidence + spread),
  };
}

/**
 * Run the full ensemble for a symbol.
 */
export function runEnsemble(
  symbol: string,
  inputs: {
    predictionResult?: PredictionResult | null;
    regimeState?: string;
    regimeConfidence?: number;
    spilloverScore?: number;
    features?: FeatureVector;
    knownEarningsDate?: string;
    config?: EnsembleConfig;
  },
): EnsembleResult {
  const { predictionResult, regimeState, regimeConfidence, spilloverScore, features, knownEarningsDate, config } = inputs;
  const cfg = { ...DEFAULT_WEIGHTS, ...config?.weights };

  // 1. Run each sub-model
  const models: SubModelResult[] = [];

  // Technical model
  const techResult = technicalModel(predictionResult || null);
  techResult.weight = cfg.technical;
  models.push(techResult);

  // Fundamental model
  const fundResult = fundamentalModel(predictionResult || null);
  fundResult.weight = cfg.fundamental;
  models.push(fundResult);

  // Regime-sensitive model
  const regimeResult = regimeSensitiveModel(
    predictionResult || null,
    regimeState,
    regimeConfidence,
    spilloverScore,
  );
  regimeResult.weight = cfg.regimeSensitive;
  models.push(regimeResult);

  // Mean-reversion model
  const mrResult = meanReversionModel(features);
  mrResult.weight = cfg.meanReversion;
  models.push(mrResult);

  // Event-risk model
  const includeEventRisk = config?.includeEventRisk !== false;
  let eventRestriction: TradeRestriction | null = null;
  if (includeEventRisk) {
    const erResult = eventRiskModel(symbol, knownEarningsDate);
    erResult.weight = cfg.eventRisk;
    models.push(erResult);
    // The event-risk model's reasons contain restriction info
    // We don't call canEnterTrade here to avoid coupling,
    // but the score already reflects the restriction
    if (erResult.score <= -60) {
      eventRestriction = {
        symbol,
        level: 'NO_TRADE',
        reason: erResult.reasons[0] || 'Event risk too high',
        affectedEvents: erResult.reasons,
        sizeMultiplier: 0,
        liftTime: null,
        expiresAt: new Date(Date.now() + 86400000),
      };
    } else if (erResult.score <= -20) {
      eventRestriction = {
        symbol,
        level: 'SIZE_REDUCTION',
        reason: erResult.reasons[0] || 'Event risk elevated',
        affectedEvents: erResult.reasons,
        sizeMultiplier: 0.5,
        liftTime: null,
        expiresAt: new Date(Date.now() + 86400000),
      };
    }
  }

  // 2. Normalize weights (in case config provided partial weights)
  const totalWeight = models.reduce((s, m) => s + m.weight, 0);
  if (totalWeight > 0) {
    for (const m of models) {
      m.weight = m.weight / totalWeight;
    }
  }

  // 3. Weighted average score
  const ensembleScore = models.reduce((s, m) => s + m.score * m.weight, 0);

  // 4. Weighted average confidence
  const ensembleConfidence = models.reduce((s, m) => s + m.confidence * m.weight, 0);

  // 5. Disagreement metrics
  const disagreement = computeDisagreement(models);
  const band = computeConfidenceBand(ensembleConfidence, disagreement);

  // 6. Determine action modifier based on disagreement
  const highThreshold = config?.highDisagreementThreshold ?? 0.6;
  const medThreshold = config?.mediumDisagreementThreshold ?? 0.35;

  let actionModifier: 'NORMAL' | 'REDUCE_SIZE' | 'SKIP' = 'NORMAL';
  let sizeMultiplier = 1.0;
  let actionReason = 'Models agree — normal sizing';

  if (disagreement >= highThreshold) {
    actionModifier = 'SKIP';
    sizeMultiplier = 0;
    actionReason = `High model disagreement (${(disagreement * 100).toFixed(0)}%) — skip trade`;
  } else if (disagreement >= medThreshold) {
    actionModifier = 'REDUCE_SIZE';
    sizeMultiplier = 0.5;
    actionReason = `Moderate disagreement (${(disagreement * 100).toFixed(0)}%) — reduce size to 50%`;
  }

  // 7. Apply event restriction multiplier
  if (eventRestriction) {
    sizeMultiplier *= eventRestriction.sizeMultiplier;
  }

  return {
    symbol,
    ensembleScore: Math.round(ensembleScore * 100) / 100,
    ensembleConfidence: Math.round(ensembleConfidence * 1000) / 1000,
    ensembleDirection: scoreToDirection(ensembleScore),
    confidenceLow: Math.round(band.low * 1000) / 1000,
    confidenceHigh: Math.round(band.high * 1000) / 1000,
    disagreementScore: Math.round(disagreement * 1000) / 1000,
    actionModifier,
    sizeMultiplier: Math.round(sizeMultiplier * 100) / 100,
    actionReason,
    models,
    eventRestriction,
    assessedAt: new Date().toISOString(),
  };
}

/**
 * Batch ensemble for multiple symbols.
 * Returns results sorted by ensemble score (descending).
 */
export function batchEnsemble(
  items: Array<{
    symbol: string;
    predictionResult?: PredictionResult | null;
    regimeState?: string;
    regimeConfidence?: number;
    spilloverScore?: number;
    features?: FeatureVector;
    knownEarningsDate?: string;
  }>,
  config?: EnsembleConfig,
): EnsembleResult[] {
  const results = items.map(item =>
    runEnsemble(item.symbol, { ...item, config })
  );
  return results.sort((a, b) => b.ensembleScore - a.ensembleScore);
}
