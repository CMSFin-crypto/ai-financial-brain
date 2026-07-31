import { NextRequest, NextResponse } from 'next/server';
import { fetchHistoricalData, getRealFundamentals } from '@/lib/alpha-vantage';
import { predictStock } from '@/lib/prediction-engine';
import { analyzeFundamentals } from '@/lib/fundamental-analysis';
import { calculateRelativeStrength } from '@/lib/relative-strength';
import { checkEventRisk } from '@/lib/event-risk';
import { runNoTradeGate } from '@/lib/no-trade-gate';
import { getModelWeights, seedDefaultWeights } from '@/lib/model-weights';
import { savePrediction } from '@/lib/save-prediction';
import { buildTechnicalFactors, buildFundamentalFactors, type FactorInput } from '@/lib/prediction-factors';
import { loadLearningStats } from '@/lib/prediction-history';
import { evaluateDuePredictions } from '@/lib/evaluation-engine';
import { analyzeGlobalSpillover, type SpilloverAnalysis } from '@/lib/global-spillover';
import { runV2ShadowPrediction, getActiveModel } from '@/lib/spillover-promotion';
import { getRegimeWithPolicy, type RegimeIntelligence, type MarketRegimeState } from '@/lib/regime-intelligence';
import { routeByRegime } from '@/lib/regime-router';
import { getDailyHistory } from '@/lib/global-market-data';
import { computeConformalPrediction, type ConformalPredictionSet } from '@/lib/conformal-risk';
import { scoreLeadLag, isLeadLagRelevant } from '@/lib/leadlag-score';
import { getCalibrationReport, applyBucketCalibration, type CalibrationServiceReport } from '@/lib/calibration-service';
import { computePositionSize } from '@/lib/position-sizing';

export const maxDuration = 60;

function toLegacyRegime(state: MarketRegimeState): 'BULL' | 'BEAR' | 'VOLATILE' | 'RANGING' {
  if (state === 'PANIC_CAPITULATION') return 'VOLATILE';
  if (state === 'BULL_LOW_VOL' || state === 'BULL_HIGH_VOL' || state === 'RELIEF_RALLY') return 'BULL';
  if (state === 'BEAR_LOW_VOL' || state === 'BEAR_HIGH_VOL') return 'BEAR';
  return 'RANGING';
}

