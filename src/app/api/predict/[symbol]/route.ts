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
import { analyzeGlobalSpillover, type SpilloverAnalysis } from '@/lib/global-spillover';
import { runV2ShadowPrediction, getActiveModel } from '@/lib/spillover-promotion';
import { detectRegimeState, getRegimeWithPolicy, type RegimeIntelligence, type MarketRegimeState } from '@/lib/regime-intelligence';
import { routeByRegime } from '@/lib/regime-router';

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
    const [regime, relStrength, fundamentals, weightsResult, learningStatsRaw, spilloverRaw] = await Promise.all([
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
      analyzeGlobalSpillover(ticker).catch((err) => {
        console.error('[PREDICT] Spillover analysis failed:', err);
        return {
          setupType: 'NEUTRAL' as const,
          spilloverScore: 0,
          confidence: 0,
          reasons: ['Spillover analysis failed'] as string[],
          drivers: { kospi1d: 0, kospi2d: 0, kospi5d: 0, smh1d: 0, smh2d: 0, vix1d: 0, qqq1d: 0 },
          features: {
            kospi1d: 0, kospi2d: 0, kospi5d: 0, nikkei1d: 0, hsi1d: 0,
            smh1d: 0, smh2d: 0, qqq1d: 0, vix1d: 0,
            target1d: 0, target2d: 0, targetDistanceFromSma20: 0, targetAtrZ: 0,
            semisBreadth: 0.5, asiaDeceleration: 0, oversoldScore: 0,
          },
          modelVersion: 'spillover-v1' as const,
        };
      }),
    ]);

    const spillover = spilloverRaw!;

    // 3b. V2 Shadow Mode: check active model, run V2 shadow for semis/tech
    const isSemiOrTech = ['NVDA', 'AMD', 'MU', 'MRVL', 'WDC', 'SNDK', 'INTC', 'TSM', 'AVGO', 'QCOM', 'SMH', 'SOXX', 'QQQ'].includes(ticker);
    const activeModel = await getActiveModel();
    if (isSemiOrTech && spillover.features) {
      runV2ShadowPrediction(ticker, spillover.features).catch(() => {});
    }

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

    // 5b. REGIME INTELLIGENCE — the orchestrator layer
    const regimeResult = await getRegimeWithPolicy({ targetSymbol: ticker });
    const regimeIntel = regimeResult;
    const regimePolicy = regimeResult.policy;
    console.log(`[PREDICT] ${ticker}: regime=${regimeIntel.regime} (conf=${(regimeIntel.confidence * 100).toFixed(0)}%) floor=${regimePolicy.confidenceFloor})`);

    // 6. Compute regime score and relative strength adjustment
    const rScore = regimeScore(regime.regime);
    const rsScore = relStrength.rsScore;

    // 7. Global spillover factor — weight from REGIME POLICY
    const spilloverScore = spillover.spilloverScore;
    const spilloverWeight = isSemiOrTech ? 0.10 : 0.03;
    const regimeSpilloverWeight = spilloverWeight * regimePolicy.spilloverWeightMultiplier;

    // 8. Build combined score (before regime routing)
    const ratios = weightsResult.horizonRatios;
    const techScore = baseResult.technicalScore;
    const preRegimeScore = Math.round(
      (techScore * ratios.technical +
       fundamentalScore * ratios.fundamental +
       rScore * ratios.event +
       rsScore * 0.05 +
       spilloverScore * regimeSpilloverWeight) * 100
    ) / 100;

    // 9. REGIME ROUTING — adjust score and confidence per regime
    const direction = preRegimeScore > 60 ? 'STRONG_BUY' : preRegimeScore > 25 ? 'BUY' :
      preRegimeScore > -25 ? 'HOLD' : preRegimeScore > -60 ? 'SELL' : 'STRONG_SELL';

    const routingResult = routeByRegime({
      regime: regimeIntel.regime,
      policy: regimePolicy,
      baseWeights: weightsResult.technical,
      rawScore: preRegimeScore,
      rawConfidence: baseResult.confidence,
      signal: direction as 'BUY' | 'SELL' | 'HOLD',
    });

    const combinedScore = routingResult.adjustedScore;
    const rawConfidence = baseResult.confidence;
    const calibratedConfidence = routingResult.adjustedConfidence;

    // 10. Build predicted direction and expected move for 1D, 5D, 20D horizons
    const lastClose = historicalData[historicalData.length - 1].close;
    const expectedMove1d = baseResult.shortTerm.expectedMove;
    const expectedMove5d = baseResult.mediumTerm.expectedMove;
    const predictedDir1d = baseResult.shortTerm.prediction; // UP/DOWN/SIDEWAYS
    const predictedDir5d = baseResult.mediumTerm.prediction;
    const predictedDir20d = combinedScore > 15 ? 'UP' : combinedScore < -15 ? 'DOWN' : 'SIDEWAYS';

    // 12. NO_TRADE gate — REGIME AWARE
    const gateResult = routingResult.blockedReason
      ? { status: 'NO_TRADE' as const, reason: routingResult.blockedReason }
      : runNoTradeGate({
          confidence: calibratedConfidence,
          combinedScore,
          expectedMovePct: expectedMove1d,
          signal: direction,
          regime,
          eventRisk,
          spillover,
          regimePolicy,
        });

    // 12. Build factors list for DB storage
    const allFactors: FactorInput[] = [];
    const techFactors = buildTechnicalFactors(
      baseResult.indicatorScores,
      (Object.keys(learningStatsRaw.learningWeights).length > 0 ? learningStatsRaw.learningWeights : routingResult.weights)
    );
    allFactors.push(...techFactors);
    // Fundamental factors (policy-adjusted weights)
    const fundWeightMultiplier = regimePolicy.fundamentalWeightMultiplier;
    if (fundamentalScores && Object.keys(fundamentalScores).length > 0) {
      const adjustedFundWeights: Record<string, number> = {};
      for (const [k, v] of Object.entries(weightsResult.fundamental)) {
        adjustedFundWeights[k] = v * fundWeightMultiplier;
      }
      const fundFactors = buildFundamentalFactors(
        fundamentalScores,
        (Object.keys(learningStatsRaw.fundamentalWeights).length > 0 ? learningStatsRaw.fundamentalWeights : adjustedFundWeights)
      );
      allFactors.push(...fundFactors);
    }
    // Regime Intelligence factor
    allFactors.push({
      factorName: 'regime_intelligence',
      factorType: 'regime',
      score: regimePolicy.scoreMultiplier > 1 ? 30 : regimePolicy.scoreMultiplier < 1 ? -30 : 0,
      weight: 0.08,
      signal: regimeIntel.regime === 'BULL_LOW_VOL' || regimeIntel.regime === 'BULL_HIGH_VOL' || regimeIntel.regime === 'RELIEF_RALLY' ? 'BULLISH'
        : regimeIntel.regime === 'BEAR_HIGH_VOL' || regimeIntel.regime === 'BEAR_LOW_VOL' || regimeIntel.regime === 'PANIC_CAPITULATION' ? 'BEARISH' : 'NEUTRAL',
      description: `Regjimi: ${regimeIntel.regime} (conf=${(regimeIntel.confidence * 100).toFixed(0)}%, transRisk=${(regimeIntel.transitionRisk * 100).toFixed(0)}%)`,
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
    // Global spillover factor
    allFactors.push({
      factorName: 'global_spillover',
      factorType: 'macro_global',
      score: spilloverScore,
      weight: spilloverWeight,
      signal: spilloverScore > 0 ? 'BULLISH' : spilloverScore < 0 ? 'BEARISH' : 'NEUTRAL',
      description: `${spillover.setupType} (score=${spilloverScore}, conf=${(spillover.confidence * 100).toFixed(0)}%) — ${(spillover.reasons || []).slice(0, 2).join('; ')}`,
    });

    // 13. Save prediction to DB with REGIME STATE
    const predictionExtras = {
      regimeState: regimeIntel.regime,
      regimeConfidence: regimeIntel.confidence,
      regimePolicy: regimePolicy as unknown as Record<string, unknown>,
    };
    savePredictionToDB({
      ticker, signal: direction, confidence: calibratedConfidence, combinedScore,
      technicalScore: techScore, fundamentalScore, regimeScore: rScore, eventRiskScore: eventRisk.riskScore,
      horizonDays: 1, predictedDir: predictedDir1d, predictedMovePct: expectedMove1d, entryPrice: lastClose,
      gateStatus: gateResult.status, gateReason: gateResult.reason,
      noTradeReason: gateResult.status === 'NO_TRADE' ? gateResult.reason : undefined,
      factors: allFactors, snapshot: {
        regime: regime.regime, regimeConfidence: regime.confidence, spyPrice: regime.spyPrice,
        spyChange5d: regime.spyChange5d, spyChange20d: regime.spyChange20d,
      }, ...predictionExtras,
    }).catch(err => console.error('[PREDICT] DB save failed:', err));

    savePredictionToDB({
      ticker, signal: direction, confidence: calibratedConfidence, combinedScore,
      technicalScore: techScore, fundamentalScore, regimeScore: rScore, eventRiskScore: eventRisk.riskScore,
      horizonDays: 5, predictedDir: predictedDir5d, predictedMovePct: expectedMove5d, entryPrice: lastClose,
      gateStatus: gateResult.status, gateReason: gateResult.reason, factors: allFactors, snapshot: {
        regime: regime.regime, regimeConfidence: regime.confidence, spyPrice: regime.spyPrice,
        spyChange5d: regime.spyChange5d, spyChange20d: regime.spyChange20d,
      }, ...predictionExtras,
    }).catch(() => {});

    savePredictionToDB({
      ticker, signal: direction, confidence: calibratedConfidence, combinedScore,
      technicalScore: techScore, fundamentalScore, regimeScore: rScore, eventRiskScore: eventRisk.riskScore,
      horizonDays: 20, predictedDir: predictedDir20d, predictedMovePct: expectedMove5d * 2, entryPrice: lastClose,
      gateStatus: gateResult.status, gateReason: gateResult.reason, factors: allFactors, snapshot: {
        regime: regime.regime, regimeConfidence: regime.confidence, spyPrice: regime.spyPrice,
        spyChange5d: regime.spyChange5d, spyChange20d: regime.spyChange20d,
      }, ...predictionExtras,
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
      spillover: {
        setupType: spillover.setupType,
        spilloverScore: spillover.spilloverScore,
        confidence: spillover.confidence,
        reasons: spillover.reasons,
        drivers: spillover.drivers,
        modelVersion: spillover.modelVersion,
      },
      spilloverModelConfig: {
        activeModel,
        v2Status: activeModel === 'spillover-v1' ? 'shadow' : 'active',
        v2Promotion: 'V2 must win 2/3 metrics (precision, Brier, return) with 50+ OOS samples',
        v2ShadowResultsSavedToDB: isSemiOrTech,
      },
      regimeIntelligence: {
        regime: regimeIntel.regime,
        confidence: regimeIntel.confidence,
        transitionRisk: regimeIntel.transitionRisk,
        reasons: regimeIntel.reasons,
        policy: {
          confidenceFloor: regimePolicy.confidenceFloor,
          allowLongs: regimePolicy.allowLongs,
          allowShorts: regimePolicy.allowShorts,
          noTradeBias: regimePolicy.noTradeBias,
          scoreMultiplier: regimePolicy.scoreMultiplier,
        },
        drivers: regimeIntel.drivers,
      },
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
