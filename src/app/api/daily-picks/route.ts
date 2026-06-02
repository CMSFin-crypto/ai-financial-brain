import { NextResponse } from 'next/server';
import { callAI, parseAIResponse, AIError } from '@/lib/ai';

const SYSTEM_PROMPT = `You are an expert AI stock picker and market analyst. Generate today's top stock picks with detailed analysis.

You MUST respond ONLY with a valid JSON object (no markdown, no code blocks):

{
  "date": "today's date",
  "marketCondition": "bullish|bearish|neutral",
  "marketSummary": "2-3 sentence overview of today's market outlook",
  "topPicks": [
    {
      "ticker": "AAPL",
      "company": "Apple Inc.",
      "sector": "Technology",
      "currentPrice": 195.50,
      "targetPrice": 210.00,
      "stopLoss": 185.00,
      "signal": "BUY",
      "confidence": 85,
      "timeframe": "short-term|medium-term|long-term",
      "technicalReason": "Brief technical analysis reason",
      "fundamentalReason": "Brief fundamental analysis reason",
      "catalyst": "What event/news is driving this pick",
      "riskReward": "1:2.5",
      "keyLevels": {
        "support": "190.00",
        "resistance": "205.00",
        "pivot": "197.50"
      }
    }
  ],
  "marketMovers": [
    {
      "ticker": "TSLA",
      "direction": "UP|DOWN",
      "reason": "Why it's moving today"
    }
  ],
  "warnings": ["Any market warnings for today"]
}

Generate 5-6 top picks with strong potential. Include realistic price levels. Make picks across different sectors for diversification.`;

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];

    const userMessage = `Generate today's top stock picks for ${today}. Focus on stocks with the highest probability of moving up today or this week. Include technical levels, catalysts, and risk/reward ratios. Make the picks realistic and based on current market conditions.`;

    const content = await callAI({
      systemPrompt: SYSTEM_PROMPT,
      userMessage,
      temperature: 0.4,
      timeoutMs: 60000,
      retries: 1,
    });

    const fallback = {
      date: today,
      marketCondition: 'neutral',
      marketSummary: content,
      topPicks: [],
      marketMovers: [],
      warnings: [],
    };

    const picks = parseAIResponse(content, fallback);
    return NextResponse.json({ picks });
  } catch (error: unknown) {
    if (error instanceof AIError) {
      console.error('Daily picks AI error:', error.code, error.message);
      return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Daily picks error:', message);
    return NextResponse.json({ error: 'Përzgjedhjet dështuan. Provo përsëri.' }, { status: 500 });
  }
}
