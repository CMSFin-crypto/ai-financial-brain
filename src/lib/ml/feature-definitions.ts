// ============================================================
// Feature Definitions — canonical schema for meta-model features.
//
// Every feature used by the meta-model is declared here with:
//   - name (canonical key)
//   - type (numeric | categorical | binary)
//   - source (which engine produces it)
//   - description
//   - default (fallback when unavailable)
//
// This ensures train/inference consistency — the #1 cause of
// "offline works, live fails" in production ML systems.
// ============================================================

export type FeatureType = 'numeric' | 'categorical' | 'binary';

export interface FeatureDef {
  name: string;
  type: FeatureType;
  source: string;
  description: string;
  default: number;
  /** For categorical: map of category → numeric encoding */
  categoryMap?: Record<string, number>;
}

// ─── Canonical feature list (V1) ────────────────────────────

export const FEATURE_SCHEMA_VERSION = 'feat-v1';

/** Sorted feature names — used as hash key for consistency checks */
export const FEATURE_NAMES = [
  // Technical indicators
  'rsi',
  'macd_histogram',
  'bollinger_position',       // (price - BB_lower) / (BB_upper - BB_lower)
  'distance_ma20',           // % from SMA20
  'distance_ma50',           // % from SMA50
  'distance_ma200',          // % from SMA200
  'atr_pct',                 // ATR / close
  'realized_vol_20d',        // std of daily returns, 20d
  'volume_spike',            // current_vol / avg_vol_20d
  'obv_trend',               // OBV 5d change normalized
  'stochastic_k',
  'adx',
  'roc_10d',                 // rate of change 10d
  'vwap_position',           // (price - VWAP) / VWAP

  // Composite scores
  'technical_score',         // -100 to +100 from prediction-engine
  'fundamental_score',       // -100 to +100 from fundamental-engine

  // Regime & market context
  'regime_encoded',          // categorical: BULL_LOW_VOL=0, RANGE_NEUTRAL=1, etc.
  'regime_confidence',
  'transition_risk',
  'spy_trend_5d',            // SPY 5d return %
  'vix_level_normalized',    // VIX / 50 (capped at 2.0)
  'market_breadth',          // % stocks above SMA50

  // Risk & quality signals
  'drift_score',             // max PSI across monitored features
  'strategy_health',         // 0-1 from health-thresholds
  'execution_cost_estimate', // spread_bps / 10000
  'spread_estimate',         // bid-ask spread as % of price

  // Event awareness
  'days_to_earnings',        // 0 if no earnings, else days
  'event_risk_flag',         // 0 or 1 (1 = event within 24h)

  // Spillover
  'spillover_score',         // -100 to +100

  // Volume / liquidity
  'liquidity_score',         // composite: volume * 1/atr
  'price_change_pct',        // day-over-day % change

  // Fundamental ratios (if available, else default)
  'pe_ratio_normalized',     // z-score vs sector
  'pb_ratio_normalized',
  'debt_to_equity_normalized',
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];

/** Map from regime string → numeric encoding */
const REGIME_MAP: Record<string, number> = {
  BULL_LOW_VOL: 0,
  RANGE_NEUTRAL: 1,
  RELIEF_RALLY: 2,
  BEAR_HIGH_VOL: 3,
  PANIC_CAPITULATION: 4,
  UNKNOWN: 1,
};

