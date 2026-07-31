// ============================================================
// Prediction Factors — Build factor arrays for persistence
// ============================================================

export interface FactorInput {
  factorName: string;
  factorType: 'technical' | 'fundamental' | 'regime' | 'event' | 'relative_strength' | 'macro_global';
  score: number;
  weight: number;
  signal: string;
  description: string;
}

/**
 * Build factor inputs from prediction engine indicator scores.
 */
export function buildTechnicalFactors(
  indicatorScores: Record<string, number>,
  weights: Record<string, number>,
): FactorInput[] {
  return Object.entries(indicatorScores).map(([name, score]) => ({
    factorName: name,
    factorType: 'technical' as const,
    score,
    weight: weights[name] ?? 0.05,
    signal: score > 10 ? 'BULLISH' : score < -10 ? 'BEARISH' : 'NEUTRAL',
    description: `${name}: ${score > 0 ? '+' : ''}${score.toFixed(1)}`,
  }));
}

/**
 * Build fundamental factor inputs.
 */
export function buildFundamentalFactors(
  scores: Record<string, number>,
  weights: Record<string, number>,
): FactorInput[] {
  return Object.entries(scores).map(([name, score]) => ({
    factorName: name,
    factorType: 'fundamental' as const,
    score,
    weight: weights[name] ?? 0.15,
    signal: score > 10 ? 'BULLISH' : score < -10 ? 'BEARISH' : 'NEUTRAL',
    description: `Fundamental ${name}: ${score > 0 ? '+' : ''}${score.toFixed(1)}`,
  }));
}
