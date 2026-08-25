// ═══════════════════════════════════════════════════════════════
// NEWS EVENT STUDY — Computes abnormal returns after news events
// For each stored event, calculates: 1d/3d/7d returns, abnormal returns,
// max upside/drawdown window, and impact classification.
// ═══════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';
import { fetchHistoricalData } from './alpha-vantage';

const prisma = new PrismaClient();

interface EventStudyResult {
 eventId: string;
 ticker: string;
 publishedAt: Date;
 eventType: string;
 sentimentScore: number;
 return1d: number | null;
 return3d: number | null;
 return7d: number | null;
 abnormalReturn1d: number | null;
 abnormalReturn3d: number | null;
 abnormalReturn7d: number | null;
 maxUpsideWindow: number | null;
 maxDrawdownWindow: number | null;
 sectorReturnSameWindow: number | null;
 impactHit1d: boolean;
 horizonClass: string;
}

export interface NewsSignal {
  ticker: string;
  eventType: string;
  impactProbability: number;
  expectedMove1d: number;
  expectedMove3d: number;
  bestHorizon: string;
  confidence: number;
 similarCases: SimilarCase[];
}

export interface SimilarCase {
  date: string;
  ticker: string;
  eventType: string;
  abnormalReturn1d: number;
  abnormalReturn3d: number;
  sentimentScore: number;
}

const SECTOR_ETF_MAP: Record<string, string> = {
  'Technology': 'XLK', 'Communication': 'XLC', 'Consumer': 'XLY',
  'Staples': 'XLP', 'Healthcare': 'XLV', 'Finance': 'XLF',
  'Energy': 'XLE', 'Industrial': 'XLI', 'REITs': 'XLRE', 'Utilities': 'XLU',
};

/**
 * Compute event study for all events that don't have returns yet.
 * Call periodically (e.g. daily cron) to fill in returns as data becomes available.
 */
export async function computeMissingReturns(): Promise<{
  computed: number;
  errors: number;
}> {
  // Find events older than 1 day that lack return data
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 1);
  cutoff.setHours(0, 0, 0, 0);

  const events = await prisma.historicalNewsEvent.findMany({
    where: {
      publishedAtUtc: { lt: cutoff },
      return1d: 0, // not yet computed
    },
    orderBy: { publishedAtUtc: 'asc' },
    take: 50, // process in batches
  });

  let computed = 0;
  let errors = 0;

  for (const event of events) {
    try {
      const result = await computeEventStudy(event.ticker, event.publishedAtUtc, event.sector);
      await prisma.historicalNewsEvent.update({
        where: { id: event.id },
        data: {
          return1d: result.return1d,
          return3d: result.return3d,
          return7d: result.return7d,
          abnormalReturn1d: result.abnormalReturn1d,
          abnormalReturn3d: result.abnormalReturn3d,
          abnormalReturn7d: result.abnormalReturn7d,
          maxUpsideWindow: result.maxUpsideWindow,
          maxDrawdownWindow: result.maxDrawdownWindow,
          sectorReturnSameWindow: result.sectorReturnSameWindow,
          impactHit1d: result.impactHit1d,
          horizonClass: result.horizonClass,
        },
      });
      computed++;
    } catch (err) {
      console.error(`[EventStudy] Error for ${event.ticker}:`, err);
      errors++;
    }
  }

  return { computed, errors };
}

/**
 * Compute a full event study for one event.
 * Fetches price data for stock + benchmark around the event date.
 */
