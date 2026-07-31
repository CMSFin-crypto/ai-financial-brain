// ============================================================
// GET  /api/conformal/[symbol]
//   ?probability=0.67  (required — the model's predicted P(up))
//   ?modelVersion=<v> &horizonDays=<n> &regime=<r>
//   ?alpha=0.15        (significance level)
//   ?maxBand=0.30      (max allowed uncertainty band)
//
// Returns conformal prediction set with uncertainty band,
// confidence set, and trade eligibility.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { computeConformalPrediction, getConformalProfile } from '@/lib/conformal-risk';

export const maxDuration = 15;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await params;
    const ticker = symbol.toUpperCase().trim();

    if (!ticker) {
      return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const probabilityStr = searchParams.get('probability');
    const profile = searchParams.get('profile') === 'true';

    const modelVersion = searchParams.get('modelVersion') || undefined;
    const horizonDays = searchParams.get('horizonDays') ? parseInt(searchParams.get('horizonDays')!) : undefined;
    const regime = searchParams.get('regime') || undefined;
    const alpha = searchParams.get('alpha') ? parseFloat(searchParams.get('alpha')!) : undefined;
    const maxBand = searchParams.get('maxBand') ? parseFloat(searchParams.get('maxBand')!) : undefined;

    // Profile mode: full symbol profile
    if (profile) {
      const symbolProfile = await getConformalProfile(ticker, { modelVersion, horizonDays });
      return NextResponse.json({ type: 'conformal_profile', ...symbolProfile });
    }

    // Single-prediction mode: need probability
    if (probabilityStr === null) {
      return NextResponse.json(
        { error: '?probability=<0-1> is required (or use ?profile=true for symbol profile)' },
        { status: 400 },
      );
    }

    const probability = parseFloat(probabilityStr);
    if (isNaN(probability) || probability < 0 || probability > 1) {
      return NextResponse.json(
        { error: 'probability must be a number between 0 and 1' },
        { status: 400 },
      );
    }

    const result = await computeConformalPrediction(probability, {
      modelVersion,
      horizonDays,
      regime,
      config: {
        ...(alpha !== undefined ? { alpha } : {}),
        ...(maxBand !== undefined ? { maxUncertaintyBand: maxBand } : {}),
      },
    });

    return NextResponse.json({
      type: 'conformal_prediction_set',
      symbol: ticker,
      ...result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CONFORMAL-API]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
