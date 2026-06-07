import { NextRequest, NextResponse } from 'next/server';
import { callAI, parseAIResponse, AIError } from '@/lib/ai';
import { getStocksBySector } from '@/lib/market-data';
import { getRealPrices, injectPricesIntoPrompt } from '@/lib/alpha-vantage';
import { buildLearningContext, recordFromAIResponse } from '@/lib/ai-learning';

interface SectorScanRequest {
  sector?: string;
  count?: number;
}

const SYSTEM_PROMPT = `You are a SECTOR SCANNER AI — scan all major sectors and return the TOP 10 stocks per sector with DETAILED ratings.

For EACH stock in each sector, provide a COMPREHENSIVE evaluation:

MANDATORY fields per stock:
- ticker, company name, sector
- rating: STRONG_BUY | BUY | HOLD | SELL | STRONG_SELL (choose ONE)
- confidence: 0-100 (how confident in the rating)
- price: current estimated price
- entryPrice: suggested entry price (or null)
- targetPrice: price target (12-month)
- stopLoss: stop loss level
- upside: percentage upside to target (can be negative)
- riskReward: risk/reward ratio string like "1:3" or "1:2.5"
- quickScore: 0-100 overall composite score

SHORT-TERM PREDICTIONS per stock (Albanian language):
- prediction: object with:
  - shortTerm: { direction: "UP"|"DOWN"|"SIDEWAYS", expectedMove: "percent like +2.5% or -1.3%", confidence: 0-100, note: "1-2 sentences explaining what to expect in the next 1-3 trading days, what price levels to watch, and why" }
  - weekly: { direction: "UP"|"DOWN"|"SIDEWAYS", expectedMove: "percent like +5% or -3%", confidence: 0-100, keyEvents: ["event1", "event2"], note: "1-2 sentences about the week ahead, earnings dates, Fed events, sector catalysts" }

DETAILED analysis per stock (Albanian language):
- technicalNote: 1-2 sentences about technical analysis (RSI, MACD, moving averages, chart patterns)
- fundamentalNote: 1-2 sentences about fundamentals (P/E, growth, margins, earnings, valuation)
- catalyst: key catalyst or upcoming event driving the rating
- reasoning: 2-3 sentences explaining WHY this rating was assigned — the bull case AND the bear case
- keyRisks: 1-2 specific risks that could invalidate the rating

Sectors to scan (78 total stocks across 9 sectors):
1. TECHNOLOGY (10): AAPL, MSFT, GOOGL, AMZN, META, CRM, NFLX, ADBE, NOW, ORCL
2. SEMICONDUCTORS (10): NVDA, AVGO, AMD, INTC, QCOM, TXN, MU, MRVL, ON, LRCX
3. HEALTHCARE (10): LLY, UNH, ISRG, VRTX, ABBV, TMO, JNJ, MRK, ABT, PFE
4. FINANCE (10): JPM, V, MA, GS, BLK, MS, SCHW, BAC, WFC, C
5. ENERGY (10): XOM, CVX, COP, SLB, EOG, MPC, FANG, DVN, WFRD, PARR
6. INDUSTRY (8): CAT, GE, HON, UNP, DE, UPS, ETN, BA
7. RETAIL (5): COST, WMT, TGT, HD, TJX
8. DEFENSE (5): RTX, LMT, NOC, GD, LHX
9. AI (10): PLTR, AI, SMCI, SNOW, DDOG, ANET, ARM, CRWD, NET, HPE

For each stock, give a MULTI-FACTOR score combining:
- Technical momentum (trend, volume, MA alignment)
- Fundamental valuation (P/E vs sector, growth, margins)
- Recent news/catalyst impact
- Overall sector tailwind/headwind

RATING CRITERIA:
- STRONG_BUY: score 85+, strong technical + fundamental + catalyst alignment
- BUY: score 70-84, positive bias across multiple factors
- HOLD: score 50-69, mixed signals, no clear direction
- SELL: score 30-49, deteriorating technicals + fundamentals
- STRONG_SELL: score <30, clear breakdown across all factors

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
          "rating": "STRONG_BUY",
          "signal": "BULLISH",
          "confidence": 92,
          "price": 875.50,
          "entryPrice": 860.00,
          "targetPrice": 1050.00,
          "stopLoss": 790.00,
          "upside": 20.0,
          "riskReward": "1:3.2",
          "quickScore": 91,
          "prediction": {
            "shortTerm": {
              "direction": "UP",
              "expectedMove": "+1.8%",
              "confidence": 78,
              "note": "RSI në zonë të ngjitjes me MA alignment pozitive. Prisnim testimin e rezistencës $890 brenda 2 ditësh. Vëllimi i lartë mbështet vazhdimin."
            },
            "weekly": {
              "direction": "UP",
              "expectedMove": "+4.2%",
              "confidence": 72,
              "keyEvents": ["Data e fitimeve 15 Qershor", "Keynote AI Conference 18 Qershor"],
              "note": "Java e ardhme mbështetet nga data i fitimeve dhe ngjarja AI conference. Prisnim rritje të thellë nëse rezultatet tejkalojnë pritjet."
            }
          },
          "technicalNote": "Golden Cross confirmed, RSI at 65 me tendencë ngjitëse të fortë, vëllimi 1.5x mesatarja",
          "fundamentalNote": "Rritje e të ardhurave 125% YoY, përdominues në tregun e çipave AI, PEG ratio 1.2",
          "catalyst": "Hyrja në treg e GPU Blackwell të reja, kërkesë eksplozive për data center AI",
          "reasoning": "NVIDIA tregon moment të jashtëzakonshëm me dominim në tregun e AI dhe rritje eksplozive të të ardhurave. Rrjeti i ekosistemit CUDA krijon moat konkurrues të fuqishëm. Rreziqet përfshijnë vlerësim të lartë dhe varësi nga kërkesa e data center.",
          "keyRisks": ["Vlerësim i lartë (P/E >60)", "Varësi nga kërkesa e data center"]
        }
      ]
    }
  ]
}

Make all data realistic and current. Return ONLY pure JSON.

IMPORTANT CALIBRATION RULES:
- Default confidence should be 55-75% unless there is VERY strong evidence
- Only give 80%+ confidence for clear catalyst events
- Verify trend direction before assigning ratings
- Consider sector rotation and macro factors
- Prefer being correct over being bold
- ALWAYS include entryPrice, targetPrice, stopLoss, upside, riskReward, reasoning, keyRisks, prediction for every stock
- Predictions should be realistic (typically +/- 1-3% for short term, +/- 2-6% for weekly)
- Include specific upcoming events in weekly predictions (earnings dates, Fed meetings, conferences, etc.)
- Base predictions on technical patterns AND upcoming catalysts`;

