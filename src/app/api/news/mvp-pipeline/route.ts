// POST /api/news/mvp-pipeline
// One-call MVP: ingest news → compute returns → return signals for tickers.
// Designed to be called from Swing Predictions UI.

import { NextResponse } from 'next/server';
import { ingestNewsForTicker } from '@/lib/news-ingestion';
import { computeMissingReturns } from '@/lib/news-event-study';
import { generateNewsSignal } from '@/lib/news-event-study';
import prisma from '@/lib/prisma';

export const maxDuration = 120;

interface MVPSignal {
  ticker: string;
  latest_headline: string;
  sentiment: string;
  news_type: string;
  historical_hit_rate_1d: number;
  avg_return_1d: number;
  avg_return_2d: number;
  score: number;
  label: 'watchlist_high' | 'watchlist_medium' | 'ignore';
}

// Simple score: sentiment + news_type + historical hit rate
function computeScore(sentiment: string, newsType: string, hitRate: number): number {
  let score = 0;

  // Sentiment weight
  if (sentiment === 'positive') score += 2;
  else if (sentiment === 'negative') score -= 2;

  // News type weight
  if (['earnings', 'guidance'].includes(newsType)) score += 2;
  else if (['analyst', 'product_or_partnership'].includes(newsType)) score += 1;

  // Historical hit rate weight
  if (hitRate > 0.6) score += 2;
  else if (hitRate > 0.4) score += 1;
  else if (hitRate > 0 && hitRate <= 0.3) score -= 1;

  return score;
}

function scoreToLabel(score: number): MVPSignal['label'] {
  if (score >= 4) return 'watchlist_high';
  if (score >= 2) return 'watchlist_medium';
  return 'ignore';
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const tickers: string[] = body.tickers || [];

    if (tickers.length === 0) {
      return NextResponse.json({ error: 'Jep tickers[]' }, { status: 400 });
    }

    const results: MVPSignal[] = [];
    let ingested = 0;
    let returnsComputed = 0;

    // Step 1: Ingest news for each ticker (small batch)
    const BATCH = 5;
    for (let i = 0; i < Math.min(tickers.length, 20); i += BATCH) {
      const batch = tickers.slice(i, i + BATCH);
      const settled = await Promise.allSettled(
        batch.map(t => ingestNewsForTicker(t, 5))
      );
      for (const r of settled) {
        if (r.status === 'fulfilled') ingested += r.value.newEvents;
      }
      if (i + BATCH < Math.min(tickers.length, 20)) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // Step 2: Compute returns for events that don't have them yet
    try {
      const retResult = await computeMissingReturns();
      returnsComputed = retResult.computed;
    } catch (err: any) {
      console.log('[MVP] Returns computation:', err.message);
    }

    // Step 3: Generate signal for each ticker
    for (const ticker of tickers.slice(0, 20)) {
      try {
        // Get latest news for this ticker
        const latestNews = await prisma.historicalNewsEvent.findFirst({
          where: { ticker: ticker.toUpperCase() },
          orderBy: { publishedAtUtc: 'desc' },
        });

        if (!latestNews) continue;

        // Get historical signal
        const signal = await generateNewsSignal(ticker, latestNews.eventType);

        const score = computeScore(
          latestNews.sentimentLabel,
          latestNews.eventType,
          signal.impactProbability,
        );

        results.push({
          ticker,
          latest_headline: latestNews.headline,
          sentiment: latestNews.sentimentLabel,
          news_type: latestNews.eventType,
          historical_hit_rate_1d: signal.impactProbability,
          avg_return_1d: signal.expectedMove1d,
          avg_return_2d: signal.expectedMove3d,
          score,
          label: scoreToLabel(score),
        });
      } catch (err: any) {
        console.log(`[MVP] Signal for ${ticker}: ${err.message}`);
      }
    }

    // Sort by score desc
    results.sort((a, b) => b.score - a.score);

    return NextResponse.json({
      ingested,
      returnsComputed,
      signals: results,
      high_watchlist: results.filter(r => r.label === 'watchlist_high'),
      medium_watchlist: results.filter(r => r.label === 'watchlist_medium'),
    });
  } catch (err: any) {
    console.error('[MVP-Pipeline] Error:', err);
    return NextResponse.json({ error: err?.message || 'Gabim' }, { status: 500 });
  }
}
