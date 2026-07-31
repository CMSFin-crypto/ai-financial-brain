// ============================================================
// Global Spillover Engine
// Detects when movements in Asian/EU markets spill over to US
// semiconductors. Classifies as CONTINUATION, CAPITULATION, or
// RELIEF_RALLY based on deceleration patterns, volatility, and
// cross-market signals.
// ============================================================

import {
  getMarketHistory,
  pctChange,
  saveSnapshotsToDB,
  type EnrichedMarketData,
} from './global-market-data';

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
  spilloverScore: number;  // -100 to +100
  confidence: number;      // 0 to 1
  reasons: string[];
  drivers: SpilloverDrivers;
}

// ─── Score helpers ─────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Core scoring function based on Kospi, SMH, VIX, QQQ returns.
 * Score >= 40  → RELIEF_RALLY (panic decelerating, oversold bounce likely)
 * Score <= -40 → CONTINUATION (downtrend intact, more pain ahead)
 * Extreme volatility + negative → CAPITULATION
 * Otherwise → NEUTRAL
 */
function computeBaseScore(d: {
  kospi2d: number;
  kospi1d: number;
  smh1d: number;
  vix1d: number;
  qqq1d: number;
}): number {
  let score = 0;

  // Kospi 2D: heavy 2-day drop = bearish, but recovery = bullish
  if (d.kospi2d <= -10) score -= 35;
  else if (d.kospi2d <= -5) score -= 20;
  else if (d.kospi2d >= 0) score += 10;

  // Kospi 1D vs 2D: deceleration is the key relief signal
  // If 2D was very bad but 1D is mild → panic slowing → relief
  if (d.kospi2d < -8 && d.kospi1d > -2) score += 20;  // strong deceleration
  else if (d.kospi1d <= -5) score -= 20;                // still crashing

  // SMH: already reflects US semi positioning
  if (d.smh1d <= -5) score -= 20;
  else if (d.smh1d > 0) score += 15;

  // VIX: rising = fear, falling = calm
  if (d.vix1d >= 5) score -= 15;
  else if (d.vix1d <= -3) score += 10;

  // QQQ: broad tech direction
  if (d.qqq1d > 0) score += 10;
  else if (d.qqq1d < -2) score -= 5;

  return clamp(score, -100, 100);
}

/**
 * Detect capitulation: extreme 2-day drop with volatility spike
 * and no sign of stabilization.
 */
function isCapitulation(d: {
  kospi2d: number;
  kospi1d: number;
  smh1d: number;
  vix1d: number;
  smhAtr14?: number | null;
  smhClose?: number;
  smhSma20?: number | null;
}): boolean {
  // 2 consecutive strong down days
  const consecutiveDrop = d.kospi2d < -8 && d.kospi1d < -3;
  // VIX spiking hard (fear extreme)
  const vixSpike = d.vix1d >= 8;
  // SMH already heavily oversold
  const smhOversold = d.smhSma20 && d.smhClose
    ? d.smhClose < d.smhSma20 * 0.95
    : d.smh1d < -4;
  // SMH volatility elevated
  const highVol = d.smhAtr14 ? d.smhAtr14 > 0 : false;

  // Capitulation = extreme drop + extreme fear + oversold
  return consecutiveDrop && vixSpike && smhOversold;
}

/**
 * Build human-readable reasons for the analysis.
 */
function buildReasons(d: {
  kospi1d: number;
  kospi2d: number;
  smh1d: number;
  vix1d: number;
  qqq1d: number;
}, setup: SpilloverSetup): string[] {
  const reasons: string[] = [];

  if (d.kospi2d < -5) {
    reasons.push(`KOSPI -${Math.abs(d.kospi2d).toFixed(1)}% 2D`);
  }
  if (d.kospi2d < -8 && d.kospi1d > -2) {
    reasons.push(`KOSPI decelerating (${d.kospi1d.toFixed(1)}% 1D pas -${Math.abs(d.kospi2d).toFixed(1)}% 2D)`);
  }
  if (d.kospi1d <= -5) {
    reasons.push(`KOSPI akoma duke u rrëzuar (${d.kospi1d.toFixed(1)}% 1D)`);
  }
  if (d.smh1d < -3) {
    reasons.push(`SMH ${d.smh1d.toFixed(1)}% 1D — semis të goditura`);
  } else if (d.smh1d > 0) {
    reasons.push(`SMH +${d.smh1d.toFixed(1)}% 1D — semis stabilë`);
  }
  if (d.vix1d >= 5) {
    reasons.push(`VIX +${d.vix1d.toFixed(1)}% — rrezik i lartë`);
  } else if (d.vix1d <= -3) {
    reasons.push(`VIX ${d.vix1d.toFixed(1)}% — frika po ulet`);
  }
  if (d.qqq1d > 0) {
    reasons.push(`QQQ +${d.qqq1d.toFixed(1)}% — tech i gjelbër`);
  }

  // Setup-specific context
  if (setup === 'RELIEF_RALLY') {
    reasons.push('Paniku po ngadalësohet — potencial relief rally');
  } else if (setup === 'CONTINUATION') {
    reasons.push('Rënia vazhdon — asnjë shenjë stabilizimi');
  } else if (setup === 'CAPITULATION') {
    reasons.push('Panik ekstrem — kapitulim i mundshëm');
  }

  return reasons;
}

