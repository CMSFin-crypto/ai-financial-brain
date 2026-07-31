// ============================================================
// Scenario Planner — pre-trade what-if analysis.
//
// Before entering a trade, the system generates:
//   - Base case (expected outcome)
//   - Bull case (optimistic scenario)
//   - Bear case (pessimistic scenario)
//   - Invalidation level (where the thesis breaks)
//   - Key assumptions (what must be true)
//   - What changes the thesis (sensitivity points)
//
// This bridges prediction engine and manual override by
// giving the human operator a structured decision framework.
// ============================================================

import type { EnsembleResult } from './model-ensemble';

// ─── Types ────────────────────────────────────────────────────

export type PriceLevel = {
  price: number;
  changePct: number;
  label: string;
  rationale: string;
};

export type ScenarioAssumption = {
  name: string;
  currentValue: string;
  requiredFor: 'BULL' | 'BASE' | 'BEAR';
  sensitivity: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
};

export type ThesisChanger = {
  trigger: string;
  impact: 'THESIS_INVALIDATED' | 'REDUCE_SIZE' | 'UPGRADE';
  description: string;
};

export type ScenarioPlan = {
  symbol: string;
  currentPrice: number;
  direction: 'LONG' | 'SHORT';
  // Scenarios
  baseCase: {
    targetPrice: number;
    targetReturnPct: number;
    stopPrice: number;
    stopLossPct: number;
    riskReward: number;
    timeHorizon: string;
    description: string;
  };
  bullCase: {
    targetPrice: number;
    targetReturnPct: number;
    probability: number;
    drivers: string[];
  };
  bearCase: {
    targetPrice: number;
    targetReturnPct: number;
    probability: number;
    drivers: string[];
  };
  // Invalidation
  invalidationLevel: PriceLevel;
  keySupportLevels: PriceLevel[];
  keyResistanceLevels: PriceLevel[];
  // Assumptions
  assumptions: ScenarioAssumption[];
  thesisChangers: ThesisChanger[];
  // Ensemble context
  ensembleScore: number;
  ensembleConfidence: number;
  disagreementScore: number;
  // Recommendation
  recommendation: string;
  assessedAt: string;
};

export type ScenarioConfig = {
  baseReturnTarget?: number;      // default 3% (base case target)
  bullReturnTarget?: number;      // default 8%
  bearReturnTarget?: number;      // default -4%
  stopDistance?: number;          // default -2.5%
  minRiskReward?: number;         // default 1.2
};

const DEFAULT_SCENARIO_CONFIG: Required<ScenarioConfig> = {
  baseReturnTarget: 3,
  bullReturnTarget: 8,
  bearReturnTarget: -4,
  stopDistance: -2.5,
  minRiskReward: 1.2,
};

// ─── Helpers ──────────────────────────────────────────────────

function pctChange(price: number, base: number): number {
  return Math.round(((price - base) / base) * 10000) / 100;
}

function applyPct(base: number, pct: number): number {
  return Math.round(base * (1 + pct / 100) * 100) / 100;
}

// ─── Core: Generate Scenario Plan ─────────────────────────────

/**
 * Generate a scenario plan for a symbol given ensemble results.
 */
