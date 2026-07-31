// ============================================================
// Regime HMM — Hidden Markov Model for regime detection
// 
// CURRENT STATUS: Skeleton / placeholder
// 
// Future implementation will use:
//   - Gaussian HMM with 5 hidden states (matching regime-intelligence.ts)
//   - Features: returns, volatility, breadth, VIX, spillover
//   - Viterbi algorithm for state inference
//   - Transition probability matrix for regime prediction
//   - Baum-Welch for parameter estimation
//
// Why HMM?
//   Market regimes are "hidden states" — we observe price/volume/volatility
//   but the true regime is latent. HMM learns:
//     1. Which observations correspond to which regime (emission probabilities)
//     2. How likely regimes transition between each other (transition matrix)
//     3. What the steady-state distribution looks like (stationary distribution)
//
// This adds two capabilities that rule-based detection cannot:
//   - "Where are we likely going next?" (transition probabilities)
//   - Smooth state transitions instead of discrete jumps
// ============================================================

import type { IntelligentRegimeState } from './regime-intelligence';
import type { EnrichedMarketData } from './global-market-data';

// ─── Types ────────────────────────────────────────────────────

export interface HMMState {
  name: IntelligentRegimeState;
  index: number;
}

export interface HMMParameters {
  states: HMMState[];
  stateCount: number;
  // Transition matrix: transitionMatrix[i][j] = P(state_j | state_i)
  transitionMatrix: number[][];
  // Emission parameters (Gaussian): means and covariances per state
  means: number[][];     // [state][feature]
  covariances: number[][]; // [state][feature] (diagonal for simplicity)
  // Initial state distribution
  initialProbs: number[];
  // Feature names
  featureNames: string[];
  trainedAt: string;
  trainSamples: number;
  logLikelihood: number;
}

export interface HMMInference {
  currentState: IntelligentRegimeState;
  stateProbabilities: Record<IntelligentRegimeState, number>;
  mostLikelyNextState: IntelligentRegimeState;
  transitionProbs: Record<IntelligentRegimeState, number>; // P(next=state | current)
}

// ─── Feature names for HMM ─────────────────────────────────────

export const HMM_FEATURE_NAMES = [
  'spy1d', 'spy5d', 'vixLevel', 'vix1d',
  'smh1d', 'kospi1d', 'atrZScore',
] as const;

// ─── State definitions ─────────────────────────────────────────

const STATES: HMMState[] = [
  { name: 'BULL_LOW_VOL', index: 0 },
  { name: 'BEAR_HIGH_VOL', index: 1 },
  { name: 'PANIC_CAPITULATION', index: 2 },
  { name: 'RELIEF_RALLY', index: 3 },
  { name: 'RANGE_NEUTRAL', index: 4 },
];

// ─── Skeleton: Train HMM ──────────────────────────────────────

/**
 * Train a Gaussian HMM on historical regime features.
 * NOT YET IMPLEMENTED — returns skeleton parameters.
 * 
 * When implemented, will use Baum-Welch algorithm:
 *   1. Initialize with rule-based labels as soft assignments
 *   2. E-step: compute posterior state probabilities
 *   3. M-step: update transition matrix, means, covariances
 *   4. Repeat until convergence (log-likelihood change < epsilon)
 */
export function trainRegimeHMM(_observations: number[][]): HMMParameters {
  console.log('[REGIME-HMM] trainRegimeHMM called — SKELETON, not yet implemented');

  const n = STATES.length;
  const d = HMM_FEATURE_NAMES.length;

  // Uniform transition matrix (will be learned)
  const transitionMatrix = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => 1 / n)
  );

  // Default means (centered at 0)
  const means = Array.from({ length: n }, () => new Array(d).fill(0));

  // Default covariances (identity)
  const covariances = Array.from({ length: n }, () =>
    Array.from({ length: d }, (_, j) => j === 0 ? 1 : 0.5)
  );

  // Specific initial means based on regime characteristics
  // BULL_LOW_VOL: positive returns, low VIX
  means[0] = [0.05, 0.3, 16, -0.5, 0.1, 0, -0.3];
  // BEAR_HIGH_VOL: negative returns, high VIX
  means[1] = [-0.3, -2.0, 25, 2.0, -0.5, -0.5, 1.0];
  // PANIC_CAPITULATION: very negative, very high VIX
  means[2] = [-2.0, -5.0, 35, 8.0, -2.0, -2.0, 2.5];
  // RELIEF_RALLY: recovering, VIX dropping
  means[3] = [0.5, 1.0, 22, -3.0, 1.0, 0.5, 0.5];
  // RANGE_NEUTRAL: near zero
  means[4] = [0.0, 0.0, 19, 0.0, 0.0, 0.0, 0.0];

  return {
    states: STATES,
    stateCount: n,
    transitionMatrix,
    means,
    covariances,
    initialProbs: new Array(n).fill(1 / n),
    featureNames: [...HMM_FEATURE_NAMES],
    trainedAt: new Date().toISOString(),
    trainSamples: 0,
    logLikelihood: 0,
  };
}

// ─── Skeleton: Infer current regime ─────────────────────────────

/**
 * Infer the current regime state using Viterbi algorithm.
 * NOT YET IMPLEMENTED — returns default.
 * 
 * When implemented:
 *   1. Compute emission probabilities for each state
 *   2. Run Viterbi to find most likely state sequence
 *   3. Return current state + transition probabilities
 */
export function inferCurrentRegime(_params: HMMParameters, _recentObservations: number[][]): HMMInference {
  console.log('[REGIME-HMM] inferCurrentRegime called — SKELETON, not yet implemented');

  const n = STATES.length;
  const current = STATES[4]; // default to RANGE_NEUTRAL

  const stateProbabilities = {} as Record<IntelligentRegimeState, number>;
  const transitionProbs = {} as Record<IntelligentRegimeState, number>;

  for (const state of STATES) {
    stateProbabilities[state.name] = state.name === current.name ? 0.4 : 0.15;
    transitionProbs[state.name] = 1 / n;
  }

  return {
    currentState: current.name,
    stateProbabilities,
    mostLikelyNextState: 'RANGE_NEUTRAL',
    transitionProbs,
  };
}

// ─── Skeleton: Predict next regime ──────────────────────────────

/**
 * Predict the most likely next regime based on transition probabilities.
 * NOT YET IMPLEMENTED — uses uniform distribution.
 */
export function predictNextRegimeTransition(_params: HMMParameters, currentState: IntelligentRegimeState): {
  nextState: IntelligentRegimeState;
  confidence: number;
  probabilities: Record<IntelligentRegimeState, number>;
} {
  const stateIdx = STATES.findIndex(s => s.name === currentState);
  const probs = {} as Record<IntelligentRegimeState, number>;

  for (const state of STATES) {
    probs[state.name] = 1 / STATES.length; // uniform until HMM is trained
  }

  // Sort by probability
  const sorted = Object.entries(probs).sort((a, b) => b[1] - a[1]);
  const nextState = sorted[0][0] as IntelligentRegimeState;
  const confidence = sorted[0][1];

  return { nextState, confidence, probabilities: probs };
}

// ─── Gaussian PDF helper (for future HMM implementation) ──────

function gaussianPDF(x: number, mean: number, variance: number): number {
  if (variance <= 0) return 0;
  const exponent = -0.5 * ((x - mean) ** 2) / variance;
  return (1 / Math.sqrt(2 * Math.PI * variance)) * Math.exp(exponent);
}

// Re-export for type usage
export type { EnrichedMarketData };