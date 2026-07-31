// ============================================================
// GET  /api/conformal/[symbol]
//   ?probability=0.67  (required for single-prediction mode)
//   ?profile=true     (symbol profile mode, no probability needed)
//   ?modelVersion=<v> &horizonDays=<n> &regime=<r>
//   &alpha=0.1        (significance level)
//   &maxBand=0.30     (max allowed uncertainty band)
//
// All query params validated via Zod.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { parseQuery } from '@/lib/parse-query';
import { conformalQuerySchema } from '@/lib/api-schemas';
import { getConformalDecision, getConformalProfileService } from '@/lib/conformal-service';

export const maxDuration = 15;

type RouteParams = { params: Promise<{ symbol: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { symbol } = await params;
  const ticker = symbol.toUpperCase().trim();

  if (!ticker) {
    return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
  }

  // Validate query params via Zod (throws on invalid)
  let query;
  try {
    query = parseQuery(req, conformalQuerySchema);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid query parameters';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    // Profile mode: full symbol profile
    if (query.profile) {
      const profile = await getConformalProfileService(ticker, {
        modelVersion: query.modelVersion,
        horizonDays: query.horizonDays,
      });
      return NextResponse.json({ type: 'conformal_profile', ...profile });
    }

    // Single-prediction mode
    const result = await getConformalDecision({
      symbol: ticker,
      probability: query.probability,
      modelVersion: query.modelVersion,
      alpha: query.alpha,
      horizonDays: query.horizonDays,
    });

    return NextResponse.json({
      type: 'conformal_decision',
      symbol: ticker,
      ...result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CONFORMAL-API]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
