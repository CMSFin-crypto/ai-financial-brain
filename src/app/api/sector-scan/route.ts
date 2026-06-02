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

// ═══════════════════════════════════════════
// DEMO DATA — realistic simulation when AI is unreachable
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

function generateDemoSectorScan() {
  const techStocks: DemoStock[] = [
    { ticker: 'NVDA', company: 'NVIDIA Corp', signal: 'BULLISH', confidence: 92, price: 875.50, technicalNote: 'Golden Cross i konfirmuar, RSI 65 me tendencë ngjitëse, vëllimi 1.5x', fundamentalNote: 'Rritja e të ardhurave 125% YoY, dominim çipash AI, PEG 1.2', catalyst: 'Lançimi i Blackwell GPU, kërkesa e datacenter AI', quickScore: 92 },
    { ticker: 'AAPL', company: 'Apple Inc.', signal: 'BULLISH', confidence: 84, price: 195.50, technicalNote: 'Çmimi mbi SMA 20/50/200, model Bull Flag në formim', fundamentalNote: 'Ekosistemi i fortë, rritje shërbimesh AI, marzha 29.8%', catalyst: 'Integrimi AI në iPhone, program blerje $100B', quickScore: 84 },
    { ticker: 'META', company: 'Meta Platforms', signal: 'BULLISH', confidence: 88, price: 505.75, technicalNote: 'MACD pozitiv me histogram në rritje, çmimi mbi EMA 12/26', fundamentalNote: 'Fitimi në rritje 45% YoY, marzha operative 38.5%', catalyst: 'Reklamat AI duke shtuar të ardhura, Reality Labs përmirësim', quickScore: 87 },
    { ticker: 'MSFT', company: 'Microsoft Corp', signal: 'BULLISH', confidence: 82, price: 415.20, technicalNote: 'Tendencë ngjitëse në të gjitha afatet, SMA 20 > 50 > 200', fundamentalNote: 'Azure rritje 17%, Copilot AI duke çuar nënshkrime', catalyst: 'Adopsimi masiv i Copilot AI, rritje Azure', quickScore: 82 },
    { ticker: 'GOOGL', company: 'Alphabet Inc.', signal: 'BULLISH', confidence: 78, price: 175.30, technicalNote: 'Recovery nga SMA 50, vëllim në rritje 1.2x', fundamentalNote: 'P/E 24.1 nën mesataren teknologjike, rritje 13.5%', catalyst: 'Gemini AI integrim në kërkim, YouTube Shorts', quickScore: 78 },
    { ticker: 'AMZN', company: 'Amazon.com Inc.', signal: 'BULLISH', confidence: 80, price: 185.60, technicalNote: 'Bollinger Bands duke treguar zgjerim me moment ngjitës', fundamentalNote: 'AWS rritje 17%, EPS rritje 115%', catalyst: 'Zgjerimi AI në AWS, shitje festash rekord', quickScore: 79 },
    { ticker: 'AVGO', company: 'Broadcom Inc.', signal: 'BULLISH', confidence: 85, price: 1650.00, technicalNote: 'Golden Cross i ri, RSI 62 me hapësirë ngjitese', fundamentalNote: 'Rritje e të ardhurave 44% nga VMware aktrimi', catalyst: 'Integrimi VMware, çipa AI për datacenter', quickScore: 84 },
    { ticker: 'AMD', company: 'Advanced Micro Devices', signal: 'BULLISH', confidence: 76, price: 178.50, technicalNote: 'Tendencë ngjitëse me MACD bosh, çmimi mbi SMA 50', fundamentalNote: 'MI300 AI accelerator duke fituar treg', catalyst: 'MI300 AI chip konkurrent, rritje server', quickScore: 75 },
    { ticker: 'CRM', company: 'Salesforce Inc.', signal: 'BULLISH', confidence: 72, price: 252.80, technicalNote: 'Stabilizim mbi SMA 200, vëllimi mesatar', fundamentalNote: 'Agentforce AI duke çuar rritje', catalyst: 'Agentforce AI platform, margjinë në përmirësim', quickScore: 72 },
    { ticker: 'ORCL', company: 'Oracle Corp.', signal: 'BULLISH', confidence: 74, price: 142.30, technicalNote: 'Breakout mbi rezistencën $140, vëllim 1.4x', fundamentalNote: 'OCI cloud rritje 25%, kontrata AI afatgjata', catalyst: 'OCI AI cloud infrastructure, kontrata miliona-dollarëshe', quickScore: 73 },
  ];

  const healthcareStocks: DemoStock[] = [
    { ticker: 'LLY', company: 'Eli Lilly & Co', signal: 'BULLISH', confidence: 90, price: 782.30, technicalNote: 'Tendencë ngjitëse e fortë, çmimi mbi të gjitha MA-të', fundamentalNote: 'Mounjaro/Zepbound dominim, rritje të ardhurave 35%', catalyst: 'Zgjerimi global i GLP-1, rezultatet klinike positive', quickScore: 89 },
    { ticker: 'UNH', company: 'UnitedHealth Group', signal: 'BULLISH', confidence: 78, price: 527.40, technicalNote: 'Recovery nga suporti $500, MACD duke treguar moment pozitiv', fundamentalNote: 'P/E 21.3 i arsyeshëm, rritje të ardhurave 8.8%', catalyst: 'Shtesë Medicare Advantage, diversifikim Optum', quickScore: 78 },
    { ticker: 'ISRG', company: 'Intuitive Surgical', signal: 'BULLISH', confidence: 85, price: 412.50, technicalNote: 'Breakout mbi SMA 200, RSI 68 me moment ngjitës', fundamentalNote: 'Monopoli i da Vinci robotik, marzha 65%', catalyst: 'Adopsimi i robotikës kirurgjikale, rendiment 12% procedureve', quickScore: 84 },
    { ticker: 'VRTX', company: 'Vertex Pharmaceuticals', signal: 'BULLISH', confidence: 82, price: 428.60, technicalNote: 'Golden Cross, vëllim në rritje me moment pozitiv', fundamentalNote: 'Cystic fibrosis dominim, Trikafta blockbuster', catalyst: 'Pipeline CF, zgjerimi i tregut global', quickScore: 82 },
    { ticker: 'ABBV', company: 'AbbVie Inc.', signal: 'BULLISH', confidence: 75, price: 175.20, technicalNote: 'Stabilizim mbi SMA 50, Bollinger Bands neutral', fundamentalNote: 'Dividend 3.6%, Skyrizi/Humira rritje', catalyst: 'Skyrizi duke kompensuar Humira, pipeline imunologji', quickScore: 74 },
    { ticker: 'TMO', company: 'Thermo Fisher Scientific', signal: 'NEUTRAL', confidence: 62, price: 552.30, technicalNote: 'Lëvizje anësore pranë SMA 50, vëllimi mesatar', fundamentalNote: 'Rritje 2.5%, P/E 26.8 i arsyeshëm', catalyst: 'Recovery biotech spending, acquisitive growth', quickScore: 62 },
    { ticker: 'JNJ', company: 'Johnson & Johnson', signal: 'NEUTRAL', confidence: 58, price: 156.80, technicalNote: 'Çmimi pranë SMA 200, tendencë anësore', fundamentalNote: 'Dividend 3.05%, rritje e ngadalshme 3.2%', catalyst: 'Pipeline farmaceutike, Kenvue spin-off', quickScore: 58 },
    { ticker: 'MRK', company: 'Merck & Co.', signal: 'BULLISH', confidence: 70, price: 128.50, technicalNote: 'Tendencë ngjitëse moderate, çmimi mbi SMA 20/50', fundamentalNote: 'Keytruda blockbuster $25B+, rritje 8%', catalyst: 'Keytruda patent extension, shtesë indikacionet', quickScore: 69 },
    { ticker: 'ABT', company: 'Abbott Laboratories', signal: 'NEUTRAL', confidence: 60, price: 118.40, technicalNote: 'Lëvizje anësore, vëllimi mesatar pa sinjal', fundamentalNote: 'Dividend 1.85%, rritje 4.2%', catalyst: 'FreeStyle Libre growth, divizimi mjekësor', quickScore: 60 },
    { ticker: 'PFE', company: 'Pfizer Inc.', signal: 'BEARISH', confidence: 45, price: 28.15, technicalNote: 'Tendencë ulëse me çmimin nën SMA 200', fundamentalNote: 'Pas-COVID rënie të ardhurash, dividend 6.2%', catalyst: 'Pipeline oncology, Seagen aktrimi', quickScore: 45 },
  ];

  const financeStocks: DemoStock[] = [
    { ticker: 'JPM', company: 'JPMorgan Chase', signal: 'BULLISH', confidence: 82, price: 198.30, technicalNote: 'Thyerje mbi rezistencën $196, MACD pozitiv', fundamentalNote: 'P/E 11.8 nën mesataren, rritje fitimesh 9.1%', catalyst: 'Ulje normash nga Fed, fitime bankare në rritje', quickScore: 81 },
    { ticker: 'V', company: 'Visa Inc.', signal: 'BULLISH', confidence: 80, price: 278.90, technicalNote: 'Tendencë ngjitëse e vazhdueshme, çmimi mbi të gjitha MA-të', fundamentalNote: 'Marzha operative 48.5%, rritje ndërkombëtare 10.5%', catalyst: 'Rritje e pagesave ndërkombëtare, fintech partnerships', quickScore: 80 },
    { ticker: 'MA', company: 'Mastercard Inc.', signal: 'BULLISH', confidence: 79, price: 468.20, technicalNote: 'Golden Cross i konfirmuar, vëllim në rritje', fundamentalNote: 'Marzha operative 54.2%, rritje 11.2%', catalyst: 'Adopsioni i pagesave digitale, rritje e transaksioneve', quickScore: 78 },
    { ticker: 'GS', company: 'Goldman Sachs', signal: 'BULLISH', confidence: 74, price: 528.50, technicalNote: 'Recovery nga suporti $490, moment pozitiv', fundamentalNote: 'P/B 1.25 nën mesataren, fitime në përmirësim', catalyst: 'IPO market recovery, trading revenue growth', quickScore: 73 },
    { ticker: 'BLK', company: 'BlackRock Inc.', signal: 'BULLISH', confidence: 76, price: 925.30, technicalNote: 'Tendencë ngjitëse afatgjatë, çmimi mbi SMA 200', fundamentalNote: 'ETF dominim me $10T AUM, marzha operative 42%', catalyst: 'Inflows ETF, zgjerimi i algoritmeve AI', quickScore: 75 },
    { ticker: 'MS', company: 'Morgan Stanley', signal: 'BULLISH', confidence: 72, price: 98.50, technicalNote: 'Stabilizim mbi SMA 50, vëllimi mesatar', fundamentalNote: 'Wealth management rritje, P/E 15.8', catalyst: 'Wealth management growth, IPO pipeline', quickScore: 71 },
    { ticker: 'SCHW', company: 'Charles Schwab', signal: 'NEUTRAL', confidence: 58, price: 72.80, technicalNote: 'Lëvizje anësore, çmimi pranë SMA 50', fundamentalNote: 'Rritje asset gathering, por rate headwinds', catalyst: 'Rate cut expectations, TD Ameritrade integration', quickScore: 58 },
    { ticker: 'BAC', company: 'Bank of America', signal: 'NEUTRAL', confidence: 55, price: 38.20, technicalNote: 'Çmimi nën SMA 50, moment neutral', fundamentalNote: 'P/B 1.05, ndikim normash larta', catalyst: 'Rate cut tailwind, NII recovery', quickScore: 55 },
    { ticker: 'WFC', company: 'Wells Fargo', signal: 'NEUTRAL', confidence: 56, price: 58.90, technicalNote: 'Sideways movement, vëllimi i ulët', fundamentalNote: 'P/E 11.5, rregullore overhead', catalyst: 'Rregullore clearance, rritje NII', quickScore: 56 },
    { ticker: 'C', company: 'Citigroup', signal: 'NEUTRAL', confidence: 54, price: 60.50, technicalNote: 'Recovery tentative, çmimi pranë SMA 50', fundamentalNote: 'P/B 0.72, restrukturim në vazhdim', catalyst: 'Restructuring benefits, China exposure risk', quickScore: 54 },
  ];

  const energyStocks: DemoStock[] = [
    { ticker: 'CVX', company: 'Chevron Corp', signal: 'NEUTRAL', confidence: 55, price: 155.20, technicalNote: 'Stabilizim pas rënies, çmimi pranë SMA 200', fundamentalNote: 'Dividend 4.2%, P/E 12.8 i arsyeshëm', catalyst: 'Hess aktrimi, stabilizim çmimesh naftë', quickScore: 56 },
    { ticker: 'COP', company: 'ConocoPhillips', signal: 'NEUTRAL', confidence: 58, price: 112.80, technicalNote: 'Çmimi pranë SMA 50, vëllimi mesatar', fundamentalNote: 'P/E 11.5, dividend 2.1%', catalyst: 'Marathon Oil aktrimi, cash flow i fortë', quickScore: 58 },
    { ticker: 'SLB', company: 'Schlumberger', signal: 'NEUTRAL', confidence: 52, price: 42.50, technicalNote: 'Tendencë ulëse me çmimin nën SMA 50', fundamentalNote: 'Dependencë nga investimet e naftës', catalyst: 'International recovery, margin improvement', quickScore: 52 },
    { ticker: 'EOG', company: 'EOG Resources', signal: 'NEUTRAL', confidence: 56, price: 118.20, technicalNote: 'Lëvizje anësore, Bollinger Bands i ngushtë', fundamentalNote: 'P/E 9.8 nën mesataren, dividend 2.8%', catalyst: 'US shale production growth, capital discipline', quickScore: 55 },
    { ticker: 'XOM', company: 'Exxon Mobil', signal: 'BEARISH', confidence: 42, price: 108.50, technicalNote: 'Tendencë ulëse me çmimin nën SMA 50/200', fundamentalNote: 'Rritje -2.1%, çmimet e naftës në rënie', catalyst: 'Neom mega project, low-carbon investments', quickScore: 42 },
    { ticker: 'MPC', company: 'Marathon Petroleum', signal: 'NEUTRAL', confidence: 54, price: 178.50, technicalNote: 'Stabilizim mbi suportin $170, moment neutral', fundamentalNote: 'Refining margins stabile, dividend 2.2%', catalyst: 'Crack spread recovery, stock buyback', quickScore: 53 },
    { ticker: 'FANG', company: 'Diamondback Energy', signal: 'NEUTRAL', confidence: 56, price: 142.80, technicalNote: 'Recovery nga suporti, çmimi mbi SMA 20', fundamentalNote: 'Produktivitet i lartë shale, P/E 8.5', catalyst: 'Permian basin growth, Endeavor aktrimi', quickScore: 55 },
    { ticker: 'DVN', company: 'Devon Energy', signal: 'BEARISH', confidence: 40, price: 38.20, technicalNote: 'Tendencë ulëse me presion nën SMA 200', fundamentalNote: 'Dividend variable 4.5%, rënie fitimesh -12%', catalyst: 'Delaware basin focus, hedging benefits', quickScore: 40 },
    { ticker: 'WFRD', company: 'Weatherford Intl', signal: 'NEUTRAL', confidence: 52, price: 6.85, technicalNote: 'Volatilitet e lartë, pa tendencë të qartë', fundamentalNote: 'Transformation progress, small-cap risk', catalyst: 'International offshore growth', quickScore: 50 },
    { ticker: 'PARR', company: 'Par Pacific Holdings', signal: 'NEUTRAL', confidence: 50, price: 28.50, technicalNote: 'Sideways, vëllimi minimal', fundamentalNote: 'Refining exposure, diversifikim gjeografik', catalyst: 'Refining utilization, Hawaii operations', quickScore: 48 },
  ];

  const consumerStocks: DemoStock[] = [
    { ticker: 'AMZN', company: 'Amazon.com Inc.', signal: 'BULLISH', confidence: 80, price: 185.60, technicalNote: 'Breakout mbi SMA 50, vëllim 1.3x', fundamentalNote: 'AWS rritje 17%, EPS rritje 115%', catalyst: 'AI services growth, Prime Day', quickScore: 79 },
    { ticker: 'HD', company: 'Home Depot', signal: 'NEUTRAL', confidence: 62, price: 375.20, technicalNote: 'Lëvizje anësore, çmimi pranë SMA 200', fundamentalNote: 'P/E 22.5, dividend 2.4%', catalyst: 'Spring selling season, housing recovery', quickScore: 62 },
    { ticker: 'MCD', company: "McDonald's Corp", signal: 'BULLISH', confidence: 72, price: 295.40, technicalNote: 'Tendencë ngjitëse stabile, çmimi mbi SMA 20/50', fundamentalNote: 'Dividend 2.5%, rritje të ardhurave 5.5%', catalyst: 'Value meal strategy, international growth', quickScore: 71 },
    { ticker: 'TSLA', company: 'Tesla Inc.', signal: 'NEUTRAL', confidence: 52, price: 248.50, technicalNote: 'Lëvizje anësore me volatilitet të lartë', fundamentalNote: 'P/E 72.3 premium, rritje EPS -23%', catalyst: 'Robotaxi, FSD regulatory approval', quickScore: 52 },
    { ticker: 'NKE', company: 'Nike Inc.', signal: 'BEARISH', confidence: 38, price: 72.80, technicalNote: 'Tendencë ulëse e thellë, çmimi nën SMA 200', fundamentalNote: 'Rritje e ngadalësuar -5%, konkurrencë nga On Running', catalyst: 'DTC strategy turnaround, product innovation', quickScore: 38 },
    { ticker: 'SBUX', company: 'Starbucks Corp', signal: 'NEUTRAL', confidence: 58, price: 78.20, technicalNote: 'Stabilizim pas rënies, pranë SMA 50', fundamentalNote: 'P/E 22.8, dividend 2.8%', catalyst: 'China recovery, new store format', quickScore: 58 },
    { ticker: 'TGT', company: 'Target Corp.', signal: 'BEARISH', confidence: 42, price: 142.50, technicalNote: 'Tendencë ulëse me çmimin nën SMA 50', fundamentalNote: 'P/E 15.2, rritje 1.2%', catalyst: 'Private label growth, margin recovery', quickScore: 42 },
    { ticker: 'LOW', company: "Lowe's Companies", signal: 'NEUTRAL', confidence: 60, price: 265.80, technicalNote: 'Recovery nga suporti $250, moment neutral', fundamentalNote: 'P/E 19.5, dividend 2.1%', catalyst: 'Pro customer growth, share buybacks', quickScore: 60 },
    { ticker: 'F', company: 'Ford Motor Co.', signal: 'NEUTRAL', confidence: 48, price: 10.85, technicalNote: 'Rënie e thellë, çmimi pranë low-atjeve', fundamentalNote: 'P/E 8.5, dividend 5.2%', catalyst: 'EV transition, Blue Oval strategy', quickScore: 48 },
    { ticker: 'GM', company: 'General Motors', signal: 'NEUTRAL', confidence: 50, price: 45.20, technicalNote: 'Lëvizje anësore me presion ulës', fundamentalNote: 'P/E 6.2, dividend 1.1%', catalyst: 'EV profitability timeline, Cruise restructuring', quickScore: 50 },
  ];

  const sectors: DemoSector[] = [
    {
      name: 'Technology',
      overallSignal: 'BULLISH',
      sectorConfidence: 85,
      trend: 'Tendencë ngjitëse e fortë e udhëhequr nga AI dhe çipat semikonduktorë. Kapitalizimi i madh në rritje me kërkesa të paparë për infrastrukturën AI.',
      stocks: techStocks,
    },
    {
      name: 'Healthcare',
      overallSignal: 'BULLISH',
      sectorConfidence: 78,
      trend: 'Sektori i shëndetësisë tregon moment pozitiv me dominimin e drogëve GLP-1 dhe inovacion kirurgjik. Eli Lilly dhe Vertex udhëheqin.',
      stocks: healthcareStocks,
    },
    {
      name: 'Finance',
      overallSignal: 'BULLISH',
      sectorConfidence: 70,
      trend: 'Sektori financiar në përmirësim me pritjet për ulje të normave. JPMorgan dhe Visa tregojnë moment pozitiv. Bankat e mëdha profitojnë nga yield curve.',
      stocks: financeStocks,
    },
    {
      name: 'Energy',
      overallSignal: 'NEUTRAL',
      sectorConfidence: 48,
      trend: 'Sektori i energjisë nën presion nga rënia e çmimeve të naftës. Shumica e aksioneve në lëvizje anësore. Kujdes afatgjatë për kalimin.',
      stocks: energyStocks,
    },
    {
      name: 'Consumer Discretionary',
      overallSignal: 'NEUTRAL',
      sectorConfidence: 55,
      trend: 'Sektori i konsumit me performancë të përzier. Amazon udhëheq, por Nike dhe Target nën presion. Ripërtuarja e konsumatorit po ndikohet nga inflacioni.',
      stocks: consumerStocks,
    },
  ];

  return {
    marketOverview: {
      condition: 'bullish',
      sp500trend: 'uptrend',
      keyMacroFactors: [
        'Pritjet për ulje të normave nga Fed në H2 2025',
        'Sezoni i fitimeve me rezultate pozitive nga teknologjia',
        'Inflacioni duke u ftohur, CPI 3.1%',
        'Tensionet gjeopolitike SHBA-Kinë',
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
    return NextResponse.json({ error: 'Skanimi i sektorit dështoi. Provo përsëri.' }, { status: 500 });
  }
}
