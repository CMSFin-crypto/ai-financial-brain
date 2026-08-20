import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { fetchHistoricalData } from '@/lib/alpha-vantage';
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

export const maxDuration = 60;

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
  trendQualityScore: number;
  sectorStrengthScore: number;
  timeframeAlignmentScore: number;
  timeframeAlignmentStatus: string;
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
  message?: string;
}

// ── Config ──
const CONFIG = {
  maxTotal: 9,
  maxPerHorizon: 3,
  maxPerSector: 2,
  minRawScore: 25,
  minConfidence: 0.58,
  maxTransitionRisk: 0.65,
  maxPredictionAgeHours: 24,
  minTrendQuality: 40,
  minSectorStrength: 35,
};

// ── Horizon remap: DB (1/5/20) → display (1/3/7) ──
const HORIZON_REMAP: Record<number, 1 | 3 | 7> = { 1: 1, 3: 3, 5: 3, 7: 7, 20: 7 };

export async function GET() {
  try {
    // 1. Fetch recent BUY predictions (PENDING, fresh)
    const cutoff = new Date(Date.now() - CONFIG.maxPredictionAgeHours * 60 * 60 * 1000);

    const predictions = await db.prediction.findMany({
      where: {
        finalDecision: 'BUY',
        evaluationStatus: 'PENDING',
        predictedAt: { gte: cutoff },
        rawScore: { gte: CONFIG.minRawScore },
        calibratedConfidence: { gte: CONFIG.minConfidence },
        transitionRisk: { lte: CONFIG.maxTransitionRisk },
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
      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        modelVersion: 'N/A',
        topStocks: [],
        totalScanned: 0,
        filteredOut: 0,
        message: 'Modeli nuk ka gjetur aktualisht asnje aksion qe permbush kriteret tona per swing trade.',
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

    // 4. Fetch historical data for quality scores (batch: 1 request per symbol)
    const candidateSymbols = [...new Set(Array.from(latestByKey.values()).map(p => p.symbol))];
    console.log(`[TOP-STOCKS] Fetching chart data for ${candidateSymbols.length} symbols...`);

    const priceDataMap = new Map<string, number[]>(); // symbol → closes[]
    const fetchPromises = candidateSymbols.map(async (sym) => {
      try {
        const data = await fetchHistoricalData(sym, '6mo', { forceRefresh: false });
        if (data && data.length >= 60) {
          priceDataMap.set(sym, data.map(d => d.close));
        }
      } catch (err: any) {
        console.log(`[TOP-STOCKS] No chart data for ${sym}: ${err.message}`);
      }
    });
    await Promise.allSettled(fetchPromises);
    console.log(`[TOP-STOCKS] Got chart data for ${priceDataMap.size}/${candidateSymbols.length} symbols`);

    // 5. Fetch SPY data for sector relative strength
    let spyCloses: number[] = [];
    try {
      const spyData = await fetchHistoricalData('SPY', '6mo', { forceRefresh: false });
      if (spyData && spyData.length >= 60) spyCloses = spyData.map(d => d.close);
    } catch {}

    // 6. Build cards with quality scoring
    const cards: TopStockCard[] = [];
    const sectorCounts = new Map<string, number>();
    const horizonCounts = new Map<number, number>();
    const candidates = Array.from(latestByKey.values()).sort((a, b) => b.rawScore - a.rawScore);

    for (const p of candidates) {
      if (cards.length >= CONFIG.maxTotal) break;

      const horizon = HORIZON_REMAP[p.horizonDays] ?? (p.horizonDays as 1 | 3 | 7);
      const sector = p.sector || 'Unknown';
      const tickerEvents = eventRiskMap.get(p.symbol) || [];
      const hasCriticalEvent = tickerEvents.some(e => e.severity === 'CRITICAL' && (e.daysUntil ?? 999) <= 2);

      // ── Compute 3 Quality Scores ──
      const closes = priceDataMap.get(p.symbol);
      let trendQualityScore = 50; // default neutral
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

        // 1) Trend Quality
        trendQualityScore = computeTrendQualityScore({
          price, sma20, sma50, sma200, return20d: ret20d, return60d: ret60d, isHigherHighsHigherLows: hhhl,
        });

        // 2) Sector Relative Strength (use SPY returns as proxy)
        const spyRet20d = spyCloses.length >= 21 ? computeReturn(spyCloses, 20) : 0;
        const spyRet60d = spyCloses.length >= 61 ? computeReturn(spyCloses, 60) : 0;
        sectorStrengthScore = computeSectorRelativeStrengthScore({
          stockReturn20d: ret20d,
          stockReturn60d: ret60d,
          spyReturn20d: spyRet20d,
          spyReturn60d: spyRet60d,
          sectorReturn20d: ret20d * 0.85, // proxy: sector ≈ stock * dampening
          sectorReturn60d: ret60d * 0.85,
        });

        // 3) Timeframe Alignment
        const tfInput = inferTimeframeAlignment(closes, sma20, sma50, sma200);
        const tfResult = computeTimeframeAlignmentScore(tfInput);
        tfScore = tfResult.score;
        tfStatus = tfResult.status;
      }

      // ── Quality Gates ──
      if (trendQualityScore < CONFIG.minTrendQuality) continue;
      if (sectorStrengthScore < CONFIG.minSectorStrength) continue;
      if (tfStatus === 'CONFLICTED') continue;
      if (hasCriticalEvent) continue;

      // Per-horizon / per-sector limits
      if ((horizonCounts.get(horizon) || 0) >= CONFIG.maxPerHorizon) continue;
      if ((sectorCounts.get(sector) || 0) >= CONFIG.maxPerSector) continue;

      // ── Risk Flags ──
      const riskFlags: string[] = [];
      if (tickerEvents.length > 0) {
        const ne = tickerEvents[0];
        riskFlags.push(`${ne.eventType} in ${ne.daysUntil}d`);
      }
      if ((p.transitionRisk ?? 0) > 0.5) riskFlags.push('High transition risk');
      if (p.regime?.includes('BEAR') || p.regime?.includes('PANIC')) riskFlags.push('Bearish regime');
      if ((p.regimeConfidence ?? 0) < 0.4) riskFlags.push('Low regime confidence');
      const sp = p.spilloverSignal;
      if (sp) {
        if ((sp.riskAlignment ?? 0) < -0.3) riskFlags.push('Negative spillover');
        if (sp.vixDirection === 'rising') riskFlags.push('VIX rising');
        if (sp.sectorTrend === 'weak') riskFlags.push('Weak sector');
      }
      if (riskFlags.length > 3) continue;

      // ── Top Reasons (quality-aware) ──
      const topReasons: string[] = [];

      // Trend quality reasons
      const c = priceDataMap.get(p.symbol);
      if (c && c.length >= 60) {
        const price = c[c.length - 1];
        const s20 = computeSMA(c, 20);
        const s50 = computeSMA(c, 50);
        if (price > s50 && s50 > computeSMA(c, 200)) topReasons.push('Price above SMA50 and SMA200');
        if (trendQualityScore >= 70) topReasons.push('Strong trend quality score');
        if (sectorStrengthScore >= 70) topReasons.push(`${sector} sector outperforming SPY`);
        if (tfStatus === 'ALIGNED') topReasons.push('Daily, 4H and weekly aligned');
        if (sp && (sp.asiaConsensus ?? 0) > 0.2) topReasons.push('Asia + sector aligned');
        if (sp && (sp.riskAlignment ?? 0) > 0.2) topReasons.push('Positive spillover signal');
      }

      // Factor-based reasons
      const bullishFactors = p.factors
        .filter(f => f.score > 0.5 && f.signal !== 'BEARISH')
        .sort((a, b) => b.score - a.score);
      for (const f of bullishFactors) {
        if (topReasons.length >= 3) break;
        const desc = f.description || `${f.factorName}: ${f.signal || 'bullish'}`;
        if (!topReasons.includes(desc)) topReasons.push(desc);
      }
      if (topReasons.length === 0) topReasons.push('Multiple bullish factors aligned');

      // ── Display Rank Score (new formula) ──
      const displayRankScore = computeDisplayRankScore({
        rawScore: p.rawScore,
        hybridConfidence: p.calibratedConfidence,
        trendQualityScore,
        sectorStrengthScore,
        timeframeAlignmentScore: tfScore,
        riskFlagsCount: riskFlags.length,
      });

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
        trendQualityScore,
        sectorStrengthScore,
        timeframeAlignmentScore: tfScore,
        timeframeAlignmentStatus: tfStatus,
        topReasons: topReasons.slice(0, 3),
        riskFlags,
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
