// ============================================================
// GET  /api/model-calibration
//   ?regime=<regime> &modelVersion=<v> &horizonDays=<n>
//   &byRegime=true  — per-regime breakdown
//   &byVersion=true — per-model-version breakdown
//   &timeseries=true — weekly Brier/ECE over time
//   &train=true     — train calibrator and return state
//
// Returns calibration report with ECE, MCE, Brier, reliability table.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  computeCalibrationReport,
  computeCalibrationByRegime,
  computeCalibrationByVersion,
  getCalibrationTimeSeries,
} from '@/lib/calibration-metrics';
import { trainCalibrator, getCalibratorState } from '@/lib/probability-calibrator';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const regime = searchParams.get('regime') || undefined;
    const modelVersion = searchParams.get('modelVersion') || undefined;
    const horizonDays = searchParams.get('horizonDays') ? parseInt(searchParams.get('horizonDays')!) : undefined;
    const byRegime = searchParams.get('byRegime') === 'true';
    const byVersion = searchParams.get('byVersion') === 'true';
    const timeseries = searchParams.get('timeseries') === 'true';
    const train = searchParams.get('train') === 'true';

    if (byRegime) {
      const byRegimeReport = await computeCalibrationByRegime({ modelVersion, horizonDays });
      return NextResponse.json({
        type: 'calibration_by_regime',
        regimes: byRegimeReport,
        regimeCount: Object.keys(byRegimeReport).length,
      });
    }

    if (byVersion) {
      const byVersionReport = await computeCalibrationByVersion(horizonDays);
      return NextResponse.json({
        type: 'calibration_by_version',
        versions: byVersionReport,
        versionCount: Object.keys(byVersionReport).length,
      });
    }

    if (timeseries) {
      const series = await getCalibrationTimeSeries({ modelVersion, horizonDays });
      return NextResponse.json({
        type: 'calibration_timeseries',
        dataPoints: series.length,
        series,
      });
    }

    if (train) {
      const state = await trainCalibrator({ modelVersion, horizonDays, regime });
      return NextResponse.json({
        type: 'calibrator_state',
        ...state,
        improvement: state.preCalibrationBrier !== null && state.postCalibrationBrier !== null
          ? {
              brierDelta: Math.round((state.postCalibrationBrier - state.preCalibrationBrier) * 10000) / 10000,
              improved: state.postCalibrationBrier < state.preCalibrationBrier,
            }
          : null,
      });
    }

    // Default: single calibration report
    const report = await computeCalibrationReport({ modelVersion, horizonDays, regime });

    // Also get current calibrator state if available
    let calibrator: { method: string; trainedAt: string | null; sampleSize: number; preBrier: number | null; postBrier: number | null } | null = null;
    try {
      const state = await getCalibratorState({ modelVersion, horizonDays });
      calibrator = {
        method: state.method,
        trainedAt: state.trainedAt,
        sampleSize: state.sampleSize,
        preBrier: state.preCalibrationBrier,
        postBrier: state.postCalibrationBrier,
      };
    } catch {
      // calibrator not available, that's fine
    }

    return NextResponse.json({
      type: 'calibration_report',
      ...report,
      calibrator: calibrator ? {
        method: calibrator.method,
        trainedAt: calibrator.trainedAt,
        sampleSize: calibrator.sampleSize,
        preBrier: calibrator.preBrier,
        postBrier: calibrator.postBrier,
      } : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CALIBRATION-API]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
