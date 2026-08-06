// ============================================================
// Sector / Regime Edge Leaderboard
//
// Highlights where the system truly has edge so you can focus
// on the profitable environments.
//
// Computes:
//   - Best/worst sectors by accuracy, return, alpha
//   - Best/worst regimes by accuracy, return, alpha
//   - Avg return and accuracy by environment
//   - Recommended trade filters based on edge
// ============================================================

import prisma from './prisma';

// ─── Types ──────────────────────────────────────────────────

export interface EnvironmentEntry {
  name: string;
  sampleSize: number;
  accuracy: number;
  avgReturn: number;
  avgBenchmarkReturn: number | null;
  alpha: number | null;
  noTradeRate: number;
  buyRate: number;
  sellRate: number;
  avgConfidence: number;
  sharpeLike: number | null;
  edge: 'strong' | 'moderate' | 'weak' | 'negative' | 'insufficient';
  recommendedAction: string;
}

export interface EdgeLeaderboardResult {
  computedAt: string;
  sectors: {
    ranked: EnvironmentEntry[];
    best: string | null;
    worst: string | null;
    filter: string;
  };
  regimes: {
    ranked: EnvironmentEntry[];
    best: string | null;
    worst: string | null;
    filter: string;
  };
  horizonBreakdown: {
    horizonDays: number;
    sampleSize: number;
    accuracy: number;
    avgReturn: number;
    alpha: number | null;
  }[];
  tradeFilters: TradeFilter[];
}

export interface TradeFilter {
  dimension: 'sector' | 'regime';
  name: string;
  action: 'PREFER' | 'AVOID' | 'REDUCE_SIZE' | 'NORMAL';
  reason: string;
  accuracyThreshold: number;
  actualAccuracy: number;
  sampleSize: number;
}

// ─── Edge classification thresholds ──────────────────────────

const STRONG_EDGE_ACCURACY = 65;
const MODERATE_EDGE_ACCURACY = 55;
const WEAK_EDGE_ACCURACY = 48;
const MIN_SAMPLES_EDGE = 15;
const MIN_SAMPLES_STRONG = 40;

// ─── Main: Compute Edge Leaderboard ─────────────────────────

export async function computeEdgeLeaderboard(): Promise<EdgeLeaderboardResult> {
  const computedAt = new Date().toISOString();

  // 1. Sector leaderboard
  const sectors = await computeEnvironmentLeaderboard('sector');

  // 2. Regime leaderboard
  const regimes = await computeEnvironmentLeaderboard('regime');

  // 3. Horizon breakdown
  const horizonBreakdown = await computeHorizonBreakdown();

  // 4. Trade filters
  const tradeFilters = generateTradeFilters(sectors.ranked, regimes.ranked);

  return {
    computedAt,
    sectors,
    regimes,
    horizonBreakdown,
    tradeFilters,
  };
}

// ─── Environment leaderboard (works for both sector & regime) ─

