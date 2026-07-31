// ============================================================
// Regime Intelligence V1 — 7-state market classifier
// Combines returns, volatility, breadth, VIX, spillover, event risk.
// This is the ORCHESTRATOR layer — not just another indicator.
// ============================================================

import { getDailyHistory, type EnrichedMarketData } from './global-market-data';
import { rollingZScore } from './spillover-features';
import type { SpilloverAnalysis } from './global-spillover';
import type { EventRiskResult } from './event-risk';

// ─── Types ────────────────────────────────────────────────────

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
  semisBreadth: number;
  spilloverScore: number;
  eventRiskScore: number;
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
// ─── Cache ────────────────────────────────────────────────────

let cached: RegimeIntelligence | null = null;
let cachedAt = 0;
const CACHE_MS = 30 * 60 * 1000; // 30 min

// ─── Main entry point ──────────────────────────────────────

export async function detectRegimeState(params: {
  targetSymbol?: string;
  targetSector?: string;
  spillover?: SpilloverAnalysis;
  eventRisk?: EventRiskResult;
}): Promise<RegimeIntelligence> {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_MS) return cached;

  const t0 = Date.now();
  try {
    const [spy, qqq, vix, smh, kospi] = await Promise.all([
      getDailyHistory('SPY', 300),
      getDailyHistory('QQQ', 200),
      getDailyHistory('VIX', 200),
      getDailyHistory('SMH', 200),
      getDailyHistory('^KS11', 200),
    ]);

    if (spy.length < 60) return fallback('Data e pamjaftueshme');

    // ── Build drivers ──────────────────────────────────
    const spy0 = spy[0];
    const sR = [...spy].reverse();

    const spy1d = spy0.return1d;
    const spy5d = spy0.return5d ?? 0;
    const spy20d = spy0.return5d != null && spy0.return2d != null
      ? spy0.return5d + spy0.return2d
      : (spy0.return5d ?? 0);

    const qqq1d = qqq.length >= 2 ? qqq[0].return1d : 0;
    const smh1d = smh.length >= 2 ? smh[0].return1d : 0;
    const vixLevel = vix.length >= 2 ? vix[0].close : 20;
    const vix1d = vix.length >= 2 ? vix[0].return1d : 0;
    const kospi1d = kospi.length >= 2 ? kospi[0].return1d : 0;
    const kospi2d = kospi.length >= 3 ? (kospi[0].return2d ?? 0) : 0;

    // ATR z-score (SPY)
    const atrVals: number[] = [];
    for (let i = 0; i < Math.min(sR.length, 60); i++) {
      const a = sR[sR.length - 1 - i]?.atr14;
      if (a != null && a > 0) atrVals.push(a);
    }
    const marketAtrZ = atrVals.length >= 20 ? rollingZScore(atrVals, 20) : 0;

    // Semis breadth: % of semis negative yesterday
    const semisBreadth = smh1d < 0 && qqq1d > 0 ? 0.7
      : smh1d < 0 && qqq1d < 0 ? 0.5
      : smh1d > 0 ? 0.2 : 0.4;

    const spilloverScore = spillover?.spilloverScore ?? 0;
    const eventRiskScore = eventRisk?.riskScore ?? 0;

    const drivers: RegimeDrivers = {
      spy1d, spy5d, spy20d, qqq1d, smh1d,
      vixLevel, vix1d, kospi1d, kospi2d,
      semisBreadth, spilloverScore, eventRiskScore, marketAtrZ,
    };

    // ── Classify ────────────────────────────────────────
    const regime = classifyRegime(drivers);
    const confidence = scoreRegimeConfidence(drivers, regime);
    const transitionRisk = estimateTransitionRisk(drivers);

    // ── Build reasons ────────────────────────────────────
    const reasons = buildReasons(drivers, regime);

    const result: RegimeIntelligence = {
      regime, confidence, transitionRisk, drivers, reasons,
      modelVersion: 'regime-v1',
    };

    cached = result;
    cachedAt = now;

    // Persist to DB (async)
    saveSnapshot(result).catch(() => {});

    console.log(`[REGIME] ${regime} (conf=${(confidence * 100).toFixed(0)}%, transRisk=${(transitionRisk * 100).toFixed(0)}%) [${Date.now() - t0}ms]`);
    return result;
  } catch (err) {
    console.error('[REGIME] Detection failed:', err);
    return fallback(String(err));
  }
}

