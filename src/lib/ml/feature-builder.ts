// ============================================================
// Feature Builder — extracts a canonical feature vector from the
// existing engine outputs (prediction-engine, fundamental-engine,
// regime-detection, drift-monitor, etc.).
//
// This is the BRIDGE between the rule-based engine and the
// meta-model. It reads all available signals and normalizes them
// into the feature schema defined in feature-definitions.ts.
//
// Design principle: NEVER look at future data. Every feature
// uses only information available at prediction time.
// ============================================================

import { predictStock, type PredictionResult, type PricePoint } from '@/lib/prediction-engine';
import { analyzeFundamentals } from '@/lib/fundamental-engine';
import { fetchHistoricalData, getRealPrices } from '@/lib/alpha-vantage';
import {
  FEATURE_NAMES,
  FEATURE_SCHEMA_VERSION,
  FEATURE_DEFINITIONS,
  computeSchemaHash,
  getDefaultFeatures,
  type FeatureName,
} from './feature-definitions';
import prisma from '@/lib/prisma';

// ─── Types ──────────────────────────────────────────────────

export interface FeatureBuildResult {
  features: Record<FeatureName, number>;
  version: string;
  schemaHash: string;
  featureCount: number;
  missingSources: string[];
  /** Raw indicator scores from prediction-engine for debugging */
  indicatorScores?: Record<string, number>;
}

export interface FeatureBuildOptions {
  /** Override indicator scores directly (for testing or batch builds) */
  indicatorScores?: Record<string, number>;
  /** Override technical score */
  technicalScore?: number;
  /** Override fundamental score */
  fundamentalScore?: number;
  /** Override regime */
  regime?: string;
  /** Override regime confidence */
  regimeConfidence?: number;
  /** Override transition risk */
  transitionRisk?: number;
  /** Override drift score */
  driftScore?: number;
  /** Override spillover score */
  spilloverScore?: number;
  /** Override strategy health */
  strategyHealth?: number;
  /** Override days to earnings */
  daysToEarnings?: number;
  /** Override event risk flag */
  eventRiskFlag?: number;
  /** Override SPY trend */
  spyTrend5d?: number;
  /** Override VIX level */
  vixLevel?: number;
  /** Override market breadth */
  marketBreadth?: number;
  /** Override spread estimate */
  spreadEstimate?: number;
  /** Override volume spike */
  volumeSpike?: number;
  /** Override liquidity score */
  liquidityScore?: number;
  /** Override price change % */
  priceChangePct?: number;
}

// ─── Helpers ────────────────────────────────────────────────

/** Compute SMA for an array of numbers */
function sma(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1] ?? 0;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/** Compute standard deviation */
function std(data: number[]): number {
  if (data.length < 2) return 0;
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const sqDiffs = data.map(x => (x - mean) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / (data.length - 1));
}

/** Compute daily returns from close prices */
function dailyReturns(closes: number[]): number[] {
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    if (prev === 0) rets.push(0);
    else rets.push((closes[i] - prev) / prev);
  }
  return rets;
}

/** Calculate ATR from price data */
function computeATR(prices: PricePoint[], period: number = 14): number {
  const trs: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const tr = Math.max(
      prices[i].high - prices[i].low,
      Math.abs(prices[i].high - prices[i - 1].close),
      Math.abs(prices[i].low - prices[i - 1].close),
    );
    trs.push(tr);
  }
  if (trs.length < period) return trs[trs.length - 1] ?? 0;
  // Simple average of last `period` TRs
  return sma(trs, period);
}

/** Encode regime string to numeric */
function encodeRegime(regime: string | null | undefined): number {
  const map = FEATURE_DEFINITIONS.regime_encoded.categoryMap;
  return map?.[regime ?? 'UNKNOWN'] ?? 1;
}

// ─── Main builder ───────────────────────────────────────────

