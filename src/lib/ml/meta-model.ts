// ============================================================
// Meta-Model — lightweight gradient-boosted decision tree
// classifier for tabular financial features.
//
// V1 Implementation: Pure TypeScript gradient-boosted trees
// (no external ML runtime dependency).
//
// Architecture:
//   - Binary classification: trade_success = 1/0
//   - Decision stumps as weak learners
//   - Gradient boosting with log-loss (deviance)
//   - Shrinkage (learning rate) + subsampling for regularization
//   - Max depth = 3 (stumps/shallow trees prevent overfitting)
//
// Why not XGBoost/WASM? V1 is a proof-of-concept that works
// without native dependencies. Upgrade to xgboost-wasm or
// a Python microservice when production data warrants it.
// ============================================================

import { FEATURE_NAMES, type FeatureName } from './feature-definitions';
import { type CalibrationState } from './calibration';

// ─── Types ──────────────────────────────────────────────────

export interface TreeNode {
  featureIndex: number;
  threshold: number;
  leftValue: number;   // leaf value if go left
  rightValue: number;  // leaf value if go right
  left?: TreeNode;
  right?: TreeNode;
  isLeaf: boolean;
  leafValue?: number;
}

export interface TreeEnsemble {
  trees: TreeNode[];
  initialPrediction: number; // log-odds of positive class in training data
  learningRate: number;
  featureImportance: Record<string, number>; // feature name → gain sum
}

export interface MetaModelConfig {
  nEstimators: number;
  maxDepth: number;
  learningRate: number;
  subsample: number;        // row subsampling ratio
  minSamplesLeaf: number;
  minSamplesSplit: number;
  featureSubsample: number; // column subsampling ratio (colsample_bytree)
  l2Regularization: number; // lambda for leaf values
}

export interface TrainingSample {
  features: number[];  // in FEATURE_NAMES order
  label: number;       // 0 or 1
}

export interface MetaModelPredictResult {
  rawWinProbability: number;
  rawLossProbability: number;
  calibratedWinProb: number;
  confidenceCalibrated: number;
  leafPath: string[];  // for explainability: which leaves were hit
}

// ─── Default Config ─────────────────────────────────────────

export const DEFAULT_CONFIG: MetaModelConfig = {
  nEstimators: 150,
  maxDepth: 3,
  learningRate: 0.05,
  subsample: 0.8,
  minSamplesLeaf: 20,
  minSamplesSplit: 40,
  featureSubsample: 0.7,
  l2Regularization: 1.0,
};

// ─── Tree building internals ────────────────────────────────

/** Sigmoid function */
function sigmoid(x: number): number {
  if (x > 500) return 1;
  if (x < -500) return 0;
  return 1 / (1 + Math.exp(-x));
}

/** Compute negative gradient of log-loss (pseudo-residuals) */
function computeGradients(probs: number[], labels: number[]): number[] {
  return probs.map((p, i) => labels[i] - p);
}

/** Compute leaf value with L2 regularization */
function computeLeafValue(
  gradients: number[],
  hessians: number[],
  l2: number,
): number {
  const sumG = gradients.reduce((a, b) => a + b, 0);
  const sumH = hessians.reduce((a, b) => a + b, 0);
  return sumG / (sumH + l2);
}

/** Compute hessians for log-loss: p * (1 - p) */
function computeHessians(probs: number[]): number[] {
  return probs.map(p => Math.max(1e-8, p * (1 - p)));
}

/** Find best split for a node */
function findBestSplit(
  indices: number[],
  X: number[][],
  gradients: number[],
  hessians: number[],
  featureIndices: number[],
  minSamplesLeaf: number,
  minSamplesSplit: number,
  l2: number,
): { featureIndex: number; threshold: number; gain: number; leftIndices: number[]; rightIndices: number[] } | null {
  if (indices.length < minSamplesSplit) return null;

  let bestGain = -Infinity;
  let bestFeature = -1;
  let bestThreshold = 0;
  let bestLeft: number[] = [];
  let bestRight: number[] = [];

  const sumG = indices.reduce((s, i) => s + gradients[i], 0);
  const sumH = indices.reduce((s, i) => s + hessians[i], 0);
  const baseScore = (sumG * sumG) / (sumH + l2);

  for (const fi of featureIndices) {
    // Get unique thresholds from this feature
    const values = indices.map(i => X[i][fi]);
    // Sample candidate thresholds (percentiles)
    const sorted = [...values].sort((a, b) => a - b);
    const candidates: number[] = [];
    const step = Math.max(1, Math.floor(sorted.length / 20));
    for (let i = step; i < sorted.length; i += step) {
      if (sorted[i] !== sorted[i - 1]) {
        candidates.push((sorted[i] + sorted[i - 1]) / 2);
      }
    }
    if (candidates.length === 0) continue;

    for (const threshold of candidates) {
      const left = indices.filter(i => X[i][fi] <= threshold);
      const right = indices.filter(i => X[i][fi] > threshold);

      if (left.length < minSamplesLeaf || right.length < minSamplesLeaf) continue;

      const leftG = left.reduce((s, i) => s + gradients[i], 0);
      const leftH = left.reduce((s, i) => s + hessians[i], 0);
      const rightG = right.reduce((s, i) => s + gradients[i], 0);
      const rightH = right.reduce((s, i) => s + hessians[i], 0);

      const gain = (leftG * leftG) / (leftH + l2) + (rightG * rightG) / (rightH + l2) - baseScore;

      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = fi;
        bestThreshold = threshold;
        bestLeft = left;
        bestRight = right;
      }
    }
  }

  if (bestFeature === -1) return null;
  return { featureIndex: bestFeature, threshold: bestThreshold, gain: bestGain, leftIndices: bestLeft, rightIndices: bestRight };
}

