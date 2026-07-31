import { NextRequest, NextResponse } from 'next/server';
import { getExecutionQuality, getRecentExecutions } from '@/lib/execution-quality';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol') ?? undefined;
    const daysParam = url.searchParams.get('days');
    const days = daysParam ? Number(daysParam) : 7;
    const includeRecent = url.searchParams.get('recent') === 'true';

    const [quality, recent] = await Promise.all([
      getExecutionQuality({ symbol, days }),
      includeRecent ? getRecentExecutions(20, symbol) : Promise.resolve([]),
    ]);

    return NextResponse.json({ ...quality, recentExecutions: recent });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[EXECUTION-QUALITY] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
