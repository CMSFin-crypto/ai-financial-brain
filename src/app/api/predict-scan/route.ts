import { NextResponse } from 'next/server';
import { fetchHistoricalData } from '@/lib/alpha-vantage';
import { predictStock, rankStocks } from '@/lib/prediction-engine';
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
  'DVN','EOG','FANG','FI','GD','GLW','GS','HPE','KLAC','LHX',
  'MA','MOD','MPC','MS','NET','PARR','SCHW','SNDK','SNPS','STX',
  'TGT','TJX','VRT','VST','WDC','WFC','WFRD',
];

export async function GET() {
  try {
    const results: PredictionResult[] = [];
    const errors: string[] = [];
    let fetched = 0;
    let failed = 0;

    // Process in batches of 5 to avoid rate limiting
    const BATCH_SIZE = 5;
    for (let i = 0; i < ALL_TICKERS.length; i += BATCH_SIZE) {
      const batch = ALL_TICKERS.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (ticker) => {
          const data = await fetchHistoricalData(ticker, '6mo');
          if (!data || data.length < 60) {
            throw new Error('Të dhëna të pamjaftueshme');
          }
          return predictStock(ticker, data);
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
      if (i + BATCH_SIZE < ALL_TICKERS.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Rank and sort
    const ranked = rankStocks(results);

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      total: ALL_TICKERS.length,
      successful: fetched,
      failed,
      errors: errors.slice(0, 20), // Max 20 errors
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