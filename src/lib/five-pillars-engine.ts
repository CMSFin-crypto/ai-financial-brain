// ============================================================
// Ross Cameron 5 Pillars Momentum Scanner — ENHANCED VERSION
//
// Bazuar EXAKTISHT në metodologjinë e Warrior Trading:
//   1. RELATIVE VOLUME ≥ 5x    — Volumi aktual vs mesatarja 30-ditore
//   2. DAILY % CHANGE ≥ 10%  — Momentum ditor i konfirmuar
//   3. NEWS CATALYST           — Flago ≥15% si me gjasë lajm
//   4. PRICE RANGE $1-$20       — Zona optimale për day trading
//   5. FLOAT < 10M SHARES       — Supply/demand imbalance
//
// Status system:
//   5/5 + catalyst VERIFIED → ELIGIBLE
//   4/5 + catalyst REVIEW   → WATCH
//   3/5 ose më pak          → REJECTED
//   Float mungon             → FLOAT_REVIEW
// ============================================================

import { fetchHistoricalData, type HistoricalDataPoint } from '@/lib/alpha-vantage';
import { analyzeHistoricalPatterns, computeHistoricalScore, type PatternAnalysis } from '@/lib/historical-pattern-engine';

// ─── Types ──────────────────────────────────────────────────

export interface PillarResult {
  passed: boolean;
  value: number;
  threshold: string;
  detail: string;
}

/** Output type matching the user spec exactly */
export interface FivePillarsCandidate {
  symbol: string;
  price: number;
  prevClose: number;
  dailyChangePct: number;
  currentVolume: number;
  averageVolume30d: number;
  relativeVolume: number;
  floatShares: number | null;          // null = unknown
  catalystStatus: 'VERIFIED' | 'REVIEW' | 'MISSING';
  catalystHeadline?: string;
  catalystSource?: string;
  catalystPublishedAt?: string;

  passesRvol: boolean;
  passesMomentum: boolean;
  passesPrice: boolean;
  passesFloat: boolean;
  passesCatalyst: boolean;

  pillarCount: number;
  status: 'ELIGIBLE' | 'WATCH' | 'REJECTED' | 'FLOAT_REVIEW';
  setupTags: string[];
  riskFlags: string[];

  // Extra fields for UI enrichment
  company?: string;
  sector?: string;
  momentumScore: number;
  strongMomentum: boolean;
  highMomentum: boolean;  // RVol≥5x AND change≥15%

  // Detailed pillar results for expanded view
  pillarDetails: {
    rvol: PillarResult;
    momentum: PillarResult;
    catalyst: PillarResult;
    price: PillarResult;
    float: PillarResult;
  };

  // Buy / Sell indicator fields
  entryZone: string;
  stopReference: string;
  takeProfitTargets: string[];

  // Historical Pattern Learning fields
  historicalScore: number;            // 0-100 composite score from historical analysis
  historicalPattern: PatternAnalysis;  // full historical analysis
}

// ─── Thresholds (EXACT Ross Cameron defaults) ──────────────

export const PILLAR_CONFIG = {
  relVolumeMin: 5,
  dailyChangeMin: 10,
  strongMomentumPct: 15,
  priceMin: 2,             // Ross Cameron: $2.00 minimum
  priceMax: 20,            // Ross Cameron: $20.00 maximum
  floatMaxMillions: 20,     // Ross Cameron: <20 million shares
  volumeLookback: 30,
};

// ─── Individual Pillar Checkers ──────────────────────────────

function checkPillar1_RelativeVolume(
  history: HistoricalDataPoint[],
  currentVolume: number
): { result: PillarResult; avgVolume30d: number } {
  if (history.length < 10) {
    return { result: { passed: false, value: 0, threshold: `≥ ${PILLAR_CONFIG.relVolumeMin}x`, detail: 'Të dhëna të pamjaftueshme' }, avgVolume30d: 0 };
  }

  const lookback = Math.min(PILLAR_CONFIG.volumeLookback, history.length - 1);
  const volumes = history.slice(-lookback - 1, -1).map(d => d.volume);
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;

  if (avgVolume === 0) {
    return { result: { passed: false, value: 0, threshold: `≥ ${PILLAR_CONFIG.relVolumeMin}x`, detail: 'Volumi mesatar = 0' }, avgVolume30d: 0 };
  }

  const todayVol = currentVolume > 0 ? currentVolume : history[history.length - 1].volume;
  const relVol = todayVol / avgVolume;

  return {
    avgVolume30d: avgVolume,
    result: {
      passed: relVol >= PILLAR_CONFIG.relVolumeMin,
      value: parseFloat(relVol.toFixed(1)),
      threshold: `≥ ${PILLAR_CONFIG.relVolumeMin}x`,
      detail: `RelVol: ${relVol.toFixed(1)}x (avg 30d: ${(avgVolume / 1e6).toFixed(1)}M, sot: ${(todayVol / 1e6).toFixed(1)}M)`,
    },
  };
}

