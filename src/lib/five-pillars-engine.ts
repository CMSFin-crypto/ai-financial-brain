
// ============================================================
// Ross Cameron 5 Pillars Momentum Scanner — CORRECT VERSION
//
// Bazuar EXAKTISHT në metodologjinë e Warrior Trading:
//   1. RELATIVE VOLUME ≥ 5x    — Volumi aktual vs mesatarja 30-ditore
//   2. DAILY % CHANGE ≥ 10%  — Momentum ditor i konfirmuar
//   3. NEWS CATALYST           — Flago ≥15% si me gjasë lajm
//   4. PRICE RANGE $1-$20       — Zona optimale për day trading
//   5. FLOAT < 10M SHARES       — Supply/demand imbalance
//
// 4 prej 5 janë të automatizuara, Pillar 3 është manual check
// por ne e flagojmë automatikisht nëse çmimi është ≥15% (ka lajm)
// ============================================================

import { fetchHistoricalData, type HistoricalDataPoint } from '@/lib/alpha-vantage';

// ─── Types ──────────────────────────────────────────────────

export interface PillarResult {
  passed: boolean;
  value: number;
  threshold: string;
  detail: string;
}

export interface FivePillarsResult {
  ticker: string;
  company: string;
  sector: string;
  currentPrice: number;
  priceChange: number;
  pillarsPassed: number;       // 4 automated + 1 manual flag
  automatedPassed: number;      // only 1-4 (excludes catalyst)
  pillar1_relVolume: PillarResult;
  pillar2_dailyChange: PillarResult;
  pillar3_catalyst: PillarResult;    // manual — flagged if ≥15%
  pillar4_priceRange: PillarResult;
  pillar5_float: PillarResult;
  overallGrade: 'PERFECT' | 'STRONG' | 'GOOD' | 'LIMITED' | 'NONE';
  momentumScore: number; // 0-100 composite
  reasons: string[];
  warnings: string[];
  strongMomentum: boolean;  // ≥15% — likely has news catalyst
}

// ─── Thresholds (EXACT Ross Cameron defaults) ──────────────

const CONFIG = {
  relVolumeMin: 5,          // 5x mesatarja (Ross's minimum)
  dailyChangeMin: 10,       // 10% up from previous close
  strongMomentumPct: 15,    // ≥15% = likely news-driven (🔥 flag)
  priceMin: 1,
  priceMax: 20,             // Ross's sweet spot: $1-$20
  floatMaxMillions: 10,     // 10M shares (ultra-aggressive use 5M)
  volumeSpikeMin: 2,        // Volume spike 2x (Warrior Trading standard)
  volumeLookback: 30,       // 30 ditë për mesataren e volumit
};

// ─── Individual Pillar Checkers ──────────────────────────────

function checkPillar1_RelativeVolume(
  history: HistoricalDataPoint[],
  currentVolume: number
): PillarResult {
  if (history.length < 10) {
    return { passed: false, value: 0, threshold: `≥ ${CONFIG.relVolumeMin}x`, detail: 'Të dhëna të pamjaftueshme' };
  }

  // Calculate 30-day average volume
  const lookback = Math.min(CONFIG.volumeLookback, history.length - 1);
  const volumes = history.slice(-lookback - 1, -1).map(d => d.volume);
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;

  if (avgVolume === 0) {
    return { passed: false, value: 0, threshold: `≥ ${CONFIG.relVolumeMin}x`, detail: 'Volumi mesatar = 0' };
  }

  const todayVol = currentVolume > 0 ? currentVolume : history[history.length - 1].volume;
  const relVol = todayVol / avgVolume;

  return {
    passed: relVol >= CONFIG.relVolumeMin,
    value: parseFloat(relVol.toFixed(1)),
    threshold: `≥ ${CONFIG.relVolumeMin}x`,
    detail: `RelVol: ${relVol.toFixed(1)}x (avg 30d: ${(avgVolume / 1e6).toFixed(1)}M, sot: ${(todayVol / 1e6).toFixed(1)}M)`,
  };
}

function checkPillar2_DailyChange(priceChange: number): PillarResult {
  return {
    passed: priceChange >= CONFIG.dailyChangeMin,
    value: parseFloat(priceChange.toFixed(2)),
    threshold: `≥ +${CONFIG.dailyChangeMin}%`,
    detail: priceChange >= CONFIG.dailyChangeMin
      ? `Momentum: +${priceChange.toFixed(2)}% — konfirmon kërkësen`
      : `Momentum vetëm +${priceChange.toFixed(2)}% (duhet ≥ +${CONFIG.dailyChangeMin}%)`,
  };
}

