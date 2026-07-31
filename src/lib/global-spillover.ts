// ============================================================
// Global Spillover Engine V1 (Heuristic)
// Classifies Asia→US spillover as CONTINUATION, CAPITULATION,
// RELIEF_RALLY, or NEUTRAL based on 16 features.
// ============================================================

import { getDailyHistory, SEMI_TICKERS, saveMarketSnapshots } from './global-market-data';
import { buildSpilloverFeatures, type SpilloverFeatures, FEATURE_NAMES } from './spillover-features';
import type { EnrichedMarketData } from './global-market-data';

// ─── Types ────────────────────────────────────────────────────

export type SpilloverSetup = 'CONTINUATION' | 'CAPITULATION' | 'RELIEF_RALLY' | 'NEUTRAL';

export interface SpilloverDrivers {
  kospi1d: number;
  kospi2d: number;
  kospi5d: number;
  smh1d: number;
  smh2d: number;
  vix1d: number;
  qqq1d: number;
}

export interface SpilloverAnalysis {
  setupType: SpilloverSetup;
  spilloverScore: number;   // -100 to +100
  confidence: number;       // 0 to 1
  reasons: string[];
  features: SpilloverFeatures;
  drivers: SpilloverDrivers;
  modelVersion: 'spillover-v1';
}

// ─── Helpers ──────────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// ─── Detection functions ──────────────────────────────────────

function detectReliefRally(f: SpilloverFeatures): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Kospi 2D very negative, 1D much milder → deceleration
  if (f.kospi2d <= -10 && f.kospi1d > -2) {
    score += 35;
    reasons.push(`KOSPI decelerating (${f.kospi1d.toFixed(1)}% 1D pas -${Math.abs(f.kospi2d).toFixed(1)}% 2D)`);
  } else if (f.kospi2d <= -5 && f.kospi1d > -1) {
    score += 20;
    reasons.push(`KOSPI rënia po ngadalësohet`);
  }

  // Asia deceleration positive
  if (f.asiaDeceleration > 0.3) {
    score += 15;
    reasons.push('Paniku aziatik po ulet');
  }

  // SMH already down (oversold context)
  if (f.smh1d < 0 && f.smh2d < -3) {
    score += 15;
    reasons.push(`SMH e goditur (${f.smh2d.toFixed(1)}% 2D)`);
  }

  // Target oversold
  if (f.oversoldScore >= 50) {
    score += 20;
    reasons.push(`Target oversold (score=${f.oversoldScore.toFixed(0)})`);
  } else if (f.oversoldScore >= 30) {
    score += 10;
  }

  // VIX not accelerating
  if (f.vix1d <= 0) {
    score += 10;
    reasons.push('VIX jo duke rritur');
  }

  // QQQ flat or positive
  if (f.qqq1d > 0) {
    score += 10;
    reasons.push('QQQ i gjelbër — tech stabil');
  }

  // Semis breadth very negative (capitulation context → relief more likely)
  if (f.semisBreadth >= 0.8) {
    score += 5;
    reasons.push('Breadth shumë i dobët — potencial revert');
  }

  return { score, reasons };
}

function detectContinuation(f: SpilloverFeatures): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Kospi still crashing
  if (f.kospi1d <= -5) {
    score += 25;
    reasons.push(`KOSPI akoma duke u rrëzuar (${f.kospi1d.toFixed(1)}% 1D)`);
  } else if (f.kospi1d <= -3) {
    score += 15;
  }

  // Kospi 2D very bad
  if (f.kospi2d <= -10) {
    score += 20;
    reasons.push(`KOSPI -${Math.abs(f.kospi2d).toFixed(1)}% 2D`);
  } else if (f.kospi2d <= -5) {
    score += 10;
  }

  // SMH down
  if (f.smh1d <= -3) {
    score += 15;
    reasons.push(`SMH ${f.smh1d.toFixed(1)}% 1D`);
  }

  // VIX rising
  if (f.vix1d >= 5) {
    score += 15;
    reasons.push(`VIX +${f.vix1d.toFixed(1)}% — frika rritet`);
  } else if (f.vix1d >= 2) {
    score += 8;
  }

  // QQQ weak
  if (f.qqq1d < -2) {
    score += 10;
    reasons.push('QQQ i dobët');
  }

  // Asia NOT decelerating
  if (f.asiaDeceleration < -0.2) {
    score += 10;
    reasons.push('Paniku aziatik po përshpejtohet');
  }

  return { score, reasons };
}