function checkPillar2_DailyChange(dailyChangePct: number): PillarResult {
  return {
    passed: dailyChangePct >= PILLAR_CONFIG.dailyChangeMin,
    value: parseFloat(dailyChangePct.toFixed(2)),
    threshold: `≥ +${PILLAR_CONFIG.dailyChangeMin}%`,
    detail: dailyChangePct >= PILLAR_CONFIG.dailyChangeMin
      ? `Momentum: +${dailyChangePct.toFixed(2)}% — konfirmon kërkësen`
      : `Momentum vetëm +${dailyChangePct.toFixed(2)}% (duhet ≥ +${PILLAR_CONFIG.dailyChangeMin}%)`,
  };
}

function checkPillar3_Catalyst(dailyChangePct: number): { result: PillarResult; status: 'VERIFIED' | 'REVIEW' | 'MISSING'; headline?: string } {
  const hasStrongMomentum = dailyChangePct >= PILLAR_CONFIG.strongMomentumPct;
  const hasModerateMomentum = dailyChangePct >= PILLAR_CONFIG.dailyChangeMin;

  if (hasStrongMomentum) {
    return {
      status: 'REVIEW',
      headline: `+${dailyChangePct.toFixed(1)}% move — probable news catalyst (verify: earnings, FDA, contract, partnership)`,
      result: {
        passed: true,
        value: parseFloat(dailyChangePct.toFixed(2)),
        threshold: `≥ +${PILLAR_CONFIG.strongMomentumPct}% (lajm i mundshëm)`,
        detail: `+${dailyChangePct.toFixed(2)}% — auto-flagged: ka gjasë të ketë lajm`,
      },
    };
  }

  if (hasModerateMomentum) {
    return {
      status: 'MISSING',
      result: {
        passed: false,
        value: parseFloat(dailyChangePct.toFixed(2)),
        threshold: `≥ +${PILLAR_CONFIG.strongMomentumPct}% (lajm i mundshëm)`,
        detail: `+${dailyChangePct.toFixed(2)}% — verifiko manualisht lajmin`,
      },
    };
  }

  return {
    status: 'MISSING',
    result: {
      passed: false,
      value: parseFloat(dailyChangePct.toFixed(2)),
      threshold: `≥ +${PILLAR_CONFIG.strongMomentumPct}%`,
      detail: `+${dailyChangePct.toFixed(2)}% — asnjë sinjal lajmi`,
    },
  };
}

function checkPillar4_PriceRange(price: number): PillarResult {
  const inRange = price >= PILLAR_CONFIG.priceMin && price <= PILLAR_CONFIG.priceMax;
  return {
    passed: inRange,
    value: price,
    threshold: `$${PILLAR_CONFIG.priceMin}-$${PILLAR_CONFIG.priceMax}`,
    detail: inRange
      ? `Çmimi $${price.toFixed(2)} në zonën optimale ($2-$20)`
      : price > PILLAR_CONFIG.priceMax
        ? `Çmimi $${price.toFixed(2)} është më i lartë se $${PILLAR_CONFIG.priceMax}`
        : `Çmimi $${price.toFixed(2)} është më i ulët se $${PILLAR_CONFIG.priceMin}`,
  };
}

function checkPillar5_Float(floatSharesM: number | null): { result: PillarResult; hasData: boolean } {
  const hasData = floatSharesM !== null && floatSharesM > 0;
  const passed = hasData && floatSharesM! <= PILLAR_CONFIG.floatMaxMillions;

  return {
    hasData,
    result: {
      passed,
      value: floatSharesM || 0,
      threshold: `≤ ${PILLAR_CONFIG.floatMaxMillions}M`,
      detail: hasData
        ? passed
          ? `Float: ${floatSharesM!.toFixed(1)}M shares — supply/demand imbalance (<20M)`
          : `Float: ${floatSharesM!.toFixed(1)}M shares (duhet ≤ ${PILLAR_CONFIG.floatMaxMillions}M)`
        : 'Float i panjohur — verifiko manualisht në Finviz',
    },
  };
}

