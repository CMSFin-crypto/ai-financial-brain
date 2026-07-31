// ============================================================
// Regime Intelligence — 5-state market classifier
// Combines returns, volatility, breadth, VIX, spillover, event risk,
// and relative strength into a single intelligent regime state.
// This is the ORCHESTRATOR layer — not just another indicator.
// ============================================================

import { getDailyHistory, type EnrichedMarketData, smaCalc, computeATR } from './global-market-data';
import { rollingZScore } from './spillover-features';
import type { SpilloverAnalysis } from './global-spillover';
import type { EventRiskResult } from './event-risk';
import { getRegimePolicy, type RegimePolicy } from './regime-policy';

// ─── Types ────────────────────────────────────────────────────

export type IntelligentRegimeState =
  | 'BULL_LOW_VOL'
  | 'BEAR_HIGH_VOL'
  | 'PANIC_CAPITULATION'
  | 'RELIEF_RALLY'
  | 'RANGE_NEUTRAL';

export interface RegimeIntelligenceResult {
  regimeState: IntelligentRegimeState;
  confidence: number;       // 0-1
  transitionRisk: number;   // 0-1, probability of regime change
  policy: RegimePolicy;
  drivers: string[];         // human-readable reasons
  features: RegimeFeatures;
  detectedAt: string;
}

export interface RegimeFeatures {
  // SPY returns
  spy1d: number;
  spy5d: number;
  spy20d: number;
  spyVsSma200: number;
  // QQQ
  qqq1d: number;
  qqq5d: number;
  // VIX
  vixLevel: number;
  vix1d: number;
  // SMH
  smh1d: number;
  smh5d: number;
  // Asia
  kospi1d: number;
  kospi2d: number;
  // Breadth & volatility
  semisBreadth: number;
  atrZScore: number;
  adxLevel: number;
  // External
  eventRiskScore: number;
  spilloverScore: number;
  spilloverSetup: string;
}

// ─── Cache ────────────────────────────────────────────────────

let cachedResult: RegimeIntelligenceResult | null = null;
let regimeIntelFetchedAt = 0;
const REGIME_INTEL_CACHE_MS = 30 * 60 * 1000; // 30 min

// ─── Main detection ───────────────────────────────────────────

