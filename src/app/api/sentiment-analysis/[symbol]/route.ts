import { NextRequest, NextResponse } from 'next/server';
import { getRealPrice } from '@/lib/alpha-vantage';
import { callAI, parseAIResponse } from '@/lib/ai';

export const maxDuration = 30;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const ticker = symbol.toUpperCase().trim();

    if (!ticker) {
      return NextResponse.json({ error: 'Simboli është i nevojshëm' }, { status: 400 });
    }

    // Fetch real price for context
    let priceContext = '';
    try {
      const priceData = await getRealPrice(ticker);
      if (priceData) {
        priceContext = `Çmimi aktual i ${ticker}: $${priceData.price.toFixed(2)} (Ndryshim: ${priceData.change >= 0 ? '+' : ''}${priceData.change.toFixed(2)}%)`;
      }
    } catch {
      // Price fetch failed, continue without it
    }

    const systemPrompt = `You are a financial sentiment analyst. Analyze the overall market sentiment for ${ticker} based on current market conditions. Respond in ALBANIAN. Return JSON: { "sentiment": "POSITIVE"|"NEGATIVE"|"NEUTRAL", "score": 0-100, "summary": "2-3 sentences in Albanian" }`;

    const userMessage = `Analizo sentimentin e tregut për ${ticker}. ${priceContext} Merr parasysh tendencat e përgjithshme, volumet, dhe situatën teknike. Kthe vetëm JSON.`;

    const aiResponse = await callAI({
      systemPrompt,
      userMessage,
      temperature: 0.3,
      timeoutMs: 25000,
      retries: 1,
    });

    const parsed = parseAIResponse<{
      sentiment: string;
      score: number;
      summary: string;
    }>(aiResponse, {
      sentiment: 'NEUTRAL',
      score: 50,
      summary: 'Nuk u mundësua analizimi.',
    });

    // Normalize sentiment value
    let sentiment = 'NEUTRAL';
    const rawSentiment = String(parsed.sentiment).toUpperCase();
    if (rawSentiment.includes('POS') || rawSentiment.includes('BULL')) {
      sentiment = 'POSITIVE';
    } else if (rawSentiment.includes('NEG') || rawSentiment.includes('BEAR')) {
      sentiment = 'NEGATIVE';
    }

    // Clamp score
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 50)));

    return NextResponse.json({
      symbol: ticker,
      sentiment,
      score,
      summary: parsed.summary || 'Nuk u mundësua analizimi.',
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[SENTIMENT] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}