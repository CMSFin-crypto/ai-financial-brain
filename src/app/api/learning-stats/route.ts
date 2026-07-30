import { NextRequest, NextResponse } from 'next/server';
import { checkPredictionOutcomes, getLearningStats, getRecentPredictions, getRecentLessons } from '@/lib/learning-engine';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const check = searchParams.get('check') === 'true';

    let checkResult: { evaluated: number; correct: number; wrong: number; weightsUpdated: number } | null = null;
    if (check) {
      checkResult = await checkPredictionOutcomes();
    }

    const [stats, recentPreds, lessons] = await Promise.all([
      getLearningStats(),
      getRecentPredictions(20),
      getRecentLessons(10),
    ]);

    return NextResponse.json({
      ...stats,
      recentPredictions: recentPreds,
      recentLessons: lessons,
      checkResult,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[LEARNING-STATS] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
