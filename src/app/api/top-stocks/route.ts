import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { fetchHistoricalData, type HistoricalDataPoint } from '@/lib/alpha-vantage';
import {
  computeTrendQualityScore,
  computeSectorRelativeStrengthScore,
  computeTimeframeAlignmentScore,
  computeDisplayRankScore,
  computeSMA,
  computeReturn,
  detectHigherHighsHigherLows,
  inferTimeframeAlignment,
} from '@/lib/swing-quality-scores';
import { fetchEarnings, computePEADScore } from '@/lib/pead-engine';
import { computeRelativeRanking, type StockMomentumProfile } from '@/lib/universe-ranking';
import { computeTradabilityScore } from '@/lib/tradability-score';
import { getRegimePolicy } from '@/lib/regime-policy';
import type { MarketRegimeState } from '@/lib/regime-intelligence';
import { computeAnalystRevisionScore } from '@/lib/analyst-revision-engine';

export const maxDuration = 120;

// ── Response Types ──
interface TopStockCard {
  symbol: string;
  company?: string;
  sector: string;
  horizonDays: 1 | 3 | 7;
  finalDecision: 'BUY';
  rawScore: number;
  hybridConfidence: number;
  displayRankScore: number;
  regime: string;
  regimeConfidence?: number;
  transitionRisk?: number;
  // Layer 1: Swing Quality
  trendQualityScore: number;
  sectorStrengthScore: number;
  timeframeAlignmentScore: number;
  timeframeAlignmentStatus: string;
  // Layer 2: PEAD
  peadScore: number;
  peadSignal: string;
  peadDriftActive: boolean;
  peadDaysSince: number | null;
  peadSurprisePct: number | null;
  // Layer 3: Universe Rank
  universeRankScore: number;
  universePercentile: number;
  isTopDecile: boolean;
  isTopQuintile: boolean;
  momentumRegime: string;
  // Layer 4: Tradability
  tradabilityScore: number;
  isTradeable: boolean;
  tradabilityRecommendation: string;
  estSlippageBps: number;
  // Layer 5: Analyst Revision
  analystRevisionScore: number;
  analystRevisionTrend: string;
  // Regime-aware
  activeRegimeThresholds: {
    confidenceFloor: number;
    trendQualityFloor: number;
    sectorStrengthFloor: number;
    tradabilityFloor: number;
  };
  // Display
  topReasons: string[];
  riskFlags: string[];
  updatedAt: string;
}

interface TopStocksResponse {
  generatedAt: string;
  modelVersion: string;
  topStocks: TopStockCard[];
  totalScanned: number;
  filteredOut: number;
  activeRegime?: string;
  regimeThresholdsApplied?: Record<string, number>;
  message?: string;
}

// ── Base Config ──
const BASE_CONFIG = {
  maxTotal: 9,
  maxPerHorizon: 3,
  maxPerSector: 2,
  minRawScore: 25,
  minConfidence: 0.58,
  maxTransitionRisk: 0.65,
  maxPredictionAgeHours: 24,
  minTrendQuality: 40,
  minSectorStrength: 35,
  minTradability: 35,
  minUniverseRank: 30,
};

// ── Horizon remap: DB (1/5/20) → display (1/3/7) ──
const HORIZON_REMAP: Record<number, 1 | 3 | 7> = { 1: 1, 3: 3, 5: 3, 7: 7, 20: 7 };

// ── Regime-Aware Thresholds ──
// In BULL_LOW_VOL: more permissive (lower floors, wider funnel)
// In BEAR_HIGH_VOL / PANIC: much more selective (higher floors, tighter gates)
// In RANGE_NEUTRAL: moderate selectivity

type RegimeThresholds = {
  confidenceFloor: number;
  trendQualityFloor: number;
  sectorStrengthFloor: number;
  tradabilityFloor: number;
  universeRankFloor: number;
  maxTransitionRisk: number;
  peadBonusWeight: number;  // extra weight for PEAD in display score
};

