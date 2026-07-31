// ============================================================
// GET /api/global-spillover/compare
// Compare V1 vs V2 performance with OOS metrics.
// Returns: promotion status, V1/V2 metrics, Brier scores,
//   and whether V2 should be promoted.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { runFullComparison, getActiveModel, resetPromotionCache } from '@/lib/spillover-promotion';
import { evaluateModelResults } from '@/lib/spillover-v2';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';
    const runEvaluation = searchParams.get('evaluate') === 'true';

    // Optionally evaluate pending model results first
    if (runEvaluation) {
      await evaluateModelResults().catch(err =>
        console.error('[COMPARE] Evaluation failed:', err)
      );
    }

    // Force refresh of promotion cache
    if (forceRefresh) {
      resetPromotionCache();
    }

    // Run full comparison
    const result = await runFullComparison();
    const activeModel = await getActiveModel();

    // Build the 4-phase status
    const phases = {
      currentPhase: result.v2Promoted ? 4 : result.currentSampleSize >= 50 ? 2 : 1,
      phase1_live_v1_shadow_v2: result.currentSampleSize < 50,
      phase2_weekly_oos_comparison: result.currentSampleSize >= 50 && !result.v2Promoted,
      phase3_v2_promoted: result.v2Promoted,
      phase4_v1_fallback_ready: true, // V1 is always ready as fallback
    };

    return NextResponse.json({
      activeModel,
      phases,
      promotion: {
        v2Promoted: result.v2Promoted,
        promotionDate: result.promotionDate,
        promotionReason: result.promotionReason,
        shouldPromote: result.shouldPromote,
        reason: result.reason,
        minSampleRequired: result.minSampleSize,
        currentSampleSize: result.currentSampleSize,
        meetsMinSample: result.details.meetsMinSample,
      },
      v1: result.v1 ? {
        totalOOS: result.v1.totalOOS,
        precisionRelief: Math.round(result.v1.precisionRelief * 1000) / 10,
        recallRelief: Math.round(result.v1.recallRelief * 1000) / 10,
        accuracy: Math.round(result.v1.accuracy * 1000) / 10,
        brierScore: Math.round(result.v1.brierScore * 1000) / 1000,
        avgNetReturnPct: Math.round(result.v1.avgNetReturnPct * 100) / 100,
        avgReturnLong: Math.round(result.v1.avgReturnLong * 100) / 100,
        profitFactor: Math.round(result.v1.profitFactor * 100) / 100,
        winRate: Math.round(result.v1.winRate * 1000) / 10,
      } : null,
      v2: result.v2 ? {
        totalOOS: result.v2.totalOOS,
        precisionRelief: Math.round(result.v2.precisionRelief * 1000) / 10,
        recallRelief: Math.round(result.v2.recallRelief * 1000) / 10,
        accuracy: Math.round(result.v2.accuracy * 1000) / 10,
        brierScore: Math.round(result.v2.brierScore * 1000) / 1000,
        avgNetReturnPct: Math.round(result.v2.avgNetReturnPct * 100) / 100,
        avgReturnLong: Math.round(result.v2.avgReturnLong * 100) / 100,
        profitFactor: Math.round(result.v2.profitFactor * 100) / 100,
        winRate: Math.round(result.v2.winRate * 1000) / 10,
      } : null,
      deltas: {
        precisionRelief_pp: Math.round(result.details.precisionDelta * 1000) / 10,
        brierScore_diff: Math.round(result.details.brierDelta * 1000) / 1000,
        avgNetReturn_pp: Math.round(result.details.returnDelta * 100) / 100,
        sampleV1: result.details.sampleV1,
        sampleV2: result.details.sampleV2,
      },
      evaluatedAt: result.evaluatedAt,
      processingTimeMs: Date.now() - startTime,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[SPILLOVER-COMPARE] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
