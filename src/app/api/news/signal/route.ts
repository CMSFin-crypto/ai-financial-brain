// GET /api/news/signal?ticker=AMD&eventType=analyst_upgrade
// Returns a news impact signal based on historical event study.

import { NextResponse } from 'next/server';
import { generateNewsSignal } from '@/lib/news-event-study';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');
  const eventType = searchParams.get('eventType') || undefined;

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker duhet te jepet' }, { status: 400 });
  }

  try {
    const signal = await generateNewsSignal(ticker, eventType);
    return NextResponse.json(signal);
  } catch (err: any) {
    console.error('[NewsSignal] Error:', err);
    return NextResponse.json({ error: err?.message || 'Gabim' }, { status: 500 });
  }
}
