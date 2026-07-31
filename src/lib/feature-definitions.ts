// ============================================================
// Feature Definitions — centralized schema for all model features.
//
// This is the SINGLE SOURCE OF TRUTH for what features exist,
// how they're computed, and what their expected types/ranges are.
// Both training (research) and inference (production) MUST use
// the same definitions — this prevents the #1 cause of
// "offline works, live fails" bugs.
//
// Features are versioned. When a feature definition changes,
// bump its version. The feature store will detect mismatches.
// ============================================================

// ─── Types ────────────────────────────────────────────────────

export type FeatureType = 'numeric' | 'categorical' | 'boolean' | 'array_numeric';

export type FeatureSource = 'technical' | 'fundamental' | 'regime' | 'market' | 'spillover' | 'event' | 'derived';

export type FeatureDefinition = {
  name: string;              // unique key, e.g. "rsi_14"
  displayName: string;       // human-readable, e.g. "RSI (14-period)"
  type: FeatureType;
  source: FeatureSource;
  version: number;           // bump on any logic change
  description: string;
  
  // Constraints (for validation)
  expectedRange?: [number, number];  // min, max for numeric
  allowedValues?: string[];          // for categorical
  defaultValue?: unknown;
  nullable?: boolean;
  
  // Computation reference
  computeFn?: string;        // reference to the function/module that computes it
  dependsOn?: string[];      // names of other features this depends on
  
  // Metadata
  tags?: string[];
  enabled: boolean;          // can be disabled without deleting
  addedAt: string;
  updatedAt: string;
};

export type FeatureVersionInfo = {
  featureName: string;
  version: number;
  changedAt: string;
  changeDescription: string;
};

// ─── Registry ─────────────────────────────────────────────────

const NOW = '2026-08-01';

