// ============================================================
// Build Cross-Market Features for Spillover Prediction Engine
// Fetches KOSPI, Nikkei, Hang Seng, SPY, QQQ, SMH, SOXX, VIX,
// sector ETF, and the target stock, then computes derived features.// ============================================================

import { getDailyHistory, type EnrichedMarketData, SEMI_TICKERS } from '@/lib/global-market-data';

// ─── Types ────────────────────────────────────────────────────

export interface CrossMarketFeatures {
  // Asia indices (overnight signals)
  kospi1d: number;        // KOSPI 1-day return %
  kospi2d: number;        // KOSPI 2-day return %
  nikkei1d: number;       // Nikkei 1-day return %
  hsi1d: number;          // Hang Seng 1-day return %
  asiaConsensus: number;  // -1 (all risk-off) to +1 (all risk-on)
  asiaDeceleration: number; // positive = panic slowing

  // US benchmarks
  spy1d: number;          // SPY 1-day return %
  spy5d: number;          // SPY 5-day return %
  qqq1d: number;          // QQQ 1-day return %

  // Sector ETFs
  smh1d: number;          // Semiconductor ETF 1d
  smh5d: number;          // SMH 5d
  sectorEtf1d: number;    // Target's sector ETF 1d
  sectorEtf5d: number;    // Target's sector ETF 5d

  // Volatility
  vixLevel: number;       // VIX absolute level
  vix1d: number;          // VIX 1-day change
  vixZScore: number;      // VIX z-score vs 20-day average

  // Target-specific
  target1d: number;       // Target stock 1d return
  targetVsSector: number; // Target relative strength vs sector ETF (1d)
  targetVsSpy: number;    // Target relative strength vs SPY (1d)

  // Breadth & composites
  semisBreadth: number;   // Fraction of semi stocks negative today
  riskAlignment: number;  // -1 to +1: alignment of Asia + sector + SPY

  // Timestamp
  computedAt: string;
}

// ─── Sector ETF Mapping ────────────────────────────────────────

const SECTOR_ETF_MAP: Record<string, string> = {
  Tech: 'QQQ',
  Semi: 'SMH',
  Finance: 'XLF',
  Healthcare: 'XLV',
  Consumer: 'XLY',
  Energy: 'XLE',
  Industrial: 'XLI',
  Defense: 'ITA',
  Logistics: 'IYT',
  Insurance: 'KIE',
  Utilities: 'XLU',
  REIT: 'VNQ',
  Auto: 'CARZ',
};

// ─── Feature-level Cache (15 minutes) ──────────────────────────

interface CachedFeatures {
  features: CrossMarketFeatures;
  fetchedAt: number;
}
const featureCache = new Map<string, CachedFeatures>();
const FEATURE_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// ─── Helpers ───────────────────────────────────────────────────

function first(data: EnrichedMarketData[]): EnrichedMarketData | null {
  return data.length > 0 ? data[0] : null;
}

/**
 * Sign-normalize a return: clamp to [-1, +1].
 * Returns clamped value of the return / 5, so a 5% move = ±1.
 */
function signNormalize(ret: number): number {
  return Math.max(-1, Math.min(1, ret / 5));
}

/**
 * Compute VIX z-score: (current VIX - 20d mean) / 20d std.
 */
function computeVixZScore(vixData: EnrichedMarketData[]): number {
  if (vixData.length < 20) return 0;
  const closes = vixData.slice(0, 20).map(d => d.close).reverse(); // oldest first
  const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
  const variance = closes.reduce((a, b) => a + (b - mean) ** 2, 0) / closes.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (vixData[0].close - mean) / std;
}

// ─── Main Function ─────────────────────────────────────────────

/**
 * Build cross-market features for a given target symbol.
 * Results are cached for 15 minutes per target.
 */