// ─── Pure classifier ──────────────────────────────────────

export function classifyRegime(d: RegimeDrivers): MarketRegimeState {
  const scores: Record<MarketRegimeState, number> = {
    BULL_LOW_VOL: 0, BULL_HIGH_VOL: 0,
    BEAR_LOW_VOL: 0, BEAR_HIGH_VOL: 0,
    PANIC_CAPITULATION: 0, RELIEF_RALLY: 0, RANGE_NEUTRAL: 0,
  };

  // ── PANIC_CAPITULATION ────────────────────────────────
  if (d.semisBreadth >= 0.8) scores.PANIC_CAPITULATION += 25;
  if (d.marketAtrZ > 2.0) scores.PANIC_CAPITULATION += 25;
  else if (d.marketAtrZ > 1.5) scores.PANIC_CAPITULATION += 15;
  if (d.spilloverScore < -60) scores.PANIC_CAPITULATION += 20;
  if (d.vixLevel > 30) scores.PANIC_CAPITULATION += 15;
  if (d.spy1d < -3) scores.PANIC_CAPITULATION += 10;
  if (d.kospi2d < -8) scores.PANIC_CAPITULATION += 10;
  if (d.eventRiskScore < -30) scores.PANIC_CAPITULATION += 10;
  if (d.vix1d > 3 && d.kospi1d < -2) scores.PANIC_CAPITULATION += 5;

  // ── RELIEF_RALLY ────────────────────────────────────
  if (d.kospi2d < -5 && d.kospi1d > -1.5) scores.RELIEF_RALLY += 25;
  else if (d.kospi2d < -3 && d.kospi1d > -1) scores.RELIEF_RALLY += 15;
  if (d.spilloverScore > 20) scores.RELIEF_RALLY += 20;
  else if (d.spilloverScore > 10) scores.RELIEF_RALLY += 10;
  if (d.vix1d <= 0) scores.RELIEF_RALLY += 10;
  if (d.smh1d < 0 && d.qqq1d > 0) scores.RELIEF_RALLY += 10;
  if (d.qqq1d > 0.5) scores.RELIEF_RALLY += 10;

  // ── BEAR_HIGH_VOL ──────────────────────────────────
  if (d.spy20d < -5) scores.BEAR_HIGH_VOL += 20;
  if (d.vixLevel > 20 && d.vix1d > 0) scores.BEAR_HIGH_VOL += 15;
  if (d.marketAtrZ > 1.0) scores.BEAR_HIGH_VOL += 15;
  if (d.spilloverScore < -20) scores.BEAR_HIGH_VOL += 10;
  if (d.eventRiskScore < -15) scores.BEAR_HIGH_VOL += 10;

  // ── BULL_HIGH_VOL ──────────────────────────────────
  if (d.spy5d > 3 && d.vixLevel > 20) scores.BULL_HIGH_VOL += 20;
  if (d.marketAtrZ > 1.0) scores.BULL_HIGH_VOL += 15;
  if (d.vix1d > 2) scores.BULL_HIGH_VOL += 10;
  if (d.spy1d > 1.5) scores.BULL_HIGH_VOL += 10;

  // ── BEAR_LOW_VOL ───────────────────────────────────
  if (d.spy20d < -3 && d.spy20d >= -8 && d.vixLevel < 20) scores.BEAR_LOW_VOL += 20;
  if (d.marketAtrZ < 0) scores.BEAR_LOW_VOL += 15;
  if (d.vixLevel < 18) scores.BEAR_LOW_VOL += 10;
  if (d.spy5d > -1 && d.spy5d < 1) scores.BEAR_LOW_VOL += 10;

  // ── BULL_LOW_VOL ────────────────────────────────────
  if (d.vixLevel < 16) scores.BULL_LOW_VOL += 20;
  else if (d.vixLevel < 20) scores.BULL_LOW_VOL += 10;
  if (d.marketAtrZ < -0.5) scores.BULL_LOW_VOL += 15;
  if (d.semisBreadth < 0.3) scores.BULL_LOW_VOL += 10;
  if (d.spy5d > 1 && d.vix1d <= 0) scores.BULL_LOW_VOL += 10;

  // ── RANGE_NEUTRAL ───────────────────────────────────
  if (Math.abs(d.spy5d) < 2 && Math.abs(d.spy20d) < 5) scores.RANGE_NEUTRAL += 15;
  if (d.marketAtrZ > -0.5 && d.marketAtrZ < 0.5) scores.RANGE_NEUTRAL += 10;
  if (d.vixLevel >= 15 && d.vixLevel <= 22) scores.RANGE_NEUTRAL += 5;

  // ── Pick winner (priority-ordered) ──────────────────
  const priority: MarketRegimeState[] = [
    'PANIC_CAPITULATION', 'RELIEF_RALLY', 'BEAR_HIGH_VOL', 'BULL_HIGH_VOL',
    'BEAR_LOW_VOL', 'BULL_LOW_VOL', 'RANGE_NEUTRAL',
  ];
  let maxScore = 0;
  let regime: MarketRegimeState = 'RANGE_NEUTRAL';
  for (const state of priority) {
    if (scores[state] > maxScore) {
      maxScore = scores[state];
      regime = state;
    }
  }
  if (maxScore < 15) regime = 'RANGE_NEUTRAL';

  return regime;
}

