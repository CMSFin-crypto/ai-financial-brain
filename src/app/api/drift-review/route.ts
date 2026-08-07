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
    // Return empty structure instead of 500 so UI can show "no data" state
    return NextResponse.json({
      ok: true,
      recorded: false,
      data: {
        computedAt: new Date().toISOString(),
        overall: { totalEvaluated: 0, totalPending: 0, overallAccuracy: 0, streakCorrect: 0, streakWrong: 0 },
        horizons: [],
        calibration: { brierScore: null, ece: null, mce: null, sampleSize: 0, diagnosis: 'Nuk ka të dhëna akoma', brierTrend7d: 'insufficient_data', eceTrend7d: 'insufficient_data' },
        noTrade: { currentRate: 0, rate7d: null, rate30d: null, trend: 'insufficient_data', interpretation: 'Nuk ka predikime akoma' },
        regimeSlices: [],
        sectorSlices: [],
        warnings: [{ level: 'INFO', category: 'general', message: 'Nuk ka të dhëna të mjaftueshme. Predikimet e para do të shfaqen këtu.', detail: null }],
        calibrationTimeSeries: [],
      },
      history: [],
    });
  }
}
