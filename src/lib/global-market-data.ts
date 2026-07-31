// ============================================================
// Global Market Data Loader
// Fetches and caches daily OHLCV for global indices and
// semiconductor ETFs/stocks needed by the spillover engine.
// Uses Yahoo Finance v8 chart API (same infrastructure as alpha-vantage.ts)
// ============================================================

import { fetchHistoricalData, type HistoricalDataPoint } from './alpha-vantage';

// ─── Instrument Registry ─────────────────────────────────────

export interface GlobalInstrument {
  symbol: string;        // Yahoo Finance ticker
  label: string;         // Human readable
  region: 'ASIA_PACIFIC' | 'US' | 'EUROPE';
  sector?: string;       // "SEMICONDUCTOR" | "INDEX" | "VOLATILITY"
}

export const GLOBAL_INSTRUMENTS: GlobalInstrument[] = [
  // Asia-Pacific indices
  { symbol: '^KS11',  label: 'KOSPI',     region: 'ASIA_PACIFIC', sector: 'INDEX' },
  { symbol: '^N225',  label: 'Nikkei 225', region: 'ASIA_PACIFIC', sector: 'INDEX' },
  { symbol: '^HSI',   label: 'Hang Seng',  region: 'ASIA_PACIFIC', sector: 'INDEX' },
  // US indices & ETFs
  { symbol: 'SPY',    label: 'S&P 500',    region: 'US', sector: 'INDEX' },
  { symbol: 'QQQ',    label: 'Nasdaq 100',  region: 'US', sector: 'INDEX' },
  { symbol: 'SMH',    label: 'Semiconductor ETF', region: 'US', sector: 'SEMICONDUCTOR' },
  { symbol: 'VIX',    label: 'VIX',         region: 'US', sector: 'VOLATILITY' },
  // Individual semis
  { symbol: 'NVDA',   label: 'NVIDIA',      region: 'US', sector: 'SEMICONDUCTOR' },
  { symbol: 'AMD',    label: 'AMD',         region: 'US', sector: 'SEMICONDUCTOR' },
  { symbol: 'MU',     label: 'Micron',      region: 'US', sector: 'SEMICONDUCTOR' },
  { symbol: 'MRVL',   label: 'Marvell',     region: 'US', sector: 'SEMICONDUCTOR' },
  { symbol: 'WDC',    label: 'Western Digital', region: 'US', sector: 'SEMICONDUCTOR' },
  { symbol: 'SNDK',   label: 'SanDisk',    region: 'US', sector: 'SEMICONDUCTOR' },
];

// Core instruments needed for spillover computation
export const SPILLOVER_CORE = ['^KS11', '^N225', '^HSI', 'SPY', 'QQQ', 'SMH', 'VIX'] as const;

// Semiconductor tickers for sector-specific analysis
export const SEMI_TICKERS = ['NVDA', 'AMD', 'MU', 'MRVL', 'WDC', 'SNDK'] as const;

// ─── In-memory cache ─────────────────────────────────────────

interface CachedHistory {
  data: HistoricalDataPoint[];
  fetchedAt: number;
}

const historyCache = new Map<string, CachedHistory>();
const HISTORY_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ─── Technical indicator helpers ─────────────────────────────

