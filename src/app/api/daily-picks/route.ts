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

// ═══════════════════════════════════════════
// DEMO DATA — realistic simulation when AI is unreachable
// ═══════════════════════════════════════════

function generateDemoPicks() {
  const today = new Date().toISOString().split('T')[0];

  return {
    date: today,
    marketCondition: 'bullish' as const,
    marketSummary:
      'Tregjet tregojnë ton pozitiv me rritje në sektorin e teknologjisë. Investitorët institucionalë po rrisin pozicionet në aksione me kapital të madh, duke nxitur performancën e përgjithshme të S&P 500.',
    isDemo: true,
    topPicks: [
      {
        ticker: 'NVDA',
        company: 'NVIDIA Corp',
        sector: 'Technology',
        currentPrice: 875.50,
        targetPrice: 950.00,
        stopLoss: 840.00,
        signal: 'BUY',
        confidence: 92,
        timeframe: 'medium-term',
        technicalReason:
          'Golden Cross i konfirmuar në grafikun ditor, RSI në 65 me tendencë ngjitëse, vëllimi 1.5x mbi mesataren',
        fundamentalReason:
          'Rritja e të ardhurave 125% YoY, dominimi i tregut të çipeve AI, raporti PEG 1.2',
        catalyst: 'Lançimi i GPU Blackwell brezit të ardhshëm, kërkesa masive për qendra të dhënash AI',
        riskReward: '1:3.1',
        keyLevels: { support: '855.00', resistance: '910.00', pivot: '878.00' },
      },
      {
        ticker: 'AAPL',
        company: 'Apple Inc.',
        sector: 'Technology',
        currentPrice: 195.50,
        targetPrice: 215.00,
        stopLoss: 188.00,
        signal: 'BUY',
        confidence: 84,
        timeframe: 'medium-term',
        technicalReason:
          'Çmimi mbi SMA 20/50/200, EMA 12 kaloi mbi EMA 26, model Bull Flag në formim',
        fundamentalReason:
          'Ekosistemi i fortë produktesh, rritja e shërbimeve AI, marzha operative 29.8%',
        catalyst: 'Lançimi i prodhimeve të reja me AI, programi i blerjes së aksioneve $100B',
        riskReward: '1:2.5',
        keyLevels: { support: '190.00', resistance: '205.00', pivot: '197.50' },
      },
      {
        ticker: 'LLY',
        company: 'Eli Lilly & Co',
        sector: 'Healthcare',
        currentPrice: 782.30,
        targetPrice: 850.00,
        stopLoss: 750.00,
        signal: 'BUY',
        confidence: 87,
        timeframe: 'medium-term',
        technicalReason:
          'Tendencë ngjitëse e fortë në të gjitha afatet, MACD bosh me histogram pozitiv, vëllim në rritje',
        fundamentalReason:
          'Mounjaro dhe Zepbound duke dominuar tregun e ilaçeve për humbje peshe, rritje e të ardhurave 35%',
        catalyst: 'Zgjerimi global i Mounjaro, rezultatet klinike të reja positive',
        riskReward: '1:2.8',
        keyLevels: { support: '760.00', resistance: '810.00', pivot: '785.00' },
      },
      {
        ticker: 'JPM',
        company: 'JPMorgan Chase',
        sector: 'Finance',
        currentPrice: 198.30,
        targetPrice: 218.00,
        stopLoss: 190.00,
        signal: 'BUY',
        confidence: 80,
        timeframe: 'short-term',
        technicalReason:
          'Thyerje mbi rezistencën $196, RSI 58 me hapësirë, MACD duke treguar moment pozitiv',
        fundamentalReason:
          'Fitimet në rritje 9.1%, marzha neto 37.2%, P/E 11.8 nën mesataren e sektorit',
        catalyst: 'Pritjet për ulje të normave të interesit nga Fed, sezoni i mirë i fitimeve bancare',
        riskReward: '1:2.3',
        keyLevels: { support: '192.00', resistance: '205.00', pivot: '198.00' },
      },
      {
        ticker: 'AMZN',
        company: 'Amazon.com Inc.',
        sector: 'Technology',
        currentPrice: 185.60,
        targetPrice: 205.00,
        stopLoss: 176.00,
        signal: 'BUY',
        confidence: 81,
        timeframe: 'medium-term',
        technicalReason:
          'Recovery nga SMA 50, Bollinger Bands tregojnë zgjerim me moment ngjitës, vëllimi 1.3x',
        fundamentalReason:
          'AWS rritje 17% me kërkesë AI, fitimi i fundit $115/share, P/E Forward 42.5 me rritje EPS 115%',
        catalyst: 'Zgjerimi i shërbimeve AI në AWS, sezoni i festave me shitje rekord',
        riskReward: '1:2.2',
        keyLevels: { support: '178.00', resistance: '195.00', pivot: '186.00' },
      },
    ],
    marketMovers: [
      {
        ticker: 'TSLA',
        direction: 'UP',
        reason:
          'Lansimi i modelit të ri Robotaxi duke shtuar optimizëm për të ardhmen e Tesla',
      },
      {
        ticker: 'XOM',
        direction: 'DOWN',
        reason:
          'Rënia e çmimeve të naftës duke goditur perspektivat e fitimeve të ExxonMobil',
      },
      {
        ticker: 'META',
        direction: 'UP',
        reason:
          'Reklamat AI po rrisin të ardhurat, Reality Labs duke treguar përmirësim',
      },
    ],
    warnings: [
      'Vigilëncë e nevojshme për volatilitetin e Fed minutes këtë javë',
      'Tensionet gjeopolitike mes SHBA dhe Kinës mund të prekin zinxhirët e furnizimit',
    ],
  };
}

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];

    const userMessage = `Generate today's top stock picks for ${today}. Focus on stocks with the highest probability of moving up today or this week. Include technical levels, catalysts, and risk/reward ratios. Make the picks realistic and based on current market conditions.`;

    // Try real AI first, fall back to demo
    let content: string;
    try {
      content = await callAI({
        systemPrompt: SYSTEM_PROMPT,
        userMessage,
        temperature: 0.4,
        timeoutMs: 30000,
        retries: 0,
      });
    } catch {
      // AI unavailable — use demo data
      console.log('[DEMO MODE] AI unavailable for daily-picks, using simulation data');
      const demo = generateDemoPicks();
      return NextResponse.json({ picks: demo, demo: true });
    }

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
