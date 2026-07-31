// ============================================================
// GET  /api/model-calibration
//   ?modelVersion=<v> &regime=<r> &horizonDays=<n> &bins=<5-20>
//   &byRegime=true  — per-regime breakdown
//   &byVersion=true — per-model-version breakdown
//   &timeseries=true — weekly Brier/ECE over time
//   &train=true     — train calibrator and return state
//
// All query params validated via Zod.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { parseQuery } from '@/lib/parse-query';
import { calibrationQuerySchema } from '@/lib/api-schemas';
import {
  getCalibrationReport,
  getCalibrationByRegime,
  getCalibrationByVersion,
  getCalibrationTimeSeriesData,
  trainCalibrationModel,
  getCalibratorInfo,
} from '@/lib/calibration-service';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  // Validate query params via Zod (throws on invalid)
  let query;
  try {
    query = parseQuery(req, calibrationQuerySchema);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid query parameters';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    // Branch 1: byRegime breakdown
    if (query.byRegime) {
      const regimes = await getCalibrationByRegime({
        modelVersion: query.modelVersion,
        horizonDays: query.horizonDays,
      });
      return NextResponse.json({
        type: 'calibration_by_regime',
        regimes,
        regimeCount: Object.keys(regimes).length,
      });
    }

    // Branch 2: byVersion breakdown
    if (query.byVersion) {
      const versions = await getCalibrationByVersion({
        horizonDays: query.horizonDays,
      });
      return NextResponse.json({
        type: 'calibration_by_version',
        versions,
        versionCount: Object.keys(versions).length,
      });
    }

    // Branch 3: time series
    if (query.timeseries) {
      const series = await getCalibrationTimeSeriesData({
        modelVersion: query.modelVersion,
        horizonDays: query.horizonDays,
        days: query.days,
      });
      return NextResponse.json({
        type: 'calibration_timeseries',
        dataPoints: series.length,
        series,
      });
    }

    // Branch 4: train calibrator
    if (query.train) {
      const state = await trainCalibrationModel({
        modelVersion: query.modelVersion,
        regime: query.regime,
        horizonDays: query.horizonDays,
        bins: query.bins,
      });
      return NextResponse.json({
        type: 'calibrator_state',
        ...state,
      });
    }

    // Branch 5 (default): single calibration report
    const report = await getCalibrationReport({
      modelVersion: query.modelVersion,
      regime: query.regime,
      horizonDays: query.horizonDays,
      bins: query.bins,
    });

    // Also get calibrator info
    const calibrator = await getCalibratorInfo({
      modelVersion: query.modelVersion,
      horizonDays: query.horizonDays,
    });

    return NextResponse.json({
      type: 'calibration_report',
      ...report,
      calibrator,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CALIBRATION-API]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
