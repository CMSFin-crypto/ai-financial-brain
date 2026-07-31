// ============================================================
// GET /api/global-spillover/[symbol]
// Analyze global spillover for a target US stock/ETF.
// Returns: setupType, spilloverScore, confidence, reasons, drivers
// Also returns recent signals from DB for context.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { analyzeGlobalSpillover, getRecentSpilloverSignals, getSpilloverAccuracy } from '@/lib/global-spillover';

export const maxDuration = 30;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const startTime = Date.now();
  try {
    const { symbol } = await params;
    const ticker = symbol.toUpperCase().trim();

    if (!ticker) {
      return NextResponse.json({ error: 'Simboli është i nevojshëm' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const sector = searchParams.get('sector') || undefined;
    const includeHistory = searchParams.get('history') === 'true';
    const includeAccuracy = searchParams.get('accuracy') === 'true';

    // Run the spillover analysis
    const analysis = await analyzeGlobalSpillover(ticker, sector);

    const response: Record<string, unknown> = {
      ...analysis,
      targetSymbol: ticker,
      timestamp: new Date().toISOString(),
      processingTimeMs: Date.now() - startTime,
    };

    // Optionally include recent signal history
    if (includeHistory) {
      const recent = await getRecentSpilloverSignals(ticker, 30);
      response.recentSignals = recent;
    }

    // Optionally include accuracy stats
    if (includeAccuracy) {
      const accuracy = await getSpilloverAccuracy();
      response.accuracy = accuracy;
    }

    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[SPILLOVER-API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
