import { NextResponse } from 'next/server';
import { getStats, getIndicatorRanking, getRecentPredictions } from '@/lib/indicator-learning';

export async function GET() {
  try {
    const stats = getStats();
    const ranking = getIndicatorRanking();
    const recent = getRecentPredictions(30);

    // Format recent predictions for display
    const recentFormatted = recent.map(r => ({
      ticker: r.ticker,
      timestamp: r.timestamp,
      direction: r.direction,
      totalScore: r.totalScore,
      confidence: r.confidence,
      priceAtPrediction: r.priceAtPrediction,
      actualPrice: r.actualPrice,
      actualChangePercent: r.actualChangePercent,
      wasCorrect: r.wasCorrect,
      evaluated: !!r.evaluatedAt,
      topWrongIndicators: r.perIndicatorCorrect
        ? Object.entries(r.perIndicatorCorrect)
            .filter(([_, correct]) => !correct)
            .map(([ind]) => ind)
            .slice(0, 3)
        : [],
    }));

    return NextResponse.json({
      ...stats,
      overallAccuracyPercent: Math.round(stats.overallAccuracy * 1000) / 10,
      indicatorRanking: ranking,
      recentPredictions: recentFormatted,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[LEARNING-STATS] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}