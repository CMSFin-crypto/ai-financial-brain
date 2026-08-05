// ============================================================
// Hybrid Prediction Engine v2.1 — 5-Factor Anticipatory System
//
// Improvements over v2:
//   - hybridConfidence computed from 5-factor confluence (not tech-only)
//   - Multi-horizon: computePerHorizon() returns 1D/5D/20D with specific
//     factors, reasons, and decisions per horizon
//   - Hard gates actually enforced (CAPITULATION → NO_TRADE, regime blocks)
//   - Multi-horizon save in a single $transaction via savePredictionsAtomic()
//   - Spillover proxy from regime context when skipSpillover=true (scan)
// ============================================================

import { predictStock, type PredictionResult, type PricePoint } from '@/lib/prediction-engine';
import { analyzeFundamentals, type FundamentalScore } from '@/lib/fundamental-engine';
import { buildCrossMarketFeatures, type CrossMarketFeatures } from '@/lib/build-spillover-features';
import { assessSpillover, type SpilloverAssessment } from '@/lib/spillover-engine';
import { getRegimeAssessment, type RegimeAssessment } from '@/lib/regime-engine';
import { checkMultiEventRisk, type EventRiskResult, type MultiEventRiskResult } from '@/lib/event-risk';
import { getModelWeights, type ModelWeightsResult, HORIZON_WEIGHTS } from '@/lib/model-weights';
import { savePredictionsAtomic, type SavePredictionInput, type FactorInput } from '@/lib/save-prediction';
import type { YahooFundamentals } from '@/lib/alpha-vantage';

// ─── Types ──────────────────────────────────────────────────

export type Direction6 = 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL' | 'NO_TRADE';
export type Decision4 = 'BUY' | 'SELL' | 'HOLD' | 'NO_TRADE';

/** Result for a single horizon */
export interface HorizonResult {
  horizonDays: number;
  direction: Direction6;
  decision: Decision4;
  rawScore: number;
  hybridConfidence: number;    // 5-factor confluence confidence
  technicalScore: number;
  fundamentalScore: number;
  spilloverScore: number;
  regimeScore: number;
  eventScore: number;
  weightsUsed: { technical: number; fundamental: number; spillover: number; regime: number; event: number };
  factors: FactorInput[];
  decisionReasons: string[];
  topReasons: string[];
  gated: boolean;               // whether a hard gate changed the decision
  gateReason?: string;           // which gate fired
}

/** Full multi-horizon result */
export interface HybridPredictionResultV2 {
  symbol: string;
  entryPrice: number;
  sector?: string;
  modelVersion: string;

  // Per-horizon results (always 3: 1, 5, 20)
  horizons: HorizonResult[];

  // Quick access to primary horizon (1D)
  direction: Direction6;
  rawScore: number;
  hybridConfidence: number;
  horizonDays: number;
  topReasons: string[];
  aiInsight: string;

  // Shared context (same for all horizons)
  spilloverAssessment?: SpilloverAssessment;
  regimeAssessment?: RegimeAssessment;
  eventRisk: MultiEventRiskResult;
  crossMarketFeatures?: CrossMarketFeatures;
  technicalResult: PredictionResult;
  fundamentalResult: FundamentalScore | null;

  // DB persistence
  saved?: boolean;
  predictionIds: Record<number, string>; // horizonDays → id
}

// ─── Constants ──────────────────────────────────────────────

const ALL_HORIZONS = [1, 5, 20] as const;

// ─── Helpers ────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

function decisionToDirection(d: Decision4): Direction6 {
  return d;
}

/**
 * Compute hybridConfidence from 5-factor confluence.
 *
 * Logic:
 *   - Start with technical confidence as base (most reliable signal)
 *   - Bonus when factors agree in direction (confluence)
 *   - Penalty when factors disagree (conflict)
 *   - Penalty for low regime confidence (uncertain environment)
 *   - Penalty for event risk severity
 *
 * Range: [10, 98]
 */
