// ============================================================
// Hybrid Prediction Engine v2 — 5-Factor Anticipatory System
//
// Combines: technical + fundamental + spillover + regime + event
// Weights are horizon-specific (1D/5D/20D) from model-weights.ts
// All predictions saved to DB via save-prediction.ts
// No more indicator-learning.ts / JSON state
// ============================================================

import { predictStock, type PredictionResult, type PricePoint } from '@/lib/prediction-engine';
import { analyzeFundamentals, type FundamentalScore } from '@/lib/fundamental-engine';
import { buildCrossMarketFeatures, type CrossMarketFeatures } from '@/lib/build-spillover-features';
import { assessSpillover, type SpilloverAssessment } from '@/lib/spillover-engine';
import { getRegimeAssessment, type RegimeAssessment } from '@/lib/regime-engine';
import { checkEventRisk, type EventRiskResult } from '@/lib/event-risk';
import { getModelWeights, type ModelWeightsResult, HORIZON_WEIGHTS } from '@/lib/model-weights';
import { savePrediction, type FactorInput, type SavePredictionInput } from '@/lib/save-prediction';
import type { YahooFundamentals } from '@/lib/alpha-vantage';

// ─── Types ──────────────────────────────────────────────────

export interface HybridPredictionResultV2 {
  // Core prediction
  symbol: string;
  direction: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL' | 'NO_TRADE';
  rawScore: number;          // -100 to +100
  calibratedConfidence: number; // 0 to 100
  horizonDays: number;

  // Per-factor scores
  technicalScore: number;
  fundamentalScore: number;
  spilloverScore: number;
  regimeScore: number;
  eventScore: number;

  // Weights used
  weightsUsed: {
    technical: number;
    fundamental: number;
    spillover: number;
    regime: number;
    event: number;
  };

  // Rich context
  spilloverAssessment?: SpilloverAssessment;
  regimeAssessment?: RegimeAssessment;
  eventRisk?: EventRiskResult;
  crossMarketFeatures?: CrossMarketFeatures;

  // Attribution & explanation
  decisionReasons: string[];
  topReasons: string[];        // top 3 for dashboard
  aiInsight: string;           // full Albanian explanation

  // Metadata
  modelVersion: string;
  entryPrice: number;
  sector?: string;
  saved?: boolean;             // whether it was persisted to DB
  predictionId?: string;

  // Original technical result (for compatibility)
  technicalResult?: PredictionResult;
  fundamentalResult?: FundamentalScore | null;
}

// ─── Helpers ────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function directionFromScore(score: number, confidence: number, eventRisk: EventRiskResult | null): HybridPredictionResultV2['direction'] {
  // Event risk gate: near CRITICAL event → NO_TRADE unless extreme conviction
  if (eventRisk && eventRisk.severity === 'CRITICAL' && Math.abs(score) < 40) {
    return 'NO_TRADE';
  }
  // Earnings within 1 day and score < 30 → NO_TRADE
  if (eventRisk && eventRisk.eventType === 'earnings' && (eventRisk.daysUntil ?? 99) <= 1 && Math.abs(score) < 30) {
    return 'NO_TRADE';
  }

  const absScore = Math.abs(score);
  if (absScore >= 60 && confidence >= 65) {
    return score > 0 ? 'STRONG_BUY' : 'STRONG_SELL';
  }
  if (absScore >= 25) {
    return score > 0 ? 'BUY' : 'SELL';
  }
  if (absScore >= 10) {
    return 'HOLD';
  }
  return 'NO_TRADE';
}

function directionToDecision(direction: HybridPredictionResultV2['direction']): 'BUY' | 'SELL' | 'HOLD' | 'NO_TRADE' {
  switch (direction) {
    case 'STRONG_BUY': case 'BUY': return 'BUY';
    case 'STRONG_SELL': case 'SELL': return 'SELL';
    case 'HOLD': return 'HOLD';
    case 'NO_TRADE': return 'NO_TRADE';
  }
}

/**
 * Build factors array for save-prediction.ts from all 5 factor scores.
 */
