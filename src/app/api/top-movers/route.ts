import { NextResponse } from 'next/server';
import { getRealPrice, getRealPrices } from '@/lib/alpha-vantage';
import { getAllStocks, StockProfile } from '@/lib/market-data';

export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════════════
// TOP MOVERS — Top 5 Growth Potential + Top 5 Risk of Decline
// Multi-factor scoring using real prices + fundamental data
// ═══════════════════════════════════════════════════════════════════

interface ScoredStock {
  ticker: string;
  company: string;
  sector: string;
  industry: string;
  currentPrice: number;
  priceChange: number;
  isLive: boolean;
  growthScore: number;
  riskScore: number;
  profile: StockProfile;
  growthReasons: string[];
  riskReasons: string[];
}

// Safe parse — returns 0 instead of NaN
function safeNum(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

// Growth scoring factors (each contributes 0-100 scaled)
function calculateGrowthScore(s: StockProfile, priceChange: number): number {
  let score = 0;

  if (s.signal === 'BULLISH') score += 20;
  else if (s.signal === 'NEUTRAL') score += 8;

  if (s.trend === 'uptrend') score += 15;
  else if (s.trend === 'sideways') score += 5;

  if (s.rating === 'STRONG_BUY') score += 15;
  else if (s.rating === 'BUY') score += 12;
  else if (s.rating === 'HOLD') score += 4;

  const revNum = safeNum(s.revGrowth);
  if (revNum >= 30) score += 12;
  else if (revNum >= 15) score += 10;
  else if (revNum >= 8) score += 7;
  else if (revNum >= 3) score += 4;
  else if (revNum > 0) score += 2;
  else score -= 3;

  const epsNum = safeNum(s.epsGrowth);
  if (epsNum >= 40) score += 12;
  else if (epsNum >= 20) score += 10;
  else if (epsNum >= 10) score += 7;
  else if (epsNum >= 5) score += 4;
  else if (epsNum > 0) score += 2;
  else score -= 3;

  if (s.peg > 0 && s.peg <= 1.0) score += 8;
  else if (s.peg > 0 && s.peg <= 1.5) score += 6;
  else if (s.peg > 0 && s.peg <= 2.0) score += 4;
  else if (s.peg > 0 && s.peg <= 3.0) score += 2;
  else score -= 2;

  if (s.moat === 'WIDE') score += 8;
  else if (s.moat === 'NARROW') score += 3;

  if (priceChange >= 2) score += 10;
  else if (priceChange >= 1) score += 7;
  else if (priceChange >= 0.3) score += 4;
  else if (priceChange >= 0) score += 2;
  else if (priceChange >= -1) score += 0;
  else score -= 3;

  const opMarginNum = safeNum(s.opMargin);
  if (opMarginNum >= 40) score += 5;
  else if (opMarginNum >= 25) score += 4;
  else if (opMarginNum >= 15) score += 2;

  const qRevNum = safeNum(s.qRevGrowth);
  const rev3yNum = safeNum(s.revGrowth3Y);
  if (qRevNum > rev3yNum && qRevNum >= 10) score += 5;
  else if (qRevNum >= 8) score += 3;

  return Math.max(0, Math.min(100, score));
}

// Risk scoring factors (0-100, higher = more risk of decline)
function calculateRiskScore(s: StockProfile, priceChange: number): number {
  let score = 0;

  if (s.signal === 'BEARISH') score += 20;
  else if (s.signal === 'NEUTRAL') score += 8;

  if (s.trend === 'downtrend') score += 15;
  else if (s.trend === 'sideways') score += 5;

  if (s.rating === 'SELL') score += 12;
  else if (s.rating === 'HOLD') score += 6;

  const revNum = safeNum(s.revGrowth);
  if (revNum < -5) score += 12;
  else if (revNum < 0) score += 8;
  else if (revNum < 3) score += 3;

  const epsNum = safeNum(s.epsGrowth);
  if (epsNum < -10) score += 10;
  else if (epsNum < 0) score += 6;
  else if (epsNum < 5) score += 2;

  if (s.pe > 80) score += 8;
  else if (s.pe > 50) score += 5;
  else if (s.pe > 35) score += 2;

  if (s.moat === 'NONE') score += 8;
  else if (s.moat === 'NARROW') score += 4;

  if (priceChange <= -2) score += 10;
  else if (priceChange <= -1) score += 7;
  else if (priceChange <= -0.3) score += 4;
  else if (priceChange < 0) score += 2;

  if (s.debtEq > 3) score += 8;
  else if (s.debtEq > 2) score += 5;
  else if (s.debtEq > 1) score += 2;

  const opMarginNum = safeNum(s.opMargin);
  if (opMarginNum < 5) score += 7;
  else if (opMarginNum < 10) score += 4;
  else if (opMarginNum < 15) score += 2;

  return Math.max(0, Math.min(100, score));
}

function generateGrowthReasons(s: StockProfile, priceChange: number): string[] {
  const reasons: string[] = [];

  if (s.signal === 'BULLISH') reasons.push(`Sinjali teknik: BULLISH me trend ${s.trend}`);
  if (s.rating === 'STRONG_BUY') reasons.push(`${s.buyCount} analiste rekomandojne BLERJE, vetem ${s.sellCount} SHITJE`);
  else if (s.rating === 'BUY') reasons.push(`${s.buyCount} analiste BLERJE vs ${s.sellCount} SHITJE`);

  const revNum = safeNum(s.revGrowth);
  const epsNum = safeNum(s.epsGrowth);
  if (revNum >= 20) reasons.push(`Rritja e te ardhurave: +${s.revGrowth} (eksplozive)`);
  else if (revNum >= 10) reasons.push(`Rritja e te ardhurave: +${s.revGrowth}`);
  else if (revNum > 0) reasons.push(`Te ardhurat rriten: +${s.revGrowth}`);

  if (epsNum >= 30) reasons.push(`EPS growth: +${s.epsGrowth} (forte)`);
  else if (epsNum >= 15) reasons.push(`Fitimi per aksion rritet: +${s.epsGrowth}`);

  if (s.peg > 0 && s.peg <= 1.5) reasons.push(`PEG ${s.peg} — vleresim i arsyeshem per rritjen`);
  if (s.moat === 'WIDE') reasons.push(`Avantazhi konkurrues: I GJERE (${s.strengths[0] || ''})`);
  if (priceChange >= 1) reasons.push(`Momentum ditore: +${priceChange.toFixed(2)}%`);

  const fcfNum = safeNum(s.fcf);
  if (fcfNum > 10) reasons.push(`Free Cash Flow: $${s.fcf}`);

  const qRevNum = safeNum(s.qRevGrowth);
  if (qRevNum > revNum) reasons.push(`Akselerim: rritja tremujore (+${s.qRevGrowth}) > vjetore`);

  return reasons.slice(0, 5);
}

function generateRiskReasons(s: StockProfile, priceChange: number): string[] {
  const reasons: string[] = [];

  if (s.signal === 'BEARISH') reasons.push(`Sinjali teknik: BEARISH me trend ${s.trend}`);
  if (s.rating === 'HOLD' || s.rating === 'SELL') reasons.push(`Rating analistesh: ${s.rating} (${s.sellCount} shitje)`);

  const revNum = safeNum(s.revGrowth);
  const epsNum = safeNum(s.epsGrowth);
  if (revNum < 0) reasons.push(`Te ardhura ne renie: ${s.revGrowth}`);
  if (epsNum < 0) reasons.push(`EPS ne renie: ${s.epsGrowth}`);

  if (s.pe > 50) reasons.push(`P/E ${s.pe}x — vleresim shume i larte`);
  if (s.moat === 'NONE') reasons.push(`Asnje avantazhi konkurrues (Moat: NONE)`);
  if (priceChange < 0) reasons.push(`Momentum negativ: ${priceChange.toFixed(2)}%`);
  if (s.debtEq > 2) reasons.push(`Detyrimet e larta: Debt/Equity ${s.debtEq}x`);
  if (s.weaknesses.length > 0) reasons.push(`Rreziku: ${s.weaknesses[0]}`);

  const opMarginNum = safeNum(s.opMargin);
  if (opMarginNum < 10) reasons.push(`Marzhe operative te ulta: ${s.opMargin}`);
  if (s.trend === 'downtrend') reasons.push(`Trendi afatgjatshem: DOWNTREND`);

  return reasons.slice(0, 5);
}

// Cache for 5 minutes
let cachedResult: { data: { topGrowth: ScoredStock[]; topRisk: ScoredStock[]; timestamp: string; liveCount: number; totalFetched: number }; fetchedAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Fetch real prices in small batches to avoid rate limits.
 * Uses individual calls with delays for reliability.
 */
async function fetchPricesInBatches(tickers: string[]): Promise<Record<string, { price: number; change: number }>> {
  const results: Record<string, { price: number; change: number }> = {};
  
  // First try bulk fetch (fastest)
  try {
    const bulk = await getRealPrices(tickers);
    Object.assign(results, bulk);
    console.log(`[TOP-MOVERS] Bulk fetch got ${Object.keys(bulk).length} prices`);
  } catch {
    console.log('[TOP-MOVERS] Bulk fetch failed, trying individual...');
  }

  // For any missing tickers, try individual fetch with concurrency limit
  const missing = tickers.filter(t => !results[t]);
  if (missing.length > 0) {
    // Fetch top 20 most important individually (sorted by market cap relevance)
    const priorityTickers = ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AVGO', 'LLY', 'JPM', 'V', 'CRM', 'AMD', 'NFLX', 'PLTR', 'UNH', 'MRVL', 'COIN', 'SMCI', 'SNOW'];
    const toFetch = priorityTickers.filter(t => missing.includes(t)).slice(0, 15);
    
    // Fetch in parallel with concurrency of 3
    const BATCH_SIZE = 3;
    for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
      const batch = toFetch.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (ticker) => {
          try {
            const price = await getRealPrice(ticker);
            if (price && price.price > 0) {
              results[ticker] = { price: price.price, change: price.change };
            }
          } catch {
            // Skip failed individual fetches
          }
        })
      );
      // Small delay between batches to avoid rate limits
      if (i + BATCH_SIZE < toFetch.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
    console.log(`[TOP-MOVERS] Individual fetch got ${Object.keys(results).length - tickers.length + missing.length} additional prices`);
  }

  return results;
}

export async function GET() {
  try {
    // Return cached if fresh
    if (cachedResult && Date.now() - cachedResult.fetchedAt < CACHE_TTL) {
      return NextResponse.json({
        ...cachedResult.data,
        cached: true,
      });
    }

    console.log('[TOP-MOVERS] Fetching real prices and calculating scores...');

    const allStocks = getAllStocks();
    const allTickers = Object.keys(allStocks);
    
    // Fetch real prices with batched approach
    const realPrices = await fetchPricesInBatches(allTickers);
    const liveCount = Object.keys(realPrices).length;
    console.log(`[TOP-MOVERS] Got ${liveCount}/${allTickers.length} real prices`);

    // Score all stocks
    const scored: ScoredStock[] = allTickers.map(ticker => {
      const profile = allStocks[ticker];
      const livePrice = realPrices[ticker];
      const isLive = !!livePrice && livePrice.price > 0;
      const priceChange = isLive ? livePrice.change : profile.change;
      const currentPrice = isLive ? livePrice.price : profile.price;

      return {
        ticker,
        company: profile.company,
        sector: profile.sector,
        industry: profile.industry,
        currentPrice,
        priceChange,
        isLive,
        growthScore: calculateGrowthScore(profile, priceChange),
        riskScore: calculateRiskScore(profile, priceChange),
        profile,
        growthReasons: generateGrowthReasons(profile, priceChange),
        riskReasons: generateRiskReasons(profile, priceChange),
      };
    });

    // Sort by growth score descending, take top 5
    const topGrowth = [...scored]
      .sort((a, b) => b.growthScore - a.growthScore)
      .slice(0, 5);

    // Sort by risk score descending, take top 5
    const topRisk = [...scored]
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 5);

    // Enrich with target prices and upside/downside
    const enriched = (list: ScoredStock[], type: 'growth' | 'risk') =>
      list.map(stock => {
        const targetNum = safeNum(String(stock.profile.targetPrice).replace(/[^0-9.]/g, ''));
        const upside = targetNum > 0 ? ((targetNum - stock.currentPrice) / stock.currentPrice * 100) : 0;
        return {
          ticker: stock.ticker,
          company: stock.company,
          sector: stock.sector,
          industry: stock.industry,
          currentPrice: stock.currentPrice,
          priceChange: stock.priceChange,
          isLive: stock.isLive,
          score: type === 'growth' ? stock.growthScore : stock.riskScore,
          targetPrice: stock.profile.targetPrice,
          highTarget: stock.profile.highTarget,
          lowTarget: stock.profile.lowTarget,
          upside: parseFloat(upside.toFixed(1)),
          rating: stock.profile.rating,
          signal: stock.profile.signal,
          trend: stock.profile.trend,
          pe: stock.profile.pe,
          fwdPE: stock.profile.fwdPE,
          peg: stock.profile.peg,
          revGrowth: stock.profile.revGrowth,
          epsGrowth: stock.profile.epsGrowth,
          opMargin: stock.profile.opMargin,
          debtEq: stock.profile.debtEq,
          moat: stock.profile.moat,
          marketCap: stock.profile.marketCap,
          reasons: type === 'growth' ? stock.growthReasons : stock.riskReasons,
          strengths: stock.profile.strengths,
          weaknesses: stock.profile.weaknesses,
          buyCount: stock.profile.buyCount,
          sellCount: stock.profile.sellCount,
        };
      });

    const result = {
      topGrowth: enriched(topGrowth, 'growth'),
      topRisk: enriched(topRisk, 'risk'),
      totalAnalyzed: allTickers.length,
      liveCount,
      totalFetched: allTickers.length,
      timestamp: new Date().toISOString(),
    };

    cachedResult = { data: result, fetchedAt: Date.now() };
    console.log(`[TOP-MOVERS] Growth: ${topGrowth.map(s => s.ticker).join(',')} | Risk: ${topRisk.map(s => s.ticker).join(',')} | Live: ${liveCount}/${allTickers.length}`);

    return NextResponse.json({ ...result, cached: false });
  } catch (error) {
    console.error('[TOP-MOVERS] Error:', error);

    if (cachedResult) {
      return NextResponse.json({ ...cachedResult.data, cached: true, stale: true });
    }

    return NextResponse.json({ error: 'Gabim ne analizen e tregjit' }, { status: 502 });
  }
}
