// ============================================================
// GET /api/drift-review — Prediction Review & Drift Monitor
//
// ?record=true  → also persist today's DriftSnapshot
// ?history=30  → include drift history (days)
// ============================================================

import { NextResponse } from 'next/server';
import { computeDriftReview, recordDailySnapshot, getDriftHistory } from '@/lib/drift-review';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const shouldRecord = searchParams.get('record') === 'true';
    const historyDays = parseInt(searchParams.get('history') || '0', 10);

    // Compute full drift review
    const review = await computeDriftReview();

    // Optionally record daily snapshot
    let recorded = false;
    if (shouldRecord) {
      const snapshot = await recordDailySnapshot();
      recorded = !!snapshot;
    }

    // Optionally include history
    let history = null;
    if (historyDays > 0) {
      history = await getDriftHistory(historyDays);
    }

    return NextResponse.json({
      ok: true,
      recorded,
      data: review,
      history,
    });
  } catch (err) {
    console.error('[DRIFT-REVIEW] GET failed:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to compute drift review' },
      { status: 500 },
    );
  }
}