function computeHybridConfidence(
  techConfidence: number,
  scores: { technical: number; fundamental: number; spillover: number; regime: number; event: number },
  regimeAssessment: RegimeAssessment | null,
  eventRisk: MultiEventRiskResult,
): number {
  let conf = techConfidence; // base: 0-100

  // 1. Confluence bonus: how many of the 4 non-technical factors agree with technical?
  const techBullish = scores.technical > 0;
  const agreeCount = [scores.fundamental, scores.spillover, scores.regime].filter(s => {
    // event is penalty-only, skip; fundamental=0 means no data → neutral
    if (s === 0) return false;
    return (s > 0) === techBullish;
  }).length;

  // Each agreeing factor: +5% confidence (max +15%)
  conf += agreeCount * 5;

  // 2. Conflict penalty: factors that strongly disagree
  const conflictCount = [scores.fundamental, scores.spillover, scores.regime].filter(s => {
    if (s === 0) return false;
    return (s > 0) !== techBullish && Math.abs(s) > 20;
  }).length;
  conf -= conflictCount * 8;

  // 3. Regime confidence penalty
  if (regimeAssessment && regimeAssessment.confidence < 0.5) {
    conf -= 10; // uncertain regime → lower confidence
  }

  // 4. Regime bearish/volatile penalty
  if (regimeAssessment?.isVolatile) {
    conf -= 5;
  }

  // 5. Event risk penalty
  if (eventRisk.hasCriticalEvent) {
    conf -= 15;
  } else if (eventRisk.events.length > 0) {
    conf -= 5;
  }

  // 6. Spillover CAPITULATION penalty
  // (handled outside, but also reduce confidence)

  return clamp(Math.round(conf), 10, 98);
}

/**
 * Compute spillover proxy from regime context when full spillover is skipped.
 * Uses regime drivers (spy1d, kospi1d, smh1d, vixLevel) to estimate spillover direction.
 */
function computeSpilloverProxy(regimeAssessment: RegimeAssessment | null): number {
  if (!regimeAssessment) return 0;
  const d = regimeAssessment.drivers;

  // Quick heuristic from regime's built-in market data
  const spySignal = d.spy1d > 0.5 ? 1 : d.spy1d < -0.5 ? -1 : 0;
  const qqqSignal = d.qqq1d > 0.5 ? 1 : d.qqq1d < -0.5 ? -1 : 0;
  const smhSignal = d.smh1d > 0.5 ? 1 : d.smh1d < -0.5 ? -1 : 0;
  const kospiSignal = d.kospi1d > 0.5 ? 1 : d.kospi1d < -0.5 ? -1 : 0;
  const vixPenalty = d.vixLevel > 25 ? -10 : d.vixLevel > 20 ? -5 : 0;

  // Average alignment of available signals
  const signals = [spySignal, qqqSignal, smhSignal, kospiSignal].filter(s => s !== 0);
  if (signals.length === 0) return 0;
  const avgSignal = signals.reduce((a, b) => a + b, 0) / signals.length;

  return clamp(Math.round(avgSignal * 25 + vixPenalty), -100, 100);
}

/**
 * Hard gate enforcement.
 * Returns { direction, gated, gateReason } where gated=true means
 * the original direction was overridden.
 */