async function computeEventStudy(
  ticker: string,
  eventDate: Date,
  sector: string,
): Promise<EventStudyResult> {
  // Fetch 30 days before and 10 days after event
  const startDate = new Date(eventDate);
  startDate.setDate(startDate.getDate() - 30);
  const endDate = new Date(eventDate);
  endDate.setDate(endDate.getDate() + 10);

  const [stockData, benchmarkData] = await Promise.all([
    fetchHistoricalData(ticker, '3mo'),
    fetchHistoricalData('SPY', '3mo'),
  ]);

  if (!stockData || stockData.length < 40 || !benchmarkData || benchmarkData.length < 40) {
    return emptyResult();
  }

  // Find the trading day closest to the event
  const eventTime = eventDate.getTime();
  let eventIdx = stockData.length - 1;
  for (let i = 0; i < stockData.length; i++) {
    if (Math.abs(new Date(stockData[i].date).getTime() - eventTime) <
        Math.abs(new Date(stockData[eventIdx].date).getTime() - eventTime)) {
      eventIdx = i;
    }
  }

  const stockCloses = stockData.map(d => d.close);
  const benchCloses = benchmarkData.map(d => d.close);

  // Find same index in benchmark
  const eventDateStr = stockData[eventIdx].date;
  let benchIdx = benchCloses.length - 1;
  for (let i = 0; i < benchmarkData.length; i++) {
    if (benchmarkData[i].date === eventDateStr) { benchIdx = i; break; }
  }

  // Calculate returns at various horizons
  const ret1d = calcReturn(stockCloses, eventIdx, 1);
  const ret3d = calcReturn(stockCloses, eventIdx, 3);
  const ret7d = calcReturn(stockCloses, eventIdx, 7);
  const benchRet1d = calcReturn(benchCloses, benchIdx, 1);
  const benchRet3d = calcReturn(benchCloses, benchIdx, 3);
  const benchRet7d = calcReturn(benchCloses, benchIdx, 7);

  // Max upside/drawdown within 7-day window
  const { maxUpside, maxDrawdown } = calcMaxMove(stockData, eventIdx, 7);

  // Sector return (approximate: use SPY if no sector ETF match)
  const sectorEtf = SECTOR_ETF_MAP[sector] || 'SPY';
  let sectorReturn = 0;
  if (sectorEtf !== 'SPY') {
    try {
      const sectorData = await fetchHistoricalData(sectorEtf, '3mo');
      if (sectorData && sectorData.length > 10) {
        let sIdx = sectorData.length - 1;
        for (let i = 0; i < sectorData.length; i++) {
          if (sectorData[i].date === eventDateStr) { sIdx = i; break; }
        }
        sectorReturn = calcReturn(sectorData.map(d => d.close), sIdx, 3);
      }
    } catch { /* use 0 */ }
  }

  // Impact classification
  const abnRet1d = (ret1d ?? 0) - (benchRet1d ?? 0);
  const impactHit1d = Math.abs(abnRet1d) > 0.02;

  // Horizon classification: when did the strongest reaction happen?
  const horizonClass = classifyHorizon(stockData, eventIdx);

  return {
    eventId: '', ticker, publishedAt: eventDate, eventType: '', sentimentScore: 0,
    return1d: ret1d,
    return3d: ret3d,
    return7d: ret7d,
    abnormalReturn1d: Math.round(abnRet1d * 10000) / 10000,
    abnormalReturn3d: Math.round(((ret3d ?? 0) - (benchRet3d ?? 0)) * 10000) / 10000,
    abnormalReturn7d: Math.round(((ret7d ?? 0) - (benchRet7d ?? 0)) * 10000) / 10000,
    maxUpsideWindow: maxUpside,
    maxDrawdownWindow: maxDrawdown,
    sectorReturnSameWindow: Math.round(sectorReturn * 10000) / 10000,
    impactHit1d,
    horizonClass,
  };
}

function calcReturn(closes: number[], idx: number, days: number): number | null {
  const targetIdx = idx + days;
  if (targetIdx >= closes.length || idx < 0 || closes[idx] === 0) return null;
  return Math.round(((closes[targetIdx] - closes[idx]) / closes[idx]) * 10000) / 10000;
}

function calcMaxMove(
  data: { high: number; low: number; close: number }[],
  idx: number,
  window: number,
): { maxUpside: number; maxDrawdown: number } {
  const endIdx = Math.min(idx + window, data.length);
  const basePrice = data[idx].close;
  if (basePrice === 0) return { maxUpside: 0, maxDrawdown: 0 };

  let maxUpside = 0;
  let maxDrawdown = 0;
  let maxPrice = basePrice;
  let minPrice = basePrice;

  for (let i = idx; i < endIdx; i++) {
    maxPrice = Math.max(maxPrice, data[i].high);
    minPrice = Math.min(minPrice, data[i].low);
  }

  maxUpside = Math.round(((maxPrice - basePrice) / basePrice) * 10000) / 10000;
  maxDrawdown = Math.round(((minPrice - basePrice) / basePrice) * 10000) / 10000;

  return { maxUpside, maxDrawdown };
}

function classifyHorizon(
  data: { high: number; low: number; close: number; date: string }[],
  eventIdx: number,
): string {
  if (eventIdx + 1 >= data.length) return 'none';
  const base = data[eventIdx].close;
  if (base === 0) return 'none';

  // Check day 0 (intraday) — use high-low range as proxy
  const day0Range = (data[eventIdx].high - data[eventIdx].low) / base;
  // Check day 1
  const day1Move = eventIdx + 1 < data.length
    ? Math.abs(data[eventIdx + 1].close - base) / base : 0;
  // Check days 2-3
  const day3Move = eventIdx + 3 < data.length
    ? Math.abs(data[eventIdx + 3].close - base) / base : 0;
  // Check days 4-7
  const day7Move = eventIdx + 7 < data.length
    ? Math.abs(data[eventIdx + 7].close - base) / base : 0;

  const threshold = 0.01; // 1%
  if (day0Range > threshold && day0Range >= day1Move && day0Range >= day3Move) return 'intraday';
  if (day1Move > threshold && day1Move >= day3Move) return '1d';
  if (day3Move > threshold && day3Move >= day7Move) return '3d';
  if (day7Move > threshold) return '5d_plus';
  return 'none';
}

