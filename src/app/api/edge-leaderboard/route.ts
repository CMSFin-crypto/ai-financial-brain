// ============================================================
// GET /api/edge-leaderboard — Sector/Regime Edge Leaderboard
//
// Returns where the system has edge, ranked by accuracy/alpha.
// ============================================================

import { NextResponse } from 'next/server';
import { computeEdgeLeaderboard } from '@/lib/edge-leaderboard';

export async function GET() {
  try {
    const leaderboard = await computeEdgeLeaderboard();
    return NextResponse.json({ ok: true, data: leaderboard });
  } catch (err) {
    console.error('[EDGE-LEADERBOARD] GET failed:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to compute edge leaderboard' },
      { status: 500 },
    );
  }
}