function applyHardGates(
  proposedDirection: Direction6,
  rawScore: number,
  spilloverAssessment: SpilloverAssessment | null,
  regimeAssessment: RegimeAssessment | null,
  eventRisk: MultiEventRiskResult,
  confidence: number,
): { direction: Direction6; gated: boolean; gateReason?: string } {
  // Gate 1: CAPITULATION → no strong BUY
  if (spilloverAssessment?.setupType === 'CAPITULATION') {
    if (proposedDirection === 'STRONG_BUY' || proposedDirection === 'BUY') {
      if (Math.abs(rawScore) < 50) {
        return { direction: 'NO_TRADE', gated: true, gateReason: 'CAPITULATION: no BUY when Asia risk-off + VIX rising + sector weak' };
      }
      // Even if score is high, downgrade STRONG_BUY → HOLD
      if (proposedDirection === 'STRONG_BUY') {
        return { direction: 'HOLD', gated: true, gateReason: 'CAPITULATION: STRONG_BUY downgraded to HOLD' };
      }
    }
  }

  // Gate 2: Regime blocks direction
  if (regimeAssessment) {
    if ((proposedDirection === 'BUY' || proposedDirection === 'STRONG_BUY') && !regimeAssessment.allowLongs) {
      return { direction: 'NO_TRADE', gated: true, gateReason: `Regime ${regimeAssessment.regime} blocks longs (allowLongs=false)` };
    }
    if ((proposedDirection === 'SELL' || proposedDirection === 'STRONG_SELL') && !regimeAssessment.allowShorts) {
      return { direction: 'NO_TRADE', gated: true, gateReason: `Regime ${regimeAssessment.regime} blocks shorts` };
    }
  }

  // Gate 3: CRITICAL event → NO_TRADE unless extreme conviction
  if (eventRisk.hasCriticalEvent && Math.abs(rawScore) < 40) {
    return { direction: 'NO_TRADE', gated: true, gateReason: `CRITICAL event: ${eventRisk.worstEvent.description}` };
  }

  // Gate 4: Earnings within 1 day and score < 30 → NO_TRADE
  if (eventRisk.worstEvent.eventType === 'earnings' && (eventRisk.worstEvent.daysUntil ?? 99) <= 1 && Math.abs(rawScore) < 30) {
    return { direction: 'NO_TRADE', gated: true, gateReason: `Earnings within 1 day: ${eventRisk.worstEvent.description}` };
  }

  // Gate 5: FOMC/CPI within 1 day → reduce STRONG_BUY to BUY
  const macroEvent = eventRisk.events.find(e => e.eventType === 'fed' || e.eventType === 'cpi');
  if (macroEvent && (macroEvent.daysUntil ?? 99) <= 1 && proposedDirection === 'STRONG_BUY') {
    return { direction: 'BUY', gated: true, gateReason: `${macroEvent.eventType.toUpperCase()} within 1 day: STRONG_BUY downgraded` };
  }

  return { direction: proposedDirection, gated: false };
}

function directionFromScoreAndConfidence(score: number, confidence: number): Direction6 {
  const absScore = Math.abs(score);
  if (absScore >= 60 && confidence >= 65) return score > 0 ? 'STRONG_BUY' : 'STRONG_SELL';
  if (absScore >= 25) return score > 0 ? 'BUY' : 'SELL';
  if (absScore >= 10) return 'HOLD';
  return 'NO_TRADE';
}

// ─── Factor Builder (per-horizon) ──────────────────────────

