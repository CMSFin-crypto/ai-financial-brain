import { NextResponse } from 'next/server';
import { getRealPrices } from '@/lib/alpha-vantage';
import { getAllStocks } from '@/lib/market-data';
import { analyzeFivePillarsBatch, type FivePillarsResult } from '@/lib/five-pillars-engine';

export const maxDuration = 90;

// Cache for 10 minutes (5 pillars data changes with volume)
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
    const allTickers = Object.keys(allStocks);

    // ═══ STEP 1: Fetch real prices ═══
    let realPrices: Record<string, { price: number; change: number }> = {};
    try {
      realPrices = await getRealPrices(allTickers);
      console.log(`[5-PILLARS] Got ${Object.keys(realPrices).length}/${allTickers.length} real prices`);
    } catch {
      console.log('[5-PILLARS] Bulk price fetch failed');
    }

    // Build shares map from profiles
    const sharesMap: Record<string, number> = {};
    for (const [ticker, profile] of Object.entries(allStocks)) {
      sharesMap[ticker] = profile.shares || 0;
    }

    // ═══ STEP 2: Run 5 Pillars analysis ═══
    const candidatesWithPrices = allTickers.filter(t => {
      const p = realPrices[t];
      return p && p.price > 0;
    });

    console.log(`[5-PILLARS] Analyzing ${candidatesWithPrices.length} stocks...`);

    const results = await analyzeFivePillarsBatch(
      candidatesWithPrices,
      realPrices,
      sharesMap,
      6
    );

    console.log(`[5-PILLARS] Analysis complete: ${Object.keys(results).length} results`);

    // ═══ STEP 3: Enrich and sort ═══
    const enriched: FivePillarsResult[] = Object.values(results).map(r => {
      const profile = allStocks[r.ticker];
      return {
        ...r,
        company: profile?.company || r.ticker,
        sector: profile?.sector || '',
      };
    });

    // Sort by: pillars passed (desc), then momentum score (desc)
    enriched.sort((a, b) => {
      if (b.pillarsPassed !== a.pillarsPassed) return b.pillarsPassed - a.pillarsPassed;
      return b.momentumScore - a.momentumScore;
    });

    // ═══ STEP 4: Compute summary stats ═══
    const summary: PillarSummary = {
      totalAnalyzed: candidatesWithPrices.length,
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
      summary.pillar2PassRate = (enriched.filter(r => r.pillar2_float.passed).length / enriched.length) * 100;
      summary.pillar3PassRate = (enriched.filter(r => r.pillar3_priceRange.passed).length / enriched.length) * 100;
      summary.pillar4PassRate = (enriched.filter(r => r.pillar4_greenCandle.passed).length / enriched.length) * 100;
      summary.pillar5PassRate = (enriched.filter(r => r.pillar5_gapUp.passed).length / enriched.length) * 100;
    }

    cachedResult = {
      data: enriched,
      summary,
      fetchedAt: Date.now(),
    };

    console.log(`[5-PILLARS] Results: ${summary.perfect} perfect, ${summary.strong} strong, ${summary.good} good`);

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
