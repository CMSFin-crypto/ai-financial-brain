// ============================================================
// Regime Intelligence V1.5 - 7-state market classifier
// User-provided base: early-return logic, sigmoid confidence.
// Adapted: data mapping fixed for actual SpilloverFeatures ranges.
// ============================================================

import { analyzeGlobalSpillover } from './global-spillover';
import { getDailyHistory } from './global-market-data';
import { getRegimePolicy } from './regime-policy';

// --- Types ------------------------------------------------

export type MarketRegimeState =
  | 'BULL_LOW_VOL'
  | 'BULL_HIGH_VOL'
  | 'BEAR_LOW_VOL'
  | 'BEAR_HIGH_VOL'
  | 'PANIC_CAPITULATION'
  | 'RELIEF_RALLY'
  | 'RANGE_NEUTRAL';

export type RegimeDrivers = {
  spy1d: number;
  spy5d: number;
  spy20d: number;
  qqq1d: number;
  smh1d: number;
  vixLevel: number;
  vix1d: number;
  kospi1d: number;
  kospi2d: number;
  semisBreadth: number; // 0-1 ratio: 0 = all positive, 1 = all negative
  spilloverScore: number;
  marketAtrZ: number;
};

export type RegimeIntelligence = {
  regime: MarketRegimeState;
  confidence: number;
  transitionRisk: number;
  drivers: RegimeDrivers;
  reasons: string[];
  modelVersion: 'regime-v1';
};

// --- Cache (30 min) -----------------------------------------

let cached: RegimeIntelligence | null = null;
let cachedAt = 0;
const CACHE_MS = 30 * 60 * 1000;

// --- Helpers -------------------------------------------------

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

// --- Pure classifier (user's early-return logic) -------------
// semisBreadth: 0-1 ratio (0 = bullish breadth, 1 = all negative)
// vixLevel: absolute VIX close (e.g. 15, 22, 35)
// kospi returns: percentage points (e.g. -3.5, +1.2)
// spilloverScore: -100 to +100
// marketAtrZ: z-score (negative = low vol, positive = high vol)

export function classifyRegime(drivers: RegimeDrivers): MarketRegimeState {
  const {
    spy20d, qqq1d, smh1d, vixLevel, vix1d,
    kospi1d, kospi2d, semisBreadth,
    spilloverScore, marketAtrZ,
  } = drivers;

  // Trend & volatility composites
  const bullTrend = spy20d > 0 && qqq1d >= 0 && semisBreadth <= 0.5;
  const bearTrend = spy20d < 0 && qqq1d < 0;
  const highVol = vixLevel >= 20 || vix1d >= 2 || marketAtrZ >= 1.2;
  const lowVol = vixLevel <= 18 && vix1d <= 1 && marketAtrZ <= 0.8;

  // Panic: extreme Asia selloff, breadth crushed, vol spiking
  const panic =
    kospi2d <= -10 &&
    kospi1d <= -3 &&
    semisBreadth >= 0.80 &&
    spilloverScore <= -35 &&
    (vix1d >= 3 || marketAtrZ >= 1.5);

  // Relief: Asia selloff slowing, spillover flipping positive
  const relief =
    kospi2d <= -8 &&
    kospi1d > -2 &&
    spilloverScore >= 25 &&
    semisBreadth < 0.70 &&
    vix1d <= 3 &&
    marketAtrZ < 1.4;

  // Priority-ordered early returns
  if (panic) return 'PANIC_CAPITULATION';
  if (relief) return 'RELIEF_RALLY';
  if (bullTrend && lowVol) return 'BULL_LOW_VOL';
  if (bullTrend && highVol) return 'BULL_HIGH_VOL';
  if (bearTrend && lowVol) return 'BEAR_LOW_VOL';
  if (bearTrend && highVol) return 'BEAR_HIGH_VOL';
  return 'RANGE_NEUTRAL';
}

// --- Confidence scorer (user's sigmoid approach) --------------

export function scoreRegimeConfidence(
  drivers: RegimeDrivers,
  regime: MarketRegimeState,
): number {
  let score = 0;

  // Trend alignment strength
  const trendStrength =
    Math.abs(drivers.spy20d) +
    Math.abs(drivers.qqq1d) +
    Math.abs(drivers.smh1d);
  score += clamp(trendStrength / 3, 0, 10);

  // Spillover conviction
  score += Math.min(10, Math.abs(drivers.spilloverScore) / 10);

  // Volatility signal
  score += Math.min(8, Math.abs(drivers.marketAtrZ) * 4);

  // Regime-specific bonus (extreme regimes are more detectable)
  if (regime === 'PANIC_CAPITULATION') score += 15;
  if (regime === 'RELIEF_RALLY') score += 12;
  if (regime === 'BULL_LOW_VOL' || regime === 'BEAR_HIGH_VOL') score += 10;

  return clamp(sigmoid((score - 12) / 4), 0, 1);
}