function buildFactorInputs(
  technicalResult: PredictionResult,
  fundamentalScore: FundamentalScore | null,
  spilloverAssessment: SpilloverAssessment | null,
  spilloverProxy: number,
  regimeAssessment: RegimeAssessment | null,
  eventRisk: MultiEventRiskResult,
  weights: ModelWeightsResult,
  useProxy: boolean,
): FactorInput[] {
  const factors: FactorInput[] = [];

  // Technical (same for all horizons — indicator scores don't change by horizon)
  if (technicalResult.indicatorScores) {
    for (const [name, data] of Object.entries(technicalResult.indicatorScores)) {
      factors.push({
        factorName: name, factorType: 'technical',
        score: (data as any).score ?? 0, weight: weights.technical[name] ?? 0.05,
        signal: (data as any).signal,
      });
    }
  }
  factors.push({
    factorName: 'technicalAggregate', factorType: 'technical',
    score: technicalResult.score, weight: weights.horizonWeights.technical,
    signal: technicalResult.score > 0 ? 'BULLISH' : 'BEARISH',
  });

  // Fundamental (same raw data, but weight changes per horizon)
  if (fundamentalScore) {
    factors.push({
      factorName: 'fundamentalAggregate', factorType: 'fundamental',
      score: fundamentalScore.score, weight: weights.horizonWeights.fundamental,
      signal: fundamentalScore.signal,
    });
    const fFactors = fundamentalScore.factors;
    if (fFactors) {
      for (const [key, val] of Object.entries(fFactors)) {
        const fv = val as any;
        factors.push({
          factorName: `fund_${key}`, factorType: 'fundamental',
          score: fv.score ?? 0, weight: weights.fundamental[key] ?? 0.1,
          signal: fv.score > 0 ? 'BULLISH' : fv.score < 0 ? 'BEARISH' : 'NEUTRAL',
        });
      }
    }
  }

  // Spillover (different weight per horizon; score is same or proxy)
  const spillScore = useProxy ? spilloverProxy : (spilloverAssessment?.spilloverScore ?? 0);
  factors.push({
    factorName: 'spilloverAggregate', factorType: 'spillover',
    score: spillScore, weight: weights.horizonWeights.spillover,
    signal: spillScore > 10 ? 'BULLISH' : spillScore < -10 ? 'BEARISH' : 'NEUTRAL',
    description: useProxy ? 'Spillover (proxy from regime)' : `Spillover ${spilloverAssessment?.setupType ?? 'N/A'}`,
  });
  if (spilloverAssessment && !useProxy) {
    factors.push({
      factorName: 'asiaConsensus', factorType: 'spillover',
      score: spilloverAssessment.drivers.asiaConsensus * 100,
      weight: weights.spillover.kospi1d ?? 0.1,
      signal: spilloverAssessment.drivers.asiaConsensus > 0 ? 'RISK_ON' : 'RISK_OFF',
    });
    factors.push({
      factorName: 'riskAlignment', factorType: 'spillover',
      score: spilloverAssessment.drivers.riskAlignment * 100,
      weight: weights.spillover.riskAlignment ?? 0.1,
      signal: spilloverAssessment.drivers.asiaAlign ? 'ALIGNED' : 'MIXED',
    });
  }

  // Regime (different weight per horizon)
  if (regimeAssessment) {
    factors.push({
      factorName: 'regimeAggregate', factorType: 'regime',
      score: regimeAssessment.regimeScore, weight: weights.horizonWeights.regime,
      signal: regimeAssessment.isBullish ? 'BULLISH' : regimeAssessment.isBearish ? 'BEARISH' : 'NEUTRAL',
      description: `Regime ${regimeAssessment.regime}`,
    });
    factors.push({
      factorName: 'transitionRisk', factorType: 'regime',
      score: -regimeAssessment.transitionRisk * 100,
      weight: weights.regime.transitionRisk ?? 0.25,
      signal: regimeAssessment.transitionRisk > 0.5 ? 'HIGH' : 'LOW',
    });
  }

  // Event (same penalty, but weight changes per horizon)
  if (eventRisk.events.length > 0) {
    for (const ev of eventRisk.events) {
      factors.push({
        factorName: `event_${ev.eventType}`, factorType: 'event',
        score: ev.riskScore, weight: weights.horizonWeights.event / eventRisk.events.length,
        signal: ev.severity, description: ev.description,
      });
    }
  }

  return factors;
}

// ─── Insight Generator (per-horizon) ────────────────────────

function generateHorizonInsight(
  symbol: string,
  hr: HorizonResult,
  spillover: SpilloverAssessment | null,
  regime: RegimeAssessment | null,
  eventRisk: MultiEventRiskResult,
): { topReasons: string[]; allReasons: string[] } {
  const allReasons: string[] = [];

  allReasons.push(`Teknika: ${hr.technicalScore > 0 ? '+' : ''}${hr.technicalScore.toFixed(1)}`);
  if (hr.fundamentalScore !== 0) allReasons.push(`Fundamentet: ${hr.fundamentalScore > 0 ? '+' : ''}${hr.fundamentalScore.toFixed(1)}`);
  if (hr.spilloverScore !== 0) {
    const spLabel = spillover ? spillover.setupType : 'proxy';
    allReasons.push(`Spillover (${spLabel}): ${hr.spilloverScore > 0 ? '+' : ''}${hr.spilloverScore.toFixed(1)}`);
  }
  if (regime && regime.regime !== 'RANGE_NEUTRAL') allReasons.push(`Regjimi: ${regime.regime} (${regime.regimeScore})`);
  if (eventRisk.hasCriticalEvent) allReasons.push(`Rrezik: ${eventRisk.summary}`);
  if (hr.gated) allReasons.push(`GATE: ${hr.gateReason}`);

  // Top 3: prioritize by absolute score contribution
  const contributions = [
    { reason: allReasons[0], impact: Math.abs(hr.technicalScore * hr.weightsUsed.technical) },
    ...(allReasons.slice(1).map((r, i) => ({ reason: r, impact: 40 - i * 8 }))),
  ];
  contributions.sort((a, b) => b.impact - a.impact);
  const topReasons = contributions.slice(0, 3).map(c => c.reason);

  return { topReasons, allReasons };
}

