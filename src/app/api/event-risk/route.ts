import { NextRequest, NextResponse } from 'next/server';
import { assessEventRisk, batchAssessEventRisk, canEnterTrade } from '@/lib/event-risk-engine';

export const maxDuration = 30;

// GET: assess event risk for one or more symbols
// Query params:
//   symbol=AAPL              (single symbol)
//   symbols=AAPL,MSFT,NVDA   (batch, comma-separated)
//   earningsDate=2026-02-15  (known earnings date for single symbol)
//   check=canEnter           (quick canEnterTrade check)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol');
    const symbolsParam = searchParams.get('symbols');
    const earningsDate = searchParams.get('earningsDate');
    const check = searchParams.get('check');

    // Quick canEnterTrade check
    if (check === 'canEnter' && symbol) {
      const result = canEnterTrade(symbol, undefined, earningsDate || undefined);
      return NextResponse.json(result);
    }

    // Batch assessment
    if (symbolsParam) {
      const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      const results = batchAssessEventRisk(symbols);
      return NextResponse.json({
        assessments: results,
        totalSymbols: results.length,
        anyRestricted: results.some(r => r.restriction.level !== 'NONE'),
      });
    }

    // Single symbol assessment
    if (symbol) {
      const result = assessEventRisk(symbol.toUpperCase(), undefined, earningsDate || undefined);
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: 'Provide ?symbol=X or ?symbols=A,B,C' },
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Event risk API error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
