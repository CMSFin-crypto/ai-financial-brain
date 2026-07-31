// ============================================================
// Spillover V2 — Statistical Model (Logistic Regression)
// Trained on historical features with walk-forward validation.
// Pure math, no external ML dependencies.
// ============================================================

import { featuresToArray, type SpilloverFeatures, FEATURE_NAMES } from './spillover-features';

// ─── Types ────────────────────────────────────────────────────

export type SpilloverClass = 'RELIEF_RALLY' | 'CONTINUATION' | 'NEUTRAL';

export interface SpilloverDatasetRow extends SpilloverFeatures {
 date: string;
 targetSymbol: string;
 nextDayReturn: number;
 labelUp: 0 | 1;
 labelClass: SpilloverClass;
}

export interface SpilloverV2Prediction {
  probabilityUp: number;
  probabilityDown: number;
  predictedClass: SpilloverClass;
  score: number;            // -100 to +100
  modelVersion: 'spillover-v2-logreg';
}

// ─── Logistic Regression (pure JS, no deps) ───────────────────

interface LogRegModel {
 weights: number[];       // one per feature
  bias: number;
 featureCount: number;
 trainedAt: string;
 trainSamples: number;
 trainAccuracy: number;
}

/** Sigmoid function */
function sigmoid(z: number): number {
  if (z > 500) return 1;
  if (z < -500) return 0;
  return 1 / (1 + Math.exp(-z));
}

/**
 * Train binary logistic regression via gradient descent.
 * X: array of feature arrays (rows), y: array of 0|1 labels.
 * Returns model with weights and bias.
 */
function trainLogReg(
  X: number[][],
  y: number[],
  options: { learningRate?: number; epochs?: number; lambda?: number } = {}
): LogRegModel {
  const lr = options.learningRate ?? 0.01;
  const epochs = options.epochs ?? 100;
  const lambda = options.lambda ?? 0.01; // L2 regularization
  const n = X.length;
  const d = X[0].length;

  // Initialize weights to 0
  const weights = new Array(d).fill(0);
  let bias = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    let dw = new Array(d).fill(0);
    let db = 0;

    for (let i = 0; i < n; i++) {
      const z = X[i].reduce((sum, xj, j) => sum + xj * weights[j], 0) + bias;
      const pred = sigmoid(z);
      const error = pred - y[i];

      for (let j = 0; j < d; j++) {
        dw[j] += error * X[i][j];
      }
      db += error;
    }

    // Update with L2 regularization
    for (let j = 0; j < d; j++) {
      weights[j] -= lr * (dw[j] / n + lambda * weights[j]);
    }
    bias -= lr * (db / n);
  }

  // Compute train accuracy
  let correct = 0;
  for (let i = 0; i < n; i++) {
    const z = X[i].reduce((sum, xj, j) => sum + xj * weights[j], 0) + bias;
    const pred = sigmoid(z) >= 0.5 ? 1 : 0;
    if (pred === y[i]) correct++;
  }

  return {
    weights,
    bias,
    featureCount: d,
    trainedAt: new Date().toISOString(),
    trainSamples: n,
    trainAccuracy: correct / n,
  };
}

/** Predict probability with a trained model */
function predictLogReg(model: LogRegModel, features: number[]): number {
  const z = features.reduce((sum, xj, j) => sum + xj * (model.weights[j] ?? 0), 0) + model.bias;
  return sigmoid(z);
}

// ─── Standardization (save mean/std from training) ────────────

interface Standardizer {
  means: number[];
  stds: number[];
}

function computeStandardizer(X: number[][]): Standardizer {
  const d = X[0].length;
  const n = X.length;
  const means = new Array(d).fill(0);
  const stds = new Array(d).fill(1);

  for (let j = 0; j < d; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += X[i][j];
    means[j] = sum / n;

    let varSum = 0;
    for (let i = 0; i < n; i++) varSum += (X[i][j] - means[j]) ** 2;
    stds[j] = Math.sqrt(varSum / n) > 0.001 ? Math.sqrt(varSum / n) : 1;
  }
  return { means, stds };
}

function standardize(X: number[][], s: Standardizer): number[][] {
  return X.map(row =>
    row.map((val, j) => (val - s.means[j]) / s.stds[j])
  );
}

