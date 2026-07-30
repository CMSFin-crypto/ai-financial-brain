import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const limit = parseInt(searchParams.get('limit') || '50');

    if (symbol) {
      const preds = await prisma.prediction.findMany({
        where: { ticker: symbol.toUpperCase() },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          ticker: true, signal: true, confidence: true,
          combinedScore: true, horizonDays: true, predictedDir: true,
          entryPrice: true, actualPrice: true, returnPct: true,
          benchmarkReturnPct: true, wasCorrect: true, gateStatus: true,
          createdAt: true, dueAt: true, evaluatedAt: true,
        },
      });
      return NextResponse.json({ total: preds.length, predictions: preds });
    }

    const preds = await prisma.prediction.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        ticker: true, signal: true, confidence: true,
        combinedScore: true, horizonDays: true, predictedDir: true,
        entryPrice: true, actualPrice: true, returnPct: true,
        benchmarkReturnPct: true, wasCorrect: true, gateStatus: true,
        createdAt: true, dueAt: true, evaluatedAt: true,
      },
    });

    return NextResponse.json({ total: preds.length, predictions: preds });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[PREDICTION-HISTORY] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
