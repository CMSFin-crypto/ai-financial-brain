import { NextResponse } from 'next/server';
import { evaluatePredictions, getStats, forceSave } from '@/lib/indicator-learning';

export const maxDuration = 120;

export async function POST() {
  try {
    console.log('[LEARNING-EVALUATE] Starting evaluation...');

    const result = await evaluatePredictions();
    const stats = getStats();

    // Force save after evaluation
    forceSave();

    return NextResponse.json({
      success: true,
      evaluated: result.evaluated,
      correct: result.correct,
      accuracy: result.evaluated > 0 ? Math.round((result.correct / result.evaluated) * 1000) / 10 : 0,
      newLessons: result.newLessons,
      totalRecorded: stats.totalRecorded,
      totalEvaluated: stats.totalEvaluated,
      overallAccuracy: Math.round(stats.overallAccuracy * 1000) / 10,
      indicatorCount: Object.keys(stats.indicatorAccuracies).length,
      lessonCount: stats.lessons.length,
      weightMultipliers: stats.weightMultipliers,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[LEARNING-EVALUATE] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  // GET returns current stats (same as /stats but with learning context)
  try {
    const { getLearningContext } = await import('@/lib/indicator-learning');
    const stats = getStats();
    const learningContext = getLearningContext();

    return NextResponse.json({
      ...stats,
      overallAccuracyPercent: Math.round(stats.overallAccuracy * 1000) / 10,
      learningContext: learningContext || 'Nuk ka ende të dhëna të mjaftueshme për mësim. Bëj skane të shumta për të filluar mësimin.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}