// --- Transition risk estimator --------------------------------

export function estimateTransitionRisk(drivers: RegimeDrivers): number {
  const vol = Math.min(1, drivers.marketAtrZ / 2);
  const spill = Math.min(1, Math.abs(drivers.spilloverScore) / 100);
  const vixChange = Math.min(1, Math.abs(drivers.vix1d) / 5);
  return clamp(vol * 0.4 + spill * 0.35 + vixChange * 0.25, 0, 1);
}

// --- Main entry point ----------------------------------------

export async function detectRegimeState(params: {
  targetSymbol?: string;
  targetSector?: string;
}): Promise<RegimeIntelligence> {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_MS) return cached;

  const t0 = Date.now();
  try {
    // 1. Get spillover analysis (fetches Asia + US data internally)
    const spill = await analyzeGlobalSpillover(
      params.targetSymbol ?? 'SPY',
      params.targetSector,
    );

    // 2. Fetch SPY returns and VIX level (spillover features lack these)
    const [spyData, vixData] = await Promise.all([
      getDailyHistory('SPY', 30),
      getDailyHistory('VIX', 5),
    ]);

    // 3. Build drivers from available data
    const spy0 = spyData[0];
    const spy1d = spy0?.return1d ?? 0;
    const spy5d = spy0?.return5d ?? 0;
    const spy20d = spyData.length >= 21
      ? ((spy0.close - spyData[20].close) / spyData[20].close) * 100
      : (spy5d ?? 0);

    const vixLevel = vixData.length >= 2 ? vixData[0].close : 20;

    const drivers: RegimeDrivers = {
      spy1d,
      spy5d,
      spy20d,
      qqq1d: spill.features.qqq1d,
      smh1d: spill.features.smh1d,
      vixLevel,
      vix1d: spill.features.vix1d,
      kospi1d: spill.features.kospi1d,
      kospi2d: spill.features.kospi2d,
      semisBreadth: spill.features.semisBreadth, // 0-1 ratio
      spilloverScore: spill.spilloverScore,
      marketAtrZ: spill.features.targetAtrZ,
    };

    // 4. Classify, score, estimate risk
    const regime = classifyRegime(drivers);
    const confidence = scoreRegimeConfidence(drivers, regime);
    const transitionRisk = estimateTransitionRisk(drivers);

    // 5. Build human-readable reasons
    const reasons = buildReasons(drivers, regime);

    const result: RegimeIntelligence = {
      regime,
      confidence,
      transitionRisk,
      drivers,
      reasons,
      modelVersion: 'regime-v1',
    };

    cached = result;
    cachedAt = now;

    // Persist to DB (fire-and-forget)
    saveSnapshot(result).catch(() => {});

    console.log(
      `[REGIME] ${regime} (conf=${(confidence * 100).toFixed(0)}%, transRisk=${(transitionRisk * 100).toFixed(0)}%) [${Date.now() - t0}ms]`,
    );
    return result;
  } catch (err) {
    console.error('[REGIME] Detection failed:', err);
    return fallback(String(err));
  }
}

// --- Convenience: detection + policy in one call -------------

export async function getRegimeWithPolicy(params: {
  targetSymbol?: string;
  targetSector?: string;
}) {
  const intelligence = await detectRegimeState(params);
  const policy = getRegimePolicy(intelligence.regime);
  return { ...intelligence, policy };
}

// --- Reasons builder ------------------------------------------

function buildReasons(
  d: RegimeDrivers,
  regime: MarketRegimeState,
): string[] {
  const r: string[] = [];
  switch (regime) {
    case 'PANIC_CAPITULATION':
      r.push(`Breadth >= 80% negative (${(d.semisBreadth * 100).toFixed(0)}%)`);
      if (d.marketAtrZ >= 1.5) r.push(`ATR z=${d.marketAtrZ.toFixed(1)}`);
      if (d.vixLevel > 25) r.push(`VIX=${d.vixLevel.toFixed(1)}`);
      if (d.spilloverScore < -50) r.push(`Spillover ${d.spilloverScore.toFixed(0)}`);
      break;
    case 'RELIEF_RALLY':
      if (d.kospi2d < -5 && d.kospi1d > -2)
        r.push(`KOSPI decelerating (${d.kospi2d.toFixed(1)}% -> ${d.kospi1d.toFixed(1)}%)`);
      if (d.spilloverScore > 20) r.push(`Spillover +${d.spilloverScore.toFixed(0)}`);
      if (d.vix1d <= 0) r.push('VIX jo duke rritur');
      break;
    case 'BULL_LOW_VOL':
      if (d.vixLevel < 16) r.push(`VIX ulet=${d.vixLevel.toFixed(1)}`);
      if (d.marketAtrZ <= 0) r.push('Volatilitet i ulet');
      r.push('Trend pozitiv me volatility te ulet.');
      break;
    case 'BULL_HIGH_VOL':
      r.push('Trend pozitiv por volatility e larte.');
      if (d.vixLevel > 22) r.push(`VIX=${d.vixLevel.toFixed(1)}`);
      if (d.marketAtrZ > 1) r.push('ATR z>1');
      break;
    case 'BEAR_LOW_VOL':
      r.push('Trend negativ me volatility te ulet.');
      if (d.vixLevel < 18) r.push(`VIX=${d.vixLevel.toFixed(1)}`);
      break;
    case 'BEAR_HIGH_VOL':
      r.push('Trend negativ me volatility te larte.');
      if (d.vixLevel > 22) r.push(`VIX=${d.vixLevel.toFixed(1)}`);
      if (d.spilloverScore < -20) r.push(`Spillover ${d.spilloverScore.toFixed(0)}`);
      break;
    default:
      r.push('Treg i paqarte dhe pa avantazh te forte.');
      break;
  }
  if (r.length === 0) r.push('Default regime');
  return r;
}

