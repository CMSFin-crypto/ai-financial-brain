import { NextResponse } from 'next/server';
import { fetchHistoricalData, getBatchQuotesFast } from '@/lib/alpha-vantage';
import { predictStock, predictStockEnhanced, rankStocks } from '@/lib/prediction-engine';
import { analyzeFundamentals } from '@/lib/fundamental-analysis';
import { addPrediction, loadLearningStats } from '@/lib/prediction-history';
import type { PredictionResult } from '@/lib/prediction-engine';

export const maxDuration = 300; // 5 minutes for scanning all stocks

// All 116 tickers from stock-fundamentals.json
const ALL_TICKERS = [
  'AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA','BRK-B','JPM','V',
  'UNH','JNJ','WMT','PG','MA','HD','COST','ABBV','AVGO','PEP',
  'KO','NKE','MRK','TMO','CSCO','ACN','ABT','ADBE','CRM','AMD',
  'NFLX','PYPL','INTC','CMCSA','QCOM','COP','TXN','AMGN','ORCL','CME',
  'LOW','SBUX','INTU','ISRG','BLK','AXP','BKNG','GILD','MDLZ','LRCX',
  'ADI','VRTX','REGN','FISV','CI','SYK','MU','CB','SLB','ZTS',
  'BSX','BDX','PGR','CL','MMC','EOG','SO','DUK','PFE','BA',
  'DE','CAT','GE','IBM','DIS','RTX','HON','UPS','CVX','EQIX',
  'LMT','PLD','PSA','WELL','AMT','AON','SPGI','SHW','NOC','ICE',
  'AI','AMAT','ANET','ANSS','ARM','BAC','CDNS','CEG','CRWD','DDOG',
  'DVN','FANG','FI','GD','GLW','GS','HPE','KLAC','LHX',
  'MPC','MS','NET','SCHW','SNPS','STX',
  'TGT','TJX','VRT','VST','WDC','WFC','WFRD',
];

// Remove duplicates
const UNIQUE_TICKERS = [...new Set(ALL_TICKERS)];

export async function GET() {
  try {
    const results: PredictionResult[] = [];
    const errors: string[] = [];
    let fetched = 0;
    let failed = 0;

    // Load learning stats once
    const learningStats = loadLearningStats();

    // Fetch fundamentals in batch first (fast from local JSON)
    console.log('[SCAN] Fetching fundamentals for all tickers...');
    const allFundamentals = await getBatchQuotesFast(UNIQUE_TICKERS);
    console.log(`[SCAN] Got fundamentals for ${Object.keys(allFundamentals).length}/${UNIQUE_TICKERS.length} tickers`);

    // Process in batches of 5 to avoid rate limiting
    const BATCH_SIZE = 5;
    for (let i = 0; i < UNIQUE_TICKERS.length; i += BATCH_SIZE) {
      const batch = UNIQUE_TICKERS.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (ticker) => {
          const data = await fetchHistoricalData(ticker, '6mo');
          if (!data || data.length < 60) {
            throw new Error('Të dhëna të pamjaftueshme');
          }

          // Technical analysis
          const baseResult = predictStock(ticker, data);

          // Fundamental analysis
          const fund = allFundamentals[ticker];
          let fundamentalScore: number | null = null;
          let fundamentalSummary = '';
          let fundamentalScores: Record<string, number> = {};

          if (fund) {
            const fundResult = analyzeFundamentals(ticker, fund);
            fundamentalScore = fundResult.totalScore;
            fundamentalSummary = fundResult.summary;
            fundamentalScores = {
              valuation: fundResult.scores.valuation.score,
              growth: fundResult.scores.growth.score,
              profitability: fundResult.scores.profitability.score,
              analystSentiment: fundResult.scores.analystSentiment.score,
              debtHealth: fundResult.scores.debtHealth.score,
              momentum: fundResult.scores.momentum.score,
            };
          }

          // Enhanced prediction
          const result = predictStockEnhanced(baseResult, {
            fundamentalScore,
            fundamentalSummary,
            fundamentalScores,
            learningStats: learningStats.totalPredictions > 0 ? {
              totalPredictions: learningStats.totalPredictions,
              directionAccuracy: learningStats.directionAccuracy,
              shortTermAccuracy: learningStats.shortTermAccuracy,
              mediumTermAccuracy: learningStats.mediumTermAccuracy,
              bestIndicators: learningStats.bestIndicators,
              worstIndicators: learningStats.worstIndicators,
              recentAccuracy: learningStats.recentAccuracy,
            } : null,
          });

          // Store for learning
          try {
            const lastClose = data[data.length - 1].close;
            addPrediction({
              symbol: ticker,
              timestamp: result.timestamp,
              predictedDirection: result.direction === 'STRONG_BUY' || result.direction === 'BUY' ? 'UP'
                : result.direction === 'STRONG_SELL' || result.direction === 'SELL' ? 'DOWN' : 'SIDEWAYS',
              predictedScore: result.score,
              predictedShortTerm: result.shortTerm,
              predictedMediumTerm: result.mediumTerm,
              technicalScore: result.technicalScore,
              fundamentalScore: fundamentalScore ?? 0,
              indicatorScores: result.indicatorScores,
              fundamentalScores,
              closePriceAtPrediction: lastClose,
            });
          } catch {
            // Non-critical
          }

          return result;
        })
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled') {
          results.push(result.value);
          fetched++;
        } else {
          errors.push(`${batch[j]}: ${result.reason?.message || 'Gabim'}`);
          failed++;
        }
      }

      // Small delay between batches
      if (i + BATCH_SIZE < UNIQUE_TICKERS.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Rank and sort
    const ranked = rankStocks(results);

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      total: UNIQUE_TICKERS.length,
      successful: fetched,
      failed,
      errors: errors.slice(0, 20),
      learningStats: {
        totalPredictions: learningStats.totalPredictions,
        directionAccuracy: learningStats.directionAccuracy,
        recentAccuracy: learningStats.recentAccuracy,
        bestIndicators: learningStats.bestIndicators,
        worstIndicators: learningStats.worstIndicators,
      },
      topPicks: ranked.filter(r => r.direction === 'STRONG_BUY' || r.direction === 'BUY').slice(0, 20),
      topShorts: ranked.filter(r => r.direction === 'STRONG_SELL' || r.direction === 'SELL').slice(0, 10),
      mostConfident: [...ranked].sort((a, b) => b.confidence - a.confidence).slice(0, 10),
      allResults: ranked,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[PREDICT-SCAN] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}