function standardizeOne(row: number[], s: Standardizer): number[] {
  return row.map((val, j) => (val - s.means[j]) / s.stds[j]);
}

// ─── In-memory model cache ────────────────────────────────────

let cachedModel: { model: LogRegModel; standardizer: Standardizer; targetSymbol: string } | null = null;

// ─── Dataset Builder ──────────────────────────────────────────

/**
 * Build a labeled dataset from enriched history arrays.
 * All inputs are most-recent-first (index 0 = latest).
 * Returns oldest-first (for walk-forward iteration).
 */
export function buildSpilloverDataset(
  targetSymbol: string,
  kospi: import('./global-market-data').EnrichedMarketData[],
  nikkei: import('./global-market-data').EnrichedMarketData[],
  hsi: import('./global-market-data').EnrichedMarketData[],
  smh: import('./global-market-data').EnrichedMarketData[],
  qqq: import('./global-market-data').EnrichedMarketData[],
  vix: import('./global-market-data').EnrichedMarketData[],
  target: import('./global-market-data').EnrichedMarketData[]
): SpilloverDatasetRow[] {
  // Reverse all to oldest-first for sequential access
  const kR = [...kospi].reverse();
  const nR = [...nikkei].reverse();
  const hR = [...hsi].reverse();
  const sR = [...smh].reverse();
  const qR = [...qqq].reverse();
  const vR = [...vix].reverse();
  const tR = [...target].reverse();

  // Build date-indexed maps
  const byDate = new Map<string, {
    kospi: import('./global-market-data').EnrichedMarketData;
    nikkei: import('./global-market-data').EnrichedMarketData;
    hsi: import('./global-market-data').EnrichedMarketData;
    smh: import('./global-market-data').EnrichedMarketData;
    qqq: import('./global-market-data').EnrichedMarketData;
    vix: import('./global-market-data').EnrichedMarketData;
    target: import('./global-market-data').EnrichedMarketData;
  }>();

  const allDates = new Set<string>();
  for (const d of kR) { allDates.add(d.date); byDate.set(d.date, { kospi: d } as any); }
  for (const d of nR) { allDates.add(d.date); const e = byDate.get(d.date); if (e) e.nikkei = d; }
  for (const d of hR) { allDates.add(d.date); const e = byDate.get(d.date); if (e) e.hsi = d; }
  for (const d of sR) { allDates.add(d.date); const e = byDate.get(d.date); if (e) e.smh = d; }
  for (const d of qR) { allDates.add(d.date); const e = byDate.get(d.date); if (e) e.qqq = d; }
  for (const d of vR) { allDates.add(d.date); const e = byDate.get(d.date); if (e) e.vix = d; }
  for (const d of tR) { allDates.add(d.date); const e = byDate.get(d.date); if (e) e.target = d; }

  const { buildSpilloverFeatures } = require('./spillover-features');
  const { pctChange } = require('./global-market-data');

  const rows: SpilloverDatasetRow[] = [];
  const dates = [...allDates].sort();

  for (let i = 0; i < dates.length - 6; i++) {
    const date = dates[i];
    const entry = byDate.get(date);
    if (!entry || !entry.target || !entry.kospi || !entry.smh || !entry.vix || !entry.qqq || !entry.nikkei || !entry.hsi) continue;

    // Need 3 days ahead for nextDayReturn
    const futureDate = dates[i + 3];
    if (!futureDate) continue;
    const futureEntry = byDate.get(futureDate);
    if (!futureEntry || !futureEntry.target) continue;

    // Build features from this day's data (need history before this day)
    const kSlice = kR.filter(d => d.date <= date).slice(-60);
    const nSlice = nR.filter(d => d.date <= date).slice(-60);
    const hSlice = hR.filter(d => d.date <= date).slice(-60);
    const sSlice = sR.filter(d => d.date <= date).slice(-60);
    const qSlice = qR.filter(d => d.date <= date).slice(-60);
    const vSlice = vR.filter(d => d.date <= date).slice(-60);
    const tSlice = tR.filter(d => d.date <= date).slice(-60);

    if (kSlice.length < 10 || sSlice.length < 10 || tSlice.length < 10) continue;

    const features = buildSpilloverFeatures({
      kospi: kSlice, nikkei: nSlice, hsi: hSlice,
      smh: sSlice, qqq: qSlice, vix: vSlice, target: tSlice,
    });

    const nextDayReturn = pctChange(futureEntry.target.close, entry.target.close);

    // Labeling
    const labelUp: 0 | 1 = nextDayReturn > 1.5 ? 1 : 0;
    let labelClass: SpilloverClass = 'NEUTRAL';
    if (nextDayReturn >= 2) labelClass = 'RELIEF_RALLY';
    else if (nextDayReturn <= -2) labelClass = 'CONTINUATION';

    rows.push({
      ...features,
      date,
      targetSymbol,
      nextDayReturn,
      labelUp,
      labelClass,
    });
  }

  return rows;
}

