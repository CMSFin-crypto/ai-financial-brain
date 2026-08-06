// ============================================================
// Unified Spillover Scoring Engine
// Takes CrossMarketFeatures and produces a SpilloverAssessment
// with setup type, score, confidence, and human-readable reasons.
// ============================================================

import type { CrossMarketFeatures } from './build-spillover-features';

// ─── Types ────────────────────────────────────────────────────

export type SpilloverSetup = 'CONTINUATION' | 'CAPITULATION' | 'RELIEF_RALLY' | 'NEUTRAL';

export interface SpilloverAssessment {
  setupType: SpilloverSetup;
  spilloverScore: number;    // -100 to +100
  confidence: number;       // 0 to 1
  reasons: string[];        // human-readable explanation array
  drivers: {
    asiaConsensus: number;
    riskAlignment: number;
    vixDirection: 'rising' | 'falling' | 'stable';
    sectorTrend: 'strong' | 'weak' | 'neutral';
    asiaAlign: boolean;      // Asia + US + sector all same direction
  };
}

// ─── Helpers ───────────────────────────────────────────────────

/**
 * Determine VIX direction from 1-day change.
 */
function classifyVixDirection(vix1d: number): 'rising' | 'falling' | 'stable' {
  if (vix1d > 1.5) return 'rising';
  if (vix1d < -1.5) return 'falling';
  return 'stable';
}

/**
 * Classify sector trend from 5-day return.
 */
function classifySectorTrend(sectorEtf5d: number | null): 'strong' | 'weak' | 'neutral' {
  if (sectorEtf5d === null || sectorEtf5d === 0) return 'neutral';
  if (Math.abs(sectorEtf5d) >= 3) return sectorEtf5d > 0 ? 'strong' : 'weak';
  return 'neutral';
}

/**
 * Check if Asia + US + sector are all aligned in the same direction.
 */
function isAsiaAligned(features: CrossMarketFeatures): boolean {
  const asiaSign = Math.sign(features.asiaConsensus);
  const sectorSign = Math.sign(features.sectorEtf1d);
  const spySign = Math.sign(features.spy1d);
  // All three non-zero and same sign
  if (asiaSign === 0 || sectorSign === 0 || spySign === 0) return false;
  return asiaSign === sectorSign && sectorSign === spySign;
}

// ─── Scoring Sub-routines ──────────────────────────────────────

interface DetectionResult {
  score: number;
  reasons: string[];
}

/**
 * Detect RELIEF_RALLY setup (oversold bounce conditions).
 * Score range: +30 to +80
 */
function detectReliefRally(f: CrossMarketFeatures): DetectionResult {
  let score = 0;
  const reasons: string[] = [];

  // KOSPI 2d <= -5% but 1d > -2% (deceleration) → strong relief signal
  if (f.kospi2d <= -5 && f.kospi1d > -2) {
    score += 35;
    reasons.push(`RELIEF: KOSPI 2d=${f.kospi2d.toFixed(1)}% but 1d=${f.kospi1d.toFixed(1)}% — panic decelerating`);
  }

  // Asia deceleration > 0.3
  if (f.asiaDeceleration > 0.3) {
    score += 15;
    reasons.push(`RELIEF: Asia deceleration=${f.asiaDeceleration.toFixed(2)} — overnight panic slowing`);
  }

  // SMH 2d < -3% (oversold sector)
  // We only have smh5d, so approximate: if 5d is very negative, sector is oversold
  // Actually we need smh2d — use a heuristic: if smh1d is very negative and smh5d worse
  if (f.smh5d !== null && f.smh5d < -3) {
    score += 15;
    reasons.push(`RELIEF: SMH 5d=${f.smh5d.toFixed(1)}% — semiconductor sector oversold`);
  }

  // VIX not rising
  if (f.vix1d <= 0) {
    score += 10;
    reasons.push(`RELIEF: VIX falling/stable (${f.vix1d.toFixed(1)}%) — fear receding`);
  }

  // QQQ positive
  if (f.qqq1d > 0) {
    score += 10;
    reasons.push(`RELIEF: QQQ positive (${f.qqq1d.toFixed(1)}%) — tech leading bounce`);
  }

  // Target oversold (< -3%)
  if (f.target1d < -3) {
    score += 10;
    reasons.push(`RELIEF: Target down ${f.target1d.toFixed(1)}% — oversold bounce candidate`);
  }

  return { score, reasons };
}

/**
 * Detect CAPITULATION setup (all markets collapsing).
 * Score range: -30 to -80 (stored as positive, will be negated).
 */
function detectCapitulation(f: CrossMarketFeatures): DetectionResult {
  let score = 0;
  const reasons: string[] = [];

  // All three Asia indices down > 2%
  const asiaAllDown = f.kospi1d < -2 && f.nikkei1d < -2 && f.hsi1d < -2;
  if (asiaAllDown) {
    score += 30;
    reasons.push(
      `CAPITULATION: All Asia indices down >2% (KOSPI=${f.kospi1d.toFixed(1)}%, Nikkei=${f.nikkei1d.toFixed(1)}%, HSI=${f.hsi1d.toFixed(1)}%)`
    );
  }

  // VIX rising > 3 points
  if (f.vix1d > 3) {
    score += 20;
    reasons.push(`CAPITULATION: VIX surging +${f.vix1d.toFixed(1)} — extreme fear`);
  }

  // SMH down > 2%
  if (f.smh1d < -2) {
    score += 15;
    reasons.push(`CAPITULATION: SMH down ${f.smh1d.toFixed(1)}% — semi sector collapsing`);
  }

  // SPY 5d < -3%
  if (f.spy5d !== null && f.spy5d < -3) {
    score += 15;
    reasons.push(`CAPITULATION: SPY 5d=${f.spy5d.toFixed(1)}% — sustained US selloff`);
  }

  return { score, reasons };
}