function checkPillar3_Catalyst(priceChange: number): PillarResult {
  // Pillar 3 is MANUAL per Ross Cameron, but we auto-flag if ≥15%
  // because strong momentum almost always = news catalyst
  const hasStrongMomentum = priceChange >= CONFIG.strongMomentumPct;

  return {
    passed: hasStrongMomentum,
    value: parseFloat(priceChange.toFixed(2)),
    threshold: `≥ +${CONFIG.strongMomentumPct}% (lajm i mundshëm)`,
    detail: hasStrongMomentum
      ? `+${priceChange.toFixed(2)}% — ka gjasë të ketë lajm (earnings, FDA, kontratë)`
      : priceChange >= 10
        ? `+${priceChange.toFixed(2)}% — verifiko manualisht lajmin (manual check)`
        : `+${priceChange.toFixed(2)}% — asnjë sinjal lajmi`,
  };
}

function checkPillar4_PriceRange(price: number): PillarResult {
  const inRange = price >= CONFIG.priceMin && price <= CONFIG.priceMax;

  return {
    passed: inRange,
    value: price,
    threshold: `$${CONFIG.priceMin}-$${CONFIG.priceMax}`,
    detail: inRange
      ? `Çmimi $${price.toFixed(2)} në zonën optimale ($1-$20)`
      : price > CONFIG.priceMax
        ? `Çmimi $${price.toFixed(2)} është më i lartë se $${CONFIG.priceMax}`
        : `Çmimi $${price.toFixed(2)} është më i ulët se $${CONFIG.priceMin}`,
  };
}

function checkPillar5_Float(floatSharesM: number): PillarResult {
  // floatSharesM is in millions
  const hasData = floatSharesM > 0;
  const passed = hasData && floatSharesM <= CONFIG.floatMaxMillions;

  return {
    passed,
    value: floatSharesM,
    threshold: `≤ ${CONFIG.floatMaxMillions}M`,
    detail: hasData
      ? passed
        ? `Float: ${floatSharesM.toFixed(1)}M shares — supply/demand imbalance e fortë`
        : `Float: ${floatSharesM.toFixed(1)}M shares (duhet ≤ ${CONFIG.floatMaxMillions}M)`
      : 'N/A — verifiko manualisht në Finviz',
  };
}

// ─── Volume Spike Check (additional filter) ─────────────────

function checkVolumeSpike(
  history: HistoricalDataPoint[],
  currentVolume: number
): { isSpike: boolean; spikeRatio: number } {
  if (history.length < 20) return { isSpike: false, spikeRatio: 0 };

  const recent20 = history.slice(-20).map(d => d.volume);
  const avg20 = recent20.reduce((a, b) => a + b, 0) / recent20.length;
  if (avg20 === 0) return { isSpike: false, spikeRatio: 0 };

  const todayVol = currentVolume > 0 ? currentVolume : history[history.length - 1].volume;
  const ratio = todayVol / avg20;
  return { isSpike: ratio >= CONFIG.volumeSpikeMin, spikeRatio: parseFloat(ratio.toFixed(1)) };
}

// ─── Compute Overall Grade ──────────────────────────────────

function computeGrade(automatedPassed: number, catalystPassed: boolean): FivePillarsResult['overallGrade'] {
  // All 4 automated + catalyst = PERFECT
  if (automatedPassed >= 4 && catalystPassed) return 'PERFECT';
  // All 4 automated (catalyst manual) = STRONG
  if (automatedPassed >= 4) return 'STRONG';
  // 3 automated = GOOD
  if (automatedPassed >= 3) return 'GOOD';
  // 2 automated = LIMITED
  if (automatedPassed >= 2) return 'LIMITED';
  return 'NONE';
}

// ─── Compute Momentum Score (0-100) ─────────────────────────

function computeMomentumScore(
  pillars: PillarResult[],
  priceChange: number,
  isVolumeSpike: boolean
): number {
  let score = 0;

  // Each automated pillar contributes up to 20 points
  // Pillar 1 (RelVol) — up to 20
  const relVol = pillars[0]?.value || 0;
  if (pillars[0]?.passed) {
    score += 15;
    if (relVol >= 10) score += 5;      // 10x+ = massive
    else if (relVol >= 7) score += 3;   // 7x+ = very strong
    else score += 1;                     // 5x = minimum
  }

  // Pillar 2 (Daily Change) — up to 25
  if (pillars[1]?.passed) {
    score += 15;
    if (priceChange >= 20) score += 10;   // 20%+ = explosive
    else if (priceChange >= 15) score += 7; // 15%+ = very strong
    else score += 3;                       // 10%+ = minimum
  }

  // Pillar 3 (Catalyst) — bonus 5 if flagged
  if (pillars[2]?.passed) score += 5;

  // Pillar 4 (Price Range) — 10 if in range
  if (pillars[3]?.passed) score += 10;

  // Pillar 5 (Float) — up to 15
  if (pillars[4]?.passed) {
    score += 10;
    const floatVal = pillars[4]?.value || 0;
    if (floatVal > 0 && floatVal <= 5) score += 5; // Ultra-low float bonus
  }

  // Volume spike bonus
  if (isVolumeSpike) score += 5;

  return Math.max(0, Math.min(100, score));
}

