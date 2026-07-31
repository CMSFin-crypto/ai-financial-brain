import { NextRequest, NextResponse } from 'next/server';
import {
  createModelRelease,
  getActiveModelRelease,
  getModelReleaseHistory,
  approveModelRelease,
  deployModelRelease,
  rollbackModelRelease,
} from '@/lib/model-card';

/**
 * GET /api/model-release?version=predict-v3&limit=10
 * Returns active release or history for a version.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const version = url.searchParams.get('version');
    const limit = Number(url.searchParams.get('limit') ?? '10');
    const active = url.searchParams.get('active');

    if (active === 'true' || !version) {
      const activeRelease = await getActiveModelRelease();
      return NextResponse.json({ active: activeRelease });
    }

    const history = await getModelReleaseHistory(version, limit);
    return NextResponse.json({ version, releases: history });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[MODEL-RELEASE] GET Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/model-release
 * Create a new model release (PENDING status).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { modelVersion, releaseType, description, features, approvedBy } = body;

    if (!modelVersion || !description) {
      return NextResponse.json(
        { error: 'modelVersion and description are required' },
        { status: 400 },
      );
    }

    const release = await createModelRelease({
      modelVersion,
      releaseType: releaseType || 'MINOR',
      description,
      features: features || [],
      trainingWindowFrom: body.trainingWindowFrom ? new Date(body.trainingWindowFrom) : undefined,
      trainingWindowTo: body.trainingWindowTo ? new Date(body.trainingWindowTo) : undefined,
      validationSummary: body.validationSummary,
      driftStatus: body.driftStatus,
      robustnessScore: body.robustnessScore,
      walkForwardConsistency: body.walkForwardConsistency,
      overfittingSeverity: body.overfittingSeverity,
      sampleSize: body.sampleSize,
      knownLimitations: body.knownLimitations,
      breakingChanges: body.breakingChanges,
      approvedBy: approvedBy || undefined,
    });

    return NextResponse.json({ id: release.id, status: release.approvalStatus });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[MODEL-RELEASE] POST Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