function getRegimeThresholds(regime: string): RegimeThresholds {
  // Map regime to thresholds
  switch (regime) {
    case 'BULL_LOW_VOL':
      return {
        confidenceFloor: 0.55,    // more permissive
        trendQualityFloor: 30,
        sectorStrengthFloor: 25,
        tradabilityFloor: 30,
        universeRankFloor: 25,
        maxTransitionRisk: 0.70,
        peadBonusWeight: 0.06,    // PEAD bonus matters more in trending markets
      };
    case 'BULL_HIGH_VOL':
      return {
        confidenceFloor: 0.58,
        trendQualityFloor: 35,
        sectorStrengthFloor: 30,
        tradabilityFloor: 35,
        universeRankFloor: 30,
        maxTransitionRisk: 0.60,
        peadBonusWeight: 0.05,
      };
    case 'BEAR_LOW_VOL':
      return {
        confidenceFloor: 0.65,    // much more selective
        trendQualityFloor: 55,
        sectorStrengthFloor: 50,
        tradabilityFloor: 45,
        universeRankFloor: 50,
        maxTransitionRisk: 0.50,
        peadBonusWeight: 0.03,
      };
    case 'BEAR_HIGH_VOL':
      return {
        confidenceFloor: 0.72,    // very selective
        trendQualityFloor: 60,
        sectorStrengthFloor: 55,
        tradabilityFloor: 50,
        universeRankFloor: 55,
        maxTransitionRisk: 0.45,
        peadBonusWeight: 0.02,
      };
    case 'PANIC_CAPITULATION':
      return {
        confidenceFloor: 0.80,    // extreme selectivity
        trendQualityFloor: 70,
        sectorStrengthFloor: 60,
        tradabilityFloor: 55,
        universeRankFloor: 60,
        maxTransitionRisk: 0.35,
        peadBonusWeight: 0.01,
      };
    case 'RELIEF_RALLY':
      return {
        confidenceFloor: 0.56,    // allow slightly lower — relief rallies create opportunities
        trendQualityFloor: 30,
        sectorStrengthFloor: 30,
        tradabilityFloor: 30,
        universeRankFloor: 25,
        maxTransitionRisk: 0.65,
        peadBonusWeight: 0.07,    // PEAD very valuable in relief rallies
      };
    case 'RANGE_NEUTRAL':
    default:
      return {
        confidenceFloor: 0.50,
        trendQualityFloor: 25,
        sectorStrengthFloor: 20,
        tradabilityFloor: 25,
        universeRankFloor: 20,
        maxTransitionRisk: 0.75,
        peadBonusWeight: 0.04,
      };
  }
}



