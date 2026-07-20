// ═══════════════════════════════════════════════════════════════
// INDICATOR LEARNING ENGINE — Mëson nga historia e parashikimeve
// Funksionon në Vercel pa database (in-memory + JSON file)
//
// Çfarë bën:
// 1. Regjistron çdo parashikim me pikët e TË GJITHË indikatorëve
// 2. Vlerëson saktesinë duke krahasuar me çmimet aktuale
// 3. Llogarit saktesinë PER INDIKATOR — cilit i beson më shumë
// 4. Rregullon peshat bazuar në historinë e saktesisë
// ═══════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fetchHistoricalData } from '@/lib/alpha-vantage';

// ─── Types ───────────────────────────────────────────────────

export interface IndicatorPredictionRecord {
  id: string;
  ticker: string;
  timestamp: string;
  priceAtPrediction: number;
  // Technical indicator scores (-100 to +100)
  technicalScores: Record<string, number>;
  technicalDirection: string;  // UP/DOWN/SIDEWAYS
  technicalScore: number;
  // Fundamental factor scores
  fundamentalScores: Record<string, number> | null;
  fundamentalDirection: string; // BULLISH/BEARISH/NEUTRAL
  fundamentalScore: number;
  // Combined
  totalScore: number;
  direction: string;
  confidence: number;
  // Evaluation (filled later)
  actualPrice?: number;
  actualChangePercent?: number;
  evaluatedAt?: string;
  wasCorrect?: boolean;
  perIndicatorCorrect?: Record<string, boolean>;
}

export interface IndicatorAccuracy {
  indicator: string;
  totalPredictions: number;
  correctPredictions: number;
  accuracy: number;          // 0-1
  avgScoreWhenCorrect: number;
  avgScoreWhenWrong: number;
  weight: number;            // adjusted weight (0-1, relative)
  type: 'technical' | 'fundamental';
  description: string;       // Albanian description
}

export interface LearningSnapshot {
  // Per-indicator accuracy
  indicatorAccuracies: Record<string, IndicatorAccuracy>;
  // Global stats
  totalRecorded: number;
  totalEvaluated: number;
  totalCorrect: number;
  overallAccuracy: number;
  // Per-ticker stats
  tickerAccuracy: Record<string, { total: number; correct: number; accuracy: number }>;
  // Learned weight multipliers (applied to base weights)
  weightMultipliers: Record<string, number>;
  // Lessons
  lessons: Array<{
    id: string;
    category: string;
    message: string;
    severity: number;
    createdAt: string;
  }>;
  // Metadata
  lastEvaluatedAt: string;
  lastUpdatedAt: string;
  version: number;
}

// ─── Constants ──────────────────────────────────────────────

const DATA_DIR = '/tmp/ai-financial-brain';
const DATA_FILE = path.join(DATA_DIR, 'indicator-learning.json');
const MAX_RECORDS = 2000; // Keep last 2000 predictions in memory
const EVALUATION_MIN_DAYS = 1; // Min days before evaluating
const EVALUATION_MAX_DAYS = 10; // Max days to look back

// Albanian names for indicators
const INDICATOR_NAMES: Record<string, string> = {
  rsi: 'RSI (Indeksi i Forcës Relative)',
  macdHistogram: 'Histogrami MACD',
  bollinger: 'Bollinger Bands',
  maTrend: 'Trendi i Mesatareve Mobile',
  stochastic: 'Stokastiku',
  adx: 'ADX (Indeksi i Drejtimit Mesatar)',
  atr: 'ATR (Rreziku i Volatilitetit)',
  roc: 'ROC (Shkalla e Ndryshimit)',
  obv: 'OBV (Volumi në Balancë)',
  volumeConfirm: 'Konfirmimi i Volumit',
  macdCrossover: 'Kryqëzimi MACD',
  priceChannel: 'Kanali i Çmimeve',
  divergence: 'Divergjenca',
  vwap: 'VWAP (Çmimi Mesatar i Ponderuar)',
  pattern: 'Modeli i Qirinjëve',
  // Fundamental
  valuation: 'Vlerësimi (PE, PEG, P/B)',
  growth: 'Rritja (Të ardhura, Fitimet)',
  profitability: 'Rentabiliteti (Marzha, ROE)',
  financialHealth: 'Shëndeti Financiar (D/E)',
  analystConsensus: 'Konsensusi i Analistëve',
};

