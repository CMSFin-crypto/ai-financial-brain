import { NextRequest, NextResponse } from 'next/server';
import { callAI, parseAIResponse, AIError } from '@/lib/ai';

interface SectorScanRequest {
  sector?: string;
  count?: number;
}

const SYSTEM_PROMPT = `You are a SECTOR SCANNER AI — scan all major sectors and return the TOP 10 stocks per sector with quantitative scoring.

For each stock in each sector, provide:
- ticker, company name, sector
- quick signal: BULLISH/BEARISH/NEUTRAL
- confidence: 0-100
- current estimated price
- quick fundamental note (1 sentence)
- quick technical note (1 sentence)
- key catalyst (if any)

Sectors to scan (10 stocks per sector = 50 total):
1. TECHNOLOGY: AAPL, MSFT, NVDA, GOOGL, AMZN, META, AVGO, AMD, CRM, ORCL
2. HEALTHCARE: UNH, JNJ, LLY, ABBV, MRK, PFE, TMO, ABT, ISRG, VRTX
3. FINANCE: JPM, BAC, GS, MS, V, MA, BLK, SCHW, C, WFC
4. ENERGY: XOM, CVX, COP, SLB, EOG, MPC, PARR, FANG, DVN, WFRD
5. CONSUMER DISCRETIONARY: TSLA, AMZN, HD, NKE, MCD, SBUX, TGT, LOW, F, GM

For each stock, give a QUICK multi-factor score combining:
- Technical momentum (trend, volume, MA alignment)
- Fundamental valuation (P/E vs sector, growth, margins)
- Recent news/catalyst impact
- Overall sector tailwind/headwind

Return ONLY valid JSON:

{
  "marketOverview": {
    "condition": "bullish|bearish|neutral",
    "sp500trend": "uptrend",
    "keyMacroFactors": ["Fed rate expectations", "Earnings season"],
    "topSectors": ["Technology", "Healthcare"],
    "weakSectors": ["Energy"]
  },
  "sectors": [
    {
      "name": "Technology",
      "overallSignal": "BULLISH",
      "sectorConfidence": 82,
      "trend": "Strong uptrend led by AI/nvidia",
      "stocks": [
        {
          "ticker": "NVDA",
          "company": "NVIDIA Corp",
          "signal": "BULLISH",
          "confidence": 92,
          "price": 875.50,
          "technicalNote": "Golden Cross confirmed, RSI at 65 with strong uptrend, volume 1.5x average",
          "fundamentalNote": "Revenue growth 125% YoY, dominant AI chip market share, PEG ratio 1.2",
          "catalyst": "Next-gen Blackwell GPU launch, AI data center demand surge",
          "quickScore": 91
        }
      ]
    }
  ]
}

Make all data realistic and current. Return ONLY pure JSON.`;

export async function POST(request: NextRequest) {
  try {
    const body: SectorScanRequest = await request.json();
    const sector = body.sector;
    const count = body.count || 10;

    const userMessage = sector
      ? `Scan the ${sector.toUpperCase()} sector specifically. Return top ${count} stocks with full multi-factor analysis for each. Include market overview and sector trends.`
      : `Perform a FULL market scan of ALL 5 sectors (Technology, Healthcare, Finance, Energy, Consumer Discretionary). Return top ${count} stocks per sector with multi-factor scoring. Include overall market overview and sector rotation trends.`;

    const content = await callAI({
      systemPrompt: SYSTEM_PROMPT,
      userMessage,
      temperature: 0.3,
      maxTokens: 6000,
      timeoutMs: 75000,
      retries: 1,
    });

    const fallback = {
      marketOverview: { condition: 'neutral', sp500trend: 'sideways', keyMacroFactors: [], topSectors: [], weakSectors: [] },
      sectors: [],
    };

    const scan = parseAIResponse(content, fallback);
    return NextResponse.json({ scan });
  } catch (error: unknown) {
    if (error instanceof AIError) {
      console.error('Sector scan AI error:', error.code, error.message);
      return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Sector scan error:', message);
    return NextResponse.json({ error: 'Skanimi i sektorit dështoi. Provo përsëri.' }, { status: 500 });
  }
}
