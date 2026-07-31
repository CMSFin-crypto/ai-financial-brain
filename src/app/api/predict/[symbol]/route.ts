import { NextRequest, NextResponse } from 'next/server';
import { fetchHistoricalData, getRealFundamentals } from '@/lib/alpha-vantage';
import { predictStock } from '@/lib/prediction-engine';
import { analyzeFundamentals } from '@/lib/fundamental-analysis';
import { calculateRelativeStrength } from '@/lib/relative-strength';
import { checkEventRisk } from '@/lib/event-risk';
import { runNoTradeGate } from '@/lib/no-trade-gate';
import { getModelWeights, seedDefaultWeights } from '@/lib/model-weights';
import { savePrediction as savePredictionBrier } from '@/lib/save-prediction';
import { buildTechnicalFactors, buildFundamentalFactors, type FactorInput } from '@/lib/prediction-factors';
import { loadLearningStats } from '@/lib/prediction-history';
import { evaluateDuePredictions } from '@/lib/evaluation-engine';
import { evaluateDuePredictionsBrier } from '@/lib/evaluate-prediction';
import { analyzeGlobalSpillover, type SpilloverAnalysis } from '@/lib/global-spillover';
import { runV2ShadowPrediction, getActiveModel } from '@/lib/spillover-promotion';
import { getRegimeWithPolicy, type RegimeIntelligence, type MarketRegimeState } from '@/lib/regime-intelligence';
import { routeByRegime } from '@/lib/regime-router';
import { getDailyHistory } from '@/lib/global-market-data';

export const maxDuration = 60;

// Map new 7-state regime to legacy 4-state (for no-trade-gate compat)
function toLegacyRegime(state: MarketRegimeState): 'BULL' | 'BEAR' | 'VOLATILE' | 'RANGING' {
  if (state === 'PANIC_CAPITULATION') return 'VOLATILE';
  if (state === 'BULL_LOW_VOL' || state === 'BULL_HIGH_VOL' || state === 'RELIEF_RALLY') return 'BULL';
  if (state === 'BEAR_LOW_VOL' || state === 'BEAR_HIGH_VOL') return 'BEAR';
  return 'RANGING';
}