export async function detectRegimeIntelligence(
  spillover?: SpilloverAnalysis,
  eventRisk?: EventRiskResult
): Promise<RegimeIntelligenceResult> {
  const now = Date.now();
  if (cachedResult && now - regimeIntelFetchedAt < REGIME_INTEL_CACHE_MS) {
    return cachedResult;
  }

  const startTime = Date.now();

  try {
    // Fetch all data in parallel
    const [spy, qqq, vix, smh, kospi] = await Promise.all([
      getDailyHistory('SPY', 300),
      getDailyHistory('QQQ', 200),
      getDailyHistory('VIX', 200),
      getDailyHistory('SMH', 200),
      getDailyHistory('^KS11', 200),
    ]);

    if (spy.length < 60) {
      return fallbackResult('Data e pamjaftueshme');
    }

    // ── Extract features ───────────────────────────────
    const spy0 = spy[0]; // most recent
    const sR = [...spy].reverse(); // oldest-first

    const spy1d = spy0.return1d;
    const spy5d = spy0.return5d ?? 0;
    const spy20d = spy0.return5d != null && spy0.return2d != null ? spy0.return5d + spy0.return2d : (spy0.return5d ?? 0);
    const spyClose = spy0.close;
    const spySma200 = spy.length >= 200 ? (sR.slice(-200).reduce((s, d) => s + d.close, 0) / 200) : null;
    const spyVsSma200 = spySma200 && spySma200 > 0 ? ((spyClose - spySma200) / spySma200) * 100 : 0;

    const qqq1d = qqq.length >= 2 ? qqq[0].return1d : 0;
    const qqq5d = qqq.length >= 6 ? (qqq[0].return5d ?? 0) : 0;

    const vixLevel = vix.length >= 2 ? vix[0].close : 20;
    const vix1d = vix.length >= 2 ? vix[0].return1d : 0;

    const smh1d = smh.length >= 2 ? smh[0].return1d : 0;
    const smh5d = smh.length >= 6 ? (smh[0].return5d ?? 0) : 0;

    const kospi1d = kospi.length >= 2 ? kospi[0].return1d : 0;
    const kospi2d = kospi.length >= 3 ? (kospi[0].return2d ?? 0) : 0;

    // ATR z-score (SPY)
    const atrValues: number[] = [];
    for (let i = 0; i < Math.min(sR.length, 60); i++) {
      const a = sR[sR.length - 1 - i]?.atr14;
      if (a != null && a > 0) atrValues.push(a);
    }
    const atrZScore = atrValues.length >= 20 ? rollingZScore(atrValues, 20) : 0;

    // ADX approximation from spy data
    const adxLevel = computeADXApprox(sR);

    // Semis breadth (from SMH vs QQQ divergence)
    const semisBreadth = smh1d < 0 && qqq1d > 0 ? 0.7 : smh1d < 0 && qqq1d < 0 ? 0.5 : smh1d > 0 ? 0.2 : 0.4;

    // External inputs
    const eventRiskScore = eventRisk?.riskScore ?? 0;
    const spilloverScore = spillover?.spilloverScore ?? 0;
    const spilloverSetup = spillover?.setupType ?? 'NEUTRAL';

    const features: RegimeFeatures = {
      spy1d, spy5d, spy20d, spyVsSma200,
      qqq1d, qqq5d,
      vixLevel, vix1d,
      smh1d, smh5d,
      kospi1d, kospi2d,
      semisBreadth, atrZScore, adxLevel,
      eventRiskScore, spilloverScore, spilloverSetup,
    };

    // ── Classify regime ────────────────────────────────
    const { regimeState, confidence, drivers } = classifyRegime(features);

    // ── Estimate transition risk ───────────────────────
    const transitionRisk = estimateTransitionRisk(features, regimeState);

    // ── Get policy ─────────────────────────────────────
    const policy = getRegimePolicy(regimeState);

    const result: RegimeIntelligenceResult = {
      regimeState,
      confidence: Math.round(confidence * 1000) / 1000,
      transitionRisk: Math.round(transitionRisk * 1000) / 1000,
      policy,
      drivers,
      features,
      detectedAt: new Date().toISOString(),
    };

    cachedResult = result;
    regimeIntelFetchedAt = now;

    // Save to DB (async, non-blocking)
    saveRegimeSnapshot(result).catch(() => {});

    console.log(`[REGIME-INTEL] ${regimeState} (conf=${(confidence * 100).toFixed(0)}%, transRisk=${(transitionRisk * 100).toFixed(0)}%) [${Date.now() - startTime}ms]`);
    console.log(`[REGIME-INTEL] Drivers: ${drivers.slice(0, 3).join('; ')}`);

    return result;
  } catch (err) {
    console.error('[REGIME-INTEL] Detection failed:', err);
    return fallbackResult(String(err));
  }
}

// ─── Rule-based classifier ────────────────────────────────────