// ─── Core: Compute per-horizon ─────────────────────────────

async function computePerHorizon(
  horizonDays: number,
  techResult: PredictionResult,
  fundamentalResult: FundamentalScore | null,
  spilloverAssessment: SpilloverAssessment | null,
  spilloverProxy: number,
  regimeAssessment: RegimeAssessment | null,
  eventRisk: MultiEventRiskResult,
  useProxy: boolean,
): Promise<HorizonResult> {
  const weights = await getModelWeights(horizonDays);
  const hw = weights.horizonWeights;

  // Normalized scores
  const techNorm = clamp(techResult.score, -100, 100);
  const fundNorm = clamp((fundamentalResult?.score ?? 0) * 3, -100, 100);
  const spillNorm = clamp(useProxy ? spilloverProxy : (spilloverAssessment?.spilloverScore ?? 0), -100, 100);
  const regimeNorm = clamp(regimeAssessment?.regimeScore ?? 0, -100, 100);
  const eventNorm = clamp(eventRisk.compositeRiskScore, -100, 100);

  const rawScore = clamp(Math.round(
    techNorm * hw.technical +
    fundNorm * hw.fundamental +
    spillNorm * hw.spillover +
    regimeNorm * hw.regime +
    eventNorm * hw.event
  ), -100, 100);

  const scores = { technical: techNorm, fundamental: fundNorm, spillover: spillNorm, regime: regimeNorm, event: eventNorm };

  // 5-factor confidence
  const hybridConfidence = computeHybridConfidence(techResult.confidence, scores, regimeAssessment, eventRisk);

  // Proposed direction (before gates)
  const proposedDirection = directionFromScoreAndConfidence(rawScore, hybridConfidence);

  // Hard gates
  const { direction: gatedDirection, gated, gateReason } = applyHardGates(
    proposedDirection, rawScore, spilloverAssessment, regimeAssessment, eventRisk, hybridConfidence,
  );

  // Factors specific to this horizon
  const factors = buildFactorInputs(techResult, fundamentalResult, spilloverAssessment, spilloverProxy, regimeAssessment, eventRisk, weights, useProxy);

  // Reasons specific to this horizon
  const { topReasons, allReasons: decisionReasons } = generateHorizonInsight(
    '', gatedDirection === 'NO_TRADE' ? { ...techResult, score: rawScore } : techResult,
    spilloverAssessment, regimeAssessment, eventRisk,
  );
  if (gated && gateReason) decisionReasons.push(gateReason);

  return {
    horizonDays,
    direction: gatedDirection,
    decision: (gatedDirection === 'STRONG_BUY' || gatedDirection === 'BUY') ? 'BUY'
      : (gatedDirection === 'STRONG_SELL' || gatedDirection === 'SELL') ? 'SELL'
      : gatedDirection === 'HOLD' ? 'HOLD' : 'NO_TRADE',
    rawScore,
    hybridConfidence,
    technicalScore: techNorm,
    fundamentalScore: fundNorm,
    spilloverScore: spillNorm,
    regimeScore: regimeNorm,
    eventScore: eventNorm,
    weightsUsed: { ...hw },
    factors,
    decisionReasons,
    topReasons,
    gated,
    gateReason,
  };
}

