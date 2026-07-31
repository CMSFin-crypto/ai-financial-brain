// ============================================================
// GET  /api/cron/rebuild-calibration
// Weekly cron (Monday 06:00 UTC) to:
//   1. Invalidate caches
//   2. Retrain isotonic/platt calibrator
//   3. Re-fit conformal thresholds
//   4. Log the new state
//
// Also triggered manually via:
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//        https://your-app.vercel.app/api/cron/rebuild-calibration
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { invalidateCalibratorCache } from '@/lib/probability-calibrator';
import { invalidateConformalCache } from '@/lib/conformal-risk';
import { trainCalibrationModel } from '@/lib/calibration-service';
import { getConformalDecision } from '@/lib/conformal-service';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Auth check
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const results: Record<string, unknown> = {};

  try {
    // Step 1: Invalidate caches
    invalidateCalibratorCache();
    invalidateConformalCache();
    results.cachesInvalidated = true;

    // Step 2: Retrain calibrator (default: auto method)
    const calibratorState = await trainCalibrationModel({
      modelVersion: 'predict-v3-regime-spillover',
      horizonDays: 1,
      bins: 10,
    });
    results.calibrator = {
      method: calibratorState.method,
      sampleSize: calibratorState.sampleSize,
      preBrier: calibratorState.preCalibrationBrier,
      postBrier: calibratorState.postCalibrationBrier,
      improvement: calibratorState.improvement,
    };

    // Step 3: Warm conformal cache by running a probe decision
    try {
      const probe = await getConformalDecision({
        symbol: 'SPY',
        probability: 0.6,
        modelVersion: 'predict-v3-regime-spillover',
        alpha: 0.1,
      });
      results.conformalProbe = {
        sampleSize: probe.sampleSize,
        threshold: probe.threshold,
        tradeEligible: probe.tradeEligible,
      };
    } catch (err) {
      results.conformalProbe = { error: err instanceof Error ? err.message : 'Failed' };
    }

    const elapsed = Date.now() - startTime;
    console.log(
      `[CRON-CALIBRATION] Rebuild complete in ${elapsed}ms. ` +
      `Calibrator: ${calibratorState.method} on ${calibratorState.sampleSize} samples. ` +
      `Brier: ${calibratorState.preCalibrationBrier} → ${calibratorState.postCalibrationBrier}`,
    );

    return NextResponse.json({
      status: 'ok',
      elapsedMs: elapsed,
      ...results,
    });
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[CRON-CALIBRATION] Failed after ${elapsed}ms:`, message);
    return NextResponse.json({ error: message, elapsedMs: elapsed }, { status: 500 });
  }
}
