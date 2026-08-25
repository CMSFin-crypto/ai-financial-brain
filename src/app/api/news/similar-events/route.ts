// GET /api/news/similar-events?ticker=NVDA&eventType=fda_approval
// Returns similar historical events.

import { NextResponse } from 'next/server';
import { findSimilarEvents } from '@/lib/news-event-study';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker') || '';
  const eventType = searchParams.get('eventType');

  if (!eventType) {
    return NextResponse.json({ error: 'eventType duhet te jepet' }, { status: 400 });
  }

  try {
    const cases = await findSimilarEvents(ticker, eventType, 10);
    return NextResponse.json({ ticker, eventType, cases });
  } catch (err: any) {
    console.error('[SimilarEvents] Error:', err);
    return NextResponse.json({ error: err?.message || 'Gabim' }, { status: 500 });
  }
}
