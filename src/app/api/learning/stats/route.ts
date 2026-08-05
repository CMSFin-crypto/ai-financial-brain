import { NextResponse } from 'next/server';
import { getAllWeights } from '@/lib/model-weights';

export async function GET() {
  try {
    const { default: prisma } = await import('@/lib/prisma');

    // DB-backed stats
    const stats = await prisma.aIStats.findFirst();
    const totalPreds = stats?.totalPredictions ?? 0;
    const accuracy = stats?.avgAccuracy ?? 0;

    // Recent predictions from DB
    const recentPredictions = await prisma.prediction.findMany({
      where: { wasCorrect: { not: null } },
      orderBy: { evaluatedAt: 'desc' },
      take: 30,
      select: {
        symbol: true, finalDecision: true, rawScore: true,
        actualReturn: true, wasCorrect: true, horizonDays: true,
        evaluatedAt: true, regime: true,
        factors: { select: { factorName: true, factorType: true, score: true, signal: true } },
      },
    });

    // Factor weights from DB
    const allWeights = await getAllWeights();
    const indicatorRanking = allWeights.map(w => ({
      name: w.factorName,
      type: w.factorType,
      accuracy: w.accuracy ?? 0,
      totalPredictions: w.sampleSize ?? 0,
      weightMultiplier: w.weight,
      reliability: (w.sampleSize ?? 0) >= 30 ? 'HIGH' : (w.sampleSize ?? 0) >= 10 ? 'MEDIUM' : 'LOW',
    }));

    // Recent formatted
    const recentFormatted = recentPredictions.map(p => {
      const wrongFactors = p.factors.filter(f => {
        const factorBullish = f.score > 0;
        const actualDown = (p.actualReturn ?? 0) < -0.1;
        const actualUp = (p.actualReturn ?? 0) > 0.1;
        return (factorBullish && actualDown) || (!factorBullish && actualUp);
      });
      return {
        ticker: p.symbol,
        timestamp: p.evaluatedAt?.toISOString(),
        direction: p.finalDecision,
        totalScore: p.rawScore,
        actualChangePercent: p.actualReturn,
        wasCorrect: p.wasCorrect,
        regime: p.regime,
        topWrongIndicators: wrongFactors.map(f => f.factorName).slice(0, 3),
      };
    });

    return NextResponse.json({
      source: 'db',
      totalPredictions: totalPreds,
      totalEvaluated: recentPredictions.length > 0 ? totalPreds : 0,
      overallAccuracy: accuracy,
      overallAccuracyPercent: accuracy,
      indicatorRanking,
      recentPredictions: recentFormatted,
      hasEnoughData: totalPreds >= 5,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[LEARNING-STATS] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
