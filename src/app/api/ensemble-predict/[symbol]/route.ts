import { NextRequest, NextResponse } from 'next/server';
import { runEnsemble } from '@/lib/model-ensemble';
import { predictStock, type PredictionResult, type PricePoint } from '@/lib/prediction-engine';
import { fetchHistoricalData, getRealPrices } from '@/lib/alpha-vantage';

export const maxDuration = 60;

// GET /api/ensemble-predict/[symbol]
// Query params:
//   regime=BEAR_HIGH_VOL
//   regimeConfidence=0.8
//   spilloverScore=-30
//   earningsDate=2026-02-15
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await params;
    const { searchParams } = new URL(req.url);

    const regimeState = searchParams.get('regime') || undefined;
    const regimeConfidence = searchParams.get('regimeConfidence')
      ? parseFloat(searchParams.get('regimeConfidence')!)
      : undefined;
    const spilloverScore = searchParams.get('spilloverScore')
      ? parseFloat(searchParams.get('spilloverScore')!)
      : undefined;
    const earningsDate = searchParams.get('earningsDate') || undefined;

    // Fetch price data for technical analysis
    const historicalData = await fetchHistoricalData(symbol, '6mo');
    if (!historicalData || historicalData.length < 60) {
      return NextResponse.json(
        { error: 'Insufficient price data' },
        { status: 400 },
      );
    }

    // Convert to PricePoint[] for prediction-engine
    const priceData: PricePoint[] = historicalData.map(d => ({
      date: d.date,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volume,
    }));

    // Run technical prediction
    let predictionResult: PredictionResult | null = null;
    try {
      predictionResult = predictStock(symbol, priceData);
    } catch (e) {
      console.warn(`Technical prediction failed for ${symbol}:`, e);
    }

    // Build feature vector from prediction result
    const features: Record<string, unknown> = {};
    if (predictionResult) {
      if (predictionResult.indicatorScores) {
        Object.assign(features, predictionResult.indicatorScores);
      }
      if (predictionResult.keyFactors) {
        for (const f of predictionResult.keyFactors) {
          const key = f.name.toLowerCase().replace(/\s+/g, '_');
          if (!(key in features)) features[key] = f.score;
        }
      }
    }

    // Run ensemble
    const result = runEnsemble(symbol, {
      predictionResult,
      regimeState,
      regimeConfidence,
      spilloverScore,
      features,
      knownEarningsDate: earningsDate,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Ensemble predict error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/ensemble-predict/[symbol] — ensemble with provided prediction result
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await params;
    const body = await req.json();

    const result = runEnsemble(symbol, {
      predictionResult: body.predictionResult || null,
      regimeState: body.regimeState,
      regimeConfidence: body.regimeConfidence,
      spilloverScore: body.spilloverScore,
      features: body.features,
      knownEarningsDate: body.knownEarningsDate,
      config: body.config,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Ensemble predict POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