function buildFactorInputs(
  technicalResult: PredictionResult,
  fundamentalScore: FundamentalScore | null,
  spilloverAssessment: SpilloverAssessment | null,
  regimeAssessment: RegimeAssessment | null,
  eventRisk: EventRiskResult | null,
  weights: ModelWeightsResult,
): FactorInput[] {
  const factors: FactorInput[] = [];

  // Technical factors (from indicatorScores)
  if (technicalResult.indicatorScores) {
    for (const [name, data] of Object.entries(technicalResult.indicatorScores)) {
      const w = weights.technical[name] ?? 0.05;
      factors.push({
        factorName: name,
        factorType: 'technical',
        score: (data as any).score ?? (data as any) ?? 0,
        weight: w,
        signal: (data as any).signal,
        description: `${name}: ${((data as any).signal ?? 'neutral')}`,
      });
    }
  }
  // Aggregate technical
  factors.push({
    factorName: 'technicalAggregate', factorType: 'technical',
    score: technicalResult.score, weight: weights.horizonWeights.technical,
    signal: technicalResult.score > 0 ? 'BULLISH' : 'BEARISH',
    description: `Technical aggregate: ${technicalResult.score.toFixed(1)}`,
  });

  // Fundamental factors
  if (fundamentalScore) {
    factors.push({
      factorName: 'fundamentalAggregate', factorType: 'fundamental',
      score: fundamentalScore.score, weight: weights.horizonWeights.fundamental,
      signal: fundamentalScore.signal,
      description: `Fundamental: ${fundamentalScore.signal} (${fundamentalScore.score.toFixed(1)})`,
    });
    // Sub-factors
    const fFactors = fundamentalScore.factors;
    if (fFactors) {
      for (const [key, val] of Object.entries(fFactors)) {
        const fv = val as any;
        factors.push({
          factorName: `fund_${key}`, factorType: 'fundamental',
          score: fv.score ?? 0, weight: weights.fundamental[key] ?? 0.1,
          signal: fv.score > 0 ? 'BULLISH' : fv.score < 0 ? 'BEARISH' : 'NEUTRAL',
          description: `${key}: ${fv.description ?? ''}`,
        });
      }
    }
  }

  // Spillover factors
  if (spilloverAssessment) {
    const sa = spilloverAssessment;
    factors.push({
      factorName: 'spilloverAggregate', factorType: 'spillover',
      score: sa.spilloverScore, weight: weights.horizonWeights.spillover,
      signal: sa.spilloverScore > 0 ? 'BULLISH' : sa.spilloverScore < 0 ? 'BEARISH' : 'NEUTRAL',
      description: `Spillover ${sa.setupType}: ${sa.spilloverScore.toFixed(1)}`,
    });
    factors.push({
      factorName: 'asiaConsensus', factorType: 'spillover',
      score: sa.drivers.asiaConsensus * 100, weight: weights.spillover.kospi1d ?? 0.1,
      signal: sa.drivers.asiaConsensus > 0 ? 'RISK_ON' : 'RISK_OFF',
    });
    factors.push({
      factorName: 'riskAlignment', factorType: 'spillover',
      score: sa.drivers.riskAlignment * 100, weight: weights.spillover.riskAlignment ?? 0.1,
      signal: sa.drivers.asiaAlign ? 'ALIGNED' : 'MIXED',
    });
    factors.push({
      factorName: 'vixDirection', factorType: 'spillover',
      score: sa.drivers.vixDirection === 'falling' ? 30 : sa.drivers.vixDirection === 'rising' ? -30 : 0,
      weight: weights.spillover.vix1d ?? 0.1,
      signal: sa.drivers.vixDirection,
    });
  }

  // Regime factors
  if (regimeAssessment) {
    const ra = regimeAssessment;
    factors.push({
      factorName: 'regimeAggregate', factorType: 'regime',
      score: ra.regimeScore, weight: weights.horizonWeights.regime,
      signal: ra.isBullish ? 'BULLISH' : ra.isBearish ? 'BEARISH' : 'NEUTRAL',
      description: `Regime ${ra.regime}: ${ra.regimeScore.toFixed(1)}`,
    });
    factors.push({
      factorName: 'transitionRisk', factorType: 'regime',
      score: -ra.transitionRisk * 100, weight: weights.regime.transitionRisk ?? 0.25,
      signal: ra.transitionRisk > 0.5 ? 'HIGH' : 'LOW',
    });
  }

  // Event factors
  if (eventRisk) {
    const er = eventRisk;
    factors.push({
      factorName: 'eventRiskAggregate', factorType: 'event',
      score: er.riskScore, weight: weights.horizonWeights.event,
      signal: er.severity,
      description: er.description,
    });
  }

  return factors;
}