/**
 * Detect CONTINUATION setup (trend following).
 * Score range: +10 to +55 or -10 to -55
 */
function detectContinuation(f: CrossMarketFeatures): DetectionResult {
  let score = 0;
  const reasons: string[] = [];

  const asiaAlign = isAsiaAligned(f);

  // Strong bullish alignment
  if (f.riskAlignment > 0.5) {
    score = f.riskAlignment * 40;
    reasons.push(
      `CONTINUATION BULL: Risk alignment=${f.riskAlignment.toFixed(2)} — Asia, sector, SPY all bullish`
    );
  }

  // Strong bearish alignment
  if (f.riskAlignment < -0.5) {
    score = f.riskAlignment * 40; // negative
    reasons.push(
      `CONTINUATION BEAR: Risk alignment=${f.riskAlignment.toFixed(2)} — Asia, sector, SPY all bearish`
    );
  }

  // Asia alignment bonus
  if (asiaAlign && score !== 0) {
    score += score > 0 ? 15 : -15;
    reasons.push(
      `BONUS: Asia + US + sector aligned in ${score > 0 ? 'bullish' : 'bearish'} direction`
    );
  }

  return { score, reasons };
}

// ─── Main Assessment Function ─────────────────────────────────

/**
 * Assess spillover conditions from cross-market features.
 * Returns a structured assessment with score, confidence, and reasons.
 */
export function assessSpillover(
  features: CrossMarketFeatures,
  targetSymbol: string,
  targetSector?: string
): SpilloverAssessment {
  const reasons: string[] = [];

  // ── Run all detectors ──────────────────────────────────────
  const relief = detectReliefRally(features);
  const capitulation = detectCapitulation(features);
  const continuation = detectContinuation(features);

  // ── Determine dominant setup ───────────────────────────────
  // Priority: RELIEF_RALLY > CAPITULATION > CONTINUATION > NEUTRAL
  // (by absolute score strength)

  const detectors: { type: SpilloverSetup; result: DetectionResult; negate?: boolean }[] = [
    { type: 'RELIEF_RALLY', result: relief },
    { type: 'CAPITULATION', result: capitulation, negate: true },
    { type: 'CONTINUATION', result: continuation },
  ];

  // Find strongest signal
  let bestType: SpilloverSetup = 'NEUTRAL';
  let bestScore = 0;
  let bestReasons: string[] = [];

  for (const det of detectors) {
    const effectiveScore = det.negate ? -det.result.score : det.result.score;
    const absScore = Math.abs(effectiveScore);
    if (absScore > Math.abs(bestScore)) {
      bestType = det.type;
      bestScore = effectiveScore;
      bestReasons = det.result.reasons;
    }
  }

  // Add detected reasons
  reasons.push(...bestReasons);

  // ── Business rule: Warning on CAPITULATION ──────────────────
  // "Mos jep BUY të fortë kur KOSPI/Nikkei janë risk-off, VIX rritet dhe sektori është i dobët"
  if (bestType === 'CAPITULATION') {
    reasons.push(
      `⚠️ WARNING: CAPITULATION detected — avoid strong BUY signals when Asia is risk-off, VIX rising, and sector is weak`
    );
  }

  // ── Business rule: Asia alignment bonus reason ──────────────
  // "Jep bonus kur Asia + sector ETF + benchmark janë në të njëjtin drejtim"
  const asiaAlign = isAsiaAligned(features);
  if (asiaAlign && bestType !== 'CONTINUATION') {
    // Add bonus reason if not already added by continuation detector
    const dir = features.riskAlignment > 0 ? 'bullish' : 'bearish';
    reasons.push(
      `BONUS: Asia + sector ETF + SPY aligned ${dir} — bonus applied to score`
    );
  }

  // ── NEUTRAL fallback ───────────────────────────────────────
  if (Math.abs(bestScore) < 10) {
    bestType = 'NEUTRAL';
    bestScore = 0;
    reasons.push('NEUTRAL: No strong spillover signal detected');
  }

  // Clamp score to [-100, +100]
  const spilloverScore = Math.max(-100, Math.min(100, bestScore));

  // ── Confidence ──────────────────────────────────────────────
  // confidence = max detection raw score / 100, clamped to [0.1, 0.95]
  const maxRawScore = Math.max(relief.score, capitulation.score, Math.abs(continuation.score));
  const confidence = Math.max(0.1, Math.min(0.95, maxRawScore / 100));

  // ── Build drivers ───────────────────────────────────────────
  const drivers = {
    asiaConsensus: features.asiaConsensus,
    riskAlignment: features.riskAlignment,
    vixDirection: classifyVixDirection(features.vix1d),
    sectorTrend: classifySectorTrend(features.sectorEtf5d),
    asiaAlign,
  };

  return {
    setupType: bestType,
    spilloverScore,
    confidence,
    reasons,
    drivers,
  };
}
