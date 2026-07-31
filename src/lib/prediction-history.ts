// ============================================================
// Prediction History — Learning stats from DB (adapted for new schema)
// savePredictionToDB is deprecated — use save-prediction.ts instead.
// ============================================================

import prisma from './prisma';

export interface LearningStats {
  totalPredictions: number;
  checkedPredictions: number;
  shortTermAccuracy: number;
  mediumTermAccuracy: number;
  directionAccuracy: number;
  indicatorAccuracy: Record<string, { correct: number; total: number; accuracy: number }>;
  fundamentalAccuracy: Record<string, { correct: number; total: number; accuracy: number }>;
  learningWeights: Record<string, number>;
  fundamentalWeights: Record<string, number>;
  lastUpdated: string;
  bestIndicators: string[];
  worstIndicators: string[];
  averageAbsoluteError: number;
  recentAccuracy: number;
}

const DEFAULT_TECHNICAL_WEIGHTS: Record<string, number> = {
  rsi: 0.10, macdHistogram: 0.08, bollinger: 0.08, maTrend: 0.12,
  stochastic: 0.06, adx: 0.06, atr: 0.03, roc: 0.08,
  obv: 0.07, volumeConfirm: 0.07, macdCrossover: 0.05, priceChannel: 0.05,
  divergence: 0.06, vwap: 0.04, pattern: 0.05,
};

const DEFAULT_FUNDAMENTAL_WEIGHTS: Record<string, number> = {
  valuation: 0.15, growth: 0.25, profitability: 0.15,
  analystSentiment: 0.20, debtHealth: 0.10, momentum: 0.15,
};

/**
 * Load learning stats aggregated from DB.
 * Falls back to defaults if DB is empty.
 */
export async function loadLearningStats(): Promise<LearningStats> {
  try {
    const allPreds = await prisma.prediction.findMany({
      where: { wasCorrect: { not: null } },
      orderBy: { predictedAt: 'desc' },
      take: 500,
      include: { factors: true },
    });

    const total = allPreds.length;
    if (total < 3) {
      return defaultStats(total);
    }

    const correct = allPreds.filter(p => p.wasCorrect === true).length;
    let totalError = 0;

    // Per-factor tracking
    const indTracker: Record<string, { sameSide: number; total: number }> = {};
    const fundTracker: Record<string, { sameSide: number; total: number }> = {};

    for (const pred of allPreds) {
      const retPct = pred.actualReturn ?? 0;
      const actualUp = retPct > 0.1;
      totalError += Math.abs(retPct);

      for (const f of pred.factors) {
        const tracker = f.factorType === 'fundamental' ? fundTracker : indTracker;
        if (!tracker[f.factorName]) tracker[f.factorName] = { sameSide: 0, total: 0 };
        tracker[f.factorName].total++;
        const factorBullish = f.score > 0;
        if ((factorBullish && actualUp) || (!factorBullish && !actualUp)) {
          tracker[f.factorName].sameSide++;
        }
      }
    }

    const indicatorAccuracy: Record<string, { correct: number; total: number; accuracy: number }> = {};
    for (const [k, v] of Object.entries(indTracker)) {
      if (v.total >= 3) indicatorAccuracy[k] = { correct: v.sameSide, total: v.total, accuracy: Math.round((v.sameSide / v.total) * 100) };
    }

    const fundamentalAccuracy: Record<string, { correct: number; total: number; accuracy: number }> = {};
    for (const [k, v] of Object.entries(fundTracker)) {
      if (v.total >= 3) fundamentalAccuracy[k] = { correct: v.sameSide, total: v.total, accuracy: Math.round((v.sameSide / v.total) * 100) };
    }

    const learningWeights = adaptWeights(DEFAULT_TECHNICAL_WEIGHTS, indicatorAccuracy);
    const fundamentalWeights = adaptWeights(DEFAULT_FUNDAMENTAL_WEIGHTS, fundamentalAccuracy);

    const recent = allPreds.slice(0, 50);
    const recentCorrect = recent.filter(p => p.wasCorrect === true).length;

    const sortedInds = Object.entries(indicatorAccuracy)
      .filter(([, v]) => v.total >= 5)
      .sort((a, b) => b[1].accuracy - a[1].accuracy);

    return {
      totalPredictions: total,
      checkedPredictions: total,
      shortTermAccuracy: 50,
      mediumTermAccuracy: 50,
      directionAccuracy: Math.round((correct / total) * 100),
      indicatorAccuracy,
      fundamentalAccuracy,
      learningWeights,
      fundamentalWeights,
      lastUpdated: new Date().toISOString(),
      bestIndicators: sortedInds.slice(0, 5).map(([k]) => k),
      worstIndicators: sortedInds.slice(-5).reverse().map(([k]) => k),
      averageAbsoluteError: total > 0 ? Math.round((totalError / total) * 100) / 100 : 0,
      recentAccuracy: recent.length > 0 ? Math.round((recentCorrect / recent.length) * 100) : 50,
    };
  } catch (err) {
    console.error('[PRED-HISTORY] loadLearningStats failed:', err);
    return defaultStats(0);
  }
}

function adaptWeights(
  defaults: Record<string, number>,
  accuracyData: Record<string, { correct: number; total: number; accuracy: number }>,
): Record<string, number> {
  const newWeights: Record<string, number> = {};
  let total = 0;

  for (const [key, defW] of Object.entries(defaults)) {
    const acc = accuracyData[key]?.accuracy;
    let mult = 1.0;
    if (acc !== undefined) {
      if (acc >= 65) mult = 1.5;
      else if (acc >= 55) mult = 1.2;
      else if (acc >= 45) mult = 1.0;
      else if (acc >= 35) mult = 0.7;
      else mult = 0.4;
    }
    newWeights[key] = defW * mult;
    total += newWeights[key];
  }

  if (total > 0) {
    for (const key of Object.keys(newWeights)) {
      newWeights[key] = Math.round((newWeights[key] / total) * 1000) / 1000;
    }
  }
  return newWeights;
}

function defaultStats(totalPredictions: number): LearningStats {
  return {
    totalPredictions,
    checkedPredictions: 0,
    shortTermAccuracy: 50,
    mediumTermAccuracy: 50,
    directionAccuracy: 50,
    indicatorAccuracy: {},
    fundamentalAccuracy: {},
    learningWeights: { ...DEFAULT_TECHNICAL_WEIGHTS },
    fundamentalWeights: { ...DEFAULT_FUNDAMENTAL_WEIGHTS },
    lastUpdated: new Date().toISOString(),
    bestIndicators: [],
    worstIndicators: [],
    averageAbsoluteError: 0,
    recentAccuracy: 50,
  };
}