/** Recursively build a tree */
function buildTree(
  indices: number[],
  X: number[][],
  gradients: number[],
  hessians: number[],
  depth: number,
  maxDepth: number,
  featureIndices: number[],
  config: MetaModelConfig,
  featureImportance: Record<string, number>,
): TreeNode {
  const leafValue = computeLeafValue(
    indices.map(i => gradients[i]),
    indices.map(i => hessians[i]),
    config.l2Regularization,
  );

  if (depth >= maxDepth || indices.length < config.minSamplesSplit) {
    return { featureIndex: -1, threshold: 0, leftValue: 0, rightValue: 0, isLeaf: true, leafValue };
  }

  const split = findBestSplit(
    indices, X, gradients, hessians, featureIndices,
    config.minSamplesLeaf, config.minSamplesSplit, config.l2Regularization,
  );

  if (!split) {
    return { featureIndex: -1, threshold: 0, leftValue: 0, rightValue: 0, isLeaf: true, leafValue };
  }

  // Accumulate feature importance
  const featName = FEATURE_NAMES[split.featureIndex];
  featureImportance[featName] = (featureImportance[featName] ?? 0) + split.gain;

  // Subsample features for next level
  const nextFeatureIndices = subsampleFeatures(featureIndices, config.featureSubsample);

  const leftNode = buildTree(split.leftIndices, X, gradients, hessians, depth + 1, maxDepth, nextFeatureIndices, config, featureImportance);
  const rightNode = buildTree(split.rightIndices, X, gradients, hessians, depth + 1, maxDepth, nextFeatureIndices, config, featureImportance);

  return {
    featureIndex: split.featureIndex,
    threshold: split.threshold,
    leftValue: leafValue,
    rightValue: leafValue,
    left: leftNode,
    right: rightNode,
    isLeaf: false,
  };
}

