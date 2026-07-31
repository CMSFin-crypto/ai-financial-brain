// ============================================================
// Execution Quality — metrics computation over ExecutionEvents.
// Returns fill rate, reject rate, slippage distribution, latency
// distribution, stop attached rate, and top reject reasons.
// ============================================================

import prisma from './prisma';

// ─── Stats helpers ────────────────────────────────────────────

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function stdDev(values: number[], avg: number): number | null {
  if (values.length < 2) return null;
  const sumSq = values.reduce((s, v) => s + (v - avg) ** 2, 0);
  return Math.sqrt(sumSq / (values.length - 1));
}

// ─── Types ────────────────────────────────────────────────────

export type ExecutionQualityReport = {
  sampleSize: number;
  fillRate: number | null;
  rejectRate: number | null;
  avgLatencyMs: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  p99LatencyMs: number | null;
  avgSlippageBps: number | null;
  p50SlippageBps: number | null;
  p95SlippageBps: number | null;
  p99SlippageBps: number | null;
  slippageStdDev: number | null;
  stopAttachedRate: number | null;
  topRejectReasons: Array<{ reason: string; count: number }>;
  // Alarm flags
  alarms: ExecutionAlarm[];
};

export type ExecutionAlarm = {
  metric: string;
  severity: 'WARNING' | 'CRITICAL';
  value: number;
  threshold: number;
  message: string;
};

// ─── Thresholds ───────────────────────────────────────────────

const THRESHOLDS = {
  fillRateMin: 0.95,          // < 95% fill rate → warning
  fillRateCritical: 0.85,     // < 85% → critical
  rejectRateMax: 0.02,         // > 2% reject → warning
  rejectRateCritical: 0.05,   // > 5% → critical
  avgSlippageMax: 5,          // > 5 bps avg slippage → warning
  avgSlippageCritical: 15,    // > 15 bps → critical
  p95LatencyMax: 2000,        // > 2s p95 latency → warning
  p95LatencyCritical: 5000,   // > 5s → critical
  stopAttachedMin: 1.0,       // < 100% stop attached → warning (for strategies that require stops)
};

// ─── Core query ───────────────────────────────────────────────

