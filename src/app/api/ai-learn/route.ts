import { NextRequest, NextResponse } from 'next/server';
import {
  getStats,
  getLessons,
  recordPrediction,
  recordFromAIResponse,
  evaluatePredictions,
  autoImprove,
  buildLearningContext,
} from '@/lib/ai-learning';
import { getRealPrices } from '@/lib/alpha-vantage';

export const maxDuration = 30;

// ═══════════════════════════════════════════════════════
// GET — Get learning stats, lessons, or context
// ═══════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'stats';

    if (type === 'stats') {
      const stats = await getStats();
      return NextResponse.json({ stats });
    }

    if (type === 'lessons') {
      const limit = parseInt(searchParams.get('limit') || '20');
      const lessons = await getLessons(limit);
      return NextResponse.json({ lessons });
    }

    if (type === 'context') {
      const context = await buildLearningContext();
      return NextResponse.json({ context });
    }

    return NextResponse.json({ error: 'Tip i panjohur. Perdorni: stats, lessons, context' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[AI-LEARN API] GET error:', message);
    return NextResponse.json({ error: 'Gabim ne marrjen e te dhenave' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════
// POST — Record prediction, evaluate, or auto-improve
// ═══════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    // ─── RECORD single prediction ────────────────
    if (action === 'record') {
      const id = await recordPrediction(body.prediction);
      return NextResponse.json({ success: !!id, id });
    }

    // ─── RECORD from AI response (batch) ──────────
    if (action === 'record-batch') {
      const count = await recordFromAIResponse(body.source, body.predictions);
      return NextResponse.json({ success: true, recorded: count });
    }

    // ─── EVALUATE with actual prices ───────────────
    if (action === 'evaluate') {
      const prices = body.prices || {};
      const result = await evaluatePredictions(prices);
      return NextResponse.json(result);
    }

    // ─── AUTO-IMPROVE (fetch prices + evaluate) ────
    if (action === 'auto-improve') {
      const result = await autoImprove();
      const stats = await getStats();
      return NextResponse.json({ evaluated: result.evaluated, correct: result.correct, lessons: result.lessons, stats });
    }

    // ─── EVALUATE with live prices ────────────────
    if (action === 'evaluate-live') {
      // Fetch live prices for all tracked tickers
      const tickers = body.tickers;
      if (!tickers || tickers.length === 0) {
        return NextResponse.json({ error: 'Jepni tickers per vleresim' }, { status: 400 });
      }

      const livePrices = await getRealPrices(tickers);
      // Convert LivePrice to number for evaluation
      const priceMap: Record<string, number> = {};
      for (const [ticker, lp] of Object.entries(livePrices)) {
        priceMap[ticker] = lp.price;
      }
      const result = await evaluatePredictions(priceMap);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Action i panjohur. Perdorni: record, record-batch, evaluate, auto-improve, evaluate-live' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[AI-LEARN API] POST error:', message);
    return NextResponse.json({ error: 'Gabim ne procesim' }, { status: 500 });
  }
}