function detectCapitulation(f: SpilloverFeatures): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Breadth extremely weak
  if (f.semisBreadth >= 0.9) {
    score += 25;
    reasons.push('Breadth <10% — gati të gjithë semis negativë');
  }

  // Extreme moves
  if (f.kospi2d < -12) {
    score += 20;
    reasons.push('KOSPI 2D ekstrem');
  }
  if (f.smh2d < -8) {
    score += 15;
    reasons.push('SMH 2D ekstrem');
  }

  // ATR z-score very high
  if (f.targetAtrZ > 2.0) {
    score += 20;
    reasons.push('Volatilitet ekstrem (ATR z-score >2)');
  } else if (f.targetAtrZ > 1.5) {
    score += 10;
  }

  // VIX spike
  if (f.vix1d >= 8) {
    score += 15;
    reasons.push('VIX spike >8%');
  }

  // No stabilization sign
  if (f.asiaDeceleration <= 0) {
    score += 10;
    reasons.push('Asnjë shenjë stabilizimi nga Azia');
  }

  return { score, reasons };
}

// ─── Scoring ──────────────────────────────────────────────────

function scoreSpillover(f: SpilloverFeatures): {
  setupType: SpilloverSetup;
  spilloverScore: number;
  confidence: number;
  reasons: string[];
} {
  const relief = detectReliefRally(f);
  const cont = detectContinuation(f);
  const cap = detectCapitulation(f);

  const reasons = [...relief.reasons, ...cont.reasons, ...cap.reasons];
  const score = clamp(relief.score - cont.score - cap.score, -100, 100);

  // Determine setup type
  let setupType: SpilloverSetup = 'NEUTRAL';
  if (cap.score >= 50 && cont.score >= 30) {
    setupType = 'CAPITULATION';
  } else if (score >= 30) {
    setupType = 'RELIEF_RALLY';
  } else if (score <= -30) {
    setupType = 'CONTINUATION';
  }

  // Confidence from absolute score
  const confidence = Math.min(1, Math.abs(score) / 80);

  // Capitulation overrides if extreme
  if (setupType === 'CAPITULATION') {
    return {
      setupType,
      spilloverScore: clamp(-score - 20, -100, -20),
      confidence: Math.min(1, cap.score / 70),
      reasons: cap.reasons,
    };
  }

  return { setupType, spilloverScore: score, confidence, reasons };
}

// ─── Main analysis (with I/O) ────────────────────────────────

export async function analyzeGlobalSpillover(
  targetSymbol: string,
  sector?: string
): Promise<SpilloverAnalysis> {
  const startTime = Date.now();

  // Fetch all data in parallel
  const [kospi, nikkei, hsi, smh, qqq, vix, target] = await Promise.all([
    getDailyHistory('^KS11'),
    getDailyHistory('^N225'),
    getDailyHistory('^HSI'),
    getDailyHistory('SMH'),
    getDailyHistory('QQQ'),
    getDailyHistory('VIX'),
    getDailyHistory(targetSymbol),
  ]);

  // Also fetch individual semis for breadth (best-effort)
  const semiResults = await Promise.allSettled(
    SEMI_TICKERS.map(t => getDailyHistory(t, 60))
  );
  const semiDataMap: Record<string, EnrichedMarketData[]> = {};
  SEMI_TICKERS.forEach((t, i) => {
    if (semiResults[i].status === 'fulfilled' && semiResults[i].value.length > 0) {
      semiDataMap[t] = semiResults[i].value;
    }
  });

  // Build features
  const features = buildSpilloverFeatures({
    kospi, nikkei, hsi, smh, qqq, vix, target, semiDataMap,
  });

  // Score
  const result = scoreSpillover(features);

  // Build drivers for backward compat
  const drivers: SpilloverDrivers = {
    kospi1d: features.kospi1d,
    kospi2d: features.kospi2d,
    kospi5d: features.kospi5d,
    smh1d: features.smh1d,
    smh2d: features.smh2d,
    vix1d: features.vix1d,
    qqq1d: features.qqq1d,
  };

  const analysis: SpilloverAnalysis = {
    setupType: result.setupType,
    spilloverScore: result.spilloverScore,
    confidence: result.confidence,
    reasons: result.reasons,
    features,
    drivers,
    modelVersion: 'spillover-v1',
  };

  console.log(`[SPILLOVER-V1] ${targetSymbol}: ${result.setupType} (score=${result.spilloverScore}, conf=${result.confidence.toFixed(2)}) [${Date.now() - startTime}ms]`);

  // Persist to DB
  await saveSignalToDB(targetSymbol, sector, analysis).catch(() => {});

  // Save snapshots
  const allArrays = [kospi, nikkei, hsi, smh, qqq, vix, target, ...Object.values(semiDataMap)];
 await saveMarketSnapshots(allArrays).catch(() => {});

  return analysis;
}

// ─── Pure scoring for backtest (no I/O) ───────────────────────

