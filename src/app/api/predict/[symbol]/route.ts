import { NextRequest, NextResponse } from 'next/server';
import { fetchHistoricalData, getRealFundamentals } from '@/lib/alpha-vantage';
import { predictStock, predictStockEnhanced } from '@/lib/prediction-engine';
import { analyzeFundamentals } from '@/lib/fundamental-analysis';
import { addPrediction, loadLearningStats } from '@/lib/prediction-history';
import { checkPredictionOutcomes } from '@/lib/learning-engine';

export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const ticker = symbol.toUpperCase().trim();

    if (!ticker) {
      return NextResponse.json({ error: 'Simboli është i nevojshëm' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '1y';
    const checkLearning = searchParams.get('checkLearning') === 'true';

    // Periodically check prediction outcomes (feedback loop)
    if (checkLearning) {
      try {
        await checkPredictionOutcomes();
      } catch (err) {
        console.error('[PREDICT] Learning check failed:', err);
      }
    }

    // Fetch historical data for technical analysis
    const historicalData = await fetchHistoricalData(ticker, range);

    if (!historicalData || historicalData.length < 60) {
      return NextResponse.json(
        { error: 'Të dhëna të pamjaftueshme historike për predikim' },
        { status: 404 }
      );
    }

    // Run technical analysis
    const baseResult = predictStock(ticker, historicalData);

    // Fetch fundamental data (in parallel with learning stats)
    const [fundamentals, learningStats] = await Promise.all([
      getRealFundamentals(ticker),
      Promise.resolve(loadLearningStats()),
    ]);

    // Analyze fundamentals if available
    let fundamentalScore: number | null = null;
    let fundamentalSummary = '';
    let fundamentalScores: Record<string, number> = {};

    if (fundamentals) {
      const fundResult = analyzeFundamentals(ticker, fundamentals);
      fundamentalScore = fundResult.totalScore;
      fundamentalSummary = fundResult.summary;
      fundamentalScores = {
        valuation: fundResult.scores.valuation.score,
        growth: fundResult.scores.growth.score,
        profitability: fundResult.scores.profitability.score,
        analystSentiment: fundResult.scores.analystSentiment.score,
        debtHealth: fundResult.scores.debtHealth.score,
        momentum: fundResult.scores.momentum.score,
      };
    }

    // Enhanced prediction combining technical + fundamental
    const result = predictStockEnhanced(baseResult, {
      fundamentalScore,
      fundamentalSummary,
      fundamentalScores,
      learningStats: learningStats.totalPredictions > 0 ? {
        totalPredictions: learningStats.totalPredictions,
        directionAccuracy: learningStats.directionAccuracy,
        shortTermAccuracy: learningStats.shortTermAccuracy,
        mediumTermAccuracy: learningStats.mediumTermAccuracy,
        bestIndicators: learningStats.bestIndicators,
        worstIndicators: learningStats.worstIndicators,
        recentAccuracy: learningStats.recentAccuracy,
      } : null,
    });

    // Store prediction for learning loop
    try {
      const lastClose = historicalData[historicalData.length - 1].close;
      addPrediction({
        symbol: ticker,
        timestamp: result.timestamp,
        predictedDirection: result.direction === 'STRONG_BUY' || result.direction === 'BUY' ? 'UP'
          : result.direction === 'STRONG_SELL' || result.direction === 'SELL' ? 'DOWN' : 'SIDEWAYS',
        predictedScore: result.score,
        predictedShortTerm: result.shortTerm,
        predictedMediumTerm: result.mediumTerm,
        technicalScore: result.technicalScore,
        fundamentalScore: fundamentalScore ?? 0,
        indicatorScores: result.indicatorScores,
        fundamentalScores,
        closePriceAtPrediction: lastClose,
      });
    } catch (err) {
      console.error('[PREDICT] Failed to store prediction:', err);
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[PREDICT] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}