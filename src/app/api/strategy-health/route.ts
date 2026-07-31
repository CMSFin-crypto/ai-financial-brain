import { NextRequest, NextResponse } from 'next/server';
import { getExecutionQuality } from '@/lib/execution-quality';
import { assessStrategyHealth, type StrategyHealthResult } from '@/lib/strategy-health';
import { DEFAULT_THRESHOLDS, PRESETS, mergeThresholds, type HealthThresholds } from '@/lib/health-thresholds';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const days = Number(url.searchParams.get('days') ?? '7');
    const symbol = url.searchParams.get('symbol') ?? undefined;
    const preset = url.searchParams.get('preset');
    const maxDrawdownPct = url.searchParams.get('maxDrawdown');
    const consecutiveLosses = url.searchParams.get('losses');
    const exposurePct = url.searchParams.get('exposure');

    // Select threshold set
    let thresholds: HealthThresholds = { ...DEFAULT_THRESHOLDS };
    if (preset && PRESETS[preset]) {
      thresholds = mergeThresholds(thresholds, PRESETS[preset]);
    }

    // Fetch execution quality metrics
    const exec = await getExecutionQuality({ symbol, days });

    // Build health input — execution metrics + optional overrides from query
    const healthInput = {
      fillRate: exec.fillRate,
      rejectRate: exec.rejectRate,
      avgSlippageBps: exec.avgSlippageBps,
      p95SlippageBps: exec.p95SlippageBps,
      avgLatencyMs: exec.avgLatencyMs,
      stopAttachedRate: exec.stopAttachedRate,
      // These come from portfolio/paper-trade state, not execution events
      maxDrawdownPct: maxDrawdownPct ? Number(maxDrawdownPct) : undefined,
      consecutiveLosses: consecutiveLosses ? Number(consecutiveLosses) : undefined,
      exposurePct: exposurePct ? Number(exposurePct) : undefined,
    };

    const health = assessStrategyHealth(healthInput, thresholds);

    return NextResponse.json({
      health,
      execution: {
        sampleSize: exec.sampleSize,
        fillRate: exec.fillRate,
        rejectRate: exec.rejectRate,
        avgSlippageBps: exec.avgSlippageBps,
        p95SlippageBps: exec.p95SlippageBps,
        avgLatencyMs: exec.avgLatencyMs,
        p95LatencyMs: exec.p95LatencyMs,
        stopAttachedRate: exec.stopAttachedRate,
      },
      thresholds: {
        preset: preset ?? 'default',
        fillRateMin: thresholds.fillRateMin,
        rejectRateMax: thresholds.rejectRateMax,
        rejectRateCritical: thresholds.rejectRateCritical,
        maxDrawdownPct: thresholds.maxDrawdownPct,
        drawdownCriticalPct: thresholds.drawdownCriticalPct,
        baselineSlippageBps: thresholds.baselineSlippageBps,
        baselineLatencyMs: thresholds.baselineLatencyMs,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[STRATEGY-HEALTH] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