/** Full feature definition map */
export const FEATURE_DEFINITIONS: Record<FeatureName, FeatureDef> = {
  // ── Technical indicators ──
  rsi:                     { name: 'rsi',                     type: 'numeric',    source: 'prediction-engine',   description: 'RSI (14-period)',                             default: 50 },
  macd_histogram:          { name: 'macd_histogram',          type: 'numeric',    source: 'prediction-engine',   description: 'MACD histogram value',                        default: 0 },
  bollinger_position:      { name: 'bollinger_position',      type: 'numeric',    source: 'prediction-engine',   description: 'Position within Bollinger Bands (0-1)',      default: 0.5 },
  distance_ma20:           { name: 'distance_ma20',           type: 'numeric',    source: 'prediction-engine',   description: '% distance from SMA20',                       default: 0 },
  distance_ma50:           { name: 'distance_ma50',           type: 'numeric',    source: 'prediction-engine',   description: '% distance from SMA50',                       default: 0 },
  distance_ma200:          { name: 'distance_ma200',          type: 'numeric',    source: 'prediction-engine',   description: '% distance from SMA200',                      default: 0 },
  atr_pct:                 { name: 'atr_pct',                 type: 'numeric',    source: 'prediction-engine',   description: 'ATR as % of price',                          default: 0.02 },
  realized_vol_20d:        { name: 'realized_vol_20d',        type: 'numeric',    source: 'prediction-engine',   description: '20-day realized volatility (std of returns)', default: 0.015 },
  volume_spike:            { name: 'volume_spike',            type: 'numeric',    source: 'prediction-engine',   description: 'Volume / 20d avg volume',                     default: 1 },
  obv_trend:               { name: 'obv_trend',               type: 'numeric',    source: 'prediction-engine',   description: 'OBV 5d change normalized',                   default: 0 },
  stochastic_k:            { name: 'stochastic_k',            type: 'numeric',    source: 'prediction-engine',   description: 'Stochastic %K',                              default: 50 },
  adx:                     { name: 'adx',                     type: 'numeric',    source: 'prediction-engine',   description: 'ADX trend strength',                         default: 20 },
  roc_10d:                 { name: 'roc_10d',                 type: 'numeric',    source: 'prediction-engine',   description: '10-day rate of change %',                    default: 0 },
  vwap_position:           { name: 'vwap_position',           type: 'numeric',    source: 'prediction-engine',   description: '(price - VWAP) / VWAP',                      default: 0 },

  // ── Composite scores ──
  technical_score:         { name: 'technical_score',         type: 'numeric',    source: 'prediction-engine',   description: 'Composite technical score (-100 to +100)',     default: 0 },
  fundamental_score:       { name: 'fundamental_score',       type: 'numeric',    source: 'fundamental-engine',  description: 'Composite fundamental score (-100 to +100)',   default: 0 },

  // ── Regime & market ──
  regime_encoded:          { name: 'regime_encoded',          type: 'categorical', source: 'regime-detection',    description: 'Market regime encoded',                      default: 1, categoryMap: REGIME_MAP },
  regime_confidence:       { name: 'regime_confidence',       type: 'numeric',    source: 'regime-detection',    description: 'Regime classification confidence',            default: 0.5 },
  transition_risk:         { name: 'transition_risk',         type: 'numeric',    source: 'regime-detection',    description: 'Probability of regime change in 5d',         default: 0.3 },
  spy_trend_5d:            { name: 'spy_trend_5d',            type: 'numeric',    source: 'market-data',         description: 'SPY 5-day return %',                          default: 0 },
  vix_level_normalized:    { name: 'vix_level_normalized',    type: 'numeric',    source: 'market-data',         description: 'VIX / 50, capped at 2.0',                    default: 0.4 },
  market_breadth:          { name: 'market_breadth',          type: 'numeric',    source: 'market-data',         description: '% stocks above SMA50',                        default: 0.5 },

  // ── Risk & quality ──
  drift_score:             { name: 'drift_score',             type: 'numeric',    source: 'drift-monitor',       description: 'Max PSI across features',                     default: 0 },
  strategy_health:         { name: 'strategy_health',         type: 'numeric',    source: 'health-thresholds',   description: 'Strategy health score 0-1',                   default: 0.7 },
  execution_cost_estimate: { name: 'execution_cost_estimate', type: 'numeric',    source: 'execution-quality',   description: 'Estimated execution cost',                    default: 0.001 },
  spread_estimate:         { name: 'spread_estimate',         type: 'numeric',    source: 'market-data',         description: 'Bid-ask spread as % of price',               default: 0.001 },

  // ── Event awareness ──
  days_to_earnings:        { name: 'days_to_earnings',        type: 'numeric',    source: 'event-calendar',      description: 'Days to next earnings (0 if none)',           default: 999 },
  event_risk_flag:         { name: 'event_risk_flag',         type: 'binary',     source: 'event-risk-engine',   description: '1 if major event within 24h',                default: 0 },

  // ── Spillover ──
  spillover_score:         { name: 'spillover_score',         type: 'numeric',    source: 'spillover-v2',        description: 'Global spillover score (-100 to +100)',       default: 0 },

  // ── Volume / liquidity ──
  liquidity_score:         { name: 'liquidity_score',         type: 'numeric',    source: 'market-data',         description: 'Volume / ATR composite',                      default: 1 },
  price_change_pct:        { name: 'price_change_pct',        type: 'numeric',    source: 'market-data',         description: 'Day-over-day price change %',                default: 0 },

  // ── Fundamental ratios ──
  pe_ratio_normalized:     { name: 'pe_ratio_normalized',     type: 'numeric',    source: 'fundamental-engine',  description: 'P/E z-score vs sector',                       default: 0 },
  pb_ratio_normalized:     { name: 'pb_ratio_normalized',     type: 'numeric',    source: 'fundamental-engine',  description: 'P/B z-score vs sector',                       default: 0 },
  debt_to_equity_normalized: { name: 'debt_to_equity_normalized', type: 'numeric', source: 'fundamental-engine',  description: 'D/E z-score vs sector',                       default: 0 },
};

/** Total number of features */
export const FEATURE_COUNT = FEATURE_NAMES.length;

/** Compute a simple hash of the feature schema for consistency checks */
export function computeSchemaHash(): string {
  const sorted = [...FEATURE_NAMES].sort().join(',');
  let hash = 0;
  for (let i = 0; i < sorted.length; i++) {
    const ch = sorted.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return 'sha-' + Math.abs(hash).toString(16);
}

/** Get default feature vector (all defaults) */
export function getDefaultFeatures(): Record<FeatureName, number> {
  const out = {} as Record<FeatureName, number>;
  for (const name of FEATURE_NAMES) {
    out[name] = FEATURE_DEFINITIONS[name].default;
  }
  return out;
}

/** Validate that a feature vector matches the schema */
export function validateFeatureVector(
  features: Record<string, number>,
): { valid: boolean; missing: string[]; extra: string[] } {
  const expected = new Set(FEATURE_NAMES as readonly string[]);
  const provided = new Set(Object.keys(features));
  const missing = [...expected].filter(k => !provided.has(k));
  const extra = [...provided].filter(k => !expected.has(k));
  return { valid: missing.length === 0, missing, extra };
}