// ─── Model Training ────────────────────────────────────────────

export function trainSpilloverModel(rows: SpilloverDatasetRow[]): {
  model: LogRegModel;
  standardizer: Standardizer;
} {
  if (rows.length < 50) {
    throw new Error(`Need at least 50 rows to train, got ${rows.length}`);
  }

  const X = rows.map(r => featuresToArray(r));
  const y = rows.map(r => r.labelUp);

  const standardizer = computeStandardizer(X);
  const Xstd = standardize(X, standardizer);
  const model = trainLogReg(Xstd, y, {
    learningRate: 0.05,
    epochs: 200,
    lambda: 0.02,
  });

  console.log(`[SPILLOVER-V2] Model trained: ${rows.length} samples, accuracy=${(model.trainAccuracy * 100).toFixed(1)}%`);
  return { model, standardizer };
}

// ─── Prediction ────────────────────────────────────────────────

export function predictSpilloverV2(
  features: SpilloverFeatures,
 model: LogRegModel,
  standardizer: Standardizer
): SpilloverV2Prediction {
  const x = standardizeOne(featuresToArray(features), standardizer);
  const probUp = predictLogReg(model, x);
  const probDown = 1 - probUp;

  let predictedClass: SpilloverClass = 'NEUTRAL';
  if (probUp >= 0.6) predictedClass = 'RELIEF_RALLY';
  else if (probDown >= 0.6) predictedClass = 'CONTINUATION';

  const score = (probUp - probDown) * 100; // -100 to +100

  return {
    probabilityUp: Math.round(probUp * 1000) / 1000,
    probabilityDown: Math.round(probDown * 1000) / 1000,
    predictedClass,
    score: Math.round(score * 100) / 100,
    modelVersion: 'spillover-v2-logreg',
  };
}

// ─── Walk-Forward Validation ──────────────────────────────────

export interface WalkForwardWindow {
 windowIndex: number;
  trainStart: string;
  trainEnd: string;
  testStart: string;
  testEnd: string;
 trainSize: number;
  testSize: number;
 // OOS metrics
  oosAccuracy: number;
  oosPrecisionRelief: number;
  oosRecallRelief: number;
  brierScore: number;
  avgReturnLong: number;
}

