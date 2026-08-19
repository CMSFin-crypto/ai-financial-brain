import { NextResponse } from 'next/server';
import { getRealPrices } from '@/lib/alpha-vantage';
import { getAllStocks } from '@/lib/market-data';
import { analyzeFivePillarsBatch, type FivePillarsCandidate } from '@/lib/five-pillars-engine';
import { getAllUSStockSnapshots, prefilterCandidates, getAllUSTickers } from '@/lib/us-stock-universe';
import { fetchStockNewsBatch, analyzeCatalystFromNews } from '@/lib/stock-news-fetcher';
import { fetchFinvizFloatBatch } from '@/lib/finviz-float-fetcher';

export const maxDuration = 300;

// Cache for 8 minutes
let cachedResult: { data: FivePillarsCandidate[]; summary: ScanSummary; fetchedAt: number; universeSize: number } | null = null;
const CACHE_TTL = 8 * 60 * 1000;

interface ScanSummary {
  totalUniverse: number;   // total US stocks scanned
  totalPreFiltered: number;  // after price/change filter
  totalAnalyzed: number;   // after deep 5-pillars analysis
  eligible: number;
  watch: number;
  rejected: number;
  floatReview: number;
  strongMomentum: number;
  highMomentum: number;
  pillarPassRates: {
    rvol: number;
    momentum: number;
    catalyst: number;
    price: number;
    float: number;
  };
}