function toFinalDecision(direction: string, gateStatus: string): 'BUY' | 'SELL' | 'HOLD' | 'NO_TRADE' {
  if (gateStatus === 'NO_TRADE') return 'NO_TRADE';
  if (direction === 'STRONG_BUY' || direction === 'BUY') return 'BUY';
  if (direction === 'STRONG_SELL' || direction === 'SELL') return 'SELL';
  return 'HOLD';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const startTime = Date.now();
  try {
    const { symbol } = await params;
    const ticker = symbol.toUpperCase().trim();

    if (!ticker) {
      return NextResponse.json({ error: 'Simboli eshte i nevojshem' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '1y';
    const runEval = searchParams.get('checkLearning') === 'true';

    await seedDefaultWeights().catch(() => {});
    if (runEval) {
      try { await evaluateDuePredictions(); } catch (err) {
        console.error('[PREDICT] Evaluation failed:', err);
      }
    }

    // Phase 1: I/O (parallel)
    const historicalData = await fetchHistoricalData(ticker, range);
    if (!historicalData || historicalData.length < 60) {
      return NextResponse.json(
        { error: 'Te dhena te pamjaftueshme historike per predikim' },
        { status: 404 },
      );
    }

    const isSemiOrTech = ['NVDA','AMD','MU','MRVL','INTC','TSM','AVGO','QCOM','SMH','SOXX','QQQ'].includes(ticker);
    const leadLagPromise = isLeadLagRelevant(ticker)
      ? scoreLeadLag(ticker).catch(() => null)
      : Promise.resolve(null);

    const [relStrength, fundamentals, weightsResult, learningStatsRaw, spilloverRaw, regimePack, spySnap, leadLagResult] = await Promise.all([
      calculateRelativeStrength(ticker),
      getRealFundamentals(ticker),
      getModelWeights(1),
      loadLearningStats().catch(() => ({
        totalPredictions: 0, checkedPredictions: 0,
        shortTermAccuracy: 50, mediumTermAccuracy: 50, directionAccuracy: 50,
        indicatorAccuracy: {}, fundamentalAccuracy: {},
        learningWeights: {}, fundamentalWeights: {},
        lastUpdated: new Date().toISOString(),
        bestIndicators: [], worstIndicators: [],
        averageAbsoluteError: 0, recentAccuracy: 50,
      })),
      analyzeGlobalSpillover(ticker).catch((err) => {
        console.error('[PREDICT] Spillover analysis failed:', err);
        return {
          setupType: 'NEUTRAL' as const, spilloverScore: 0, confidence: 0,
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
      getRegimeWithPolicy({ targetSymbol: ticker }),
      getDailyHistory('SPY', 5),
      leadLagPromise,
    ]);

    const spillover: SpilloverAnalysis = spilloverRaw!;
    const regimeIntel: RegimeIntelligence = regimePack;
    const regimePolicy = regimePack.policy;

    console.log(
      `[PREDICT] ${ticker}: regime=${regimeIntel.regime} ` +
      `(conf=${(regimeIntel.confidence * 100).toFixed(0)}% floor=${regimePolicy.confidenceFloor})`,
    );

    const activeModel = await getActiveModel();
    if (isSemiOrTech && spillover.features) {
      runV2ShadowPrediction(ticker, spillover.features).catch(() => {});
    }

    // Phase 2: Computation (no I/O)
    const baseResult = predictStock(ticker, historicalData);
    const techScore = baseResult.technicalScore;

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

    const eventRisk = checkEventRisk(ticker);
    const rsScore = relStrength.rsScore;

    // Phase 3: ORCHESTRATION
    const ratios = weightsResult.horizonRatios;
    const spilloverScore = spillover.spilloverScore;
    const spilloverBaseWeight = isSemiOrTech ? 0.10 : 0.03;
    const spilloverWeight = spilloverBaseWeight * regimePolicy.spilloverWeightMultiplier;

    // Lead-lag score integration
    const leadLagScore = leadLagResult?.score ?? 0;
    const leadLagWeight = leadLagResult?.weight ?? 0;

    const rawScore = Math.round(
      (techScore * ratios.technical +
       fundamentalScore * ratios.fundamental +
       eventRisk.riskScore * ratios.event * 0.3 +
       rsScore * 0.05 +
       spilloverScore * spilloverWeight +
       leadLagScore * leadLagWeight) * 100,
    ) / 100;

    const direction = rawScore > 60 ? 'STRONG_BUY' : rawScore > 25 ? 'BUY' :
      rawScore > -25 ? 'HOLD' : rawScore > -60 ? 'SELL' : 'STRONG_SELL';

    const routingResult = routeByRegime({
      regime: regimeIntel.regime,
      policy: regimePolicy,
      baseWeights: weightsResult.technical,
      rawScore,
      rawConfidence: baseResult.confidence,
      signal: direction as 'BUY' | 'SELL' | 'HOLD',
    });

    const combinedScore = routingResult.adjustedScore;
    const calibratedConfidence = routingResult.adjustedConfidence;

    const gateResult = routingResult.blockedReason
      ? { status: 'NO_TRADE' as const, reason: routingResult.blockedReason }
      : runNoTradeGate({
          confidence: calibratedConfidence,
          combinedScore,
          expectedMovePct: baseResult.shortTerm.expectedMove,
          signal: direction,
          regime: {
            regime: toLegacyRegime(regimeIntel.regime),
            confidence: regimeIntel.confidence,
            spyPrice: spySnap[0]?.close ?? 0,
            spyChange5d: regimeIntel.drivers.spy5d,
            spyChange20d: regimeIntel.drivers.spy20d,
            detectedAt: new Date().toISOString(),
          } as any,
          eventRisk,
          spillover,
          regimePolicy,
        });

    const modelVersion = 'predict-v3-regime-spillover';

    // Prices and derived values (needed by multiple downstream steps)
    const lastClose = historicalData[historicalData.length - 1].close;
    const spyClose = spySnap[0]?.close;

    // CALIBRATION LAYER — bucket-calibrate the probability before conformal
    let calibrationReport: CalibrationServiceReport | null = null;
    let rawProbability = calibratedConfidence / 100;
    let calibratedProbability = rawProbability;
    try {
      calibrationReport = await getCalibrationReport({
        modelVersion,
        horizonDays: 1,
        bins: 10,
      });
      if (calibrationReport.sampleSize >= 50 && calibrationReport.bucketCalibrator.length > 0) {
        calibratedProbability = applyBucketCalibration(rawProbability, calibrationReport.bucketCalibrator);
        console.log(
          `[PREDICT] ${ticker}: calibration ${rawProbability.toFixed(4)} → ${calibratedProbability.toFixed(4)} ` +
          `(diagnosis=${calibrationReport.diagnosis}, ece=${calibrationReport.ece})`,
        );
      }
    } catch (err) {
      console.warn('[PREDICT] Calibration service failed, using raw probability:', err);
    }

    // CONFORMAL RISK GATE — uses calibrated probability
    let conformalResult: ConformalPredictionSet | null = null;
    let conformalOverride = false;
    let conformalOverrideReason: string | null = null;
    if (gateResult.status !== 'NO_TRADE') {
      try {
        const probabilityUp = direction === 'STRONG_BUY' || direction === 'BUY'
          ? calibratedProbability
          : direction === 'STRONG_SELL' || direction === 'SELL'
            ? 1 - calibratedProbability
            : 0.5;
        const cr = await computeConformalPrediction(probabilityUp, {
          regime: regimeIntel.regime,
        });
        conformalResult = cr;
        if (!cr.tradeEligible) {
          conformalOverride = true;
          conformalOverrideReason = cr.tradeEligibilityReason;
          console.log(`[PREDICT] ${ticker}: CONFORMAL NO_TRADE - ${conformalOverrideReason}`);
        }
      } catch (err) {
        console.warn('[PREDICT] Conformal check failed:', err);
      }
    }

    const effectiveGateStatus = conformalOverride ? 'NO_TRADE' : gateResult.status;

    // POSITION SIZING — Fractional Kelly with conservative caps
    let positionSizing: ReturnType<typeof computePositionSize> | null = null;
    if (effectiveGateStatus !== 'NO_TRADE' && lastClose > 0) {
      try {
        const stopDistancePct = Math.max(2.0, baseResult.shortTerm.expectedMove * 100 * 1.5);
        const expectedMovePct = baseResult.shortTerm.expectedMove * 100;
        const rewardToRisk = stopDistancePct > 0 ? expectedMovePct / stopDistancePct : 1.0;
        positionSizing = computePositionSize({
          accountEquity: 25000,
          calibratedProbability: calibratedProbability,
          rewardToRisk: Math.max(0.5, rewardToRisk),
          stopDistancePct,
          entryPrice: lastClose,
          maxRiskPerTradePct: 0.5,
          maxPositionPct: 10,
          conformalUncertainty: conformalResult?.uncertaintyBand ?? 0.2,
          correlationPenalty: 0.15,
          regimeMultiplier: regimePolicy.scoreMultiplier,
        });
      } catch (err) {
        console.warn('[PREDICT] Position sizing failed:', err);
      }
    }

    // Phase 4: Persistence + Response
    const allFactors: FactorInput[] = [];
    const techFactors = buildTechnicalFactors(
      baseResult.indicatorScores,
      Object.keys(learningStatsRaw.learningWeights).length > 0
        ? learningStatsRaw.learningWeights
        : routingResult.weights,
    );
    allFactors.push(...techFactors);

    if (fundamentalScores && Object.keys(fundamentalScores).length > 0) {
      const adjustedFundWeights: Record<string, number> = {};
      for (const [k, v] of Object.entries(weightsResult.fundamental)) {
        adjustedFundWeights[k] = v * regimePolicy.fundamentalWeightMultiplier;
      }
      const fundFactors = buildFundamentalFactors(
        fundamentalScores,
        Object.keys(learningStatsRaw.fundamentalWeights).length > 0
          ? learningStatsRaw.fundamentalWeights
          : adjustedFundWeights,
      );
      allFactors.push(...fundFactors);
    }

    const regimeSignal = regimeIntel.regime === 'BULL_LOW_VOL' || regimeIntel.regime === 'BULL_HIGH_VOL' || regimeIntel.regime === 'RELIEF_RALLY'
      ? 'BULLISH' : regimeIntel.regime === 'BEAR_HIGH_VOL' || regimeIntel.regime === 'BEAR_LOW_VOL' || regimeIntel.regime === 'PANIC_CAPITULATION'
      ? 'BEARISH' : 'NEUTRAL';
    allFactors.push({
      factorName: 'regime_intelligence', factorType: 'regime',
      score: regimePolicy.scoreMultiplier > 1 ? 30 : regimePolicy.scoreMultiplier < 1 ? -30 : 0,
      weight: 0.08, signal: regimeSignal,
      description: `Regime: ${regimeIntel.regime} (conf=${(regimeIntel.confidence * 100).toFixed(0)}%, transRisk=${(regimeIntel.transitionRisk * 100).toFixed(0)}%)`,
    });
    allFactors.push({
      factorName: 'event_risk', factorType: 'event',
      score: eventRisk.riskScore, weight: ratios.event,
      signal: eventRisk.riskScore < -20 ? 'BEARISH' : 'NEUTRAL',
      description: eventRisk.description,
    });
    allFactors.push({
      factorName: 'relative_strength', factorType: 'relative_strength',
      score: rsScore, weight: 0.05,
      signal: rsScore > 10 ? 'BULLISH' : rsScore < -10 ? 'BEARISH' : 'NEUTRAL',
      description: `RS vs SPY: ${rsScore > 0 ? '+' : ''}${rsScore.toFixed(1)}`,
    });
    allFactors.push({
      factorName: 'global_spillover', factorType: 'macro_global',
      score: spilloverScore, weight: spilloverBaseWeight,
      signal: spilloverScore > 0 ? 'BULLISH' : spilloverScore < 0 ? 'BEARISH' : 'NEUTRAL',
      description: `${spillover.setupType} (score=${spilloverScore}, conf=${(spillover.confidence * 100).toFixed(0)}%) - ${(spillover.reasons || []).slice(0, 2).join('; ')}`,
    });

    // Lead-lag factor
    if (leadLagResult) {
      allFactors.push({
        factorName: 'lead_lag_structure', factorType: 'macro_global' as const,
        score: leadLagResult.score, weight: leadLagResult.weight,
        signal: leadLagResult.signal,
        description: leadLagResult.description,
      });
    }

    const expectedMove1d = baseResult.shortTerm.expectedMove;
    const expectedMove5d = baseResult.mediumTerm.expectedMove;
    const predictedDir1d = baseResult.shortTerm.prediction;
    const predictedDir5d = baseResult.mediumTerm.prediction;
    const predictedDir20d = combinedScore > 15 ? 'UP' : combinedScore < -15 ? 'DOWN' : 'SIDEWAYS';

    const finalDecision = toFinalDecision(direction, effectiveGateStatus);

    const saveFactors = allFactors.map(f => ({
      factorName: f.factorName, factorType: f.factorType as string,
      score: f.score, weight: f.weight, signal: f.signal, description: f.description,
    }));

    const [pred1d, pred5d, pred20d] = await Promise.all([
      savePrediction({
        symbol: ticker, horizonDays: 1, modelVersion,
        entryPrice: lastClose, benchmarkEntryPrice: spyClose,
        regime: regimeIntel.regime, regimeConfidence: regimeIntel.confidence,
        transitionRisk: regimeIntel.transitionRisk,
        rawScore, calibratedConfidence, finalDecision, factors: saveFactors,
      }),
      savePrediction({
        symbol: ticker, horizonDays: 5, modelVersion,
        entryPrice: lastClose, benchmarkEntryPrice: spyClose,
        regime: regimeIntel.regime, regimeConfidence: regimeIntel.confidence,
        transitionRisk: regimeIntel.transitionRisk,
        rawScore, calibratedConfidence, finalDecision, factors: saveFactors,
      }),
      savePrediction({
        symbol: ticker, horizonDays: 20, modelVersion,
        entryPrice: lastClose, benchmarkEntryPrice: spyClose,
        regime: regimeIntel.regime, regimeConfidence: regimeIntel.confidence,
        transitionRisk: regimeIntel.transitionRisk,
        rawScore, calibratedConfidence, finalDecision, factors: saveFactors,
      }).catch(() => null),
    ]);

    const elapsedMs = Date.now() - startTime;
    console.log(
      `[PREDICT] ${ticker}: dir=${direction} conf=${calibratedConfidence} score=${combinedScore} ` +
      `gate=${effectiveGateStatus} regime=${regimeIntel.regime} decision=${finalDecision} ` +
      `factors=${allFactors.length} time=${elapsedMs}ms`,
    );

    return NextResponse.json({
      ...baseResult, score: combinedScore, direction, confidence: calibratedConfidence,
      combinedScore, technicalScore: techScore,
      fundamentalData: fundamentalScore !== 0 ? {
        score: fundamentalScore, summary: fundamentalSummary, scores: fundamentalScores,
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
      regime: regimeIntel.regime, regimeConfidence: regimeIntel.confidence,
      relativeStrength: rsScore,
      eventRisk: { type: eventRisk.eventType, severity: eventRisk.severity, description: eventRisk.description },
      gateStatus: effectiveGateStatus,
      gateReason: conformalOverride ? conformalOverrideReason : gateResult.reason,
      calibration: calibrationReport ? {
        rawProbability: Math.round(rawProbability * 10000) / 10000,
        calibratedProbability: Math.round(calibratedProbability * 10000) / 10000,
        diagnosis: calibrationReport.diagnosis,
        ece: calibrationReport.ece,
        brier: calibrationReport.brier,
        sampleSize: calibrationReport.sampleSize,
      } : null,
      conformalRisk: conformalResult ? {
        tradeEligible: conformalResult.tradeEligible,
        uncertaintyBand: conformalResult.uncertaintyBand,
        confidenceSet: conformalResult.confidenceSet,
        recommendation: conformalResult.recommendation,
        overridden: conformalOverride,
      } : null,
      leadLag: leadLagResult ? {
        score: leadLagResult.score, weight: leadLagResult.weight,
        signal: leadLagResult.signal, nodeRole: leadLagResult.features.nodeRole,
        strongestLeader: leadLagResult.features.strongestLeader,
        shockPropagationRisk: leadLagResult.features.shockPropagationRisk,
      } : null,
      spillover: {
        setupType: spillover.setupType, spilloverScore: spillover.spilloverScore,
        confidence: spillover.confidence, reasons: spillover.reasons,
        drivers: spillover.drivers, modelVersion: spillover.modelVersion,
      },
      spilloverModelConfig: {
        activeModel,
        v2Status: activeModel === 'spillover-v1' ? 'shadow' : 'active',
        v2Promotion: 'V2 must win 2/3 metrics (precision, Brier, return) with 50+ OOS samples',
        v2ShadowResultsSavedToDB: isSemiOrTech,
      },
      regimeIntelligence: {
        regime: regimeIntel.regime, confidence: regimeIntel.confidence,
        transitionRisk: regimeIntel.transitionRisk, reasons: regimeIntel.reasons,
        policy: {
          confidenceFloor: regimePolicy.confidenceFloor, allowLongs: regimePolicy.allowLongs,
          allowShorts: regimePolicy.allowShorts, noTradeBias: regimePolicy.noTradeBias,
          scoreMultiplier: regimePolicy.scoreMultiplier,
          spilloverWeightMultiplier: regimePolicy.spilloverWeightMultiplier,
          technicalWeightMultiplier: regimePolicy.technicalWeightMultiplier,
          fundamentalWeightMultiplier: regimePolicy.fundamentalWeightMultiplier,
        },
        drivers: regimeIntel.drivers,
      },
      finalDecision,
      routingBlockedReason: routingResult.blockedReason ?? null,
      horizons: {
        '1D': { predictedDir: predictedDir1d, expectedMovePct: expectedMove1d, predictionId: pred1d?.id },
        '5D': { predictedDir: predictedDir5d, expectedMovePct: expectedMove5d, predictionId: pred5d?.id },
        '20D': { predictedDir: predictedDir20d, expectedMovePct: expectedMove5d * 2, predictionId: pred20d?.id },
      },
      predictionId: pred1d?.id, modelVersion, processingTimeMs: elapsedMs,
      positionSizing: positionSizing ? {
        kelly: {
          full: positionSizing.fullKelly,
          fractional: positionSizing.fractionalKelly,
          adjusted: positionSizing.adjustedKelly,
          regimeScale: positionSizing.regimeScale,
        },
        shares: positionSizing.recommendedShares,
        positionValue: positionSizing.recommendedPositionValue,
        riskDollars: positionSizing.effectiveRiskDollars,
        riskPctOfEquity: positionSizing.recommendedRiskPctOfEquity,
        constraints: {
          sharesByRisk: positionSizing.sharesByRisk,
          sharesByKelly: positionSizing.sharesByKelly,
          sharesByMaxPosition: positionSizing.sharesByMaxPosition,
        },
      } : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[PREDICT] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
