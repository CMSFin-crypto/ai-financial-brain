// ============================================================
// Override Journal
//
// Logs every human override and measures whether intervention
// helped or hurt results.
//
// Tracks:
//   - Accepted, rejected, modified decisions
//   - Override reason tracking
//   - Model vs human hit rate
//   - Outcome attribution after evaluation
//
// Uses existing ManualDecisionOverride model.
// ============================================================

import prisma from './prisma';

// ─── Types ──────────────────────────────────────────────────

export interface OverrideEntry {
  id: string;
  symbol: string;
  originalDecision: string;
  overrideDecision: string;
  overrideReason: string;
  notes: string | null;
  modelScore: number | null;
  modelConfidence: number | null;
  regime: string | null;
  outcome: string | null;
  actualReturn: number | null;
  createdAt: string;
}

export interface OverrideSummary {
  totalOverrides: number;
  accepted: number;
  rejected: number;
  modified: number;
  pending: number;
  evaluated: number;
}

export interface OverrideHitRate {
  modelHitRate: number;        // % of original model decisions that were correct
  humanHitRate: number;        // % of overridden decisions where human was right
  delta: number;               // humanHitRate - modelHitRate
  sampleModel: number;
  sampleHuman: number;
  interpretation: string;
}

export interface OverrideReasonBreakdown {
  reason: string;
  count: number;
  pct: number;
  correctOverrides: number;
  wrongOverrides: number;
  hitRate: number | null;
  pending: number;
}

export interface OverrideRegimeBreakdown {
  regime: string;
  count: number;
  humanHitRate: number | null;
  modelWouldHaveBeenRight: number; // times model was right but human overrode
}

export interface OverrideJournalResult {
  computedAt: string;
  summary: OverrideSummary;
  hitRate: OverrideHitRate;
  reasons: OverrideReasonBreakdown[];
  regimeBreakdown: OverrideRegimeBreakdown[];
  recentOverrides: OverrideEntry[];
}

// ─── Reason labels for display ──────────────────────────────

const REASON_LABELS: Record<string, string> = {
  news_risk: 'Lajme / Rrezik Lajmesh',
  liquidity: 'Likuiditeti i Ulët',
  earnings_near: 'Fitime pranë',
  disagree_with_signal: 'Pajtim me Sinjalin',
  execution_risk: 'Rreziku i Ekzekutimit',
  other: 'Tjetër',
};

// ─── Main: Compute Full Override Journal ────────────────────

export async function computeOverrideJournal(limit: number = 50): Promise<OverrideJournalResult> {
  const computedAt = new Date().toISOString();

  // 1. Summary
  const all = await prisma.manualDecisionOverride.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const summary: OverrideSummary = {
    totalOverrides: all.length,
    accepted: all.filter(o => o.overrideDecision === 'ACCEPTED').length,
    rejected: all.filter(o => o.overrideDecision === 'REJECTED').length,
    modified: all.filter(o => o.overrideDecision === 'MODIFIED').length,
    pending: all.filter(o => o.outcome === 'PENDING' || !o.outcome).length,
    evaluated: all.filter(o => o.outcome && o.outcome !== 'PENDING').length,
  };

  // 2. Hit rate comparison (model vs human)
  const hitRate = await computeOverrideHitRate(all);

  // 3. Reason breakdown
  const reasons = await computeReasonBreakdown(all);

  // 4. Regime breakdown
  const regimeBreakdown = await computeRegimeBreakdown(all);

  // 5. Recent overrides
  const recentOverrides: OverrideEntry[] = all.slice(0, limit).map(o => ({
    id: o.id,
    symbol: o.symbol,
    originalDecision: o.originalDecision,
    overrideDecision: o.overrideDecision,
    overrideReason: REASON_LABELS[o.overrideReason] ?? o.overrideReason,
    notes: o.notes,
    modelScore: o.modelScore,
    modelConfidence: o.modelConfidence,
    regime: o.regime,
    outcome: o.outcome,
    actualReturn: o.actualReturn,
    createdAt: o.createdAt.toISOString(),
  }));

  return { computedAt, summary, hitRate, reasons, regimeBreakdown, recentOverrides };
}

// ─── Model vs Human hit rate ────────────────────────────────

