// ============================================================
// Isotonic Calibration — calibrates raw model probabilities so
// that P(win) actually matches the observed win rate.
//
// Implementation: Pool Adjacent Violators Algorithm (PAVA)
// for isotonic regression. This is the standard approach used
// by scikit-learn's CalibratedClassifierCV(method='isotonic').
//
// Why it matters: XGBoost/LightGBM predict_proba is often
// poorly calibrated. A model saying "70% win" should actually
// win ~70% of the time. Without calibration, the risk engine
// cannot correctly size positions.
// ============================================================

export interface CalibrationBin {
  /** Cumulative count of samples up to this bin */
  totalCount: number;
  /** Cumulative correct count up to this bin */
  correctCount: number;
  /** Calibrated probability: correctCount / totalCount */
  calibratedProb: number;
}

export interface CalibrationState {
  version: string;
  sampleSize: number;
  bins: CalibrationBin[];
  ece: number; // Expected Calibration Error
  createdAt: string;
}

// ─── PAVA (Pool Adjacent Violators Algorithm) ───────────────

/**
 * Fit isotonic calibration using PAVA.
 * Input: arrays of predicted probabilities and actual outcomes (0/1).
 * Output: calibration state that maps raw prob → calibrated prob.
 */
export function fitIsotonicCalibration(
  predictedProbs: number[],
  actualOutcomes: number[],
  minBinSize: number = 30,
): CalibrationState {
  if (predictedProbs.length !== actualOutcomes.length) {
    throw new Error('predictedProbs and actualOutcomes must have same length');
  }

  const n = predictedProbs.length;
  if (n === 0) {
    return { version: 'iso-v1', sampleSize: 0, bins: [], ece: 1, createdAt: new Date().toISOString() };
  }

  // Sort by predicted probability
  const paired = predictedProbs.map((p, i) => ({
    prob: p,
    outcome: actualOutcomes[i],
  }));
  paired.sort((a, b) => a.prob - b.prob);

  // Run PAVA: merge non-monotonic adjacent bins
  const blocks: { total: number; correct: number; avgProb: number }[] = [];

  for (const { prob, outcome } of paired) {
    const newBlock = { total: 1, correct: outcome, avgProb: prob };
    blocks.push(newBlock);

    // Fix violations: while the last two blocks violate monotonicity, merge
    while (blocks.length >= 2) {
      const last = blocks[blocks.length - 1];
      const prev = blocks[blocks.length - 2];
      if (prev.avgProb > last.avgProb) {
        // Merge: weighted average
        const mergedTotal = prev.total + last.total;
        const mergedCorrect = prev.correct + last.correct;
        const mergedAvg = mergedCorrect / mergedTotal;
        blocks.pop();
        blocks.pop();
        blocks.push({ total: mergedTotal, correct: mergedCorrect, avgProb: mergedAvg });
      } else {
        break;
      }
    }
  }

  // Merge small bins (below minBinSize) into neighbors
  const mergedBlocks: typeof blocks = [];
  for (const block of blocks) {
    if (mergedBlocks.length > 0 && block.total < minBinSize) {
      const prev = mergedBlocks[mergedBlocks.length - 1];
      const mt = prev.total + block.total;
      const mc = prev.correct + block.correct;
      mergedBlocks[mergedBlocks.length - 1] = {
        total: mt,
        correct: mc,
        avgProb: mc / mt,
      };
    } else {
      mergedBlocks.push(block);
    }
  }

  // Build cumulative bins for lookup
  let cumTotal = 0;
  let cumCorrect = 0;
  const bins: CalibrationBin[] = [];
  for (const block of mergedBlocks) {
    cumTotal += block.total;
    cumCorrect += block.correct;
    bins.push({
      totalCount: cumTotal,
      correctCount: cumCorrect,
      calibratedProb: cumTotal > 0 ? cumCorrect / cumTotal : block.avgProb,
    });
  }

  // Compute ECE (Expected Calibration Error)
  const numBins = Math.min(10, bins.length);
  const binWidth = 1 / numBins;
  let ece = 0;
  for (let i = 0; i < numBins; i++) {
    const lo = i * binWidth;
    const hi = (i + 1) * binWidth;
    const binSamples = paired.filter(p => p.prob >= lo && p.prob < hi);
    if (binSamples.length === 0) continue;
    const avgProb = binSamples.reduce((s, p) => s + p.prob, 0) / binSamples.length;
    const avgOutcome = binSamples.reduce((s, p) => s + p.outcome, 0) / binSamples.length;
    ece += (Math.abs(avgOutcome - avgProb) * binSamples.length) / n;
  }

  return {
    version: 'iso-v1',
    sampleSize: n,
    bins,
    ece,
    createdAt: new Date().toISOString(),
  };
}

// ─── Calibration lookup ─────────────────────────────────────

/**
 * Apply calibrated probability using the isotonic calibration state.
 * Falls back to raw probability if no calibration is available.
 */
export function calibrateProbability(
  rawProb: number,
  state: CalibrationState | null,
): { calibratedProb: number; method: string } {
  if (!state || state.bins.length === 0) {
    return { calibratedProb: rawProb, method: 'none' };
  }

  // Clamp to [0, 1]
  const p = Math.max(0, Math.min(1, rawProb));

  // Find the bin: use binary search on cumulative counts
  // The bins are ordered by increasing probability
  // We need to find which bin this probability falls into
  const total = state.sampleSize;
  if (total === 0) return { calibratedProb: rawProb, method: 'none' };

  // Find position in the sorted probability distribution
  // Since bins are cumulative, we find the first bin whose
  // calibrated probability is >= our target, then interpolate
  let calProb = rawProb;

  for (const bin of state.bins) {
    if (p <= bin.calibratedProb || bin === state.bins[state.bins.length - 1]) {
      calProb = bin.calibratedProb;
      break;
    }
  }

  // Smooth: blend toward raw if very few samples
  const blendFactor = Math.min(1, state.sampleSize / 200);
  calProb = rawProb * (1 - blendFactor) + calProb * blendFactor;

  return { calibratedProb: Math.max(0.01, Math.min(0.99, calProb)), method: 'isotonic' };
}

// ─── Serialization ──────────────────────────────────────────

/** Serialize calibration state for DB storage */
export function serializeCalibrationState(state: CalibrationState): string {
  return JSON.stringify(state);
}

/** Deserialize calibration state from DB storage */
export function deserializeCalibrationState(json: string): CalibrationState {
  return JSON.parse(json) as CalibrationState;
}
