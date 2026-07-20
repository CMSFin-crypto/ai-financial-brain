import { NextResponse } from 'next/server';
import { getIndicatorRanking, getStats } from '@/lib/indicator-learning';

export async function GET() {
  try {
    const ranking = getIndicatorRanking();
    const stats = getStats();

    // Build a clear picture of which indicators work best
    const allIndicators = [...ranking.technical, ...ranking.fundamental];

    const summary = allIndicators.map(ind => ({
      name: ind.description,
      type: ind.type,
      accuracy: Math.round(ind.accuracy * 1000) / 10,
      totalPredictions: ind.totalPredictions,
      correctPredictions: ind.correctPredictions,
      weightMultiplier: Math.round(ind.weight * 100) / 100,
      avgScoreWhenCorrect: ind.avgScoreWhenCorrect,
      avgScoreWhenWrong: ind.avgScoreWhenWrong,
      reliability: ind.totalPredictions >= 10 ? 'HIGH' : ind.totalPredictions >= 5 ? 'MEDIUM' : 'LOW',
    }));

    // Sort by accuracy
    summary.sort((a, b) => b.accuracy - a.accuracy);

    // Weight multipliers
    const weightMultipliers = stats.weightMultipliers;

    return NextResponse.json({
      totalEvaluated: stats.totalEvaluated,
      overallAccuracy: Math.round(stats.overallAccuracy * 1000) / 10,
      indicators: summary,
      weightMultipliers,
      hasEnoughData: stats.totalEvaluated >= 5,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[LEARNING-INDICATORS] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}