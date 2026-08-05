import { NextResponse } from 'next/server';
import { getAllWeights } from '@/lib/model-weights';
import { HORIZON_WEIGHTS } from '@/lib/model-weights';

export async function GET() {
  try {
    const allWeights = await getAllWeights();

    // Build indicator summary from DB weights
    const summary = allWeights.map(w => ({
      name: w.factorName,
      type: w.factorType,
      accuracy: w.accuracy ?? 0,
      totalPredictions: w.sampleSize ?? 0,
      weightMultiplier: Math.round(w.weight * 100) / 100,
      reliability: (w.sampleSize ?? 0) >= 30 ? 'HIGH' : (w.sampleSize ?? 0) >= 10 ? 'MEDIUM' : 'LOW',
    }));

    // Group by type for ranking
    const byType: Record<string, typeof summary> = {};
    for (const s of summary) {
      if (!byType[s.type]) byType[s.type] = [];
      byType[s.type].push(s);
    }

    // Sort each type by accuracy
    for (const type of Object.keys(byType)) {
      byType[type].sort((a, b) => b.accuracy - a.accuracy);
    }

    return NextResponse.json({
      source: 'db',
      totalEvaluated: allWeights.reduce((s, w) => s + (w.sampleSize ?? 0), 0),
      indicators: summary.sort((a, b) => b.accuracy - a.accuracy),
      byType,
      horizonWeights: HORIZON_WEIGHTS,
      hasEnoughData: allWeights.some(w => (w.sampleSize ?? 0) >= 30),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[LEARNING-INDICATORS] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