function emptyResult(): EventStudyResult {
  return {
    eventId: '', ticker: '', publishedAt: new Date(), eventType: '', sentimentScore: 0,
    return1d: null, return3d: null, return7d: null,
    abnormalReturn1d: null, abnormalReturn3d: null, abnormalReturn7d: null,
    maxUpsideWindow: null, maxDrawdownWindow: null,
    sectorReturnSameWindow: null,
    impactHit1d: false, horizonClass: 'none',
  };
}

// ── SIGNAL GENERATION (Faza 3 preview) ──

/**
 * Generate a news impact signal for a ticker based on historical patterns.
 * Finds similar past events and aggregates their outcomes.
 */
export async function generateNewsSignal(
  ticker: string,
  eventType?: string,
): Promise<NewsSignal> {
  // Find similar historical events
  const where: any = {
    ticker: ticker.toUpperCase(),
    abnormalReturn1d: { not: null },
  };
  if (eventType) where.eventType = eventType;

  const similarEvents = await prisma.historicalNewsEvent.findMany({
    where,
    orderBy: { publishedAtUtc: 'desc' },
    take: 20,
  });

  // Also check same event type across ALL tickers (broader sample)
  let crossTickerEvents: any[] = [];
  if (eventType) {
    crossTickerEvents = await prisma.historicalNewsEvent.findMany({
      where: {
        eventType,
        abnormalReturn1d: { not: null },
        ticker: { not: ticker.toUpperCase() },
      },
      orderBy: { publishedAtUtc: 'desc' },
      take: 30,
    });
  }

  const allSimilar = [...similarEvents, ...crossTickerEvents];

  if (allSimilar.length === 0) {
    return {
      ticker, eventType: eventType || 'unknown',
      impactProbability: 0.3,
      expectedMove1d: 0,
      expectedMove3d: 0,
      bestHorizon: 'unknown',
      confidence: 0.1,
      similarCases: [],
    };
  }

  // Aggregate statistics
  const hitCount = allSimilar.filter(e => e.impactHit1d).length;
  const impactProbability = Math.round((hitCount / allSimilar.length) * 100) / 100;

  const avgAbn1d = allSimilar.reduce((s, e) => s + (e.abnormalReturn1d ?? 0), 0) / allSimilar.length;
  const avgAbn3d = allSimilar.reduce((s, e) => s + (e.abnormalReturn3d ?? 0), 0) / allSimilar.length;

  // Find best horizon
  const horizonCounts: Record<string, number> = {};
  for (const e of allSimilar) {
    const h = e.horizonClass || 'none';
    horizonCounts[h] = (horizonCounts[h] || 0) + 1;
  }
  const bestHorizon = Object.entries(horizonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

  // Confidence based on sample size
  const confidence = Math.min(0.95, allSimilar.length / 30);

  // Top similar cases
  const similarCases: SimilarCase[] = allSimilar.slice(0, 5).map(e => ({
    date: e.publishedAtUtc.toISOString().split('T')[0],
    ticker: e.ticker,
    eventType: e.eventType,
    abnormalReturn1d: e.abnormalReturn1d ?? 0,
    abnormalReturn3d: e.abnormalReturn3d ?? 0,
    sentimentScore: e.sentimentScore,
  }));

  return {
    ticker,
    eventType: eventType || 'all',
    impactProbability,
    expectedMove1d: Math.round(avgAbn1d * 10000) / 10000,
    expectedMove3d: Math.round(avgAbn3d * 10000) / 10000,
    bestHorizon,
    confidence: Math.round(confidence * 100) / 100,
    similarCases,
  };
}

/**
 * Find similar historical events for a given ticker + event type.
 */
export async function findSimilarEvents(
  ticker: string,
  eventType: string,
  limit = 10,
): Promise<SimilarCase[]> {
  const events = await prisma.historicalNewsEvent.findMany({
    where: {
      eventType,
      abnormalReturn1d: { not: null },
    },
    orderBy: { publishedAtUtc: 'desc' },
    take: limit * 3,
  });

  return events.slice(0, limit).map(e => ({
    date: e.publishedAtUtc.toISOString().split('T')[0],
    ticker: e.ticker,
    eventType: e.eventType,
    abnormalReturn1d: e.abnormalReturn1d ?? 0,
    abnormalReturn3d: e.abnormalReturn3d ?? 0,
    sentimentScore: e.sentimentScore,
  }));
}
