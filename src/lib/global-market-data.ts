// ============================================================
// Global Market Data Loader V2
// Fetches daily OHLCV for global indices, ETFs, semis.
// Uses Yahoo Finance v8 (same infra as alpha-vantage.ts).
// Returns enriched data with returns, ATR, SMAs.
// ============================================================

import { fetchHistoricalData, type HistoricalDataPoint } from './alpha-vantage';

// ─── Instrument Registry ─────────────────────────────────────

export interface GlobalInstrument {
  symbol: string;
  label: string;
  assetType: 'INDEX' | 'ETF' | 'STOCK' | 'VOLATILITY';
  region: 'ASIA_PACIFIC' | 'US' | 'EUROPE';
  sector?: string;
}

export const GLOBAL_INSTRUMENTS: GlobalInstrument[] = [
  { symbol: '^KS11',  label: 'KOSPI',       assetType: 'INDEX',      region: 'ASIA_PACIFIC' },
  { symbol: '^N225',  label: 'Nikkei 225',  assetType: 'INDEX',      region: 'ASIA_PACIFIC' },
  { symbol: '^HSI',   label: 'Hang Seng',   assetType: 'INDEX',      region: 'ASIA_PACIFIC' },
  { symbol: 'SPY',    label: 'S&P 500',      assetType: 'ETF',       region: 'US' },
  { symbol: 'QQQ',    label: 'Nasdaq 100',   assetType: 'ETF',       region: 'US' },
  { symbol: 'SMH',    label: 'Semiconductor ETF', assetType: 'ETF', region: 'US', sector: 'SEMICONDUCTOR' },
  { symbol: 'VIX',    label: 'VIX',          assetType: 'VOLATILITY', region: 'US' },
  { symbol: 'NVDA',   label: 'NVIDIA',       assetType: 'STOCK',     region: 'US', sector: 'SEMICONDUCTOR' },
  { symbol: 'AMD',    label: 'AMD',          assetType: 'STOCK',     region: 'US', sector: 'SEMICONDUCTOR' },
  { symbol: 'MU',     label: 'Micron',       assetType: 'STOCK',     region: 'US', sector: 'SEMICONDUCTOR' },
  { symbol: 'MRVL',   label: 'Marvell',      assetType: 'STOCK',     region: 'US', sector: 'SEMICONDUCTOR' },
  { symbol: 'WDC',    label: 'Western Digital', assetType: 'STOCK',  region: 'US', sector: 'SEMICONDUCTOR' },
];

export const SPILLOVER_CORE = ['^KS11', '^N225', '^HSI', 'SPY', 'QQQ', 'SMH', 'VIX'] as const;
export const SEMI_TICKERS = ['NVDA', 'AMD', 'MU', 'MRVL', 'WDC'] as const;

// ─── Cache ───────────────────────────────────────────────────

interface CachedRaw { data: HistoricalDataPoint[]; fetchedAt: number; }
const rawCache = new Map<string, CachedRaw>();
const RAW_CACHE_TTL_MS = 10 * 60 * 1000;

// ─── Math helpers (used by features too) ──────────────────────

export function smaCalc(values: number[], period: number): number | null {
  if (values.length < period) return null;
  return values.slice(-period).reduce((a, b) => a + b, 0) / period;
}

export function computeATR(candles: { high: number; low: number; close: number }[], period: number = 14): number | null {
  if (candles.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = candles.length - period; i < candles.length; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];
    trs.push(Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close)));
  }
  return trs.length >= period ? trs.reduce((a, b) => a + b, 0) / trs.length : null;
}