// ─── Confidence scorer ────────────────────────────────────

export function scoreRegimeConfidence(d: RegimeDrivers, regime: MarketRegimeState): number {
  // Confidence from signal alignment and strength
  const aligns = [
    (d.spy1d > 0 ? 1 : -1) === (regime.includes('BULL') ? 1 : regime.includes('BEAR') || regime === 'PANIC_CAPITULATION' ? -1 : 0) ? 1 : 0,
    (d.vix1d < 0 ? 1 : d.vix1d > 0 ? -1 : 0) === (regime.includes('BULL') ? 1 : -1) ? 1 : 0,
    (d.spilloverScore > 0 ? 1 : -1) === (regime === 'RELIEF_RALLY' ? 1 : regime.includes('BEAR') || regime === 'PANIC_CAPITULATION' ? -1 : 0) ? 1 : 0,
  ];
  const alignment = aligns.reduce((a, b) => a + b, 0) / 3;

  // Signal strength
  const strength = Math.min(1, (
    Math.abs(d.spy5d) / 10 +
    Math.abs(d.vix1d) / 10 +
    d.marketAtrZ / 2 +
    Math.abs(d.spilloverScore) / 80
  ) / 4);

  return Math.min(0.95, Math.max(0.2, 0.3 + alignment * 0.3 + strength * 0.4));
}

// ─── Transition risk ──────────────────────────────────────

export function estimateTransitionRisk(d: RegimeDrivers): number {
  let risk = 0.15;
  if (d.marketAtrZ > 1.5) risk += 0.2;
  else if (d.marketAtrZ > 1.0) risk += 0.1;
  if (d.vixLevel > 25) risk += 0.15;
  if (d.vixLevel > 20) risk += 0.05;
  const s = [d.spy1d > 0 ? 1 : -1, d.qqq1d > 0 ? 1 : -1, d.vix1d < 0 ? 1 : -1] as const;
  if (s.filter(x => x === s[0]).length / 3 < 0.5) risk += 0.15;
  return Math.min(0.95, Math.max(0.05, risk));
}

// ─── Reasons builder ──────────────────────────────────────

