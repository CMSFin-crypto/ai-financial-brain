import { NextRequest, NextResponse } from 'next/server';
import { replayIncident } from '@/lib/incident-replay';

/**
 * GET /api/incidents/[id]/replay?from=2025-01-01&to=2025-01-15&symbol=AAPL
 * [id] is a slug (can be symbol or "all"), query params define the window.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    if (!from) {
      return NextResponse.json(
        { error: '?from=YYYY-MM-DD is required' },
        { status: 400 },
      );
    }

    const replay = await replayIncident({
      symbol: id !== 'all' ? id.toUpperCase() : undefined,
      from,
      to: to || undefined,
    });

    return NextResponse.json(replay);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[INCIDENT-REPLAY] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
