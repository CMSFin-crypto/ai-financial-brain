// ============================================================
// UNIVERSE-RELATIVE MOMENTUM RANKING
//
// Cross-sectional momentum: not just "is this stock bullish?"
// but "is this stock among the RELATIVE LEADERS of the universe?".
//
// Ranks each stock against:
// 1. Full US stock universe (top decile/quintile)
// 2. Its sector peers
// 3. The benchmark (SPY)
//
// Evidence: Cross-sectional momentum has wide historical support
// (Jegadeesh & Titman 1993, Novy-Marx 2012). Stocks in the top
// decile of 3-12 month momentum outperform bottom decile by
// 6-12% annualized.
// ============================================================

import { getUniverseSnapshots, type USStockSnapshot } from './us-stock-universe';

// ─── Types ────────────────────────────────────────────────────

export interface StockMomentumProfile {
  symbol: string;
  sector: string;
  return5d: number;
  return20d: number;
  return60d: number;
  volume: number;
  marketCap: number;
}

export interface UniverseRankResult {
  symbol: string;
  /** Composite rank score: 0 to 100 (100 = top of universe) */
  rankScore: number;
  /** Percentile rank in full universe (0 = bottom, 100 = top) */
  universePercentile: number;
  /** Percentile rank within sector */
  sectorPercentile: number;
  /** Percentile rank relative to SPY returns */
  spyRelativePercentile: number;
  /** Is this stock in the top decile of the universe? */
  isTopDecile: boolean;
  /** Is this stock in the top quintile? */
  isTopQuintile: boolean;
  /** Is this stock in the bottom quartile? */
  isBottomQuartile: boolean;
  /** Momentum regime for this stock */
  momentumRegime: 'LEADING' | 'FOLLOWING' | 'LAGGING' | 'DECLINING';
  /** Number of stocks in the comparison universe */
  universeSize: number;
  /** Number of stocks in the sector comparison */
  sectorSize: number;
  /** Reasons for display */
  reasons: string[];
}

// ─── Helpers ───────────────────────────────────────────────────

function percentileRank(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 50;
  const sorted = [...allValues].sort((a, b) => a - b);
  const idx = sorted.findIndex(v => v >= value);
  if (idx === -1) return 100;
  return Math.round((idx / sorted.length) * 100);
}

function percentileRankDescending(value: number, allValues: number[]): number {
  // Higher is better (for momentum, returns)
  if (allValues.length === 0) return 50;
  const sorted = [...allValues].sort((a, b) => a - b);
  const idx = sorted.findIndex(v => v >= value);
  if (idx === -1) return 100;
  // Reverse: highest value = 100th percentile
  const countAbove = sorted.filter(v => v < value).length;
  return Math.round((countAbove / sorted.length) * 100);
}

// ─── Core Computation ──────────────────────────────────────────

/**
 * Compute universe-relative ranking for a set of candidate stocks.
 * 
 * Uses the NASDAQ screener data (all US stocks) as the comparison
 * universe. Ranks candidates on 5d, 20d, 60d returns.
 */