/** Subsample feature indices */
function subsampleFeatures(all: number[], ratio: number): number[] {
 if (ratio >= 1) return all;
  const count = Math.max(1, Math.floor(all.length * ratio));
  const shuffled = [...all].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/** Traverse tree to get prediction */
function traverseTree(node: TreeNode, features: number[], path: string[] = []): { value: number; path: string[] } {
  if (node.isLeaf) {
    return { value: node.leafValue ?? 0, path };
  }

  const featVal = features[node.featureIndex] ?? 0;
  const goLeft = featVal <= node.threshold;
  const featName = FEATURE_NAMES[node.featureIndex] ?? `f${node.featureIndex}`;
  const direction = goLeft ? '<=' : '>';
  path.push(`${featName} ${direction} ${node.threshold.toFixed(4)}`);

  if (goLeft && node.left) {
    return traverseTree(node.left, features, path);
  } else if (node.right) {
    return traverseTree(node.right, features, path);
  }

  return { value: node.isLeaf ? (node.leafValue ?? 0) : node.leftValue, path };
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Train a gradient-boosted tree ensemble.
 * Returns the trained model (TreeEnsemble) that can be serialized.
 */
export function trainMetaModel(
  samples: TrainingSample[],
  config: MetaModelConfig = DEFAULT_CONFIG,
): TreeEnsemble {
  const n = samples.length;
  if (n === 0) throw new Error('No training samples');

  const X = samples.map(s => s.features);
  const Y = samples.map(s => s.label);

  // Initial prediction: log-odds of positive class
  const posCount = Y.reduce((a, b) => a + b, 0);
  const negCount = n - posCount;
  const initialPrediction = Math.log((posCount + 1) / (negCount + 1));

  // Initialize predictions
  const F = new Array(n).fill(initialPrediction);
  const trees: TreeNode[] = [];
  const featureImportance: Record<string, number> = {};

  // All feature indices
  const allFeatures = FEATURE_NAMES.map((_, i) => i);

  // Gradient boosting loop
  for (let t = 0; t < config.nEstimators; t++) {
    // Compute probabilities
    const probs = F.map(f => sigmoid(f));

    // Compute gradients and hessians
    const gradients = computeGradients(probs, Y);
    const hessians = computeHessians(probs);

    // Subsample rows
    let indices = Array.from({ length: n }, (_, i) => i);
    if (config.subsample < 1) {
      indices = indices.filter(() => Math.random() < config.subsample);
    }

    // Subsample features
    const featureIndices = subsampleFeatures(allFeatures, config.featureSubsample);

    // Build tree
    const tree = buildTree(
      indices, X, gradients, hessians,
      0, config.maxDepth, featureIndices, config, featureImportance,
    );
    trees.push(tree);

    // Update predictions (for ALL samples, not just subsampled)
    for (let i = 0; i < n; i++) {
      const { value } = traverseTree(tree, X[i]);
      F[i] += config.learningRate * value;
    }
  }

  // Normalize feature importance
  const maxImportance = Math.max(...Object.values(featureImportance), 1);
  for (const key of Object.keys(featureImportance)) {
    featureImportance[key] /= maxImportance;
  }

  return {
    trees,
    initialPrediction,
    learningRate: config.learningRate,
    featureImportance,
  };
}

/**
 * Predict with a trained meta-model.
 * Returns raw probabilities + leaf path for explainability.
 */
export function predictMetaModel(
  features: number[],
  model: TreeEnsemble,
): MetaModelPredictResult {
  let logOdds = model.initialPrediction;
  const allPaths: string[] = [];

  for (const tree of model.trees) {
    const { value, path } = traverseTree(tree, features);
    logOdds += model.learningRate * value;
    allPaths.push(...path);
  }

  const rawWinProb = sigmoid(logOdds);
  const rawLossProb = 1 - rawWinProb;

  return {
    rawWinProbability: rawWinProb,
    rawLossProbability: rawLossProb,
    calibratedWinProb: rawWinProb, // will be overwritten by calibration layer
    confidenceCalibrated: Math.abs(rawWinProb - 0.5) * 2, // 0 = uncertain, 1 = certain
    leafPath: allPaths,
  };
}

/**
 * Evaluate model on a test set.
 * Returns accuracy, Brier score, and per-threshold metrics.
 */
export function evaluateMetaModel(
  samples: TrainingSample[],
  model: TreeEnsemble,
  calibrationState: CalibrationState | null = null,
): {
  accuracy: number;
  brierScore: number;
  auc: number;
  precision: number;
  recall: number;
  f1: number;
  ece: number;
} {
  const n = samples.length;
  if (n === 0) return { accuracy: 0, brierScore: 1, auc: 0.5, precision: 0, recall: 0, f1: 0, ece: 1 };

  let correct = 0;
  let brierSum = 0;

  // For AUC: collect (prob, label) pairs
  const probLabelPairs: { prob: number; label: number }[] = [];
  let tp = 0, fp = 0, fn = 0;

  for (const sample of samples) {
    const result = predictMetaModel(sample.features, model);
    const prob = calibrationState
      ? calibrateWithState(result.rawWinProbability, calibrationState)
      : result.rawWinProbability;

    const predicted = prob >= 0.5 ? 1 : 0;
    if (predicted === sample.label) correct++;

    brierSum += (prob - sample.label) ** 2;
    probLabelPairs.push({ prob, label: sample.label });

    if (predicted === 1 && sample.label === 1) tp++;
    if (predicted === 1 && sample.label === 0) fp++;
    if (predicted === 0 && sample.label === 1) fn++;
  }

  const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0;
  const recall = (tp + fn) > 0 ? tp / (tp + fn) : 0;
  const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    accuracy: correct / n,
    brierScore: brierSum / n,
    auc: computeAUC(probLabelPairs),
    precision,
    recall,
    f1,
    ece: calibrationState?.ece ?? 1,
  };
}

/** Simple calibration lookup from state */
function calibrateWithState(rawProb: number, state: CalibrationState): number {
  if (state.bins.length === 0) return rawProb;
  // Find the bin whose calibrated probability best matches
  // Use the last bin's calibrated probability as a lookup
  let calProb = rawProb;
  for (const bin of state.bins) {
    if (rawProb <= bin.calibratedProb || bin === state.bins[state.bins.length - 1]) {
      calProb = bin.calibratedProb;
      break;
    }
  }
  const blend = Math.min(1, state.sampleSize / 200);
  return rawProb * (1 - blend) + calProb * blend;
}

/** Compute AUC using trapezoidal rule on TPR/FPR curve */
function computeAUC(pairs: { prob: number; label: number }[]): number {
  if (pairs.length === 0) return 0.5;

  // Sort by probability descending
  const sorted = [...pairs].sort((a, b) => b.prob - a.prob);
  const totalPos = sorted.filter(p => p.label === 1).length;
  const totalNeg = sorted.length - totalPos;

  if (totalPos === 0 || totalNeg === 0) return 0.5;

  let tp = 0, fp = 0;
  let auc = 0;
  let prevFPR = 0, prevTPR = 0;

  for (const { label } of sorted) {
    if (label === 1) tp++;
    else fp++;

    const tpr = tp / totalPos;
    const fpr = fp / totalNeg;
    auc += (fpr - prevFPR) * (tpr + prevTPR) / 2;
    prevFPR = fpr;
    prevTPR = tpr;
  }

  return Math.max(0, Math.min(1, auc));
}

// ─── Serialization ──────────────────────────────────────────

/** Serialize model to JSON for DB storage */
export function serializeModel(model: TreeEnsemble): string {
  return JSON.stringify(model);
}

/** Deserialize model from JSON */
export function deserializeModel(json: string): TreeEnsemble {
  return JSON.parse(json) as TreeEnsemble;
}