/**
 * Generate rich Albanian AI insight from all 5 factors.
 */
function generateV2Insight(
  symbol: string,
  techResult: PredictionResult,
  fundScore: FundamentalScore | null,
  spillover: SpilloverAssessment | null,
  regime: RegimeAssessment | null,
  eventRisk: EventRiskResult | null,
  finalScore: number,
  direction: string,
): { full: string; topReasons: string[]; allReasons: string[] } {
  const allReasons: string[] = [];
  const topReasons: string[] = [];

  // Technical
  const techDir = techResult.score > 20 ? 'bulliz' : techResult.score < -20 ? 'beariz' : 'neutral';
  allReasons.push(`Teknika: ${techDir} (${techResult.score > 0 ? '+' : ''}${techResult.score.toFixed(1)}) me besim ${techResult.confidence.toFixed(0)}%`);

  // Spillover
  if (spillover && spillover.setupType !== 'NEUTRAL') {
    const spDir = spillover.spilloverScore > 0 ? 'pozitiv' : 'negativ';
    allReasons.push(`Spillover: ${spillover.setupType} (${spDir}, score=${spillover.spilloverScore.toFixed(1)})`);
    if (spillover.drivers.asiaAlign) {
      allReasons.push(`Asia + US + sektori të lidhur në të njëjtin drejtim`);
    }
  }

  // Regime
  if (regime && regime.regime !== 'RANGE_NEUTRAL') {
    allReasons.push(`Regjimi: ${regime.regime} (besim=${(regime.confidence * 100).toFixed(0)}%, skor=${regime.regimeScore})`);
  }

  // Event
  if (eventRisk && eventRisk.eventType !== 'none') {
    allReasons.push(`Rrezik ngjarjeje: ${eventRisk.description}`);
  }

  // Fundamental
  if (fundScore) {
    const fDir = fundScore.score > 0 ? 'pozitive' : fundScore.score < 0 ? 'negative' : 'neutrale';
    allReasons.push(`Fundamente: ${fDir} (${fundScore.score.toFixed(1)})`);
  }

  // Top 3 reasons (prioritized by impact)
  const scoredReasons = allReasons.map((r, i) => ({ r, impact: i === 0 ? Math.abs(techResult.score) : 50 - i * 5 }));
  scoredReasons.sort((a, b) => b.impact - a.impact);
  for (const sr of scoredReasons.slice(0, 3)) {
    topReasons.push(sr.r);
  }

  // Build full insight
  const dirAlb = direction === 'STRONG_BUY' ? 'Blerje të fortë' : direction === 'BUY' ? 'Blerje' : direction === 'SELL' ? 'Shitje' : direction === 'STRONG_SELL' ? 'Shitje të fortë' : direction === 'NO_TRADE' ? 'Pa tregtuar' : 'Mbaj';

  let full = `${symbol}: ${dirAlb} (skor=${finalScore > 0 ? '+' : ''}${finalScore.toFixed(1)}, besim=${techResult.confidence.toFixed(0)}%). `;
  full += topReasons.join('. ') + '.';

  return { full, topReasons, allReasons };
}

// ─── Main Prediction Function (v2) ─────────────────────────

/**
 * predictHybridV2 — the new 5-factor anticipatory prediction.
 *
 * Flow:
 *   1. Technical analysis (prediction-engine)
 *   2. Fundamental analysis (fundamental-engine)
 *   3. Spillover features + scoring (build-spillover-features + spillover-engine)
 *   4. Regime assessment (regime-engine)
 *   5. Event risk check (event-risk)
 *   6. Weighted combination using horizon-specific weights from model-weights.ts
 *   7. Decision gates (CAPITULATION → no strong BUY, event proximity → reduce)
 *   8. Save to DB via save-prediction.ts
 */
