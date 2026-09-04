import {
  RankingChangeAction,
  ScannerDecision,
  SignalOutcomeType,
} from "@prisma/client";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type SnapshotInput = {
  ticker: string;
  rank?: number | null;
  totalScore: number;
  confidence?: number | null;
  decision: ScannerDecision;

  price: number;
  priorClose?: number | null;
  dayChangePct?: number | null;
  premarketGapPct?: number | null;

  volume?: number | null;
  averageVolume20D?: number | null;
  relativeVolume?: number | null;
  avgDollarVolume20D?: number | null;
  spreadPct?: number | null;
  liquidityScore?: number | null;

  vwap?: number | null;
  aboveVwap?: boolean | null;
  vwapDistancePct?: number | null;

  ema20?: number | null;
  sma50?: number | null;
  sma200?: number | null;
  atr14?: number | null;
  rsi14?: number | null;
  adx14?: number | null;

  trendScore?: number | null;
  pullbackScore?: number | null;
  catalystScore?: number | null;
  volumeScore?: number | null;
  sectorScore?: number | null;
  marketRegimeScore?: number | null;
  liquidityMapScore?: number | null;
  fadeRiskScore?: number | null;

  closingStrength?: number | null;
  marketRegime?: string | null;
  sector?: string | null;
  sectorStrength?: number | null;

  poc?: number | null;
  nearestBelowHvn?: number | null;
  nearestAboveHvn?: number | null;
  bidWallPrice?: number | null;
  askWallPrice?: number | null;

  newsCatalyst?: string | null;
  catalystPublishedAt?: Date | null;
  secEvent?: string | null;

  reasons?: string[];
  riskFlags?: string[];
  scoreBreakdown?: Record<string, number>;
};

export type PriorSnapshot = SnapshotInput & {
  id: string;
  snapshotAt: Date;
};

export type ScannerChange = {
  action: RankingChangeAction;
  oldRank: number | null;
  newRank: number | null;
  oldScore: number | null;
  newScore: number;
  scoreChange: number | null;
  oldDecision: ScannerDecision | null;
  newDecision: ScannerDecision;
  reasons: string[];
};

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

const hasNumber = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

const round = (value: number, decimals = 2) =>
  Number(value.toFixed(decimals));

// ═══════════════════════════════════════════════════════════════
// DERIVED METRICS
// ═══════════════════════════════════════════════════════════════

export function calculateRelativeVolume(
  currentVolume?: number | null,
  averageVolume20D?: number | null
) {
  if (!hasNumber(currentVolume) || !hasNumber(averageVolume20D) || averageVolume20D <= 0) {
    return null;
  }
  return round(currentVolume / averageVolume20D);
}

export function calculateClosingStrength(
  high?: number | null,
  low?: number | null,
  close?: number | null
) {
  if (!hasNumber(high) || !hasNumber(low) || !hasNumber(close) || high <= low) {
    return null;
  }
  return round((close - low) / (high - low), 4);
}

// ═══════════════════════════════════════════════════════════════
// RANKING CHANGE EXPLAINER
// ═══════════════════════════════════════════════════════════════

