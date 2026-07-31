// ============================================================
// GET /api/regime/current
// Returns current regime state, policy, transition risk, drivers.
// ?history=30 &accuracy=true &modifiers=true &policies=true
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { detectRegimeState, getRegimeHistory, getRegimeAccuracyStats } from '@/lib/regime-intelligence';
import { getAllPolicies, getRegimePolicy } from '@/lib/regime-policy';
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

    const result = await detectRegimeState({});
    const policy = getRegimePolicy(result.regime);

    const response: Record<string, unknown> = {
      regime: result.regime,
      confidence: result.confidence,
      transitionRisk: result.transitionRisk,
      reasons: result.reasons,
      drivers: result.drivers,
      modelVersion: result.modelVersion,
      policy: {
        confidenceFloor: policy.confidenceFloor,
        allowLongs: policy.allowLongs,
        allowShorts: policy.allowShorts,
        noTradeBias: policy.noTradeBias,
        scoreMultiplier: policy.scoreMultiplier,
        spilloverWeightMultiplier: policy.spilloverWeightMultiplier,
        technicalWeightMultiplier: policy.technicalWeightMultiplier,
        fundamentalWeightMultiplier: policy.fundamentalWeightMultiplier,
      },
      processingTimeMs: Date.now() - startTime,
    };

    if (includeHistory) {
      const days = parseInt(includeHistory, 10) || 30;
      response.history = await getRegimeHistory(days);
    }
    if (includeAccuracy) {
      response.accuracyByRegime = await getRegimeAccuracyStats();
    }
    if (includeModifiers) {
      response.modifiers = getRegimeModifierDetails(result.regime);
    }
    if (includePolicies) {
      response.allPolicies = getAllPolicies();
    }

    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[REGIME-CURRENT] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