export function computeUniverseRanking(
  candidates: StockMomentumProfile[],
  universeSnapshots: USStockSnapshot[],
  spyReturn20d: number,
  spyReturn60d: number,
): Map<string, UniverseRankResult> {
  const results = new Map<string, UniverseRankResult>();

  if (candidates.length === 0 || universeSnapshots.length === 0) {
    // Fallback: neutral scores
    for (const c of candidates) {
      results.set(c.symbol, {
        symbol: c.symbol,
        rankScore: 50,
        universePercentile: 50,
        sectorPercentile: 50,
        spyRelativePercentile: 50,
        isTopDecile: false,
        isTopQuintile: false,
        isBottomQuartile: false,
        momentumRegime: 'FOLLOWING',
        universeSize: universeSnapshots.length,
        sectorSize: 0,
        reasons: ['Universe data nuk disponueshme'],
      });
    }
    return results;
  }

  // Filter universe to stocks with meaningful data
  const validUniverse = universeSnapshots.filter(
    s => s.volume > 100000 && s.marketCap > 100_000_000
  );

  // Build sector groups
  const sectorGroups = new Map<string, USStockSnapshot[]>();
  for (const s of validUniverse) {
    // Sector info not directly in USStockSnapshot, use as-is
    const sector = 'Unknown';
    if (!sectorGroups.has(sector)) sectorGroups.set(sector, []);
    sectorGroups.get(sector)!.push(s);
  }

  // Universe return distributions
  const universeReturns20d = validUniverse.map(s => s.change); // 1-day change as proxy
  const universeVolumes = validUniverse.map(s => s.volume);

  for (const candidate of candidates) {
    const reasons: string[] = [];

    // 1. Universe percentile on 20d return
    const uniPct20d = percentileRankDescending(candidate.return20d, universeReturns20d);

    // 2. Sector percentile
    const sectorPeers = candidates.filter(c => c.sector === candidate.sector);
    const sectorReturns = sectorPeers.map(c => c.return20d);
    const secPct = sectorReturns.length > 1
      ? percentileRankDescending(candidate.return20d, sectorReturns)
      : 50;

    // 3. SPY-relative percentile
    const excessReturn20d = candidate.return20d - spyReturn20d;
    const excessReturn60d = candidate.return60d - spyReturn60d;
    const spyRelPct = percentileRankDescending(
      (excessReturn20d + excessReturn60d) / 2,
      validUniverse.map(() => 0).map((_, i) => {
        // Use candidate's excess return vs a random distribution
        return (Math.random() - 0.5) * 20; // simplified
      })
    );
    // Better SPY-relative: use percentile of excess return
    const allExcess = candidates.map(c => (c.return20d - spyReturn20d + c.return60d - spyReturn60d) / 2);
    const spyRelPctBetter = allExcess.length > 1
      ? percentileRankDescending((excessReturn20d + excessReturn60d) / 2, allExcess)
      : excessReturn20d > 0 ? 70 : 40;

    // 4. Volume percentile (liquidity rank)
    const volPct = percentileRank(candidate.volume, universeVolumes);

    // 5. Composite rank score
    // Weight: 20d momentum 35%, 60d momentum 20%, SPY-relative 25%, volume 20%
    const rank60d = percentileRankDescending(candidate.return60d, universeReturns20d);
    const rawScore =
      uniPct20d * 0.35 +
      rank60d * 0.20 +
      spyRelPctBetter * 0.25 +
      volPct * 0.20;
    const rankScore = Math.round(Math.max(0, Math.min(100, rawScore)));

    // Classifications
    const isTopDecile = rankScore >= 90;
    const isTopQuintile = rankScore >= 80;
    const isBottomQuartile = rankScore <= 25;

    // Momentum regime
    let momentumRegime: UniverseRankResult['momentumRegime'];
    if (candidate.return5d > 0 && candidate.return20d > 0 && candidate.return60d > 0 && rankScore >= 70) {
      momentumRegime = 'LEADING';
      reasons.push('Cross-timeframe lider i universit');
    } else if (candidate.return20d > 0 && rankScore >= 50) {
      momentumRegime = 'FOLLOWING';
    } else if (candidate.return20d < 0 && candidate.return60d < 0) {
      momentumRegime = 'DECLINING';
      reasons.push('Momentum negativ në 20d dhe 60d');
    } else {
      momentumRegime = 'LAGGING';
    }

    if (isTopDecile) reasons.push(`Top decile (${rankScore}/100)`);
    else if (isTopQuintile) reasons.push(`Top quintile (${rankScore}/100)`);

    if (excessReturn20d > 5) reasons.push(`Outperformon SPY me +${excessReturn20d.toFixed(1)}% (20d)`);
    if (excessReturn60d > 10) reasons.push(`Outperformon SPY me +${excessReturn60d.toFixed(1)}% (60d)`);

    results.set(candidate.symbol, {
      symbol: candidate.symbol,
      rankScore,
      universePercentile: uniPct20d,
      sectorPercentile: secPct,
      spyRelativePercentile: spyRelPctBetter,
      isTopDecile,
      isTopQuintile,
      isBottomQuartile,
      momentumRegime,
      universeSize: validUniverse.length,
      sectorSize: sectorPeers.length,
      reasons,
    });
  }

  return results;
}

/**
 * Quick universe ranking using only candidate pool (no external fetch).
 * Useful when universe data is not available.
 */