// ─── In-Memory Store ────────────────────────────────────────

let records: IndicatorPredictionRecord[] = [];
let snapshot: LearningSnapshot = createEmptySnapshot();
let isLoaded = false;

function createEmptySnapshot(): LearningSnapshot {
  return {
    indicatorAccuracies: {},
    totalRecorded: 0,
    totalEvaluated: 0,
    totalCorrect: 0,
    overallAccuracy: 0,
    tickerAccuracy: {},
    weightMultipliers: {},
    lessons: [],
    lastEvaluatedAt: '',
    lastUpdatedAt: new Date().toISOString(),
    version: 1,
  };
}

// ─── Persistence ────────────────────────────────────────────

function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch {
    // /tmp should always be writable
  }
}

function loadFromDisk(): void {
  try {
    ensureDataDir();
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (data.snapshot) {
        snapshot = data.snapshot;
      }
      if (data.records && Array.isArray(data.records)) {
        records = data.records.slice(-MAX_RECORDS);
      }
      console.log(`[LEARN] Loaded ${records.length} records and ${Object.keys(snapshot.indicatorAccuracies).length} indicator accuracies from disk`);
    }
  } catch (err: any) {
    console.log(`[LEARN] Could not load from disk: ${err.message}`);
    snapshot = createEmptySnapshot();
    records = [];
  }
  isLoaded = true;
}

