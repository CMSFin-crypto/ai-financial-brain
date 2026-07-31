// ============================================================
// Prediction Factors — Store individual factor scores per prediction
// ============================================================

import prisma from './prisma';

export interface FactorInput {
  factorName: string;
  factorType: 'technical' | 'fundamental' | 'regime' | 'event' | 'relative_strength' | 'macro_global';
  score: number;      // -100 to +100
  weight: number;     // weight applied
  signal: string;     // BULLISH | BEARISH | NEUTRAL
  description: string;
}

/**
 * Save all factors for a prediction in a single transaction.
 */
export async function savePredictionFactors(
  predictionId: string,
  factors: FactorInput[],
): Promise<number> {
  try {
    const result = await prisma.predictionFactor.createMany({
      data: factors.map(f => ({
        predictionId,
        factorName: f.factorName,
        factorType: f.factorType,
        score: f.score,
        weight: f.weight,
        contribution: Math.round(f.score * f.weight * 100) / 100,
        signal: f.signal,
        description: f.description,
      })),
    });
    return result.count;
  } catch (err) {
    console.error('[FACTORS] savePredictionFactors failed:', err);
    return 0;
  }
}

/**
 * Get accuracy stats for a specific factor.
 */
export async function getFactorAccuracy(factorName: string): Promise<{
  factorName: string;
  total: number;
  sameSide: number;
  accuracy: number;
}> {
  try {
    const factors = await prisma.predictionFactor.findMany({
      where: { factorName },
      include: { prediction: { select: { returnPct: true, wasCorrect: true } } },
      take: 500,
    });

    let total = 0;
    let sameSide = 0;

    for (const f of factors) {
      const retPct = f.prediction.returnPct;
      if (retPct === null || retPct === undefined) continue;
      total++;
      const actualUp = retPct > 0.1;
      const actualDown = retPct < -0.1;
      const factorBullish = f.score > 0;
      if ((factorBullish && actualUp) || (!factorBullish && actualDown)) {
        sameSide++;
      }
    }

    return {
      factorName,
      total,
      sameSide,
      accuracy: total > 0 ? Math.round((sameSide / total) * 100) : 0,
    };
  } catch (err) {
    console.error(`[FACTORS] getFactorAccuracy(${factorName}) failed:`, err);
    return { factorName, total: 0, sameSide: 0, accuracy: 0 };
  }
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
