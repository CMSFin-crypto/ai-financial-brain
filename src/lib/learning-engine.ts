// ============================================================
// Learning Engine — Feedback Loop
// Compares predictions with actual outcomes, triggers re-learning
// ============================================================

import { fetchHistoricalData } from './alpha-vantage';
import {
  loadHistory,
  getUncheckedPredictions,
  updatePredictionOutcome,
  recalculateLearning,
  loadLearningStats,
  type LearningStats,
  type StoredPrediction,
} from './prediction-history';

/**
 * Check unchecked predictions against current prices.
 * Called periodically to update the feedback loop.
 */
export async function checkPredictionOutcomes(): Promise<{
  checked: number;
  updated: number;
  errors: string[];
}> {
  const unchecked = getUncheckedPredictions(14); // Check predictions up to 14 days old
  let updated = 0;
  const errors: string[] = [];

  // Batch fetch current prices
  const symbols = [...new Set(unchecked.map(p => p.symbol))];

  for (const symbol of symbols) {
    try {
      const data = await fetchHistoricalData(symbol, '1mo');
      if (!data || data.length < 2) continue;

      const latestClose = data[data.length - 1].close;
      const latestDate = new Date(data[data.length - 1].date);

      // Find predictions for this symbol
      const symbolPreds = unchecked.filter(p => p.symbol === symbol);
      for (const pred of symbolPreds) {
        const predDate = new Date(pred.timestamp);
        const daysDiff = Math.floor((latestDate.getTime() - predDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysDiff < 1) continue; // Too recent to check

        const result = updatePredictionOutcome(symbol, pred.timestamp, latestClose, daysDiff);
        if (result) updated++;
      }
    } catch (err: any) {
      errors.push(`${symbol}: ${err?.message || 'gabim'}`);
    }
  }

  // Recalculate learning weights if we updated any predictions
  if (updated > 0) {
    recalculateLearning();
  }

  return { checked: unchecked.length, updated, errors: errors.slice(0, 10) };
}

/**
 * Get current learning stats and adaptive weights.
 */
export function getLearningStats(): LearningStats {
  return loadLearningStats();
}

/**
 * Get the learning weights for use in prediction engine.
 */
export function getAdaptiveWeights(): {
  technicalWeights: Record<string, number>;
  fundamentalWeights: Record<string, number>;
} {
  const stats = loadLearningStats();
  return {
    technicalWeights: stats.learningWeights,
    fundamentalWeights: stats.fundamentalWeights,
  };
}

/**
 * Get prediction accuracy summary for a symbol.
 */
export function getSymbolAccuracy(symbol: string): {
  total: number;
  checked: number;
  shortTermAcc: number;
  mediumTermAcc: number;
  avgScore: number;
  recentPredictions: StoredPrediction[];
} {
  const history = loadHistory();
  const symbolPreds = history.filter(p => p.symbol === symbol);
  const checked = symbolPreds.filter(p => p.checkedAt);

  const shortChecked = checked.filter(p => p.shortTermCorrect !== undefined);
  const medChecked = checked.filter(p => p.mediumTermCorrect !== undefined);

  return {
    total: symbolPreds.length,
    checked: checked.length,
    shortTermAcc: shortChecked.length > 0
      ? Math.round((shortChecked.filter(p => p.shortTermCorrect!).length / shortChecked.length) * 100)
      : 0,
    mediumTermAcc: medChecked.length > 0
      ? Math.round((medChecked.filter(p => p.mediumTermCorrect!).length / medChecked.length) * 100)
      : 0,
    avgScore: symbolPreds.length > 0
      ? Math.round(symbolPreds.reduce((s, p) => s + Math.abs(p.predictedScore), 0) / symbolPreds.length)
      : 0,
    recentPredictions: symbolPreds.slice(-10),
  };
}

/**
 * Get overall dashboard stats for the learning system.
 */
export function getLearningDashboard(): {
  stats: LearningStats;
  recentPredictions: StoredPrediction[];
  topPerformers: { symbol: string; accuracy: number; count: number }[];
  needsImprovement: { symbol: string; accuracy: number; count: number }[];
} {
  const stats = loadLearningStats();
  const history = loadHistory();
  const checked = history.filter(p => p.checkedAt);

  // Per-symbol accuracy
  const symbolTracker: Record<string, { correct: number; total: number }> = {};
  for (const pred of checked) {
    if (!symbolTracker[pred.symbol]) {
      symbolTracker[pred.symbol] = { correct: 0, total: 0 };
    }
    symbolTracker[pred.symbol].total++;
    const actualUp = (pred.priceChange5Days ?? pred.priceChange1Day ?? 0) > 0;
    if ((pred.predictedScore > 0) === actualUp) {
      symbolTracker[pred.symbol].correct++;
    }
  }

  const symbolAccuracies = Object.entries(symbolTracker)
    .filter(([, v]) => v.total >= 3)
    .map(([symbol, v]) => ({
      symbol,
      accuracy: Math.round((v.correct / v.total) * 100),
      count: v.total,
    }))
    .sort((a, b) => b.accuracy - a.accuracy);

  return {
    stats,
    recentPredictions: history.slice(-20).reverse(),
    topPerformers: symbolAccuracies.slice(0, 10),
    needsImprovement: symbolAccuracies.slice(-10).reverse(),
  };
}