function buildReasons(d: RegimeDrivers, regime: MarketRegimeState): string[] {
  const r: string[] = [];
  if (regime === 'PANIC_CAPITULATION') {
    if (d.semisBreadth >= 0.8) r.push(`Breadth <20% (${(d.semisBreadth * 100).toFixed(0)}%)`);
    if (d.marketAtrZ > 1.5) r.push(`ATR z=${d.marketAtrZ.toFixed(1)}`);
    if (d.vixLevel > 30) r.push(`VIX=${d.vixLevel.toFixed(1)}`);
    if (d.spilloverScore < -60) r.push('Spillover ekstrem negativ');
  } else if (regime === 'RELIEF_RALLY') {
    if (d.kospi2d < -5 && d.kospi1d > -1.5) r.push(`KOSPI decelerating (${d.kospi2d.toFixed(1)}% → ${d.kospi1d.toFixed(1)}%)`);
    if (d.spilloverScore > 20) r.push(`Spillover +${d.spilloverScore}`);
    if (d.vix1d <= 0) r.push('VIX jo duke rritur');
  } else if (regime === 'BEAR_HIGH_VOL') {
    if (d.spy20d < -5) r.push(`SPY 20D=${d.spy20d.toFixed(1)}%`);
    if (d.vix1d > 0) r.push(`VIX +${d.vix1d.toFixed(1)}%`);
    if (d.marketAtrZ > 1) r.push('Volatilitet i lartë');
  } else if (regime === 'BULL_HIGH_VOL') {
    if (d.spy5d > 3) r.push(`SPY 5D=+${d.spy5d.toFixed(1)}% por volatilitet`);
    if (d.marketAtrZ > 1) r.push('ATR z>1');
  } else if (regime === 'BULL_LOW_VOL') {
    if (d.vixLevel < 16) r.push(`VIX ulët=${d.vixLevel.toFixed(1)}`);
    if (d.marketAtrZ < -0.5) r.push('Volatilitet i ulët');
  } else if (regime === 'BEAR_LOW_VOL') {
    if (d.vixLevel < 20) r.push('VIX i ulët në bear');
    r.push('Treg i ulët por poshtë');
  } else {
    r.push('Asnjë trend i qartë, sinjale të pambushura');
 }
  if (r.length === 0) r.push('Default regime');
  return r;
}

// ─── DB persistence ───────────────────────────────────────

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
      spyReturn1d: d.spy1d, spyReturn5d: d.spy5d, spyReturn20d: d.spy20d,
      vixLevel: d.vixLevel, vixReturn1d: d.vix1d,
      atrZScore: d.marketAtrZ, breadthPct: 1 - d.semisBreadth,
      spilloverScore: d.spilloverScore, eventRiskScore: d.eventRiskScore,
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

// ─── Fallback ──────────────────────────────────────────────────

function fallback(reason: string): RegimeIntelligence {
  return {
    regime: 'RANGE_NEUTRAL', confidence: 0.3, transitionRisk: 0.5,
    drivers: { spy1d: 0, spy5d: 0, spy20d: 0, qqq1d: 0, smh1d: 0,
      vixLevel: 20, vix1d: 0, kospi1d: 0, kospi2d: 0, semisBreadth: 0.5,
      spilloverScore: 0, eventRiskScore: 0, marketAtrZ: 0 },
    reasons: [`Fallback: ${reason}`], modelVersion: 'regime-v1',
  };
}

// ─── DB query helpers (for API) ───────────────────────────

export async function getRegimeHistory(days: number = 30): Promise<{
  date: string; regimeState: string; confidence: number; transitionRisk: number;
}[]> {
  try {
    const { prisma } = await import('./prisma');
    const since = new Date(); since.setDate(since.getDate() - days);
    const rows = await prisma.regimeSnapshot.findMany({
      where: { date: { gte: since } }, orderBy: { date: 'desc' },
    });
    return rows.map(r => ({
      date: r.date.toISOString().split('T')[0], regimeState: r.regimeState,
      confidence: r.confidence, transitionRisk: r.transitionRisk,
    }));
  } catch { return []; }
}

export async function getRegimeAccuracyStats(): Promise<Record<string, {
  total: number; correct: number; winRate: number; avgReturn: number; noTradeCount: number;
}>> {
  try {
    const { prisma } = await import('./prisma');
    const preds = await prisma.prediction.findMany({
      where: { regimeState: { not: null }, wasCorrect: { not: null } },
      orderBy: { createdAt: 'desc' }, take: 1000,
    });
    const stats: Record<string, { total: number; correct: number; winRate: number; avgReturn: number; noTradeCount: number }> = {};
    for (const p of preds) {
      const rs = p.regimeState || 'UNKNOWN';
      if (!stats[rs]) stats[rs] = { total: 0, correct: 0, winRate: 0, avgReturn: 0, noTradeCount: 0 };
      const s = stats[rs];
      s.total++; if (p.wasCorrect) s.correct++;
      if (p.gateStatus === 'NO_TRADE') s.noTradeCount++;
      if (p.returnPct != null) s.avgReturn += p.returnPct;
    }
    for (const s of Object.values(stats)) {
      s.winRate = s.total > 0 ? Math.round((s.correct / s.total) * 1000) / 10 : 0;
      s.avgReturn = s.total > 0 ? Math.round((s.avgReturn / s.total) * 100) / 100 : 0;
    }
    return stats;
  } catch { return {}; }
}
