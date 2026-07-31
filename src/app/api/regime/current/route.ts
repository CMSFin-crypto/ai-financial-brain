// ============================================================
// GET /api/regime/current
// Returns the current intelligent regime state, policy,
// transition risk, driver reasons, and modifier details.
// Supports ?history=30 for recent regime history.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { detectRegimeIntelligence, getRegimeHistory, getRegimeAccuracyStats } from '@/lib/regime-intelligence';
import { getAllRegimePolicies } from '@/lib/regime-policy';
import { getRegimeModifierDetails } from '@/lib/regime-router';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const includeHistory = searchParams.get('history');
    const includeAccuracy = searchParams.get('accuracy') === 'true';
    const includeModifiers = searchParams.get('modifiers') === 'true';
    const includePolicies = searchParams.get('policies') === 'true';

    // Detect current regime
    const result = await detectRegimeIntelligence();

    const response: Record<string, unknown> = {
      regimeState: result.regimeState,
      confidence: result.confidence,
      transitionRisk: result.transitionRisk,
      policy: {
        confidenceFloor: result.policy.confidenceFloor,
        allowLongs: result.policy.allowLongs,
        allowShorts: result.policy.allowShorts,
        noTradeBias: result.policy.noTradeBias,
        scoreMultiplier: result.policy.scoreMultiplier,
        spilloverWeightMultiplier: result.policy.spilloverWeightMultiplier,
        technicalWeightMultiplier: result.policy.technicalWeightMultiplier,
        fundamentalWeightMultiplier: result.policy.fundamentalWeightMultiplier,
        maxPositionSize: result.policy.maxPositionSize,
        stopLossTightening: result.policy.stopLossTightening,
        boostedFactors: result.policy.boostedFactors,
        suppressedFactors: result.policy.suppressedFactors,
      },
      drivers: result.drivers,
      features: {
        spy1d: result.features.spy1d,
        spy5d: result.features.spy5d,
        spy20d: result.features.spy20d,
        spyVsSma200: result.features.spyVsSma200,
        vixLevel: result.features.vixLevel,
        vix1d: result.features.vix1d,
        atrZScore: result.features.atrZScore,
        adxLevel: result.features.adxLevel,
        semisBreadth: result.features.semisBreadth,
        spilloverScore: result.features.spilloverScore,
        spilloverSetup: result.features.spilloverSetup,
        eventRiskScore: result.features.eventRiskScore,
      },
      detectedAt: result.detectedAt,
      processingTimeMs: Date.now() - startTime,
    };

    // Optional: regime history
    if (includeHistory) {
      const days = parseInt(includeHistory, 10) || 30;
      response.history = await getRegimeHistory(days);
    }

    // Optional: per-regime accuracy stats
    if (includeAccuracy) {
      response.accuracyByRegime = await getRegimeAccuracyStats();
    }

    // Optional: modifier details for current regime
    if (includeModifiers) {
      response.modifiers = getRegimeModifierDetails(result.regimeState);
    }

    // Optional: all policies
    if (includePolicies) {
      response.allPolicies = getAllRegimePolicies();
    }

    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[REGIME-CURRENT] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
