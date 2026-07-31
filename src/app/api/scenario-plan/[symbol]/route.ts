import { NextRequest, NextResponse } from 'next/server';
import { generateScenarioPlan } from '@/lib/scenario-planner';

export const maxDuration = 30;

// GET /api/scenario-plan/[symbol]?price=150&rsi=65&atrPct=1.8&support=145&resistance=155&sector=Technology
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await params;
    const { searchParams } = new URL(req.url);

    const price = parseFloat(searchParams.get('price') || '0');
    if (!price) {
      return NextResponse.json(
        { error: '?price= is required' },
        { status: 400 },
      );
    }

    const rsi = searchParams.get('rsi') ? parseFloat(searchParams.get('rsi')!) : undefined;
    const atrPct = searchParams.get('atrPct') ? parseFloat(searchParams.get('atrPct')!) : undefined;
    const support = searchParams.get('support') ? parseFloat(searchParams.get('support')!) : undefined;
    const resistance = searchParams.get('resistance') ? parseFloat(searchParams.get('resistance')!) : undefined;
    const sma20 = searchParams.get('sma20') ? parseFloat(searchParams.get('sma20')!) : undefined;
    const sma50 = searchParams.get('sma50') ? parseFloat(searchParams.get('sma50')!) : undefined;
    const sma200 = searchParams.get('sma200') ? parseFloat(searchParams.get('sma200')!) : undefined;
    const sector = searchParams.get('sector') || undefined;
    const volumeTrend = searchParams.get('volumeTrend') as any || undefined;

    const plan = generateScenarioPlan(
      symbol.toUpperCase(),
      price,
      null, // no ensemble context in GET
      { rsi, atrPct, supportLevel: support, resistanceLevel: resistance, sma20, sma50, sma200, sector, volumeTrend },
    );

    return NextResponse.json(plan);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Scenario plan error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/scenario-plan/[symbol]
// Body: { price, ensemble?, technicalContext?, config? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await params;
    const body = await req.json();

    const plan = generateScenarioPlan(
      symbol.toUpperCase(),
      body.price,
      body.ensemble || null,
      body.technicalContext,
      body.config,
    );

    return NextResponse.json(plan);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Scenario plan POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
