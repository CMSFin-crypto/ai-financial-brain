// ============================================================
// GET /api/kontrol-summary — Live status for the 4 Kontrol tabs
//
// One lightweight call that feeds the live badges on the main
// page (Drift / Override / Edge / Metrics). Each section is
// computed independently and degrades to null when the DB is
// not configured or has no data yet.
// ============================================================

import { NextResponse } from 'next/server';
import prisma, { isDbAvailable } from '@/lib/prisma';
import { computeDriftReview, type DriftReviewResult } from '@/lib/drift-review';
import { computeOverrideJournal } from '@/lib/override-journal';
import { computeEdgeLeaderboard } from '@/lib/edge-leaderboard';
import { calculateModelMetrics } from '@/lib/model-metrics';

// True when the schema tables exist (count() succeeds on empty tables too)
async function tablesReady(): Promise<boolean> {
  try {
    await prisma.prediction.count();
    return true;
  } catch {
    return false;
  }
}

type DriftSummary = {
  totalEvaluated: number;
  totalPending: number;
  overallAccuracy: number | null;
  trend: 'improving' | 'stable' | 'degrading' | 'insufficient_data';
  criticalCount: number;
  warningCount: number;
  brierScore: number | null;
};

type OverrideSummary = {
  total: number;
  pending: number;
  modelHitRate: number | null;
  humanHitRate: number | null;
  delta: number | null;
};

type EdgeSummary = {
  totalEnvironments: number;
  strongEdge: number;
  negativeEdge: number;
  bestSector: string | null;
  bestSectorAccuracy: number | null;
  worstSector: string | null;
};

type MetricsSummary = {
  sampleSize: number;
  accuracy: number | null;       // 0-100
  brierScore: number | null;
  alpha: number | null;          // 0-100
  winRate: number | null;        // 0-100
};

async function safeDrift(): Promise<DriftSummary | null> {
  try {
    const review: DriftReviewResult = await computeDriftReview();
    const trends = review.horizons.map((h) => h.trend);
    const trend: DriftSummary['trend'] = trends.includes('degrading')
      ? 'degrading'
      : trends.includes('improving')
        ? 'improving'
        : trends.length > 0
          ? 'stable'
          : 'insufficient_data';
    return {
      totalEvaluated: review.overall.totalEvaluated,
      totalPending: review.overall.totalPending,
      overallAccuracy: review.overall.totalEvaluated > 0 ? review.overall.overallAccuracy : null,
      trend,
      criticalCount: review.warnings.filter((w) => w.level === 'CRITICAL').length,
      warningCount: review.warnings.filter((w) => w.level === 'WARNING').length,
      brierScore: review.calibration.brierScore,
    };
  } catch {
    return null;
  }
}

async function safeOverrides(): Promise<OverrideSummary | null> {
  try {
    const journal = await computeOverrideJournal(1);
    const s = journal.summary;
    const evaluated = s.evaluated;
    return {
      total: s.totalOverrides,
      pending: s.pending,
      modelHitRate: evaluated > 0 ? journal.hitRate.modelHitRate : null,
      humanHitRate: evaluated > 0 ? journal.hitRate.humanHitRate : null,
      delta: evaluated > 0 ? journal.hitRate.delta : null,
    };
  } catch {
    return null;
  }
}

async function safeEdge(): Promise<EdgeSummary | null> {
  try {
    const lb = await computeEdgeLeaderboard();
    const all = [...lb.sectors.ranked, ...lb.regimes.ranked];
    const bestSectorEntry = lb.sectors.ranked.find((r) => r.name === lb.sectors.best);
    return {
      totalEnvironments: all.length,
      strongEdge: all.filter((r) => r.edge === 'strong').length,
      negativeEdge: all.filter((r) => r.edge === 'negative').length,
      bestSector: lb.sectors.best,
      bestSectorAccuracy: bestSectorEntry ? bestSectorEntry.accuracy : null,
      worstSector: lb.sectors.worst,
    };
  } catch {
    return null;
  }
}

async function safeMetrics(): Promise<MetricsSummary | null> {
  try {
    const m = await calculateModelMetrics();
    if (!m || m.sampleSize === 0) return null;
    return {
      sampleSize: m.sampleSize,
      accuracy: m.accuracy != null ? Math.round(m.accuracy * 1000) / 10 : null,
      brierScore: m.brierScore ?? null,
      alpha: m.alpha != null ? Math.round(m.alpha * 1000) / 10 : null,
      winRate: m.winRate != null ? Math.round(m.winRate * 1000) / 10 : null,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const dbActive = isDbAvailable();
  const computedAt = new Date().toISOString();

  if (!dbActive) {
    // No DATABASE_URL (or SQLite on Vercel) — everything is inactive.
    // One fast response, no DB calls at all.
    return NextResponse.json({
      ok: true,
      dbActive: false,
      tablesReady: false,
      drift: null,
      overrides: null,
      edge: null,
      metrics: null,
      computedAt,
    });
  }

  const [drift, overrides, edge, metrics, ready] = await Promise.all([
    safeDrift(),
    safeOverrides(),
    safeEdge(),
    safeMetrics(),
    tablesReady(),
  ]);

  return NextResponse.json({
    ok: true,
    dbActive: true,
    tablesReady: ready,
    drift,
    overrides,
    edge,
    metrics,
    computedAt,
  });
}