async function computeEnvironmentLeaderboard(
  dimension: 'sector' | 'regime',
): Promise<{
  ranked: EnvironmentEntry[];
  best: string | null;
  worst: string | null;
  filter: string;
}> {
  const field = dimension === 'sector' ? 'sector' : 'regime';

  const predictions = await prisma.prediction.findMany({
    where: {
      evaluationStatus: 'EVALUATED',
      [field]: { not: null },
    },
    select: {
      [field]: true,
      wasCorrect: true,
      actualReturn: true,
      benchmarkReturn: true,
      excessReturn: true,
      finalDecision: true,
      calibratedConfidence: true,
      horizonDays: true,
    },
  });

  // Group by dimension value
  const groups: Record<string, {
    correct: number;
    total: number;
    returns: number[];
    benchmarkReturns: number[];
    alphas: number[];
    noTrade: number;
    buy: number;
    sell: number;
    confidences: number[];
  }> = {};

  for (const p of predictions) {
    const key = (p as any)[field] as string;
    if (!key) continue;
    if (!groups[key]) {
      groups[key] = { correct: 0, total: 0, returns: [], benchmarkReturns: [], alphas: [], noTrade: 0, buy: 0, sell: 0, confidences: [] };
    }
    const g = groups[key];
    g.total++;
    if (p.wasCorrect === true) g.correct++;
    if (p.actualReturn !== null) g.returns.push(p.actualReturn);
    if (p.benchmarkReturn !== null) g.benchmarkReturns.push(p.benchmarkReturn);
    if (p.excessReturn !== null) g.alphas.push(p.excessReturn);
    if (p.finalDecision === 'NO_TRADE') g.noTrade++;
    else if (p.finalDecision === 'BUY') g.buy++;
    else if (p.finalDecision === 'SELL') g.sell++;
    if (p.calibratedConfidence != null) g.confidences.push(p.calibratedConfidence);
  }

  const entries: EnvironmentEntry[] = Object.entries(groups)
    .filter(([, g]) => g.total >= 5)
    .map(([name, g]) => {
      const accuracy = Math.round((g.correct / g.total) * 1000) / 10;
      const avgReturn = g.returns.length > 0
        ? Math.round((g.returns.reduce((a, b) => a + b, 0) / g.returns.length) * 100) / 100
        : 0;
      const avgBenchmark = g.benchmarkReturns.length > 0
        ? Math.round((g.benchmarkReturns.reduce((a, b) => a + b, 0) / g.benchmarkReturns.length) * 100) / 100
        : null;
      const alpha = g.alphas.length > 0
        ? Math.round((g.alphas.reduce((a, b) => a + b, 0) / g.alphas.length) * 100) / 100
        : null;
      const avgConf = g.confidences.length > 0
        ? Math.round((g.confidences.reduce((a, b) => a + b, 0) / g.confidences.length) * 10) / 10
        : 0;

      // Sharpe-like: mean return / std return (annualized proxy)
      let sharpeLike: number | null = null;
      if (g.returns.length >= 5) {
        const mean = g.returns.reduce((a, b) => a + b, 0) / g.returns.length;
        const variance = g.returns.reduce((s, r) => s + (r - mean) ** 2, 0) / g.returns.length;
        const std = Math.sqrt(variance);
        if (std > 0) {
          sharpeLike = Math.round((mean / std) * Math.sqrt(252) * 100) / 100;
        }
      }

      // Edge classification
      let edge: EnvironmentEntry['edge'] = 'insufficient';
      if (g.total >= MIN_SAMPLES_STRONG && accuracy >= STRONG_EDGE_ACCURACY) {
        edge = 'strong';
      } else if (g.total >= MIN_SAMPLES_EDGE && accuracy >= MODERATE_EDGE_ACCURACY) {
        edge = 'moderate';
      } else if (g.total >= MIN_SAMPLES_EDGE && accuracy >= WEAK_EDGE_ACCURACY) {
        edge = 'weak';
      } else if (g.total >= MIN_SAMPLES_EDGE) {
        edge = 'negative';
      }

      // Recommended action
      let recommendedAction: string;
      if (edge === 'strong') recommendedAction = 'Increase position size and scan frequency';
      else if (edge === 'moderate') recommendedAction = 'Normal trading with standard sizing';
      else if (edge === 'weak') recommendedAction = 'Reduce position size, require higher confidence';
      else if (edge === 'negative') recommendedAction = 'Avoid or paper-trade only';
      else recommendedAction = 'Insufficient data — gather more samples';

      return {
        name,
        sampleSize: g.total,
        accuracy,
        avgReturn,
        avgBenchmarkReturn: avgBenchmark,
        alpha,
        noTradeRate: Math.round((g.noTrade / g.total) * 1000) / 10,
        buyRate: Math.round((g.buy / g.total) * 1000) / 10,
        sellRate: Math.round((g.sell / g.total) * 1000) / 10,
        avgConfidence: avgConf,
        sharpeLike,
        edge,
        recommendedAction,
      };
    })
    .sort((a, b) => b.accuracy - a.accuracy);

  const best = entries.length > 0 && entries[0].sampleSize >= MIN_SAMPLES_EDGE ? entries[0].name : null;
  const worst = entries.length > 0 && entries[entries.length - 1].sampleSize >= MIN_SAMPLES_EDGE ? entries[entries.length - 1].name : null;

  const filter = best && worst
    ? `Prefer ${best} signals, reduce ${worst} exposure`
    : 'Not enough data to recommend filters';

  return { ranked: entries, best, worst, filter };
}

// ─── Horizon breakdown ──────────────────────────────────────

