import { NextRequest, NextResponse } from 'next/server';
import { loadHistory } from '@/lib/prediction-history';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');

    if (symbol) {
      const history = loadHistory();
      const symbolPreds = history.filter(p => p.symbol === symbol.toUpperCase());
      const checked = symbolPreds.filter(p => p.checkedAt);
      const dirCorrect = checked.filter(p => {
        const actualUp = (p.priceChange5Days ?? p.priceChange1Day ?? 0) > 0;
        return (p.predictedScore > 0) === actualUp;
      }).length;
      return NextResponse.json({
        total: symbolPreds.length,
        checked: checked.length,
        directionAccuracy: checked.length > 0 ? Math.round((dirCorrect / checked.length) * 100) : 0,
        recentPredictions: symbolPreds.slice(-10),
      });
    }

    const history = loadHistory();
    const recent = history.slice(-50).reverse();

    return NextResponse.json({
      total: history.length,
      recent: recent.map(p => ({
        symbol: p.symbol,
        timestamp: p.timestamp,
        predictedScore: p.predictedScore,
        predictedDirection: p.predictedDirection,
        closePriceAtPrediction: p.closePriceAtPrediction,
        actualPriceAfter1Day: p.actualPriceAfter1Day,
        actualPriceAfter5Days: p.actualPriceAfter5Days,
        shortTermCorrect: p.shortTermCorrect,
        mediumTermCorrect: p.mediumTermCorrect,
        priceChange1Day: p.priceChange1Day,
        priceChange5Days: p.priceChange5Days,
        checkedAt: p.checkedAt,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[PREDICTION-HISTORY] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}