export function explainRankingChange(
  previous: PriorSnapshot | null,
  current: SnapshotInput
): ScannerChange {
  const reasons: string[] = [];

  if (!previous) {
    return {
      action: RankingChangeAction.ENTERED_LIST,
      oldRank: null,
      newRank: current.rank ?? null,
      oldScore: null,
      newScore: current.totalScore,
      scoreChange: null,
      oldDecision: null,
      newDecision: current.decision,
      reasons: [
        "Ticker i ri ne scanner",
        ...(current.reasons?.length
          ? current.reasons
          : ["Ka kaluar filtrat e strategjise"]),
      ],
    };
  }

  const scoreChange = current.totalScore - previous.totalScore;
  const oldRank = previous.rank ?? null;
  const newRank = current.rank ?? null;

  if (oldRank === null && newRank !== null) {
    reasons.push("Ticker hyri ne listen e kandidatve");
  }
  if (oldRank !== null && newRank === null) {
    reasons.push("Ticker doli nga lista e kandidatve");
  }
  if (oldRank !== null && newRank !== null && newRank < oldRank) {
    reasons.push(`Rank u permiresua: #${oldRank} -> #${newRank}`);
  }
  if (oldRank !== null && newRank !== null && newRank > oldRank) {
    reasons.push(`Rank ra: #${oldRank} -> #${newRank}`);
  }
  if (scoreChange >= 5) {
    reasons.push(`Score u rrit: ${round(previous.totalScore)} -> ${round(current.totalScore)}`);
  }
  if (scoreChange <= -5) {
    reasons.push(`Score ra: ${round(previous.totalScore)} -> ${round(current.totalScore)}`);
  }

  if (hasNumber(previous.relativeVolume) && hasNumber(current.relativeVolume)) {
    if (current.relativeVolume > previous.relativeVolume * 1.25) {
      reasons.push("Relative volume u rrit");
    }
    if (current.relativeVolume < previous.relativeVolume * 0.65) {
      reasons.push("Relative volume po shuhet");
    }
  }

  if (previous.aboveVwap === false && current.aboveVwap === true) {
    reasons.push("Price kaloi mbi VWAP");
  }
  if (previous.aboveVwap === true && current.aboveVwap === false) {
    reasons.push("Price ra nen VWAP");
  }

  if (
    hasNumber(previous.spreadPct) &&
    hasNumber(current.spreadPct) &&
    current.spreadPct > previous.spreadPct * 1.5
  ) {
    reasons.push("Spread u zgjerua; likuiditeti u dobësua");
  }

  if (current.riskFlags?.includes("EXTENDED_RISK") && !previous.riskFlags?.includes("EXTENDED_RISK")) {
    reasons.push("Stock eshte shume i zgjatur; EXTENDED_RISK");
  }
  if (current.riskFlags?.includes("DILUTION_RISK") && !previous.riskFlags?.includes("DILUTION_RISK")) {
    reasons.push("U zbulua DILUTION_RISK");
  }
  if (current.riskFlags?.includes("VOLUME_COLLAPSE") && !previous.riskFlags?.includes("VOLUME_COLLAPSE")) {
    reasons.push("Volumi ra fort; VOLUME_COLLAPSE");
  }

  if (previous.marketRegime !== current.marketRegime) {
    reasons.push(`Market regime ndryshoi: ${previous.marketRegime ?? "UNKNOWN"} -> ${current.marketRegime ?? "UNKNOWN"}`);
  }
  if (previous.decision !== current.decision) {
    reasons.push(`Status ndryshoi: ${previous.decision} -> ${current.decision}`);
  }

  let action: RankingChangeAction = RankingChangeAction.SCORE_UP;
  if (oldRank === null && newRank !== null) {
    action = RankingChangeAction.ENTERED_LIST;
  } else if (oldRank !== null && newRank === null) {
    action = RankingChangeAction.EXITED_LIST;
  } else if (oldRank !== null && newRank !== null && newRank < oldRank) {
    action = RankingChangeAction.RANK_UP;
  } else if (oldRank !== null && newRank !== null && newRank > oldRank) {
    action = RankingChangeAction.RANK_DOWN;
  } else if (previous.decision !== current.decision) {
    action = RankingChangeAction.STATUS_CHANGED;
  } else if (scoreChange < 0) {
    action = RankingChangeAction.SCORE_DOWN;
  }

  return {
    action,
    oldRank,
    newRank,
    oldScore: previous.totalScore,
    newScore: current.totalScore,
    scoreChange: round(scoreChange),
    oldDecision: previous.decision,
    newDecision: current.decision,
    reasons: reasons.length ? reasons : ["Nuk ka ndryshim material ne faktoret kryesore"],
  };
}

// ═══════════════════════════════════════════════════════════════
// OUTCOME CALCULATOR
// ═══════════════════════════════════════════════════════════════

