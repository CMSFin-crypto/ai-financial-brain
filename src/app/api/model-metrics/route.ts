// ============================================================
// Model Metrics API — Brier score + calibration dashboard data
// GET  ?modelVersion=...&horizonDays=... — current metrics
// POST { modelVersion, horizonDays? }       — snapshot + return
// GET  ?history=true&days=90                — time-series snapshots
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  calculateModelMetrics,
  snapshotModelMetrics,
  getMetricsHistory,
} from '@/lib/model-metrics';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const modelVersion =
      url.searchParams.get('modelVersion') ?? '2.0';
    const horizonDaysParam = url.searchParams.get('horizonDays');
    const horizonDays = horizonDaysParam
      ? Number(horizonDaysParam)
      : undefined;
    const history = url.searchParams.get('history') === 'true';
    const daysParam = url.searchParams.get('days');
    const days = daysParam ? Number(daysParam) : undefined;

    // Time-series mode
    if (history) {
      const snapshots = await getMetricsHistory({
        modelVersion,
        horizonDays,
        days,
      });
      return NextResponse.json({ snapshots });
    }

    // Current metrics mode
    const metrics = await calculateModelMetrics({ modelVersion, horizonDays });
    return NextResponse.json(metrics);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    console.error('[MODEL-METRICS] GET failed:', message);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const modelVersion = body?.modelVersion;
    const horizonDays = Number(body?.horizonDays ?? 1);

    if (!modelVersion || typeof modelVersion !== 'string') {
      return NextResponse.json(
        { error: 'modelVersion (string) is required' },
        { status: 400 },
      );
    }

    if (horizonDays < 1 || horizonDays > 365) {
      return NextResponse.json(
        { error: 'horizonDays must be between 1 and 365' },
        { status: 400 },
      );
    }

    const snapshot = await snapshotModelMetrics({ modelVersion, horizonDays });
    return NextResponse.json(snapshot);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    console.error('[MODEL-METRICS] POST failed:', message);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
