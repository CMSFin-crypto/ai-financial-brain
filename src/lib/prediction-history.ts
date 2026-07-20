// ============================================================
// Prediction History — JSON file-based storage
// Stores past predictions for learning/feedback loop
// ============================================================

import fs from 'fs';
import path from 'path';

export interface StoredPrediction {
  symbol: string;
  timestamp: string;
  predictedDirection: 'UP' | 'DOWN' | 'SIDEWAYS';
  predictedScore: number;
  predictedShortTerm: { prediction: string; probability: number; expectedMove: number };
  predictedMediumTerm: { prediction: string; probability: number; expectedMove: number };
  technicalScore: number;
  fundamentalScore: number;
  indicatorScores: Record<string, number>;
  fundamentalScores?: Record<string, number>;
  closePriceAtPrediction: number;
  // Filled later when checking outcomes
  actualPriceAfter1Day?: number;
  actualPriceAfter5Days?: number;
  actualDirection1Day?: 'UP' | 'DOWN' | 'SIDEWAYS';
  actualDirection5Days?: 'UP' | 'DOWN' | 'SIDEWAYS';
  shortTermCorrect?: boolean;
  mediumTermCorrect?: boolean;
  checkedAt?: string;
  priceChange1Day?: number;
  priceChange5Days?: number;
}

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
  recentAccuracy: number;  // last 50 predictions
}

const DATA_DIR = path.join(process.cwd(), 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'prediction-history.json');
const LEARNING_FILE = path.join(DATA_DIR, 'learning-weights.json');

// Default learning weights (same as prediction engine defaults)
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

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadJSON<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as T;
    }
  } catch (err) {
    console.error(`[PRED-HISTORY] Failed to load ${filePath}:`, err);
  }
  return defaultValue;
}

