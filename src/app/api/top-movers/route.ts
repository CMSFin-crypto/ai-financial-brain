import { NextResponse } from 'next/server';
import { getRealPrices } from '@/lib/alpha-vantage';
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
  growthScore: number;    // 0-100, higher = more growth potential
  riskScore: number;      // 0-100, higher = more likely to decline
  profile: StockProfile;
  growthReasons: string[];
  riskReasons: string[];
}

// Growth scoring factors (each contributes 0-100 scaled)
function calculateGrowthScore(s: StockProfile, priceChange: number): number {
  let score = 0;

  // 1. Signal alignment (0-20 points)
  if (s.signal === 'BULLISH') score += 20;
  else if (s.signal === 'NEUTRAL') score += 8;

  // 2. Trend alignment (0-15 points)
  if (s.trend === 'uptrend') score += 15;
  else if (s.trend === 'sideways') score += 5;

  // 3. Analyst rating (0-15 points)
  if (s.rating === 'STRONG_BUY') score += 15;
  else if (s.rating === 'BUY') score += 12;
  else if (s.rating === 'HOLD') score += 4;

  // 4. Revenue growth (0-12 points) — higher is better
  const revNum = parseFloat(s.revGrowth);
  if (revNum >= 30) score += 12;
  else if (revNum >= 15) score += 10;
  else if (revNum >= 8) score += 7;
  else if (revNum >= 3) score += 4;
  else if (revNum > 0) score += 2;
  else score -= 3;

  // 5. EPS growth (0-12 points)
  const epsNum = parseFloat(s.epsGrowth);
  if (epsNum >= 40) score += 12;
  else if (epsNum >= 20) score += 10;
  else if (epsNum >= 10) score += 7;
  else if (epsNum >= 5) score += 4;
  else if (epsNum > 0) score += 2;
  else score -= 3;

  // 6. PEG ratio (0-8 points) — lower is better, <1 is ideal
  if (s.peg > 0 && s.peg <= 1.0) score += 8;
  else if (s.peg > 0 && s.peg <= 1.5) score += 6;
  else if (s.peg > 0 && s.peg <= 2.0) score += 4;
  else if (s.peg > 0 && s.peg <= 3.0) score += 2;
  else score -= 2;

  // 7. Moat width (0-8 points)
  if (s.moat === 'WIDE') score += 8;
  else if (s.moat === 'NARROW') score += 3;

  // 8. Momentum (0-10 points) — positive daily change
  if (priceChange >= 2) score += 10;
  else if (priceChange >= 1) score += 7;
  else if (priceChange >= 0.3) score += 4;
  else if (priceChange >= 0) score += 2;
  else if (priceChange >= -1) score += 0;
  else score -= 3;

  // 9. Margins health (0-5 points) — operating margin > 20% = healthy
  const opMarginNum = parseFloat(s.opMargin);
  if (opMarginNum >= 40) score += 5;
  else if (opMarginNum >= 25) score += 4;
  else if (opMarginNum >= 15) score += 2;

  // 10. Quarterly acceleration (0-5 points)
  const qRevNum = parseFloat(s.qRevGrowth);
  const rev3yNum = parseFloat(s.revGrowth3Y);
  if (qRevNum > rev3yNum && qRevNum >= 10) score += 5;
  else if (qRevNum >= 8) score += 3;

  return Math.max(0, Math.min(100, score));
}

// Risk scoring factors (0-100, higher = more risk of decline)
function calculateRiskScore(s: StockProfile, priceChange: number): number {
  let score = 0;

  // 1. Bearish signal (0-20 points)
  if (s.signal === 'BEARISH') score += 20;
  else if (s.signal === 'NEUTRAL') score += 8;

  // 2. Downtrend (0-15 points)
  if (s.trend === 'downtrend') score += 15;
  else if (s.trend === 'sideways') score += 5;

  // 3. Sell/Hold rating (0-12 points)
  if (s.rating === 'SELL') score += 12;
  else if (s.rating === 'HOLD') score += 6;

  // 4. Negative revenue growth (0-12 points)
  const revNum = parseFloat(s.revGrowth);
  if (revNum < -5) score += 12;
  else if (revNum < 0) score += 8;
  else if (revNum < 3) score += 3;

  // 5. Negative EPS growth (0-10 points)
  const epsNum = parseFloat(s.epsGrowth);
  if (epsNum < -10) score += 10;
  else if (epsNum < 0) score += 6;
  else if (epsNum < 5) score += 2;

  // 6. High valuation risk (0-8 points)
  if (s.pe > 80) score += 8;
  else if (s.pe > 50) score += 5;
  else if (s.pe > 35) score += 2;

  // 7. Weak/no moat (0-8 points)
  if (s.moat === 'NONE') score += 8;
  else if (s.moat === 'NARROW') score += 4;

  // 8. Negative momentum (0-10 points)
  if (priceChange <= -2) score += 10;
  else if (priceChange <= -1) score += 7;
  else if (priceChange <= -0.3) score += 4;
  else if (priceChange < 0) score += 2;

  // 9. High debt risk (0-8 points)
  if (s.debtEq > 3) score += 8;
  else if (s.debtEq > 2) score += 5;
  else if (s.debtEq > 1) score += 2;

  // 10. Margin compression (0-7 points) — operating margin < 15% is weak
  const opMarginNum = parseFloat(s.opMargin);
  if (opMarginNum < 5) score += 7;
  else if (opMarginNum < 10) score += 4;
  else if (opMarginNum < 15) score += 2;

  return Math.max(0, Math.min(100, score));
}

