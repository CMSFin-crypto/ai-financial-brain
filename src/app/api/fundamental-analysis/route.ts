import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

interface FundamentalAnalysisRequest {
  ticker: string;
  company?: string;
}

const SYSTEM_PROMPT = `You are an expert fundamental analyst. Perform a deep fundamental analysis of the given stock.

You MUST respond ONLY with a valid JSON object (no markdown, no code blocks):

{
  "ticker": "AAPL",
  "company": "Apple Inc.",
  "sector": "Technology",
  "industry": "Consumer Electronics",
  "overallRating": "STRONG_BUY|BUY|HOLD|SELL|STRONG_SELL",
  "score": 85,
  "valuation": {
    "marketCap": "3.0T",
    "peRatio": 31.5,
    "forwardPE": 28.2,
    "pegRatio": 1.8,
    "priceToSales": 7.8,
    "priceToBook": 45.2,
    "evToEBITDA": 25.1,
    "dividendYield": "0.55%",
    "rating": "FAIRLY_VALUED|OVERVALUED|UNDERVALUED",
    "summary": "Brief valuation assessment"
  },
  "profitability": {
    "grossMargin": "44.1%",
    "operatingMargin": "29.8%",
    "netMargin": "25.3%",
    "returnOnEquity": "147.9%",
    "returnOnAssets": "28.4%",
    "returnOnInvestment": "36.5%",
    "rating": "EXCELLENT|GOOD|AVERAGE|POOR",
    "summary": "Brief profitability assessment"
  },
  "growth": {
    "revenueGrowth": "8.1%",
    "earningsGrowth": "12.5%",
    "revenueGrowth3Y": "10.2%",
    "earningsGrowth3Y": "15.8%",
    "quarterlyRevenueGrowth": "6.2%",
    "quarterlyEarningsGrowth": "10.8%",
    "rating": "STRONG|MODERATE|WEAK",
    "summary": "Brief growth assessment"
  },
  "financialHealth": {
    "currentRatio": 1.05,
    "quickRatio": 0.99,
    "debtToEquity": 1.72,
    "debtToAssets": 0.35,
    "freeCashFlow": "110.5B",
    "rating": "STRONG|MODERATE|WEAK",
    "summary": "Brief financial health assessment"
  },
  "earnings": {
    "eps": "6.42",
    "epsGrowth": "12.5%",
    "forwardEps": "7.15",
    "nextEarningsDate": "2025-04-24",
    "surprises": [
      {"quarter": "Q4 2024", "expected": "2.10", "actual": "2.18", "surprise": "+3.8%"}
    ],
    "rating": "STRONG|MODERATE|WEAK",
    "summary": "Brief earnings assessment"
  },
  "competitiveAdvantage": {
    "moat": "WIDE|NARROW|NONE",
    "brandStrength": 9,
    "marketPosition": "Dominant leader in consumer electronics with strong ecosystem lock-in",
    "keyStrengths": ["Brand loyalty", "Ecosystem", "Innovation", "Cash reserves"],
    "keyWeaknesses": ["Premium pricing limits TAM", "China dependency", "Regulatory pressure"]
  },
  "analystConsensus": {
    "rating": "BUY",
    "targetPrice": "220.00",
    "lowTarget": "195.00",
    "highTarget": "250.00",
    "buyRatings": 28,
    "holdRatings": 8,
    "sellRatings": 2,
    "averageRating": 4.2
  },
  "summary": "2-3 sentence overall fundamental analysis summary",
  "verdict": "Is this stock fundamentally sound? What's the investment thesis?",
  "risks": ["Key risk 1", "Key risk 2", "Key risk 3"]
}`;

export async function POST(request: NextRequest) {
  try {
    const body: FundamentalAnalysisRequest = await request.json();
    const { ticker, company } = body;

    if (!ticker || ticker.trim().length < 1) {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
    }

    const zai = await ZAI.create();

    const companyInfo = company ? ` (${company})` : '';
    const userMessage = `Perform a comprehensive fundamental analysis for ${ticker.toUpperCase()}${companyInfo}. Include valuation metrics, profitability ratios, growth rates, financial health, earnings data, competitive advantage (moat), and analyst consensus. Provide a clear investment verdict.`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
    }

    let analysis;
    try {
      const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      analysis = JSON.parse(cleaned);
    } catch {
      analysis = {
        ticker: ticker.toUpperCase(),
        company: company || ticker.toUpperCase(),
        overallRating: 'HOLD',
        score: 50,
        summary: content,
      };
    }

    return NextResponse.json({ analysis });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Fundamental analysis error:', message);
    return NextResponse.json({ error: 'Fundamental analysis failed' }, { status: 500 });
  }
}