export async function getExecutionQuality(params?: {
  symbol?: string;
  days?: number;
}): Promise<ExecutionQualityReport> {
  const days = params?.days ?? 7;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await prisma.executionEvent.findMany({
    where: {
      ...(params?.symbol ? { symbol: params.symbol } : {}),
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
  });

  const total = rows.length;
  const filled = rows.filter(r => r.status === 'FILLED');
  const rejected = rows.filter(r => r.status === 'REJECTED');
  const withLatency = rows.filter(r => r.latencyMs != null).map(r => r.latencyMs as number);
  const withSlippage = rows.filter(r => r.slippageBps != null).map(r => r.slippageBps as number);

  const avgLatency = mean(withLatency);
  const avgSlippage = mean(withSlippage);

  // Compute alarms
  const alarms: ExecutionAlarm[] = [];

  const fillRate = total ? filled.length / total : null;
  const rejectRate = total ? rejected.length / total : null;

  if (fillRate !== null) {
    if (fillRate < THRESHOLDS.fillRateCritical) {
      alarms.push({ metric: 'fillRate', severity: 'CRITICAL', value: fillRate, threshold: THRESHOLDS.fillRateCritical, message: `Fill rate ${(fillRate * 100).toFixed(1)}% is critically low` });
    } else if (fillRate < THRESHOLDS.fillRateMin) {
      alarms.push({ metric: 'fillRate', severity: 'WARNING', value: fillRate, threshold: THRESHOLDS.fillRateMin, message: `Fill rate ${(fillRate * 100).toFixed(1)}% below ${(THRESHOLDS.fillRateMin * 100).toFixed(0)}% target` });
    }
  }

  if (rejectRate !== null) {
    if (rejectRate > THRESHOLDS.rejectRateCritical) {
      alarms.push({ metric: 'rejectRate', severity: 'CRITICAL', value: rejectRate, threshold: THRESHOLDS.rejectRateCritical, message: `Reject rate ${(rejectRate * 100).toFixed(1)}% is critically high` });
    } else if (rejectRate > THRESHOLDS.rejectRateMax) {
      alarms.push({ metric: 'rejectRate', severity: 'WARNING', value: rejectRate, threshold: THRESHOLDS.rejectRateMax, message: `Reject rate ${(rejectRate * 100).toFixed(1)}% exceeds ${(THRESHOLDS.rejectRateMax * 100).toFixed(0)}% limit` });
    }
  }

  if (avgSlippage !== null) {
    if (avgSlippage > THRESHOLDS.avgSlippageCritical) {
      alarms.push({ metric: 'avgSlippage', severity: 'CRITICAL', value: avgSlippage, threshold: THRESHOLDS.avgSlippageCritical, message: `Avg slippage ${avgSlippage.toFixed(1)} bps is critically high` });
    } else if (avgSlippage > THRESHOLDS.avgSlippageMax) {
      alarms.push({ metric: 'avgSlippage', severity: 'WARNING', value: avgSlippage, threshold: THRESHOLDS.avgSlippageMax, message: `Avg slippage ${avgSlippage.toFixed(1)} bps above ${THRESHOLDS.avgSlippageMax} bps baseline` });
    }
  }

  const p95Lat = percentile(withLatency, 95);
  if (p95Lat !== null) {
    if (p95Lat > THRESHOLDS.p95LatencyCritical) {
      alarms.push({ metric: 'p95Latency', severity: 'CRITICAL', value: p95Lat, threshold: THRESHOLDS.p95LatencyCritical, message: `P95 latency ${p95Lat}ms is critically high` });
    } else if (p95Lat > THRESHOLDS.p95LatencyMax) {
      alarms.push({ metric: 'p95Latency', severity: 'WARNING', value: p95Lat, threshold: THRESHOLDS.p95LatencyMax, message: `P95 latency ${p95Lat}ms exceeds ${THRESHOLDS.p95LatencyMax}ms` });
    }
  }

  return {
    sampleSize: total,
    fillRate: fillRate !== null ? Math.round(fillRate * 10000) / 10000 : null,
    rejectRate: rejectRate !== null ? Math.round(rejectRate * 10000) / 10000 : null,
    avgLatencyMs: avgLatency !== null ? Math.round(avgLatency) : null,
    p50LatencyMs: percentile(withLatency, 50),
    p95LatencyMs: p95Lat,
    p99LatencyMs: percentile(withLatency, 99),
    avgSlippageBps: avgSlippage !== null ? Math.round(avgSlippage * 100) / 100 : null,
    p50SlippageBps: percentile(withSlippage, 50),
    p95SlippageBps: percentile(withSlippage, 95),
    p99SlippageBps: percentile(withSlippage, 99),
    slippageStdDev: avgSlippage !== null ? stdDev(withSlippage, avgSlippage) : null,
    stopAttachedRate: total
      ? Math.round((rows.filter(r => r.stopAttached).length / total) * 10000) / 10000
      : null,
    topRejectReasons: Object.entries(
      rejected.reduce<Record<string, number>>((acc, row) => {
        const key = row.rejectReason || 'UNKNOWN';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count })),
    alarms,
  };
}

// ─── Recent executions (for table) ────────────────────────────

export type RecentExecution = {
  id: string;
  symbol: string;
  side: string;
  orderType: string;
  quantity: number;
  intendedPrice: number | null;
  filledPrice: number | null;
  slippageBps: number | null;
  latencyMs: number | null;
  status: string;
  rejectReason: string | null;
  stopAttached: boolean;
  submittedAt: Date;
  filledAt: Date | null;
};

export async function getRecentExecutions(limit = 20, symbol?: string): Promise<RecentExecution[]> {
  return prisma.executionEvent.findMany({
    where: symbol ? { symbol } : {},
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true, symbol: true, side: true, orderType: true, quantity: true,
      intendedPrice: true, filledPrice: true, slippageBps: true,
      latencyMs: true, status: true, rejectReason: true,
      stopAttached: true, submittedAt: true, filledAt: true,
    },
  });
}
