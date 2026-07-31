import { NextRequest, NextResponse } from 'next/server';
import {
  getAllFeatures,
  getFeatureStoreSummary,
  computeVersionHash,
  validateFeatureVector,
  getModelFeatureSet,
} from '@/lib/feature-definitions';
import {
  retrieveSnapshot,
  checkConsistency,
  listRecentSnapshots,
} from '@/lib/feature-store';

export const maxDuration = 30;

// GET /api/features/[symbol]?view=schema|snapshot|consistency
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await params;
    const { searchParams } = new URL(req.url);
    const view = searchParams.get('view') || 'schema';
    const predictionId = searchParams.get('predictionId');

    if (view === 'snapshot' && predictionId) {
      // Retrieve feature snapshot for a specific prediction
      const snapshot = await retrieveSnapshot(predictionId);
      if (!snapshot) {
        return NextResponse.json(
          { error: 'Snapshot not found' },
          { status: 404 },
        );
      }
      return NextResponse.json(snapshot);
    }

    if (view === 'consistency') {
      // Check training/inference consistency
      const refHash = searchParams.get('refHash') || undefined;
      const report = checkConsistency(refHash);
      return NextResponse.json(report);
    }

    if (view === 'recent') {
      // List recent feature snapshots
      const limit = parseInt(searchParams.get('limit') || '20');
      const snapshots = await listRecentSnapshots(limit);
      return NextResponse.json({ snapshots });
    }

    if (view === 'summary') {
      // Feature store summary
      const summary = getFeatureStoreSummary();
      const currentHash = computeVersionHash();
      return NextResponse.json({ ...summary, currentHash });
    }

    // Default: return the full feature schema for the model
    const source = searchParams.get('source') || undefined;
    const features = getAllFeatures(
      source ? { source: source as any, enabledOnly: true } : { enabledOnly: true },
    );
    const modelFeatures = getModelFeatureSet();
    const summary = getFeatureStoreSummary();

    return NextResponse.json({
      features,
      modelFeatures,
      summary,
      versionHash: summary.versionHash,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Features API error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/features/[symbol] — validate a feature vector
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await params;
    const body = await req.json();
    const features = body.features as Record<string, unknown>;

    if (!features || typeof features !== 'object') {
      return NextResponse.json(
        { error: 'Request body must include { features: {...} }' },
        { status: 400 },
      );
    }

    const validation = validateFeatureVector(features);
    const modelFeatures = getModelFeatureSet();
    const provided = new Set(Object.keys(features));
    const missing = modelFeatures.filter(n => !provided.has(n));
    const extra = [...provided].filter(n => !modelFeatures.includes(n));

    return NextResponse.json({
      symbol,
      valid: validation.valid,
      featureErrors: validation.featureErrors,
      versionHash: validation.versionHash,
      modelFeatureCount: modelFeatures.length,
      providedCount: provided.size,
      missingFeatures: missing,
      extraFeatures: extra,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Features validate error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
