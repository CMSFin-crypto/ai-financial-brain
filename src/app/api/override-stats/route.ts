// ============================================================
// GET /api/override-stats?full=true  → Full Override Journal
// GET /api/override-stats?days=30   → Legacy summary (default)
// POST /api/override-stats          → Log new override
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { computeOverrideJournal } from '@/lib/override-journal';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const full = url.searchParams.get('full') === 'true';

    // Full journal mode — uses override-journal.ts
    if (full) {
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const journal = await computeOverrideJournal(limit);
      return NextResponse.json({ ok: true, data: journal });
    }

    // Legacy mode (backward compatible)
    const days = Number(url.searchParams.get('days') ?? '30');
    const since = new Date(Date.now() - days * 86400000);

    const overrides = await prisma.manualDecisionOverride.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const total = overrides.length;
    const rejected = overrides.filter(o => o.overrideDecision === 'REJECTED');
    const accepted = overrides.filter(o => o.overrideDecision === 'ACCEPTED');
    const modified = overrides.filter(o => o.overrideDecision === 'MODIFIED');

    // Reason distribution
    const reasonDist: Record<string, number> = {};
    for (const o of overrides) {
      reasonDist[o.overrideReason] = (reasonDist[o.overrideReason] || 0) + 1;
    }

    // Were the overrides correct?
    const resolved = overrides.filter(o => o.outcome && o.outcome !== 'PENDING');
    const correctOverrides = resolved.filter(o => o.outcome === 'CORRECT_OVERRIDE').length;
    const overrideWinRate = resolved.length > 0
      ? Math.round((correctOverrides / resolved.length) * 10000) / 100
      : null;

    // Did rejecting the model's signal save money?
    const rejectedWithOutcome = rejected.filter(o => o.actualReturn != null);
    const avgRejectedReturn = rejectedWithOutcome.length > 0
      ? Math.round(rejectedWithOutcome.reduce((s, o) => s + (o.actualReturn as number), 0) / rejectedWithOutcome.length * 10000) / 100
      : null;

    return NextResponse.json({
      period: { days, from: since.toISOString() },
      total,
      accepted: accepted.length,
      rejected: rejected.length,
      modified: modified.length,
      overrideWinRate,
      avgRejectedReturn,
      reasonDistribution: Object.entries(reasonDist)
        .sort((a, b) => b[1] - a[1])
        .map(([reason, count]) => ({ reason, count })),
      recent: overrides.slice(0, 20).map(o => ({
        id: o.id,
        symbol: o.symbol,
        originalDecision: o.originalDecision,
        overrideDecision: o.overrideDecision,
        overrideReason: o.overrideReason,
        notes: o.notes,
        modelScore: o.modelScore,
        regime: o.regime,
        outcome: o.outcome,
        actualReturn: o.actualReturn,
        createdAt: o.createdAt,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[OVERRIDE-STATS] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST to log a new override
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbol, originalDecision, overrideDecision, overrideReason, notes, modelScore, modelConfidence, regime, predictionId } = body;

    if (!symbol || !originalDecision || !overrideDecision || !overrideReason) {
      return NextResponse.json(
        { error: 'symbol, originalDecision, overrideDecision, overrideReason required' },
        { status: 400 },
      );
    }

    const validReasons = ['news_risk', 'liquidity', 'earnings_near', 'disagree_with_signal', 'execution_risk', 'other'];
    if (!validReasons.includes(overrideReason)) {
      return NextResponse.json(
        { error: `overrideReason must be one of: ${validReasons.join(', ')}` },
        { status: 400 },
      );
    }

    const record = await prisma.manualDecisionOverride.create({
      data: {
        predictionId: predictionId || null,
        symbol,
        originalDecision,
        overrideDecision,
        overrideReason,
        notes: notes || null,
        modelScore: modelScore != null ? Number(modelScore) : null,
        modelConfidence: modelConfidence != null ? Number(modelConfidence) : null,
        regime: regime || null,
        outcome: 'PENDING',
      },
    });

    return NextResponse.json({ id: record.id, status: 'logged' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[OVERRIDE-STATS] POST Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
