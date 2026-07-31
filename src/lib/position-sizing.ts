// ============================================================
// Position Sizing Engine — Fractional Kelly with conservative caps.
// Never use raw score as position size. This converts probability
// edge into a risk-controlled share count.
//
// Pipeline: full Kelly → quarter Kelly → uncertainty/correlation
// scaling → risk cap → max position cap → recommended shares.
// ============================================================

// ─── Types ────────────────────────────────────────────────────

export type PositionSizingInput = {
  accountEquity: number;            // e.g. 25000
  calibratedProbability: number;     // 0..1 (after calibration layer)
  rewardToRisk: number;              // e.g. 1.8 (expected move / stop distance)
  stopDistancePct: number;           // e.g. 3.0 (% from entry to stop)
  entryPrice: number;                // current price
  maxRiskPerTradePct?: number;       // e.g. 0.5 (max 0.5% of equity risked per trade)
  maxPositionPct?: number;           // e.g. 10 (max 10% of equity in one position)
  conformalUncertainty?: number;     // 0..1 (uncertaintyBand from conformal)
  correlationPenalty?: number;       // 0..1 (portfolio correlation penalty)
  regimeMultiplier?: number;         // 0.1..1.2 (from regime-detection, e.g. BULL=1.0, BEAR=0.3)
};

export type PositionSizingResult = {
  // Kelly internals
  fullKelly: number;                 // raw Kelly fraction
  fractionalKelly: number;           // quarter Kelly (fullKelly * 0.25)
  adjustedKelly: number;             // after uncertainty & correlation scaling
  regimeScale: number;             // regime multiplier applied to Kelly
  // Share calculations by each constraint
  sharesByRisk: number;              // from risk budget
  sharesByKelly: number;              // from Kelly sizing
  sharesByMaxPosition: number;       // from max position cap
  // Final recommendation
  recommendedShares: number;
  recommendedPositionValue: number;
  effectiveRiskDollars: number;
  recommendedRiskPctOfEquity: number; // % of equity at risk
};

// ─── Helpers ───────────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// ─── Core ──────────────────────────────────────────────────────

export function computePositionSize(input: PositionSizingInput): PositionSizingResult {
  const p = clamp(input.calibratedProbability, 0, 1);
  const q = 1 - p;
  const b = Math.max(0.25, input.rewardToRisk); // floor to avoid division issues

  // Full Kelly: f* = (p*b - q) / b
  const fullKelly = (p * b - q) / b;

  // Quarter Kelly — standard conservative fraction
  const fractionalKelly = Math.max(0, fullKelly) * 0.25;

  // Scale down by conformal uncertainty (wider band = more uncertain = smaller size)
  const uncertaintyScale = 1 - clamp(input.conformalUncertainty ?? 0, 0, 0.8);

  // Scale down by portfolio correlation (more correlated = smaller size)
  const correlationScale = 1 - clamp(input.correlationPenalty ?? 0, 0, 0.8);

  const regimeScale = clamp(input.regimeMultiplier ?? 1, 0.1, 1.2);

  const adjustedKelly = fractionalKelly * uncertaintyScale * correlationScale * regimeScale;

  // Caps
  const maxRiskPerTradePct = input.maxRiskPerTradePct ?? 0.5;  // 0.5% default
  const maxPositionPct = input.maxPositionPct ?? 10;           // 10% default

  // 1) Risk-based shares: how many shares can we afford given the risk budget?
  const riskBudgetDollars = input.accountEquity * (maxRiskPerTradePct / 100);
  const riskPerShare = input.entryPrice * (input.stopDistancePct / 100);
  const sharesByRisk = riskPerShare > 0
    ? Math.floor(riskBudgetDollars / riskPerShare)
    : 0;

  // 2) Kelly-based shares: how many shares does Kelly suggest?
  const positionValueByKelly = input.accountEquity * adjustedKelly;
  const sharesByKelly = Math.floor(positionValueByKelly / input.entryPrice);

  // 3) Max position cap
  const maxPositionValue = input.accountEquity * (maxPositionPct / 100);
  const sharesByMaxPosition = Math.floor(maxPositionValue / input.entryPrice);

  // Take the minimum of all three constraints (but at least 0)
  const recommendedShares = Math.max(
    0,
    Math.min(sharesByRisk, sharesByKelly || sharesByRisk, sharesByMaxPosition),
  );

  const recommendedPositionValue = recommendedShares * input.entryPrice;
  const effectiveRiskDollars = recommendedShares * riskPerShare;

  return {
    fullKelly: Math.round(fullKelly * 10000) / 10000,
    fractionalKelly: Math.round(fractionalKelly * 10000) / 10000,
    adjustedKelly: Math.round(adjustedKelly * 10000) / 10000,
    regimeScale: Math.round(regimeScale * 10000) / 10000,
    sharesByRisk,
    sharesByKelly,
    sharesByMaxPosition,
    recommendedShares,
    recommendedPositionValue: Math.round(recommendedPositionValue * 100) / 100,
    effectiveRiskDollars: Math.round(effectiveRiskDollars * 100) / 100,
    recommendedRiskPctOfEquity: input.accountEquity > 0
      ? Math.round((effectiveRiskDollars / input.accountEquity) * 10000) / 100
      : 0,
  };
}

// ─── Quick estimate (for scan, no entry price needed) ──────────
// Returns adjusted Kelly fraction, useful for ranking without full sizing.

export function quickKellyFraction(
  calibratedProbability: number,
  rewardToRisk: number = 1.8,
  conformalUncertainty: number = 0,
): number {
  const p = clamp(calibratedProbability, 0, 1);
  const q = 1 - p;
  const b = Math.max(0.25, rewardToRisk);
  const fullKelly = (p * b - q) / b;
  const fractional = Math.max(0, fullKelly) * 0.25;
  const uncertaintyScale = 1 - clamp(conformalUncertainty, 0, 0.8);
  return Math.round(fractional * uncertaintyScale * 10000) / 10000;
}