// ─── Main analysis function ────────────────────────────────────

/**
 * Analyze global spillover for a target US stock/ETF.
 * Uses KOSPI, SMH, QQQ, VIX data to classify the setup.
 */
export async function analyzeGlobalSpillover(
  targetSymbol: string,
  sector?: string
): Promise<SpilloverAnalysis> {
  const startTime = Date.now();

  // Fetch core instruments in parallel
  const [kospi, smh, qqq, vix] = await Promise.all([
    getMarketHistory('^KS11'),
    getMarketHistory('SMH'),
    getMarketHistory('QQQ'),
    getMarketHistory('VIX'),
  ]);

  // Default to zero if data unavailable
  const kospi1d = kospi.length >= 2 ? kospi[0].return1d : 0;
  const kospi2d = kospi.length >= 3 ? (kospi[0].return2d ?? 0) : 0;
  const kospi5d = kospi.length >= 6 ? (kospi[0].return5d ?? 0) : 0;
  const smh1d = smh.length >= 2 ? smh[0].return1d : 0;
  const smh2d = smh.length >= 3 ? (smh[0].return2d ?? 0) : 0;
  const vix1d = vix.length >= 2 ? vix[0].return1d : 0;
  const qqq1d = qqq.length >= 2 ? qqq[0].return1d : 0;

  const drivers: SpilloverDrivers = {
    kospi1d, kospi2d, kospi5d, smh1d, smh2d, vix1d, qqq1d,
  };

  // ── Heuristic: specific case of Kospi deceleration after heavy drop ──
  // This is the "missed" case: Kospi dropped hard, then slowed to ~1%,
  // US semis already beaten down → relief rally likely
  if (kospi2d <= -10 && kospi1d > -2 && smh1d < 0) {
    const analysis: SpilloverAnalysis = {
      setupType: 'RELIEF_RALLY',
      spilloverScore: 55,
      confidence: 0.7,
      reasons: buildReasons(drivers, 'RELIEF_RALLY'),
      drivers,
    };
    console.log(`[SPILLOVER] ${targetSymbol}: HEURISTIC RELIEF_RALLY (score=55) — kospi2d=${kospi2d.toFixed(1)}%, kospi1d=${kospi1d.toFixed(1)}%, smh1d=${smh1d.toFixed(1)}% [${Date.now() - startTime}ms]`);
    await saveSpilloverSignal(targetSymbol, sector, analysis);
    return analysis;
  }

  // ── General scoring ──
  const score = computeBaseScore({ kospi2d, kospi1d, smh1d, vix1d, qqq1d });

  // ── Check capitulation ──
  const capitulation = isCapitulation({
    kospi2d, kospi1d, smh1d, vix1d,
    smhAtr14: smh[0]?.atr14Val,
    smhClose: smh[0]?.close,
    smhSma20: smh[0]?.sma20Val,
  });

  // ── Determine setup type ──
  let setupType: SpilloverSetup = 'NEUTRAL';
  if (capitulation) {
    setupType = 'CAPITULATION';
  } else if (score >= 40) {
    setupType = 'RELIEF_RALLY';
  } else if (score <= -40) {
    setupType = 'CONTINUATION';
  }

  const confidence = Math.min(1, Math.abs(score) / 100);
  const reasons = buildReasons(drivers, setupType);

  const analysis: SpilloverAnalysis = {
    setupType,
    spilloverScore: score,
    confidence,
    reasons,
    drivers,
  };

  console.log(`[SPILLOVER] ${targetSymbol}: ${setupType} (score=${score}, conf=${confidence.toFixed(2)}) [${Date.now() - startTime}ms]`);

  // Save to DB
  await saveSpilloverSignal(targetSymbol, sector, analysis);

  // Save snapshots to DB
  const allData = [kospi, smh, qqq, vix].flat();
  if (allData.length > 0) {
    await saveSnapshotsToDB(allData).catch(() => {});
  }

  return analysis;
}

/**
 * Compute spillover score from pre-fetched drivers (for backtest).
 * This is a pure function — no I/O.
 */
export function computeSpilloverFromDrivers(drivers: SpilloverDrivers): {
  setupType: SpilloverSetup;
  spilloverScore: number;
  confidence: number;
} {
  // Check heuristic first
  if (drivers.kospi2d <= -10 && drivers.kospi1d > -2 && drivers.smh1d < 0) {
    return { setupType: 'RELIEF_RALLY', spilloverScore: 55, confidence: 0.7 };
  }

  const score = computeBaseScore({
    kospi2d: drivers.kospi2d,
    kospi1d: drivers.kospi1d,
    smh1d: drivers.smh1d,
    vix1d: drivers.vix1d,
    qqq1d: drivers.qqq1d,
  });

  if (score >= 40) return { setupType: 'RELIEF_RALLY', spilloverScore: score, confidence: Math.min(1, Math.abs(score) / 100) };
  if (score <= -40) return { setupType: 'CONTINUATION', spilloverScore: score, confidence: Math.min(1, Math.abs(score) / 100) };
  return { setupType: 'NEUTRAL', spilloverScore: score, confidence: Math.min(1, Math.abs(score) / 100) };
}

