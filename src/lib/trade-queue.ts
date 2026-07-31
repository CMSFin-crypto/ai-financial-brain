// ============================================================
// Trade Queue — capital efficiency via prioritization.
//
// When there are more good setups than available capital,
// the system must prioritize which trades get funded first.
// This module scores each candidate on multiple dimensions
// and produces an ordered queue with allocation hints.
//
// Priority dimensions:
//   1. Expected value (score x confidence)
//   2. Capital efficiency (EV per unit of risk)
//   3. Correlation bonus (uncorrelated with existing positions)
//   4. Event risk penalty (events reduce priority)
//   5. Time decay (urgency — some setups are time-sensitive)
//   6. Ensemble agreement (disagreement reduces priority)
// ============================================================

import type { EnsembleResult } from './model-ensemble';
import type { TradeRestriction } from './event-risk-engine';

// ─── Types ────────────────────────────────────────────────────

export type TradeCandidate = {
  symbol: string;
  sector?: string;
  score: number;              // raw model score (-100 to 100)
  confidence: number;         // 0 to 1
  ensembleScore?: number;     // from ensemble (-100 to 100)
  disagreementScore?: number; // 0-1 from ensemble
  expectedReturnPct?: number; // estimated return
  stopDistancePct?: number;   // stop loss distance
  atrPct?: number;            // ATR as % of price
  correlationWithPortfolio?: number; // -1 to 1
  eventRestriction?: TradeRestriction | null;
  ensembleResult?: EnsembleResult;
};

export type PrioritizedTrade = TradeCandidate & {
  priorityScore: number;       // 0-100 composite
  rank: number;                // 1 = best
  evPerRisk: number;           // expected value per unit risk
  recommendedSizePct: number;   // % of portfolio to allocate
  shouldSkip: boolean;
  skipReason: string;
  // Per-dimension scores
  dimensionScores: {
    expectedValue: number;      // 0-30
    capitalEfficiency: number;  // 0-20
    correlationBonus: number;   // 0-15
    eventRiskPenalty: number;   // 0 to -20
    agreementBonus: number;     // 0-15
  };
};

export type TradeQueueResult = {
  queue: PrioritizedTrade[];      // sorted by priorityScore desc
  totalCapitalPct: number;        // sum of recommended sizes
  skippedCount: number;
  assessedAt: string;
};

export type TradeQueueConfig = {
  maxPortfolioPct?: number;        // default 60 (max total allocation)
  maxSingleTradePct?: number;      // default 10
  minPriorityScore?: number;       // default 25 (skip below this)
  correlationPenaltyThreshold?: number; // default 0.7 (SPY corr)
  // Dimension weights
  weightExpectedValue?: number;    // default 30
  weightCapitalEfficiency?: number; // default 20
  weightCorrelation?: number;      // default 15
  weightEventRisk?: number;        // default 20
  weightAgreement?: number;        // default 15
};

const DEFAULT_QUEUE_CONFIG: Required<TradeQueueConfig> = {
  maxPortfolioPct: 60,
  maxSingleTradePct: 10,
  minPriorityScore: 25,
  correlationPenaltyThreshold: 0.7,
  weightExpectedValue: 30,
  weightCapitalEfficiency: 20,
  weightCorrelation: 15,
  weightEventRisk: 20,
  weightAgreement: 15,
};

// ─── Core: Prioritize Trades ─────────────────────────────────

/**
 * Compute expected value score (0-30).
 * Higher score × higher confidence = higher EV.
 */
function scoreExpectedValue(candidate: TradeCandidate): number {
  const score = Math.abs(candidate.ensembleScore ?? candidate.score);
  const conf = candidate.confidence;
  
  // EV-like metric: |score| * confidence, normalized to 0-30
  const ev = (score / 100) * conf;
  return Math.min(30, ev * 30);
}

/**
 * Compute capital efficiency score (0-20).
 * EV per unit of risk (stop distance or ATR).
 */
function scoreCapitalEfficiency(candidate: TradeCandidate): number {
  const score = Math.abs(candidate.ensembleScore ?? candidate.score);
  const risk = candidate.stopDistancePct || candidate.atrPct || 2; // default 2%
  
  // EV / risk ratio — higher is better
  const efficiency = (score / 100) / (risk / 100);
  return Math.min(20, efficiency * 10);
}

/**
 * Compute correlation bonus (0-15).
 * Lower correlation with portfolio = higher bonus.
 */
function scoreCorrelation(candidate: TradeCandidate, config: Required<TradeQueueConfig>): number {
  const corr = candidate.correlationWithPortfolio ?? 0.5; // assume moderate if unknown
  
  if (corr <= 0) return 15;         // negatively correlated — best diversification
  if (corr <= 0.3) return 12;
  if (corr <= 0.5) return 8;
  if (corr <= config.correlationPenaltyThreshold) return 4;
  return 0;                          // too correlated — no bonus
}

/**
 * Compute event risk penalty (0 to -20).
 */
function scoreEventRisk(candidate: TradeCandidate): number {
  const restriction = candidate.eventRestriction;
  
  if (!restriction || restriction.level === 'NONE') return 0;
  
  if (restriction.level === 'NO_TRADE') return -20;
  if (restriction.level === 'NO_NEW_ENTRIES') return -15;
  if (restriction.level === 'SIZE_REDUCTION') {
    const reduction = 1 - restriction.sizeMultiplier;
    return -Math.round(reduction * 20);
  }
  return 0;
}

