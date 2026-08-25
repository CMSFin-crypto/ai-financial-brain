// POST /api/news/recompute-returns
// Recomputes abnormal returns for events that lack them.
// Call daily after market close.

import { NextResponse } from 'next/server';
import { computeMissingReturns } from '@/lib/news-event-study';

export async function POST() {
  try {
    const result = await computeMissingReturns();
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[RecomputeReturns] Error:', err);
    return NextResponse.json({ error: err?.message || 'Gabim' }, { status: 500 });
  }
}