function saveJSON(filePath: string, data: unknown) {
  try {
    ensureDataDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[PRED-HISTORY] Failed to save ${filePath}:`, err);
  }
}

// ============== PREDICTION HISTORY ==============

export function addPrediction(pred: StoredPrediction): void {
  const history = loadHistory();
  history.push(pred);
  // Keep last 2000 predictions
  if (history.length > 2000) {
    saveJSON(HISTORY_FILE, history.slice(-2000));
  } else {
    saveJSON(HISTORY_FILE, history);
  }
}

export function loadHistory(): StoredPrediction[] {
  return loadJSON<StoredPrediction[]>(HISTORY_FILE, []);
}

export function getPredictionsForSymbol(symbol: string): StoredPrediction[] {
  const history = loadHistory();
  return history.filter(p => p.symbol === symbol);
}

export function getUncheckedPredictions(maxAgeDays: number = 7): StoredPrediction[] {
  const history = loadHistory();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);
  return history.filter(p => {
    if (p.checkedAt) return false;
    return new Date(p.timestamp) >= cutoff;
  });
}

export function updatePredictionOutcome(
  symbol: string,
  timestamp: string,
  actualPrice: number,
  daysElapsed: number
): StoredPrediction | null {
  const history = loadHistory();
  const pred = history.find(p => p.symbol === symbol && p.timestamp === timestamp);
  if (!pred) return null;

  const origClose = pred.closePriceAtPrediction;
  const change = ((actualPrice - origClose) / origClose) * 100;

  if (daysElapsed >= 1) {
    pred.actualPriceAfter1Day = actualPrice;
    pred.priceChange1Day = Math.round(change * 100) / 100;
    pred.actualDirection1Day = change > 0.5 ? 'UP' : change < -0.5 ? 'DOWN' : 'SIDEWAYS';
    pred.shortTermCorrect = pred.predictedShortTerm.prediction === pred.actualDirection1Day;
  }
  if (daysElapsed >= 5) {
    pred.actualPriceAfter5Days = actualPrice;
    pred.priceChange5Days = Math.round(change * 100) / 100;
    pred.actualDirection5Days = change > 0.5 ? 'UP' : change < -0.5 ? 'DOWN' : 'SIDEWAYS';
    pred.mediumTermCorrect = pred.predictedMediumTerm.prediction === pred.actualDirection5Days;
  }
  pred.checkedAt = new Date().toISOString();

  saveJSON(HISTORY_FILE, history);
  return pred;
}

// ============== LEARNING STATS ==============

export function getDefaultLearningStats(): LearningStats {
  return {
    totalPredictions: 0,
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

export function loadLearningStats(): LearningStats {
  return loadJSON<LearningStats>(LEARNING_FILE, getDefaultLearningStats());
}

export function saveLearningStats(stats: LearningStats): void {
  saveJSON(LEARNING_FILE, stats);
}

/**
 * Recalculate learning stats from all checked predictions.
 * This is the CORE of the feedback loop.
 */
export function recalculateLearning(): LearningStats {
  const history = loadHistory();
  const checked = history.filter(p => p.checkedAt);

  if (checked.length < 5) {
    const stats = loadLearningStats();
    stats.totalPredictions = history.length;
    stats.checkedPredictions = checked.length;
    stats.lastUpdated = new Date().toISOString();
    saveLearningStats(stats);
    return stats;
  }

  // Count accuracy
  let shortCorrect = 0;
  let medCorrect = 0;
  let dirCorrect = 0;
  let totalError = 0;

  // Per-indicator tracking
  const indicatorTracker: Record<string, { correctWhenPositive: number; correctWhenNegative: number; totalPositive: number; totalNegative: number }> = {};
  const fundTracker: Record<string, { correctWhenPositive: number; correctWhenNegative: number; totalPositive: number; totalNegative: number }> = {};

  for (const pred of checked) {
    if (pred.shortTermCorrect !== undefined) {
      if (pred.shortTermCorrect) shortCorrect++;
    }
    if (pred.mediumTermCorrect !== undefined) {
      if (pred.mediumTermCorrect) medCorrect++;
    }

    // Direction accuracy (was the sign of the score correct?)
    const actualUp = (pred.priceChange5Days ?? pred.priceChange1Day ?? 0) > 0;
    const predictedUp = pred.predictedScore > 0;
    if (actualUp === predictedUp) dirCorrect++;

    // Absolute error
    if (pred.priceChange5Days !== undefined) {
      totalError += Math.abs(pred.priceChange5Days);
    }

    // Track per-indicator accuracy
    for (const [indicator, score] of Object.entries(pred.indicatorScores)) {
      if (!indicatorTracker[indicator]) {
        indicatorTracker[indicator] = { correctWhenPositive: 0, correctWhenNegative: 0, totalPositive: 0, totalNegative: 0 };
      }
      if (score > 10) {
        indicatorTracker[indicator].totalPositive++;
        if (actualUp) indicatorTracker[indicator].correctWhenPositive++;
      } else if (score < -10) {
        indicatorTracker[indicator].totalNegative++;
        if (!actualUp) indicatorTracker[indicator].correctWhenNegative++;
      }
    }

    // Track per-fundamental accuracy
    if (pred.fundamentalScores) {
      for (const [key, score] of Object.entries(pred.fundamentalScores)) {
        if (!fundTracker[key]) {
          fundTracker[key] = { correctWhenPositive: 0, correctWhenNegative: 0, totalPositive: 0, totalNegative: 0 };
        }
        if (score > 10) {
          fundTracker[key].totalPositive++;
          if (actualUp) fundTracker[key].correctWhenPositive++;
        } else if (score < -10) {
          fundTracker[key].totalNegative++;
          if (!actualUp) fundTracker[key].correctWhenNegative++;
        }
      }
    }
  }

  // Calculate indicator accuracies
  const indicatorAccuracy: Record<string, { correct: number; total: number; accuracy: number }> = {};
  for (const [ind, t] of Object.entries(indicatorTracker)) {
    const total = t.totalPositive + t.totalNegative;
    const correct = t.correctWhenPositive + t.correctWhenNegative;
    if (total >= 3) {
      indicatorAccuracy[ind] = { correct, total, accuracy: Math.round((correct / total) * 100) };
    }
  }

  // Calculate fundamental accuracies
  const fundamentalAccuracy: Record<string, { correct: number; total: number; accuracy: number }> = {};
  for (const [key, t] of Object.entries(fundTracker)) {
    const total = t.totalPositive + t.totalNegative;
    const correct = t.correctWhenPositive + t.correctWhenNegative;
    if (total >= 3) {
      fundamentalAccuracy[key] = { correct, total, accuracy: Math.round((correct / total) * 100) };
    }
  }

  // Calculate new weights based on accuracy
  const newTechWeights = calculateAdaptiveWeights(
    DEFAULT_TECHNICAL_WEIGHTS, indicatorAccuracy
  );
  const newFundWeights = calculateAdaptiveWeights(
    DEFAULT_FUNDAMENTAL_WEIGHTS, fundamentalAccuracy
  );

  // Recent accuracy (last 50)
  const recent = checked.slice(-50);
  let recentDirCorrect = 0;
  for (const p of recent) {
    const actualUp = (p.priceChange5Days ?? p.priceChange1Day ?? 0) > 0;
    if ((p.predictedScore > 0) === actualUp) recentDirCorrect++;
  }

  // Best/worst indicators
  const sortedIndicators = Object.entries(indicatorAccuracy)
    .filter(([, v]) => v.total >= 5)
    .sort((a, b) => b[1].accuracy - a[1].accuracy);

  const stats: LearningStats = {
    totalPredictions: history.length,
    checkedPredictions: checked.length,
    shortTermAccuracy: checked.filter(p => p.shortTermCorrect !== undefined).length > 0
      ? Math.round((shortCorrect / checked.filter(p => p.shortTermCorrect !== undefined).length) * 100)
      : 50,
    mediumTermAccuracy: checked.filter(p => p.mediumTermCorrect !== undefined).length > 0
      ? Math.round((medCorrect / checked.filter(p => p.mediumTermCorrect !== undefined).length) * 100)
      : 50,
    directionAccuracy: checked.length > 0 ? Math.round((dirCorrect / checked.length) * 100) : 50,
    indicatorAccuracy,
    fundamentalAccuracy,
    learningWeights: newTechWeights,
    fundamentalWeights: newFundWeights,
    lastUpdated: new Date().toISOString(),
    bestIndicators: sortedIndicators.slice(0, 5).map(([k]) => k),
    worstIndicators: sortedIndicators.slice(-5).reverse().map(([k]) => k),
    averageAbsoluteError: checked.filter(p => p.priceChange5Days !== undefined).length > 0
      ? Math.round((totalError / checked.filter(p => p.priceChange5Days !== undefined).length) * 100) / 100
      : 0,
    recentAccuracy: recent.length > 0 ? Math.round((recentDirCorrect / recent.length) * 100) : 50,
  };

  saveLearningStats(stats);
  return stats;
}

/**
 * Adjust weights based on accuracy history.
 * Indicators with higher accuracy get higher weights.
 * Indicators with <40% accuracy get reduced weights.
 */
function calculateAdaptiveWeights(
  defaultWeights: Record<string, number>,
  accuracyData: Record<string, { correct: number; total: number; accuracy: number }>
): Record<string, number> {
  const newWeights: Record<string, number> = {};
  let totalWeight = 0;

  for (const [key, defaultW] of Object.entries(defaultWeights)) {
    const accEntry = accuracyData[key];
    let multiplier = 1.0;

    if (accEntry !== undefined) {
      const a = accEntry.accuracy;
      if (a >= 65) multiplier = 1.5;       // Very accurate — boost
      else if (a >= 55) multiplier = 1.2;   // Above average — slight boost
      else if (a >= 45) multiplier = 1.0;   // Average — keep default
      else if (a >= 35) multiplier = 0.7;   // Below average — reduce
      else multiplier = 0.4;                 // Poor — significantly reduce
    }

    newWeights[key] = defaultW * multiplier;
    totalWeight += newWeights[key];
  }

  // Normalize to sum to 1
  if (totalWeight > 0) {
    for (const key of Object.keys(newWeights)) {
      newWeights[key] = Math.round((newWeights[key] / totalWeight) * 1000) / 1000;
    }
  }

  return newWeights;
}