export function computeSpilloverFromDrivers(drivers: SpilloverDrivers): {
  setupType: SpilloverSetup;
  spilloverScore: number;
  confidence: number;
} {
  // Reconstruct minimal features from drivers (back-compat)
  const f: SpilloverFeatures = {
    kospi1d: drivers.kospi1d,
    kospi2d: drivers.kospi2d,
    kospi5d: drivers.kospi5d,
    nikkei1d: 0, hsi1d: 0,
    smh1d: drivers.smh1d,
    smh2d: drivers.smh2d,
    qqq1d: drivers.qqq1d,
    vix1d: drivers.vix1d,
    target1d: drivers.smh1d,
    target2d: drivers.smh2d,
    targetDistanceFromSma20: 0,
    targetAtrZ: 0,
    semisBreadth: 0.5,
    asiaDeceleration: 0,
    oversoldScore: 0,
  };
  const result = scoreSpillover(f);
  return {
    setupType: result.setupType,
    spilloverScore: result.spilloverScore,
    confidence: result.confidence,
  };
}

/** Score from full features (used by backtest with full data) */
export function computeSpilloverFromFeatures(f: SpilloverFeatures): {
  setupType: SpilloverSetup;
  spilloverScore: number;
  confidence: number;
} {
  const result = scoreSpillover(f);
  return {
    setupType: result.setupType,
    spilloverScore: result.spilloverScore,
    confidence: result.confidence,
  };
}

// ─── DB persistence ────────────────────────────────────────────

async function saveSignalToDB(
  targetSymbol: string,
  sector: string | undefined,
  analysis: SpilloverAnalysis
): Promise<void> {
  try {
    const { prisma } = await import('./prisma');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await prisma.spilloverSignal.findFirst({
      where: { targetSymbol, date: today, modelVersion: 'spillover-v1' },
    });

    const data = {
      setupType: analysis.setupType,
      spilloverScore: analysis.spilloverScore,
      confidence: analysis.confidence,
      reasons: analysis.reasons,
      features: analysis.features as unknown as Record<string, number>,
    };

    if (existing) {
      await prisma.spilloverSignal.update({ where: { id: existing.id }, data });
    } else {
      await prisma.spilloverSignal.create({
        data: {
          date: today,
          targetSymbol,
          targetSector: sector || 'SEMICONDUCTOR',
          modelVersion: 'spillover-v1',
          ...data,
        },
      });
    }
  } catch (err) {
    console.error('[SPILLOVER-V1] DB save failed:', err);
  }
}

// ─── Accuracy stats ───────────────────────────────────────────

export async function getSpilloverAccuracy(): Promise<{
  total: number;
  reliefRallyCorrect: number;
  reliefRallyTotal: number;
  continuationCorrect: number;
  continuationTotal: number;
  avgReturnAfterRelief: number;
  avgReturnAfterContinuation: number;
}> {
  try {
    const { prisma } = await import('./prisma');
    const signals = await prisma.spilloverSignal.findMany({
      where: { setupType: { in: ['RELIEF_RALLY', 'CONTINUATION'] } },
      orderBy: { date: 'desc' },
      take: 200,
    });
    let rt = 0, rc = 0, ct = 0, cc = 0;
    let relRet: number[] = [], contRet: number[] = [];

    for (const sig of signals) {
 const futureDate = new Date(sig.date);
      futureDate.setDate(futureDate.getDate() + 3);
      const futSnap = await prisma.globalMarketSnapshot.findFirst({
        where: { symbol: 'SMH', date: { gte: futureDate } },
        orderBy: { date: 'asc' },
      });
      if (!futSnap) continue;
      const entrySnap = await prisma.globalMarketSnapshot.findFirst({
        where: { symbol: 'SMH', date: { lte: new Date(sig.date) } },
        orderBy: { date: 'desc' },
      });
      if (!entrySnap) continue;
      const ret = ((futSnap.close - entrySnap.close) / entrySnap.close) * 100;
      if (sig.setupType === 'RELIEF_RALLY') {
        rt++; relRet.push(ret); if (ret > 0) rc++;
      } else {
        ct++; contRet.push(ret); if (ret < 0) cc++;
      }
    }
    return {
      total: rt + ct,
      reliefRallyCorrect: rc, reliefRallyTotal: rt,
      continuationCorrect: cc, continuationTotal: ct,
      avgReturnAfterRelief: relRet.length > 0 ? relRet.reduce((a, b) => a + b, 0) / relRet.length : 0,
      avgReturnAfterContinuation: contRet.length > 0 ? contRet.reduce((a, b) => a + b, 0) / contRet.length : 0,
    };
  } catch (err) {
    console.error('[SPILLOVER] Accuracy failed:', err);
    return { total: 0, reliefRallyCorrect: 0, reliefRallyTotal: 0, continuationCorrect: 0, continuationTotal: 0, avgReturnAfterRelief: 0, avgReturnAfterContinuation: 0 };
  }
}

// Re-export pctChange for backtest use
export { pctChange } from './global-market-data';