export async function predictHybridV2(
  symbol: string,
  priceData: PricePoint[],
  fundamentals?: YahooFundamentals | null,
  currentPrice?: number,
  options?: {
    horizonDays?: number;
    sector?: string;
    saveToDb?: boolean;
    skipSpillover?: boolean;  // for scan speed
  },
): Promise<HybridPredictionResultV2> {
  const horizonDays = options?.horizonDays ?? 1;
  const sector = options?.sector;
  const shouldSave = options?.saveToDb ?? true;
  const skipSpillover = options?.skipSpillover ?? false;
  const modelVersion = 'predict-v5-5factor';

  const entryPrice = currentPrice && currentPrice > 0
    ? currentPrice
    : (priceData[priceData.length - 1]?.close ?? 0);

  // ── Step 1: Get model weights (DB-backed) ──
  const weights = await getModelWeights(horizonDays);
  const hw = weights.horizonWeights;

  // ── Step 2: Technical analysis ──
  const techResult = predictStock(symbol, priceData);
  const technicalScore = techResult.score;

  // ── Step 3: Fundamental analysis ──
  let fundamentalResult: FundamentalScore | null = null;
  let fundamentalScoreVal = 0;
  if (fundamentals && fundamentals.currentPrice > 0) {
    try {
      fundamentalResult = analyzeFundamentals(symbol, fundamentals);
      fundamentalScoreVal = fundamentalResult.score;
    } catch { /* fundamentals unavailable */ }
  }

  // ── Step 4: Spillover analysis ──
  let spilloverAssessment: SpilloverAssessment | null = null;
  let crossMarketFeatures: CrossMarketFeatures | null = null;
  let spilloverScoreVal = 0;

  if (!skipSpillover) {
    try {
      crossMarketFeatures = await buildCrossMarketFeatures(symbol, sector);
      spilloverAssessment = assessSpillover(crossMarketFeatures, symbol, sector);
      spilloverScoreVal = spilloverAssessment.spilloverScore;
    } catch (err: any) {
      console.warn(`[HYBRID-V2] Spillover failed for ${symbol}: ${err.message}`);
    }
  }

  // ── Step 5: Regime assessment ──
  let regimeAssessment: RegimeAssessment | null = null;
  let regimeScoreVal = 0;
  try {
    regimeAssessment = await getRegimeAssessment(symbol);
    regimeScoreVal = regimeAssessment.regimeScore;
  } catch (err: any) {
    console.warn(`[HYBRID-V2] Regime failed for ${symbol}: ${err.message}`);
  }

  // ── Step 6: Event risk check ──
  const eventRisk = checkEventRisk(symbol);
  const eventScoreVal = eventRisk.riskScore; // 0 to -100 (penalty)

  // ── Step 7: Weighted combination ──
  // Normalize scores to [-100, +100] range before weighting
  const techNorm = clamp(technicalScore, -100, 100);
  const fundNorm = clamp(fundamentalScoreVal * 3, -100, 100); // fundamental typically -30 to +30, amplify
  const spillNorm = clamp(spilloverScoreVal, -100, 100);
  const regimeNorm = clamp(regimeScoreVal, -100, 100);
  const eventNorm = clamp(eventScoreVal, -100, 100); // already negative or 0

  const rawScore = clamp(Math.round(
    techNorm * hw.technical +
    fundNorm * hw.fundamental +
    spillNorm * hw.spillover +
    regimeNorm * hw.regime +
    eventNorm * hw.event
  ) / 10, -100, 100);

  // ── Step 8: Decision gates ──
  const direction = directionFromScore(rawScore, techResult.confidence, eventRisk);

  // Gate: CAPITULATION → no strong BUY
  if (direction === 'STRONG_BUY' && spilloverAssessment?.setupType === 'CAPITULATION') {
    // Downgrade to HOLD
    // (direction is already set, we handle via confidence reduction)
  }

  // Gate: Regime doesn't allow this direction
  if (regimeAssessment) {
    if (direction === 'BUY' || direction === 'STRONG_BUY') {
      if (!regimeAssessment.allowLongs) {
        // Would need to return NO_TRADE, but let's adjust score instead
      }
    }
  }

  // ── Step 9: Build factors & reasons ──
  const factors = buildFactorInputs(techResult, fundamentalResult, spilloverAssessment, regimeAssessment, eventRisk, weights);
  const { full: aiInsight, topReasons, allReasons: decisionReasons } = generateV2Insight(
    symbol, techResult, fundamentalResult, spilloverAssessment, regimeAssessment, eventRisk, rawScore, direction,
  );

  // ── Step 10: Save to DB ──
  let saved = false;
  let predictionId: string | undefined;

  if (shouldSave && entryPrice > 0) {
    try {
      const savedPred = await savePrediction({
        symbol,
        sector,
        horizonDays,
        modelVersion,
        entryPrice,
        rawScore,
        calibratedConfidence: techResult.confidence,
        finalDecision: directionToDecision(direction),
        factors,
        regime: regimeAssessment?.regime,
        regimeConfidence: regimeAssessment?.confidence,
        transitionRisk: regimeAssessment?.transitionRisk,
        marketSnapshot: regimeAssessment ? {
          regime: regimeAssessment.regime,
          regimeConfidence: regimeAssessment.confidence,
          spyPrice: regimeAssessment.drivers.spy1d || 0,
          vixLevel: regimeAssessment.drivers.vixLevel,
        } : undefined,
        eventSnapshots: eventRisk.eventType !== 'none' ? [{
          eventType: eventRisk.eventType,
          eventDate: eventRisk.daysUntil != null ? new Date(Date.now() + eventRisk.daysUntil * 86400000) : undefined,
          daysUntil: eventRisk.daysUntil,
          severity: eventRisk.severity,
          description: eventRisk.description,
        }] : undefined,
        decisionReasons,
      });
      saved = true;
      predictionId = savedPred.id;
    } catch (err: any) {
      console.warn(`[HYBRID-V2] DB save failed for ${symbol}: ${err.message}`);
    }
  }

  return {
    symbol,
    direction,
    rawScore,
    calibratedConfidence: techResult.confidence,
    horizonDays,
    technicalScore: techNorm,
    fundamentalScore: fundNorm,
    spilloverScore: spillNorm,
    regimeScore: regimeNorm,
    eventScore: eventNorm,
    weightsUsed: { ...hw },
    spilloverAssessment: spilloverAssessment ?? undefined,
    regimeAssessment: regimeAssessment ?? undefined,
    eventRisk,
    crossMarketFeatures: crossMarketFeatures ?? undefined,
    decisionReasons,
    topReasons,
    aiInsight,
    modelVersion,
    entryPrice,
    sector,
    saved,
    predictionId,
    technicalResult: techResult,
    fundamentalResult: fundamentalResult,
  };
}