// ─── Status Determination ──────────────────────────────────

function computeStatus(
  passesRvol: boolean,
  passesMomentum: boolean,
  passesPrice: boolean,
  passesFloat: boolean,
  passesCatalyst: boolean,
  catalystStatus: 'VERIFIED' | 'REVIEW' | 'MISSING',
  floatHasData: boolean,
  pillarCount: number
): FivePillarsCandidate['status'] {
  // Float unknown → always FLOAT_REVIEW if other pillars look good
  if (!floatHasData && pillarCount >= 3) return 'FLOAT_REVIEW';
  if (!floatHasData && pillarCount >= 2 && (passesRvol || passesMomentum)) return 'FLOAT_REVIEW';

  // 5/5 + catalyst VERIFIED → ELIGIBLE
  if (pillarCount === 5 && catalystStatus === 'VERIFIED') return 'ELIGIBLE';
  // 5/5 + catalyst REVIEW → ELIGIBLE (auto-flagged, strong signal)
  if (pillarCount === 5 && catalystStatus === 'REVIEW') return 'ELIGIBLE';

  // 4/5 + catalyst REVIEW → WATCH
  if (pillarCount === 4 && catalystStatus === 'REVIEW') return 'WATCH';
  // 4/5 + catalyst VERIFIED → WATCH (one pillar missing)
  if (pillarCount === 4 && catalystStatus === 'VERIFIED') return 'WATCH';
  // 4/5 + catalyst MISSING → WATCH (missing catalyst but strong otherwise)
  if (pillarCount === 4) return 'WATCH';

  // 3/5 or less → REJECTED
  return 'REJECTED';
}

// ─── Setup Tags ────────────────────────────────────────────

function generateSetupTags(
  passesRvol: boolean,
  passesMomentum: boolean,
  passesPrice: boolean,
  passesFloat: boolean,
  dailyChangePct: number,
  relativeVolume: number,
  pillarCount: number
): string[] {
  const tags: string[] = [];

  if (dailyChangePct >= 10 && relativeVolume >= 3) {
    tags.push('Gap & Go');
  }
  if (passesRvol && passesPrice) {
    tags.push('VWAP Bounce');
  }
  if (pillarCount >= 4 && relativeVolume >= 5) {
    tags.push('HOD Breakout');
  }
  if (passesRvol && passesMomentum && passesPrice) {
    tags.push('ABCD Continuation');
  }
  if (passesFloat && relativeVolume >= 7) {
    tags.push('Float Squeeze');
  }
  if (dailyChangePct >= 15 && relativeVolume >= 5) {
    tags.push('Momentum Run');
  }
  if (dailyChangePct >= 20) {
    tags.push('Parabolic Move');
  }

  return tags;
}

// ─── Risk Flags ────────────────────────────────────────────

function generateRiskFlags(
  dailyChangePct: number,
  relativeVolume: number,
  price: number,
  floatShares: number | null,
  pillarCount: number,
  status: FivePillarsCandidate['status']
): string[] {
  const flags: string[] = [];

  // Always add paper-trade warning
  flags.push('PAPER-TRADE REVIEW — mos hyni me para reale pa prove');

  // High risk flags
  if (dailyChangePct >= 20) {
    flags.push('Rritje ekstreme ≥20% — rrezik i lartë i pullback');
  }
  if (relativeVolume >= 15) {
    flags.push('Volumi shumë i lartë — ka gjasë të jetë climax');
  }
  if (price <= 2) {
    flags.push('Penny stock zone — rrezik shumë i lartë');
  }
  if (floatShares !== null && floatShares > 0 && floatShares <= 3) {
    flags.push('Ultra-low float — volatility ekstrem, slippage i lartë');
  }
  if (pillarCount < 3) {
    flags.push('Setup i dobët — mungojnë shumë kriterë');
  }
  if (status === 'REJECTED') {
    flags.push('Status REJECTED — nuk plotëson kushtet minimale');
  }

  return flags;
}

