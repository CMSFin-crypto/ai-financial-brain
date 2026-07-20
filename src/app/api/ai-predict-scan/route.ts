import { NextResponse } from 'next/server';
import { fetchHistoricalData, getRealFundamentalsBatch, getRealPrice } from '@/lib/alpha-vantage';
import { predictHybrid, rankHybridStocks } from '@/lib/hybrid-prediction';
import { evaluatePredictions, forceSave } from '@/lib/indicator-learning';
import type { HybridPredictionResult } from '@/lib/hybrid-prediction';

export const maxDuration = 300; // 5 minutes

// All 116 tickers
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
  'MOD','MPC','MS','NET','PARR','SCHW','SNPS','STX',
  'TGT','TJX','VRT','VST','WDC','WFC','WFRD',
];

const UNIQUE_TICKERS = [...new Set(ALL_TICKERS.map(t => t.toUpperCase()))];

export async function GET() {
  try {
    // ─── STEP 1: Auto-evaluate past predictions ──────────────
    console.log('[AI-PREDICT-SCAN] Step 1: Auto-evaluating past predictions...');
    let evalResult = { evaluated: 0, correct: 0, newLessons: 0, indicatorAccuracyUpdated: false };
    try {
      evalResult = await evaluatePredictions();
      if (evalResult.evaluated > 0) {
        console.log(`[AI-PREDICT-SCAN] Evaluated ${evalResult.evaluated} past predictions (${evalResult.correct} correct)`);
        forceSave();
      }
    } catch (err: any) {
      console.log(`[AI-PREDICT-SCAN] Evaluation skipped: ${err.message}`);
    }

    // ─── STEP 2: Fetch current prices for recording ─────────
    console.log('[AI-PREDICT-SCAN] Step 2: Fetching current prices...');
    const priceMap: Record<string, number> = {};
    const BATCH_SIZE = 6;
    for (let i = 0; i < UNIQUE_TICKERS.length; i += BATCH_SIZE) {
      const batch = UNIQUE_TICKERS.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (t) => {
          const p = await getRealPrice(t);
          return { ticker: t, price: p?.price ?? 0 };
        })
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.price > 0) {
          priceMap[r.value.ticker] = r.value.price;
        }
      }
      if (i + BATCH_SIZE < UNIQUE_TICKERS.length) {
        await new Promise(r => setTimeout(r, 600));
      }
    }
    console.log(`[AI-PREDICT-SCAN] Got ${Object.keys(priceMap).length} current prices`);

    // ─── STEP 3: Run hybrid predictions ─────────────────────
    console.log('[AI-PREDICT-SCAN] Step 3: Running hybrid predictions...');
    const results: HybridPredictionResult[] = [];
    const errors: string[] = [];
    let fetched = 0;
    let failed = 0;

    // Process in batches of 3
    const PREDICT_BATCH = 3;
    for (let i = 0; i < UNIQUE_TICKERS.length; i += PREDICT_BATCH) {
      const batch = UNIQUE_TICKERS.slice(i, i + PREDICT_BATCH);

      const batchResults = await Promise.allSettled(
        batch.map(async (ticker) => {
          const [historicalData, fundMap] = await Promise.all([
            fetchHistoricalData(ticker, '6mo'),
            getRealFundamentalsBatch([ticker]).catch(() => ({})),
          ]);

          if (!historicalData || historicalData.length < 60) {
            throw new Error('Të dhëna të pamjaftueshme');
          }

          const fundamentals = fundMap[ticker] || null;
          const currentPrice = priceMap[ticker] || (historicalData[historicalData.length - 1]?.close ?? 0);

          return predictHybrid(ticker, historicalData, fundamentals, currentPrice, true);
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

      if (i + PREDICT_BATCH < UNIQUE_TICKERS.length) {
        await new Promise(r => setTimeout(r, 800));
      }
    }

    // Force save all recorded predictions
    forceSave();

    // ─── STEP 4: Rank and return ───────────────────────────
    const ranked = rankHybridStocks(results);

    const { getStats } = await import('@/lib/indicator-learning');
    const learningStats = getStats();

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      total: UNIQUE_TICKERS.length,
      successful: fetched,
      failed,
      errors: errors.slice(0, 20),
      ...ranked,
      // Learning data
      learning: {
        totalRecorded: learningStats.totalRecorded,
        totalEvaluated: learningStats.totalEvaluated,
        overallAccuracy: Math.round(learningStats.overallAccuracy * 1000) / 10,
        evaluationResult: evalResult,
        lessonsCount: learningStats.lessons.length,
        indicatorCount: Object.keys(learningStats.indicatorAccuracies).length,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[AI-PREDICT-SCAN] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}