// ═══════════════════════════════════════════════════════════════
// PIPELINE ORDER (production)
//
// Phase 1 — I/O (parallel):
//   global-market-data → spillover-features → spillover V1
//   fundamentals → relative-strength → model-weights → learning-stats
//   regime-intelligence (calls spillover internally, 30-min cache)
//
// Phase 2 — Computation (sequential, no I/O):
//   technical-analysis → fundamental-analysis → event-risk
//
// Phase 3 — ORCHESTRATION:
//   regime-intelligence → weight-override → score-combination
//   routeByRegime → confidence-calibration → no-trade-gate
//
// Phase 4 — Persistence + Response:
//   save prediction (with regime state + policy for Brier calibration)
//   return TRADE / NO_TRADE decision
// ═══════════════════════════════════════════════════════════════

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

    // ── Pre-flight ───────────────────────────────────────────
    await seedDefaultWeights().catch(() => {});
    if (runEval) {
      try {
        // Run both evaluators: legacy (wasCorrect) + Brier (actualOutcome)
        await Promise.all([
          evaluateDuePredictions(),
          evaluateDuePredictionsBrier(),
        ]);
      } catch (err) {
        console.error('[PREDICT] Evaluation failed:', err);
      }
    }

    // ── PHASE 1: I/O (parallel) ─────────────────────────────
    const historicalData = await fetchHistoricalData(ticker, range);
    if (!historicalData || historicalData.length < 60) {
      return NextResponse.json(
        { error: 'Te dhena te pamjaftueshme historike per predikim' },
        { status: 404 },
      );
    }

    const [relStrength, fundamentals, weightsResult, learningStatsRaw, spilloverRaw, regimePack, spySnap] = await Promise.all([
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
      // REGIME INTELLIGENCE — the orchestrator (30-min cache)
      getRegimeWithPolicy({ targetSymbol: ticker }),
      // SPY snapshot for DB (cached by global-market-data)
      getDailyHistory('SPY', 5),
    ]);

    const spillover: SpilloverAnalysis = spilloverRaw!;
    const regimeIntel: RegimeIntelligence = regimePack;
    const regimePolicy = regimePack.policy;

    console.log(
      `[PREDICT] ${ticker}: regime=${regimeIntel.regime} ` +
      `(conf=${(regimeIntel.confidence * 100).toFixed(0)}% floor=${regimePolicy.confidenceFloor})`,
    );

    // V2 Shadow Mode (fire-and-forget, for semis/tech only)
    const isSemiOrTech = ['NVDA','AMD','MU','MRVL','INTC','TSM','AVGO','QCOM','SMH','SOXX','QQQ'].includes(ticker);
    const activeModel = await getActiveModel();
    if (isSemiOrTech && spillover.features) {
      runV2ShadowPrediction(ticker, spillover.features).catch(() => {});
    }

    // ── PHASE 2: Computation (no I/O) ───────────────────────

    // 2a. Technical analysis
    const baseResult = predictStock(ticker, historicalData);
    const techScore = baseResult.technicalScore;

    // 2b. Fundamental analysis
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

    // 2c. Event risk (pure computation)
    const eventRisk = checkEventRisk(ticker);
    const rsScore = relStrength.rsScore;

    // ── PHASE 3: ORCHESTRATION ──────────────────────────────
    // The regime intelligence layer decides HOW to interpret all signals.

    // 3a. Build raw combined score from engine outputs
    const ratios = weightsResult.horizonRatios;
    const spilloverScore = spillover.spilloverScore;
    const spilloverBaseWeight = isSemiOrTech ? 0.10 : 0.03;
    const spilloverWeight = spilloverBaseWeight * regimePolicy.spilloverWeightMultiplier;

    const rawScore = Math.round(
      (techScore * ratios.technical +
       fundamentalScore * ratios.fundamental +
       eventRisk.riskScore * ratios.event * 0.3 +
       rsScore * 0.05 +
       spilloverScore * spilloverWeight) * 100,
    ) / 100;

    // 3b. Determine signal direction from raw score
    const direction = rawScore > 60 ? 'STRONG_BUY' : rawScore > 25 ? 'BUY' :
      rawScore > -25 ? 'HOLD' : rawScore > -60 ? 'SELL' : 'STRONG_SELL';

    // 3c. REGIME ROUTING — adjust weights, score, confidence per regime
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

    // 3d. NO_TRADE gate (regime-aware: uses policy floors + direction blocks)
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

    // 3e. FINAL DECISION — the regime orchestrator's output
    const finalDecision = gateResult.status === 'NO_TRADE' ? 'NO_TRADE' : 'TRADE';

    // ── PHASE 4: Persistence + Response ─────────────────────

    // 4a. Build factor list for DB
    const allFactors: FactorInput[] = [];
    const techFactors = buildTechnicalFactors(
      baseResult.indicatorScores,
      Object.keys(learningStatsRaw.learningWeights).length > 0
        ? learningStatsRaw.learningWeights
        : routingResult.weights,
    );
    allFactors.push(...techFactors);

    // Fundamental factors (policy-adjusted weights)
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

    // Regime Intelligence factor
    const regimeSignal = regimeIntel.regime === 'BULL_LOW_VOL' || regimeIntel.regime === 'BULL_HIGH_VOL' || regimeIntel.regime === 'RELIEF_RALLY'
      ? 'BULLISH' : regimeIntel.regime === 'BEAR_HIGH_VOL' || regimeIntel.regime === 'BEAR_LOW_VOL' || regimeIntel.regime === 'PANIC_CAPITULATION'
      ? 'BEARISH' : 'NEUTRAL';
    allFactors.push({
      factorName: 'regime_intelligence', factorType: 'regime',
      score: regimePolicy.scoreMultiplier > 1 ? 30 : regimePolicy.scoreMultiplier < 1 ? -30 : 0,
      weight: 0.08, signal: regimeSignal,
      description: `Regjimi: ${regimeIntel.regime} (conf=${(regimeIntel.confidence * 100).toFixed(0)}%, transRisk=${(regimeIntel.transitionRisk * 100).toFixed(0)}%)`,
    });

    // Event risk factor
    allFactors.push({
      factorName: 'event_risk', factorType: 'event',
      score: eventRisk.riskScore, weight: ratios.event,
      signal: eventRisk.riskScore < -20 ? 'BEARISH' : 'NEUTRAL',
      description: eventRisk.description,
    });

    // Relative strength factor
    allFactors.push({
      factorName: 'relative_strength', factorType: 'relative_strength',
      score: rsScore, weight: 0.05,
      signal: rsScore > 10 ? 'BULLISH' : rsScore < -10 ? 'BEARISH' : 'NEUTRAL',
      description: `RS vs SPY: ${rsScore > 0 ? '+' : ''}${rsScore.toFixed(1)}`,
    });

    // Global spillover factor
    allFactors.push({
      factorName: 'global_spillover', factorType: 'macro_global',
      score: spilloverScore, weight: spilloverBaseWeight,
      signal: spilloverScore > 0 ? 'BULLISH' : spilloverScore < 0 ? 'BEARISH' : 'NEUTRAL',
      description: `${spillover.setupType} (score=${spilloverScore}, conf=${(spillover.confidence * 100).toFixed(0)}%) - ${(spillover.reasons || []).slice(0, 2).join('; ')}`,
    });

    // 4b. Horizons
    const lastClose = historicalData[historicalData.length - 1].close;
    const expectedMove1d = baseResult.shortTerm.expectedMove;
    const expectedMove5d = baseResult.mediumTerm.expectedMove;
    const predictedDir1d = baseResult.shortTerm.prediction;
    const predictedDir5d = baseResult.mediumTerm.prediction;
    const predictedDir20d = combinedScore > 15 ? 'UP' : combinedScore < -15 ? 'DOWN' : 'SIDEWAYS';

    // 4c. Save to DB with REGIME STATE + POLICY + TRANSITION RISK (for Brier calibration)
    const modelVersion = 'predict-v3-regime-spillover';
    const dbBase = {
      ticker, signal: direction, calibratedConfidence, combinedScore,
      technicalScore: techScore, fundamentalScore,
      regimeScore: regimePolicy.scoreMultiplier > 1 ? 10 : regimePolicy.scoreMultiplier < 1 ? -10 : 0,
      eventRiskScore: eventRisk.riskScore,
      gateStatus: gateResult.status, gateReason: gateResult.reason,
      noTradeReason: gateResult.status === 'NO_TRADE' ? gateResult.reason : undefined,
      finalDecision: finalDecision as 'TRADE' | 'NO_TRADE',
      modelVersion,
      factors: allFactors,
      // Regime Intelligence — persisted for per-regime Brier score calibration
      regime: regimeIntel.regime,
      regimeConfidence: regimeIntel.confidence,
      transitionRisk: regimeIntel.transitionRisk,
      regimePolicy: regimePolicy as unknown as Record<string, unknown>,
      rawScore,
      snapshot: {
        regime: regimeIntel.regime,
        regimeConfidence: regimeIntel.confidence,
        spyPrice: spySnap[0]?.close,
        spyChange5d: regimeIntel.drivers.spy5d,
        spyChange20d: regimeIntel.drivers.spy20d,
        vixLevel: regimeIntel.drivers.vixLevel,
      },
    };

    const [predId1d, predId5d, predId20d] = await Promise.all([
      savePredictionBrier({ ...dbBase,
        horizonDays: 1, predictedDir: predictedDir1d, predictedMovePct: expectedMove1d, entryPrice: lastClose,
      }),
      savePredictionBrier({ ...dbBase,
        horizonDays: 5, predictedDir: predictedDir5d, predictedMovePct: expectedMove5d, entryPrice: lastClose,
      }),
      savePredictionBrier({ ...dbBase,
        horizonDays: 20, predictedDir: predictedDir20d, predictedMovePct: expectedMove5d * 2, entryPrice: lastClose,
      }),
    ]);

    const primaryPredictionId = predId1d;

    // 4d. Build response
    const elapsedMs = Date.now() - startTime;
    console.log(
      `[PREDICT] ${ticker}: dir=${direction} conf=${calibratedConfidence} score=${combinedScore} ` +
      `gate=${gateResult.status} regime=${regimeIntel.regime} decision=${finalDecision} ` +
      `factors=${allFactors.length} time=${elapsedMs}ms`,
    );

    return NextResponse.json({
      ...baseResult,
      score: combinedScore,
      direction,
      confidence: calibratedConfidence,
      combinedScore,
      technicalScore: techScore,
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
      // Regime (new 7-state intelligence)
      regime: regimeIntel.regime,
      regimeConfidence: regimeIntel.confidence,
      relativeStrength: rsScore,
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
      // Regime Intelligence — the orchestrator layer
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
          spilloverWeightMultiplier: regimePolicy.spilloverWeightMultiplier,
          technicalWeightMultiplier: regimePolicy.technicalWeightMultiplier,
          fundamentalWeightMultiplier: regimePolicy.fundamentalWeightMultiplier,
        },
        drivers: regimeIntel.drivers,
      },
      // Final decision from the orchestrator
      finalDecision,
      routingBlockedReason: routingResult.blockedReason ?? null,
      horizons: {
        '1D': { predictedDir: predictedDir1d, expectedMovePct: expectedMove1d, predictionId: predId1d },
        '5D': { predictedDir: predictedDir5d, expectedMovePct: expectedMove5d, predictionId: predId5d },
        '20D': { predictedDir: predictedDir20d, expectedMovePct: expectedMove5d * 2, predictionId: predId20d },
      },
      predictionId: primaryPredictionId,
      modelVersion,
      processingTimeMs: elapsedMs,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[PREDICT] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
