import { NextRequest, NextResponse } from 'next/server';
import { callAI, parseAIResponse, AIError } from '@/lib/ai';
import { getStocksBySector } from '@/lib/market-data';
import { getRealPrices, injectPricesIntoPrompt } from '@/lib/alpha-vantage';
import { buildLearningContext, recordFromAIResponse } from '@/lib/ai-learning';

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

Sectors to scan (Technology, Semiconductors and AI have 10 stocks each, others have 5 = 55 total):
1. TECHNOLOGY (10): AAPL, MSFT, GOOGL, AMZN, META, CRM, NFLX, ADBE, NOW, ORCL
2. SEMICONDUCTORS (10): NVDA, AVGO, AMD, INTC, QCOM, TXN, MU, MRVL, ON, LRCX
3. HEALTHCARE (10): LLY, UNH, ISRG, VRTX, ABBV, TMO, JNJ, MRK, ABT, PFE
4. FINANCE (10): JPM, V, MA, GS, BLK, MS, SCHW, BAC, WFC, C
5. ENERGY (10): XOM, CVX, COP, SLB, EOG, MPC, FANG, DVN, WFRD, PARR
6. INDUSTRY (10): CAT, GE, HON, UNP, RTX, DE, UPS, ETN, BA
7. RETAIL (5): COST, WMT, TGT, HD, TJX
8. DEFENSE (3): NOC, GD, LHX
9. AI (10): PLTR, AI, SMCI, SNOW, DDOG, ANET, ARM, CRWD, NET, HPE

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

Make all data realistic and current. Return ONLY pure JSON.