async function computeOverrideHitRate(overrides: any[]): Promise<OverrideHitRate> {
  const evaluated = overrides.filter(o => o.outcome && o.outcome !== 'PENDING');

  // For each override, we need the linked prediction to know if the model was right
  // If no predictionId, we can only check human outcome
  const withPrediction = evaluated.filter(o => o.predictionId);
  const withoutPrediction = evaluated.filter(o => !o.predictionId);

  // Human hit rate: how often was the override correct?
  const humanCorrect = evaluated.filter(o => o.outcome === 'CORRECT_OVERRIDE').length;
  const humanWrong = evaluated.filter(o => o.outcome === 'WRONG_OVERRIDE').length;
  const humanHitRate = (humanCorrect + humanWrong) > 0
    ? Math.round((humanCorrect / (humanCorrect + humanWrong)) * 1000) / 10
    : 0;

  // Model hit rate: from linked predictions, how often was the original model decision correct?
  let modelHitRate = 0;
  let sampleModel = 0;

  if (withPrediction.length > 0) {
    const predictionIds = withPrediction.map(o => o.predictionId);
    const predictions = await prisma.prediction.findMany({
      where: { id: { in: predictionIds } },
      select: { id: true, wasCorrect: true },
    });

    const predMap = new Map(predictions.map(p => [p.id, p.wasCorrect]));
    let modelCorrect = 0;
    for (const o of withPrediction) {
      const wasCorrect = predMap.get(o.predictionId);
      if (wasCorrect !== undefined && wasCorrect !== null) {
        sampleModel++;
        if (wasCorrect === true) modelCorrect++;
      }
    }
    modelHitRate = sampleModel > 0 ? Math.round((modelCorrect / sampleModel) * 1000) / 10 : 0;
  }

  const delta = Math.round((humanHitRate - modelHitRate) * 10) / 10;

  let interpretation: string;
  if (evaluated.length < 10) {
    interpretation = `Need ≥10 evaluated overrides for reliable comparison (have ${evaluated.length})`;
  } else if (delta > 5) {
    interpretation = 'Human overrides are adding significant value (+{delta}% vs model alone)';
  } else if (delta > 0) {
    interpretation = 'Human overrides are marginally helpful (+{delta}%)';
  } else if (delta > -3) {
    interpretation = 'Human overrides are roughly break-even ({delta}%)';
  } else {
    interpretation = 'Human overrides are hurting performance ({delta}% vs model alone). Consider reducing intervention.';
  }
  interpretation = interpretation.replace('{delta}', `${delta > 0 ? '+' : ''}${delta}%`);

  return {
    modelHitRate,
    humanHitRate,
    delta,
    sampleModel,
    sampleHuman: humanCorrect + humanWrong,
    interpretation,
  };
}

// ─── Reason breakdown ───────────────────────────────────────

async function computeReasonBreakdown(overrides: any[]): Promise<OverrideReasonBreakdown[]> {
  const groups: Record<string, { total: number; correct: number; wrong: number; pending: number }> = {};

  for (const o of overrides) {
    const reason = o.overrideReason || 'other';
    if (!groups[reason]) groups[reason] = { total: 0, correct: 0, wrong: 0, pending: 0 };
    groups[reason].total++;
    if (o.outcome === 'CORRECT_OVERRIDE') groups[reason].correct++;
    else if (o.outcome === 'WRONG_OVERRIDE') groups[reason].wrong++;
    else groups[reason].pending++;
  }

  const total = overrides.length;
  return Object.entries(groups)
    .map(([reason, g]) => ({
      reason: REASON_LABELS[reason] ?? reason,
      count: g.total,
      pct: total > 0 ? Math.round((g.total / total) * 1000) / 10 : 0,
      correctOverrides: g.correct,
      wrongOverrides: g.wrong,
      hitRate: (g.correct + g.wrong) > 0
        ? Math.round((g.correct / (g.correct + g.wrong)) * 1000) / 10
        : null,
      pending: g.pending,
    }))
    .sort((a, b) => b.count - a.count);
}

// ─── Regime breakdown ───────────────────────────────────────