function classifyRegime(f: RegimeFeatures): {
  regimeState: IntelligentRegimeState;
  confidence: number;
  drivers: string[];
} {
  const drivers: string[] = [];
  const scores: Record<IntelligentRegimeState, number> = {
    BULL_LOW_VOL: 0,
    BEAR_HIGH_VOL: 0,
    PANIC_CAPITULATION: 0,
    RELIEF_RALLY: 0,
    RANGE_NEUTRAL: 0,
  };

  // ── PANIC_CAPITULATION signals ───────────────────────
  // Extremely negative breadth + high ATR z-score + extreme spillover
  if (f.semisBreadth >= 0.8) { scores.PANIC_CAPITULATION += 25; drivers.push('Breadth <20% — shumica negativë'); }
  if (f.atrZScore > 2.0) { scores.PANIC_CAPITULATION += 25; drivers.push(`ATR z-score=${f.atrZScore.toFixed(1)} — volatilitet ekstrem`); }
  else if (f.atrZScore > 1.5) { scores.PANIC_CAPITULATION += 15; }
  if (f.spilloverScore < -60) { scores.PANIC_CAPITULATION += 20; drivers.push('Spillover shumë negativ'); }
  if (f.vixLevel > 30) { scores.PANIC_CAPITULATION += 15; drivers.push(`VIX=${f.vixLevel.toFixed(1)} — frika e lartë`); }
  if (f.spy1d < -3) { scores.PANIC_CAPITULATION += 10; drivers.push(`SPY ${f.spy1d.toFixed(1)}% 1D`); }
  if (f.kospi2d < -8) { scores.PANIC_CAPITULATION += 10; drivers.push(`KOSPI ${f.kospi2d.toFixed(1)}% 2D`); }
  if (f.eventRiskScore < -30) { scores.PANIC_CAPITULATION += 10; drivers.push('Ngjarje me rrezik të lartë'); }
  // No stabilization sign
  if (f.vix1d > 3 && f.kospi1d < -2) { scores.PANIC_CAPITULATION += 5; }

  // ── RELIEF_RALLY signals ────────────────────────────
  // Prior selloff + pressure decelerating + spillover bullish
  if (f.spilloverSetup === 'RELIEF_RALLY' && f.spilloverScore > 20) {
    scores.RELIEF_RALLY += 30;
    drivers.push('Spillover RELIEF_RALLY aktiv');
  } else if (f.spilloverScore > 10) {
    scores.RELIEF_RALLY += 10;
  }
  // Kospi deceleration (panic slowing)
  if (f.kospi2d < -5 && f.kospi1d > -1.5) {
    scores.RELIEF_RALLY += 20;
    drivers.push(`KOSPI decelerating (${f.kospi2d.toFixed(1)}% 2D → ${f.kospi1d.toFixed(1)}% 1D)`);
  } else if (f.kospi2d < -3 && f.kospi1d > -1) {
    scores.RELIEF_RALLY += 10;
    drivers.push('KOSPI po ngadalësohet');
  }
  // VIX not accelerating
  if (f.vix1d <= 0) { scores.RELIEF_RALLY += 10; drivers.push('VIX jo duke rritur'); }
  if (f.smh5d < -5) { scores.RELIEF_RALLY += 10; drivers.push('SMH -5%+ 5D — potential revert'); }
  // QQQ stabilizing or positive
  if (f.qqq1d > 0) { scores.RELIEF_RALLY += 10; drivers.push('QQQ pozitiv — tech stabil'); }

  // ── BEAR_HIGH_VOL signals ───────────────────────────
  if (f.spyVsSma200 < -3) { scores.BEAR_HIGH_VOL += 20; drivers.push(`SPY ${f.spyVsSma200.toFixed(1)}% nën SMA200`); }
  if (f.vixLevel > 20 && f.vix1d > 0) { scores.BEAR_HIGH_VOL += 15; drivers.push('VIX në rritje'); }
  if (f.atrZScore > 1.0) { scores.BEAR_HIGH_VOL += 10; drivers.push('Volatilitet mbi mesataren'); }
  if (f.spy20d < -5) { scores.BEAR_HIGH_VOL += 15; drivers.push(`SPY ${f.spy20d.toFixed(1)}% 20D`); }
  if (f.adxLevel > 25) { scores.BEAR_HIGH_VOL += 5; drivers.push(`ADX=${f.adxLevel.toFixed(0)} — trend i fortë`); }
  if (f.spilloverSetup === 'CONTINUATION') { scores.BEAR_HIGH_VOL += 10; drivers.push('Spillover CONTINUATION'); }

  // ── BULL_LOW_VOL signals ─────────────────────────────
  if (f.spyVsSma200 > 3) { scores.BULL_LOW_VOL += 25; drivers.push(`SPY ${f.spyVsSma200.toFixed(1)}% mbi SMA200`); }
  if (f.vixLevel < 18) { scores.BULL_LOW_VOL += 20; drivers.push(`VIX=${f.vixLevel.toFixed(1)} — ulët`); }
  else if (f.vixLevel < 22) { scores.BULL_LOW_VOL += 10; }
  if (f.atrZScore < 0.5) { scores.BULL_LOW_VOL += 15; drivers.push('Volatilitet e ulët'); }
  if (f.spy5d > 2) { scores.BULL_LOW_VOL += 10; drivers.push(`SPY +${f.spy5d.toFixed(1)}% 5D`); }
  if (f.adxLevel > 20 && f.adxLevel < 40) { scores.BULL_LOW_VOL += 10; drivers.push('Trend i fortë pa volatilitet ekstrem'); }
  if (f.semisBreadth < 0.3) { scores.BULL_LOW_VOL += 10; drivers.push('Breadth pozitiv'); }

  // ── RANGE_NEUTRAL signals ───────────────────────────
  if (f.adxLevel < 20) { scores.RANGE_NEUTRAL += 20; drivers.push(`ADX=${f.adxLevel.toFixed(0)} — asnjë trend`); }
  if (Math.abs(f.spy5d) < 2 && Math.abs(f.spy20d) < 5) { scores.RANGE_NEUTRAL += 15; drivers.push('SPY rreth SMA20/50'); }
  if (f.atrZScore > -0.5 && f.atrZScore < 0.5) { scores.RANGE_NEUTRAL += 10; drivers.push('Volatilitet normale'); }
  if (f.vixLevel >= 15 && f.vixLevel <= 22) { scores.RANGE_NEUTRAL += 5; }

  // ── Determine winner ────────────────────────────────
  let maxScore = 0;
  let regimeState: IntelligentRegimeState = 'RANGE_NEUTRAL';

  // Priority order: PANIC > RELIEF_RALLY > BEAR > BULL > RANGE
  const priority: IntelligentRegimeState[] = ['PANIC_CAPITULATION', 'RELIEF_RALLY', 'BEAR_HIGH_VOL', 'BULL_LOW_VOL', 'RANGE_NEUTRAL'];
  for (const state of priority) {
    if (scores[state] > maxScore) {
      maxScore = scores[state];
      regimeState = state;
    }
  }

  // Minimum score threshold to avoid random classification
  if (maxScore < 15) {
    regimeState = 'RANGE_NEUTRAL';
    drivers.length = 0;
    drivers.push('Sinjale të pambushura — default RANGE_NEUTRAL');
  }

  // Confidence from score dominance
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalScore > 0
    ? Math.min(0.95, 0.3 + (maxScore / totalScore) * 0.6)
    : 0.3;

  return { regimeState, confidence, drivers };
}

