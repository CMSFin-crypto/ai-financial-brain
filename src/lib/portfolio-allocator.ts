// ============================================================
// Portfolio Allocator — portfolio-level position sizing with
// sector caps, ticker caps, gross exposure limits, and
// correlation-aware penalties.
//
// This sits ABOVE position-sizing.ts (which handles per-trade
// Kelly sizing). The allocator enforces portfolio-level constraints.
//
// Pipeline:
//   1. Collect proposed positions (from signals)
//   2. Apply per-ticker cap (max 10% of equity)
//   3. Apply per-sector cap (max 20% of equity)
//   4. Apply gross exposure cap (max 35% if health != OK)
//   5. Apply correlation penalty vs SPY and between positions
//   6. Return final allocations with all constraint violations
// ============================================================

import prisma from './prisma';

// ─── Types ────────────────────────────────────────────────────

export type ProposedPosition = {
  symbol: string;
  sector: string;
  side: 'LONG' | 'SHORT';
  score: number;               // combined score (positive = bullish)
  kellyFraction: number;       // from position-sizing.ts
  entryPrice: number;
  stopPrice?: number;
  targetPrice?: number;
};

export type AllocationResult = {
  symbol: string;
  sector: string;
  side: 'LONG' | 'SHORT';
  rawAllocationPct: number;    // before portfolio constraints
  finalAllocationPct: number;  // after all caps
  allocationValue: number;     // in dollars
  shares: number;
  cappedBy: string[];          // which constraints reduced this
  correlationPenalty: number;
};

export type PortfolioAllocationOutput = {
  accountEquity: number;
  proposedPositions: number;
  allocatedPositions: number;
  totalGrossExposurePct: number;
  totalNetExposurePct: number;
  sectorExposure: Record<string, number>;  // sector -> % of equity
  allocations: AllocationResult[];
  warnings: string[];
};

export type AllocatorConfig = {
  accountEquity: number;
  maxTickerPct?: number;       // default 10%
  maxSectorPct?: number;       // default 20%
  maxGrossExposurePct?: number; // default 60%
  reducedGrossExposurePct?: number; // default 35% when health != OK
  healthOk?: boolean;           // from strategy-health
  spyCorrelationThreshold?: number; // default 0.7
  intraCorrelationThreshold?: number; // default 0.6
};

const DEFAULT_ALLOCATOR_CONFIG = {
  maxTickerPct: 10,
  maxSectorPct: 20,
  maxGrossExposurePct: 60,
  reducedGrossExposurePct: 35,
  healthOk: true,
  spyCorrelationThreshold: 0.7,
  intraCorrelationThreshold: 0.6,
};

// ─── Helpers ────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Estimate correlation between two return series using
* simple Pearson correlation.
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 5) return 0;

  const xSlice = x.slice(0, n);
  const ySlice = y.slice(0, n);

  const xMean = xSlice.reduce((a, b) => a + b, 0) / n;
  const yMean = ySlice.reduce((a, b) => a + b, 0) / n;

  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const xd = xSlice[i] - xMean;
    const yd = ySlice[i] - yMean;
    num += xd * yd;
    denX += xd * xd;
    denY += yd * yd;
  }

  const den = Math.sqrt(denX * denY);
  return den > 0 ? num / den : 0;
}

/**
 * Fetch recent daily returns for a set of symbols from Prediction table.
 * Falls back to zero correlation if not enough data.
 */
async function fetchReturnSeries(
  symbols: string[],
  days = 60,
): Promise<Record<string, number[]>> {
  const since = new Date(Date.now() - days * 86400000);

  const preds = await prisma.prediction.findMany({
    where: {
      symbol: { in: symbols },
      predictedAt: { gte: since },
      actualReturn: { not: null },
    },
    orderBy: { predictedAt: 'asc' },
    select: { symbol: true, actualReturn: true },
    take: 5000,
  });

  const result: Record<string, number[]> = {};
  for (const s of symbols) result[s] = [];

  for (const p of preds) {
    if (p.actualReturn != null) {
      result[p.symbol]?.push(p.actualReturn);
    }
  }

  return result;
}

