import { NextResponse } from 'next/server';
import { evaluateDuePredictions } from '@/lib/evaluation-engine';
import { seedDefaultWeights } from '@/lib/model-weights';

export const maxDuration = 120;

export async function POST() {
  try {
    await seedDefaultWeights().catch(() => {});

    console.log('[AI-LEARNING/EVALUATE] Starting evaluation...');
    const result = await evaluateDuePredictions();

    return NextResponse.json({
      success: true,
      evaluated: result.evaluated,
      correct: result.correct,
      wrong: result.wrong,
      accuracy: result.evaluated > 0
        ? Math.round((result.correct / result.evaluated) * 1000) / 10
        : 0,
      weightsUpdated: result.weightsUpdated,
      details: result.details.slice(0, 50),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[AI-LEARNING/EVALUATE] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  // GET triggers evaluation too (for convenience)
  return POST();
}
