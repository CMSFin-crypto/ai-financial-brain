// ═══════════════════════════════════════════════════════════════
// OUTCOMES & WEIGHTS — IBKR Pullback Adaptive Learning
// ═══════════════════════════════════════════════════════════════
// Labels:
//   CONTINUATION — ret3d ≥ +3%  (trend followed through)
//   FADE         — ret3d ≤ -2%  (reversed)
//   CHOP         — between       (no follow-through)
//
// Outliers (|ret| ≥ 35%) are excluded from weight updates to prevent
// model poisoning (e.g., BIAF, GPRO gap-and-crash scenarios).
// Weights move max ±0.03 per update and only with n ≥ 40 samples.

import { prisma } from "@/lib/prisma";

const OUTLIER_ABS = 0.35;   // |ret3d| ≥ 35% → outlier
const MIN_SAMPLE = 40;      // need ≥40 outcomes before updating weights
const MAX_STEP = 0.03;      // weight can move max ±0.03 per update

function labelFromRet(ret3d: number | null, ret1d: number | null): string {
  const r = ret3d ?? ret1d ?? 0;
  if (r >= 0.03) return "CONTINUATION";
  if (r <= -0.02) return "FADE";
  return "CHOP";
}

// ═══ Save outcome labels ═══
export async function saveOutcomes(
  rows: Array<{
    symbol: string;
    sessionDate: Date;
    firstStatus: string;
    ret1h?: number;
    retClose?: number;
    ret1d?: number;
    ret3d?: number;
  }>
) {
  for (const r of rows) {
    const outlier = Math.abs(r.ret3d ?? r.ret1d ?? 0) >= OUTLIER_ABS;
    await prisma.outcomeLabel.upsert({
      where: {
        symbol_sessionDate_firstStatus: {
          symbol: r.symbol,
          sessionDate: r.sessionDate,
          firstStatus: r.firstStatus,
        },
      },
      create: {
        symbol: r.symbol,
        sessionDate: r.sessionDate,
        firstStatus: r.firstStatus,
        ret1h: r.ret1h,
        retClose: r.retClose,
        ret1d: r.ret1d,
        ret3d: r.ret3d,
        label: labelFromRet(r.ret3d ?? null, r.ret1d ?? null),
        outlier,
      },
      update: {
        ret1h: r.ret1h,
        retClose: r.retClose,
        ret1d: r.ret1d,
        ret3d: r.ret3d,
        label: labelFromRet(r.ret3d ?? null, r.ret1d ?? null),
        outlier,
      },
    });
  }
}

// ═══ Update factor weights from recent outcomes ═══
// Runs weekly (via cron). Adapts RS, VOL_PERSIST, PULLBACK_QUALITY,
// LIQUIDITY, EVENT_CLEAR weights based on continuation vs fade rates.
export async function updateWeeklyWeights() {
  // Get last 500 non-outlier READY outcomes
  const outcomes = await prisma.outcomeLabel.findMany({
    where: { outlier: false, firstStatus: "MOMENTUM_PULLBACK_READY" },
    take: 500,
    orderBy: { sessionDate: "desc" },
  });

  if (outcomes.length < MIN_SAMPLE) {
    return {
      updated: false,
      reason: "min_sample",
      n: outcomes.length,
      minRequired: MIN_SAMPLE,
    };
  }

  const wins = outcomes.filter((o) => o.label === "CONTINUATION").length;
  const fades = outcomes.filter((o) => o.label === "FADE").length;
  const winRate = wins / outcomes.length;
  const fadeRate = fades / outcomes.length;

  // Compute target weights based on win/fade rates
  const next = [
    { factor: "RS", weight: winRate > 0.45 ? 0.22 : 0.16 },
    { factor: "VOL_PERSIST", weight: winRate > 0.45 ? 0.22 : 0.18 },
    { factor: "PULLBACK_QUALITY", weight: 0.22 },
    { factor: "LIQUIDITY", weight: 0.18 },
    { factor: "EVENT_CLEAR", weight: fadeRate > 0.35 ? 0.22 : 0.16 },
  ];

  for (const f of next) {
    const prev = await prisma.scannerFactorWeight.findUnique({
      where: { factor: f.factor },
    });
    // Cap movement at ±MAX_STEP from previous weight
    const capped = prev
      ? Math.max(prev.weight - MAX_STEP, Math.min(prev.weight + MAX_STEP, f.weight))
      : f.weight;

    await prisma.scannerFactorWeight.upsert({
      where: { factor: f.factor },
      create: {
        factor: f.factor,
        weight: capped,
        sampleSize: outcomes.length,
        winRate,
      },
      update: {
        weight: capped,
        sampleSize: outcomes.length,
        winRate,
      },
    });
  }

  return {
    updated: true,
    n: outcomes.length,
    winRate: Math.round(winRate * 100) / 100,
    fadeRate: Math.round(fadeRate * 100) / 100,
    wins,
    fades,
    weights: next,
  };
}
