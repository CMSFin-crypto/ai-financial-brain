import { NextResponse } from 'next/server';
import { evaluateDuePredictions, postEvaluationUpdate } from '@/lib/evaluation-engine';

export const maxDuration = 120;

export async function POST() {
  try {
    console.log('[LEARNING-EVALUATE] Starting DB-backed evaluation...');

    const evalResult = await evaluateDuePredictions();

    let postResult = { statsUpdated: false, weightsUpdated: 0, lessonsExtracted: 0, attributionStats: [] as any[] };
    if (evalResult.evaluated > 0) {
      postResult = await postEvaluationUpdate();
    }

    return NextResponse.json({
      success: true,
      source: 'db',
      evaluated: evalResult.evaluated,
      correct: evalResult.correct,
      wrong: evalResult.wrong,
      accuracy: evalResult.evaluated > 0
        ? Math.round((evalResult.correct / evalResult.evaluated) * 1000) / 10
        : 0,
      statsUpdated: postResult.statsUpdated,
      weightsUpdated: postResult.weightsUpdated,
      lessonsExtracted: postResult.lessonsExtracted,
      attributionStats: postResult.attributionStats,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[LEARNING-EVALUATE] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { default: prisma } = await import('@/lib/prisma');
    const stats = await prisma.aIStats.findFirst();
    const recentPredictions = await prisma.prediction.findMany({
      where: { wasCorrect: { not: null } },
      orderBy: { evaluatedAt: 'desc' },
      take: 10,
      select: { symbol: true, finalDecision: true, rawScore: true, actualReturn: true, wasCorrect: true, horizonDays: true, evaluatedAt: true },
    });

    return NextResponse.json({
      source: 'db',
      totalPredictions: stats?.totalPredictions ?? 0,
      correctPredictions: stats?.correctPredictions ?? 0,
      overallAccuracy: stats?.avgAccuracy ?? 0,
      streakCorrect: stats?.streakCorrect ?? 0,
      streakWrong: stats?.streakWrong ?? 0,
      accuracy1d: stats?.accuracy1d ?? 0,
      accuracy5d: stats?.accuracy5d ?? 0,
      accuracy20d: stats?.accuracy20d ?? 0,
      recentPredictions,
      learningContext: stats && stats.totalPredictions >= 5
        ? `Saktesia e përgjithshme: ${stats.avgAccuracy}% (${stats.totalPredictions} parashikime). Mësimi bëhet automatikisht nga DB.`
        : 'Nuk ka ende të dhëna të mjaftueshme. Bëj skane për të filluar mësimin.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[LEARNING-EVALUATE] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
