import { NextResponse } from 'next/server';
import { fetchHistoricalData, getBatchQuotesFast } from '@/lib/alpha-vantage';
import { predictStock, rankStocks } from '@/lib/prediction-engine';
import { analyzeFundamentals } from '@/lib/fundamental-analysis';
import { loadLearningStats, savePredictionToDB } from '@/lib/prediction-history';
import type { PredictionResult } from '@/lib/prediction-engine';

export const maxDuration = 300;

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

const UNIQUE_TICKERS = [...new Set(ALL_TICKERS)];

export async function GET() {
  try {
    const results: PredictionResult[] = [];
    const errors: string[] = [];
    let fetched = 0;
    let failed = 0;

    // Load learning stats once (async)
    const learningStats = await loadLearningStats().catch(() => ({
      totalPredictions: 0, checkedPredictions: 0,
      shortTermAccuracy: 50, mediumTermAccuracy: 50,
      directionAccuracy: 50, indicatorAccuracy: {},
      fundamentalAccuracy: {}, learningWeights: {},
      fundamentalWeights: {}, lastUpdated: new Date().toISOString(),
      bestIndicators: [], worstIndicators: [],
      averageAbsoluteError: 0, recentAccuracy: 50,
    }));

    // Fetch fundamentals in batch
    console.log('[SCAN] Fetching fundamentals for all tickers...');
    const allFundamentals = await getBatchQuotesFast(UNIQUE_TICKERS);
    console.log(`[SCAN] Got fundamentals for ${Object.keys(allFundamentals).length}/${UNIQUE_TICKERS.length} tickers`);

    const BATCH_SIZE = 5;
    for (let i = 0; i < UNIQUE_TICKERS.length; i += BATCH_SIZE) {
      const batch = UNIQUE_TICKERS.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (ticker) => {
          const data = await fetchHistoricalData(ticker, '6mo');
          if (!data || data.length < 60) {
            throw new Error('Të dhëna të pamjaftueshme');
          }

          const baseResult = predictStock(ticker, data);
          const lastClose = data[data.length - 1].close;

          // Fundamental analysis
          const fund = allFundamentals[ticker];
          let fundamentalScore = 0;

          if (fund) {
            const fundResult = analyzeFundamentals(ticker, fund);
            fundamentalScore = fundResult.totalScore;
          }

          // Simple combined score (0.75 tech + 0.25 fund) for scan ranking
          const combined = baseResult.technicalScore * 0.75 + fundamentalScore * 0.25;
          const result: PredictionResult = {
            ...baseResult,
            score: Math.round(combined * 100) / 100,
            combinedScore: Math.round(combined * 100) / 100,
            fundamentalData: fundamentalScore !== 0 ? {
              score: fundamentalScore,
              summary: '',
              scores: {},
            } : null,
          };

          // Store for learning (non-blocking, fire and forget)
          savePredictionToDB({
            ticker,
            signal: result.direction,
            confidence: result.confidence,
            combinedScore: result.combinedScore,
            technicalScore: result.technicalScore,
            fundamentalScore,
            regimeScore: 0,
            eventRiskScore: 0,
            horizonDays: 1,
            predictedDir: result.shortTerm.prediction,
            predictedMovePct: result.shortTerm.expectedMove,
            entryPrice: lastClose,
            gateStatus: 'TRADE',
            factors: [],
          }).catch(() => {});

          return result;
        })
      );

      for (let j = 0; j < batchResults.length; j++) {
        const r = batchResults[j];
        if (r.status === 'fulfilled') {
          results.push(r.value);
          fetched++;
        } else {
          errors.push(`${batch[j]}: ${r.reason?.message || 'Gabim'}`);
          failed++;
        }
      }

      if (i + BATCH_SIZE < UNIQUE_TICKERS.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

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
