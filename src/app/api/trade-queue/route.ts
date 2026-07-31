import { NextRequest, NextResponse } from 'next/server';
import { buildTradeQueue, type TradeCandidate } from '@/lib/trade-queue';

export const maxDuration = 30;

// POST /api/trade-queue
// Body: { candidates: TradeCandidate[], config?: TradeQueueConfig }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const candidates: TradeCandidate[] = body.candidates;
    const config = body.config;

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return NextResponse.json(
        { error: 'Provide candidates array' },
        { status: 400 },
      );
    }

    const result = buildTradeQueue(candidates, config);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Trade queue error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