/**
 * Compute ensemble agreement bonus (0-15).
 * Lower disagreement = higher bonus.
 */
function scoreAgreement(candidate: TradeCandidate): number {
  const disagreement = candidate.disagreementScore ?? 0.3;
  
  // disagreement 0 = 15 points, disagreement 1 = 0 points
  return Math.max(0, Math.round((1 - disagreement) * 15));
}

/**
 * Recommend position size based on Kelly-like logic + caps.
 */
function recommendSize(
  candidate: TradeCandidate,
  priorityScore: number,
  config: Required<TradeQueueConfig>,
): number {
  // Base size from score and confidence
  const score = Math.abs(candidate.ensembleScore ?? candidate.score);
  const conf = candidate.confidence;
  const risk = candidate.stopDistancePct || candidate.atrPct || 2;
  
  // Simplified Kelly: edge / odds
  const edge = (score / 100) * conf;
  const odds = risk / 100;
  let kelly = odds > 0 ? edge / odds : 0;
  
  // Scale down for disagreement
  const disagreement = candidate.disagreementScore ?? 0;
  kelly *= (1 - disagreement * 0.5);
  
  // Apply event restriction multiplier
  if (candidate.eventRestriction?.sizeMultiplier) {
    kelly *= candidate.eventRestriction.sizeMultiplier;
  }
  
  // Convert to portfolio percentage (assume 2x leverage target for sizing)
  let sizePct = kelly * 100;
  
  // Scale by priority score (higher priority = slightly larger)
  sizePct *= (0.8 + (priorityScore / 100) * 0.4);
  
  // Cap at max single trade
  sizePct = Math.min(sizePct, config.maxSingleTradePct);
  
  // Floor at 0
  sizePct = Math.max(0, sizePct);
  
  return Math.round(sizePct * 100) / 100;
}

/**
 * Build a prioritized trade queue from candidates.
 */
export function buildTradeQueue(
  candidates: TradeCandidate[],
  config?: TradeQueueConfig,
): TradeQueueResult {
  const cfg = { ...DEFAULT_QUEUE_CONFIG, ...config };
  
  // 1. Score each candidate
  const scored: PrioritizedTrade[] = candidates.map(c => {
    const dimScores = {
      expectedValue: scoreExpectedValue(c),
      capitalEfficiency: scoreCapitalEfficiency(c),
      correlationBonus: scoreCorrelation(c, cfg),
      eventRiskPenalty: scoreEventRisk(c),
      agreementBonus: scoreAgreement(c),
    };
    
    const totalScore = Math.max(0,
      dimScores.expectedValue
      + dimScores.capitalEfficiency
      + dimScores.correlationBonus
      + dimScores.eventRiskPenalty
      + dimScores.agreementBonus
    );
    
    const shouldSkip = totalScore < cfg.minPriorityScore
      || (c.eventRestriction?.level === 'NO_TRADE' || c.eventRestriction?.level === 'NO_NEW_ENTRIES');
    
    const skipReason = c.eventRestriction?.level === 'NO_TRADE'
      ? `Event NO_TRADE: ${c.eventRestriction.affectedEvents.join(', ')}`
      : c.eventRestriction?.level === 'NO_NEW_ENTRIES'
      ? `Event NO_NEW_ENTRIES: ${c.eventRestriction.affectedEvents.join(', ')}`
      : totalScore < cfg.minPriorityScore
      ? `Priority ${totalScore.toFixed(0)} below minimum ${cfg.minPriorityScore}`
      : '';
    
    return {
      ...c,
      priorityScore: Math.round(totalScore * 100) / 100,
      rank: 0, // assigned after sorting
      evPerRisk: dimScores.capitalEfficiency > 0 ? dimScores.capitalEfficiency / 10 : 0,
      recommendedSizePct: 0, // assigned after capital budgeting
      shouldSkip,
      skipReason,
      dimensionScores: dimScores,
    };
  });
  
  // 2. Sort by priority score (descending)
  scored.sort((a, b) => b.priorityScore - a.priorityScore);
  
  // 3. Assign ranks and allocate capital
  let allocatedPct = 0;
  for (const trade of scored) {
    trade.rank = scored.indexOf(trade) + 1;
    
    if (trade.shouldSkip) {
      trade.recommendedSizePct = 0;
      continue;
    }
    
    // Check if capital budget remains
    const remaining = cfg.maxPortfolioPct - allocatedPct;
    if (remaining <= 0) {
      trade.shouldSkip = true;
      trade.skipReason = 'Capital budget exhausted';
      trade.recommendedSizePct = 0;
      continue;
    }
    
    const size = recommendSize(trade, trade.priorityScore, cfg);
    trade.recommendedSizePct = Math.min(size, remaining);
    allocatedPct += trade.recommendedSizePct;
  }
  
  const skippedCount = scored.filter(t => t.shouldSkip).length;
  
  return {
    queue: scored,
    totalCapitalPct: Math.round(allocatedPct * 100) / 100,
    skippedCount,
    assessedAt: new Date().toISOString(),
  };
}

/**
 * Quick filter: get only the trades that should be executed.
 */
export function getExecutableTrades(
  queue: TradeQueueResult,
): PrioritizedTrade[] {
  return queue.queue.filter(t => !t.shouldSkip && t.recommendedSizePct > 0);
}