async function computeRegimeBreakdown(overrides: any[]): Promise<OverrideRegimeBreakdown[]> {
  const groups: Record<string, { total: number; correct: number; modelRight: number }> = {};

  for (const o of overrides) {
    const regime = o.regime || 'UNKNOWN';
    if (!groups[regime]) groups[regime] = { total: 0, correct: 0, modelRight: 0 };
    groups[regime].total++;
    if (o.outcome === 'CORRECT_OVERRIDE') groups[regime].correct++;
  }

  // For modelRight, check linked predictions
  const withPred = overrides.filter(o => o.predictionId && o.regime);
  if (withPred.length > 0) {
    const predIds = withPred.map(o => o.predictionId);
    const preds = await prisma.prediction.findMany({
      where: { id: { in: predIds } },
      select: { id: true, wasCorrect: true },
    });
    const predMap = new Map(preds.map(p => [p.id, p.wasCorrect]));

    for (const o of withPred) {
      const regime = o.regime || 'UNKNOWN';
      const wasCorrect = predMap.get(o.predictionId);
      if (wasCorrect === true && groups[regime]) {
        groups[regime].modelRight++;
      }
    }
  }

  return Object.entries(groups)
    .filter(([, g]) => g.total >= 1)
    .map(([regime, g]) => ({
      regime,
      count: g.total,
      humanHitRate: g.total > 0
        ? Math.round((g.correct / g.total) * 1000) / 10
        : null,
      modelWouldHaveBeenRight: g.modelRight,
    }))
    .sort((a, b) => b.count - a.count);
}

// ─── Record an override ─────────────────────────────────────

export async function recordOverride(data: {
  predictionId?: string;
  symbol: string;
  originalDecision: string;
  overrideDecision: 'ACCEPTED' | 'REJECTED' | 'MODIFIED';
  overrideReason: string;
  notes?: string;
  modelScore?: number;
  modelConfidence?: number;
  regime?: string;
}): Promise<string> {
  const override = await prisma.manualDecisionOverride.create({
    data: {
      predictionId: data.predictionId,
      symbol: data.symbol,
      originalDecision: data.originalDecision,
      overrideDecision: data.overrideDecision,
      overrideReason: data.overrideReason,
      notes: data.notes,
      modelScore: data.modelScore,
      modelConfidence: data.modelConfidence,
      regime: data.regime,
    },
  });

  console.log(`[OVERRIDE] Recorded: ${data.symbol} ${data.originalDecision}→${data.overrideDecision} (${data.overrideReason})`);
  return override.id;
}

// ─── Evaluate an override outcome ───────────────────────────

export async function evaluateOverride(
  overrideId: string,
  actualReturn: number,
): Promise<void> {
  const override = await prisma.manualDecisionOverride.findUnique({
    where: { id: overrideId },
  });
  if (!override) return;

  // Determine if the override was correct
  let outcome: 'CORRECT_OVERRIDE' | 'WRONG_OVERRIDE';
  if (override.overrideDecision === 'REJECTED') {
    // Human rejected the model's signal. If model would have been wrong, human was right.
    // Check the linked prediction
    if (override.predictionId) {
      const pred = await prisma.prediction.findUnique({
        where: { id: override.predictionId },
        select: { wasCorrect: true },
      });
      outcome = pred?.wasCorrect === false ? 'CORRECT_OVERRIDE' : 'WRONG_OVERRIDE';
    } else {
      // No prediction to check — use actualReturn heuristic
      // If original was BUY and actualReturn < 0, rejecting was correct
      const wasBullish = override.originalDecision === 'BUY';
      outcome = wasBullish ? (actualReturn < 0 ? 'CORRECT_OVERRIDE' : 'WRONG_OVERRIDE')
                           : (actualReturn > 0 ? 'CORRECT_OVERRIDE' : 'WRONG_OVERRIDE');
    }
  } else if (override.overrideDecision === 'ACCEPTED') {
    // Human accepted the model's signal. If model was right, accepting was correct.
    if (override.predictionId) {
      const pred = await prisma.prediction.findUnique({
        where: { id: override.predictionId },
        select: { wasCorrect: true },
      });
      outcome = pred?.wasCorrect === true ? 'CORRECT_OVERRIDE' : 'WRONG_OVERRIDE';
    } else {
      const wasBullish = override.originalDecision === 'BUY';
      outcome = wasBullish ? (actualReturn > 0 ? 'CORRECT_OVERRIDE' : 'WRONG_OVERRIDE')
                           : (actualReturn < 0 ? 'CORRECT_OVERRIDE' : 'WRONG_OVERRIDE');
    }
  } else {
    // MODIFIED — harder to judge, use direction alignment
    const wasBullish = override.originalDecision === 'BUY';
    outcome = wasBullish ? (actualReturn > 0 ? 'CORRECT_OVERRIDE' : 'WRONG_OVERRIDE')
                         : (actualReturn < 0 ? 'CORRECT_OVERRIDE' : 'WRONG_OVERRIDE');
  }

  await prisma.manualDecisionOverride.update({
    where: { id: overrideId },
    data: { outcome, actualReturn, updatedAt: new Date() },
  });

  console.log(`[OVERRIDE] Evaluated ${overrideId}: ${outcome} (return=${actualReturn.toFixed(2)}%)`);
}
