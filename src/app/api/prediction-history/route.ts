import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const limit = parseInt(searchParams.get('limit') || '50');

    const selectFields = {
      symbol: true, finalDecision: true, calibratedConfidence: true,
      rawScore: true, horizonDays: true,
      entryPrice: true, actualPrice: true, actualReturn: true,
      benchmarkReturn: true, excessReturn: true, wasCorrect: true,
      evaluationStatus: true, regime: true, regimeConfidence: true,
      predictedAt: true, dueAt: true, evaluatedAt: true,
    };

    if (symbol) {
      const preds = await prisma.prediction.findMany({
        where: { symbol: symbol.toUpperCase() },
        orderBy: { predictedAt: 'desc' },
        take: limit,
        select: selectFields,
      });
      return NextResponse.json({ total: preds.length, predictions: preds });
    }

    const preds = await prisma.prediction.findMany({
      orderBy: { predictedAt: 'desc' },
      take: limit,
      select: selectFields,
    });

    return NextResponse.json({ total: preds.length, predictions: preds });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[PREDICTION-HISTORY] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