// ─── Main Analysis Function ──────────────────────────────────

export async function analyzeFivePillars(
  ticker: string,
  currentPrice: number,
  priceChange: number,
  floatSharesM: number,
  currentVolume?: number
): Promise<FivePillarsResult | null> {
  try {
    const history = await fetchHistoricalData(ticker, '3mo');
    if (!history || history.length < 15) {
      return null;
    }

    // Run all 5 pillar checks
    const pillar1 = checkPillar1_RelativeVolume(history, currentVolume || 0);
    const pillar2 = checkPillar2_DailyChange(priceChange);
    const pillar3 = checkPillar3_Catalyst(priceChange);
    const pillar4 = checkPillar4_PriceRange(currentPrice);
    const pillar5 = checkPillar5_Float(floatSharesM);

    // Volume spike check (additional)
    const { isSpike } = checkVolumeSpike(history, currentVolume || 0);

    const automatedPillars = [pillar1, pillar2, pillar4, pillar5]; // pillars 1,2,4,5
    const automatedPassed = automatedPillars.filter(p => p.passed).length;
    const allPillars = [pillar1, pillar2, pillar3, pillar4, pillar5];
    const pillarsPassed = allPillars.filter(p => p.passed).length;

    const strongMomentum = priceChange >= CONFIG.strongMomentumPct;

    // Generate reasons
    const reasons: string[] = [];
    const warnings: string[] = [];

    // Pillar 1
    if (pillar1.passed) {
      reasons.push(`RelVol ${pillar1.value}x — volumi eksplodiv (${pillar1.value >= 10 ? 'masiv' : 'fortë'})`);
    } else if (pillar1.value > 0) {
      warnings.push(`RelVol vetëm ${pillar1.value}x (duhet ≥ ${CONFIG.relVolumeMin}x)`);
    }

    // Pillar 2
    if (pillar2.passed) {
      reasons.push(`Momentum +${priceChange.toFixed(2)}% — kërkësa e konfirmuar`);
    } else if (priceChange > 0) {
      warnings.push(`Momentum i ulët: +${priceChange.toFixed(2)}% (duhet ≥ +${CONFIG.dailyChangeMin}%)`);
    }

    // Pillar 3
    if (pillar3.passed) {
      reasons.push(`🔥 +${priceChange.toFixed(2)}% — ka gjasë lajmi (verifiko: earnings, FDA, kontrata)`);
    } else if (priceChange >= 10) {
      reasons.push(`Momentum i fortë — verifiko manualisht lajmin`);
    }

    // Pillar 4
    if (pillar4.passed) {
      reasons.push(`Çmimi $${currentPrice.toFixed(2)} në zonën $1-$20`);
    } else if (currentPrice > 20) {
      warnings.push(`Çmimi $${currentPrice.toFixed(2)} jashtë zonës (max $${CONFIG.priceMax})`);
    }

    // Pillar 5
    if (pillar5.passed) {
      reasons.push(`Float ${pillar5.value.toFixed(1)}M — supply/demand imbalance`);
    } else if (floatSharesM > 0) {
      warnings.push(`Float ${floatSharesM.toFixed(1)}M — shumë i lartë (max ${CONFIG.floatMaxMillions}M)`);
    } else {
      warnings.push(`Float N/A — verifiko në Finviz`);
    }

    // Volume spike
    if (isSpike) {
      reasons.push(`Volume spike — konfirmon momentum continuation`);
    }

    return {
      ticker,
      company: '',
      sector: '',
      currentPrice,
      priceChange,
      pillarsPassed,
      automatedPassed,
      pillar1_relVolume: pillar1,
      pillar2_dailyChange: pillar2,
      pillar3_catalyst: pillar3,
      pillar4_priceRange: pillar4,
      pillar5_float: pillar5,
      overallGrade: computeGrade(automatedPassed, pillar3.passed),
      momentumScore: computeMomentumScore(allPillars, priceChange, isSpike),
      reasons: reasons.slice(0, 5),
      warnings: warnings.slice(0, 3),
      strongMomentum,
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
  floatMap: Record<string, number>, // ticker -> float shares in millions
  concurrency = 5
): Promise<Record<string, FivePillarsResult>> {
  const results: Record<string, FivePillarsResult> = {};

  for (let i = 0; i < tickers.length; i += concurrency) {
    const batch = tickers.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (ticker) => {
        const priceData = prices[ticker];
        const price = priceData?.price || 0;
        if (price <= 0) return null;
        return analyzeFivePillars(
          ticker,
          price,
          priceData?.change || 0,
          floatMap[ticker] || 0
        );
      })
    );

    batchResults.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) {
        results[batch[idx]] = result.value;
      }
    });

    if (i + concurrency < tickers.length) {
      await new Promise(r => setTimeout(r, 250));
    }
  }

  return results;
}
