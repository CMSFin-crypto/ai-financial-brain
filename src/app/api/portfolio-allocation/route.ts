import { NextRequest, NextResponse } from 'next/server';
import { allocatePortfolio, type ProposedPosition } from '@/lib/portfolio-allocator';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { positions, accountEquity, healthOk } = body;

    if (!positions || !Array.isArray(positions) || positions.length === 0) {
      return NextResponse.json({ error: 'positions array is required' }, { status: 400 });
    }

    const equity = Number(accountEquity) || 25000;

    const typedPositions: ProposedPosition[] = positions.map((p: Record<string, unknown>) => ({
      symbol: String(p.symbol || ''),
      sector: String(p.sector || 'UNKNOWN'),
      side: (p.side === 'SHORT' ? 'SHORT' : 'LONG') as 'LONG' | 'SHORT',
      score: Number(p.score ?? 0),
      kellyFraction: Number(p.kellyFraction ?? 0),
      entryPrice: Number(p.entryPrice ?? 0),
      stopPrice: p.stopPrice ? Number(p.stopPrice) : undefined,
      targetPrice: p.targetPrice ? Number(p.targetPrice) : undefined,
    }));

    const result = await allocatePortfolio(typedPositions, {
      accountEquity: equity,
      healthOk: healthOk !== false,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[PORTFOLIO-ALLOC] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
  }
