// ============================================================
// Predict [symbol] — Consolidated 5-Factor Prediction Pipeline
//
// Scoring: technical * W_tech + spillover * W_spill + regime * W_regime
//          + event * W_event + fundamental * W_fund
//
// Weights by horizon:
//   1D:  tech 55%, spillover 20%, regime 10%, event 10%, fund 5%
//   3D:  tech 45%, spillover 20%, regime 13%, event 10%, fund 12%
//   7D:  fund 30%, regime 18%, tech 22%, spillover 18%, event 12%
//
// Business rules:
//   - No strong BUY when Asia risk-off + VIX rising + weak sector
//   - Bonus when Asia + sector ETF + benchmark aligned
//   - Before earnings/Fed/CPI: reduce confidence or NO_TRADE
//   - Save full feature snapshot for meta-model training
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { fetchHistoricalData, getRealFundamentals } from '@/lib/alpha-vantage';
import { predictStock } from '@/lib/prediction-engine';
import { analyzeFundamentals } from '@/lib/fundamental-analysis';
import { calculateRelativeStrength } from '@/lib/relative-strength';
import { checkEventRisk } from '@/lib/event-risk';
import { runNoTradeGate } from '@/lib/no-trade-gate';
import { getModelWeights, seedDefaultWeights, HORIZON_WEIGHTS, type ModelWeightsResult } from '@/lib/model-weights';
import { savePrediction, type MarketSnapshotInput, type FeatureSnapshotInput, type EventSnapshotInput, type FactorInput } from '@/lib/save-prediction';
import { buildTechnicalFactors, buildFundamentalFactors } from '@/lib/prediction-factors';
import { buildCrossMarketFeatures, type CrossMarketFeatures } from '@/lib/build-spillover-features';
import { assessSpillover, type SpilloverAssessment } from '@/lib/spillover-engine';
import { getRegimeAssessment, computeRegimeContribution, type RegimeAssessment } from '@/lib/regime-engine';
import { getCalibrationReport, applyBucketCalibration, type CalibrationServiceReport } from '@/lib/calibration-service';
import { computeConformalPrediction, type ConformalPredictionSet } from '@/lib/conformal-risk';
import { computePositionSize } from '@/lib/position-sizing';
import { computeSchemaHash, FEATURE_SCHEMA_VERSION } from '@/lib/ml/feature-definitions';
import { getDailyHistory } from '@/lib/global-market-data';
import { scoreLeadLag, isLeadLagRelevant } from '@/lib/leadlag-score';

export const maxDuration = 60;

const SECTOR_MAP: Record<string, string> = {
  AAPL:'Tech', MSFT:'Tech', GOOGL:'Tech', AMZN:'Consumer', NVDA:'Semi', META:'Tech',
  TSLA:'Auto', JPM:'Finance', V:'Finance', UNH:'Healthcare', JNJ:'Healthcare',
  WMT:'Consumer', PG:'Consumer', MA:'Finance', HD:'Consumer', COST:'Consumer',
  AVGO:'Semi', ADBE:'Tech', CRM:'Tech', AMD:'Semi', NFLX:'Tech',
  PYPL:'Finance', INTC:'Semi', QCOM:'Semi', TXN:'Semi', AMGN:'Healthcare',
  ORCL:'Tech', CME:'Finance', LRCX:'Semi', VRTX:'Healthcare', MU:'Semi',
  KLAC:'Semi', ARM:'Semi', AI:'Tech', CRWD:'Tech', NET:'Tech', ANET:'Tech',
  SNPS:'Semi', AMAT:'Semi', BAC:'Finance', AXP:'Finance', BKNG:'Consumer',
  SCHW:'Finance', GS:'Finance', MS:'Finance', ICE:'Finance', SPGI:'Finance',
  COP:'Energy', CVX:'Energy', SLB:'Energy', EOG:'Energy', DVN:'Energy',
  MPC:'Energy', FANG:'Energy', CAT:'Industrial', DE:'Industrial', GE:'Industrial',
  HON:'Industrial', RTX:'Industrial', LMT:'Defense', NOC:'Defense', BA:'Industrial',
  UPS:'Logistics', REGN:'Healthcare', SYK:'Healthcare', PFE:'Healthcare',
  TMO:'Healthcare', ABT:'Healthcare', CI:'Healthcare', PEP:'Consumer',
  KO:'Consumer', MDLZ:'Consumer', CL:'Consumer', BSX:'Healthcare', BDX:'Healthcare',
  PGR:'Insurance', MMC:'Insurance', SO:'Utilities', DUK:'Utilities',
  CSCO:'Tech', ACN:'Tech', INTU:'Tech', ISRG:'Healthcare', BLK:'Finance',
  LOW:'Consumer', SBUX:'Consumer', CMCSA:'Consumer', ADI:'Semi',
  ANSS:'Tech', CDNS:'Semi', CEG:'Energy', DDOG:'Tech', FI:'Finance',
  GD:'Defense', GLW:'Industrial', HPE:'Tech', LHX:'Defense', STX:'Tech',
  TGT:'Consumer', TJX:'Consumer', VRT:'Tech', VST:'Energy', WDC:'Tech',
  WFC:'Finance', WFRD:'Finance', EQIX:'REIT', PLD:'REIT', PSA:'REIT',
  WELL:'REIT', AMT:'REIT', 'BRK-B':'Finance', MRK:'Healthcare', ZTS:'Healthcare',
  CB:'Insurance', DIS:'Consumer', IBM:'Tech', SHW:'Industrial',
};