export function computeRelativeRanking(
  candidates: StockMomentumProfile[],
  spyReturn20d: number = 0,
  spyReturn60d: number = 0,
): Map<string, UniverseRankResult> {
  const results = new Map<string, UniverseRankResult>();

  if (candidates.length < 2) {
    for (const c of candidates) {
      results.set(c.symbol, {
        symbol: c.symbol, rankScore: 50, universePercentile: 50,
        sectorPercentile: 50, spyRelativePercentile: 50,
        isTopDecile: false, isTopQuintile: false, isBottomQuartile: false,
        momentumRegime: 'FOLLOWING', universeSize: candidates.length,
        sectorSize: 0, reasons: [],
      });
    }
    return results;
  }

  const all20d = candidates.map(c => c.return20d).sort((a, b) => a - b);
  const all60d = candidates.map(c => c.return60d).sort((a, b) => a - b);
  const allVol = candidates.map(c => c.volume).sort((a, b) => a - b);

  for (const c of candidates) {
    const p20d = percentileRankDescending(c.return20d, all20d);
    const p60d = percentileRankDescending(c.return60d, all60d);
    const pVol = percentileRank(c.volume, allVol);
    const excess = (c.return20d - spyReturn20d + c.return60d - spyReturn60d) / 2;
    const spyPct = excess > 0 ? Math.min(90, 50 + excess * 3) : Math.max(10, 50 + excess * 3);

    const rankScore = Math.round(Math.max(0, Math.min(100,
      p20d * 0.40 + p60d * 0.25 + spyPct * 0.25 + pVol * 0.10
    )));

    // Sector rank
    const sectorPeers = candidates.filter(x => x.sector === c.sector);
    const secPct = sectorPeers.length > 1
      ? percentileRankDescending(c.return20d, sectorPeers.map(x => x.return20d))
      : 50;

    let momentumRegime: UniverseRankResult['momentumRegime'];
    if (c.return5d > 0 && c.return20d > 0 && c.return60d > 0 && rankScore >= 70) {
      momentumRegime = 'LEADING';
    } else if (c.return20d < 0 && c.return60d < 0) {
      momentumRegime = 'DECLINING';
    } else if (rankScore >= 50) {
      momentumRegime = 'FOLLOWING';
    } else {
      momentumRegime = 'LAGGING';
    }

    const reasons: string[] = [];
    if (rankScore >= 80) reasons.push(`Rank ${rankScore}/100 — top relative performer`);
    if (excess > 5) reasons.push(`Outperformon SPY me +${excess.toFixed(1)}%`);
    if (momentumRegime === 'LEADING') reasons.push('Lider relativ në kandidatët');

    results.set(c.symbol, {
      symbol: c.symbol,
      rankScore,
      universePercentile: p20d,
      sectorPercentile: secPct,
      spyRelativePercentile: Math.round(spyPct),
      isTopDecile: rankScore >= 90,
      isTopQuintile: rankScore >= 80,
      isBottomQuartile: rankScore <= 25,
      momentumRegime,
      universeSize: candidates.length,
      sectorSize: sectorPeers.length,
      reasons,
    });
  }

  return results;
}

// ─── Feature for ML pipeline ───────────────────────────────────

export interface UniverseRankFeature {
  universe_rank_score: number;
  universe_percentile: number;
  sector_percentile: number;
  spy_relative_percentile: number;
  is_top_decile: number;
  is_top_quintile: number;
  momentum_regime: number; // 3=LEADING, 2=FOLLOWING, 1=LAGGING, 0=DECLINING
}

export function universeRankToFeatures(r: UniverseRankResult): UniverseRankFeature {
  const regimeMap: Record<string, number> = {
    LEADING: 3, FOLLOWING: 2, LAGGING: 1, DECLINING: 0,
  };
  return {
    universe_rank_score: r.rankScore,
    universe_percentile: r.universePercentile,
    sector_percentile: r.sectorPercentile,
    spy_relative_percentile: r.spyRelativePercentile,
    is_top_decile: r.isTopDecile ? 1 : 0,
    is_top_quintile: r.isTopQuintile ? 1 : 0,
    momentum_regime: regimeMap[r.momentumRegime] ?? 1,
  };
}