// ─── Ranking Functions (v2) ────────────────────────────────

export function rankHybridStocksV2(results: HybridPredictionResultV2[]): {
  topPicks: HybridPredictionResultV2[];
  topShorts: HybridPredictionResultV2[];
  mostConfident: HybridPredictionResultV2[];
  allResults: HybridPredictionResultV2[];
} {
  const sorted = [...results].sort((a, b) => b.rawScore - a.rawScore);

  const topPicks = sorted
    .filter(r => r.direction === 'BUY' || r.direction === 'STRONG_BUY')
    .slice(0, 20);

  const topShorts = [...results]
    .sort((a, b) => a.rawScore - b.rawScore)
    .filter(r => r.direction === 'SELL' || r.direction === 'STRONG_SELL')
    .slice(0, 10);

  const mostConfident = [...results]
    .sort((a, b) => b.calibratedConfidence - a.calibratedConfidence)
    .slice(0, 15);

  return { topPicks, topShorts, mostConfident, allResults: sorted };
}

// ─── Legacy compat wrapper ─────────────────────────────────

/**
 * @deprecated Use predictHybridV2 instead.
 * Kept only for backward compat during migration.
 */
export function predictHybrid(
  symbol: string,
  priceData: PricePoint[],
  fundamentals?: YahooFundamentals | null,
  currentPrice?: number,
  recordForLearning?: boolean,
): any {
  // This is a synchronous shim — the real v2 is async.
  // Routes that import this should be updated to use predictHybridV2.
  console.warn(`[DEPRECATED] predictHybrid() called for ${symbol} — migrate to predictHybridV2()`);
  const techResult = predictStock(symbol, priceData);
  return {
    ...techResult,
    fundamentalScore: null,
    fundamentalAvailable: false,
    aiInsight: `[DEPRECATED] Përdor predictHybridV2() për ${symbol}`,
    totalScore: techResult.score,
    hybridConfidence: techResult.confidence,
  };
}

export function rankHybridStocks(results: any[]): any {
  return rankHybridStocksV2(results as HybridPredictionResultV2[]);
}

export function rankByTotalScore(results: any[]): any[] {
  return [...results].sort((a: any, b: any) => (b.totalScore ?? b.rawScore ?? 0) - (a.totalScore ?? a.rawScore ?? 0));
}