export type OutcomeInput = {
  entryPrice: number;
  priceAfter1Hour?: number | null;
  closePrice?: number | null;
  nextDayOpenPrice?: number | null;
  nextDayHighPrice?: number | null;
  nextDayClosePrice?: number | null;
  threeDayClosePrice?: number | null;
  maxFavorablePrice?: number | null;
  maxAdversePrice?: number | null;
  heldVwapToClose?: boolean | null;
  heldDayOneLow?: boolean | null;
};

export function calculateOutcome(input: OutcomeInput) {
  const pctReturn = (price?: number | null) => {
    if (!hasNumber(price)) return null;
    return round(((price - input.entryPrice) / input.entryPrice) * 100);
  };

  const return1HourPct = pctReturn(input.priceAfter1Hour);
  const returnToClosePct = pctReturn(input.closePrice);
  const nextDayOpenReturnPct = pctReturn(input.nextDayOpenPrice);
  const nextDayHighReturnPct = pctReturn(input.nextDayHighPrice);
  const nextDayCloseReturnPct = pctReturn(input.nextDayClosePrice);
  const threeDayReturnPct = pctReturn(input.threeDayClosePrice);
  const maxFavorableExcursionPct = pctReturn(input.maxFavorablePrice);
  const maxAdverseExcursionPct = pctReturn(input.maxAdversePrice);

  const hitTarget5Pct = hasNumber(nextDayHighReturnPct) && nextDayHighReturnPct >= 5;
  const hitTarget10Pct = hasNumber(nextDayHighReturnPct) && nextDayHighReturnPct >= 10;

  let outcome: SignalOutcomeType = SignalOutcomeType.PENDING;

  if (input.heldDayOneLow === false || (hasNumber(maxAdverseExcursionPct) && maxAdverseExcursionPct <= -8)) {
    outcome = SignalOutcomeType.STOPPED_OUT;
  } else if (input.heldVwapToClose === false && hasNumber(returnToClosePct) && returnToClosePct < -3) {
    outcome = SignalOutcomeType.FADE;
  } else if (hitTarget5Pct && hasNumber(nextDayCloseReturnPct) && nextDayCloseReturnPct > 0) {
    outcome = SignalOutcomeType.CONTINUATION;
  } else if (hasNumber(returnToClosePct) && returnToClosePct > 0 && input.heldVwapToClose === true) {
    outcome = SignalOutcomeType.PULLBACK_SUCCESS;
  } else if (hasNumber(threeDayReturnPct) && threeDayReturnPct >= -3 && threeDayReturnPct <= 1) {
    outcome = SignalOutcomeType.NO_EDGE;
  }

  return {
    return1HourPct,
    returnToClosePct,
    nextDayOpenReturnPct,
    nextDayHighReturnPct,
    nextDayCloseReturnPct,
    threeDayReturnPct,
    maxFavorableExcursionPct,
    maxAdverseExcursionPct,
    hitTarget5Pct,
    hitTarget10Pct,
    outcome,
  };
}

// ═══════════════════════════════════════════════════════════════
// ADAPTIVE WEIGHT UPDATE
// ═══════════════════════════════════════════════════════════════

export function shouldAllowWeightUpdate(input: {
  sampleSize: number;
  currentWeight: number;
  hitRate: number;
  averageReturnPct: number;
  averageDrawdownPct: number;
}) {
  if (input.sampleSize < 50) {
    return {
      shouldUpdate: false,
      proposedWeight: input.currentWeight,
      reason: "Me pak se 50 raste; weight nuk ndryshohet",
    };
  }

  let adjustment = 0;
  if (input.hitRate >= 0.6 && input.averageReturnPct > 0) {
    adjustment += 0.05;
  }
  if (input.hitRate <= 0.4 || input.averageReturnPct < 0) {
    adjustment -= 0.05;
  }
  if (input.averageDrawdownPct <= -8) {
    adjustment -= 0.03;
  }

  return {
    shouldUpdate: adjustment !== 0,
    proposedWeight: round(Math.max(-1, Math.min(1, input.currentWeight + adjustment)), 4),
    reason:
      adjustment > 0
        ? "Faktori performoi mire; weight rritet pak"
        : adjustment < 0
          ? "Faktori performoi dobet; weight ulet pak"
          : "Nuk ka ndryshim material",
  };
}