// ─── Transition risk estimator ────────────────────────────────

function estimateTransitionRisk(f: RegimeFeatures, current: IntelligentRegimeState): number {
  let risk = 0.2; // base 20%

  // Volatility increases transition probability
  if (f.atrZScore > 1.5) risk += 0.2;
  else if (f.atrZScore > 1.0) risk += 0.1;

  // VIX level
  if (f.vixLevel > 25) risk += 0.15;
  else if (f.vixLevel > 20) risk += 0.05;

  // Mixed signals increase uncertainty
  const signals = [
    f.spy1d > 0 ? 1 : -1,
    f.qqq1d > 0 ? 1 : -1,
    f.vix1d < 0 ? 1 : -1,
  ] as const;
  const agreement = signals.filter(s => s === signals[0]).length / signals.length;
  if (agreement < 0.5) risk += 0.15;

  // SPY near SMA200 — transition zone
  if (Math.abs(f.spyVsSma200) < 2) risk += 0.1;

  // Event risk increases transition probability
  if (f.eventRiskScore < -20) risk += 0.15;
  else if (f.eventRiskScore < -10) risk += 0.05;

  // PANIC and RELIEF_RALLY are inherently more transitional
  if (current === 'PANIC_CAPITULATION') risk += 0.15;
  if (current === 'RELIEF_RALLY') risk += 0.10;

  return Math.min(0.95, Math.max(0.05, risk));
}

// ─── ADX approximation ───────────────────────────────────────

