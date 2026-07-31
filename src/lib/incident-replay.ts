// ============================================================
// Incident Replay — reconstructs what happened during a problem.
//
// When something goes wrong (reject spike, slippage blowout,
// stuck picks, health escalation), this module gathers all relevant
// data points from DB and assembles a timeline postmortem.
//
// Input: a symbol + time window (or an incident ID).
// Output: ordered timeline of events with context.
// ============================================================

import prisma from './prisma';

// ─── Types ────────────────────────────────────────────────────

export type TimelineEvent = {
  timestamp: string;
  source: string;       // "prediction" | "execution" | "health" | "override" | "market" | "scan"
  symbol: string;
  type: string;
  summary: string;
  details: Record<string, unknown>;
};

export type IncidentReplay = {
  incidentId: string;
  symbol: string;
  window: { from: string; to: string };
  timeline: TimelineEvent[];
  summary: {
    predictionCount: number;
    executionEvents: number;
    overrides: number;
    healthEvents: number;
    scanPicks: number;
    avgReturn: number;
    winRate: number;
    totalSlippageBps: number | null;
    rejectRate: number | null;
  };
};

export type IncidentInput = {
  symbol?: string;
  from: string;       // ISO date
  to?: string;         // ISO date (default: now)
  includeExecution?: boolean;
  includeHealth?: boolean;
  includeOverrides?: boolean;
  includeScanPicks?: boolean;
};

// ─── Core ──────────────────────────────────────────────────────

export async function replayIncident(input: IncidentInput): Promise<IncidentReplay> {
  const from = new Date(input.from);
  const to = input.to ? new Date(input.to) : new Date();
  const symbol = input.symbol;

  const incidentId = `${symbol || 'ALL'}_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`;
  const timeline: TimelineEvent[] = [];

  // --- 1. Predictions for this window ---
  const predWhere: Record<string, unknown> = { predictedAt: { gte: from, lte: to } };
  if (symbol) predWhere.symbol = symbol;

  const predictions = await prisma.prediction.findMany({
    where: predWhere,
    orderBy: { predictedAt: 'asc' },
    include: { factors: { take: 5 } },
    take: 500,
  });

  for (const p of predictions) {
    timeline.push({
      timestamp: p.predictedAt.toISOString(),
      source: 'prediction',
      symbol: p.symbol,
      type: p.finalDecision,
      summary: `${p.finalDecision} ${p.symbol} score=${(p.rawScore).toFixed(2)} conf=${p.calibratedConfidence.toFixed(2)}${p.regime ? ` regime=${p.regime}` : ''}`,
      details: {
        entryPrice: p.entryPrice,
        actualReturn: p.actualReturn,
        wasCorrect: p.wasCorrect,
        modelVersion: p.modelVersion,
        horizonDays: p.horizonDays,
        topFactors: p.factors.slice(0, 3).map(f => ({ name: f.factorName, score: f.score })),
      },
    });
  }

  // --- 2. Execution events ---
  if (input.includeExecution !== false) {
    const execWhere: Record<string, unknown> = { createdAt: { gte: from, lte: to } };
    if (symbol) execWhere.symbol = symbol;

    const executions = await prisma.executionEvent.findMany({
      where: execWhere,
      orderBy: { submittedAt: 'asc' },
      take: 200,
    });

    for (const e of executions) {
      let summary = `${e.side} ${e.symbol} ${e.orderType} qty=${e.quantity}`;
      if (e.status === 'REJECTED') summary += ` REJECTED: ${e.rejectReason || 'unknown'}`;
      else if (e.status === 'FILLED') summary += ` FILLED @ ${e.filledPrice} (slippage: ${e.slippageBps ?? 0} bps)`;
      else summary += ` ${e.status}`;

      timeline.push({
        timestamp: e.submittedAt.toISOString(),
        source: 'execution',
        symbol: e.symbol,
        type: e.status,
        summary,
        details: {
          intendedPrice: e.intendedPrice,
          submittedPrice: e.submittedPrice,
          filledPrice: e.filledPrice,
          latencyMs: e.latencyMs,
          slippageBps: e.slippageBps,
          stopAttached: e.stopAttached,
          venue: e.venue,
        },
      });
    }
  }

  // --- 3. Manual overrides ---
  if (input.includeOverrides !== false) {
    const overrideWhere: Record<string, unknown> = { createdAt: { gte: from, lte: to } };
    if (symbol) overrideWhere.symbol = symbol;

    const overrides = await prisma.manualDecisionOverride.findMany({
      where: overrideWhere,
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    for (const o of overrides) {
      timeline.push({
        timestamp: o.createdAt.toISOString(),
        source: 'override',
        symbol: o.symbol,
        type: o.overrideDecision,
        summary: `${o.overrideDecision} ${o.originalDecision} → ${o.overrideDecision} (${o.overrideReason})${o.outcome && o.outcome !== 'PENDING' ? ` outcome=${o.outcome}` : ''}`,
        details: {
          modelScore: o.modelScore,
          modelConfidence: o.modelConfidence,
          regime: o.regime,
          notes: o.notes,
          actualReturn: o.actualReturn,
        },
      });
    }
  }

  // --- 4. Scan picks ---
  if (input.includeScanPicks !== false) {
    const scanWhere: Record<string, unknown> = { scanDate: { gte: from, lte: to } };
    if (symbol) scanWhere.symbol = symbol;

    const picks = await prisma.dailyPick.findMany({
      where: scanWhere,
      orderBy: { scanDate: 'asc' },
      take: 100,
    });

    for (const p of picks) {
      timeline.push({
        timestamp: p.scanDate.toISOString(),
        source: 'scan',
        symbol: p.symbol,
        type: p.bucket,
        summary: `${p.bucket} #${p.rank} ${p.symbol} score=${p.score}${p.sector ? ` [${p.sector}]` : ''}`,
        details: { rank: p.rank, score: p.score, sector: p.sector },
      });
    }
  }

  // Sort timeline chronologically
  timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // --- Compute summary stats ---
  const evalPreds = predictions.filter(p => p.actualReturn != null);
  const returns = evalPreds.map(p => p.actualReturn as number);
  const correct = evalPreds.filter(p => p.wasCorrect === true).length;

  const execEvents = timeline.filter(e => e.source === 'execution');
  const filled = execEvents.filter(e => e.type === 'FILLED');
  const rejected = execEvents.filter(e => e.type === 'REJECTED');
  const slippages = execEvents
    .map(e => e.details.slippageBps as number | null)
    .filter((s): s is number => s != null);

  return {
    incidentId,
    symbol: symbol || 'ALL',
    window: { from: from.toISOString(), to: to.toISOString() },
    timeline,
    summary: {
      predictionCount: predictions.length,
      executionEvents: execEvents.length,
      overrides: timeline.filter(e => e.source === 'override').length,
      healthEvents: timeline.filter(e => e.source === 'health').length,
      scanPicks: timeline.filter(e => e.source === 'scan').length,
      avgReturn: returns.length > 0 ? Math.round(returns.reduce((a, b) => a + b, 0) / returns.length * 10000) / 100 : 0,
      winRate: evalPreds.length > 0 ? Math.round((correct / evalPreds.length) * 10000) / 100 : 0,
      totalSlippageBps: slippages.length > 0 ? Math.round(slippages.reduce((a, b) => a + b, 0) * 100) / 100 : null,
      rejectRate: execEvents.length > 0 ? Math.round((rejected.length / execEvents.length) * 10000) / 100 : null,
    },
  };
}
