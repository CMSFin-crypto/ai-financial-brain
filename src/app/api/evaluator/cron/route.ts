// ============================================================
// Evaluator Cron — Triggers both legacy + Brier evaluation,
// then snapshots metrics for the calibration dashboard.
// Call: POST /api/evaluator/cron
// ============================================================

import { NextResponse } from 'next/server';
import { evaluateDuePredictions } from '@/lib/evaluation-engine';
import { evaluateDuePredictionsBrier } from '@/lib/evaluate-prediction';
import { snapshotModelMetrics } from '@/lib/model-metrics';

export const maxDuration = 120;

export async function POST() {
  const startTime = Date.now();

  try {
    // 1. Run both evaluators in parallel
    const [legacyResult, brierResult] = await Promise.all([
      evaluateDuePredictions(),
      evaluateDuePredictionsBrier(),
    ]);

    // 2. Snapshot metrics if any predictions were evaluated
    type SnapshotRef = { id: string; createdAt: Date } | null;
    let snapshot: SnapshotRef = null;
    if (legacyResult.evaluated > 0 || brierResult.evaluated > 0) {
      const result = await snapshotModelMetrics({
        modelVersion: 'predict-v3-regime-spillover',
        horizonDays: 1,
      }).catch(err => {
        console.error('[EVALUATOR-CRON] Snapshot failed:', err);
        return null as SnapshotRef;
      });
      if (result) snapshot = { id: result.id, createdAt: result.createdAt };
    }

    const elapsedMs = Date.now() - startTime;

    return NextResponse.json({
      status: 'ok',
      elapsedMs,
      legacy: {
        evaluated: legacyResult.evaluated,
        correct: legacyResult.correct,
        wrong: legacyResult.wrong,
        weightsUpdated: legacyResult.weightsUpdated,
      },
      brier: brierResult,
      metricsSnapshot: snapshot ? { id: snapshot.id, createdAt: snapshot.createdAt } : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[EVALUATOR-CRON] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