/** Simple Moving Average over `period` days */
export function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/** Average True Range (14-period) */
export function atr14(data: HistoricalDataPoint[]): number | null {
  if (data.length < 16) return null;
  const trs: number[] = [];
  for (let i = data.length - 14; i < data.length; i++) {
    const prev = data[i - 1];
    const cur = data[i];
    if (!prev) continue;
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trs.push(tr);
  }
  if (trs.length < 14) return null;
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

/** Percentage change between two values */
export function pctChange(current: number, previous: number): number {
  if (!previous || previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

/** Enrich data point with computed returns and indicators */
export interface EnrichedMarketData extends HistoricalDataPoint {
  symbol: string;
  region: string;
  sector?: string;
  return1d: number;
  return2d: number | null;
  return5d: number | null;
  atr14Val: number | null;
  sma20Val: number | null;
  sma50Val: number | null;
}

/**
 * Enrich a full history array with returns and indicators.
 * Returns the enriched array sorted most-recent first (index 0 = latest).
 */
export function enrichHistory(
  data: HistoricalDataPoint[],
  instrument: GlobalInstrument
): EnrichedMarketData[] {
  // data from Yahoo is oldest-first; reverse for easiest index math
  const sorted = [...data].reverse(); // index 0 = most recent
  const closes = sorted.map(d => d.close);

  return sorted.map((point, i) => {
    const c1 = closes[i + 1];
    const c2 = closes[i + 2];
    const c5 = closes[i + 5];
    return {
      ...point,
      symbol: instrument.symbol,
      region: instrument.region,
      sector: instrument.sector,
      return1d: c1 ? pctChange(point.close, c1) : 0,
      return2d: c2 ? pctChange(point.close, c2) : null,
      return5d: c5 ? pctChange(point.close, c5) : null,
      atr14Val: i <= 15 ? null : atr14(sorted.slice(0, i + 1)),
      sma20Val: sma(closes.slice(i), 20),
      sma50Val: sma(closes.slice(i), 50),
    };
  });
}

// ─── Public fetcher ───────────────────────────────────────────

/**
 * Fetch enriched market data for a single global instrument.
 * Returns data most-recent-first (index 0 = latest trading day).
 */
export async function getMarketHistory(
  symbol: string,
  range: string = '6mo'
): Promise<EnrichedMarketData[]> {
  const key = `${symbol}_${range}`;

  // Check cache
  const cached = historyCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < HISTORY_CACHE_TTL_MS) {
    const instrument = GLOBAL_INSTRUMENTS.find(i => i.symbol === symbol);
    return enrichHistory(cached.data, instrument || {
      symbol,
      label: symbol,
      region: 'US',
    });
  }

  // Fetch raw data
  const raw = await fetchHistoricalData(symbol, range);
  if (!raw || raw.length < 20) {
    console.log(`[SPILLOVER-DATA] ${symbol}: insufficient data (${raw?.length || 0} days)`);
    return [];
  }

  // Cache raw data
  historyCache.set(key, { data: raw, fetchedAt: Date.now() });

  // Enrich and return
  const instrument = GLOBAL_INSTRUMENTS.find(i => i.symbol === symbol);
  const enriched = enrichHistory(raw, instrument || {
    symbol,
    label: symbol,
    region: 'US',
  });

  console.log(`[SPILLOVER-DATA] ${symbol}: ${enriched.length} days enriched`);
  return enriched;
}

/**
 * Fetch data for all spillover core instruments in parallel.
 * Returns a map: symbol -> EnrichedMarketData[]
 */
export async function getAllSpilloverData(): Promise<Record<string, EnrichedMarketData[]>> {
  const results = await Promise.allSettled(
    SPILLOVER_CORE.map(s => getMarketHistory(s))
  );

  const map: Record<string, EnrichedMarketData[]> = {};
  SPILLOVER_CORE.forEach((symbol, i) => {
    if (results[i].status === 'fulfilled' && results[i].value.length > 0) {
      map[symbol] = results[i].value;
    }
  });

  console.log(`[SPILLOVER-DATA] Fetched ${Object.keys(map).length}/${SPILLOVER_CORE.length} core instruments`);
  return map;
}

/**
 * Save a snapshot to the DB (called by spillover engine after analysis).
 */
export async function saveSnapshotsToDB(enriched: EnrichedMarketData[]): Promise<void> {
  try {
    const { prisma } = await import('./prisma');
    const today = new Date().toISOString().split('T')[0];

    // Only save the latest data point per symbol for today
    const latestBySymbol = new Map<string, EnrichedMarketData>();
    for (const d of enriched) {
      if (!latestBySymbol.has(d.symbol)) {
        latestBySymbol.set(d.symbol, d);
      }
    }

    for (const [symbol, d] of latestBySymbol) {
      // Upsert: skip if we already have today's snapshot for this symbol
      const existing = await prisma.globalMarketSnapshot.findFirst({
        where: { symbol, date: new Date(d.date) },
      });
      if (existing) continue;

      await prisma.globalMarketSnapshot.create({
        data: {
          date: new Date(d.date),
          symbol: d.symbol,
          region: d.region,
          sector: d.sector || null,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: d.volume,
          return1d: d.return1d,
          return2d: d.return2d,
          return5d: d.return5d,
          atr14: d.atr14Val,
          sma20: d.sma20Val,
          sma50: d.sma50Val,
        },
      });
    }
    console.log(`[SPILLOVER-DATA] Saved ${latestBySymbol.size} snapshots to DB`);
  } catch (err) {
    console.error('[SPILLOVER-DATA] DB save failed:', err);
  }
}

/**
 * Get historical spillover data from DB for backtest.
 * Returns data oldest-first (for sequential backtest iteration).
 */
export async function getHistoricalSnapshotsFromDB(
  symbol: string,
  daysAgo: number = 365
): Promise<EnrichedMarketData[]> {
  try {
    const { prisma } = await import('./prisma');
    const since = new Date();
    since.setDate(since.getDate() - daysAgo);

    const snapshots = await prisma.globalMarketSnapshot.findMany({
      where: {
        symbol,
        date: { gte: since },
      },
      orderBy: { date: 'asc' },
    });

    return snapshots.map(s => ({
      date: s.date.toISOString().split('T')[0],
      open: s.open,
      high: s.high,
      low: s.low,
      close: s.close,
      volume: s.volume,
      symbol: s.symbol,
      region: s.region,
      sector: s.sector || undefined,
      return1d: s.return1d,
      return2d: s.return2d ?? null,
      return5d: s.return5d ?? null,
      atr14Val: s.atr14 ?? null,
      sma20Val: s.sma20 ?? null,
      sma50Val: s.sma50 ?? null,
    }));
  } catch (err) {
    console.error(`[SPILLOVER-DATA] DB read failed for ${symbol}:`, err);
    return [];
  }
}