// ─── Buy/Sell Indicators ──────────────────────────────────

function computeTradeIndicators(
  price: number,
  prevClose: number,
  dailyChangePct: number,
  relativeVolume: number,
  status: FivePillarsCandidate['status'],
  setupTags: string[],
  history: HistoricalDataPoint[]
): { entryZone: string; stopReference: string; takeProfitTargets: string[] } {
  // Entry zone
  let entryZone = 'N/A — jo kandidat';
  if (status === 'ELIGIBLE' || status === 'WATCH') {
    if (dailyChangePct >= 10 && setupTags.includes('Gap & Go')) {
      entryZone = `Mbi gap high: $${(price * 1.01).toFixed(2)} (nëse mban mbajtjen)`;
    } else if (setupTags.includes('VWAP Bounce')) {
      const vwapEstimate = prevClose * 1.05; // rough estimate
      entryZone = `VWAP bounce: ~$${vwapEstimate.toFixed(2)}`;
    } else {
      entryZone = `$${price.toFixed(2)} (current) — wait for confirmation`;
    }
  } else if (status === 'FLOAT_REVIEW') {
    entryZone = `Monitor: $${price.toFixed(2)} — verifiko float para hyrjes`;
  }

  // Stop reference
  let stopReference = 'N/A';
  if (history.length >= 5) {
    const recentLows = history.slice(-5).map(d => d.low);
    const recentLow = Math.min(...recentLows);
    stopReference = `VWAP / recent pullback low (~$${recentLow.toFixed(2)})`;
  } else {
    stopReference = `VWAP / prev close ($${prevClose.toFixed(2)})`;
  }

  // Take profit targets
  const targets: string[] = [];
  if (status === 'ELIGIBLE' || status === 'WATCH') {
    const risk = price - (prevClose * 0.97); // 3% below prev close as stop
    if (risk > 0) {
      targets.push(`TP1: $${(price + risk * 1.5).toFixed(2)} (1.5R)`);
      targets.push(`TP2: $${(price + risk * 2.5).toFixed(2)} (2.5R)`);
      targets.push(`TP3: $${(price + risk * 4).toFixed(2)} (4R)`);
    } else {
      targets.push(`TP1: $${(price * 1.05).toFixed(2)} (+5%)`);
      targets.push(`TP2: $${(price * 1.10).toFixed(2)} (+10%)`);
      targets.push(`TP3: $${(price * 1.15).toFixed(2)} (+15%)`);
    }
  }

  return { entryZone, stopReference, takeProfitTargets: targets };
}

// ─── Main Analysis Function ──────────────────────────────────

