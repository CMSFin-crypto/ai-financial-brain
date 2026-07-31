// ============================================================
// GET  /api/model-promotion
//   ?candidate=<version> &incumbent=<version> &horizonDays=<n>
//   Returns promotion evaluation with all gate results.
//
// GET  /api/model-promotion?versions=true
//   Lists all available model versions in the DB.
//
// GET  /api/model-promotion?active=true
//   Returns the currently active model version.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  evaluatePromotion,
  getActiveModelVersion,
  getAvailableModelVersions,
  setActiveModelVersion,
} from '@/lib/model-promotion';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const active = searchParams.get('active') === 'true';
    const versions = searchParams.get('versions') === 'true';
    const candidate = searchParams.get('candidate');

    if (active) {
      const activeModel = getActiveModelVersion();
      return NextResponse.json({ type: 'active_model', ...activeModel });
    }

    if (versions) {
      const allVersions = await getAvailableModelVersions();
      const activeModel = getActiveModelVersion();
      return NextResponse.json({
        type: 'model_versions',
        activeVersion: activeModel.version,
        versions: allVersions,
      });
    }

    if (candidate) {
      const incumbent = searchParams.get('incumbent') || undefined;
      const horizonDays = searchParams.get('horizonDays') ? parseInt(searchParams.get('horizonDays')!) : undefined;

      const evaluation = await evaluatePromotion(candidate, incumbent, horizonDays);
      return NextResponse.json({ type: 'promotion_evaluation', ...evaluation });
    }

    // Default: show active + list versions
    const [activeModel, allVersions] = await Promise.all([
      Promise.resolve(getActiveModelVersion()),
      getAvailableModelVersions(),
    ]);

    return NextResponse.json({
      type: 'promotion_overview',
      active: activeModel,
      availableVersions: allVersions,
      promotionEndpoint: '/api/model-promotion?candidate=<version>&incumbent=<version>',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[MODEL-PROMOTION-API]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
