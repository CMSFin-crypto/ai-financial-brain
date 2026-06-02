import { NextRequest, NextResponse } from 'next/server';
import { callAI, parseAIResponse, AIError } from '@/lib/ai';
import { getStocksBySector } from '@/lib/market-data';

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

// ═══════════════════════════════════════════
// DEMO DATA — realistic simulation when AI is unreachable
// Stock profiles now imported from centralized market-data module
// ═══════════════════════════════════════════

interface DemoStock {
  ticker: string;
  company: string;
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  price: number;
  technicalNote: string;
  fundamentalNote: string;
  catalyst: string;
  quickScore: number;
}

interface DemoSector {
  name: string;
  overallSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  sectorConfidence: number;
  trend: string;
  stocks: DemoStock[];
}

function mapStockToDemo(s: { ticker: string; company: string; price: number; sector: string; signal: string; rating: string; revGrowth: string; opMargin: string; trend: string }): DemoStock {
  const confidence = s.signal === 'BULLISH' ? 75 + Math.floor(Math.random() * 20)
    : s.signal === 'BEARISH' ? 35 + Math.floor(Math.random() * 15)
    : 50 + Math.floor(Math.random() * 15);
  const quickScore = confidence;

  const technicalNote = s.signal === 'BULLISH'
    ? 'Tendenc\u00eb ngjit\u00ebse e konfirmuar, \u00e7mimi mbi SMA kryesore, v\u00ebllimi n\u00eb rritje'
    : s.signal === 'BEARISH'
      ? 'Tendenc\u00eb ul\u00ebse me \u00e7mimin n\u00ebn SMA kryesore, presion zbrit\u00ebs'
      : 'L\u00ebvizje an\u00ebsore pa drejtim t\u00eb qart\u00eb, indikator\u00eb neutral\u00eb';

  const fundamentalNote = `Rritje t\u00eb ardhurash ${s.revGrowth}, marzh\u00eb operative ${s.opMargin}, rating ${s.rating}`;
  const catalyst = s.signal === 'BULLISH'
    ? `Momentum pozitiv, k\u00ebrkes\u00eb sektoriale n\u00eb rritje, fitime rezultate pozitive`
    : s.signal === 'BEARISH'
      ? `Headwinds sektoriale, \u00e7mime n\u00eb r\u00ebnie, uncertainty makroekonomike`
      : `Asnj\u00eb katalizator i duksh\u00ebm, prisni konfirmim tekniku`;

  return {
    ticker: s.ticker,
    company: s.company,
    signal: s.signal as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
    confidence,
    price: s.price,
    technicalNote,
    fundamentalNote,
    catalyst,
    quickScore,
  };
}

function generateDemoSectorScan() {
  const techStocks = getStocksBySector('Technology').map(mapStockToDemo);
  const healthcareStocks = getStocksBySector('Healthcare').map(mapStockToDemo);
  const financeStocks = getStocksBySector('Finance').map(mapStockToDemo);
  const energyStocks = getStocksBySector('Energy').map(mapStockToDemo);
  const consumerStocks = getStocksBySector('Consumer Discretionary').map(mapStockToDemo);

  const sectors: DemoSector[] = [
    {
      name: 'Technology',
      overallSignal: 'BULLISH',
      sectorConfidence: 85,
      trend: 'Tendenc\u00eb ngjit\u00ebse e fort\u00eb e udh\u00ebhequr nga AI dhe \u00e7ipat semikonduktor\u00eb. Kapitalizimi i madh n\u00eb rritje me k\u00ebrkesa t\u00eb papar\u00eb p\u00ebr infrastruktur\u00ebn AI.',
      stocks: techStocks,
    },
    {
      name: 'Healthcare',
      overallSignal: 'BULLISH',
      sectorConfidence: 78,
      trend: 'Sektori i sh\u00ebndet\u00ebsis\u00eb tregon moment pozitiv me dominimin e drog\u00ebve GLP-1 dhe inovacion kirurgjik. Eli Lilly dhe Vertex udh\u00ebheqin.',
      stocks: healthcareStocks,
    },
    {
      name: 'Finance',
      overallSignal: 'BULLISH',
      sectorConfidence: 70,
      trend: 'Sektori financiar n\u00eb p\u00ebrmir\u00ebsim me pritjet p\u00ebr ulje t\u00eb normave. JPMorgan dhe Visa tregojn\u00eb moment pozitiv. Bankat e m\u00ebdha profitojn\u00eb nga yield curve.',
      stocks: financeStocks,
    },
    {
      name: 'Energy',
      overallSignal: 'NEUTRAL',
      sectorConfidence: 48,
      trend: 'Sektori i energjis\u00eb n\u00ebn presion nga r\u00ebnia e \u00e7mimeve t\u00eb naft\u00ebs. Shumica e aksioneve n\u00eb l\u00ebvizje an\u00ebsore. Kujdes afatgjat\u00eb p\u00ebr kalimin.',
      stocks: energyStocks,
    },
    {
      name: 'Consumer Discretionary',
      overallSignal: 'NEUTRAL',
      sectorConfidence: 55,
      trend: 'Sektori i konsumit me performanc\u00eb t\u00eb p\u00ebrzier. Amazon udh\u00ebheq, por Nike dhe Target n\u00ebn presion. Rip\u00ebrtuarja e konsumatorit po ndikohet nga inflacioni.',
      stocks: consumerStocks,
    },
  ];

  return {
    marketOverview: {
      condition: 'bullish',
      sp500trend: 'uptrend',
      keyMacroFactors: [
        'Pritjet p\u00ebr ulje t\u00eb normave nga Fed n\u00eb H2 2025',
        'Sezoni i fitimeve me rezultate pozitive nga teknologjia',
        'Inflacioni duke u ftohur, CPI 3.1%',
        'Tensionet gjeopolitike SHBA-Kin\u00eb',
      ],
      topSectors: ['Technology', 'Healthcare', 'Finance'],
      weakSectors: ['Energy'],
      isDemo: true,
    },
    sectors,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: SectorScanRequest = await request.json();
    const sector = body.sector;
    const count = body.count || 10;

    const userMessage = sector
      ? `Scan the ${sector.toUpperCase()} sector specifically. Return top ${count} stocks with full multi-factor analysis for each. Include market overview and sector trends.`
      : `Perform a FULL market scan of ALL 5 sectors (Technology, Healthcare, Finance, Energy, Consumer Discretionary). Return top ${count} stocks per sector with multi-factor scoring. Include overall market overview and sector rotation trends.`;

    // Try real AI first, fall back to demo
    let content: string;
    try {
      content = await callAI({
        systemPrompt: SYSTEM_PROMPT,
        userMessage,
        temperature: 0.3,
        maxTokens: 6000,
        timeoutMs: 30000,
        retries: 0,
      });
    } catch {
      // AI unavailable — use demo data
      console.log('[DEMO MODE] AI unavailable for sector-scan, using simulation data');
      const demo = generateDemoSectorScan();
      return NextResponse.json({ scan: demo, demo: true });
    }

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
    return NextResponse.json({ error: 'Skanimi i sektorit d\u00ebshtoi. Provo p\u00ebrs\u00ebri.' }, { status: 500 });
  }
}
