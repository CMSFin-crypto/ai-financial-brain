import { NextResponse } from 'next/server';
import { getRealPrice, getRealPrices, getRealFundamentalsBatch, getBatchQuotesFast, type YahooFundamentals } from '@/lib/alpha-vantage';
import { getAllStocks, StockProfile } from '@/lib/market-data';

export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════════════
// TOP MOVERS — Top 5 Growth Potential + Top 5 Risk of Decline
// Multi-factor scoring using REAL prices + REAL fundamental data
// ═══════════════════════════════════════════════════════════════════

interface ScoredStock {
  ticker: string;
  company: string;
  sector: string;
  industry: string;
  currentPrice: number;
  priceChange: number;
  isLive: boolean;
  hasFundamentals: boolean;
  growthScore: number;
  riskScore: number;
  profile: StockProfile;
  fund: YahooFundamentals | null;
  growthReasons: string[];
  riskReasons: string[];
}

// Safe parse — returns 0 instead of NaN
function safeNum(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

// Map Yahoo recommendation key to our rating
function mapRecommendation(key: string): string {
  const map: Record<string, string> = {
    'strong_buy': 'STRONG_BUY',
    'buy': 'BUY',
    'hold': 'HOLD',
    'sell': 'SELL',
    'strong_sell': 'STRONG_SELL',
  };
  return map[key] || 'HOLD';
}

// Growth scoring factors (each contributes 0-100 scaled)
// Uses REAL fundamental data when available, falls back to profile
function calculateGrowthScore(s: StockProfile, priceChange: number, fund: YahooFundamentals | null): number {
  let score = 0;

  // Signal & Trend (from profile — these are set manually based on technical analysis)
  if (s.signal === 'BULLISH') score += 20;
  else if (s.signal === 'NEUTRAL') score += 8;

  if (s.trend === 'uptrend') score += 15;
  else if (s.trend === 'sideways') score += 5;

  // Rating — prefer real analyst recommendation
  const rating = fund && fund.recommendationKey ? mapRecommendation(fund.recommendationKey) : s.rating;
  if (rating === 'STRONG_BUY') score += 15;
  else if (rating === 'BUY') score += 12;
  else if (rating === 'HOLD') score += 4;
  else if (rating === 'SELL') score -= 5;

  // Revenue Growth — prefer real data
  const revNum = fund && fund.revenueGrowth ? fund.revenueGrowth * 100 : safeNum(s.revGrowth);
  if (revNum >= 30) score += 12;
  else if (revNum >= 15) score += 10;
  else if (revNum >= 8) score += 7;
  else if (revNum >= 3) score += 4;
  else if (revNum > 0) score += 2;
  else score -= 3;

  // EPS Growth — prefer real data
  const epsNum = fund && fund.earningsGrowth ? fund.earningsGrowth * 100 : safeNum(s.epsGrowth);
  if (epsNum >= 40) score += 12;
  else if (epsNum >= 20) score += 10;
  else if (epsNum >= 10) score += 7;
  else if (epsNum >= 5) score += 4;
  else if (epsNum > 0) score += 2;
  else score -= 3;

  // PEG Ratio — prefer real data
  const peg = fund && fund.pegRatio > 0 ? fund.pegRatio : s.peg;
  if (peg > 0 && peg <= 1.0) score += 8;
  else if (peg > 0 && peg <= 1.5) score += 6;
  else if (peg > 0 && peg <= 2.0) score += 4;
  else if (peg > 0 && peg <= 3.0) score += 2;
  else score -= 2;

  // Moat (from profile — structural advantage)
  if (s.moat === 'WIDE') score += 8;
  else if (s.moat === 'NARROW') score += 3;

  // Price momentum
  if (priceChange >= 2) score += 10;
  else if (priceChange >= 1) score += 7;
  else if (priceChange >= 0.3) score += 4;
  else if (priceChange >= 0) score += 2;
  else if (priceChange >= -1) score += 0;
  else score -= 3;

  // Operating margin — prefer real data
  const opMarginNum = fund && fund.operatingMargins > 0 ? fund.operatingMargins * 100 : safeNum(s.opMargin);
  if (opMarginNum >= 40) score += 5;
  else if (opMarginNum >= 25) score += 4;
  else if (opMarginNum >= 15) score += 2;

  // Upside from analyst target — prefer real data
  if (fund && fund.currentPrice > 0 && fund.targetMeanPrice > 0) {
    const upside = ((fund.targetMeanPrice - fund.currentPrice) / fund.currentPrice) * 100;
    if (upside >= 30) score += 5;
    else if (upside >= 15) score += 3;
    else if (upside >= 5) score += 1;
  }

  return Math.max(0, Math.min(100, score));
}

// Risk scoring factors (0-100, higher = more risk of decline)
function calculateRiskScore(s: StockProfile, priceChange: number, fund: YahooFundamentals | null): number {
  let score = 0;

  if (s.signal === 'BEARISH') score += 20;
  else if (s.signal === 'NEUTRAL') score += 8;

  if (s.trend === 'downtrend') score += 15;
  else if (s.trend === 'sideways') score += 5;

  const rating = fund && fund.recommendationKey ? mapRecommendation(fund.recommendationKey) : s.rating;
  if (rating === 'SELL') score += 12;
  else if (rating === 'HOLD') score += 6;

  // Revenue decline
  const revNum = fund && fund.revenueGrowth ? fund.revenueGrowth * 100 : safeNum(s.revGrowth);
  if (revNum < -5) score += 12;
  else if (revNum < 0) score += 8;
  else if (revNum < 3) score += 3;

  // EPS decline
  const epsNum = fund && fund.earningsGrowth ? fund.earningsGrowth * 100 : safeNum(s.epsGrowth);
  if (epsNum < -10) score += 10;
  else if (epsNum < 0) score += 6;
  else if (epsNum < 5) score += 2;

  // Valuation risk — prefer real PE
  const pe = fund && fund.trailingPE > 0 ? fund.trailingPE : s.pe;
  if (pe > 80) score += 8;
  else if (pe > 50) score += 5;
  else if (pe > 35) score += 2;

  if (s.moat === 'NONE') score += 8;
  else if (s.moat === 'NARROW') score += 4;

  if (priceChange <= -2) score += 10;
  else if (priceChange <= -1) score += 7;
  else if (priceChange <= -0.3) score += 4;
  else if (priceChange < 0) score += 2;

  // Debt — prefer real data
  const debtEq = fund && fund.debtToEquity > 0 ? fund.debtToEquity : s.debtEq;
  if (debtEq > 3) score += 8;
  else if (debtEq > 2) score += 5;
  else if (debtEq > 1) score += 2;

  // Operating margin weakness — prefer real data
  const opMarginNum = fund && fund.operatingMargins > 0 ? fund.operatingMargins * 100 : safeNum(s.opMargin);
  if (opMarginNum < 5) score += 7;
  else if (opMarginNum < 10) score += 4;
  else if (opMarginNum < 15) score += 2;

  // Negative upside (analysts see decline)
  if (fund && fund.currentPrice > 0 && fund.targetMeanPrice > 0) {
    const upside = ((fund.targetMeanPrice - fund.currentPrice) / fund.currentPrice) * 100;
    if (upside < -15) score += 8;
    else if (upside < -5) score += 4;
  }

  return Math.max(0, Math.min(100, score));
}

function generateGrowthReasons(s: StockProfile, priceChange: number, fund: YahooFundamentals | null): string[] {
  const reasons: string[] = [];

  if (s.signal === 'BULLISH') reasons.push(`Sinjali teknik: BULLISH me trend ${s.trend}`);

  const rating = fund && fund.recommendationKey ? mapRecommendation(fund.recommendationKey) : s.rating;
  if (rating === 'STRONG_BUY') reasons.push(`${fund?.numberOfAnalystOpinions || s.buyCount} analiste rekomandojne BLERJE, vetem ${s.sellCount} SHITJE`);
  else if (rating === 'BUY') reasons.push(`${fund?.numberOfAnalystOpinions || s.buyCount} analiste BLERJE vs ${s.sellCount} SHITJE`);

  // Use real growth data
  const revNum = fund && fund.revenueGrowth ? fund.revenueGrowth * 100 : safeNum(s.revGrowth);
  const epsNum = fund && fund.earningsGrowth ? fund.earningsGrowth * 100 : safeNum(s.epsGrowth);

  if (revNum >= 20) reasons.push(`Rritja e te ardhurave: +${revNum.toFixed(1)}% (eksplozive)`);
  else if (revNum >= 10) reasons.push(`Rritja e te ardhurave: +${revNum.toFixed(1)}%`);
  else if (revNum > 0) reasons.push(`Te ardhurat rriten: +${revNum.toFixed(1)}%`);

  if (epsNum >= 30) reasons.push(`EPS growth: +${epsNum.toFixed(1)}% (forte)`);
  else if (epsNum >= 15) reasons.push(`Fitimi per aksion rritet: +${epsNum.toFixed(1)}%`);

  const peg = fund && fund.pegRatio > 0 ? fund.pegRatio : s.peg;
  if (peg > 0 && peg <= 1.5) reasons.push(`PEG ${peg.toFixed(2)} — vleresim i arsyeshem per rritjen`);

  if (s.moat === 'WIDE') reasons.push(`Avantazhi konkurrues: I GJERE (${s.strengths[0] || ''})`);
  if (priceChange >= 1) reasons.push(`Momentum ditore: +${priceChange.toFixed(2)}%`);

  // Real upside
  if (fund && fund.currentPrice > 0 && fund.targetMeanPrice > 0) {
    const upside = ((fund.targetMeanPrice - fund.currentPrice) / fund.currentPrice) * 100;
    if (upside > 10) reasons.push(`Upside analistesh: +${upside.toFixed(1)}% (target $${fund.targetMeanPrice.toFixed(2)})`);
  }

  const qRevNum = fund && fund.revenueQuarterlyGrowth ? fund.revenueQuarterlyGrowth * 100 : safeNum(s.qRevGrowth);
  if (qRevNum > revNum) reasons.push(`Akselerim: rritja tremujore (+${qRevNum.toFixed(1)}%) > vjetore`);

  return reasons.slice(0, 5);
}

function generateRiskReasons(s: StockProfile, priceChange: number, fund: YahooFundamentals | null): string[] {
  const reasons: string[] = [];

  if (s.signal === 'BEARISH') reasons.push(`Sinjali teknik: BEARISH me trend ${s.trend}`);

  const rating = fund && fund.recommendationKey ? mapRecommendation(fund.recommendationKey) : s.rating;
  if (rating === 'HOLD' || rating === 'SELL') reasons.push(`Rating analistesh: ${rating} (${s.sellCount} shitje)`);

  const revNum = fund && fund.revenueGrowth ? fund.revenueGrowth * 100 : safeNum(s.revGrowth);
  const epsNum = fund && fund.earningsGrowth ? fund.earningsGrowth * 100 : safeNum(s.epsGrowth);
  if (revNum < 0) reasons.push(`Te ardhura ne renie: ${revNum.toFixed(1)}%`);
  if (epsNum < 0) reasons.push(`EPS ne renie: ${epsNum.toFixed(1)}%`);

  const pe = fund && fund.trailingPE > 0 ? fund.trailingPE : s.pe;
  if (pe > 50) reasons.push(`P/E ${pe.toFixed(1)}x — vleresim shume i larte`);

  if (s.moat === 'NONE') reasons.push(`Asnje avantazhi konkurrues (Moat: NONE)`);
  if (priceChange < 0) reasons.push(`Momentum negativ: ${priceChange.toFixed(2)}%`);

  const debtEq = fund && fund.debtToEquity > 0 ? fund.debtToEquity : s.debtEq;
  if (debtEq > 2) reasons.push(`Detyrimet e larta: Debt/Equity ${debtEq.toFixed(1)}x`);

  if (s.weaknesses.length > 0) reasons.push(`Rreziku: ${s.weaknesses[0]}`);

  // Negative upside
  if (fund && fund.currentPrice > 0 && fund.targetMeanPrice > 0) {
    const upside = ((fund.targetMeanPrice - fund.currentPrice) / fund.currentPrice) * 100;
    if (upside < 0) reasons.push(`Upside negativ: ${upside.toFixed(1)}% (target $${fund.targetMeanPrice.toFixed(2)} < cmimi $${fund.currentPrice.toFixed(2)})`);
  }

  if (s.trend === 'downtrend') reasons.push(`Trendi afatgjatshem: DOWNTREND`);

  return reasons.slice(0, 5);
}

// Cache for 5 minutes
let cachedResult: { data: { topGrowth: ScoredStock[]; topRisk: ScoredStock[]; timestamp: string; liveCount: number; totalFetched: number; fundCount: number }; fetchedAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Fetch real prices in small batches to avoid rate limits.
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

  // For any missing tickers, try individual fetch
  const missing = tickers.filter(t => !results[t]);
  if (missing.length > 0) {
    const priorityTickers = ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AVGO', 'LLY', 'JPM', 'V', 'CRM', 'AMD', 'NFLX', 'PLTR', 'UNH', 'MRVL', 'COIN', 'SMCI', 'SNOW'];
    const toFetch = priorityTickers.filter(t => missing.includes(t)).slice(0, 15);
    
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
            // Skip
          }
        })
      );
      if (i + BATCH_SIZE < toFetch.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
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

    console.log('[TOP-MOVERS] Fetching real prices AND fundamentals...');

    const allStocks = getAllStocks();
    const allTickers = Object.keys(allStocks);
    
    // ═══ STEP 1: Fetch real prices ═══
    const realPrices = await fetchPricesInBatches(allTickers);
    const liveCount = Object.keys(realPrices).length;
    console.log(`[TOP-MOVERS] Got ${liveCount}/${allTickers.length} real prices`);

    // ═══ STEP 2: Fetch real fundamental data — FAST BATCH FIRST ═══
    // Use v7/finance/quote batch endpoint (1-2 requests for ALL stocks)
    let realFundamentals = await getBatchQuotesFast(allTickers);
    let fundCount = Object.keys(realFundamentals).length;
    console.log(`[TOP-MOVERS] Fast batch got ${fundCount}/${allTickers.length} fundamentals`);

    // Fallback: use individual quoteSummary for any missing stocks (limited to 15)
    if (fundCount < allTickers.length) {
      const missing = allTickers.filter(t => !realFundamentals[t]).slice(0, 15);
      if (missing.length > 0) {
        try {
          const extras = await getRealFundamentalsBatch(missing);
          Object.assign(realFundamentals, extras);
          fundCount = Object.keys(realFundamentals).length;
          console.log(`[TOP-MOVERS] After fallback: ${fundCount}/${allTickers.length} fundamentals`);
        } catch (e) {
          console.log(`[TOP-MOVERS] Fallback fundamentals failed:`, e);
        }
      }
    }

    // ═══ STEP 3: Score all stocks using real data ═══
    const scored: ScoredStock[] = allTickers.map(ticker => {
      const profile = allStocks[ticker];
      const livePrice = realPrices[ticker];
      const fund = realFundamentals[ticker] || null;
      const isLive = !!livePrice && livePrice.price > 0;
      const hasFundamentals = !!fund && fund.currentPrice > 0;

      // Use live price if available, otherwise use fund price, otherwise profile price
      let currentPrice = profile.price;
      let priceChange = profile.change;

      if (isLive) {
        currentPrice = livePrice.price;
        priceChange = livePrice.change;
      } else if (hasFundamentals && fund!.currentPrice > 0) {
        currentPrice = fund!.currentPrice;
        const prev = fund!.previousClose;
        if (prev > 0) {
          priceChange = ((fund!.currentPrice - prev) / prev) * 100;
        }
      }

      return {
        ticker,
        company: profile.company,
        sector: profile.sector,
        industry: profile.industry,
        currentPrice,
        priceChange,
        isLive,
        hasFundamentals,
        growthScore: calculateGrowthScore(profile, priceChange, fund),
        riskScore: calculateRiskScore(profile, priceChange, fund),
        profile,
        fund,
        growthReasons: generateGrowthReasons(profile, priceChange, fund),
        riskReasons: generateRiskReasons(profile, priceChange, fund),
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

    // Enrich with REAL data for output
    const enriched = (list: ScoredStock[], type: 'growth' | 'risk') =>
      list.map(stock => {
        const fund = stock.fund;

        // Use real target prices if available
        let targetPrice = stock.profile.targetPrice;
        let highTarget = stock.profile.highTarget;
        let lowTarget = stock.profile.lowTarget;
        let upside = 0;
        let rating = stock.profile.rating;
        let pe = stock.profile.pe;
        let fwdPE = stock.profile.fwdPE;
        let peg = stock.profile.peg;
        let revGrowth = stock.profile.revGrowth;
        let epsGrowth = stock.profile.epsGrowth;
        let opMargin = stock.profile.opMargin;
        let debtEq = stock.profile.debtEq;
        let buyCount = stock.profile.buyCount;
        let sellCount = stock.profile.sellCount;

        if (fund) {
          // Override with real data
          pe = fund.trailingPE || stock.profile.pe;
          fwdPE = fund.forwardPE || stock.profile.fwdPE;
          peg = fund.pegRatio || stock.profile.peg;
          debtEq = fund.debtToEquity || stock.profile.debtEq;

          // Revenue growth: convert decimal to percentage string
          if (fund.revenueGrowth) {
            revGrowth = (fund.revenueGrowth * 100).toFixed(1) + '%';
          }
          // EPS growth: convert decimal to percentage string
          if (fund.earningsGrowth) {
            epsGrowth = (fund.earningsGrowth * 100).toFixed(1) + '%';
          }
          // Operating margin: convert decimal to percentage string
          if (fund.operatingMargins > 0) {
            opMargin = (fund.operatingMargins * 100).toFixed(1) + '%';
          }

          // Real analyst targets — with PRE-SPLIT validation
          if (fund.targetMeanPrice > 0) {
            const targetRatio = fund.targetMeanPrice / stock.currentPrice;

            // PRE-SPLIT DETECTION: If target > 3x price or < 0.25x price,
            // it's likely a stale pre-split target. Discard it.
            if (targetRatio > 3.0 || targetRatio < 0.25) {
              console.warn(`[TOP-MOVERS] ${stock.ticker}: SUSPICIOUS target=$${fund.targetMeanPrice.toFixed(2)} vs price=$${stock.currentPrice.toFixed(2)} (ratio=${targetRatio.toFixed(2)}). Likely pre-split data — DISCARDING target.`);
              // Fall through to profile target below
            } else {
              targetPrice = '$' + fund.targetMeanPrice.toFixed(2);
              highTarget = '$' + fund.targetHighPrice.toFixed(2);
              lowTarget = '$' + fund.targetLowPrice.toFixed(2);
              upside = ((fund.targetMeanPrice - stock.currentPrice) / stock.currentPrice) * 100;
            }
          }

          // If no valid live target, use profile target
          if (upside === 0) {
            const targetNum = safeNum(String(stock.profile.targetPrice).replace(/[^0-9.]/g, ''));
            if (targetNum > 0) {
              const profileRatio = targetNum / stock.currentPrice;
              // Also validate profile targets against current live price
              if (profileRatio <= 3.0 && profileRatio >= 0.25) {
                upside = ((targetNum - stock.currentPrice) / stock.currentPrice * 100);
              } else {
                console.warn(`[TOP-MOVERS] ${stock.ticker}: Profile target also suspicious (ratio=${profileRatio.toFixed(2)}). No valid target.`);
                upside = 0;
              }
            }
          }

          // SANITY CHECK: Hard cap at 100% — no legitimate upside exceeds this for large caps
          if (Math.abs(upside) > 100) {
            console.warn(`[TOP-MOVERS] ${stock.ticker}: Upside ${upside.toFixed(1)}% exceeds 100% cap — setting to ±100% (price=$${stock.currentPrice.toFixed(2)} target=${targetPrice})`);
            upside = Math.sign(upside) * 100;
          }

          // Real recommendation
          if (fund.recommendationKey) {
            rating = mapRecommendation(fund.recommendationKey);
          }

          // Analyst counts
          if (fund.numberOfAnalystOpinions > 0) {
            const total = Math.round(fund.numberOfAnalystOpinions);
            // Estimate buy/sell split from recommendation
            if (rating === 'STRONG_BUY') { buyCount = Math.round(total * 0.75); sellCount = Math.round(total * 0.05); }
            else if (rating === 'BUY') { buyCount = Math.round(total * 0.55); sellCount = Math.round(total * 0.15); }
            else if (rating === 'HOLD') { buyCount = Math.round(total * 0.25); sellCount = Math.round(total * 0.25); }
            else if (rating === 'SELL') { buyCount = Math.round(total * 0.1); sellCount = Math.round(total * 0.55); }
          }
        } else {
          // No real data — calculate upside from profile target
          const targetNum = safeNum(String(stock.profile.targetPrice).replace(/[^0-9.]/g, ''));
          if (targetNum > 0) {
            const profileRatio = targetNum / stock.currentPrice;
            if (profileRatio <= 3.0 && profileRatio >= 0.25) {
              upside = ((targetNum - stock.currentPrice) / stock.currentPrice * 100);
            } else {
              console.warn(`[TOP-MOVERS] ${stock.ticker}: No live data + suspicious profile target ratio=${profileRatio.toFixed(2)}. Setting upside to 0.`);
              upside = 0;
            }
          }
          // SANITY CHECK: Hard cap at 100%
          if (Math.abs(upside) > 100) {
            upside = Math.sign(upside) * 100;
          }
        }

        return {
          ticker: stock.ticker,
          company: stock.company,
          sector: stock.sector,
          industry: stock.industry,
          currentPrice: stock.currentPrice,
          priceChange: stock.priceChange,
          isLive: stock.isLive,
          hasFundamentals: stock.hasFundamentals,
          score: type === 'growth' ? stock.growthScore : stock.riskScore,
          targetPrice,
          highTarget,
          lowTarget,
          upside: parseFloat(upside.toFixed(1)),
          rating,
          signal: stock.profile.signal,
          trend: stock.profile.trend,
          pe,
          fwdPE,
          peg,
          revGrowth,
          epsGrowth,
          opMargin,
          debtEq,
          moat: stock.profile.moat,
          marketCap: stock.profile.marketCap,
          reasons: type === 'growth' ? stock.growthReasons : stock.riskReasons,
          strengths: stock.profile.strengths,
          weaknesses: stock.profile.weaknesses,
          buyCount,
          sellCount,
        };
      });

    const result = {
      topGrowth: enriched(topGrowth, 'growth'),
      topRisk: enriched(topRisk, 'risk'),
      totalAnalyzed: allTickers.length,
      liveCount,
      totalFetched: allTickers.length,
      fundCount,
      timestamp: new Date().toISOString(),
    };

    cachedResult = { data: result, fetchedAt: Date.now() };
    console.log(`[TOP-MOVERS] Growth: ${topGrowth.map(s => s.ticker).join(',')} | Risk: ${topRisk.map(s => s.ticker).join(',')} | Live: ${liveCount} | Fund: ${fundCount}`);

    return NextResponse.json({ ...result, cached: false });
  } catch (error) {
    console.error('[TOP-MOVERS] Error:', error);

    if (cachedResult) {
      return NextResponse.json({ ...cachedResult.data, cached: true, stale: true });
    }

    return NextResponse.json({ error: 'Gabim ne analizen e tregjit' }, { status: 502 });
  }
}
