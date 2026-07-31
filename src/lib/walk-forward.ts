// ============================================================
// Walk-Forward Validation Engine
// Builds train/test windows that move forward in time, respecting
// temporal ordering to avoid look-ahead bias.
// ============================================================

export type WalkForwardWindow = {
  windowIndex: number;
  trainStart: number;
  trainEnd: number;
  testStart: number;
  testEnd: number;
  trainSize: number;
  testSize: number;
};

export type WalkForwardConfig = {
  totalSamples: number;     // total data points available
  trainSize: number;        // number of points in training window
  testSize: number;         // number of points in test window
  stepSize: number;         // how many points to shift forward each step
  minTrainSize?: number;    // minimum training samples (safety floor)
};

export type WalkForwardResult<T = number> = {
  windows: WalkForwardWindow[];
  results: Array<{
    windowIndex: number;
    trainStart: number;
    testStart: number;
    // Per-window metrics
    metric: T;
  }>;
  aggregate: {
    meanMetric: number;
    stdMetric: number;
    minMetric: number;
    maxMetric: number;
    winRate: number; // % of windows with positive metric
  };
}

// ─── Window builder ───────────────────────────────────────────

export function buildWalkForwardWindows(
  total: number,
  trainSize: number,
  testSize: number,
  stepSize: number,
): WalkForwardWindow[] {
  const windows: WalkForwardWindow[] = [];
  const minTrain = Math.max(trainSize, 30); // safety floor

  for (let idx = 0; ; idx++) {
    const trainEnd = minTrain + idx * stepSize;
    const trainStart = trainEnd - minTrain;
    const testStart = trainEnd;
    const testEnd = testStart + testSize;

    if (testEnd > total) break;

    windows.push({
      windowIndex: idx,
      trainStart,
      trainEnd,
      testStart,
      testEnd,
      trainSize: minTrain,
      testSize,
    });
  }

  return windows;
}

// ─── Aggregation helpers ──────────────────────────────────────

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  return Math.sqrt(values.reduce((s, v) => s + (v - avg) ** 2, 0) / (values.length - 1));
}

// ─── Run a walk-forward evaluation ────────────────────────────
// `evalFn` receives (trainIndices, testIndices) and returns a numeric metric.
// The skeleton handles windowing, calling, and aggregation.

export async function runWalkForward(
  config: WalkForwardConfig,
  evalFn: (train: { start: number; end: number }, test: { start: number; end: number }, windowIdx: number) => Promise<number>,
): Promise<WalkForwardResult> {
  const windows = buildWalkForwardWindows(
    config.totalSamples,
    config.trainSize ?? 200,
    config.testSize ?? 50,
    config.stepSize ?? 25,
  );

  const results: WalkForwardResult['results'] = [];

  for (const w of windows) {
 try {
      const metric = await evalFn(
        { start: w.trainStart, end: w.trainEnd },
        { start: w.testStart, end: w.testEnd },
        w.windowIndex,
      );
      results.push({
        windowIndex: w.windowIndex,
        trainStart: w.trainStart,
        testStart: w.testStart,
        metric,
      });
    } catch (err) {
      console.warn(`[WF] Window ${w.windowIndex} failed:`, err);
    }
  }

  const metrics = results.map(r => r.metric);
  const avg = mean(metrics);
  const positive = metrics.filter(m => m > 0).length;

  return {
    windows,
    results,
    aggregate: {
      meanMetric: Math.round(avg * 10000) / 10000,
      stdMetric: Math.round(stdDev(metrics, avg) * 10000) / 10000,
      minMetric: metrics.length ? Math.round(Math.min(...metrics) * 10000) / 10000 : 0,
      maxMetric: metrics.length ? Math.round(Math.max(...metrics) * 10000) / 10000 : 0,
      winRate: metrics.length ? Math.round((positive / metrics.length) * 10000) / 100 : 0,
    },
  };
}

// ─── Convenience: walk-forward over DB predictions ────────────
// Queries prediction table, splits by time windows, computes accuracy.

import prisma from './prisma';

export type WFPredictionResult = WalkForwardResult & {
  totalPredictionsEvaluated: number;
};

export async function walkForwardPredictions(config?: {
  modelVersion?: string;
  horizonDays?: number;
  trainDays?: number;
  testDays?: number;
  stepDays?: number;
}): Promise<WFPredictionResult> {
  const modelVersion = config?.modelVersion ?? 'predict-v3-regime-spillover';
  const horizonDays = config?.horizonDays ?? 1;

  // Fetch all evaluated predictions for this model
  const allPreds = await prisma.prediction.findMany({
    where: {
      modelVersion,
      horizonDays,
      evaluationStatus: 'EVALUATED',
      wasCorrect: { not: null },
    },
    orderBy: { predictedAt: 'asc' },
    select: { predictedAt: true, wasCorrect: true },
  });

  if (allPreds.length < 100) {
    return {
      windows: [],
      results: [],
      aggregate: { meanMetric: 0, stdMetric: 0, minMetric: 0, maxMetric: 0, winRate: 0 },
      totalPredictionsEvaluated: allPreds.length,
    };
  }

  // Convert to index-based windows
  const trainSize = config?.trainDays ?? 200;
  const testSize = config?.testDays ?? 50;
  const stepSize = config?.stepDays ?? 25;
  const total = allPreds.length;

  return runWalkForward(
    { totalSamples: total, trainSize, testSize, stepSize },
    async (train, test) => {
      const testPreds = allPreds.slice(test.start, test.end);
      if (testPreds.length === 0) return 0;
      const correct = testPreds.filter(p => p.wasCorrect === true).length;
      return correct / testPreds.length;
    },
  ).then(r => ({ ...r, totalPredictionsEvaluated: total }));
}