// --- DB persistence (fire-and-forget) -------------------------

async function saveSnapshot(result: RegimeIntelligence): Promise<void> {
  try {
    const { prisma } = await import('./prisma');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = result.drivers;
    const data: Record<string, unknown> = {
      regimeState: result.regime as string,
      confidence: result.confidence,
      transitionRisk: result.transitionRisk,
      spyReturn1d: d.spy1d,
      spyReturn5d: d.spy5d,
      spyReturn20d: d.spy20d,
      vixLevel: d.vixLevel,
      vixReturn1d: d.vix1d,
      atrZScore: d.marketAtrZ,
      breadthPct: d.semisBreadth,
      spilloverScore: d.spilloverScore,
      drivers: result.reasons as unknown as Record<string, unknown>,
    };
    const existing = await prisma.regimeSnapshot.findUnique({ where: { date: today } });
    if (existing) {
      await prisma.regimeSnapshot.update({ where: { date: today }, data: data as any });
    } else {
      await prisma.regimeSnapshot.create({ data: { date: today, ...data } as any });
    }
  } catch (err) {
    console.error('[REGIME] DB save failed:', err);
  }
}

// --- Fallback -------------------------------------------------

function fallback(reason: string): RegimeIntelligence {
  return {
    regime: 'RANGE_NEUTRAL', confidence: 0.3, transitionRisk: 0.5,
    drivers: {
      spy1d: 0, spy5d: 0, spy20d: 0, qqq1d: 0, smh1d: 0,
      vixLevel: 20, vix1d: 0, kospi1d: 0, kospi2d: 0,
      semisBreadth: 0.5, spilloverScore: 0, marketAtrZ: 0,
    },
    reasons: [`Fallback: ${reason}`],
    modelVersion: 'regime-v1',
  };
}

// --- DB query helpers (for API routes) ------------------------

export async function getRegimeHistory(days: number = 30): Promise<{
  date: string;
  regimeState: string;
  confidence: number;
  transitionRisk: number;
}[]> {
  try {
    const { prisma } = await import('./prisma');
    const since = new Date();
    since.setDate(since.getDate() - days);
    const rows = await prisma.regimeSnapshot.findMany({
      where: { date: { gte: since } },
      orderBy: { date: 'desc' },
    });
    return rows.map(r => ({
      date: r.date.toISOString().split('T')[0],
      regimeState: r.regimeState,
      confidence: r.confidence,
      transitionRisk: r.transitionRisk,
    }));
  } catch {
    return [];
  }
}

export async function getRegimeAccuracyStats(): Promise<Record<string, {
  total: number;
  correct: number;
  winRate: number;
  avgReturn: number;
  noTradeCount: number;
}>> {
  try {
    const { prisma } = await import('./prisma');
    const preds = await prisma.prediction.findMany({
      where: { regimeState: { not: null }, wasCorrect: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    const stats: Record<string, { total: number; correct: number; winRate: number; avgReturn: number; noTradeCount: number }> = {};
    for (const p of preds) {
      const rs = p.regimeState || 'UNKNOWN';
      if (!stats[rs]) stats[rs] = { total: 0, correct: 0, winRate: 0, avgReturn: 0, noTradeCount: 0 };
      const s = stats[rs];
      s.total++;
      if (p.wasCorrect) s.correct++;
      if (p.gateStatus === 'NO_TRADE') s.noTradeCount++;
      if (p.returnPct != null) s.avgReturn += p.returnPct;
    }
    for (const s of Object.values(stats)) {
      s.winRate = s.total > 0 ? Math.round((s.correct / s.total) * 1000) / 10 : 0;
      s.avgReturn = s.total > 0 ? Math.round((s.avgReturn / s.total) * 100) / 100 : 0;
    }
    return stats;
  } catch {
    return {};
  }
}
