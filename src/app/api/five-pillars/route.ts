import { NextResponse } from 'next/server';
import { getRealPrices } from '@/lib/alpha-vantage';
import { getAllStocks } from '@/lib/market-data';
import { analyzeFivePillarsBatch, type FivePillarsResult } from '@/lib/five-pillars-engine';

export const maxDuration = 90;

// Cache for 10 minutes
let cachedResult: { data: FivePillarsResult[]; summary: PillarSummary; fetchedAt: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

interface PillarSummary {
  totalAnalyzed: number;
  withResults: number;
  perfect: number;
  strong: number;
  good: number;
  limited: number;
  none: number;
  pillar1PassRate: number;
  pillar2PassRate: number;
  pillar3PassRate: number;
  pillar4PassRate: number;
  pillar5PassRate: number;
}

// ═══════════════════════════════════════════════════════════════
// LOW-CAP & MOMENTUM STOCKS — extra tickers for 5 Pillars scanner
// Ross Cameron focuses on small-cap stocks $1-$20 with high volume
// These are NOT in the main watchlist but are candidates for momentum
// ═══════════════════════════════════════════════════════════════

const MOMENTUM_TICKERS = [
  // Biotech / Pharma — often have FDA catalysts
  'NVAX', 'MRNA', 'AKBA', 'ARDX', 'AYTU', 'BIOX', 'BPMC', 'CARV', 'CASM', 'CMTX',
  'CTMX', 'DTIL', 'FSTAR', 'GLMD', 'GNS', 'HROW', 'IDYA', 'IMUX', 'INZY', 'IRTC',
  'KOD', 'KRTX', 'LGVN', 'LCTX', 'MRTX', 'NKTR', 'NTRA', 'OCGN', 'PRAX', 'PROG',
  'RAAS', 'RDY', 'RLMD', 'RGNX', 'RYTM', 'SANA', 'SEEL', 'SLGC', 'SNDA', 'SNDL',
  'TBIO', 'TMDX', 'TXMD', 'URGN', 'VKTX', 'VSTM', 'XERS', 'ZIOP',
  // Tech / AI / Software — momentum plays
  'AAOI', 'AMRS', 'AYX', 'BAND', 'BIGC', 'BL', 'CARG', 'CHGG', 'CLSK', 'CORE',
  'COWN', 'CRSP', 'DDOG', 'DIOD', 'EBON', 'EIGR', 'ENFN', 'EVGO', 'FATH', 'FUBO',
  'GFAI', 'GNTX', 'GTCH', 'HIMS', 'IDEX', 'IIIV', 'INMD', 'INTZ', 'IONQ', 'JFU',
  'KINV', 'LAZR', 'LPSN', 'MARA', 'MCHP', 'MI', 'MSTR', 'NAKD', 'NAVI', 'NOVA',
  'ONDS', 'OPRA', 'PATH', 'PLBY', 'PRPL', 'QMCO', 'RGTI', 'RIGL', 'ROOT', 'SABR',
  'SAVA', 'SFT', 'SKLZ', 'SLNO', 'SMCI', 'SND', 'SOGO', 'SOUN', 'SPRT', 'SSTK',
  'TBLT', 'TENB', 'TRMB', 'TUYA', 'UPST', 'VERI', 'VLDR', 'WIMI', 'WKC', 'WRAP',
  'XPEL', 'YALA', 'ZETA',
  // Energy / EV / Green
  'ACHR', 'AEVA', 'ALGM', 'AMRS', 'ARVL', 'BLNK', 'BTBT', 'CCJ', 'CHPT', 'ENPH',
  'FCEL', 'FFIE', 'GCT', 'GMFI', 'HYLN', 'LCID', 'LUNR', 'MCHP', 'MP', 'MVST',
  'NNE', 'NKLA', 'PLUG', 'QLGN', 'RIVN', 'RUN', 'SBSW', 'SLB', 'SOL', 'SQM',
  'TSLA', 'UURAF', 'VLTA', 'WB', 'XPEV', 'ZEV',
  // Consumer / Retail / Meme
  'AMC', 'BBIG', 'BBY', 'BKE', 'BLMN', 'BURL', 'CC', 'CHWY', 'CLOV', 'DKNG',
  'EXEL', 'FIZZ', 'FOSL', 'GME', 'GPRO', 'GPS', 'GRAB', 'HOOD', 'JWN', 'KSS',
  'Macy', 'MNSO', 'NKE', 'NWL', 'ODP', 'ONON', 'PLCE', 'POSH', 'RKT', 'SEAS',
  'SFIX', 'SHOO', 'TGT', 'TJX', 'TUP', 'W', 'WBA', 'WOOF', 'WRBY',
  // Mining / Metals
  'AG', 'AISC', 'AU', 'AUY', 'BVN', 'CDE', 'CLF', 'EGO', 'EXK', 'FNV',
  'GOLD', 'GSS', 'HL', 'HMY', 'KGC', 'MAG', 'MUX', 'NEM', 'NGD', 'PAAS',
  'RGLD', 'SAND', 'SBSW', 'SCCO', 'SILJ', 'SLV', 'SSRI', 'SVM', 'TEX', 'WPM',
  // Finance / Fintech
  'AFRM', 'BABA', 'BBVA', 'BKUT', 'BN', 'BSBR', 'CACC', 'CASH', 'CFR', 'CMB',
  'COIN', 'CRTO', 'CUK', 'DAN', 'DFS', 'EWBC', 'FHB', 'FND', 'FUTU', 'GL',
  'HMNF', 'HOPE', 'IBKR', 'JKHY', 'LC', 'LOAN', 'LPRO', 'LU', 'MC', 'MDB',
  'ML', 'MNSB', 'MOGO', 'NCLH', 'NYCB', 'OFG', 'OSBC', 'OZK', 'PB', 'PFBC',
  'PIPR', 'PRU', 'RY', 'SBCF', 'SEIC', 'SHBI', 'SIVB', 'SLQT', 'TCBI', 'TFC',
  'TROW', 'TRST', 'TSCO', 'UCBI', 'UMBF', 'UBSI', 'VIRT', 'VSTS', 'WABC', 'WBS',
  'WFC', 'WTFC', 'ZION',
  // Industrials / Manufacturing
  'AA', 'ACHC', 'AGCO', 'AIR', 'ALE', 'AMAT', 'AME', 'ATKR', 'AXON', 'BA',
  'BLDR', 'BWA', 'CAT', 'CARR', 'CE', 'CHGG', 'CIR', 'DE', 'DOV', 'EMR',
  'ETN', 'EXC', 'FICO', 'FLR', 'FLT', 'FMX', 'GE', 'GFF', 'GWW', 'HAYW',
  'HI', 'HUBG', 'IEX', 'IR', 'J', 'JJ', 'KMT', 'LII', 'LUV', 'MAS',
  'MKSI', 'MMI', 'MRC', 'NDSN', 'NUE', 'ODFL', 'OTIS', 'PCAR', 'PH', 'PNR',
  'POOL', 'PWR', 'RBC', 'ROK', 'ROP', 'RS', 'RSG', 'SBUX', 'SHW', 'SITE',
  'SRCL', 'SYY', 'TDY', 'TEX', 'TGI', 'TMO', 'TRN', 'TT', 'TXT', 'URI',
  'VRSK', 'WCN', 'WDS', 'XYL',
  // China / ADR — high volatility
  'BABA', 'BIDU', 'EDU', 'JD', 'KWEB', 'LI', 'NIO', 'PDD', 'TAL', 'TCEHY',
  'XPEV', 'YIN', 'ZAI',
];

export async function GET() {
  try {
    // Return cached if fresh
    if (cachedResult && Date.now() - cachedResult.fetchedAt < CACHE_TTL) {
      return NextResponse.json({
        stocks: cachedResult.data,
        summary: cachedResult.summary,
        cached: true,
      });
    }

    console.log('[5-PILLARS] Starting scan...');

    const allStocks = getAllStocks();
    const mainTickers = Object.keys(allStocks);

    // Combine main watchlist + momentum tickers (deduplicated)
    const allTickerSet = new Set([...mainTickers, ...MOMENTUM_TICKERS]);
    const allTickers = Array.from(allTickerSet);
    console.log(`[5-PILLARS] Total universe: ${allTickers.length} stocks (${mainTickers.length} main + ${MOMENTUM_TICKERS.length} momentum)`);

    // ═══ STEP 1: Fetch real prices ═══
    let realPrices: Record<string, { price: number; change: number }> = {};
        try {
      realPrices = await getRealPrices(allTickers);
      console.log(`[5-PILLARS] Got ${Object.keys(realPrices).length}/${allTickers.length} real prices`);
    } catch {
      console.log('[5-PILLARS] Bulk price fetch failed, trying smaller batches...');
    }

    // ═══ STEP 2: Filter candidates — Ross Cameron focuses on movers ═══
    // Pre-filter: only stocks with price data AND some movement
    const candidates = allTickers.filter(t => {
      const p = realPrices[t];
      if (!p || p.price <= 0) return false;
      // For Ross Cameron: focus on stocks with ANY positive change
      // (the pillars themselves will filter more strictly)
      return true;
    });

    // Prioritize: stocks with change ≥ 2% first, then rest
    const priorityCandidates = candidates
      .filter(t => (realPrices[t]?.change || 0) >= 2)
      .sort((a, b) => (realPrices[b]?.change || 0) - (realPrices[a]?.change || 0));

    const otherCandidates = candidates
      .filter(t => (realPrices[t]?.change || 0) < 2);

    // Analyze priority candidates first (up to 60), then fill with others (up to 40 more)
    const toAnalyze = [
      ...priorityCandidates.slice(0, 60),
      ...otherCandidates.slice(0, 40),
    ];

    console.log(`[5-PILLARS] Analyzing ${toAnalyze.length} candidates (${priorityCandidates.length} priority movers)`);

    // Build float map — use shares from main stocks, 0 for others (will show N/A)
    const floatMap: Record<string, number> = {};
    for (const [ticker, profile] of Object.entries(allStocks)) {
      floatMap[ticker] = profile.shares || 0;
    }
    // For momentum tickers not in main list, float is unknown (0 = N/A)

    // ═══ STEP 3: Run 5 Pillars analysis ═══
    const results = await analyzeFivePillarsBatch(
      toAnalyze,
      realPrices,
      floatMap,
      6
    );

    console.log(`[5-PILLARS] Analysis complete: ${Object.keys(results).length} results`);

    // ═══ STEP 4: Enrich and sort ═══
    const enriched: FivePillarsResult[] = Object.values(results).map(r => {
      const profile = allStocks[r.ticker];
      return {
        ...r,
        company: profile?.company || r.ticker,
        sector: profile?.sector || 'Momentum',
      };
    });

    // Sort: strong momentum (≥15%) first, then by pillars passed, then momentum score
    enriched.sort((a, b) => {
      // Strong momentum (≥15%) always on top
      if (a.strongMomentum !== b.strongMomentum) return b.strongMomentum ? 1 : -1;
      if (b.pillarsPassed !== a.pillarsPassed) return b.pillarsPassed - a.pillarsPassed;
      if (b.automatedPassed !== a.automatedPassed) return b.automatedPassed - a.automatedPassed;
      return b.momentumScore - a.momentumScore;
    });

    // ═══ STEP 5: Compute summary stats ═══
    const summary: PillarSummary = {
      totalAnalyzed: toAnalyze.length,
      withResults: enriched.length,
      perfect: enriched.filter(r => r.overallGrade === 'PERFECT').length,
      strong: enriched.filter(r => r.overallGrade === 'STRONG').length,
      good: enriched.filter(r => r.overallGrade === 'GOOD').length,
      limited: enriched.filter(r => r.overallGrade === 'LIMITED').length,
      none: enriched.filter(r => r.overallGrade === 'NONE').length,
      pillar1PassRate: 0,
      pillar2PassRate: 0,
      pillar3PassRate: 0,
      pillar4PassRate: 0,
      pillar5PassRate: 0,
    };

    if (enriched.length > 0) {
      summary.pillar1PassRate = (enriched.filter(r => r.pillar1_relVolume.passed).length / enriched.length) * 100;
      summary.pillar2PassRate = (enriched.filter(r => r.pillar2_dailyChange.passed).length / enriched.length) * 100;
      summary.pillar3PassRate = (enriched.filter(r => r.pillar3_catalyst.passed).length / enriched.length) * 100;
      summary.pillar4PassRate = (enriched.filter(r => r.pillar4_priceRange.passed).length / enriched.length) * 100;
      summary.pillar5PassRate = (enriched.filter(r => r.pillar5_float.passed).length / enriched.length) * 100;
    }

    cachedResult = {
      data: enriched,
      summary,
      fetchedAt: Date.now(),
    };

    console.log(`[5-PILLARS] Results: ${summary.perfect} perfect, ${summary.strong} strong, ${summary.good} good, ${summary.limited} limited, ${summary.none} none`);

    return NextResponse.json({
      stocks: enriched,
      summary,
      timestamp: new Date().toISOString(),
      cached: false,
    });
  } catch (error) {
    console.error('[5-PILLARS] Error:', error);

    if (cachedResult) {
      return NextResponse.json({
        stocks: cachedResult.data,
        summary: cachedResult.summary,
        cached: true,
        stale: true,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({ error: 'Gabim ne analizën e 5 Pillars' }, { status: 502 });
  }
}