export function walkForwardValidate(
  rows: SpilloverDatasetRow[],
  trainMonths: number = 12,
  testMonths: number = 1
): WalkForwardWindow[] {
  // Estimate ~21 trading days per month
  const trainDays = trainMonths * 21;
  const testDays = testMonths * 21;
  const step = testDays;

  const windows: WalkForwardWindow[] = [];

  for (let start = 0; start + trainDays + testDays <= rows.length; start += step) {
    const trainRows = rows.slice(start, start + trainDays);
    const testRows = rows.slice(start + trainDays, start + trainDays + testDays);

    if (trainRows.length < 50 || testRows.length < 10) continue;

    // Train
    const { model, standardizer } = trainSpilloverModel(trainRows);

    // Test (OOS)
    let correct = 0;
    let reliefPredicted = 0;
    let reliefCorrect = 0;
    let reliefActual = 0;
    let brierSum = 0;
    let longReturns: number[] = [];

    for (const row of testRows) {
      const pred = predictSpilloverV2(row, model, standardizer);
      const actualUp = row.labelUp;
      const predUp = pred.probabilityUp >= 0.5 ? 1 : 0;
      if (predUp === actualUp) correct++;

      // Brier score
      brierSum += (pred.probabilityUp - actualUp) ** 2;

      // Precision/Recall for RELIEF_RALLY
      if (pred.predictedClass === 'RELIEF_RALLY') reliefPredicted++;
      if (row.labelClass === 'RELIEF_RALLY') reliefActual++;
      if (pred.predictedClass === 'RELIEF_RALLY' && row.labelClass === 'RELIEF_RALLY') reliefCorrect++;

      // Avg return when model says long
      if (pred.probabilityUp >= 0.55) longReturns.push(row.nextDayReturn);
    }

    windows.push({
      windowIndex: windows.length,
      trainStart: trainRows[0].date,
      trainEnd: trainRows[trainRows.length - 1].date,
      testStart: testRows[0].date,
      testEnd: testRows[testRows.length - 1].date,
      trainSize: trainRows.length,
      testSize: testRows.length,
      oosAccuracy: testRows.length > 0 ? correct / testRows.length : 0,
      oosPrecisionRelief: reliefPredicted > 0 ? reliefCorrect / reliefPredicted : 0,
      oosRecallRelief: reliefActual > 0 ? reliefCorrect / reliefActual : 0,
      brierScore: testRows.length > 0 ? brierSum / testRows.length : 1,
      avgReturnLong: longReturns.length > 0 ? longReturns.reduce((a, b) => a + b, 0) / longReturns.length : 0,
    });
  }

  // Log summary
  if (windows.length > 0) {
    const avgAcc = windows.reduce((s, w) => s + w.oosAccuracy, 0) / windows.length;
    const avgBrier = windows.reduce((s, w) => s + w.brierScore, 0) / windows.length;
    const avgLongRet = windows.reduce((s, w) => s + w.avgReturnLong, 0) / windows.length;
    console.log(`[SPILLOVER-V2] Walk-forward: ${windows.length} windows, avg OOS acc=${(avgAcc * 100).toFixed(1)}%, Brier=${avgBrier.toFixed(3)}, avg long ret=${avgLongRet.toFixed(2)}%`);
  }

  return windows;
}

// ─── Save/Load model result to DB ──────────────────────────────

export async function saveModelResult(
  date: Date,
  targetSymbol: string,
  prediction: SpilloverV2Prediction
): Promise<void> {
  try {
    const { prisma } = await import('./prisma');
    await prisma.spilloverModelResult.create({
      data: {
        date,
        targetSymbol,
        modelVersion: prediction.modelVersion,
        probabilityUp: prediction.probabilityUp,
        probabilityDown: prediction.probabilityDown,
        predictedClass: prediction.predictedClass,
      },
    });
  } catch (err) {
    console.error('[SPILLOVER-V2] DB save failed:', err);
  }
}

/** Evaluate past model results against actual returns */
export async function evaluateModelResults(): Promise<void> {
  try {
    const { prisma } = await import('./prisma');
    const { pctChange } = await import('./global-market-data');

    const unevaluated = await prisma.spilloverModelResult.findMany({
      where: { wasCorrect: null, actualReturn: null },
      orderBy: { date: 'asc' },
      take: 100,
    });

    for (const row of unevaluated) {
      const entrySnap = await prisma.globalMarketSnapshot.findFirst({
        where: { symbol: row.targetSymbol, date: { lte: row.date } },
        orderBy: { date: 'desc' },
      });
      const futureDate = new Date(row.date);
      futureDate.setDate(futureDate.getDate() + 3);
      const futSnap = await prisma.globalMarketSnapshot.findFirst({
        where: { symbol: row.targetSymbol, date: { gte: futureDate } },
        orderBy: { date: 'asc' },
      });
      if (!entrySnap || !futSnap) continue;

      const ret = pctChange(futSnap.close, entrySnap.close);
      const actualClass = ret >= 2 ? 'RELIEF_RALLY' : ret <= -2 ? 'CONTINUATION' : 'NEUTRAL';
      const wasCorrect = row.predictedClass === actualClass;

      await prisma.spilloverModelResult.update({
        where: { id: row.id },
        data: { actualClass, actualReturn: ret, wasCorrect },
      });
    }
    console.log(`[SPILLOVER-V2] Evaluated ${unevaluated.length} results`);
  } catch (err) {
    console.error('[SPILLOVER-V2] Evaluation failed:', err);
  }
}