// ─── Core Allocator ──────────────────────────────────────────

export async function allocatePortfolio(
  positions: ProposedPosition[],
  config: AllocatorConfig,
): Promise<PortfolioAllocationOutput> {
  const cfg = { ...DEFAULT_ALLOCATOR_CONFIG, ...config };
  const equity = cfg.accountEquity;
  const warnings: string[] = [];

  if (positions.length === 0) {
    return {
      accountEquity: equity,
      proposedPositions: 0,
      allocatedPositions: 0,
      totalGrossExposurePct: 0,
      totalNetExposurePct: 0,
      sectorExposure: {},
      allocations: [],
      warnings: ['No positions proposed'],
    };
  }

  // Determine gross exposure cap based on health
  const grossCap = cfg.healthOk ? cfg.maxGrossExposurePct : cfg.reducedGrossExposurePct;
  if (!cfg.healthOk) {
    warnings.push(`Health not OK — gross exposure capped at ${grossCap}%`);
  }

  // Fetch return series for correlation analysis
  const allSymbols = positions.map(p => p.symbol);
  const uniqueSymbols = [...new Set(allSymbols)];
  const spySymbols = [...uniqueSymbols, 'SPY'];
  const returnSeries = await fetchReturnSeries(spySymbols).catch(() => ({}));
  const spyReturns = returnSeries['SPY'] || [];

  // Pre-compute correlations vs SPY for each symbol
  const spyCorrelations: Record<string, number> = {};
  for (const sym of uniqueSymbols) {
    const symReturns = returnSeries[sym] || [];
    spyCorrelations[sym] = pearsonCorrelation(symReturns, spyReturns);
  }

  // Pre-compute intra-pair correlations for symbols in the same sector
  const pairCorrelations: Record<string, number> = {};
  const longPositions = positions.filter(p => p.side === 'LONG');
  for (let i = 0; i < longPositions.length; i++) {
    for (let j = i + 1; j < longPositions.length; j++) {
      if (longPositions[i].sector === longPositions[j].sector) {
        const ri = returnSeries[longPositions[i].symbol] || [];
        const rj = returnSeries[longPositions[j].symbol] || [];
        const corr = pearsonCorrelation(ri, rj);
        pairCorrelations[`${longPositions[i].symbol}:${longPositions[j].symbol}`] = corr;
        pairCorrelations[`${longPositions[j].symbol}:${longPositions[i].symbol}`] = corr;
      }
    }
  }

  // --- Step 1: Raw allocation from Kelly fractions ---
  // Normalize Kelly fractions to sum to desired gross exposure
  const totalKelly = positions.reduce((s, p) => s + Math.abs(p.kellyFraction), 0);
  const normalizedGross = grossCap / 100; // e.g. 0.60

  const rawAllocations: Array<AllocationResult & { _sector: string }> = positions.map(p => {
    const rawPct = totalKelly > 0
      ? (Math.abs(p.kellyFraction) / totalKelly) * normalizedGross * 100
      : 0;

    // SPY correlation penalty (reduce size for high SPY correlation)
    const spyCorr = spyCorrelations[p.symbol] || 0;
    let corrPenalty = 0;
    if (Math.abs(spyCorr) > cfg.spyCorrelationThreshold) {
      corrPenalty = (Math.abs(spyCorr) - cfg.spyCorrelationThreshold) * 2;
    }

    // Intra-sector correlation penalty
    for (const other of positions) {
      if (other.symbol === p.symbol) continue;
      if (other.sector !== p.sector) continue;
      const pairKey = `${p.symbol}:${other.symbol}`;
      const pairCorr = pairCorrelations[pairKey] || 0;
      if (pairCorr > cfg.intraCorrelationThreshold) {
        corrPenalty += (pairCorr - cfg.intraCorrelationThreshold) * 0.5;
      }
    }

    corrPenalty = Math.min(corrPenalty, 0.5); // cap at 50% reduction

    return {
      symbol: p.symbol,
      sector: p.sector,
      side: p.side,
      rawAllocationPct: Math.round(rawPct * 100) / 100,
      finalAllocationPct: 0,
      allocationValue: 0,
      shares: 0,
      cappedBy: [],
      correlationPenalty: Math.round(corrPenalty * 1000) / 1000,
      _sector: p.sector,
    };
  });

  // --- Step 2: Apply constraints iteratively ---
  const sectorExposure: Record<string, number> = {};
  let totalGrossExposure = 0;

  // Sort by raw allocation descending (highest conviction first)
  const sorted = [...rawAllocations].sort((a, b) => b.rawAllocationPct - a.rawAllocationPct);

  for (const alloc of sorted) {
    let allocPct = alloc.rawAllocationPct;
    const cappedBy: string[] = [];

    // Apply correlation penalty
    allocPct *= (1 - alloc.correlationPenalty);

    // Apply ticker cap
    if (allocPct > cfg.maxTickerPct) {
      allocPct = cfg.maxTickerPct;
      cappedBy.push('TICKER_CAP');
    }

    // Apply sector cap
    const currentSectorExposure = sectorExposure[alloc.sector] || 0;
 const remainingSectorBudget = cfg.maxSectorPct - currentSectorExposure;
    if (allocPct > remainingSectorBudget) {
      if (remainingSectorBudget > 0.5) {
        allocPct = remainingSectorBudget;
        cappedBy.push('SECTOR_CAP');
      } else {
        allocPct = 0;
        cappedBy.push('SECTOR_FULL');
      }
    }

    // Apply gross exposure cap
    const remainingGrossBudget = grossCap - totalGrossExposure;
    const allocGrossPct = alloc.side === 'LONG' ? allocPct : allocPct; // both sides count as gross
    if (allocGrossPct > remainingGrossBudget * 100) {
      allocPct = Math.max(0, remainingGrossBudget * 100);
      cappedBy.push('GROSS_EXPOSURE_CAP');
    }

    // Minimum allocation threshold
    if (allocPct < 1) {
      allocPct = 0;
      cappedBy.push('BELOW_MIN_THRESHOLD');
    }

    alloc.finalAllocationPct = Math.round(allocPct * 100) / 100;
    alloc.allocationValue = Math.round(equity * (allocPct / 100) * 100) / 100;
    alloc.shares = alloc.entryPrice > 0 ? Math.floor(alloc.allocationValue / alloc.entryPrice) : 0;
    alloc.cappedBy = cappedBy;

    // Track sector exposure
    sectorExposure[alloc.sector] = (sectorExposure[alloc.sector] || 0) + allocPct;
    totalGrossExposure += allocPct;
  }

  // Calculate net exposure (longs - shorts)
  let totalLong = 0;
  let totalShort = 0;
  for (const a of sorted) {
    if (a.side === 'LONG') totalLong += a.finalAllocationPct;
    else totalShort += a.finalAllocationPct;
  }

  // Warn if many positions were capped
  const cappedCount = sorted.filter(a => a.cappedBy.length > 0).length;
  if (cappedCount > sorted.length * 0.5) {
    warnings.push(`${cappedCount}/${sorted.length} positions were capped by constraints`);
  }

  return {
    accountEquity: equity,
    proposedPositions: positions.length,
    allocatedPositions: sorted.filter(a => a.finalAllocationPct > 0).length,
    totalGrossExposurePct: Math.round(totalGrossExposure * 100) / 100,
    totalNetExposurePct: Math.round((totalLong - totalShort) * 100) / 100,
    sectorExposure: Object.fromEntries(
      Object.entries(sectorExposure).map(([k, v]) => [k, Math.round(v * 100) / 100]),
    ),
    allocations: sorted.map(({ _sector, ...rest }) => rest as AllocationResult),
    warnings,
  };
}