IMPORTANT CALIBRATION RULES:
- Default confidence should be 55-75% unless there is VERY strong evidence
- Only give 80%+ confidence for clear catalyst events
- Verify trend direction before assigning BULLISH/BEARISH
- Consider sector rotation and macro factors
- Prefer being correct over being bold`;

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
  industry?: string;
}

interface DemoSector {
  name: string;
  overallSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  sectorConfidence: number;
  trend: string;
  stocks: DemoStock[];
}

function mapStockToDemo(s: { ticker: string; company: string; price: number; sector: string; signal: string; rating: string; revGrowth: string; opMargin: string; trend: string; industry?: string }, livePrice?: number) {
  const confidence = s.signal === 'BULLISH' ? 75 + Math.floor(Math.random() * 20)
    : s.signal === 'BEARISH' ? 35 + Math.floor(Math.random() * 15)
    : 50 + Math.floor(Math.random() * 15);
  const quickScore = confidence;

  // CRITICAL: Use live price if available
  const price = (livePrice && livePrice > 0) ? livePrice : s.price;

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
    price,
    technicalNote,
    fundamentalNote,
    catalyst,
    quickScore,
    industry: s.industry,
  };
}

function generateDemoSectorScan(livePrices?: Record<string, { price: number }>) {
  const techStocks = getStocksBySector('Technology').map(s => mapStockToDemo(s, livePrices?.[s.ticker]?.price));
  const semiStocks = getStocksBySector('Semiconductors').map(s => mapStockToDemo(s, livePrices?.[s.ticker]?.price));
  const healthcareStocks = getStocksBySector('Healthcare').map(s => mapStockToDemo(s, livePrices?.[s.ticker]?.price));
  const financeStocks = getStocksBySector('Finance').map(s => mapStockToDemo(s, livePrices?.[s.ticker]?.price));
  const energyStocks = getStocksBySector('Energy').map(s => mapStockToDemo(s, livePrices?.[s.ticker]?.price));
  const industryStocks = getStocksBySector('Industry').map(s => mapStockToDemo(s, livePrices?.[s.ticker]?.price));
  const retailStocks = getStocksBySector('Retail').map(s => mapStockToDemo(s, livePrices?.[s.ticker]?.price));
  const defenseStocks = getStocksBySector('Defense').map(s => mapStockToDemo(s, livePrices?.[s.ticker]?.price));
  const aiStocks = getStocksBySector('AI').map(s => mapStockToDemo(s, livePrices?.[s.ticker]?.price));

  const sectors: DemoSector[] = [
    {
      name: 'Technology',
      overallSignal: 'BULLISH',
      sectorConfidence: 85,
      trend: 'Tendenc\u00eb ngjit\u00ebse e fort\u00eb e udh\u00ebhequr nga AI dhe \u00e7ipat semikonduktor\u00eb. Kapitalizimi i madh n\u00eb rritje me k\u00ebrkesa t\u00eb papar\u00eb p\u00ebr infrastruktur\u00ebn AI.',
      stocks: techStocks,
    },
    {
      name: 'Semiconductors',
      overallSignal: 'BULLISH',
      sectorConfidence: 88,
      trend: 'Sektori m\u00eb i fuqish\u00ebm n\u00eb treg, i udh\u00ebhequr nga k\u00ebrkesa e eksplozive p\u00ebr AI/GPU. NVIDIA dominojn\u00eb me >90% market share. Broadcom, AMD, Qualcomm po fitojn\u00eb toke.',
      stocks: semiStocks,
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
      name: 'Industry',
      overallSignal: 'BULLISH',
      sectorConfidence: 72,
      trend: 'Sektori industrial n\u00eb tendenc\u00eb pozitive me rritjen e kërkesave për makineri t\u00eb r\u00ebnda dhe automatizim. Caterpillar dhe Eaton udh\u00ebheqin.',
      stocks: industryStocks,
    },
    {
      name: 'Retail',
      overallSignal: 'NEUTRAL',
      sectorConfidence: 58,
      trend: 'Sektori i retailit me performanc\u00eb t\u00eb ndryshueshme. Costco dhe Walmart tregojn\u00eb q\u00ebndrueshm\u00ebri, por Target dhe Home Depot n\u00ebn presion inflationi.',
      stocks: retailStocks,
    },
    {
      name: 'Defense',
      overallSignal: 'BULLISH',
      sectorConfidence: 82,
      trend: 'Sektori i mbrojtjes n\u00eb tendenc\u00eb ngjit\u00ebse me rritjen e buxhetit t\u00eb mbrojtjes EVROPÊb dhe NATO. Lockheed dhe RTX udh\u00ebheqin me backlog rekord.',
      stocks: defenseStocks,
    },
    {
      name: 'AI',
      overallSignal: 'BULLISH',
      sectorConfidence: 90,
      trend: 'Sektori i AI-së në rritje eksplozive me kërkesa masive për infrastrukturë AI. Palantir udhëheq me platformë AIP dominuese. Serverët AI dhe data cloud po shpërthejnë.',
      stocks: aiStocks,
    },
  ];

  return {
    marketOverview: {
      condition: 'bullish',
      sp500trend: 'uptrend',
      sp500Value: 7553.68,
      nasdaqValue: 26853.98,
      dowValue: 50687.07,
      vixValue: 16.34,
      keyMacroFactors: [
        'Fed funds rate 3.63% — zbritje graduale nën Kevin Warsh',
        'Core CPI 2.7%, duke u afruar drejt targetit 2%',
        'Yield curve NORMAL (2Y: 3.80% < 10Y: 4.49%)',
        'Unemployment 4.3%, tregu punës stabil',
        'DXY 99.33, dollar moderat',
        'Tensionet gjeopolitike: Lufta e Iran, SHBA-Kinë',
      ],
      topSectors: ['Technology', 'Healthcare', 'Finance'],
      weakSectors: ['Energy'],
      isDemo: true,
    },
    sectors,
  };
}

// ═══ CACHED LIVE PRICES for sector scan ─══
const sectorScanCache: Record<string, { prices: Record<string, {price: number}>; fetchedAt: number }> = {};
const SECTOR_SCAN_CACHE_TTL = 3 * 60 * 1000;

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body: SectorScanRequest = await request.json();
    const sector = body.sector;
    const count = body.count || 10;

    // ═══ FETCH REAL PRICES FOR TOP TICKERS ONLY ═══
    const topTickers = ['AAPL','MSFT','NVDA','GOOGL','AMZN','META','LLY','JPM','TSLA','V'];
    const livePrices = await getRealPrices(topTickers);
    console.log(`[SECTOR SCAN] Fetched ${Object.keys(livePrices).length} live prices out of ${topTickers.length} tickers`);

    let userMessage = sector
      ? `Scan the ${sector.toUpperCase()} sector specifically. Return top ${count} stocks with full multi-factor analysis for each. Include market overview and sector trends.`
      : `Perform a FULL market scan of       ? `Perform a FULL market scan of ALL 9 sectors. Include ALL 9: Technology, Semiconductors, Healthcare, Finance, Energy, Industry, Retail, Defense, AI. Return ALL stocks per sector. The AI sector has 10 stocks (PLTR, AI, SMCI, SNOW, DDOG, ANET, ARM, CRWD, NET, HPE). You MUST include the AI sector in response.`

    // Inject real prices into prompt
    if (Object.keys(livePrices).length > 0) {
      userMessage = injectPricesIntoPrompt(userMessage, livePrices);
    }

    // ═══ INJECT LEARNED LESSONS ═══
    const learningContext = await buildLearningContext();
    if (learningContext) {
      userMessage += `\n\n${learningContext}`;
    }

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
      // AI unavailable — use demo data with real prices where available
      console.log('[DEMO MODE] AI unavailable for sector-scan, using simulation data');
      const demo = generateDemoSectorScan(livePrices);
      return NextResponse.json({ scan: demo, demo: true });
    }

    const fallback = {
      marketOverview: { condition: 'neutral', sp500trend: 'sideways', keyMacroFactors: [], topSectors: [], weakSectors: [] },
      sectors: [],
    };

    const scan = parseAIResponse(content, fallback);

    // ═══ GUARANTEE AI SECTOR EXISTS ═══
    if (scan?.sectors && Array.isArray(scan.sectors)) {
      const hasAI = scan.sectors.some((s: { name?: string }) => s.name === 'AI');
      if (!hasAI) {
        console.log('[SECTOR SCAN] AI sector missing from AI response — injecting from demo data');
        const demo = generateDemoSectorScan(livePrices);
        const aiSector = demo.sectors.find(s => s.name === 'AI');
        if (aiSector) {
          scan.sectors.push(aiSector);
        }
      }
    }

    // ═══ RECORD SECTOR SCAN PREDICTIONS FOR LEARNING ═══
    if (scan?.sectors && Array.isArray(scan.sectors)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allPredictions: any[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const sector of scan.sectors as any[]) {
          if (sector?.stocks && Array.isArray(sector.stocks)) {
            for (const stock of sector.stocks) {
              allPredictions.push({
                ticker: stock.ticker,
                company: stock.company,
                sector: sector.name,
                signal: stock.signal,
                confidence: stock.confidence,
                currentPrice: stock.price,
                reasoning: stock.catalyst,
              });
            }
          }
        }
        if (allPredictions.length > 0) {
          await recordFromAIResponse('sector-scan', allPredictions);
          console.log(`[SECTOR SCAN] Recorded ${allPredictions.length} predictions for learning`);
        }
      } catch (learnErr) {
        console.error('[SECTOR SCAN] Failed to record predictions:', learnErr);
      }
    }

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