function computeADXApprox(data: { high: number; low: number; close: number }[]): number {
  if (data.length < 30) return 20; // default

  const period = 14;
  let plusDM = 0, minusDM = 0, tr = 0;
  let smoothPDM = 0, smoothMDM = 0, smoothTR = 0;
  const dxValues: number[] = [];

  // Initialize smoothed values
  for (let i = 1; i <= period; i++) {
    const upMove = data[i].high - data[i - 1].high;
    const downMove = data[i - 1].low - data[i].low;
    plusDM += upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM += downMove > upMove && downMove > 0 ? downMove : 0;
    tr += Math.max(
      data[i].high - data[i].low,
      Math.abs(data[i].high - data[i - 1].close),
      Math.abs(data[i].low - data[i - 1].close)
    );
  }
  smoothPDM = plusDM;
  smoothMDM = minusDM;
  smoothTR = tr;

  const computeDX = () => {
    if (smoothTR === 0) { dxValues.push(0); return; }
    const pdi = (100 * smoothPDM) / smoothTR;
    const mdi = (100 * smoothMDM) / smoothTR;
    const sum = pdi + mdi;
    dxValues.push(sum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / sum);
  };
  computeDX();

  for (let i = period + 1; i < data.length; i++) {
    const upMove = data[i].high - data[i - 1].high;
    const downMove = data[i - 1].low - data[i].low;
    const pdm = upMove > downMove && upMove > 0 ? upMove : 0;
    const mdm = downMove > upMove && downMove > 0 ? downMove : 0;
    const t = Math.max(
      data[i].high - data[i].low,
      Math.abs(data[i].high - data[i - 1].close),
      Math.abs(data[i].low - data[i - 1].close)
    );

    smoothPDM = smoothPDM - smoothPDM / period + pdm;
    smoothMDM = smoothMDM - smoothMDM / period + mdm;
    smoothTR = smoothTR - smoothTR / period + t;
    computeDX();
  }

  if (dxValues.length < period) return 20;
  let adx = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i]) / period;
  }
  return adx;
}

// ─── DB persistence ────────────────────────────────────────────

async function saveRegimeSnapshot(result: RegimeIntelligenceResult): Promise<void> {
  try {
    const { prisma } = await import('./prisma');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await prisma.regimeSnapshot.findUnique({ where: { date: today } });
    const data = {
      regimeState: result.regimeState as string,
      confidence: result.confidence,
      transitionRisk: result.transitionRisk,
      spyReturn1d: result.features.spy1d,
      spyReturn5d: result.features.spy5d,
      spyReturn20d: result.features.spy20d,
      spyVsSma200: result.features.spyVsSma200,
      vixLevel: result.features.vixLevel,
      vixReturn1d: result.features.vix1d,
      atrZScore: result.features.atrZScore,
      breadthPct: 1 - result.features.semisBreadth, // invert: breadth = % positive
      adxLevel: result.features.adxLevel,
      spilloverScore: result.features.spilloverScore,
      spilloverSetup: result.features.spilloverSetup,
      eventRiskScore: result.features.eventRiskScore,
      policy: result.policy as unknown as Record<string, unknown>,
      drivers: result.drivers as unknown as Record<string, unknown>,
    } as Record<string, unknown>;

    if (existing) {
      await prisma.regimeSnapshot.update({ where: { date: today }, data: data as any });
    } else {
      await prisma.regimeSnapshot.create({ data: { date: today, ...data } as any });
    }
  } catch (err) {
    console.error('[REGIME-INTEL] DB save failed:', err);
  }
}

// ─── Fallback ──────────────────────────────────────────────────

function fallbackResult(reason: string): RegimeIntelligenceResult {
  return {
    regimeState: 'RANGE_NEUTRAL',
    confidence: 0.3,
    transitionRisk: 0.5,
    policy: getRegimePolicy('RANGE_NEUTRAL'),
    drivers: [`Fallback: ${reason}`],
    features: {
      spy1d: 0, spy5d: 0, spy20d: 0, spyVsSma200: 0,
      qqq1d: 0, qqq5d: 0, vixLevel: 20, vix1d: 0,
      smh1d: 0, smh5d: 0, kospi1d: 0, kospi2d: 0,
      semisBreadth: 0.5, atrZScore: 0, adxLevel: 20,
      eventRiskScore: 0, spilloverScore: 0, spilloverSetup: 'NEUTRAL',
    },
    detectedAt: new Date().toISOString(),
  };
}

/** Get recent regime history from DB */
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

/** Get per-regime accuracy stats from predictions */
export async function getRegimeAccuracyStats(): Promise<Record<string, {
  total: number;
  correct: number;
  winRate: number;
  avgReturn: number;
  noTradeCount: number;
}>> {
  try {
    const { prisma } = await import('./prisma');
    const predictions = await prisma.prediction.findMany({
      where: { regimeState: { not: null }, wasCorrect: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    const stats: Record<string, { total: number; correct: number; winRate: number; avgReturn: number; noTradeCount: number }> = {};
    for (const p of predictions) {
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