export async function analyzeFivePillarsCandidate(
  ticker: string,
  price: number,
  dailyChangePct: number,
  floatSharesM: number | null,
  currentVolume?: number,
): Promise<FivePillarsCandidate | null> {
  try {
    const history = await fetchHistoricalData(ticker, '3mo');
    if (!history || history.length < 15) {
      return null;
    }

    // Compute prevClose from historical data
    const prevClose = history.length >= 2 ? history[history.length - 2].close : price / (1 + dailyChangePct / 100);

    // Run all 5 pillar checks
    const { result: p1, avgVolume30d } = checkPillar1_RelativeVolume(history, currentVolume || 0);
    const p2 = checkPillar2_DailyChange(dailyChangePct);
    const { result: p3, status: catalystStatus, headline } = checkPillar3_Catalyst(dailyChangePct);
    const p4 = checkPillar4_PriceRange(price);
    const { result: p5, hasData: floatHasData } = checkPillar5_Float(floatSharesM);

    // Compute relative volume
    const todayVol = (currentVolume !== undefined && currentVolume > 0) ? currentVolume : history[history.length - 1].volume;
    const relVol = avgVolume30d > 0 ? todayVol / avgVolume30d : 0;

    // Boolean flags
    const passesRvol = p1.passed;
    const passesMomentum = p2.passed;
    const passesPrice = p4.passed;
    const passesFloat = p5.passed;
    const passesCatalyst = p3.passed;

    const pillarCount = [passesRvol, passesMomentum, passesCatalyst, passesPrice, passesFloat].filter(Boolean).length;
    const strongMomentum = dailyChangePct >= PILLAR_CONFIG.strongMomentumPct;
    const highMomentum = relVol >= PILLAR_CONFIG.relVolumeMin && dailyChangePct >= PILLAR_CONFIG.strongMomentumPct;

    // Status
    const status = computeStatus(passesRvol, passesMomentum, passesPrice, passesFloat, passesCatalyst, catalystStatus, floatHasData, pillarCount);

    // Setup tags & risk flags
    const setupTags = generateSetupTags(passesRvol, passesMomentum, passesPrice, passesFloat, dailyChangePct, relVol, pillarCount);
    const riskFlags = generateRiskFlags(dailyChangePct, relVol, price, floatSharesM, pillarCount, status);

    // Trade indicators
    const { entryZone, stopReference, takeProfitTargets } = computeTradeIndicators(price, prevClose, dailyChangePct, relVol, status, setupTags, history);

    // Momentum score (0-100)
    let momentumScore = 0;
    if (p1.passed) { momentumScore += 20; if (relVol >= 10) momentumScore += 5; }
    if (p2.passed) { momentumScore += 25; if (dailyChangePct >= 20) momentumScore += 5; }
    if (p3.passed) momentumScore += 10;
    if (p4.passed) momentumScore += 10;
    if (p5.passed) { momentumScore += 15; if (floatSharesM && floatSharesM <= 5) momentumScore += 5; }
    if (highMomentum) momentumScore += 5;
    momentumScore = Math.min(100, momentumScore);

    // ── Historical Pattern Learning ──
    const historicalPattern = analyzeHistoricalPatterns(history, relVol, dailyChangePct);
    const historicalScore = computeHistoricalScore(historicalPattern);

    // Boost momentum score with historical signal (up to +10 or -10)
    const historicalAdjustment = (historicalScore - 50) * 0.2;
    momentumScore = Math.min(100, Math.max(0, Math.round(momentumScore + historicalAdjustment)));

    return {
      symbol: ticker,
      price,
      prevClose,
      dailyChangePct: parseFloat(dailyChangePct.toFixed(2)),
      currentVolume: todayVol,
      averageVolume30d: avgVolume30d,
      relativeVolume: parseFloat(relVol.toFixed(1)),
      floatShares: floatSharesM,
      catalystStatus,
      catalystHeadline: headline,
      passesRvol,
      passesMomentum,
      passesPrice,
      passesFloat,
      passesCatalyst,
      pillarCount,
      status,
      setupTags,
      riskFlags,
      momentumScore,
      strongMomentum,
      highMomentum,
      pillarDetails: { rvol: p1, momentum: p2, catalyst: p3, price: p4, float: p5 },
      entryZone,
      stopReference,
      takeProfitTargets,
      historicalScore,
      historicalPattern,
    };
  } catch (err) {
    console.error(`[5-PILLARS] ${ticker}: Error:`, err);
    return null;
  }
}

// ─── Batch Analysis ──────────────────────────────────────────

export async function analyzeFivePillarsBatch(
  tickers: string[],
  prices: Record<string, { price: number; change: number }>,
  floatMap: Record<string, number | null>,
  concurrency = 5
): Promise<Record<string, FivePillarsCandidate>> {
  const results: Record<string, FivePillarsCandidate> = {};

  for (let i = 0; i < tickers.length; i += concurrency) {
    const batch = tickers.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (ticker) => {
        const priceData = prices[ticker];
        const price = priceData?.price || 0;
        if (price <= 0) return null;
        return analyzeFivePillarsCandidate(
          ticker,
          price,
          priceData?.change || 0,
          floatMap[ticker] ?? null
        );
      })
    );

    batchResults.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) {
        results[batch[idx]] = result.value;
      }
    });

    if (i + concurrency < tickers.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return results;
}

// ─── Legacy type for backward compatibility ──────────────────

export interface FivePillarsResult {
  ticker: string;
  company: string;
  sector: string;
  currentPrice: number;
  priceChange: number;
  pillarsPassed: number;
  automatedPassed: number;
  pillar1_relVolume: PillarResult;
  pillar2_dailyChange: PillarResult;
  pillar3_catalyst: PillarResult;
  pillar4_priceRange: PillarResult;
  pillar5_float: PillarResult;
  overallGrade: 'PERFECT' | 'STRONG' | 'GOOD' | 'LIMITED' | 'NONE';
  momentumScore: number;
  reasons: string[];
  warnings: string[];
  strongMomentum: boolean;
}