// ─── Main: predictHybridV2 ──────────────────────────────────

/**
 * predictHybridV2 — 5-factor anticipatory prediction for ALL 3 horizons.
 * Saves all 3 predictions in a single atomic transaction.
 */
export async function predictHybridV2(
  symbol: string,
  priceData: PricePoint[],
  fundamentals?: YahooFundamentals | null,
  currentPrice?: number,
  options?: {
    horizons?: number[];         // default [1, 5, 20]
    sector?: string;
    saveToDb?: boolean;
    skipSpillover?: boolean;
  },
): Promise<HybridPredictionResultV2> {
  const horizons = options?.horizons ?? [1, 5, 20];
  const sector = options?.sector;
  const shouldSave = options?.saveToDb ?? true;
  const skipSpillover = options?.skipSpillover ?? false;
  const modelVersion = 'predict-v5-5factor';

  const entryPrice = currentPrice && currentPrice > 0
    ? currentPrice : (priceData[priceData.length - 1]?.close ?? 0);

  // ── Shared analysis (done once) ──
  const techResult = predictStock(symbol, priceData);

  let fundamentalResult: FundamentalScore | null = null;
  if (fundamentals && fundamentals.currentPrice > 0) {
    try { fundamentalResult = analyzeFundamentals(symbol, fundamentals); } catch { /* */ }
  }

  let spilloverAssessment: SpilloverAssessment | null = null;
  let crossMarketFeatures: CrossMarketFeatures | null = null;
  if (!skipSpillover) {
    try {
      crossMarketFeatures = await buildCrossMarketFeatures(symbol, sector);
      spilloverAssessment = assessSpillover(crossMarketFeatures, symbol, sector);
    } catch (err: any) {
      console.warn(`[HYBRID-V2] Spillover failed for ${symbol}: ${err.message}`);
    }
  }

  let regimeAssessment: RegimeAssessment | null = null;
  try { regimeAssessment = await getRegimeAssessment(symbol); } catch { /* */ }

  const eventRisk = checkMultiEventRisk(symbol);

  // Spillover proxy (used when skipSpillover=true or when spillover failed)
  const spilloverProxy = computeSpilloverProxy(regimeAssessment);
  const useProxy = skipSpillover || !spilloverAssessment;

  // ── Compute per-horizon ──
  const horizonResults = await Promise.all(
    horizons.map(h => computePerHorizon(h, techResult, fundamentalResult, spilloverAssessment, spilloverProxy, regimeAssessment, eventRisk, useProxy)),
  );

  // Primary = first horizon (usually 1D)
  const primary = horizonResults[0];

  // ── AI insight (Albanian, primary horizon) ──
  const dirAlb = primary.direction === 'STRONG_BUY' ? 'Blerje të fortë'
    : primary.direction === 'BUY' ? 'Blerje'
    : primary.direction === 'SELL' ? 'Shitje'
    : primary.direction === 'STRONG_SELL' ? 'Shitje të fortë'
    : primary.direction === 'NO_TRADE' ? 'Pa tregtuar' : 'Mbaj';
  const aiInsight = `${symbol}: ${dirAlb} (skor=${primary.rawScore > 0 ? '+' : ''}${primary.rawScore.toFixed(1)}, besim=${primary.hybridConfidence.toFixed(0)}%, ${horizons.map(h => `${h}d`).join('/')}). ${primary.topReasons.join('. ')}.`;

  // ── Save all horizons in one transaction ──
  let saved = false;
  const predictionIds: Record<number, string> = {};

  if (shouldSave && entryPrice > 0) {
    try {
      const inputs: SavePredictionInput[] = horizonResults.map(hr => ({
        symbol,
        sector,
        horizonDays: hr.horizonDays,
        modelVersion,
        entryPrice,
        rawScore: hr.rawScore,
        calibratedConfidence: hr.hybridConfidence,
        finalDecision: hr.decision,
        factors: hr.factors,
        regime: regimeAssessment?.regime,
        regimeConfidence: regimeAssessment?.confidence,
        transitionRisk: regimeAssessment?.transitionRisk,
        marketSnapshot: regimeAssessment ? {
          regime: regimeAssessment.regime,
          regimeConfidence: regimeAssessment.confidence,
          spyPrice: regimeAssessment.drivers.spy1d || 0,
          vixLevel: regimeAssessment.drivers.vixLevel,
        } : undefined,
        spilloverSignal: spilloverAssessment ? {
          setupType: spilloverAssessment.setupType,
          spilloverScore: spilloverAssessment.spilloverScore,
          confidence: spilloverAssessment.confidence,
          asiaConsensus: spilloverAssessment.drivers.asiaConsensus,
          riskAlignment: spilloverAssessment.drivers.riskAlignment,
          vixDirection: spilloverAssessment.drivers.vixDirection,
          sectorTrend: spilloverAssessment.drivers.sectorTrend,
          asiaAligned: spilloverAssessment.drivers.asiaAlign,
          targetSymbol: symbol,
          targetSector: sector,
          reasons: spilloverAssessment.reasons,
        } : undefined,
        eventSnapshots: eventRisk.events.length > 0 ? eventRisk.events.map(e => ({
          eventType: e.eventType,
          eventDate: e.daysUntil != null ? new Date(Date.now() + e.daysUntil * 86400000) : undefined,
          daysUntil: e.daysUntil,
          severity: e.severity,
          description: e.description,
        })) : undefined,
        decisionReasons: hr.decisionReasons,
      }));

      const savedMap = await savePredictionsAtomic(inputs);
      saved = true;
      for (const [h, sp] of Object.entries(savedMap)) {
        predictionIds[parseInt(h)] = sp.id;
      }
    } catch (err: any) {
      console.warn(`[HYBRID-V2] DB save failed for ${symbol}: ${err.message}`);
    }
  }

  return {
    symbol,
    entryPrice,
    sector,
    modelVersion,
    horizons: horizonResults,
    direction: primary.direction,
    rawScore: primary.rawScore,
    hybridConfidence: primary.hybridConfidence,
    horizonDays: primary.horizonDays,
    topReasons: primary.topReasons,
    aiInsight,
    spilloverAssessment: spilloverAssessment ?? undefined,
    regimeAssessment: regimeAssessment ?? undefined,
    eventRisk,
    crossMarketFeatures: crossMarketFeatures ?? undefined,
    technicalResult: techResult,
    fundamentalResult,
    saved,
    predictionIds,
  };
}