/**
 * Build a feature vector for a symbol using the existing engine outputs.
 * This is the LIVE inference path — calls the real engines.
 */
export async function buildFeaturesLive(symbol: string): Promise<FeatureBuildResult> {
  const missingSources: string[] = [];
  const features = getDefaultFeatures();
  let indicatorScores: Record<string, number> = {};
  let technicalScore = 0;
  let fundamentalScore = 0;
  let regime: string | null = null;
  let regimeConfidence = 0.5;
  let transitionRisk = 0.3;

  // ── 1. Fetch historical data & run prediction engine ──
  try {
    const history = await fetchHistoricalData(symbol);
    if (history && history.length >= 60) {
      const result = predictStock(symbol, history);
      indicatorScores = result.indicatorScores || {};
      technicalScore = result.technicalScore;

      // Extract individual indicator values
      if (indicatorScores.rsi !== undefined) features.rsi = indicatorScores.rsi;
      if (indicatorScores.macdHistogram !== undefined) features.macd_histogram = indicatorScores.macdHistogram;
      if (indicatorScores.stochasticK !== undefined) features.stochastic_k = indicatorScores.stochasticK;
      if (indicatorScores.adx !== undefined) features.adx = indicatorScores.adx;
      if (indicatorScores.roc !== undefined) features.roc_10d = indicatorScores.roc;
      if (indicatorScores.obv !== undefined) features.obv_trend = indicatorScores.obv;

      features.technical_score = technicalScore;

      // ── Derived technical features from price data ──
      const closes = history.map(p => p.close);
      const currentPrice = closes[closes.length - 1];

      // SMAs
      if (closes.length >= 20) {
        const ma20 = sma(closes, 20);
        features.distance_ma20 = ((currentPrice - ma20) / ma20) * 100;
      }
      if (closes.length >= 50) {
        const ma50 = sma(closes, 50);
        features.distance_ma50 = ((currentPrice - ma50) / ma50) * 100;
      }
      if (closes.length >= 200) {
        const ma200 = sma(closes, 200);
        features.distance_ma200 = ((currentPrice - ma200) / ma200) * 100;
      }

      // ATR
      const atr = computeATR(history);
      features.atr_pct = currentPrice > 0 ? atr / currentPrice : 0.02;

      // Realized volatility
      if (closes.length >= 20) {
        const rets = dailyReturns(closes.slice(-21));
        features.realized_vol_20d = std(rets);
      }

      // Volume spike
      if (closes.length >= 20) {
        const vols = history.slice(-20).map(p => p.volume);
        const avgVol = vols.reduce((a, b) => a + b, 0) / vols.length;
        const currentVol = history[history.length - 1].volume;
        features.volume_spike = avgVol > 0 ? currentVol / avgVol : 1;
      }

      // Price change %
      if (closes.length >= 2) {
        const prev = closes[closes.length - 2];
        features.price_change_pct = prev > 0
          ? ((currentPrice - prev) / prev) * 100
          : 0;
      }

      // Bollinger position (approximate: use 20d SMA ± 2*std)
      if (closes.length >= 20) {
        const ma20 = sma(closes, 20);
        const slice20 = closes.slice(-20);
        const sigma = std(slice20);
        const bbLower = ma20 - 2 * sigma;
        const bbUpper = ma20 + 2 * sigma;
        const bbWidth = bbUpper - bbLower;
        features.bollinger_position = bbWidth > 0
          ? (currentPrice - bbLower) / bbWidth
          : 0.5;
        features.bollinger_position = Math.max(0, Math.min(1, features.bollinger_position));
      }
    }
  } catch (e) {
    missingSources.push('prediction-engine');
  }

  // ── 2. Fundamental score ──
  try {
    const fundResult = await analyzeFundamentals(symbol);
    if (fundResult) {
      fundamentalScore = fundResult.score;
      features.fundamental_score = fundamentalScore;
    }
  } catch {
    missingSources.push('fundamental-engine');
  }

  // ── 3. Regime (latest snapshot) ──
  try {
    const latestRegime = await prisma.regimeSnapshot.findFirst({
      orderBy: { date: 'desc' },
    });
    if (latestRegime) {
      regime = latestRegime.regimeState;
      regimeConfidence = latestRegime.confidence;
      transitionRisk = latestRegime.transitionRisk;
      features.regime_encoded = encodeRegime(regime);
      features.regime_confidence = regimeConfidence;
      features.transition_risk = transitionRisk;
    }
  } catch {
    missingSources.push('regime-detection');
  }

  // ── 4. Drift score (latest) ──
  try {
    // Compute max PSI from recent drift data
    const recentPredictions = await prisma.prediction.findMany({
      where: { rawScore: { not: null } },
      orderBy: { predictedAt: 'desc' },
      take: 50,
      select: { rawScore: true },
    });
    if (recentPredictions.length > 10) {
      // Simple drift proxy: std of recent scores
      const scores = recentPredictions.map(p => p.rawScore);
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const scoreStd = std(scores);
      // Normalize to 0-1 range (typical score std is ~15-30)
      features.drift_score = Math.min(1, scoreStd / 40);
    }
  } catch {
    missingSources.push('drift-monitor');
  }

  // ── 5. Strategy health ──
  try {
    const recentCorrect = await prisma.prediction.count({
      where: { wasCorrect: true, evaluatedAt: { not: null } },
    });
    const recentTotal = await prisma.prediction.count({
      where: { evaluatedAt: { not: null } },
    });
    features.strategy_health = recentTotal > 0 ? recentCorrect / recentTotal : 0.5;
  } catch {
    missingSources.push('health-thresholds');
  }

  // ── 6. Event risk (earnings proximity) ──
  try {
    const now = new Date();
    const nearEvent = await prisma.eventSnapshot.findFirst({
      where: {
        ticker: symbol,
        eventType: 'earnings',
        eventDate: { gte: now },
      },
      orderBy: { eventDate: 'asc' },
    });
    if (nearEvent?.eventDate) {
      const daysUntil = Math.ceil(
        (nearEvent.eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      features.days_to_earnings = Math.max(0, daysUntil);
      features.event_risk_flag = daysUntil <= 1 ? 1 : 0;
    } else {
      features.days_to_earnings = 999;
      features.event_risk_flag = 0;
    }
  } catch {
    missingSources.push('event-calendar');
  }

  // ── 7. Spillover score (latest) ──
  try {
    const latestSpillover = await prisma.spilloverSignal.findFirst({
      where: { targetSymbol: symbol },
      orderBy: { date: 'desc' },
    });
    if (latestSpillover) {
      features.spillover_score = latestSpillover.spilloverScore;
    }
  } catch {
    missingSources.push('spillover-v2');
  }

  // ── 8. Market breadth / VIX / SPY trend ──
  try {
    const latestMarket = await prisma.regimeSnapshot.findFirst({
      orderBy: { date: 'desc' },
      select: { spyReturn5d: true, vixLevel: true, breadthPct: true },
    });
    if (latestMarket) {
      if (latestMarket.spyReturn5d != null) features.spy_trend_5d = latestMarket.spyReturn5d * 100;
      if (latestMarket.vixLevel != null) features.vix_level_normalized = Math.min(2, latestMarket.vixLevel / 50);
      if (latestMarket.breadthPct != null) features.market_breadth = latestMarket.breadthPct / 100;
    }
  } catch {
    // non-critical
  }

  // ── 9. Liquidity score ──
  try {
    features.liquidity_score = features.volume_spike > 0 && features.atr_pct > 0
      ? features.volume_spike / (features.atr_pct * 100)
      : 1;
  } catch {
    // non-critical
  }

  return {
    features,
    version: FEATURE_SCHEMA_VERSION,
    schemaHash: computeSchemaHash(),
    featureCount: FEATURE_NAMES.length,
    missingSources,
    indicatorScores,
  };
}

/**
 * Build features from pre-computed values (for batch training from DB).
 * Avoids re-running the full engine for every historical row.
 */
export function buildFeaturesFromOptions(opts: FeatureBuildOptions): FeatureBuildResult {
  const features = getDefaultFeatures();
  const missingSources: string[] = [];

  // Apply overrides
  if (opts.indicatorScores) {
    const s = opts.indicatorScores;
    if (s.rsi !== undefined) features.rsi = s.rsi;
    if (s.macdHistogram !== undefined) features.macd_histogram = s.macdHistogram;
    if (s.stochasticK !== undefined) features.stochastic_k = s.stochasticK;
    if (s.adx !== undefined) features.adx = s.adx;
    if (s.roc !== undefined) features.roc_10d = s.roc;
    if (s.obv !== undefined) features.obv_trend = s.obv;
  }

  if (opts.technicalScore !== undefined) features.technical_score = opts.technicalScore;
  if (opts.fundamentalScore !== undefined) features.fundamental_score = opts.fundamentalScore;
  if (opts.regime !== undefined) features.regime_encoded = encodeRegime(opts.regime);
  if (opts.regimeConfidence !== undefined) features.regime_confidence = opts.regimeConfidence;
  if (opts.transitionRisk !== undefined) features.transition_risk = opts.transitionRisk;
  if (opts.driftScore !== undefined) features.drift_score = opts.driftScore;
  if (opts.spilloverScore !== undefined) features.spillover_score = opts.spilloverScore;
  if (opts.strategyHealth !== undefined) features.strategy_health = opts.strategyHealth;
  if (opts.daysToEarnings !== undefined) features.days_to_earnings = opts.daysToEarnings;
  if (opts.eventRiskFlag !== undefined) features.event_risk_flag = opts.eventRiskFlag;
  if (opts.spyTrend5d !== undefined) features.spy_trend_5d = opts.spyTrend5d;
  if (opts.vixLevel !== undefined) features.vix_level_normalized = Math.min(2, opts.vixLevel / 50);
  if (opts.marketBreadth !== undefined) features.market_breadth = opts.marketBreadth;
  if (opts.spreadEstimate !== undefined) features.spread_estimate = opts.spreadEstimate;
  if (opts.volumeSpike !== undefined) features.volume_spike = opts.volumeSpike;
  if (opts.liquidityScore !== undefined) features.liquidity_score = opts.liquidityScore;
  if (opts.priceChangePct !== undefined) features.price_change_pct = opts.priceChangePct;

  return {
    features,
    version: FEATURE_SCHEMA_VERSION,
    schemaHash: computeSchemaHash(),
    featureCount: FEATURE_NAMES.length,
    missingSources,
  };
}

/**
 * Save a feature snapshot to DB for audit and consistency checks.
 */
export async function saveFeatureSnapshot(
  symbol: string,
  features: Record<FeatureName, number>,
  date?: Date,
): Promise<void> {
  const snapshotDate = date ?? new Date();
  await prisma.featureSnapshot.upsert({
    where: {
      version_symbol_date: {
        version: FEATURE_SCHEMA_VERSION,
        symbol,
        date: snapshotDate,
      },
    },
    create: {
      version: FEATURE_SCHEMA_VERSION,
      symbol,
      date: snapshotDate,
      snapshot: features as any,
      schemaHash: computeSchemaHash(),
      featureCount: Object.keys(features).length,
    },
    update: {
      snapshot: features as any,
      schemaHash: computeSchemaHash(),
      featureCount: Object.keys(features).length,
    },
  });
}

/**
 * Convert feature vector to a flat numeric array in canonical order.
 * Used by the meta-model for inference.
 */
export function featureVectorToArray(features: Record<FeatureName, number>): number[] {
  return FEATURE_NAMES.map(name => features[name]);
}