export function generateScenarioPlan(
  symbol: string,
  currentPrice: number,
  ensemble: EnsembleResult | null,
  technicalContext?: {
    rsi?: number;
    atrPct?: number;
    supportLevel?: number;
    resistanceLevel?: number;
    sma20?: number;
    sma50?: number;
    sma200?: number;
    sector?: string;
    volumeTrend?: 'RISING' | 'FALLING' | 'FLAT';
  },
  config?: ScenarioConfig,
): ScenarioPlan {
  const cfg = { ...DEFAULT_SCENARIO_CONFIG, ...config };
  const score = ensemble?.ensembleScore ?? 0;
  const conf = ensemble?.ensembleConfidence ?? 0.5;
  const disagreement = ensemble?.disagreementScore ?? 0.3;
  
  const direction = score > 10 ? 'LONG' : score < -10 ? 'SHORT' : 'LONG';
  const isBullish = direction === 'LONG';
  
  // Scale targets by confidence and score magnitude
  const scoreFactor = Math.min(1.5, Math.abs(score) / 60);
  const confFactor = 0.5 + conf * 0.5; // 0.5 to 1.0
  
  // Base case
  const baseReturn = cfg.baseReturnTarget * scoreFactor * confFactor * (isBullish ? 1 : -1);
  const baseTarget = applyPct(currentPrice, baseReturn);
  const stopPrice = applyPct(currentPrice, isBullish ? cfg.stopDistance : -cfg.stopDistance);
  const riskReward = Math.abs(baseReturn / cfg.stopDistance);
  
  // Bull case
  const bullReturn = cfg.bullReturnTarget * scoreFactor * confFactor;
  const bullTarget = applyPct(currentPrice, isBullish ? bullReturn : -bullReturn);
  const bullProb = Math.min(0.35, conf * 0.4 * scoreFactor);
  
  // Bear case
  const bearReturn = cfg.bearReturnTarget * scoreFactor;
  const bearTarget = applyPct(currentPrice, isBullish ? bearReturn : -bearReturn);
  const bearProb = Math.min(0.30, (1 - conf) * 0.4);
  
  // Invalidation level: below support or above resistance
  const support = technicalContext?.supportLevel || applyPct(currentPrice, isBullish ? -4 : 4);
  const invalidationPrice = isBullish
    ? Math.min(support, stopPrice)
    : Math.max(support, stopPrice);
  
  // Key levels
  const keySupports: PriceLevel[] = [];
  const keyResistances: PriceLevel[] = [];
  
  if (technicalContext?.supportLevel) {
    keySupports.push({
      price: technicalContext.supportLevel,
      changePct: pctChange(technicalContext.supportLevel, currentPrice),
      label: 'Technical Support',
      rationale: 'Established support level from price action',
    });
  }
  if (technicalContext?.sma20) {
    const lvl: PriceLevel = {
      price: technicalContext.sma20,
      changePct: pctChange(technicalContext.sma20, currentPrice),
      label: 'SMA 20',
      rationale: isBullish ? 'Short-term trend support' : 'Short-term trend resistance',
    };
    if (technicalContext.sma20 < currentPrice) keySupports.push(lvl);
    else keyResistances.push(lvl);
  }
  if (technicalContext?.sma50) {
    const lvl: PriceLevel = {
      price: technicalContext.sma50,
      changePct: pctChange(technicalContext.sma50, currentPrice),
      label: 'SMA 50',
      rationale: 'Medium-term trend level',
    };
    if (technicalContext.sma50 < currentPrice) keySupports.push(lvl);
    else keyResistances.push(lvl);
  }
  if (technicalContext?.sma200) {
    const lvl: PriceLevel = {
      price: technicalContext.sma200,
      changePct: pctChange(technicalContext.sma200, currentPrice),
      label: 'SMA 200',
      rationale: 'Long-term trend level — major support/resistance',
    };
    if (technicalContext.sma200 < currentPrice) keySupports.push(lvl);
    else keyResistances.push(lvl);
  }
  if (technicalContext?.resistanceLevel) {
    keyResistances.push({
      price: technicalContext.resistanceLevel,
      changePct: pctChange(technicalContext.resistanceLevel, currentPrice),
      label: 'Technical Resistance',
      rationale: 'Established resistance level from price action',
    });
  }
  
  // Sort levels
  keySupports.sort((a, b) => a.price - b.price);
  keyResistances.sort((a, b) => b.price - a.price);
  
  // Assumptions
  const assumptions: ScenarioAssumption[] = [];
  
  assumptions.push({
    name: 'Regime Stability',
    currentValue: ensemble?.models?.find(m => m.modelName === 'regime_sensitive')?.direction || 'UNKNOWN',
    requiredFor: isBullish ? 'BULL' : 'BEAR',
    sensitivity: 'HIGH',
    description: `${symbol} requires ${isBullish ? 'stable bull or ranging' : 'stable bear or ranging'} market regime for the thesis to hold`,
  });
  
  if (technicalContext?.rsi) {
    assumptions.push({
      name: 'Momentum (RSI)',
      currentValue: `RSI ${technicalContext.rsi.toFixed(0)}`,
      requiredFor: 'BASE',
      sensitivity: technicalContext.rsi > 70 || technicalContext.rsi < 30 ? 'HIGH' : 'MEDIUM',
      description: technicalContext.rsi > 70
        ? 'RSI overbought — momentum may not sustain'
        : technicalContext.rsi < 30
        ? 'RSI oversold — potential bounce thesis'
        : 'RSI in neutral zone — momentum supports the thesis',
    });
  }
  
  assumptions.push({
    name: 'Ensemble Agreement',
    currentValue: `Disagreement ${(disagreement * 100).toFixed(0)}%`,
    requiredFor: 'BASE',
    sensitivity: disagreement > 0.4 ? 'HIGH' : 'MEDIUM',
    description: disagreement > 0.4
      ? `Models disagree significantly (${(disagreement * 100).toFixed(0)}%) — reduces confidence in all scenarios`
      : 'Models generally agree — scenarios more reliable',
  });
  
  if (technicalContext?.volumeTrend) {
    assumptions.push({
      name: 'Volume Confirmation',
      currentValue: technicalContext.volumeTrend,
      requiredFor: 'BULL',
      sensitivity: 'MEDIUM',
      description: technicalContext.volumeTrend === 'RISING'
        ? 'Volume supports the price move'
        : 'Volume does not confirm — watch for divergence',
    });
  }
  
  // Thesis changers
  const thesisChangers: ThesisChanger[] = [];
  
  thesisChangers.push({
    trigger: `Price breaks below ${invalidationPrice.toFixed(2)}`,
    impact: 'THESIS_INVALIDATED',
    description: 'The primary thesis is invalidated — close position or reverse',
  });
  
  thesisChangers.push({
    trigger: 'Major macro event (FOMC, CPI) with adverse surprise',
    impact: 'REDUCE_SIZE',
    description: 'Reduce position size by 50% until event passes and direction is confirmed',
  });
  
  thesisChangers.push({
    trigger: 'Earnings report announced with date within 5 trading days',
    impact: 'REDUCE_SIZE',
    description: 'Earnings uncertainty — reduce or exit before the event',
  });
  
  thesisChangers.push({
    trigger: 'Regime changes to PANIC_CAPITULATION',
    impact: 'THESIS_INVALIDATED',
    description: 'Systemic risk event — all directional theses are unreliable',
  });
  
  if (ensemble?.eventRestriction?.level && ensemble.eventRestriction.level !== 'NONE') {
    thesisChangers.push({
      trigger: `Event restriction active: ${ensemble.eventRestriction.reason}`,
      impact: 'REDUCE_SIZE',
      description: `Position size multiplied by ${ensemble.eventRestriction.sizeMultiplier}`,
    });
  }
  
  if (disagreement > 0.5) {
    thesisChangers.push({
      trigger: 'Disagreement score increases above 70%',
      impact: 'REDUCE_SIZE',
      description: 'Models increasingly disagree — thesis losing support',
    });
  }
  
  // Recommendation
  let recommendation: string;
  if (riskReward < cfg.minRiskReward) {
    recommendation = `R/R ${riskReward.toFixed(1)} below ${cfg.minRiskReward} — consider skipping`;
  } else if (disagreement > 0.5) {
    recommendation = `High disagreement — reduce size or wait for consensus`;
  } else if (conf < 0.4) {
    recommendation = `Low confidence (${(conf * 100).toFixed(0)}%) — small position only`;
  } else if (ensemble?.actionModifier === 'SKIP') {
    recommendation = `Ensemble says SKIP: ${ensemble.actionReason}`;
  } else {
    recommendation = `Favorable setup with ${riskReward.toFixed(1)} R/R — proceed with standard sizing`;
  }
  
  return {
    symbol,
    currentPrice,
    direction,
    baseCase: {
      targetPrice: baseTarget,
      targetReturnPct: Math.round(baseReturn * 100) / 100,
      stopPrice,
      stopLossPct: cfg.stopDistance,
      riskReward: Math.round(riskReward * 100) / 100,
      timeHorizon: '1-5 trading days',
      description: isBullish
        ? `Expected move to ${baseTarget.toFixed(2)} based on current momentum and ${technicalContext?.sector || ''} sector conditions`
        : `Expected decline to ${baseTarget.toFixed(2)} based on weakness and risk factors`,
    },
    bullCase: {
      targetPrice: bullTarget,
      targetReturnPct: Math.round(bullReturn * 100) / 100,
      probability: Math.round(bullProb * 1000) / 1000,
      drivers: isBullish
        ? [
            'Strong technical momentum continues',
            'Sector tailwind and market breadth supportive',
            'Positive surprise from fundamentals or news',
            'Low event risk in the near term',
          ]
        : [
            'Bearish thesis accelerates beyond expectations',
            'Sector weakness broadens',
            'Negative catalyst (downgrade, guidance cut)',
          ],
    },
    bearCase: {
      targetPrice: bearTarget,
      targetReturnPct: Math.round(bearReturn * 100) / 100,
      probability: Math.round(bearProb * 1000) / 1000,
      drivers: isBullish
        ? [
            'Momentum reverses at resistance level',
            'Broad market sell-off drags stock down',
            'Negative macro surprise (CPI, Fed)',
            'Sector rotation away from current theme',
          ]
        : [
            'Unexpected bounce / short squeeze',
            'Market-wide rally on positive catalyst',
            'Support level holds with strong volume',
          ],
    },
    invalidationLevel: {
      price: invalidationPrice,
      changePct: pctChange(invalidationPrice, currentPrice),
      label: 'Thesis Invalidation',
      rationale: 'Below this level, the directional thesis no longer holds',
    },
    keySupportLevels: keySupports,
    keyResistanceLevels: keyResistances,
    assumptions,
    thesisChangers,
    ensembleScore: score,
    ensembleConfidence: conf,
    disagreementScore: disagreement,
    recommendation,
    assessedAt: new Date().toISOString(),
  };
}

/**
 * Batch generate scenario plans for multiple symbols.
 */
export function batchScenarioPlans(
  items: Array<{
    symbol: string;
    currentPrice: number;
    ensemble?: EnsembleResult | null;
    technicalContext?: ScenarioPlan['assumptions'] extends never ? never : Parameters<typeof generateScenarioPlan>[2];
  }>,
  config?: ScenarioConfig,
): ScenarioPlan[] {
  return items.map(item =>
    generateScenarioPlan(
      item.symbol,
      item.currentPrice,
      item.ensemble || null,
      item.technicalContext as any,
      config,
    )
  );
}