export function pctChange(current: number, previous: number): number {
  if (!previous || previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

// ─── Enriched data type ────────────────────────────────────────

export interface EnrichedMarketData extends HistoricalDataPoint {
  symbol: string;
  assetType: string;
  region: string;
  sector?: string;
  return1d: number;
  return2d: number | null;
  return5d: number | null;
  atr14: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
}

/**
 * Enrich raw history. Input is oldest-first.
 * Output is most-recent-first (index 0 = latest day).
 */
export function enrichHistory(
  data: HistoricalDataPoint[],
  instrument: GlobalInstrument
): EnrichedMarketData[] {
  if (data.length < 20) return [];
  const sorted = [...data].reverse();
  const closes = sorted.map(d => d.close);
  return sorted.map((point, i) => {
    const c1 = closes[i + 1];
    const c2 = closes[i + 2];
    const c5 = closes[i + 5];
    return {
      ...point,
      symbol: instrument.symbol,
      assetType: instrument.assetType,
      region: instrument.region,
      sector: instrument.sector,
      return1d: c1 ? pctChange(point.close, c1) : 0,
      return2d: c2 ? pctChange(point.close, c2) : null,
      return5d: c5 ? pctChange(point.close, c5) : null,
      atr14: computeATR(sorted.slice(0, i + 1).map(d => ({ high: d.high, low: d.low, close: d.close })), 14),
      sma20: smaCalc(closes.slice(i), 20),
      sma50: smaCalc(closes.slice(i), 50),
      sma200: smaCalc(closes.slice(i), 200),
    };
  });
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Get daily history for one global instrument.
 * Returns enriched array, most-recent-first (index 0 = latest).
 */
export async function getDailyHistory(
  symbol: string,
  days: number = 260
): Promise<EnrichedMarketData[]> {
  // Map days to Yahoo range
  const range = days <= 30 ? '1mo' : days <= 90 ? '3mo' : days <= 200 ? '6mo' : '1y';
  const cacheKey = `${symbol}_${range}`;
  const cached = rawCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < RAW_CACHE_TTL_MS) {
    const inst = GLOBAL_INSTRUMENTS.find(i => i.symbol === symbol);
    return enrichHistory(cached.data, inst || { symbol, label: symbol, assetType: 'STOCK', region: 'US' });
  }
  const raw = await fetchHistoricalData(symbol, range);
  if (!raw || raw.length < 20) return [];
  rawCache.set(cacheKey, { data: raw, fetchedAt: Date.now() });
  const inst = GLOBAL_INSTRUMENTS.find(i => i.symbol === symbol);
  return enrichHistory(raw, inst || { symbol, label: symbol, assetType: 'STOCK', region: 'US' });
}

/**
 * Get a full global snapshot for all core instruments.
 * Returns map: symbol -> enriched data (most-recent-first).
 */
export async function getGlobalSnapshot(
  date?: string
): Promise<Record<string, EnrichedMarketData[]>> {
  const results = await Promise.allSettled(
    SPILLOVER_CORE.map(s => getDailyHistory(s, 260))
  );
  const map: Record<string, EnrichedMarketData[]> = {};
  SPILLOVER_CORE.forEach((sym, i) => {
    if (results[i].status === 'fulfilled' && results[i].value.length > 0) {
      map[sym] = results[i].value;
    }
  });
  console.log(`[GLOBAL-DATA] Snapshot: ${Object.keys(map).length}/${SPILLOVER_CORE.length} instruments`);
  return map;
}

/**
 * Save today's snapshots to DB. Idempotent (skips if exists).
 */
export async function saveMarketSnapshots(enrichedArrays: EnrichedMarketData[][]): Promise<number> {
  try {
    const { prisma } = await import('./prisma');
    let saved = 0;
    for (const arr of enrichedArrays) {
      if (arr.length === 0) continue;
      const latest = arr[0]; // most recent
      const dateStr = latest.date;
      const existing = await prisma.globalMarketSnapshot.findFirst({
        where: { symbol: latest.symbol, date: new Date(dateStr) },
      });
      if (existing) continue;
      await prisma.globalMarketSnapshot.create({
        data: {
          date: new Date(dateStr),
          symbol: latest.symbol,
          assetType: latest.assetType,
          region: latest.region,
          sector: latest.sector || null,
          open: latest.open,
          high: latest.high,
          low: latest.low,
          close: latest.close,
          volume: latest.volume,
          return1d: latest.return1d,
          return2d: latest.return2d,
          return5d: latest.return5d,
          atr14: latest.atr14,
          sma20: latest.sma20,
          sma50: latest.sma50,
          sma200: latest.sma200,
        },
      });
      saved++;
    }
    console.log(`[GLOBAL-DATA] Saved ${saved} snapshots to DB`);
    return saved;
  } catch (err) {
    console.error('[GLOBAL-DATA] DB save failed:', err);
    return 0;
  }
}

/**
 * Get historical snapshots from DB for backtest / dataset building.
 * Returns oldest-first.
 */
export async function getHistoricalSnapshots(
  symbol: string,
  daysAgo: number = 365
): Promise<EnrichedMarketData[]> {
  try {
    const { prisma } = await import('./prisma');
    const since = new Date();
    since.setDate(since.getDate() - daysAgo);
    const rows = await prisma.globalMarketSnapshot.findMany({
      where: { symbol, date: { gte: since } },
      orderBy: { date: 'asc' },
    });
    return rows.map(r => ({
      date: r.date.toISOString().split('T')[0],
      open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume,
      symbol: r.symbol, assetType: r.assetType, region: r.region, sector: r.sector || undefined,
      return1d: r.return1d, return2d: r.return2d ?? null, return5d: r.return5d ?? null,
      atr14: r.atr14 ?? null, sma20: r.sma20 ?? null, sma50: r.sma50 ?? null, sma200: r.sma200 ?? null,
    }));
  } catch (err) {
    console.error(`[GLOBAL-DATA] DB read failed for ${symbol}:`, err);
    return [];
  }
}