function saveToDisk(): void {
  try {
    ensureDataDir();
    const data = {
      snapshot,
      records: records.slice(-MAX_RECORDS),
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err: any) {
    console.log(`[LEARN] Could not save to disk: ${err.message}`);
  }
}

// Initialize on first use
function ensureLoaded(): void {
  if (!isLoaded) {
    loadFromDisk();
  }
}

// ─── 1. RECORD PREDICTION ───────────────────────────────────

export function recordPrediction(data: {
  ticker: string;
  priceAtPrediction: number;
  technicalScores: Record<string, number>;
  technicalDirection: string;
  technicalScore: number;
  fundamentalScores?: Record<string, number> | null;
  fundamentalDirection?: string;
  fundamentalScore?: number;
  totalScore: number;
  direction: string;
  confidence: number;
}): void {
  ensureLoaded();

  const record: IndicatorPredictionRecord = {
    id: `${data.ticker}_${Date.now()}`,
    ticker: data.ticker,
    timestamp: new Date().toISOString(),
    priceAtPrediction: data.priceAtPrediction,
    technicalScores: data.technicalScores,
    technicalDirection: data.technicalDirection,
    technicalScore: data.technicalScore,
    fundamentalScores: data.fundamentalScores || null,
    fundamentalDirection: data.fundamentalDirection || 'NEUTRAL',
    fundamentalScore: data.fundamentalScore || 0,
    totalScore: data.totalScore,
    direction: data.direction,
    confidence: data.confidence,
  };

  records.push(record);

  // Trim to max
  if (records.length > MAX_RECORDS) {
    records = records.slice(-MAX_RECORDS);
  }

  snapshot.totalRecorded++;
  snapshot.lastUpdatedAt = new Date().toISOString();

  // Save periodically (every 10 records)
  if (snapshot.totalRecorded % 10 === 0) {
    saveToDisk();
  }

  console.log(`[LEARN] Recorded prediction: ${data.ticker} ${data.direction} (score: ${data.totalScore}, price: $${data.priceAtPrediction})`);
}

// ─── 2. RECORD FROM HYBRID RESULT ───────────────────────────

export function recordFromHybridResult(
  ticker: string,
  result: {
    score: number;
    direction: string;
    confidence: number;
    indicatorScores: Record<string, number>;
    fundamentalScore?: { score: number; signal: string; factors: Record<string, { score: number }> } | null;
    fundamentalAvailable?: boolean;
    totalScore?: number;
    shortTerm?: { prediction: string };
    mediumTerm?: { prediction: string };
  }
): void {
  const predPrice = 0; // Will be filled during evaluation

  // Determine technical direction
  let techDir = 'SIDEWAYS';
  if (result.shortTerm?.prediction === 'UP' || result.mediumTerm?.prediction === 'UP') techDir = 'UP';
  else if (result.shortTerm?.prediction === 'DOWN' || result.mediumTerm?.prediction === 'DOWN') techDir = 'DOWN';

  // Extract fundamental factor scores
  let fundScores: Record<string, number> | null = null;
  let fundDir = 'NEUTRAL';
  let fundTotalScore = 0;

  if (result.fundamentalScore && result.fundamentalAvailable) {
    fundScores = {};
    fundDir = result.fundamentalScore.signal;
    fundTotalScore = result.fundamentalScore.score;
    for (const [key, factor] of Object.entries(result.fundamentalScore.factors)) {
      fundScores[key] = factor.score;
    }
  }

  recordPrediction({
    ticker,
    priceAtPrediction: 0, // Will be updated when we have price data
    technicalScores: result.indicatorScores,
    technicalDirection: techDir,
    technicalScore: result.score,
    fundamentalScores: fundScores,
    fundamentalDirection: fundDir,
    fundamentalScore: fundTotalScore,
    totalScore: result.totalScore ?? result.score,
    direction: result.direction,
    confidence: result.confidence,
  });
}

// ─── 3. EVALUATE PREDICTIONS ────────────────────────────────

export async function evaluatePredictions(): Promise<{
  evaluated: number;
  correct: number;
  newLessons: number;
  indicatorAccuracyUpdated: boolean;
}> {
  ensureLoaded();

  // Find unevaluated records that are old enough
  const now = Date.now();
  const minAge = EVALUATION_MIN_DAYS * 24 * 60 * 60 * 1000;
  const maxAge = EVALUATION_MAX_DAYS * 24 * 60 * 60 * 1000;

  const toEvaluate = records.filter(r => {
    if (r.evaluatedAt) return false;
    if (r.priceAtPrediction <= 0) return false;
    const age = now - new Date(r.timestamp).getTime();
    return age >= minAge && age <= maxAge;
  });

  if (toEvaluate.length === 0) {
    return { evaluated: 0, correct: 0, newLessons: 0, indicatorAccuracyUpdated: false };
  }

  // Get unique tickers
  const tickers = [...new Set(toEvaluate.map(r => r.ticker))];
  console.log(`[LEARN] Evaluating ${toEvaluate.length} predictions for ${tickers.length} tickers...`);

  // Fetch current prices
  const actualPrices: Record<string, number> = {};
  for (let i = 0; i < tickers.length; i += 6) {
    const batch = tickers.slice(i, i + 6);
    const promises = batch.map(async (t) => {
      try {
        // Fetch 1-day data to get latest close
        const data = await fetchHistoricalData(t, '5d');
        if (data && data.length > 0) {
          return { ticker: t, price: data[data.length - 1].close };
        }
      } catch {
        // ignore
      }
      return null;
    });
    const results = await Promise.allSettled(promises);
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        actualPrices[r.value.ticker] = r.value.price;
      }
    }
    if (i + 6 < tickers.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Evaluate each prediction
  let evaluated = 0;
  let correct = 0;
  let newLessons = 0;

  for (const record of toEvaluate) {
    const actual = actualPrices[record.ticker];
    if (!actual) continue;

    const change = ((actual - record.priceAtPrediction) / record.priceAtPrediction) * 100;
    record.actualPrice = actual;
    record.actualChangePercent = Math.round(change * 100) / 100;
    record.evaluatedAt = new Date().toISOString();

    // Was the overall prediction correct?
    const predictedUp = record.direction === 'STRONG_BUY' || record.direction === 'BUY' ||
                       record.totalScore > 15;
    const predictedDown = record.direction === 'STRONG_SELL' || record.direction === 'SELL' ||
                         record.totalScore < -15;
    const actualUp = change > 0.5;
    const actualDown = change < -0.5;

    record.wasCorrect = (predictedUp && actualUp) || (predictedDown && actualDown) ||
                        (!predictedUp && !predictedDown && Math.abs(change) <= 0.5);

    if (record.wasCorrect) correct++;

    // Per-indicator correctness
    record.perIndicatorCorrect = {};

    // Technical indicators
    for (const [indicator, score] of Object.entries(record.technicalScores)) {
      const predictedBullish = score > 10;
      const predictedBearish = score < -10;
      const indicatorCorrect = (predictedBullish && actualUp) || (predictedBearish && actualDown) ||
                               (!predictedBullish && !predictedBearish);
      record.perIndicatorCorrect[indicator] = indicatorCorrect;
    }

    // Fundamental factors
    if (record.fundamentalScores) {
      for (const [factor, score] of Object.entries(record.fundamentalScores)) {
        const predictedBullish = score > 10;
        const predictedBearish = score < -10;
        const factorCorrect = (predictedBullish && actualUp) || (predictedBearish && actualDown) ||
                              (!predictedBullish && !predictedBearish);
        record.perIndicatorCorrect[`fund_${factor}`] = factorCorrect;
      }
    }

    evaluated++;
  }

  // Recalculate indicator accuracies
  recalculateIndicatorAccuracies();

  // Extract lessons
  newLessons = extractLessons();

  // Update snapshot
  snapshot.totalEvaluated = records.filter(r => r.evaluatedAt).length;
  snapshot.totalCorrect = records.filter(r => r.wasCorrect).length;
  snapshot.overallAccuracy = snapshot.totalEvaluated > 0
    ? snapshot.totalCorrect / snapshot.totalEvaluated
    : 0;
  snapshot.lastEvaluatedAt = new Date().toISOString();
  snapshot.lastUpdatedAt = new Date().toISOString();

  // Calculate weight multipliers
  calculateWeightMultipliers();

  // Save
  saveToDisk();

  console.log(`[LEARN] Evaluation complete: ${evaluated} evaluated, ${correct} correct (${((correct/evaluated)*100).toFixed(1)}%), ${newLessons} lessons`);

  return { evaluated, correct, newLessons, indicatorAccuracyUpdated: true };
}

// ─── 4. RECALCULATE INDICATOR ACCURACIES ────────────────────

function recalculateIndicatorAccuracies(): void {
  const evaluated = records.filter(r => r.evaluatedAt && r.perIndicatorCorrect);
  if (evaluated.length < 5) {
    console.log(`[LEARN] Not enough evaluated records (${evaluated.length}) to calculate accuracies`);
    return;
  }

  // Technical indicators
  const techIndicators = [
    'rsi', 'macdHistogram', 'bollinger', 'maTrend', 'stochastic',
    'adx', 'atr', 'roc', 'obv', 'volumeConfirm',
    'macdCrossover', 'priceChannel', 'divergence', 'vwap', 'pattern',
  ];

  for (const ind of techIndicators) {
    const relevantRecords = evaluated.filter(r => r.technicalScores[ind] !== undefined && r.perIndicatorCorrect[ind] !== undefined);
    if (relevantRecords.length < 3) continue;

    const correctCount = relevantRecords.filter(r => r.perIndicatorCorrect![ind]).length;
    const correctRecords = relevantRecords.filter(r => r.perIndicatorCorrect![ind]);
    const wrongRecords = relevantRecords.filter(r => !r.perIndicatorCorrect![ind]);

    const avgScoreCorrect = correctRecords.length > 0
      ? correctRecords.reduce((s, r) => s + (r.technicalScores[ind] || 0), 0) / correctRecords.length
      : 0;
    const avgScoreWrong = wrongRecords.length > 0
      ? wrongRecords.reduce((s, r) => s + (r.technicalScores[ind] || 0), 0) / wrongRecords.length
      : 0;

    snapshot.indicatorAccuracies[ind] = {
      indicator: ind,
      totalPredictions: relevantRecords.length,
      correctPredictions: correctCount,
      accuracy: correctCount / relevantRecords.length,
      avgScoreWhenCorrect: Math.round(avgScoreCorrect * 100) / 100,
      avgScoreWhenWrong: Math.round(avgScoreWrong * 100) / 100,
      weight: 0, // Will be calculated in calculateWeightMultipliers
      type: 'technical',
      description: INDICATOR_NAMES[ind] || ind,
    };
  }

  // Fundamental factors
  const fundFactors = ['valuation', 'growth', 'profitability', 'financialHealth', 'analystConsensus'];
  for (const factor of fundFactors) {
    const key = `fund_${factor}`;
    const relevantRecords = evaluated.filter(r => r.fundamentalScores?.[factor] !== undefined && r.perIndicatorCorrect[key] !== undefined);
    if (relevantRecords.length < 3) continue;

    const correctCount = relevantRecords.filter(r => r.perIndicatorCorrect![key]).length;
    const correctRecords = relevantRecords.filter(r => r.perIndicatorCorrect![key]);
    const wrongRecords = relevantRecords.filter(r => !r.perIndicatorCorrect![key]);

    const avgScoreCorrect = correctRecords.length > 0
      ? correctRecords.reduce((s, r) => s + (r.fundamentalScores?.[factor] || 0), 0) / correctRecords.length
      : 0;
    const avgScoreWrong = wrongRecords.length > 0
      ? wrongRecords.reduce((s, r) => s + (r.fundamentalScores?.[factor] || 0), 0) / wrongRecords.length
      : 0;

    snapshot.indicatorAccuracies[key] = {
      indicator: factor,
      totalPredictions: relevantRecords.length,
      correctPredictions: correctCount,
      accuracy: correctCount / relevantRecords.length,
      avgScoreWhenCorrect: Math.round(avgScoreCorrect * 100) / 100,
      avgScoreWhenWrong: Math.round(avgScoreWrong * 100) / 100,
      weight: 0,
      type: 'fundamental',
      description: INDICATOR_NAMES[factor] || factor,
    };
  }

  // Per-ticker accuracy
  const tickerGroups: Record<string, { total: number; correct: number }> = {};
  for (const r of evaluated) {
    if (!tickerGroups[r.ticker]) tickerGroups[r.ticker] = { total: 0, correct: 0 };
    tickerGroups[r.ticker].total++;
    if (r.wasCorrect) tickerGroups[r.ticker].correct++;
  }
  for (const [ticker, stats] of Object.entries(tickerGroups)) {
    snapshot.tickerAccuracy[ticker] = {
      total: stats.total,
      correct: stats.correct,
      accuracy: stats.total > 0 ? stats.correct / stats.total : 0,
    };
  }
}

// ─── 5. CALCULATE WEIGHT MULTIPLIERS ───────────────────────

function calculateWeightMultipliers(): void {
  const accuracies = snapshot.indicatorAccuracies;
  const entries = Object.values(accuracies);

  if (entries.length === 0) return;

  // Calculate multipliers based on accuracy
  // Formula: multiplier = 0.5 + accuracy (so range is 0.5 to 1.5)
  // If accuracy < 0.4, reduce weight (multiplier < 0.9)
  // If accuracy > 0.6, increase weight (multiplier > 1.1)
  // If accuracy = 0.5, keep same (multiplier = 1.0)

  for (const entry of entries) {
    const acc = entry.accuracy;
    // Sigmoid-like adjustment centered at 0.5
    const multiplier = 0.5 + acc;
    // Clamp between 0.3 (very unreliable) and 1.7 (very reliable)
    entry.weight = Math.round(Math.max(0.3, Math.min(1.7, multiplier)) * 100) / 100;
    snapshot.weightMultipliers[entry.indicator] = entry.weight;
  }

  // Normalize weights so average is 1.0
  const avgMultiplier = entries.reduce((s, e) => s + e.weight, 0) / entries.length;
  if (avgMultiplier > 0) {
    for (const entry of entries) {
      entry.weight = Math.round((entry.weight / avgMultiplier) * 100) / 100;
      snapshot.weightMultipliers[entry.indicator] = entry.weight;
    }
  }

  console.log(`[LEARN] Weight multipliers calculated for ${entries.length} indicators (avg accuracy: ${(entries.reduce((s,e) => s + e.accuracy, 0) / entries.length * 100).toFixed(1)}%)`);
}

// ─── 6. GET ADJUSTED WEIGHTS ────────────────────────────────

export function getAdjustedWeights(): Record<string, number> {
  ensureLoaded();

  // Base weights for technical indicators
  const baseWeights: Record<string, number> = {
    rsi: 0.10,
    macdHistogram: 0.08,
    bollinger: 0.08,
    maTrend: 0.12,
    stochastic: 0.06,
    adx: 0.06,
    atr: 0.03,
    roc: 0.08,
    obv: 0.07,
    volumeConfirm: 0.07,
    macdCrossover: 0.05,
    priceChannel: 0.05,
    divergence: 0.06,
    vwap: 0.04,
    pattern: 0.05,
  };

  // If no learning data yet, return base weights
  if (Object.keys(snapshot.weightMultipliers).length === 0) {
    return baseWeights;
  }

  // Apply multipliers
  const adjusted: Record<string, number> = {};
  for (const [key, baseWeight] of Object.entries(baseWeights)) {
    const multiplier = snapshot.weightMultipliers[key] ?? 1.0;
    adjusted[key] = baseWeight * multiplier;
  }

  // Normalize so total = 1.0
  const total = Object.values(adjusted).reduce((s, w) => s + w, 0);
  if (total > 0) {
    for (const key of Object.keys(adjusted)) {
      adjusted[key] = Math.round((adjusted[key] / total) * 1000) / 1000;
    }
  }

  return adjusted;
}

// ─── 7. GET FUNDAMENTAL WEIGHT ADJUSTMENTS ──────────────────

export function getFundamentalWeightAdjustments(): Record<string, number> {
  ensureLoaded();

  const baseFundWeights: Record<string, number> = {
    valuation: 0.25,
    growth: 0.25,
    profitability: 0.20,
    financialHealth: 0.15,
    analystConsensus: 0.15,
  };

  if (Object.keys(snapshot.weightMultipliers).length === 0) {
    return baseFundWeights;
  }

  const adjusted: Record<string, number> = {};
  for (const [key, baseWeight] of Object.entries(baseFundWeights)) {
    const fundKey = `fund_${key}`;
    const multiplier = snapshot.weightMultipliers[fundKey] ?? 1.0;
    adjusted[key] = baseWeight * multiplier;
  }

  // Normalize
  const total = Object.values(adjusted).reduce((s, w) => s + w, 0);
  if (total > 0) {
    for (const key of Object.keys(adjusted)) {
      adjusted[key] = Math.round((adjusted[key] / total) * 1000) / 1000;
    }
  }

  return adjusted;
}

// ─── 8. EXTRACT LESSONS ────────────────────────────────────

function extractLessons(): number {
  const recentEvaluated = records
    .filter(r => r.evaluatedAt && !r.wasCorrect && Math.abs(r.actualChangePercent || 0) > 2)
    .slice(-20);

  let newLessons = 0;

  for (const record of recentEvaluated) {
    if (!record.perIndicatorCorrect || !record.actualChangePercent) continue;

    // Find which indicators were most wrong
    const wrongIndicators: Array<{ name: string; score: number; wasPredicted: string; actual: string }> = [];

    for (const [ind, correct] of Object.entries(record.perIndicatorCorrect)) {
      if (correct) continue;

      const isFund = ind.startsWith('fund_');
      const indKey = isFund ? ind.replace('fund_', '') : ind;
      const scores = isFund ? record.fundamentalScores : record.technicalScores;
      const score = scores?.[indKey] ?? 0;

      const predicted = score > 10 ? 'LARTË' : score < -10 ? 'POSHTË' : 'NEUTRAL';
      const actual = (record.actualChangePercent || 0) > 0 ? 'LARTË' : 'POSHTË';

      wrongIndicators.push({
        name: INDICATOR_NAMES[indKey] || indKey,
        score: Math.round(score * 10) / 10,
        wasPredicted: predicted,
        actual,
      });
    }

    if (wrongIndicators.length === 0) continue;

    // Sort by absolute score (most confident wrong indicators first)
    wrongIndicators.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

    // Find if similar lesson exists
    const topWrong = wrongIndicators[0];
    const category = record.actualChangePercent < -3 ? 'wrong_direction' :
                     record.actualChangePercent > 3 ? 'volatility' : 'timing';

    const lessonMessage = `${record.ticker}: ${topWrong.name} parashikoi ${topWrong.wasPredicted} (pikë: ${topWrong.score}) por çmimi shkoi ${topWrong.actual} me ${Math.abs(record.actualChangePercent).toFixed(1)}%. ${wrongIndicators.length} indikatorë gabuan.`;

    const severity = Math.min(Math.ceil(Math.abs(record.actualChangePercent) / 3), 5);

    // Check for duplicate
    const isDuplicate = snapshot.lessons.some(l =>
      l.category === category &&
      l.message.includes(record.ticker) &&
      (Date.now() - new Date(l.createdAt).getTime()) < 7 * 24 * 60 * 60 * 1000
    );

    if (!isDuplicate) {
      snapshot.lessons.unshift({
        id: `lesson_${Date.now()}_${record.ticker}`,
        category,
        message: lessonMessage,
        severity,
        createdAt: new Date().toISOString(),
      });
      newLessons++;

      // Keep max 50 lessons
      if (snapshot.lessons.length > 50) {
        snapshot.lessons = snapshot.lessons.slice(0, 50);
      }
    }
  }

  return newLessons;
}

// ─── 9. GET STATS ──────────────────────────────────────────

export function getStats(): LearningSnapshot {
  ensureLoaded();
  return { ...snapshot };
}

// ─── 10. GET LEARNING CONTEXT FOR AI ───────────────────────

export function getLearningContext(): string {
  ensureLoaded();

  if (snapshot.totalEvaluated < 5) {
    return '';
  }

  const parts: string[] = [];

  parts.push(`═══ MËSIME NGA HISTORIA E PARASHIKIMEVE (${snapshot.totalEvaluated} të vlerësuara, saktesia: ${(snapshot.overallAccuracy * 100).toFixed(1)}%) ═══`);

  // Top 5 most accurate indicators
  const sortedByAccuracy = Object.values(snapshot.indicatorAccuracies)
    .filter(a => a.totalPredictions >= 3)
    .sort((a, b) => b.accuracy - a.accuracy);

  if (sortedByAccuracy.length > 0) {
    const topIndicators = sortedByAccuracy.slice(0, 5)
      .map(a => `  ${a.description}: ${(a.accuracy * 100).toFixed(0)}% saktesi (pesha e rregulluar: x${a.weight.toFixed(2)})`)
      .join('\n');

    const worstIndicators = sortedByAccuracy.slice(-3).reverse()
      .map(a => `  ${a.description}: ${(a.accuracy * 100).toFixed(0)}% saktesi (pesha e ulët: x${a.weight.toFixed(2)})`)
      .join('\n');

    parts.push(`Indikatorët më të saktë:\n${topIndicators}`);
    parts.push(`Indikatorët më të paktë të saktë:\n${worstIndicators}`);
  }

  // Recent lessons
  if (snapshot.lessons.length > 0) {
    const recentLessons = snapshot.lessons.slice(0, 5)
      .map(l => `  [${l.category}] ${l.message}`)
      .join('\n');

    parts.push(`Mësimet e fundit:\n${recentLessons}`);
  }

  // Ticker performance
  const sortedTickers = Object.entries(snapshot.tickerAccuracy)
    .filter(([_, s]) => s.total >= 2)
    .sort((a, b) => b[1].accuracy - a[1].accuracy);

  if (sortedTickers.length > 0) {
    const best = sortedTickers.slice(0, 3).map(([t, s]) => `${t}: ${(s.accuracy*100).toFixed(0)}%`).join(', ');
    const worst = sortedTickers.slice(-3).reverse().map(([t, s]) => `${t}: ${(s.accuracy*100).toFixed(0)}%`).join(', ');
    parts.push(`Saktësia per aksion: Më të mirat — ${best}. Më të këqijat — ${worst}.`);
  }

  parts.push(`RREGULLA: Përdor indikatorët me saktesi të lartë më shumë. Zvogëlo peshën e indikatorëve që gabojnë shpesh. Mos u mbështet vetëm në një indikator.`);
  parts.push(`═══ FUND I MËSIMEVE ═══`);

  return parts.join('\n');
}

// ─── 11. GET INDICATOR RANKING ─────────────────────────────

export function getIndicatorRanking(): {
  technical: IndicatorAccuracy[];
  fundamental: IndicatorAccuracy[];
} {
  ensureLoaded();

  const all = Object.values(snapshot.indicatorAccuracies);
  return {
    technical: all.filter(a => a.type === 'technical').sort((a, b) => b.accuracy - a.accuracy),
    fundamental: all.filter(a => a.type === 'fundamental').sort((a, b) => b.accuracy - a.accuracy),
  };
}

// ─── 12. GET RECENT PREDICTIONS ────────────────────────────

export function getRecentPredictions(limit = 20): IndicatorPredictionRecord[] {
  ensureLoaded();
  return records.slice(-limit).reverse();
}

// ─── 13. FORCE SAVE ────────────────────────────────────────

export function forceSave(): void {
  ensureLoaded();
  saveToDisk();
  console.log(`[LEARN] Force saved ${records.length} records to disk`);
}