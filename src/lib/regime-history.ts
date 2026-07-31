// ============================================================
// Regime History — persistence + confirmation logic for regime detection.
// A regime is only "confirmed" after N consecutive same-state reads.
// Uses the existing RegimeSnapshot DB model.
// ============================================================

import prisma from './prisma';
import type { MarketRegimeState } from './regime-intelligence';

// ─── Types ────────────────────────────────────────────────────

export type RegimeSnapshotLocal = {
  at: string;
  regime: string;
  confidence: number;
};

export type RegimeConfirmation = {
  currentRegime: string;
  confirmedRegime: string;
  confirmed: boolean;
  streak: number;
  recentHistory: RegimeSnapshotLocal[];
};

// ─── DB-backed persistence ────────────────────────────────────

export async function saveRegimeSnapshot(regime: string, confidence: number, policy?: object): Promise<void> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Upsert: one regime snapshot per day
    await prisma.regimeSnapshot.upsert({
      where: { date: today },
      update: {
        regimeState: regime,
        confidence,
        policy: policy ?? undefined,
      },
      create: {
        date: today,
        regimeState: regime,
        confidence,
        policy: policy ?? undefined,
      },
    });
  } catch (err) {
    console.warn('[REGIME-HISTORY] Failed to save:', err);
  }
}

export async function loadRecentRegimeHistory(days = 7): Promise<RegimeSnapshotLocal[]> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const snapshots = await prisma.regimeSnapshot.findMany({
      where: { date: { gte: since } },
      orderBy: { date: 'asc' },
      select: { date: true, regimeState: true, confidence: true },
    });

    return snapshots.map(s => ({
      at: s.date.toISOString(),
      regime: s.regimeState,
      confidence: s.confidence,
    }));
  } catch (err) {
    console.warn('[REGIME-HISTORY] Failed to load:', err);
    return [];
  }
}

// ─── Confirmation logic ───────────────────────────────────────
// A regime is confirmed only after `minConfirmations` consecutive reads.
// Until confirmed, the last confirmed regime is used.

export function applyRegimePersistence(
  history: RegimeSnapshotLocal[],
  current: { regime: string; confidence: number },
  minConfirmations = 2,
): RegimeConfirmation {
  if (history.length === 0) {
    return {
      currentRegime: current.regime,
      confirmedRegime: current.regime,
      confirmed: true, // first reading = confirmed by default
      streak: 1,
      recentHistory: [{ at: new Date().toISOString(), ...current }],
    };
  }

  // Count consecutive same-regime at end of history
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].regime === current.regime) streak++;
    else break;
  }
  streak++; // include current

  const confirmed = streak >= minConfirmations;
  const confirmedRegime = confirmed
    ? current.regime
    : history[history.length - 1].regime;

  return {
    currentRegime: current.regime,
    confirmedRegime,
    confirmed,
    streak,
    recentHistory: [
      ...history.slice(-(minConfirmations * 2)),
      { at: new Date().toISOString(), ...current },
    ],
  };
}