function generateGrowthReasons(s: StockProfile, priceChange: number): string[] {
  const reasons: string[] = [];

  if (s.signal === 'BULLISH') reasons.push(`Sinjali teknik: BULLISH me trend ${s.trend}`);
  if (s.rating === 'STRONG_BUY') reasons.push(`${s.buyCount} analistë rekomandojnë BLERJE, vetëm ${s.sellCount} SHITJE`);
  else if (s.rating === 'BUY') reasons.push(`${s.buyCount} analistë BLERJE vs ${s.sellCount} SHITJE`);

  const revNum = parseFloat(s.revGrowth);
  const epsNum = parseFloat(s.epsGrowth);
  if (revNum >= 20) reasons.push(`Rritja e të ardhurave: +${s.revGrowth} (eksplozive)`);
  else if (revNum >= 10) reasons.push(`Rritja e të ardhurave: +${s.revGrowth}`);
  else if (revNum > 0) reasons.push(`Të ardhurat rriten: +${s.revGrowth}`);

  if (epsNum >= 30) reasons.push(`EPS growth: +${s.epsGrowth} (forte)`);
  else if (epsNum >= 15) reasons.push(`Fitimi për aksion rritet: +${s.epsGrowth}`);

  if (s.peg > 0 && s.peg <= 1.5) reasons.push(`PEG ${s.peg} — vlerësim i arsyeshëm për rritjen`);
  if (s.moat === 'WIDE') reasons.push(`Avantazhi konkurrues: I GJËRË (${s.strengths[0] || ''})`);
  if (priceChange >= 1) reasons.push(`Momentum ditore: +${priceChange.toFixed(2)}%`);
  if (s.fcf && parseFloat(s.fcf) > 10) reasons.push(`Free Cash Flow: $${s.fcf}`);

  const qRevNum = parseFloat(s.qRevGrowth);
  if (qRevNum > revNum) reasons.push(`Akselerim: rritja tremujore (+${s.qRevGrowth}) > vjetore`);

  return reasons.slice(0, 5);
}

function generateRiskReasons(s: StockProfile, priceChange: number): string[] {
  const reasons: string[] = [];

  if (s.signal === 'BEARISH') reasons.push(`Sinjali teknik: BEARISH me trend ${s.trend}`);
  if (s.rating === 'HOLD' || s.rating === 'SELL') reasons.push(`Rating analistësh: ${s.rating} (${s.sellCount} shitje)`);

  const revNum = parseFloat(s.revGrowth);
  const epsNum = parseFloat(s.epsGrowth);
  if (revNum < 0) reasons.push(`Të ardhura në rënie: ${s.revGrowth}`);
  if (epsNum < 0) reasons.push(`EPS në rënie: ${s.epsGrowth}`);

  if (s.pe > 50) reasons.push(`P/E ${s.pe}x — vlerësim shumë i lartë`);
  if (s.moat === 'NONE') reasons.push(`Asnje avantazhi konkurrues (Moat: NONE)`);
  if (priceChange < 0) reasons.push(`Momentum negativ: ${priceChange.toFixed(2)}%`);
  if (s.debtEq > 2) reasons.push(`Detyrimet e larta: Debt/Equity ${s.debtEq}x`);
  if (s.weaknesses.length > 0) reasons.push(`Rreziku: ${s.weaknesses[0]}`);

  const opMarginNum = parseFloat(s.opMargin);
  if (opMarginNum < 10) reasons.push(`Marzhë operative të ulëta: ${s.opMargin}`);

  if (s.trend === 'downtrend') reasons.push(`Trendi afatgjatë: DOWNTREND`);

  return reasons.slice(0, 5);
}

// Cache for 5 minutes
let cachedResult: { data: { topGrowth: ScoredStock[]; topRisk: ScoredStock[]; timestamp: string }; fetchedAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

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

    // Get all tickers from market-data
    const allStocks = getAllStocks();
    const allTickers = Object.keys(allStocks);
    
    // Fetch real prices in parallel
    const realPrices = await getRealPrices(allTickers);
    console.log(`[TOP-MOVERS] Got ${Object.keys(realPrices).length} real prices`);

    // Score all stocks
    const scored: ScoredStock[] = allTickers.map(ticker => {
      const profile = allStocks[ticker];
      const livePrice = realPrices[ticker];
      const priceChange = livePrice ? livePrice.change : profile.change;
      const currentPrice = livePrice ? livePrice.price : profile.price;

      return {
        ticker,
        company: profile.company,
        sector: profile.sector,
        industry: profile.industry,
        currentPrice,
        priceChange,
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

    // Sort by risk score descending, take top 5 (most likely to decline)
    const topRisk = [...scored]
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 5);

    // Enrich with target prices and upside/downside
    const enriched = (list: ScoredStock[], type: 'growth' | 'risk') =>
      list.map(stock => {
        const targetNum = parseFloat(stock.profile.targetPrice.replace(/[^0-9.]/g, ''));
        const upside = targetNum > 0 ? ((targetNum - stock.currentPrice) / stock.currentPrice * 100) : 0;
        return {
          ticker: stock.ticker,
          company: stock.company,
          sector: stock.sector,
          industry: stock.industry,
          currentPrice: stock.currentPrice,
          priceChange: stock.priceChange,
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
      timestamp: new Date().toISOString(),
    };

    cachedResult = { data: result, fetchedAt: Date.now() };
    console.log(`[TOP-MOVERS] Growth: ${topGrowth.map(s => s.ticker).join(',')} | Risk: ${topRisk.map(s => s.ticker).join(',')}`);

    return NextResponse.json({ ...result, cached: false });
  } catch (error) {
    console.error('[TOP-MOVERS] Error:', error);

    if (cachedResult) {
      return NextResponse.json({ ...cachedResult.data, cached: true, stale: true });
    }

    return NextResponse.json({ error: 'Gabim në analizën e tregut' }, { status: 502 });
  }
}
