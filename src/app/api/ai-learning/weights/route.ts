import { NextResponse } from 'next/server';
import { getAllWeights, seedDefaultWeights } from '@/lib/model-weights';

export const maxDuration = 30;

export async function GET() {
  try {
    await seedDefaultWeights().catch(() => {});
    const weights = await getAllWeights();

    // Group by type
    const technical = weights.filter(w => w.factorType === 'technical');
    const fundamental = weights.filter(w => w.factorType === 'fundamental');

    // Summary stats
    const techSum = technical.reduce((s, w) => s + w.weight, 0);
    const fundSum = fundamental.reduce((s, w) => s + w.weight, 0);
    const withEnoughData = weights.filter(w => w.sampleSize >= w.minSample);

    return NextResponse.json({
      technical: technical.map(w => ({
        factor: w.factorName,
        weight: w.weight,
        accuracy: w.accuracy,
        sampleSize: w.sampleSize,
        minSample: w.minSample,
        isLearned: w.sampleSize >= w.minSample,
      })),
      fundamental: fundamental.map(w => ({
        factor: w.factorName,
        weight: w.weight,
        accuracy: w.accuracy,
        sampleSize: w.sampleSize,
        minSample: w.minSample,
        isLearned: w.sampleSize >= w.minSample,
      })),
      summary: {
        technicalSum: Math.round(techSum * 1000) / 1000,
        fundamentalSum: Math.round(fundSum * 1000) / 1000,
        totalFactors: weights.length,
        learnedFactors: withEnoughData.length,
        defaultFactors: weights.length - withEnoughData.length,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[AI-LEARNING/WEIGHTS] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