async function computeHorizonBreakdown(): Promise<{
  horizonDays: number;
  sampleSize: number;
  accuracy: number;
  avgReturn: number;
  alpha: number | null;
}[]> {
 const horizons = [1, 5, 20];
  const result = [];

  for (const h of horizons) {
    const preds = await prisma.prediction.findMany({
      where: { evaluationStatus: 'EVALUATED', horizonDays: h, wasCorrect: { not: null } },
      select: { wasCorrect: true, actualReturn: true, excessReturn: true },
    });

    const total = preds.length;
    const correct = preds.filter(p => p.wasCorrect === true).length;
    const returns = preds.map(p => p.actualReturn).filter((r): r is number => r !== null);
    const alphas = preds.map(p => p.excessReturn).filter((a): a is number => a !== null);

    result.push({
      horizonDays: h,
      sampleSize: total,
      accuracy: total > 0 ? Math.round((correct / total) * 1000) / 10 : 0,
      avgReturn: returns.length > 0 ? Math.round((returns.reduce((a, b) => a + b, 0) / returns.length) * 100) / 100 : 0,
      alpha: alphas.length > 0 ? Math.round((alphas.reduce((a, b) => a + b, 0) / alphas.length) * 100) / 100 : null,
    });
  }

  return result;
}

// ─── Generate trade filters ─────────────────────────────────

function generateTradeFilters(
  sectorEntries: EnvironmentEntry[],
  regimeEntries: EnvironmentEntry[],
): TradeFilter[] {
  const filters: TradeFilter[] = [];

  for (const s of sectorEntries) {
    if (s.sampleSize < MIN_SAMPLES_EDGE) continue;

    if (s.edge === 'strong') {
      filters.push({
        dimension: 'sector', name: s.name, action: 'PREFER',
        reason: `${s.name}: ${s.accuracy}% accuracy over ${s.sampleSize} predictions (strong edge)`,
        accuracyThreshold: STRONG_EDGE_ACCURACY, actualAccuracy: s.accuracy, sampleSize: s.sampleSize,
      });
    } else if (s.edge === 'negative') {
      filters.push({
        dimension: 'sector', name: s.name, action: 'AVOID',
        reason: `${s.name}: ${s.accuracy}% accuracy over ${s.sampleSize} predictions (no edge)`,
        accuracyThreshold: WEAK_EDGE_ACCURACY, actualAccuracy: s.accuracy, sampleSize: s.sampleSize,
      });
    } else if (s.edge === 'weak') {
      filters.push({
        dimension: 'sector', name: s.name, action: 'REDUCE_SIZE',
        reason: `${s.name}: ${s.accuracy}% accuracy — weak edge, reduce position sizing`,
        accuracyThreshold: MODERATE_EDGE_ACCURACY, actualAccuracy: s.accuracy, sampleSize: s.sampleSize,
      });
    }
  }

  for (const r of regimeEntries) {
    if (r.sampleSize < MIN_SAMPLES_EDGE) continue;

    if (r.edge === 'strong') {
      filters.push({
        dimension: 'regime', name: r.name, action: 'PREFER',
        reason: `${r.name}: ${r.accuracy}% accuracy over ${r.sampleSize} predictions (strong edge)`,
        accuracyThreshold: STRONG_EDGE_ACCURACY, actualAccuracy: r.accuracy, sampleSize: r.sampleSize,
      });
    } else if (r.edge === 'negative') {
      filters.push({
        dimension: 'regime', name: r.name, action: 'AVOID',
        reason: `${r.name}: ${r.accuracy}% accuracy over ${r.sampleSize} predictions (no edge)`,
        accuracyThreshold: WEAK_EDGE_ACCURACY, actualAccuracy: r.accuracy, sampleSize: r.sampleSize,
      });
    } else if (r.edge === 'weak') {
      filters.push({
        dimension: 'regime', name: r.name, action: 'REDUCE_SIZE',
        reason: `${r.name}: ${r.accuracy}% accuracy — weak edge, use caution`,
        accuracyThreshold: MODERATE_EDGE_ACCURACY, actualAccuracy: r.accuracy, sampleSize: r.sampleSize,
      });
    }
  }

  return filters.sort((a, b) => {
    const order = { AVOID: 0, REDUCE_SIZE: 1, NORMAL: 2, PREFER: 3 };
    return (order[a.action] ?? 2) - (order[b.action] ?? 2);
  });
}