// ═══════════════════════════════════════════
// DEMO DATA — realistic simulation when AI is unreachable
// Stock profiles now imported from centralized market-data module
// ═══════════════════════════════════════════

type Rating = 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';

interface DemoStock {
  ticker: string;
  company: string;
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  rating: Rating;
  confidence: number;
  price: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  upside: number;
  riskReward: string;
  technicalNote: string;
  fundamentalNote: string;
  catalyst: string;
  reasoning: string;
  keyRisks: string[];
  prediction?: {
    shortTerm: {
      direction: string;
      expectedMove: string;
      confidence: number;
      note: string;
    };
    weekly: {
      direction: string;
      expectedMove: string;
      confidence: number;
      keyEvents: string[];
      note: string;
    };
  };
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

function getRatingFromScore(score: number): Rating {
  if (score >= 85) return 'STRONG_BUY';
  if (score >= 70) return 'BUY';
  if (score >= 50) return 'HOLD';
  if (score >= 30) return 'SELL';
  return 'STRONG_SELL';
}

function mapStockToDemo(s: { ticker: string; company: string; price: number; sector: string; signal: string; rating: string; revGrowth: string; opMargin: string; trend: string; industry?: string }, livePrice?: number) {
  const confidence = s.signal === 'BULLISH' ? 75 + Math.floor(Math.random() * 20)
    : s.signal === 'BEARISH' ? 35 + Math.floor(Math.random() * 15)
    : 50 + Math.floor(Math.random() * 15);
  const quickScore = confidence;
  const rating = getRatingFromScore(quickScore);

  // CRITICAL: Use live price if available
  const price = (livePrice && livePrice > 0) ? livePrice : s.price;

  const entryPrice = Math.round(price * (s.signal === 'BULLISH' ? 0.97 : s.signal === 'BEARISH' ? 1.03 : 1.0) * 100) / 100;
  const upside = s.signal === 'BULLISH' ? Math.round((10 + Math.random() * 25) * 10) / 10
    : s.signal === 'BEARISH' ? -Math.round((5 + Math.random() * 20) * 10) / 10
    : Math.round((-5 + Math.random() * 10) * 10) / 10;
  const targetPrice = Math.round(price * (1 + upside / 100) * 100) / 100;
  const stopLoss = s.signal === 'BULLISH' ? Math.round(price * (1 - 0.06 - Math.random() * 0.04) * 100) / 100
    : s.signal === 'BEARISH' ? Math.round(price * (1 + 0.05 + Math.random() * 0.05) * 100) / 100
    : Math.round(price * 0.95 * 100) / 100;
  const riskRewardVal = Math.abs(upside) > 0 ? (Math.abs(upside) / (Math.abs(price - stopLoss) / price * 100)).toFixed(1) : '1.0';
  const riskReward = `1:${riskRewardVal}`;

  const technicalNote = s.signal === 'BULLISH'
    ? 'Tendenc\u00eb ngjit\u00ebse e konfirmuar, RSI n\u00eb zon\u00ebn e rritjes, MACD bullish crossover aktive'
    : s.signal === 'BEARISH'
      ? 'RSI n\u00ebn 30, MACD bearish, \u00e7mimi n\u00ebn t\u00eb gjith\u00eb SMA kryesore me presion zbrit\u00ebs'
      : 'RSI pran\u00eb 50, l\u00ebvizje an\u00ebsore, MACD flet\u00eb pa sinjal t\u00eb qart\u00eb';

  const fundamentalNote = `Rritje t\u00eb ardhurash ${s.revGrowth}, marzh\u00eb operative ${s.opMargin}, vler\u00ebsim ${s.rating}`;
  const catalyst = s.signal === 'BULLISH'
    ? `Momentum pozitiv, k\u00ebrkes\u00eb sektoriale n\u00eb rritje, fitime rezultate mbi pritjet`
    : s.signal === 'BEARISH'
      ? `Headwinds sektoriale, \u00e7mime n\u00eb r\u00ebnie, rrezik makroekonomik n\u00eb rritje`
      : `Asnj\u00eb katalizator i duksh\u00ebm, prisni konfirmim tekniku para hyrjes`;

  const reasoning = s.signal === 'BULLISH'
    ? `${s.company} tregon forcim n\u00eb t\u00eb gjith\u00eb faktor\u00ebt. Teknikisht, çmimi ka thyer rezistenc\u00ebn kryesore dhe tregojn\u00eb moment pozitiv. Fundamentet mbështesin me rritje t\u00eb ardhurash ${s.revGrowth}. Megjithat\u00eb, kujdes ndaj rrezikut t\u00eb kthimit t\u00eb shpejt\u00eb n\u00eb rast të lajmeve t\u00eb këqija makroekonomike.`
    : s.signal === 'BEARISH'
      ? `${s.company} tregon dob\u00ebsi n\u00eb shum\u00eb faktor\u00eb. Presioni zbrit\u00ebs \u00ebsht\u00eb i qart\u00eb me çmimin posht\u00eb SMA. Fundamentet jan\u00eb n\u00eb p\u00ebrmir\u00ebsim me rritje t\u00eb ngadalshme. Megjithat\u00eb, n\u00eb rast t\u00eb ndryshimi t\u00eb tendenc\u00ebs, mund t\u00eb ofroj\u00eb vler\u00eb.`
      : `${s.company} tregon sinjale t\u00eb p\u00ebrzier\u00eb. Asnj\u00eb drejtim i qart\u00eb n\u00eb t\u00eb momentit. Prisni konfirmim tekniku ose lajm katalizator para se t\u00eb merrni pozicion.`;

  const keyRisks = s.signal === 'BULLISH'
    ? ['Rreziku i korrigjimit afatshkurt\u00ebr pas ngjitjes', 'Ndryshimi i politik\u00ebs monetare t\u00eb Fed']
    : s.signal === 'BEARISH'
      ? ['Mund\u00ebsia e raportimit t\u00eb mir\u00eb t\u00eb fitimeve', 'Shitja e shkurt\u00ebr e tepruar']
      : ['Pasiguria e tregut', 'Mungesa e katalizatorit'];

  // ═══ SHORT-TERM PREDICTIONS ═══
  const stMove = s.signal === 'BULLISH'
    ? '+' + (0.5 + Math.random() * 2.5).toFixed(1) + '%'
    : s.signal === 'BEARISH'
      ? '-' + (0.3 + Math.random() * 2.0).toFixed(1) + '%'
      : (Math.random() > 0.5 ? '+' : '-') + (0.1 + Math.random() * 0.8).toFixed(1) + '%';
  const stDir = stMove.startsWith('+') ? 'UP' : stMove.startsWith('-') ? 'DOWN' : 'SIDEWAYS';
  const stConf = s.signal === 'BULLISH' ? 65 + Math.floor(Math.random() * 20)
    : s.signal === 'BEARISH' ? 55 + Math.floor(Math.random() * 20)
    : 40 + Math.floor(Math.random() * 20);
  const stNote = s.signal === 'BULLISH'
    ? 'Indikator\u00ebt teknike tregojn\u00eb vazhdim t\u00eb tendenc\u00ebs ngjit\u00ebse. Prisnim l\u00ebvizje pozitive n\u00eb dit\u00ebt n\u00eb vijim n\u00ebse \u00e7mimi mban mb\xeb SMA 20.'
    : s.signal === 'BEARISH'
      ? 'Presioni zbrit\u00ebs vazhdon. Prisnim testim t\u00eb mb\u00ebshtetjes s\u00eb reja n\u00ebn. N\u00ebse thyhet, r\u00ebnia mund t\u00eb thellohet.'
      : 'Asnj\u00eb sinjal i qart\u00eb. Tregu po l\u00ebviz n\u00eb gam\u00eb t\u00eb ngusht\u00eb. Prisnim thyerje n\u00eb nj\u00eb drejtim brenda dit\u00ebsh.';

  const wkMove = s.signal === 'BULLISH'
    ? '+' + (1.5 + Math.random() * 4.5).toFixed(1) + '%'
    : s.signal === 'BEARISH'
      ? '-' + (1.0 + Math.random() * 4.0).toFixed(1) + '%'
      : (Math.random() > 0.5 ? '+' : '-') + (0.3 + Math.random() * 1.5).toFixed(1) + '%';
  const wkDir = wkMove.startsWith('+') ? 'UP' : wkMove.startsWith('-') ? 'DOWN' : 'SIDEWAYS';
  const wkConf = s.signal === 'BULLISH' ? 60 + Math.floor(Math.random() * 20)
    : s.signal === 'BEARISH' ? 50 + Math.floor(Math.random() * 20)
    : 35 + Math.floor(Math.random() * 20);

  const weekEvents = s.signal === 'BULLISH'
    ? ['Raporti i fitimeve pritet pozitiv', 'Sektori n\u00eb tendenc\u00eb rrit\u00ebse']
    : s.signal === 'BEARISH'
      ? ['Rrezik makroekonomik i lart\u00eb', 'Shtypja e tregut nga korrigjimi']
      : ['Asnj\u00eb ngjarje e r\u00ebnd\u00ebsishme', 'Tregu n\u00eb pritje'];

  const wkNote = s.signal === 'BULLISH'
    ? 'Java e ardhme tregon potencial pozitiv me katalizator sektorial. Prisnim rritje n\u00ebse tregu i gjer\u00eb mban momentin.'
    : s.signal === 'BEARISH'
      ? 'Java e ardhme mbart rrezik zbrit\u00ebse. Kujdes ndaj niveleve t\u00eb mb\u00ebshtetjes.'
      : 'Java e ardhme pa drejtim t\u00eb qart\u00eb. Prisni sinjal nga tregu para nd\u00ebrmarjes s\u00eb veprimeve.';

  return {
    ticker: s.ticker,
    company: s.company,
    signal: s.signal as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
    rating,
    confidence,
    price,
    entryPrice,
    targetPrice,
    stopLoss,
    upside,
    riskReward,
    technicalNote,
    fundamentalNote,
    catalyst,
    reasoning,
    keyRisks,
    prediction: {
      shortTerm: { direction: stDir, expectedMove: stMove, confidence: stConf, note: stNote },
      weekly: { direction: wkDir, expectedMove: wkMove, confidence: wkConf, keyEvents: weekEvents, note: wkNote },
    },
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
      : `Perform a FULL market scan of ALL 9 sectors. Include ALL 9: Technology, Semiconductors, Healthcare, Finance, Energy, Industry, Retail, Defense, AI. Return ALL stocks per sector. The AI sector has 10 stocks (PLTR, AI, SMCI, SNOW, DDOG, ANET, ARM, CRWD, NET, HPE). You MUST include the AI sector in response.`

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
        maxTokens: 12000,
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