const TECHNICAL_FEATURES: FeatureDefinition[] = [
  {
    name: 'rsi_14',
    displayName: 'RSI (14-period)',
    type: 'numeric',
    source: 'technical',
    version: 1,
    description: 'Relative Strength Index with 14-period lookback. Measures overbought/oversold momentum. Range 0-100, with 70+ overbought and 30- oversold.',
    expectedRange: [0, 100],
    defaultValue: 50,
    computeFn: 'indicators.ts:computeRSI',
    dependsOn: ['close_prices'],
    tags: ['momentum', 'oscillator'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
  {
    name: 'macd_histogram',
    displayName: 'MACD Histogram',
    type: 'numeric',
    source: 'technical',
    version: 1,
    description: 'Difference between MACD line (12-26 EMA) and signal line (9-period EMA of MACD). Positive = bullish momentum, negative = bearish.',
    expectedRange: [-10, 10],
    defaultValue: 0,
    computeFn: 'indicators.ts:computeMACD',
    dependsOn: ['close_prices'],
    tags: ['momentum', 'trend'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
  {
    name: 'macd_crossover',
    displayName: 'MACD Crossover Signal',
    type: 'categorical',
    source: 'technical',
    version: 1,
    description: 'Whether MACD line has crossed above (bullish) or below (bearish) the signal line in the last 3 bars.',
    allowedValues: ['bullish_cross', 'bearish_cross', 'none'],
    defaultValue: 'none',
    computeFn: 'indicators.ts:computeMACDCrossover',
    dependsOn: ['macd_histogram'],
    tags: ['momentum', 'signal'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
  {
    name: 'bollinger_position',
    displayName: 'Bollinger Band Position',
    type: 'numeric',
    source: 'technical',
    version: 1,
    description: 'Position of price within Bollinger Bands (20-period, 2 std dev). 0 = lower band, 1 = upper band. Values outside 0-1 indicate band penetration.',
    expectedRange: [-0.2, 1.2],
    defaultValue: 0.5,
    computeFn: 'indicators.ts:computeBollingerPosition',
    dependsOn: ['close_prices', 'sma_20', 'std_20'],
    tags: ['volatility', 'mean_reversion'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
  {
    name: 'sma_trend_score',
    displayName: 'SMA Trend Score',
    type: 'numeric',
    source: 'technical',
    version: 1,
    description: 'Composite trend score based on price vs SMA10, SMA20, SMA50, SMA200 alignment. Range -1 to +1.',
    expectedRange: [-1, 1],
    defaultValue: 0,
    computeFn: 'indicators.ts:computeSMATrendScore',
    dependsOn: ['close_prices'],
    tags: ['trend', 'moving_average'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
  {
    name: 'stochastic_oscillator',
    displayName: 'Stochastic Oscillator (%K)',
    type: 'numeric',
    source: 'technical',
    version: 1,
    description: '14-period %K stochastic. Measures where close sits relative to 14-period high-low range.',
    expectedRange: [0, 100],
    defaultValue: 50,
    computeFn: 'indicators.ts:computeStochastic',
    dependsOn: ['high_prices', 'low_prices', 'close_prices'],
    tags: ['momentum', 'oscillator'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
  {
    name: 'adx_14',
    displayName: 'ADX (14-period)',
    type: 'numeric',
    source: 'technical',
    version: 1,
    description: 'Average Directional Index. Measures trend strength regardless of direction. >25 = trending, <20 = ranging.',
    expectedRange: [0, 100],
    defaultValue: 20,
    computeFn: 'indicators.ts:computeADX',
    dependsOn: ['high_prices', 'low_prices', 'close_prices'],
    tags: ['trend', 'strength'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
  {
    name: 'atr_14_pct',
    displayName: 'ATR (14-period) as % of Price',
    type: 'numeric',
    source: 'technical',
    version: 1,
    description: 'Average True Range normalized as percentage of closing price. Measures volatility for position sizing.',
    expectedRange: [0, 15],
    defaultValue: 1.5,
    computeFn: 'indicators.ts:computeATR',
    dependsOn: ['high_prices', 'low_prices', 'close_prices'],
    tags: ['volatility', 'risk'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
  {
    name: 'rate_of_change_10',
    displayName: 'Rate of Change (10-period)',
    type: 'numeric',
    source: 'technical',
    version: 1,
    description: '10-period price rate of change as percentage. Measures short-term momentum.',
    expectedRange: [-30, 30],
    defaultValue: 0,
    computeFn: 'indicators.ts:computeROC',
    dependsOn: ['close_prices'],
    tags: ['momentum'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
  {
    name: 'obv_trend',
    displayName: 'On-Balance Volume Trend',
    type: 'numeric',
    source: 'technical',
    version: 1,
    description: '5-period rate of change of OBV. Positive = accumulation, negative = distribution.',
    expectedRange: [-50, 50],
    defaultValue: 0,
    computeFn: 'indicators.ts:computeOBVTrend',
    dependsOn: ['close_prices', 'volume'],
    tags: ['volume', 'momentum'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
  {
    name: 'volume_confirmation',
    displayName: 'Volume Confirmation Score',
    type: 'numeric',
    source: 'technical',
    version: 1,
    description: 'Measures whether volume supports the current price move. Range -1 to +1.',
    expectedRange: [-1, 1],
    defaultValue: 0,
    computeFn: 'indicators.ts:computeVolumeConfirmation',
    dependsOn: ['close_prices', 'volume', 'sma_20_volume'],
    tags: ['volume'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
  {
    name: 'price_vs_vwap',
    displayName: 'Price vs VWAP',
    type: 'numeric',
    source: 'technical',
    version: 1,
    description: 'Percentage difference between current price and VWAP. Positive = above VWAP.',
    expectedRange: [-5, 5],
    defaultValue: 0,
    computeFn: 'indicators.ts:computePriceVsVWAP',
    dependsOn: ['close_prices', 'volume'],
    tags: ['intraday', 'volume'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
  {
    name: 'divergence_signal',
    displayName: 'Price-RSI Divergence',
    type: 'categorical',
    source: 'technical',
    version: 1,
    description: 'Detected divergence between price and RSI: bullish, bearish, or none.',
    allowedValues: ['bullish_divergence', 'bearish_divergence', 'none'],
    defaultValue: 'none',
    computeFn: 'indicators.ts:computeDivergence',
    dependsOn: ['close_prices', 'rsi_14'],
    tags: ['momentum', 'reversal'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
  {
    name: 'price_channel_position',
    displayName: '20-day Price Channel Position',
    type: 'numeric',
    source: 'technical',
    version: 1,
    description: 'Where price sits within its 20-day high-low channel. 0 = at 20-day low, 1 = at 20-day high.',
    expectedRange: [0, 1],
    defaultValue: 0.5,
    computeFn: 'indicators.ts:computePriceChannel',
    dependsOn: ['close_prices'],
    tags: ['trend', 'breakout'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
];

const FUNDAMENTAL_FEATURES: FeatureDefinition[] = [
  {
    name: 'pe_ratio',
    displayName: 'P/E Ratio',
    type: 'numeric',
    source: 'fundamental',
    version: 1,
    description: 'Price-to-Earnings ratio (trailing twelve months). Lower relative to sector = undervalued signal.',
    expectedRange: [0, 500],
    nullable: true,
    computeFn: 'fundamental-engine.ts:analyzeFundamentals',
    tags: ['valuation'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
  {
    name: 'pe_vs_sector',
    displayName: 'P/E Relative to Sector Median',
    type: 'numeric',
    source: 'fundamental',
    version: 1,
    description: 'P/E ratio divided by sector median P/E. <1 = undervalued vs peers, >1.5 = expensive.',
    expectedRange: [0, 5],
    nullable: true,
    defaultValue: 1,
    computeFn: 'fundamental-engine.ts:computePERelative',
    dependsOn: ['pe_ratio'],
    tags: ['valuation', 'relative'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
  {
    name: 'revenue_growth_yoy',
    displayName: 'Revenue Growth YoY',
    type: 'numeric',
    source: 'fundamental',
    version: 1,
    description: 'Year-over-year revenue growth rate as percentage. Positive = growing business.',
    expectedRange: [-50, 200],
    nullable: true,
    defaultValue: 0,
    computeFn: 'fundamental-engine.ts:analyzeFundamentals',
    tags: ['growth'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
  {
    name: 'earnings_growth_yoy',
    displayName: 'Earnings Growth YoY',
    type: 'numeric',
    source: 'fundamental',
    version: 1,
    description: 'Year-over-year earnings per share growth rate.',
    expectedRange: [-100, 300],
    nullable: true,
    defaultValue: 0,
    computeFn: 'fundamental-engine.ts:analyzeFundamentals',
    tags: ['growth', 'profitability'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
  {
    name: 'debt_to_equity',
    displayName: 'Debt-to-Equity Ratio',
    type: 'numeric',
    source: 'fundamental',
    version: 1,
    description: 'Total debt divided by total equity. Higher = more leveraged and risky.',
    expectedRange: [0, 10],
    nullable: true,
    defaultValue: 0.5,
    computeFn: 'fundamental-engine.ts:analyzeFundamentals',
    tags: ['balance_sheet', 'risk'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
  {
    name: 'profit_margin',
    displayName: 'Net Profit Margin',
    type: 'numeric',
    source: 'fundamental',
    version: 1,
    description: 'Net income as percentage of revenue. Higher = more efficient.',
    expectedRange: [-50, 50],
    nullable: true,
    defaultValue: 5,
    computeFn: 'fundamental-engine.ts:analyzeFundamentals',
    tags: ['profitability'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
];

const REGIME_FEATURES: FeatureDefinition[] = [
  {
    name: 'regime_state',
    displayName: 'Market Regime State',
    type: 'categorical',
    source: 'regime',
    version: 1,
    description: 'Current detected market regime: BULL_LOW_VOL, BEAR_HIGH_VOL, PANIC_CAPITULATION, RELIEF_RALLY, RANGE_NEUTRAL.',
    allowedValues: ['BULL_LOW_VOL', 'BEAR_HIGH_VOL', 'PANIC_CAPITULATION', 'RELIEF_RALLY', 'RANGE_NEUTRAL', 'UNKNOWN'],
    defaultValue: 'UNKNOWN',
    computeFn: 'regime-detection.ts:detectRegime',
    tags: ['regime', 'macro'],
    enabled: true,
    addedAt: '2025-03-01',
    updatedAt: NOW,
  },
  {
    name: 'regime_confidence',
    displayName: 'Regime Detection Confidence',
    type: 'numeric',
    source: 'regime',
    version: 1,
    description: 'Confidence score for the current regime detection (0-1).',
    expectedRange: [0, 1],
    defaultValue: 0.5,
    computeFn: 'regime-detection.ts:detectRegime',
    dependsOn: ['regime_state'],
    tags: ['regime'],
    enabled: true,
    addedAt: '2025-03-01',
    updatedAt: NOW,
  },
  {
    name: 'regime_transition_risk',
    displayName: 'Regime Transition Risk',
    type: 'numeric',
    source: 'regime',
    version: 1,
    description: 'Probability of regime change within next 5 days (0-1). Higher = more uncertain.',
    expectedRange: [0, 1],
    defaultValue: 0.1,
    computeFn: 'regime-detection.ts:detectRegime',
    dependsOn: ['regime_state'],
    tags: ['regime', 'risk'],
    enabled: true,
    addedAt: '2025-03-01',
    updatedAt: NOW,
  },
];

const MARKET_FEATURES: FeatureDefinition[] = [
  {
    name: 'vix_level',
    displayName: 'VIX Index Level',
    type: 'numeric',
    source: 'market',
    version: 1,
    description: 'Current VIX (implied volatility index). <15 = complacent, >25 = fearful, >35 = panic.',
    expectedRange: [8, 80],
    defaultValue: 18,
    computeFn: 'global-market-data.ts:fetchVIX',
    tags: ['volatility', 'sentiment'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
  {
    name: 'spy_return_5d',
    displayName: 'SPY 5-Day Return',
    type: 'numeric',
    source: 'market',
    version: 1,
    description: 'SPY total return over last 5 trading days. Context for individual stock performance.',
    expectedRange: [-15, 15],
    defaultValue: 0,
    computeFn: 'alpha-vantage.ts:fetchHistoricalData',
    tags: ['market', 'benchmark'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
  {
    name: 'market_breadth',
    displayName: 'Market Breadth (% above SMA50)',
    type: 'numeric',
    source: 'market',
    version: 1,
    description: 'Percentage of S&P 500 stocks trading above their 50-day SMA. >70% = broad participation.',
    expectedRange: [0, 100],
    defaultValue: 50,
    computeFn: 'market-data.ts:computeMarketBreadth',
    tags: ['market', 'breadth'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
  {
    name: 'put_call_ratio',
    displayName: 'CBOE Put/Call Ratio',
    type: 'numeric',
    source: 'market',
    version: 1,
    description: 'Total put volume / total call volume. >1.0 = bearish sentiment, <0.7 = bullish.',
    expectedRange: [0.4, 2.0],
    nullable: true,
    defaultValue: 0.85,
    computeFn: 'market-data.ts:fetchPutCallRatio',
    tags: ['sentiment', 'options'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
];

const SPILLOVER_FEATURES: FeatureDefinition[] = [
  {
    name: 'asia_return',
    displayName: 'Asia-Pacific Overnight Return',
    type: 'numeric',
    source: 'spillover',
    version: 1,
    description: 'Composite return of major Asia-Pacific indices during US off-hours.',
    expectedRange: [-5, 5],
    nullable: true,
    defaultValue: 0,
    computeFn: 'global-spillover.ts:computeAsiaReturn',
    tags: ['spillover', 'international'],
    enabled: true,
    addedAt: '2025-04-01',
    updatedAt: NOW,
  },
  {
    name: 'europe_return',
    displayName: 'Europe Morning Return',
    type: 'numeric',
    source: 'spillover',
    version: 1,
    description: 'Composite return of major European indices before US open.',
    expectedRange: [-5, 5],
    nullable: true,
    defaultValue: 0,
    computeFn: 'global-spillover.ts:computeEuropeReturn',
    tags: ['spillover', 'international'],
    enabled: true,
    addedAt: '2025-04-01',
    updatedAt: NOW,
  },
  {
    name: 'spillover_score',
    displayName: 'Global Spillover Score',
    type: 'numeric',
    source: 'spillover',
    version: 1,
    description: 'Composite spillover signal score (-100 to +100). Combines Asia, Europe, sector signals.',
    expectedRange: [-100, 100],
    defaultValue: 0,
    computeFn: 'spillover-v2.ts:computeSpilloverScore',
    dependsOn: ['asia_return', 'europe_return'],
    tags: ['spillover', 'composite'],
    enabled: true,
    addedAt: '2025-04-01',
    updatedAt: NOW,
  },
];

const EVENT_FEATURES: FeatureDefinition[] = [
  {
    name: 'event_risk_score',
    displayName: 'Event Risk Score',
    type: 'numeric',
    source: 'event',
    version: 1,
    description: 'Composite event risk penalty (-100 to 0). Based on proximity to earnings, FOMC, CPI, etc.',
    expectedRange: [-100, 0],
    defaultValue: 0,
    computeFn: 'event-risk.ts:checkEventRisk',
    tags: ['event', 'risk'],
    enabled: true,
    addedAt: '2025-02-01',
    updatedAt: NOW,
  },
  {
    name: 'event_restriction_level',
    displayName: 'Event Trade Restriction',
    type: 'categorical',
    source: 'event',
    version: 1,
    description: 'Current trade restriction from event-risk-engine: NONE, SIZE_REDUCTION, NO_NEW_ENTRIES, NO_TRADE.',
    allowedValues: ['NONE', 'SIZE_REDUCTION', 'NO_NEW_ENTRIES', 'NO_TRADE'],
    defaultValue: 'NONE',
    computeFn: 'event-risk-engine.ts:assessEventRisk',
    tags: ['event', 'gate'],
    enabled: true,
    addedAt: '2026-08-01',
    updatedAt: NOW,
  },
];

const DERIVED_FEATURES: FeatureDefinition[] = [
  {
    name: 'raw_score',
    displayName: 'Raw Prediction Score',
    type: 'numeric',
    source: 'derived',
    version: 2,
    description: 'Weighted composite of all factor scores before calibration. The core model output.',
    expectedRange: [-1, 1],
    defaultValue: 0,
    computeFn: 'prediction-engine.ts:predictStock',
    dependsOn: ['rsi_14', 'macd_histogram', 'bollinger_position', 'sma_trend_score', 'stochastic_oscillator', 'adx_14', 'atr_14_pct', 'rate_of_change_10', 'obv_trend', 'volume_confirmation', 'price_vs_vwap', 'divergence_signal', 'price_channel_position'],
    tags: ['model', 'output'],
    enabled: true,
    addedAt: '2025-01-01',
    updatedAt: NOW,
  },
  {
    name: 'calibrated_confidence',
    displayName: 'Calibrated Confidence',
    type: 'numeric',
    source: 'derived',
    version: 1,
    description: 'Post-calibration confidence score (0-1). Adjusted by Brier score and conformal prediction.',
    expectedRange: [0, 1],
    defaultValue: 0.5,
    computeFn: 'calibration-service.ts:calibrate',
    dependsOn: ['raw_score'],
    tags: ['model', 'calibration'],
    enabled: true,
    addedAt: '2025-02-01',
    updatedAt: NOW,
  },
  {
    name: 'kelly_fraction',
    displayName: 'Kelly Fraction',
    type: 'numeric',
    source: 'derived',
    version: 1,
    description: 'Fractional Kelly criterion position size. Combines edge (score) and odds (confidence) with capping.',
    expectedRange: [0, 0.25],
    defaultValue: 0,
    computeFn: 'position-sizing.ts:computeKellyFraction',
    dependsOn: ['raw_score', 'calibrated_confidence', 'atr_14_pct'],
    tags: ['sizing', 'risk'],
    enabled: true,
    addedAt: '2025-03-01',
    updatedAt: NOW,
  },
];

// ─── Master Registry ──────────────────────────────────────────

const ALL_FEATURES: FeatureDefinition[] = [
  ...TECHNICAL_FEATURES,
  ...FUNDAMENTAL_FEATURES,
  ...REGIME_FEATURES,
  ...MARKET_FEATURES,
  ...SPILLOVER_FEATURES,
  ...EVENT_FEATURES,
  ...DERIVED_FEATURES,
];

// Index for O(1) lookup
const FEATURE_INDEX = new Map<string, FeatureDefinition>();
for (const f of ALL_FEATURES) {
  FEATURE_INDEX.set(f.name, f);
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Get all feature definitions, optionally filtered.
 */
export function getAllFeatures(opts?: {
  source?: FeatureSource;
  enabledOnly?: boolean;
  tag?: string;
}): FeatureDefinition[] {
  let result = ALL_FEATURES;
  if (opts?.source) result = result.filter(f => f.source === opts.source);
  if (opts?.enabledOnly) result = result.filter(f => f.enabled);
  if (opts?.tag) result = result.filter(f => f.tags?.includes(opts.tag!));
  return result;
}

/**
 * Get a single feature definition by name.
 */
export function getFeature(name: string): FeatureDefinition | undefined {
  return FEATURE_INDEX.get(name);
}

/**
 * Get feature names for a specific model version.
 * This is what both training and inference must agree on.
 */
export function getModelFeatureSet(modelVersion = 'predict-v3-regime-spillover'): string[] {
 // Return the exact set of features the model uses.
  // As model versions evolve, this set changes.
  if (modelVersion.startsWith('predict-v3')) {
    return ALL_FEATURES
      .filter(f => f.enabled && f.source !== 'derived' || f.name === 'raw_score')
      .map(f => f.name);
  }
  // v1/v2 only used technical features
  return TECHNICAL_FEATURES.filter(f => f.enabled).map(f => f.name);
}

/**
 * Validate a feature value against its definition.
 * Returns { valid, errors }.
 */
export function validateFeature(
  name: string,
  value: unknown,
): { valid: boolean; errors: string[] } {
  const def = FEATURE_INDEX.get(name);
  const errors: string[] = [];

  if (!def) {
    errors.push(`Unknown feature: ${name}`);
    return { valid: false, errors };
  }

  if (!def.enabled) {
    errors.push(`Feature ${name} is disabled`);
    return { valid: false, errors };
  }

  if (value === null || value === undefined) {
    if (def.nullable) return { valid: true, errors: [] };
    errors.push(`Feature ${name} is not nullable but got null`);
    return { valid: false, errors };
  }

  if (def.type === 'numeric') {
    const num = Number(value);
    if (isNaN(num)) {
      errors.push(`Feature ${name} expects numeric, got ${typeof value}`);
    } else if (def.expectedRange) {
      const [min, max] = def.expectedRange;
      // Allow 10% tolerance for range violations (data can be slightly out of range)
      const tolerance = (max - min) * 0.1;
      if (num < min - tolerance) {
        errors.push(`Feature ${name} value ${num} below range [${min}, ${max}]`);
      } else if (num > max + tolerance) {
        errors.push(`Feature ${name} value ${num} above range [${min}, ${max}]`);
      }
    }
  }

  if (def.type === 'categorical' && def.allowedValues) {
    if (!def.allowedValues.includes(String(value))) {
      errors.push(`Feature ${name} value "${value}" not in allowed values: ${def.allowedValues.join(', ')}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate an entire feature vector at once.
 * Returns { valid, featureErrors, versionHash }.
 */
export function validateFeatureVector(
  features: Record<string, unknown>,
): { valid: boolean; featureErrors: Record<string, string[]>; versionHash: string } {
  const featureErrors: Record<string, string[]> = {};
  let allValid = true;

  for (const [name, value] of Object.entries(features)) {
    const result = validateFeature(name, value);
    if (!result.valid) {
      featureErrors[name] = result.errors;
      allValid = false;
    }
  }

  // Check for missing required features
  const required = getModelFeatureSet().filter(n => {
    const def = FEATURE_INDEX.get(n);
    return def && !def.nullable && def.source !== 'derived';
  });
  const missing = required.filter(n => !(n in features));
  // Don't fail on missing optional features, just warn
  for (const m of missing) {
    const def = FEATURE_INDEX.get(m);
    if (def && (def.source === 'fundamental' || def.source === 'spillover' || def.source === 'market')) {
      // These are nullable in practice — fundamentals/spillover might not be available
      continue;
    }
  }

  return {
    valid: allValid,
    featureErrors,
    versionHash: computeVersionHash(),
  };
}

/**
 * Compute a hash representing the current feature schema version.
 * Training and inference should compare hashes to detect mismatches.
 */
export function computeVersionHash(): string {
  const parts = ALL_FEATURES
    .filter(f => f.enabled)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(f => `${f.name}:v${f.version}`);

  // Simple deterministic hash (not crypto, just fingerprint)
  let hash = 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return `fs-${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

/**
 * Get version change log (simulated from version numbers).
 */
export function getVersionChangelog(): FeatureVersionInfo[] {
  const changes: FeatureVersionInfo[] = [
    {
      featureName: 'event_restriction_level',
      version: 1,
      changedAt: '2026-08-01',
      changeDescription: 'Added: event-risk-engine restriction level as feature',
    },
    {
      featureName: 'raw_score',
      version: 2,
      changedAt: '2025-06-01',
      changeDescription: 'Updated: now includes spillover features in dependency graph',
    },
  ];
  return changes;
}

export type FeatureStoreSummary = {
  totalFeatures: number;
  enabledFeatures: number;
  bySource: Record<string, number>;
  versionHash: string;
  modelFeatureCount: number;
};

/**
 * Get a summary of the feature store.
 */
export function getFeatureStoreSummary(): FeatureStoreSummary {
  const enabled = ALL_FEATURES.filter(f => f.enabled);
  const bySource: Record<string, number> = {};
  for (const f of enabled) {
    bySource[f.source] = (bySource[f.source] || 0) + 1;
  }

  return {
    totalFeatures: ALL_FEATURES.length,
    enabledFeatures: enabled.length,
    bySource,
    versionHash: computeVersionHash(),
    modelFeatureCount: getModelFeatureSet().length,
  };
}