export async function GET() {
  try {
    // 0. Detect current regime for dynamic thresholds
    let activeRegime = 'UNKNOWN';
    let regimeThresholds = getRegimeThresholds('RANGE_NEUTRAL');
    
    try {
      const latestRegime = await db.regimeSnapshot.findFirst({
        orderBy: { date: 'desc' },
      });
      if (latestRegime) {
        activeRegime = latestRegime.regimeState;
        regimeThresholds = getRegimeThresholds(activeRegime);
        console.log(`[TOP-STOCKS] Active regime: ${activeRegime}, thresholds: conf≥${(regimeThresholds.confidenceFloor * 100).toFixed(0)}% TQ≥${regimeThresholds.trendQualityFloor} TRAD≥${regimeThresholds.tradabilityFloor}`);
      }
    } catch (err: any) {
      console.log(`[TOP-STOCKS] Regime detection failed, using defaults: ${err.message}`);
    }

    // 1. Fetch recent BUY predictions (PENDING, fresh)
    const cutoff = new Date(Date.now() - BASE_CONFIG.maxPredictionAgeHours * 60 * 60 * 1000);

    const predictions = await db.prediction.findMany({
      where: {
        finalDecision: 'BUY',
        evaluationStatus: 'PENDING',
        predictedAt: { gte: cutoff },
        rawScore: { gte: 0 },
      },
      include: {
        factors: true,
        spilloverSignal: {
          select: {
            riskAlignment: true,
            asiaConsensus: true,
            vixDirection: true,
            sectorTrend: true,
            spilloverScore: true,
            confidence: true,
          },
        },
        marketSnapshots: {
          select: {
            regime: true,
            regimeConfidence: true,
            vixLevel: true,
          },
          take: 1,
        },
      },
      orderBy: { predictedAt: 'desc' },
    });

    if (predictions.length === 0) {
      console.log('[TOP-STOCKS] No DB predictions found.');
      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        modelVersion: 'N/A',
        topStocks: [],
        totalScanned: 0,
        filteredOut: 0,
        activeRegime,
        message: 'Nuk ka prediction-e aktive ne database. Ky seksion shfaq vetem rezultatet e modelit ML (7 shtresat). Per kandidate live te skanuar, shiko tab-in IBKR.',
      } satisfies TopStocksResponse);
    }

    const modelVersion = predictions[0]?.modelVersion || 'unknown';

    // 2. Event risk map
    const symbols = [...new Set(predictions.map(p => p.symbol))];
    const now = new Date();
    const events = await db.eventSnapshot.findMany({
      where: { ticker: { in: symbols }, eventDate: { gte: now }, severity: { in: ['HIGH', 'CRITICAL'] } },
      orderBy: { daysUntil: 'asc' },
    });

    const eventRiskMap = new Map<string, { severity: string; daysUntil: number | null; eventType: string }[]>();
    for (const e of events) {
      if (!eventRiskMap.has(e.ticker)) eventRiskMap.set(e.ticker, []);
      eventRiskMap.get(e.ticker)!.push({ severity: e.severity, daysUntil: e.daysUntil, eventType: e.eventType });
    }

    // 3. Deduplicate by symbol:displayHorizon
    const latestByKey = new Map<string, typeof predictions[0]>();
    for (const p of predictions) {
      const displayH = HORIZON_REMAP[p.horizonDays] ?? (p.horizonDays as 1 | 3 | 7);
      const key = `${p.symbol}:${displayH}`;
      const existing = latestByKey.get(key);
      if (!existing || p.predictedAt > existing.predictedAt) latestByKey.set(key, p);
    }

    // 4. Fetch historical data (full OHLCV for all scoring layers)
    const candidateSymbols = [...new Set(Array.from(latestByKey.values()).map(p => p.symbol))];
    console.log(`[TOP-STOCKS] Fetching chart data for ${candidateSymbols.length} symbols...`);

    const priceDataMap = new Map<string, HistoricalDataPoint[]>(); // symbol → full OHLCV
    const closeDataMap = new Map<string, number[]>(); // symbol → closes[]
    const fetchPromises = candidateSymbols.map(async (sym) => {
      try {
        const data = await fetchHistoricalData(sym, '6mo', { forceRefresh: false });
        if (data && data.length >= 60) {
          priceDataMap.set(sym, data);
          closeDataMap.set(sym, data.map(d => d.close));
        }
      } catch (err: any) {
        console.log(`[TOP-STOCKS] No chart data for ${sym}: ${err.message}`);
      }
    });
    await Promise.allSettled(fetchPromises);
    console.log(`[TOP-STOCKS] Got chart data for ${priceDataMap.size}/${candidateSymbols.length} symbols`);

    // 5. Fetch SPY data
    let spyCloses: number[] = [];
    let spyReturn20d = 0;
    let spyReturn60d = 0;
    try {
      const spyData = await fetchHistoricalData('SPY', '6mo', { forceRefresh: false });
      if (spyData && spyData.length >= 60) {
        spyCloses = spyData.map(d => d.close);
        spyReturn20d = computeReturn(spyCloses, 20);
        spyReturn60d = computeReturn(spyCloses, 60);
      }
    } catch {}

    // 6. Fetch PEAD data (earnings) in parallel
    console.log(`[TOP-STOCKS] Fetching PEAD data for ${candidateSymbols.length} symbols...`);
    const peadMap = new Map<string, Awaited<ReturnType<typeof computePEADScore>>>();
    const peadPromises = candidateSymbols.map(async (sym) => {
      try {
        const reports = await fetchEarnings(sym);
        const prices = priceDataMap.get(sym) || [];
        const pead = computePEADScore({
          symbol: sym,
          earningsReports: reports,
          priceHistory: prices,
          currentPrice: prices[prices.length - 1]?.close || 0,
        });
        peadMap.set(sym, pead);
      } catch (err: any) {
        console.log(`[TOP-STOCKS] PEAD failed for ${sym}: ${err.message}`);
      }
    });
    await Promise.allSettled(peadPromises);
    console.log(`[TOP-STOCKS] PEAD computed for ${peadMap.size} symbols`);

    // 6b. Compute Analyst Revision scores (reuses PEAD earnings cache)
    const analystMap = new Map<string, Awaited<ReturnType<typeof computeAnalystRevisionScore>>>();
    for (const sym of candidateSymbols) {
      try {
        const reports = await fetchEarnings(sym);
        if (reports.length >= 2) {
          analystMap.set(sym, computeAnalystRevisionScore({ symbol: sym, earningsReports: reports }));
        }
      } catch {}
    }

    // 7. Compute Tradability scores
    const tradabilityMap = new Map<string, Awaited<ReturnType<typeof computeTradabilityScore>>>();
    for (const sym of candidateSymbols) {
      const prices = priceDataMap.get(sym);
      if (prices && prices.length >= 20) {
        tradabilityMap.set(sym, computeTradabilityScore({
          symbol: sym,
          priceHistory: prices,
          currentPrice: prices[prices.length - 1].close,
        }));
      }
    }

    // 8. Compute Universe-Relative Ranking
    const momentumProfiles: StockMomentumProfile[] = [];
    for (const p of Array.from(latestByKey.values())) {
      const closes = closeDataMap.get(p.symbol);
      if (closes && closes.length >= 60) {
        momentumProfiles.push({
          symbol: p.symbol,
          sector: p.sector || 'Unknown',
          return5d: computeReturn(closes, 5),
          return20d: computeReturn(closes, 20),
          return60d: computeReturn(closes, 60),
          volume: priceDataMap.get(p.symbol)?.slice(-1)[0]?.volume || 0,
          marketCap: 0,
        });
      }
    }
    const universeRankMap = computeRelativeRanking(momentumProfiles, spyReturn20d, spyReturn60d);

    // 9. Build cards with ALL scoring layers
    const cards: TopStockCard[] = [];
    const sectorCounts = new Map<string, number>();
    const horizonCounts = new Map<number, number>();
    const candidates = Array.from(latestByKey.values()).sort((a, b) => b.rawScore - a.rawScore);

    for (const p of candidates) {
      if (cards.length >= BASE_CONFIG.maxTotal) break;

      const horizon = HORIZON_REMAP[p.horizonDays] ?? (p.horizonDays as 1 | 3 | 7);
      const sector = p.sector || 'Unknown';
      const tickerEvents = eventRiskMap.get(p.symbol) || [];
      const hasCriticalEvent = tickerEvents.some(e => e.severity === 'CRITICAL' && (e.daysUntil ?? 999) <= 2);

      // ── Layer 1: Swing Quality Scores ──
      const closes = closeDataMap.get(p.symbol);
      let trendQualityScore = 50;
      let sectorStrengthScore = 50;
      let tfScore = 40;
      let tfStatus = 'MIXED';

      if (closes && closes.length >= 60) {
        const price = closes[closes.length - 1];
        const sma20 = computeSMA(closes, 20);
        const sma50 = computeSMA(closes, 50);
        const sma200 = computeSMA(closes, 200);
        const ret20d = computeReturn(closes, 20);
        const ret60d = computeReturn(closes, 60);
        const hhhl = detectHigherHighsHigherLows(closes);

        trendQualityScore = computeTrendQualityScore({
          price, sma20, sma50, sma200, return20d: ret20d, return60d: ret60d, isHigherHighsHigherLows: hhhl,
        });

        sectorStrengthScore = computeSectorRelativeStrengthScore({
          stockReturn20d: ret20d, stockReturn60d: ret60d,
          spyReturn20d, spyReturn60d,
          sectorReturn20d: ret20d * 0.85,
          sectorReturn60d: ret60d * 0.85,
        });

        const tfInput = inferTimeframeAlignment(closes, sma20, sma50, sma200);
        const tfResult = computeTimeframeAlignmentScore(tfInput);
        tfScore = tfResult.score;
        tfStatus = tfResult.status;
      }

      // ── Layer 2: PEAD ──
      const pead = peadMap.get(p.symbol);
      const peadScore = pead?.peadScore ?? 0;
      const peadSignal = pead?.signal ?? 'NO_DATA';
      const peadDriftActive = pead?.driftActive ?? false;
      const peadDaysSince = pead?.daysSinceEarnings ?? null;
      const peadSurprisePct = pead?.lastSurprisePct ?? null;

      // ── Layer 3: Universe Rank ──
      const uniRank = universeRankMap.get(p.symbol);
      const universeRankScore = uniRank?.rankScore ?? 50;
      const universePercentile = uniRank?.universePercentile ?? 50;
      const isTopDecile = uniRank?.isTopDecile ?? false;
      const isTopQuintile = uniRank?.isTopQuintile ?? false;
      const momentumRegime = uniRank?.momentumRegime ?? 'FOLLOWING';

      // ── Layer 5: Analyst Revision ──
      const analyst = analystMap.get(p.symbol);
      const analystRevisionScore = analyst?.revisionScore ?? 0;
      const analystRevisionTrend = analyst?.trend ?? 'NO_DATA';

      // Analyst revision gate: STRONG_DOWN = filter out
      if (analystRevisionTrend === 'STRONG_DOWN') continue;

      // ── Layer 4: Tradability ──
      const trad = tradabilityMap.get(p.symbol);
      const tradabilityScore = trad?.tradabilityScore ?? 50;
      const isTradeable = trad?.isTradeable ?? true;
      const tradabilityRecommendation = trad?.recommendation ?? 'ACCEPTABLE';
      const estSlippageBps = trad?.estimatedSlippageBps ?? 5;

      // ═══════ HARD GATES ONLY ═══════
      if (hasCriticalEvent) continue;
      if (peadDriftActive && (peadSignal === 'SELL' || peadSignal === 'STRONG_SELL')) continue;

      // ── Risk Flags (enhanced) — includes soft gate warnings ──
      const riskFlags: string[] = [];
      if (tickerEvents.length > 0) {
        const ne = tickerEvents[0];
        riskFlags.push(`${ne.eventType} in ${ne.daysUntil}d`);
      }
      // Soft gates as warnings (not filters)
      if (trendQualityScore < regimeThresholds.trendQualityFloor) riskFlags.push(`Trend i dobet (${trendQualityScore})`);
      if (sectorStrengthScore < regimeThresholds.sectorStrengthFloor) riskFlags.push(`Sektor i dobet (${sectorStrengthScore})`);
      if (tfStatus === 'CONFLICTED') riskFlags.push('TF i konfliktuar');
      if (!isTradeable || tradabilityScore < regimeThresholds.tradabilityFloor) riskFlags.push(`Tradability e ulet (${tradabilityScore})`);
      if (universeRankScore < regimeThresholds.universeRankFloor) riskFlags.push(`Rank i ulet (${universeRankScore})`);
      if ((p.transitionRisk ?? 0) > 0.5) riskFlags.push('High transition risk');
      if (p.regime?.includes('BEAR') || p.regime?.includes('PANIC')) riskFlags.push('Bearish regime');
      if ((p.regimeConfidence ?? 0) < 0.4) riskFlags.push('Low regime confidence');
      if (tradabilityRecommendation === 'POOR' || tradabilityRecommendation === 'UNTRADEABLE') riskFlags.push(`Tradability: ${tradabilityRecommendation}`);
      if (momentumRegime === 'DECLINING') riskFlags.push('Momentum ne rënie');
      if (analyst?.riskFlags) riskFlags.push(...analyst.riskFlags.slice(0, 1));
      if (pead?.riskFlags) riskFlags.push(...pead.riskFlags.slice(0, 2));
      if (trad?.riskFlags) riskFlags.push(...trad.riskFlags.slice(0, 1));
      const sp = p.spilloverSignal;
      if (sp) {
        if ((sp.riskAlignment ?? 0) < -0.3) riskFlags.push('Negative spillover');
        if (sp.vixDirection === 'rising') riskFlags.push('VIX rising');
        if (sp.sectorTrend === 'weak') riskFlags.push('Weak sector');
      }
      // Deduplicate
      const uniqueFlags = [...new Set(riskFlags)];
      if (uniqueFlags.length > 6) continue;

      // Per-horizon / per-sector limits
      if ((horizonCounts.get(horizon) || 0) >= BASE_CONFIG.maxPerHorizon) continue;
      if ((sectorCounts.get(sector) || 0) >= BASE_CONFIG.maxPerSector) continue;

      // ── Top Reasons (all-layers) ──
      const topReasons: string[] = [];

      // PEAD reasons (highest priority when active)
      if (peadDriftActive && peadScore >= 15) {
        topReasons.push(`PEAD drift aktiv: +${peadSurprisePct?.toFixed(1)}% surprise, ${peadDaysSince}d pas earnings`);
      }
      if (isTopDecile) topReasons.push('Top decile i universit');
      else if (isTopQuintile) topReasons.push('Top quintile — lider relativ');

      // Trend + Quality reasons
      const c = closeDataMap.get(p.symbol);
      if (c && c.length >= 60) {
        const price = c[c.length - 1];
        const s20 = computeSMA(c, 20);
        const s50 = computeSMA(c, 50);
        if (price > s50 && s50 > computeSMA(c, 200)) topReasons.push('Price above SMA50 > SMA200');
        if (trendQualityScore >= 70) topReasons.push('Trend quality i lartë');
        if (sectorStrengthScore >= 70) topReasons.push(`${sector} outperformon SPY`);
        if (tfStatus === 'ALIGNED') topReasons.push('Multi-timeframe i alignuar');
        if (sp && (sp.asiaConsensus ?? 0) > 0.2) topReasons.push('Asia + sector aligned');
        if (sp && (sp.riskAlignment ?? 0) > 0.2) topReasons.push('Positive spillover signal');
      }

      // Analyst revision reasons
      if (analyst?.reasons) topReasons.push(...analyst.reasons.slice(0, 1));
      if (analystRevisionTrend === 'STRONG_UP') topReasons.push('Konsensusi i analystëve po ngrihet fort');
      else if (analystRevisionTrend === 'UP') topReasons.push('Revisionet pozitive — nxitje konsensusi');

      // Tradability reason
      if (tradabilityRecommendation === 'EXCELLENT') topReasons.push('Likuiditet i lartë, slippage i ulët');

      // Universe rank reasons
      if (uniRank?.reasons) topReasons.push(...uniRank.reasons.slice(0, 1));

      // Factor-based reasons
      const bullishFactors = p.factors
        .filter(f => f.score > 0.5 && f.signal !== 'BEARISH')
        .sort((a, b) => b.score - a.score);
      for (const f of bullishFactors) {
        if (topReasons.length >= 4) break;
        const desc = f.description || `${f.factorName}: ${f.signal || 'bullish'}`;
        if (!topReasons.includes(desc)) topReasons.push(desc);
      }
      if (topReasons.length === 0) topReasons.push('Multiple bullish factors aligned');

      // ── Display Rank Score (ENHANCED with 6 layers) ──
      // Base: rawScore*0.30 + confidence*0.20 + trendQuality*0.12 + sectorStrength*0.08 + alignment*0.08
      // New: pead*0.07 + universeRank*0.08 + tradability*0.07 — minus risk penalty
      const baseScore =
        p.rawScore * 0.30 +
        p.calibratedConfidence * 100 * 0.20 +
        trendQualityScore * 0.12 +
        sectorStrengthScore * 0.08 +
        tfScore * 0.08 +
        (peadDriftActive ? peadScore * regimeThresholds.peadBonusWeight : 0) +
        universeRankScore * 0.07 +
        tradabilityScore * 0.06 +
        (analystRevisionScore > 0 ? analystRevisionScore * 0.04 : 0);

      // Risk penalty
      const riskPenalty = uniqueFlags.length === 0 ? 3 : uniqueFlags.length <= 1 ? 1 : uniqueFlags.length <= 2 ? -1 : -4;

      // Regime transition penalty (from regime-policy scoreMultiplier)
      const regimePolicy = getRegimePolicy(activeRegime as MarketRegimeState);
      const regimeMultiplier = regimePolicy.scoreMultiplier;

      const displayRankScore = Math.round(
        Math.max(0, Math.min(100, (baseScore + riskPenalty) * regimeMultiplier))
      );

      const ageMs = Date.now() - p.predictedAt.getTime();
      const ageMin = Math.round(ageMs / 60000);
      const updatedAt = ageMin < 60 ? `${ageMin} min ago` : `${Math.round(ageMin / 60)}h ago`;

      cards.push({
        symbol: p.symbol,
        sector,
        horizonDays: horizon,
        finalDecision: 'BUY',
        rawScore: Math.round(p.rawScore),
        hybridConfidence: Math.round(p.calibratedConfidence * 100),
        displayRankScore,
        regime: p.regime || 'UNKNOWN',
        regimeConfidence: p.regimeConfidence ? Math.round(p.regimeConfidence * 100) : undefined,
        transitionRisk: p.transitionRisk ? Math.round(p.transitionRisk * 100) : undefined,
        // Layer 1
        trendQualityScore,
        sectorStrengthScore,
        timeframeAlignmentScore: tfScore,
        timeframeAlignmentStatus: tfStatus,
        // Layer 2: PEAD
        peadScore,
        peadSignal,
        peadDriftActive,
        peadDaysSince,
        peadSurprisePct,
        // Layer 3: Universe Rank
        universeRankScore,
        universePercentile,
        isTopDecile,
        isTopQuintile,
        momentumRegime,
        // Layer 4: Tradability
        tradabilityScore,
        isTradeable,
        tradabilityRecommendation,
        estSlippageBps,
        // Layer 5: Analyst Revision
        analystRevisionScore,
        analystRevisionTrend,
        // Regime-aware
        activeRegimeThresholds: {
          confidenceFloor: Math.round(regimeThresholds.confidenceFloor * 100),
          trendQualityFloor: regimeThresholds.trendQualityFloor,
          sectorStrengthFloor: regimeThresholds.sectorStrengthFloor,
          tradabilityFloor: regimeThresholds.tradabilityFloor,
        },
        // Display
        topReasons: topReasons.slice(0, 4),
        riskFlags: uniqueFlags,
        updatedAt,
      });

      horizonCounts.set(horizon, (horizonCounts.get(horizon) || 0) + 1);
      sectorCounts.set(sector, (sectorCounts.get(sector) || 0) + 1);
    }

    cards.sort((a, b) => b.displayRankScore - a.displayRankScore);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      modelVersion,
      topStocks: cards,
      totalScanned: predictions.length,
      filteredOut: predictions.length - cards.length,
      activeRegime,
      regimeThresholdsApplied: {
        confidenceFloor: Math.round(regimeThresholds.confidenceFloor * 100),
        trendQualityFloor: regimeThresholds.trendQualityFloor,
        sectorStrengthFloor: regimeThresholds.sectorStrengthFloor,
        tradabilityFloor: regimeThresholds.tradabilityFloor,
        universeRankFloor: regimeThresholds.universeRankFloor,
      },
    } satisfies TopStocksResponse);
  } catch (error) {
    console.error('[TOP-STOCKS] Error:', error);
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      modelVersion: 'N/A',
      topStocks: [],
      totalScanned: 0,
      filteredOut: 0,
      message: 'DB nuk eshte i disponueshem. Konfiguro DATABASE_URL ne Vercel.',
    } satisfies TopStocksResponse);
  }
}