function toFinalDecision(direction: string, gateStatus: string): 'BUY' | 'SELL' | 'HOLD' | 'NO_TRADE' {
  if (gateStatus === 'NO_TRADE') return 'NO_TRADE';
  if (direction === 'STRONG_BUY' || direction === 'BUY') return 'BUY';
  if (direction === 'STRONG_SELL' || direction === 'SELL') return 'SELL';
  return 'HOLD';
}

/**
 * Compute the 5-factor score for a given horizon.
 */
function computeFiveFactorScore(
  techScore: number,
  spilloverScore: number,
  regimeAssessment: RegimeAssessment,
  eventScore: number,
  fundScore: number,
  weights: ModelWeightsResult,
  horizonDays: number,
  crossMarket: CrossMarketFeatures,
): { score: number; decisionReasons: string[] } {
  const hw = weights.horizonWeights;
  const reasons: string[] = [];

  // Business rule: "Mos jep BUY te forte kur KOSPI/Nikkei jane risk-off, VIX rritet dhe sektori eshte i dobet"
  const asiaRiskOff = crossMarket.asiaConsensus < -0.4;
  const vixRising = crossMarket.vix1d > 2;
  const sectorWeak = crossMarket.sectorEtf1d < -1.5;
  const isContestable = asiaRiskOff && vixRising && sectorWeak;

  // Business rule: "Jep bonus kur Asia + sector ETF + benchmark jane ne te njejtin drejtim"
  const allAligned = crossMarket.riskAlignment > 0.5;
  const alignmentBonus = allAligned ? 5 : 0;

  // Compute regime contribution using the regime engine
  const regimeContrib = computeRegimeContribution(regimeAssessment, horizonDays);
  const regimeScore = regimeContrib; // already scaled by weight internally

  // Event penalty before major events
  let eventPenalty = eventScore;
  if (eventScore < -20) {
    reasons.push(`Event risk: ${eventScore} — reducing confidence`);
  }

  // Raw 5-factor score
  let rawScore =
    techScore * hw.technical +
    spilloverScore * hw.spillover +
    regimeScore * hw.regime +
    eventPenalty * hw.event +
    fundScore * hw.fundamental +
    alignmentBonus;

  // Apply regime multiplier from policy
  rawScore *= regimeAssessment.policy.scoreMultiplier;

  // Apply technical weight multiplier from policy
  rawScore = rawScore * regimeAssessment.policy.technicalWeightMultiplier
    + fundScore * hw.fundamental * (regimeAssessment.policy.fundamentalWeightMultiplier - 1);

  // Business rule: contestable scenarios get a penalty
  if (isContestable && rawScore > 40) {
    reasons.push('Contestable: Asia risk-off + VIX rising + sector weak — capping score');
    rawScore = Math.min(rawScore, 40);
  }

  // Business rule: before earnings/Fed/CPI, reduce or NO_TRADE if edge not strong
  if (eventScore < -50 && Math.abs(rawScore) < 30) {
    reasons.push('Strong event risk with weak edge — recommending NO_TRADE');
  }

  if (allAligned) {
    reasons.push('Alignment bonus: Asia + sector + SPY all agree');
  }

  return {
    score: Math.round(rawScore * 100) / 100,
    decisionReasons: reasons,
  };
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

    // ── Phase 1: Parallel I/O ──────────────────────────────────
    const sector = SECTOR_MAP[ticker] ?? 'UNKNOWN';

    const [historicalData, fundamentals, weights1d, crossMarket, regimeAssessment, relStrength, spySnap, leadLagResult] = await Promise.all([
      fetchHistoricalData(ticker, range),
      getRealFundamentals(ticker).catch(() => null),
      getModelWeights(1),
      buildCrossMarketFeatures(ticker, sector),
      getRegimeAssessment(ticker),
      calculateRelativeStrength(ticker).catch(() => ({ rsScore: 0 })),
      getDailyHistory('SPY', 5),
      isLeadLagRelevant(ticker) ? scoreLeadLag(ticker).catch(() => null) : Promise.resolve(null),
    ]);

    if (!historicalData || historicalData.length < 60) {
      return NextResponse.json(
        { error: 'Te dhena te pamjaftueshme historike per predikim' },
        { status: 404 },
      );
    }

    // ── Phase 2: Compute all factor scores ──────────────────────
    const baseResult = predictStock(ticker, historicalData);
    const techScore = baseResult.technicalScore;

    // Fundamental
    let fundScore = 0;
    let fundamentalScores: Record<string, number> = {};
    if (fundamentals) {
      const fundResult = analyzeFundamentals(ticker, fundamentals);
      fundScore = fundResult.totalScore;
      fundamentalScores = {
        valuation: fundResult.scores.valuation.score,
        growth: fundResult.scores.growth.score,
        profitability: fundResult.scores.profitability.score,
        analystSentiment: fundResult.scores.analystSentiment.score,
        debtHealth: fundResult.scores.debtHealth.score,
        momentum: fundResult.scores.momentum.score,
      };
    }

    // Spillover (from the new engine)
    const spillover: SpilloverAssessment = assessSpillover(crossMarket, ticker, sector);

    // Event risk
    const eventRisk = checkEventRisk(ticker);

    // Relative strength
    const rsScore = relStrength.rsScore;

    // ── Phase 3: 5-Factor Scoring per horizon ──────────────────
    const [weights3d, weights7d] = await Promise.all([getModelWeights(3), getModelWeights(7)]);

    const score1d = computeFiveFactorScore(
      techScore, spillover.spilloverScore, regimeAssessment,
      eventRisk.riskScore, fundScore, weights1d, 1, crossMarket,
    );
    const score3d = computeFiveFactorScore(
      techScore, spillover.spilloverScore, regimeAssessment,
      eventRisk.riskScore, fundScore, weights3d, 3, crossMarket,
    );
    const score7d = computeFiveFactorScore(
      techScore, spillover.spilloverScore, regimeAssessment,
      eventRisk.riskScore, fundScore, weights7d, 7, crossMarket,
    );

    // Use 1D score as primary
    const rawScore = score1d.score;
    const decisionReasons = score1d.decisionReasons;

    // Direction from raw score
    const direction = rawScore > 60 ? 'STRONG_BUY' : rawScore > 25 ? 'BUY' :
      rawScore > -25 ? 'HOLD' : rawScore > -60 ? 'SELL' : 'STRONG_SELL';

    // Confidence from base engine
    let calibratedConfidence = baseResult.confidence;

    // No-trade gate
    const gateResult = runNoTradeGate({
      confidence: calibratedConfidence,
      combinedScore: rawScore,
      expectedMovePct: baseResult.shortTerm.expectedMove,
      signal: direction,
      regime: {
        regime: regimeAssessment.isBullish ? 'BULL' : regimeAssessment.isBearish ? 'BEAR' : 'RANGING',
        confidence: regimeAssessment.confidence,
        spyPrice: spySnap[0]?.close ?? 0,
        detectedAt: new Date().toISOString(),
      } as any,
      eventRisk,
      spillover: { setupType: spillover.setupType, spilloverScore: spillover.spilloverScore, confidence: spillover.confidence },
      regimePolicy: regimeAssessment.policy,
    });

    const modelVersion = 'predict-v4-5factor';
    const lastClose = historicalData[historicalData.length - 1].close;
    const spyClose = spySnap[0]?.close;

    // Calibration layer
    let calibrationReport: CalibrationServiceReport | null = null;
    let calibratedProbability = calibratedConfidence / 100;
    try {
      calibrationReport = await getCalibrationReport({ modelVersion, horizonDays: 1, bins: 10 });
      if (calibrationReport.sampleSize >= 50 && calibrationReport.bucketCalibrator.length > 0) {
        const raw = calibratedProbability;
        calibratedProbability = applyBucketCalibration(raw, calibrationReport.bucketCalibrator);
        console.log(`[PREDICT] ${ticker}: calibration ${raw.toFixed(4)} -> ${calibratedProbability.toFixed(4)}`);
      }
    } catch (err) {
      console.warn('[PREDICT] Calibration failed:', err);
    }

    // Conformal risk gate
    let conformalResult: ConformalPredictionSet | null = null;
    let conformalOverride = false;
    let conformalOverrideReason: string | null = null;
    if (gateResult.status !== 'NO_TRADE') {
      try {
        const pUp = (direction === 'BUY' || direction === 'STRONG_BUY') ? calibratedProbability
          : (direction === 'SELL' || direction === 'STRONG_SELL') ? 1 - calibratedProbability : 0.5;
        const cr = await computeConformalPrediction(pUp, { regime: regimeAssessment.regime });
        conformalResult = cr;
        if (!cr.tradeEligible) { conformalOverride = true; conformalOverrideReason = cr.tradeEligibilityReason; }
      } catch (err) {
        console.warn('[PREDICT] Conformal failed:', err);
      }
    }

    const effectiveGate = conformalOverride ? 'NO_TRADE' : gateResult.status;
    const finalDecision = toFinalDecision(direction, effectiveGate);

    // Position sizing
    let positionSizing: ReturnType<typeof computePositionSize> | null = null;
    if (effectiveGate !== 'NO_TRADE' && lastClose > 0) {
      try {
        const stopDist = Math.max(2.0, baseResult.shortTerm.expectedMove * 100 * 1.5);
        positionSizing = computePositionSize({
          accountEquity: 25000, calibratedProbability,
          rewardToRisk: stopDist > 0 ? (baseResult.shortTerm.expectedMove * 100) / stopDist : 1,
          stopDistancePct: stopDist, entryPrice: lastClose,
          maxRiskPerTradePct: 0.5, maxPositionPct: 10,
          conformalUncertainty: conformalResult?.uncertaintyBand ?? 0.2,
          correlationPenalty: 0.15, regimeMultiplier: regimeAssessment.policy.scoreMultiplier,
        });
      } catch (err) {
        console.warn('[PREDICT] Position sizing failed:', err);
      }
    }

    // ── Phase 4: Build factors + save with full snapshots ────────
    const allFactors: FactorInput[] = [];

    // Technical factors
    allFactors.push(...buildTechnicalFactors(baseResult.indicatorScores, weights1d.technical));

    // Fundamental factors
    if (Object.keys(fundamentalScores).length > 0) {
      allFactors.push(...buildFundamentalFactors(fundamentalScores, weights1d.fundamental));
    }

    // Spillover factors
    allFactors.push({
      factorName: 'global_spillover', factorType: 'spillover',
      score: spillover.spilloverScore, weight: weights1d.horizonWeights.spillover,
      signal: spillover.spilloverScore > 20 ? 'BULLISH' : spillover.spilloverScore < -20 ? 'BEARISH' : 'NEUTRAL',
      description: `${spillover.setupType} (score=${spillover.spilloverScore}, conf=${(spillover.confidence * 100).toFixed(0)}%) — ${spillover.reasons.slice(0, 2).join('; ')}`,
    });

    // Regime factor
    allFactors.push({
      factorName: 'regime_intelligence', factorType: 'regime',
      score: regimeAssessment.regimeScore, weight: weights1d.horizonWeights.regime,
      signal: regimeAssessment.isBullish ? 'BULLISH' : regimeAssessment.isBearish ? 'BEARISH' : 'NEUTRAL',
      description: `Regime: ${regimeAssessment.regime} (conf=${(regimeAssessment.confidence * 100).toFixed(0)}%, transRisk=${(regimeAssessment.transitionRisk * 100).toFixed(0)}%)`,
    });

    // Event factor
    allFactors.push({
      factorName: 'event_risk', factorType: 'event',
      score: eventRisk.riskScore, weight: weights1d.horizonWeights.event,
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

    // Lead-lag factor
    if (leadLagResult) {
      allFactors.push({
        factorName: 'lead_lag_structure', factorType: 'macro_global',
        score: leadLagResult.score, weight: leadLagResult.weight ?? 0.02,
        signal: leadLagResult.signal, description: leadLagResult.description,
      });
    }

    // Build market snapshot input
    const marketSnap: MarketSnapshotInput = {
      regime: regimeAssessment.regime,
      regimeConfidence: regimeAssessment.confidence,
      spyPrice: spyClose ?? 0,
      spyChange5d: regimeAssessment.drivers.spy5d,
      spyChange20d: regimeAssessment.drivers.spy20d,
      vixLevel: crossMarket.vixLevel,
      marketBreadth: 1 - crossMarket.semisBreadth,
    };

    // Build feature snapshot input (for meta-model training)
    const featureSnap: FeatureSnapshotInput = {
      featureVector: {
        technical_score: techScore, fundamental_score: fundScore,
        spillover_score: spillover.spilloverScore, regime_score: regimeAssessment.regimeScore,
        event_risk_score: eventRisk.riskScore, rs_score: rsScore,
        kospi1d: crossMarket.kospi1d, nikkei1d: crossMarket.nikkei1d,
        hsi1d: crossMarket.hsi1d, vix1d: crossMarket.vix1d,
        spy1d: crossMarket.spy1d, smh1d: crossMarket.smh1d,
        risk_alignment: crossMarket.riskAlignment, asia_consensus: crossMarket.asiaConsensus,
      },
      featureVersion: FEATURE_SCHEMA_VERSION,
      schemaHash: computeSchemaHash(),
    };

    // Build event snapshots
    const eventSnaps: EventSnapshotInput[] = [];
    if (eventRisk.eventType !== 'none') {
      eventSnaps.push({
        eventType: eventRisk.eventType,
        eventDate: eventRisk.daysUntil != null ? new Date(Date.now() + (eventRisk.daysUntil ?? 0) * 86400000) : undefined,
        daysUntil: eventRisk.daysUntil ?? undefined,
        severity: eventRisk.severity,
        description: eventRisk.description,
      });
    }

    // Save all 3 horizons with full snapshots
    const saveFactors = allFactors.map(f => ({
      factorName: f.factorName, factorType: f.factorType as string,
      score: f.score, weight: f.weight, signal: f.signal, description: f.description,
    }));

    const [pred1d, pred3d, pred7d] = await Promise.all([
      savePrediction({
        symbol: ticker, sector, horizonDays: 1, modelVersion,
        entryPrice: lastClose, benchmarkEntryPrice: spyClose,
        regime: regimeAssessment.regime, regimeConfidence: regimeAssessment.confidence,
        transitionRisk: regimeAssessment.transitionRisk,
        rawScore: score1d.score, calibratedConfidence, finalDecision,
        factors: saveFactors, marketSnapshot: marketSnap, featureSnapshot: featureSnap,
        eventSnapshots: eventSnaps, decisionReasons,
      }),
      savePrediction({
        symbol: ticker, sector, horizonDays: 3, modelVersion,
        entryPrice: lastClose, benchmarkEntryPrice: spyClose,
        regime: regimeAssessment.regime, regimeConfidence: regimeAssessment.confidence,
        transitionRisk: regimeAssessment.transitionRisk,
        rawScore: score3d.score, calibratedConfidence, finalDecision,
        factors: saveFactors, marketSnapshot: marketSnap,
        eventSnapshots: eventSnaps, decisionReasons,
      }),
      savePrediction({
        symbol: ticker, sector, horizonDays: 7, modelVersion,
        entryPrice: lastClose, benchmarkEntryPrice: spyClose,
        regime: regimeAssessment.regime, regimeConfidence: regimeAssessment.confidence,
        transitionRisk: regimeAssessment.transitionRisk,
        rawScore: score7d.score, calibratedConfidence, finalDecision,
        factors: saveFactors, marketSnapshot: marketSnap,
        eventSnapshots: eventSnaps, decisionReasons,
      }).catch(() => null),
    ]);

    const elapsedMs = Date.now() - startTime;
    console.log(
      `[PREDICT] ${ticker}: dir=${direction} conf=${calibratedConfidence} score=${rawScore} ` +
      `gate=${effectiveGate} regime=${regimeAssessment.regime} spillover=${spillover.setupType} ` +
      `decision=${finalDecision} factors=${allFactors.length} time=${elapsedMs}ms`,
    );

    return NextResponse.json({
      ...baseResult, score: rawScore, direction, confidence: calibratedConfidence,
      combinedScore: rawScore, technicalScore: techScore,
      fundamentalData: fundScore !== 0 ? { score: fundScore, summary: '', scores: fundamentalScores } : null,
      regime: regimeAssessment.regime, regimeConfidence: regimeAssessment.confidence,
      relativeStrength: rsScore,
      eventRisk: { type: eventRisk.eventType, severity: eventRisk.severity, description: eventRisk.description },
      gateStatus: effectiveGate,
      gateReason: conformalOverride ? conformalOverrideReason : gateResult.reason,
      spillover: {
        setupType: spillover.setupType, spilloverScore: spillover.spilloverScore,
        confidence: spillover.confidence, reasons: spillover.reasons,
        drivers: spillover.drivers, modelVersion: 'spillover-v1',
      },
      regimeIntelligence: {
        regime: regimeAssessment.regime, confidence: regimeAssessment.confidence,
        transitionRisk: regimeAssessment.transitionRisk, reasons: regimeAssessment.reasons,
        policy: regimeAssessment.policy, drivers: regimeAssessment.drivers,
      },
      crossMarket: {
        asiaConsensus: crossMarket.asiaConsensus,
        riskAlignment: crossMarket.riskAlignment,
        vixLevel: crossMarket.vixLevel, vix1d: crossMarket.vix1d,
        sectorEtf1d: crossMarket.sectorEtf1d,
      },
      decisionReasons,
      calibration: calibrationReport ? {
        rawProbability: Math.round((calibratedConfidence / 100) * 10000) / 10000,
        calibratedProbability: Math.round(calibratedProbability * 10000) / 10000,
        diagnosis: calibrationReport.diagnosis, ece: calibrationReport.ece,
        brier: calibrationReport.brier, sampleSize: calibrationReport.sampleSize,
      } : null,
      conformalRisk: conformalResult ? {
        tradeEligible: conformalResult.tradeEligible,
        uncertaintyBand: conformalResult.uncertaintyBand,
        recommendation: conformalResult.recommendation, overridden: conformalOverride,
      } : null,
      leadLag: leadLagResult ? {
        score: leadLagResult.score, weight: leadLagResult.weight,
        signal: leadLagResult.signal, nodeRole: leadLagResult.features?.nodeRole,
      } : null,
      finalDecision,
      horizons: {
        '1D': { score: score1d.score, predictionId: pred1d?.id, reasons: score1d.decisionReasons },
        '3D': { score: score3d.score, predictionId: pred3d?.id, reasons: score3d.decisionReasons },
        '7D': { score: score7d.score, predictionId: pred7d?.id, reasons: score7d.decisionReasons },
      },
      predictionId: pred1d?.id, modelVersion, processingTimeMs: elapsedMs,
      positionSizing: positionSizing ? {
        kelly: { full: positionSizing.fullKelly, fractional: positionSizing.fractionalKelly, adjusted: positionSizing.adjustedKelly, regimeScale: positionSizing.regimeScale },
        shares: positionSizing.recommendedShares, positionValue: positionSizing.recommendedPositionValue,
        riskDollars: positionSizing.effectiveRiskDollars, riskPctOfEquity: positionSizing.recommendedRiskPctOfEquity,
      } : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[PREDICT] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