/**
 * Save spillover signal to DB.
 */
async function saveSpilloverSignal(
  targetSymbol: string,
  sector: string | undefined,
  analysis: SpilloverAnalysis
): Promise<void> {
  try {
    const { prisma } = await import('./prisma');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Avoid duplicate for same symbol+date
    const existing = await prisma.spilloverSignal.findFirst({
      where: { targetSymbol, date: today },
    });
    if (existing) {
      // Update existing
      await prisma.spilloverSignal.update({
        where: { id: existing.id },
        data: {
          setupType: analysis.setupType,
          spilloverScore: analysis.spilloverScore,
          confidence: analysis.confidence,
          reasons: analysis.reasons,
          drivers: analysis.drivers as unknown as Record<string, number>,
        },
      });
    } else {
      await prisma.spilloverSignal.create({
        data: {
          date: today,
          targetSymbol,
          sector: sector || 'SEMICONDUCTOR',
          setupType: analysis.setupType,
          spilloverScore: analysis.spilloverScore,
          confidence: analysis.confidence,
          reasons: analysis.reasons,
          drivers: analysis.drivers as unknown as Record<string, number>,
        },
      });
    }
  } catch (err) {
    console.error('[SPILLOVER] DB save failed:', err);
  }
}

/**
 * Get recent spillover signals from DB for a symbol.
 */
export async function getRecentSpilloverSignals(
  targetSymbol: string,
  limit: number = 30
): Promise<SpilloverAnalysis[]> {
  try {
    const { prisma } = await import('./prisma');
    const signals = await prisma.spilloverSignal.findMany({
      where: { targetSymbol },
      orderBy: { date: 'desc' },
      take: limit,
    });
    return signals.map(s => ({
      setupType: s.setupType as SpilloverSetup,
      spilloverScore: s.spilloverScore,
      confidence: s.confidence,
      reasons: (s.reasons as string[]) || [],
      drivers: (s.drivers as unknown as SpilloverDrivers) || {},
    }));
  } catch (err) {
    console.error(`[SPILLOVER] DB read failed for ${targetSymbol}:`, err);
    return [];
  }
}

/**
 * Get spillover accuracy stats: how often RELIEF_RALLY / CONTINUATION
 * calls were correct over the next 1-5 days.
 */
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
      where: {
        setupType: { in: ['RELIEF_RALLY', 'CONTINUATION'] },
      },
      orderBy: { date: 'desc' },
      take: 200,
    });

    let reliefTotal = 0, reliefCorrect = 0;
    let contTotal = 0, contCorrect = 0;
    let reliefReturns: number[] = [];
    let contReturns: number[] = [];

    for (const signal of signals) {
      // Look at SMH or targetSymbol performance 3 days after signal
      const target = signal.targetSymbol === 'SMH' ? 'SMH' : 'SMH'; // always use SMH as proxy
      const futureDate = new Date(signal.date);
      futureDate.setDate(futureDate.getDate() + 3);

      const futureSnap = await prisma.globalMarketSnapshot.findFirst({
        where: { symbol: target, date: { gte: futureDate } },
        orderBy: { date: 'asc' },
      });

      if (!futureSnap) continue;

      const entrySnap = await prisma.globalMarketSnapshot.findFirst({
        where: { symbol: target, date: { lte: new Date(signal.date) } },
        orderBy: { date: 'desc' },
      });

      if (!entrySnap) continue;

      const ret = pctChange(futureSnap.close, entrySnap.close);

      if (signal.setupType === 'RELIEF_RALLY') {
        reliefTotal++;
        reliefReturns.push(ret);
        if (ret > 0) reliefCorrect++;
      } else {
        contTotal++;
        contReturns.push(ret);
        if (ret < 0) contCorrect++;
      }
    }

    return {
      total: reliefTotal + contTotal,
      reliefRallyCorrect: reliefCorrect,
      reliefRallyTotal: reliefTotal,
      continuationCorrect: contCorrect,
      continuationTotal: contTotal,
      avgReturnAfterRelief: reliefReturns.length > 0
        ? reliefReturns.reduce((a, b) => a + b, 0) / reliefReturns.length : 0,
      avgReturnAfterContinuation: contReturns.length > 0
        ? contReturns.reduce((a, b) => a + b, 0) / contReturns.length : 0,
    };
  } catch (err) {
    console.error('[SPILLOVER] Accuracy calc failed:', err);
    return {
      total: 0, reliefRallyCorrect: 0, reliefRallyTotal: 0,
      continuationCorrect: 0, continuationTotal: 0,
      avgReturnAfterRelief: 0, avgReturnAfterContinuation: 0,
    };
  }
}
