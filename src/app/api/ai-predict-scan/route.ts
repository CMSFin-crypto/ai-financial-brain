import { NextResponse } from 'next/server';
import { fetchHistoricalData, getRealFundamentalsBatch } from '@/lib/alpha-vantage';
import { predictHybrid, rankHybridStocks } from '@/lib/hybrid-prediction';
import type { HybridPredictionResult } from '@/lib/hybrid-prediction';

export const maxDuration = 300; // 5 minutes

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
  'MOD','MPC','MS','NET','PARR','SCHW','SNPS','STX',
  'TGT','TJX','VRT','VST','WDC','WFC','WFRD',
];

// Deduplicate
const UNIQUE_TICKERS = [...new Set(ALL_TICKERS.map(t => t.toUpperCase()))];

export async function GET() {
  try {
    const results: HybridPredictionResult[] = [];
    const errors: string[] = [];
    let fetched = 0;
    let failed = 0;

    // Process in batches of 3 (slower to accommodate fundamental data)
    const BATCH_SIZE = 3;

    for (let i = 0; i < UNIQUE_TICKERS.length; i += BATCH_SIZE) {
      const batch = UNIQUE_TICKERS.slice(i, i + BATCH_SIZE);

      // Fetch historical data and fundamentals in parallel for the batch
      const batchResults = await Promise.allSettled(
        batch.map(async (ticker) => {
          // Fetch historical and fundamentals in parallel
          const [historicalData, fundMap] = await Promise.all([
            fetchHistoricalData(ticker, '6mo'),
            getRealFundamentalsBatch([ticker]).catch(() => ({})),
          ]);

          if (!historicalData || historicalData.length < 60) {
            throw new Error('Të dhëna të pamjaftueshme');
          }

          const fundamentals = fundMap[ticker] || null;
          return predictHybrid(ticker, historicalData, fundamentals);
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

      // Delay between batches
      if (i + BATCH_SIZE < UNIQUE_TICKERS.length) {
        await new Promise(r => setTimeout(r, 800));
      }
    }

    // Rank and sort
    const ranked = rankHybridStocks(results);

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      total: UNIQUE_TICKERS.length,
      successful: fetched,
      failed,
      errors: errors.slice(0, 20),
      ...ranked,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[AI-PREDICT-SCAN] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}