export async function GET() {
  try {
    // Return cached if fresh
    if (cachedResult && Date.now() - cachedResult.fetchedAt < CACHE_TTL) {
      return NextResponse.json({
        candidates: cachedResult.data,
        summary: cachedResult.summary,
        cached: true,
      });
    }

    console.log('[5-PILLARS-MOMENTUM] Starting scan of ALL US stocks...');

    // ═══ STEP 1: Get ALL US stocks with prices ═══
    // Try NASDAQ screener first (single call, ALL stocks with prices)
    // Falls back to Yahoo gainers, then to the old hand-picked list
    let realPrices: Record<string, { price: number; change: number }> = {};
    let universeSize = 0;
    let toAnalyze: string[] = [];

    // Method A: NASDAQ Screener + Yahoo (ALL US stocks)
    const snapshots = await getAllUSStockSnapshots();
    if (snapshots.length > 100) {
      universeSize = snapshots.length;
      console.log(`[5-PILLARS-MOMENTUM] Got ${snapshots.length} US stocks from NASDAQ/Yahoo`);

      // Pre-filter: price $0.5-$25, change >= 1.5%
      // Scan up to 500 candidates to maximize ELIGIBLE/WATCH finds
      const prefiltered = prefilterCandidates(snapshots, {
        minPrice: 0.5,
        maxPrice: 25,
        minChange: 1.5,
        maxCandidates: 500,
      });

      realPrices = prefiltered.priceMap;
      toAnalyze = prefiltered.tickers;
      console.log(`[5-PILLARS-MOMENTUM] Pre-filtered to ${toAnalyze.length} candidates from ${universeSize} US stocks`);
    }

    // Method B: Fallback — fetch individual prices for tickers from all sources
    if (toAnalyze.length < 5) {
      console.log('[5-PILLARS-MOMENTUM] Fallback: fetching from NASDAQ Trader + Yahoo individual prices');

      // Get comprehensive ticker list
      let allTickers = await getAllUSTickers();
      const allStocks = getAllStocks();
      const mainTickers = Object.keys(allStocks);

      // Also include the old small-cap universe as fallback
      const SMALL_CAP_FALLBACK = [
        'NVAX','MRNA','AKBA','ARDX','AYTU','KRTX','LGVN','MRTX','VKTX','VSTM',
        'CLSK','IONQ','SOUN','RGTI','FUBO','MARA','SMCI','UPST','PATH','VERI',
        'PLTR','SIRI','LCID','NIO','RIVN','FCEL','PLUG','NKLA','SNDL','OCGN',
        'AMC','GME','BBIG','CLOV','DKNG','HOOD','GRAB','CHWY','FORD','FFIE',
        'AG','GSS','HL','HMY','MUX','SAND','SVM','EXK','NEM','AUY',
        'AFRM','COIN','CACC','HMNF','NYCB','OFG','VIRT','WBS','ZION','IBKR',
        'BABA','PDD','JD','NIO','LI','TAL','BIDU','EDU','XPEV',
      ];
      const fallbackSet = new Set([...allTickers, ...mainTickers, ...SMALL_CAP_FALLBACK]);
      allTickers = Array.from(fallbackSet);
      universeSize = allTickers.length;
      console.log(`[5-PILLARS-MOMENTUM] Fallback universe: ${universeSize} tickers`);

      // Fetch prices (batched)
      try {
        realPrices = await getRealPrices(allTickers.slice(0, 2000)); // limit to prevent timeout
        console.log(`[5-PILLARS-MOMENTUM] Got ${Object.keys(realPrices).length} prices`);
      } catch {
        console.log('[5-PILLARS-MOMENTUM] Price fetch failed in fallback');
      }

      // Pre-filter
      toAnalyze = Object.keys(realPrices).filter(t => {
        const p = realPrices[t];
        if (!p || p.price <= 0) return false;
        if (p.price < 0.8 || p.price > 25) return false;
        return p.change >= 2;
      });

      toAnalyze.sort((a, b) => (realPrices[b]?.change || 0) - (realPrices[a]?.change || 0));
      toAnalyze = toAnalyze.slice(0, 500);
    }

    if (toAnalyze.length === 0) {
      return NextResponse.json({
        candidates: [],
        summary: {
          totalUniverse: universeSize,
          totalPreFiltered: 0,
          totalAnalyzed: 0,
          eligible: 0, watch: 0, rejected: 0, floatReview: 0,
          strongMomentum: 0, highMomentum: 0,
          pillarPassRates: { rvol: 0, momentum: 0, catalyst: 0, price: 0, float: 0 },
        },
        timestamp: new Date().toISOString(),
        message: 'No US stocks passed pre-filter. Market may be quiet.',
      });
    }

    // ═══ STEP 2: Build float map ═══
    const allStocks = getAllStocks();
    const floatMap: Record<string, number | null> = {};
    for (const ticker of toAnalyze) {
      const profile = allStocks[ticker];
      if (profile?.shares && profile.shares > 0) {
        floatMap[ticker] = profile.shares;
      } else {
        floatMap[ticker] = null;
      }
    }

    // ═══ STEP 3: Run 5 Pillars analysis ═══
    // Higher concurrency (10) for larger universe, 150ms delay between batches
    const results = await analyzeFivePillarsBatch(
      toAnalyze,
      realPrices,
      floatMap,
      10
    );

    console.log(`[5-PILLARS-MOMENTUM] Analysis complete: ${Object.keys(results).length} results`);

    // ═══ STEP 4: Enrich and sort ═══
    const enriched: FivePillarsCandidate[] = Object.values(results).map(r => {
      const profile = allStocks[r.symbol];
      return {
        ...r,
        company: profile?.company || r.symbol,
        sector: profile?.sector || 'Momentum',
      };
    });

    // Sort: ELIGIBLE first, then WATCH, then FLOAT_REVIEW, then REJECTED
    const statusOrder: Record<string, number> = { ELIGIBLE: 0, WATCH: 1, FLOAT_REVIEW: 2, REJECTED: 3 };
    enriched.sort((a, b) => {
      if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
      if (a.highMomentum !== b.highMomentum) return a.highMomentum ? -1 : 1;
      if (b.historicalScore !== a.historicalScore) return b.historicalScore - a.historicalScore;
      if (b.pillarCount !== a.pillarCount) return b.pillarCount - a.pillarCount;
      return b.momentumScore - a.momentumScore;
    });

    // ═══ STEP 4.5: Fetch real news + Finviz float for TOP candidates ═══
    const topCandidates = enriched.filter(c => c.status === 'ELIGIBLE' || c.status === 'WATCH' || c.status === 'FLOAT_REVIEW').slice(0, 15);
    if (topCandidates.length > 0) {
      // Fetch news (more headlines now: 5 per ticker)
      try {
        console.log(`[5-PILLARS-MOMENTUM] Fetching news for ${topCandidates.length} top candidates...`);
        const newsMap = await fetchStockNewsBatch(topCandidates.map(c => c.symbol), 5);
        for (const candidate of enriched) {
          const headlines = newsMap[candidate.symbol];
          if (headlines && headlines.length > 0) {
            candidate.newsHeadlines = headlines;
            // Generate detailed catalyst analysis from news
            candidate.catalystAnalysis = analyzeCatalystFromNews(headlines, candidate.dailyChangePct);
          }
        }
        console.log(`[5-PILLARS-MOMENTUM] News fetched for ${Object.keys(newsMap).length} stocks`);
      } catch (err) {
        console.log('[5-PILLARS-MOMENTUM] News fetch failed (non-critical):', err);
      }

      // Fetch Finviz float data for verification
      try {
        console.log(`[5-PILLARS-MOMENTUM] Fetching Finviz float for ${topCandidates.length} candidates...`);
        const finvizMap = await fetchFinvizFloatBatch(topCandidates.map(c => c.symbol));
        for (const candidate of enriched) {
          const fd = finvizMap[candidate.symbol];
          if (fd) {
            candidate.finvizData = fd;
            // Update float with verified Finviz data
            if (fd.floatM !== null) {
              candidate.floatShares = fd.floatM;
              candidate.floatVerified = true;
              // Re-check float pillar
              candidate.passesFloat = fd.floatM <= 20;
              candidate.pillarDetails.float = {
                passed: fd.floatM <= 20,
                value: fd.floatM,
                threshold: '≤ 20M',
                detail: `Float (Finviz): ${fd.floatM.toFixed(1)}M shares${fd.floatM <= 20 ? ' — supply/demand imbalance' : ` (duhet ≤20M)`}`,
              };
            }
            if (fd.shortFloat !== null) {
              candidate.shortFloatPct = fd.shortFloat;
            }
            // Update company name from Finviz if better
            if (fd.name && (!candidate.company || candidate.company === candidate.symbol)) {
              candidate.company = fd.name;
            }
            if (fd.sector && (!candidate.sector || candidate.sector === 'Momentum')) {
              candidate.sector = fd.sector;
            }
            // Re-compute status with new float data
            const pillarCount = [candidate.passesRvol, candidate.passesMomentum, candidate.passesCatalyst, candidate.passesPrice, candidate.passesFloat].filter(Boolean).length;
            candidate.pillarCount = pillarCount;
            if (candidate.floatVerified && fd.floatM !== null) {
              if (pillarCount === 5 && candidate.catalystStatus !== 'MISSING') {
                candidate.status = 'ELIGIBLE';
              } else if (pillarCount >= 4) {
                candidate.status = 'WATCH';
              } else if (pillarCount >= 3 && (candidate.passesRvol || candidate.passesMomentum)) {
                candidate.status = 'FLOAT_REVIEW';
              } else {
                candidate.status = 'REJECTED';
              }
            }
          }
        }
        console.log(`[5-PILLARS-MOMENTUM] Finviz float fetched for ${Object.keys(finvizMap).length} stocks`);
      } catch (err) {
        console.log('[5-PILLARS-MOMENTUM] Finviz fetch failed (non-critical):', err);
      }
    }

    // ═══ STEP 5: Compute summary ═══
    const total = enriched.length;
    const summary: ScanSummary = {
      totalUniverse: universeSize,
      totalPreFiltered: toAnalyze.length,
      totalAnalyzed: total,
      eligible: enriched.filter(r => r.status === 'ELIGIBLE').length,
      watch: enriched.filter(r => r.status === 'WATCH').length,
      rejected: enriched.filter(r => r.status === 'REJECTED').length,
      floatReview: enriched.filter(r => r.status === 'FLOAT_REVIEW').length,
      strongMomentum: enriched.filter(r => r.strongMomentum).length,
      highMomentum: enriched.filter(r => r.highMomentum).length,
      pillarPassRates: {
        rvol: total ? (enriched.filter(r => r.passesRvol).length / total) * 100 : 0,
        momentum: total ? (enriched.filter(r => r.passesMomentum).length / total) * 100 : 0,
        catalyst: total ? (enriched.filter(r => r.passesCatalyst).length / total) * 100 : 0,
        price: total ? (enriched.filter(r => r.passesPrice).length / total) * 100 : 0,
        float: total ? (enriched.filter(r => r.passesFloat).length / total) * 100 : 0,
      },
    };

    cachedResult = {
      data: enriched,
      summary,
      fetchedAt: Date.now(),
      universeSize,
    };

    console.log(`[5-PILLARS-MOMENTUM] Universe: ${universeSize} | Pre-filtered: ${toAnalyze.length} | ELIGIBLE: ${summary.eligible} | WATCH: ${summary.watch} | REJECTED: ${summary.rejected} | FLOAT_REVIEW: ${summary.floatReview}`);

    return NextResponse.json({
      candidates: enriched,
      summary,
      timestamp: new Date().toISOString(),
      cached: false,
    });
  } catch (error) {
    console.error('[5-PILLARS-MOMENTUM] Error:', error);

    if (cachedResult) {
      return NextResponse.json({
        candidates: cachedResult.data,
        summary: cachedResult.summary,
        cached: true,
        stale: true,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({ error: 'Error in 5 Pillars Momentum scan' }, { status: 502 });
  }
}
