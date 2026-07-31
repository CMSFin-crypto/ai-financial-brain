// ============================================================
// NO_TRADE Gate
// Blocks signals when edge is insufficient or risk too high
// Capital preservation first
// ============================================================

import type { MarketRegimeResult } from './market-regime';
import type { EventRiskResult } from './event-risk';
import type { SpilloverAnalysis } from './global-spillover';
import type { RegimePolicy } from './regime-policy';

export interface NoTradeGateInput {
  confidence: number;
  combinedScore: number;
  expectedMovePct: number;
  signal: string;
  regime: MarketRegimeResult;
  eventRisk: EventRiskResult;
  spillover?: SpilloverAnalysis;
  regimePolicy?: RegimePolicy;
}

export interface NoTradeGateResult {
  status: 'TRADE' | 'NO_TRADE';
  reason?: string;
}

const MIN_CONFIDENCE = 40;
const MIN_EDGE_PCT = 0.5;
const MIN_SCORE_THRESHOLD = 20;

export function runNoTradeGate(input: NoTradeGateInput): NoTradeGateResult {
  const { confidence, combinedScore, expectedMovePct, signal, regime, eventRisk, spillover, regimePolicy } = input;

  // 0. REGIME AWARE OVERRIDES — policy takes precedence
  if (regimePolicy) {
    // PANIC_CAPITULATION: block everything
    if (regimePolicy.noTradeBias && !regimePolicy.allowLongs && !regimePolicy.allowShorts) {
      return {
        status: 'NO_TRADE',
        reason: `PANIC_CAPITULATION — asnjë trade i lejuar (maxPositionSize=0)`,
      };
    }
    // Confidence below regime floor
    if (confidence < regimePolicy.confidenceFloor) {
      return {
        status: 'NO_TRADE',
        reason: `Konfidencë ${confidence.toFixed(0)}% nën regime floor ${regimePolicy.confidenceFloor}%`,
      };
    }
  }

  // 1. Confidence too low
  if (confidence < MIN_CONFIDENCE) {
    return {
      status: 'NO_TRADE',
      reason: `Confidence ${confidence.toFixed(0)}% është nën ${MIN_CONFIDENCE}% — sinjal jo i besueshëm`,
    };
  }

  // 2. Volatile regime + insufficient confidence
  if (regime.regime === 'VOLATILE' && confidence < 55) {
    return {
      status: 'NO_TRADE',
      reason: 'Treg shumë i ndryshueshëm — sinjale jo të besueshme në këtë mjedis',
    };
  }

  // 3. Critical event risk
  if (eventRisk.severity === 'CRITICAL') {
    return {
      status: 'NO_TRADE',
      reason: `Ngjarje me rrezik kritik: ${eventRisk.description}`,
    };
  }

  // 4. Edge too small after costs
  // Typical costs: 0.1% commission + 0.05% slippage + 0.05% spread = 0.2% round-trip
  const ROUND_TRIP_COST_PCT = 0.2;
  const netEdge = Math.abs(expectedMovePct) - ROUND_TRIP_COST_PCT;
  if (netEdge < MIN_EDGE_PCT) {
    return {
      status: 'NO_TRADE',
      reason: `Edge neto ${netEdge.toFixed(2)}% është nën ${MIN_EDGE_PCT}% pas kostove (${ROUND_TRIP_COST_PCT}%)`,
    };
  }

  // 5. Counter-regime trade with low confidence
  const isBuy = signal === 'BUY' || signal === 'STRONG_BUY';
  if (regime.regime === 'BEAR' && isBuy && confidence < 65) {
    return {
      status: 'NO_TRADE',
      reason: 'Blerje kundër prirjes së tregut ari — nevojitet konfidencë më e lartë (>65%)',
    };
  }
  if (regime.regime === 'BULL' && !isBuy && confidence < 65) {
    return {
      status: 'NO_TRADE',
      reason: 'Shitje kundër prirjes së tregut bull — nevojitet konfidencë më e lartë (>65%)',
    };
  }

  // 6. Score too neutral
  if (Math.abs(combinedScore) < MIN_SCORE_THRESHOLD) {
    return {
      status: 'NO_TRADE',
      reason: `Score ${combinedScore.toFixed(1)} është shumë neutral — asnjë avantazh i qartë`,
    };
  }

  // 7. Spillover-based gates (for semis and tech)
  if (spillover) {
    // NEUTRAL spillover + low confidence → no trade
    if (spillover.setupType === 'NEUTRAL' && spillover.confidence < 0.5 && Math.abs(combinedScore) < 35) {
      return {
        status: 'NO_TRADE',
        reason: `Spillover i paqartë (NEUTRAL, conf=${(spillover.confidence * 100).toFixed(0)}%) — sinjali global nuk konfirmon drejtimin`,
      };
    }
    // CONTINUATION spillover but signal is BUY → counter-spillover
    if (spillover.setupType === 'CONTINUATION' && (signal === 'BUY' || signal === 'STRONG_BUY')) {
      return {
        status: 'NO_TRADE',
        reason: `Spillover CONTINUATION (score=${spillover.spilloverScore}) bllokon BLERJEN — rënia globale po vazhdon`,
      };
    }
    // CAPITULATION spillover → extremely risky, require high confidence
    if (spillover.setupType === 'CAPITULATION' && confidence < 70) {
      return {
        status: 'NO_TRADE',
        reason: `Spillover CAPITULATION — vetëm me konfidencë >70% lejohet trade`,
      };
    }
  }

  return { status: 'TRADE' };
}
