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
    return NextResponse.json({ ok: true, data: {
      sectorLeaderboard: [],
      regimeLeaderboard: [],
      horizonBreakdown: [],
      tradeFilters: [],
      generatedAt: new Date().toISOString(),
      summary: { totalEnvironments: 0, strongEdge: 0, moderateEdge: 0, weakEdge: 0, negativeEdge: 0 },
    } });
  }
}
