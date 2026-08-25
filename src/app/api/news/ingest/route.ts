// POST /api/news/ingest
// Ingest news for a specific ticker or macro news.
// Body: { ticker?: string, type?: 'ticker' | 'macro' | 'universe' }

import { NextResponse } from 'next/server';
import { ingestNewsForTicker, ingestMacroNews } from '@/lib/news-ingestion';

const IBKR_TOP_50 = [
  'AAPL','MSFT','NVDA','AMZN','GOOGL','META','AVGO','TSLA','BRK.B','LLY',
  'CRM','ORCL','ADBE','NOW','INTU','SNOW','PLTR','DDOG','CRWD','PANW',
  'NET','ZS','FTNT','MRVL','QCOM','TXN','MU','LRCX','AMAT','ARM',
  'JPM','V','MA','BAC','GS','MS','BLK','SCHW','UNH','JNJ',
  'LLY','MRK','ABBV','PFE','XOM','WMT','HD','NKE','MCD','COST',
];

export async function POST(request: Request) {
 try {
    const body = await request.json();
    const type = body.type || 'ticker';
    const ticker = body.ticker;

    if (type === 'macro') {
      const result = await ingestMacroNews(20);
      return NextResponse.json(result);
    }

    if (type === 'universe') {
      // Ingest for top 50 (limit to avoid rate limits)
      const results = await Promise.allSettled(
        IBKR_TOP_50.map(t => ingestNewsForTicker(t, 8))
      );
      let totalNew = 0, totalDupes = 0, totalErrors = 0;
      const allItems: any[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') {
          totalNew += r.value.newEvents;
          totalDupes += r.value.duplicates;
          totalErrors += r.value.errors;
          allItems.push(...r.value.items);
        } else {
          totalErrors++;
        }
      }
      return NextResponse.json({
        total: allItems.length, newEvents: totalNew,
        duplicates: totalDupes, errors: totalErrors, items: allItems,
      });
    }

    // Single ticker
    if (!ticker) {
      return NextResponse.json({ error: 'Ticker ose tipi duhet te jepet' }, { status: 400 });
    }

    const result = await ingestNewsForTicker(ticker.toUpperCase(), 15);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[NewsIngest] Error:', err);
    return NextResponse.json({ error: err?.message || 'Gabim' }, { status: 500 });
  }
}