export async function buildCrossMarketFeatures(
  targetSymbol: string,
  targetSector?: string
): Promise<CrossMarketFeatures> {
  // Check cache first
  const cacheKey = `${targetSymbol}:${targetSector || '_'}`;
  const cached = featureCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < FEATURE_CACHE_TTL_MS) {
    return cached.features;
  }

  // Determine sector ETF
  const sectorEtf = targetSector ? SECTOR_ETF_MAP[targetSector] ?? 'QQQ' : 'QQQ';

  // Collect all unique symbols to fetch
  const symbolsToFetch = [
    '^KS11',   // KOSPI
    '^N225',   // Nikkei 225
    '^HSI',    // Hang Seng
    'SPY',     // S&P 500 ETF
    'QQQ',     // Nasdaq 100 ETF
    'SMH',     // Semiconductor ETF
    'SOXX',    // Semiconductor ETF (alternative)
    'VIX',     // CBOE Volatility Index
    sectorEtf, // Target's sector ETF
    targetSymbol, // Target stock itself
    ...SEMI_TICKERS, // Semi breadth constituents
  ];

  // Deduplicate (e.g. if sectorEtf === 'SMH' or targetSymbol is a semi)
  const uniqueSymbols = [...new Set(symbolsToFetch)];

  // Fetch all in parallel
  const results = await Promise.allSettled(
    uniqueSymbols.map(sym => getDailyHistory(sym, 260))
  );

  // Build lookup map: symbol -> EnrichedMarketData[]
  const dataMap = new Map<string, EnrichedMarketData[]>();
  uniqueSymbols.forEach((sym, i) => {
    if (results[i].status === 'fulfilled' && results[i].value.length > 0) {
      dataMap.set(sym, results[i].value);
    }
  });

  // ── Extract raw values ──────────────────────────────────────

  const kospi = first(dataMap.get('^KS11') ?? []);
  const nikkei = first(dataMap.get('^N225') ?? []);
  const hsi = first(dataMap.get('^HSI') ?? []);
  const spy = first(dataMap.get('SPY') ?? []);
  const qqq = first(dataMap.get('QQQ') ?? []);
  const smh = first(dataMap.get('SMH') ?? []);
  const vix = first(dataMap.get('VIX') ?? []);
  const sectorData = first(dataMap.get(sectorEtf) ?? []);
  const target = first(dataMap.get(targetSymbol) ?? []);
  const vixHistory = dataMap.get('VIX') ?? [];

  // ── Asia indices ────────────────────────────────────────────

  const kospi1d = kospi?.return1d ?? 0;
  const kospi2d = kospi?.return2d ?? 0;
  const nikkei1d = nikkei?.return1d ?? 0;
  const hsi1d = hsi?.return1d ?? 0;

  // Asia consensus: average of sign-normalized 1d returns for 3 Asia indices
  const asiaConsensus = (signNormalize(kospi1d) + signNormalize(nikkei1d) + signNormalize(hsi1d)) / 3;

  // Asia deceleration: if 2d is very negative but 1d is less negative → positive
  let asiaDeceleration = 0;
  if (kospi2d <= -5 && kospi1d > -2) {
    // Panic slowing: 2d was terrible but 1d improved
    asiaDeceleration = Math.min(1, (kospi1d - kospi2d) / 5);
  } else if (kospi2d < 0 && kospi1d > kospi2d) {
    // Mild deceleration
    asiaDeceleration = Math.min(0.5, (kospi1d - kospi2d) / 10);
  }

  // ── US benchmarks ───────────────────────────────────────────

  const spy1d = spy?.return1d ?? 0;
  const spy5d = spy?.return5d ?? 0;
  const qqq1d = qqq?.return1d ?? 0;

  // ── Sector ETFs ─────────────────────────────────────────────

  const smh1d = smh?.return1d ?? 0;
  const smh5d = smh?.return5d ?? 0;
  const sectorEtf1d = sectorData?.return1d ?? 0;
  const sectorEtf5d = sectorData?.return5d ?? 0;

  // ── Volatility ──────────────────────────────────────────────

  const vixLevel = vix?.close ?? 0;
  const vix1d = vix?.return1d ?? 0;
  const vixZScore = computeVixZScore(vixHistory);

  // ── Target-specific ─────────────────────────────────────────

  const target1d = target?.return1d ?? 0;
  const targetVsSector = sectorEtf1d !== 0 ? target1d - sectorEtf1d : 0;
  const targetVsSpy = spy1d !== 0 ? target1d - spy1d : 0;

  // ── Semi breadth ────────────────────────────────────────────

  let semisBreadth = 0;
  const semiResults: boolean[] = [];
  for (const ticker of SEMI_TICKERS) {
    const t = first(dataMap.get(ticker) ?? []);
    if (t) {
      semiResults.push(t.return1d < 0);
    }
  }
  if (semiResults.length > 0) {
    semisBreadth = semiResults.filter(Boolean).length / semiResults.length;
  }

  // ── Risk alignment ──────────────────────────────────────────

  // Sign agreement between Asia consensus, sector ETF, and SPY
  // All three same direction → +1; mixed → lower; opposing → -1
  const asiaSign = Math.sign(asiaConsensus) || 0;
  const sectorSign = Math.sign(sectorEtf1d) || 0;
  const spySign = Math.sign(spy1d) || 0;

  let riskAlignment = 0;
  const activeSigns = [asiaSign, sectorSign, spySign].filter(s => s !== 0);
  if (activeSigns.length >= 2) {
    const sumSigns = activeSigns.reduce((a, b) => a + b, 0);
    riskAlignment = sumSigns / activeSigns.length; // ranges from -1 to +1
  }

  // ── Build result ────────────────────────────────────────────

  const features: CrossMarketFeatures = {
    kospi1d,
    kospi2d,
    nikkei1d,
    hsi1d,
    asiaConsensus,
    asiaDeceleration,
    spy1d,
    spy5d,
    qqq1d,
    smh1d,
    smh5d,
    sectorEtf1d,
    sectorEtf5d,
    vixLevel,
    vix1d,
    vixZScore,
    target1d,
    targetVsSector,
    targetVsSpy,
    semisBreadth,
    riskAlignment,
    computedAt: new Date().toISOString(),
  };

  // Cache the result
  featureCache.set(cacheKey, { features, fetchedAt: Date.now() });

  return features;
}

/**
 * Clear the feature cache (useful for testing or force-refresh).
 */
export function clearFeatureCache(): void {
  featureCache.clear();
}
