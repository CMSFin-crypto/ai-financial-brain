import { NextRequest, NextResponse } from 'next/server';
import { fetchHistoricalData, getRealFundamentals } from '@/lib/alpha-vantage';
import { predictStock } from '@/lib/prediction-engine';
import { analyzeFundamentals } from '@/lib/fundamental-analysis';
import { detectMarketRegime, regimeScore } from '@/lib/market-regime';
import { calculateRelativeStrength } from '@/lib/relative-strength';
import { checkEventRisk } from '@/lib/event-risk';
import { runNoTradeGate } from '@/lib/no-trade-gate';
import { getModelWeights, seedDefaultWeights } from '@/lib/model-weights';
import { calibrateConfidence } from '@/lib/confidence-calibration';
import { savePredictionToDB } from '@/lib/prediction-history';
import { buildTechnicalFactors, buildFundamentalFactors, type FactorInput } from '@/lib/prediction-factors';
import { loadLearningStats } from '@/lib/prediction-history';
import { evaluateDuePredictions } from '@/lib/evaluation-engine';

export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const startTime = Date.now();
  try {
    const { symbol } = await params;
    const ticker = symbol.toUpperCase().trim();

    if (!ticker) {
      return NextResponse.json({ error: 'Simboli është i nevojshëm' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '1y';
    const runEval = searchParams.get('checkLearning') === 'true';

    // 0. Ensure DB is seeded
    await seedDefaultWeights().catch(() => {});

    // 0b. Optionally run evaluation
    if (runEval) {
      try {
        await evaluateDuePredictions();
      } catch (err) {
        console.error('[PREDICT] Evaluation failed:', err);
      }
    }

    // 1. Fetch historical data for technical analysis
    const historicalData = await fetchHistoricalData(ticker, range);
    if (!historicalData || historicalData.length < 60) {
      return NextResponse.json(
        { error: 'Të dhëna të pamjaftueshme historike për predikim' },
        { status: 404 }
      );
    }

    // 2. Run technical analysis (pure computation, no I/O)
    const baseResult = predictStock(ticker, historicalData);

    // 3. Run all modules IN PARALLEL (I/O bound)
    const [regime, relStrength, fundamentals, weightsResult, learningStatsRaw] = await Promise.all([
      detectMarketRegime(),
      calculateRelativeStrength(ticker),
      getRealFundamentals(ticker),
      getModelWeights(1),
      loadLearningStats().catch(() => ({
        totalPredictions: 0,
        checkedPredictions: 0,
        shortTermAccuracy: 50,
        mediumTermAccuracy: 50,
        directionAccuracy: 50,
        indicatorAccuracy: {},
        fundamentalAccuracy: {},
        learningWeights: {},
        fundamentalWeights: {},
        lastUpdated: new Date().toISOString(),
        bestIndicators: [],
        worstIndicators: [],
        averageAbsoluteError: 0,
        recentAccuracy: 50,
      })),
    ]);

    // 4. Fundamental analysis
    let fundamentalScore = 0;
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

    // 5. Event risk check
    const eventRisk = checkEventRisk(ticker);

    // 6. Compute regime score and relative strength adjustment
    const rScore = regimeScore(regime.regime);
    const rsScore = relStrength.rsScore;

    // 7. Build combined score using horizon weights
    const ratios = weightsResult.horizonRatios;
    const techScore = baseResult.technicalScore;
    const combinedScore = Math.round(
      (techScore * ratios.technical +
       fundamentalScore * ratios.fundamental +
       rScore * ratios.event +
       rsScore * 0.05) * 100
    ) / 100;

    // 8. Calibrate confidence
    const rawConfidence = baseResult.confidence;
    const calibratedConfidence = await calibrateConfidence(rawConfidence);

    // 9. Determine direction from combined score
    const direction =
      combinedScore > 60 ? 'STRONG_BUY' : combinedScore > 25 ? 'BUY' :
      combinedScore > -25 ? 'NEUTRAL' : combinedScore > -60 ? 'SELL' : 'STRONG_SELL';

    // 10. Build predicted direction and expected move for 1D, 5D, 20D horizons
    const lastClose = historicalData[historicalData.length - 1].close;
    const expectedMove1d = baseResult.shortTerm.expectedMove;
    const expectedMove5d = baseResult.mediumTerm.expectedMove;
    const predictedDir1d = baseResult.shortTerm.prediction; // UP/DOWN/SIDEWAYS
    const predictedDir5d = baseResult.mediumTerm.prediction;
    const predictedDir20d = combinedScore > 15 ? 'UP' : combinedScore < -15 ? 'DOWN' : 'SIDEWAYS';

    // 11. NO_TRADE gate (for 1D horizon — the actionable one)
    const gateResult = runNoTradeGate({
      confidence: calibratedConfidence,
      combinedScore,
      expectedMovePct: expectedMove1d,
      signal: direction,
      regime,
      eventRisk,
    });

    // 12. Build factors list for DB storage
    const allFactors: FactorInput[] = [];
    // Technical factors from indicator scores
    const techFactors = buildTechnicalFactors(
      baseResult.indicatorScores,
      (Object.keys(learningStatsRaw.learningWeights).length > 0 ? learningStatsRaw.learningWeights : weightsResult.technical)
    );
    allFactors.push(...techFactors);
    // Fundamental factors
    if (fundamentalScores && Object.keys(fundamentalScores).length > 0) {
      const fundFactors = buildFundamentalFactors(
        fundamentalScores,
        (Object.keys(learningStatsRaw.fundamentalWeights).length > 0 ? learningStatsRaw.fundamentalWeights : weightsResult.fundamental)
      );
      allFactors.push(...fundFactors);
    }
    // Regime factor
    allFactors.push({
      factorName: 'market_regime',
      factorType: 'regime',
      score: rScore,
      weight: ratios.event,
      signal: rScore > 0 ? 'BULLISH' : rScore < 0 ? 'BEARISH' : 'NEUTRAL',
      description: `Regimi: ${regime.regime} (konfidencë: ${(regime.confidence * 100).toFixed(0)}%)`,
    });
    // Event risk factor
    allFactors.push({
      factorName: 'event_risk',
      factorType: 'event',
      score: eventRisk.riskScore,
      weight: ratios.event,
      signal: eventRisk.riskScore < -20 ? 'BEARISH' : 'NEUTRAL',
      description: eventRisk.description,
    });
    // Relative strength factor
    allFactors.push({
      factorName: 'relative_strength',
      factorType: 'relative_strength',
      score: rsScore,
      weight: 0.05,
      signal: rsScore > 10 ? 'BULLISH' : rsScore < -10 ? 'BEARISH' : 'NEUTRAL',
      description: `RS vs SPY: ${rsScore > 0 ? '+' : ''}${rsScore.toFixed(1)}`,
    });

    // 13. Save prediction to DB (async, don't block response)
    savePredictionToDB({
      ticker,
      signal: direction,
      confidence: calibratedConfidence,
      combinedScore,
      technicalScore: techScore,
      fundamentalScore,
      regimeScore: rScore,
      eventRiskScore: eventRisk.riskScore,
      horizonDays: 1,
      predictedDir: predictedDir1d,
      predictedMovePct: expectedMove1d,
      entryPrice: lastClose,
      gateStatus: gateResult.status,
      gateReason: gateResult.reason,
      noTradeReason: gateResult.status === 'NO_TRADE' ? gateResult.reason : undefined,
      factors: allFactors,
      snapshot: {
        regime: regime.regime,
        regimeConfidence: regime.confidence,
        spyPrice: regime.spyPrice,
        spyChange5d: regime.spyChange5d,
        spyChange20d: regime.spyChange20d,
      },
    }).catch(err => console.error('[PREDICT] DB save failed:', err));

    // Also save 5D and 20D predictions
    savePredictionToDB({
      ticker,
      signal: direction,
      confidence: calibratedConfidence,
      combinedScore,
      technicalScore: techScore,
      fundamentalScore,
      regimeScore: rScore,
      eventRiskScore: eventRisk.riskScore,
      horizonDays: 5,
      predictedDir: predictedDir5d,
      predictedMovePct: expectedMove5d,
      entryPrice: lastClose,
      gateStatus: gateResult.status,
      gateReason: gateResult.reason,
      factors: allFactors,
      snapshot: {
        regime: regime.regime,
        regimeConfidence: regime.confidence,
        spyPrice: regime.spyPrice,
        spyChange5d: regime.spyChange5d,
        spyChange20d: regime.spyChange20d,
      },
    }).catch(() => {});

    savePredictionToDB({
      ticker,
      signal: direction,
      confidence: calibratedConfidence,
      combinedScore,
      technicalScore: techScore,
      fundamentalScore,
      regimeScore: rScore,
      eventRiskScore: eventRisk.riskScore,
      horizonDays: 20,
      predictedDir: predictedDir20d,
      predictedMovePct: expectedMove5d * 2,
      entryPrice: lastClose,
      gateStatus: gateResult.status,
      gateReason: gateResult.reason,
      factors: allFactors,
      snapshot: {
        regime: regime.regime,
        regimeConfidence: regime.confidence,
        spyPrice: regime.spyPrice,
        spyChange5d: regime.spyChange5d,
        spyChange20d: regime.spyChange20d,
      },
    }).catch(() => {});

    // 14. Build response
    const elapsedMs = Date.now() - startTime;
    console.log(`[PREDICT] ${ticker}: direction=${direction} confidence=${calibratedConfidence} combinedScore=${combinedScore} gate=${gateResult.status} regime=${regime.regime} techScore=${techScore} fundScore=${fundamentalScore} rsScore=${rsScore} factors=${allFactors.length} time=${elapsedMs}ms`);

    const response = {
      ...baseResult,
      score: combinedScore,
      direction,
      confidence: calibratedConfidence,
      combinedScore,
      technicalScore: techScore,
      fundamentalData: fundamentalScore !== 0 ? {
        score: fundamentalScore,
        summary: fundamentalSummary,
        scores: fundamentalScores,
      } : null,
      learningData: learningStatsRaw.totalPredictions > 0 ? {
        totalPredictions: learningStatsRaw.totalPredictions,
        directionAccuracy: learningStatsRaw.directionAccuracy,
        shortTermAccuracy: learningStatsRaw.shortTermAccuracy,
        mediumTermAccuracy: learningStatsRaw.mediumTermAccuracy,
        bestIndicators: learningStatsRaw.bestIndicators,
        worstIndicators: learningStatsRaw.worstIndicators,
        recentAccuracy: learningStatsRaw.recentAccuracy,
      } : null,
      // New fields
      regime: regime.regime,
      regimeConfidence: regime.confidence,
      relativeStrength: relStrength.rsScore,
      eventRisk: {
        type: eventRisk.eventType,
        severity: eventRisk.severity,
        description: eventRisk.description,
      },
      gateStatus: gateResult.status,
      gateReason: gateResult.reason,
      horizons: {
        '1D': { predictedDir: predictedDir1d, expectedMovePct: expectedMove1d },
        '5D': { predictedDir: predictedDir5d, expectedMovePct: expectedMove5d },
        '20D': { predictedDir: predictedDir20d, expectedMovePct: expectedMove5d * 2 },
      },
      modelVersion: '2.0',
      processingTimeMs: elapsedMs,
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[PREDICT] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
