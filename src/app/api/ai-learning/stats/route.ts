import { NextResponse } from 'next/server';
import { getLearningStats, getRecentLessons, getRecentPredictions } from '@/lib/learning-engine';
import { getCalibrationBuckets } from '@/lib/confidence-calibration';
import { seedDefaultWeights } from '@/lib/model-weights';

export const maxDuration = 30;

export async function GET() {
  try {
    await seedDefaultWeights().catch(() => {});

    const [stats, lessons, recentPreds, buckets] = await Promise.all([
      getLearningStats(),
      getRecentLessons(10),
      getRecentPredictions(20),
      getCalibrationBuckets(),
    ]);

    return NextResponse.json({
      ...stats,
      lessons,
      recentPredictions: recentPreds,
      calibrationBuckets: buckets.map(b => ({
        range: `${b.minConf}-${b.maxConf}`,
        total: b.total,
        correct: b.correct,
        accuracy: b.accuracy,
        calibrated: b.total >= 10,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[AI-LEARNING/STATS] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