// ─── Ranking ────────────────────────────────────────────────

export function rankHybridStocksV2(results: HybridPredictionResultV2[]) {
  const sorted = [...results].sort((a, b) => b.rawScore - a.rawScore);
  return {
    topPicks: sorted.filter(r => r.direction === 'BUY' || r.direction === 'STRONG_BUY').slice(0, 20),
    topShorts: [...results].sort((a, b) => a.rawScore - b.rawScore).filter(r => r.direction === 'SELL' || r.direction === 'STRONG_SELL').slice(0, 10),
    mostConfident: [...results].sort((a, b) => b.hybridConfidence - a.hybridConfidence).slice(0, 15),
    allResults: sorted,
  };
}

// ─── Legacy compat ──────────────────────────────────────────

/** @deprecated Use predictHybridV2 */
export function predictHybrid(symbol: string, priceData: PricePoint[], fundamentals?: YahooFundamentals | null, currentPrice?: number, _recordForLearning?: boolean): any {
  console.warn(`[DEPRECATED] predictHybrid() for ${symbol}`);
  const techResult = predictStock(symbol, priceData);
  return { ...techResult, totalScore: techResult.score, hybridConfidence: techResult.confidence };
}
export function rankHybridStocks(results: any[]) { return rankHybridStocksV2(results); }
export function rankByTotalScore(results: any[]) { return [...results].sort((a: any, b: any) => (b.totalScore ?? b.rawScore ?? 0) - (a.totalScore ?? a.rawScore ?? 0)); }
