// ============================================================
// Model Weights — Dynamic weight management from DB
// Weights are only updated when sample size >= minSample
// ============================================================

import prisma from './prisma';

export interface WeightResult {
  factorName: string;
  factorType: string;
  weight: number;
  sampleSize: number;
  accuracy: number;
}

// Default technical weights
const DEFAULT_TECHNICAL_WEIGHTS: Record<string, number> = {
  rsi: 0.10, macdHistogram: 0.08, bollinger: 0.08, maTrend: 0.12,
  stochastic: 0.06, adx: 0.06, atr: 0.03, roc: 0.08,
  obv: 0.07, volumeConfirm: 0.07, macdCrossover: 0.05, priceChannel: 0.05,
  divergence: 0.06, vwap: 0.04, pattern: 0.05,
};

// Default fundamental weights
const DEFAULT_FUNDAMENTAL_WEIGHTS: Record<string, number> = {
  valuation: 0.15, growth: 0.25, profitability: 0.15,
  analystSentiment: 0.20, debtHealth: 0.10, momentum: 0.15,
};

// Horizon-specific type weights
const HORIZON_TYPE_WEIGHTS: Record<number, { technical: number; fundamental: number; event: number }> = {
  1:  { technical: 0.75, fundamental: 0.15, event: 0.10 },
  5:  { technical: 0.50, fundamental: 0.30, event: 0.20 },
  20: { technical: 0.25, fundamental: 0.55, event: 0.20 },
};

const MIN_SAMPLE = 30;

/**
 * Seed default weights into DB if table is empty.
 * Called on app init or first prediction.
 */
export async function seedDefaultWeights(): Promise<void> {
  try {
    const existing = await prisma.modelWeight.count();
    if (existing > 0) return;

    console.log('[WEIGHTS] Seeding default weights...');
    const entries = [
      ...Object.entries(DEFAULT_TECHNICAL_WEIGHTS).map(([name, weight]) => ({
        factorName: name,
        factorType: 'technical',
        weight,
        minSample: MIN_SAMPLE,
      })),
      ...Object.entries(DEFAULT_FUNDAMENTAL_WEIGHTS).map(([name, weight]) => ({
        factorName: name,
        factorType: 'fundamental',
        weight,
        minSample: MIN_SAMPLE,
      })),
    ];

    await prisma.modelWeight.createMany({ data: entries });
    console.log(`[WEIGHTS] Seeded ${entries.length} default weights`);
  } catch (err) {
    console.error('[WEIGHTS] Seed failed:', err);
  }
}

/**
 * Get current weights for a given horizon.
 * Returns normalized weights for technical and fundamental factors.
 */
export async function getModelWeights(horizonDays: number = 1): Promise<{
  technical: Record<string, number>;
  fundamental: Record<string, number>;
  horizonRatios: { technical: number; fundamental: number; event: number };
}> {
  try {
    const dbWeights = await prisma.modelWeight.findMany();

    if (dbWeights.length === 0) {
      // Return defaults without DB
      const ratios = HORIZON_TYPE_WEIGHTS[horizonDays] || HORIZON_TYPE_WEIGHTS[1];
      return { technical: DEFAULT_TECHNICAL_WEIGHTS, fundamental: DEFAULT_FUNDAMENTAL_WEIGHTS, horizonRatios: ratios };
    }

    // Build weight maps
    const technical: Record<string, number> = {};
    const fundamental: Record<string, number> = {};

    for (const w of dbWeights) {
      if (w.sampleSize < w.minSample) {
        // Not enough data — use default
        const def = w.factorType === 'technical' ? DEFAULT_TECHNICAL_WEIGHTS[w.factorName] : DEFAULT_FUNDAMENTAL_WEIGHTS[w.factorName];
        if (def !== undefined) {
          if (w.factorType === 'technical') technical[w.factorName] = def;
          else fundamental[w.factorName] = def;
        }
      } else {
        // Use learned weight
        if (w.factorType === 'technical') technical[w.factorName] = w.weight;
        else fundamental[w.factorName] = w.weight;
      }
    }

    // Normalize each type to sum to 1
    normalizeRecord(technical);
    normalizeRecord(fundamental);

    const ratios = HORIZON_TYPE_WEIGHTS[horizonDays] || HORIZON_TYPE_WEIGHTS[1];
    return { technical, fundamental, horizonRatios: ratios };
  } catch (err) {
    console.error('[WEIGHTS] getModelWeights failed:', err);
    const ratios = HORIZON_TYPE_WEIGHTS[horizonDays] || HORIZON_TYPE_WEIGHTS[1];
    return { technical: DEFAULT_TECHNICAL_WEIGHTS, fundamental: DEFAULT_FUNDAMENTAL_WEIGHTS, horizonRatios: ratios };
  }
}

/**
 * Update weights after evaluating predictions.
 * Only updates factors that have sampleSize >= minSample.
 */
export async function updateWeightsAfterEvaluation(): Promise<{
  updated: number;
  details: { factorName: string; oldWeight: number; newWeight: number; accuracy: number }[];
}> {
  try {
    // Get all evaluated predictions with their factors
    const evaluatedPredictions = await prisma.prediction.findMany({
      where: { wasCorrect: { not: null } },
      include: { factors: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    if (evaluatedPredictions.length < MIN_SAMPLE) {
      return { updated: 0, details: [] };
    }

    // Per-factor accuracy tracking
    const tracker: Record<string, { sameSide: number; total: number; sameSideWeighted: number }> = {};

    for (const pred of evaluatedPredictions) {
      const returnPct = pred.returnPct ?? 0;
      const actualUp = returnPct > 0.1;
      const actualDown = returnPct < -0.1;

      for (const factor of pred.factors) {
        if (!tracker[factor.factorName]) {
          tracker[factor.factorName] = { sameSide: 0, total: 0, sameSideWeighted: 0 };
        }
        tracker[factor.factorName].total++;

        const factorBullish = factor.score > 0;
        if ((factorBullish && actualUp) || (!factorBullish && actualDown)) {
          tracker[factor.factorName].sameSide++;
          tracker[factor.factorName].sameSideWeighted += factor.weight;
        }
      }
    }

    // Update weights in DB
    const details: { factorName: string; oldWeight: number; newWeight: number; accuracy: number }[] = [];
    let updated = 0;

    for (const [factorName, t] of Object.entries(tracker)) {
      if (t.total < MIN_SAMPLE) continue;

      const accuracy = t.sameSide / t.total;
      const currentRow = await prisma.modelWeight.findUnique({ where: { factorName } });
      if (!currentRow) continue;

      const oldWeight = currentRow.weight;

      // Only update if accuracy data is meaningful
      const newWeight = Math.round(accuracy * 1000) / 1000;

      await prisma.modelWeight.update({
        where: { factorName },
        data: {
          weight: newWeight,
          accuracy: Math.round(accuracy * 100),
          sampleSize: t.total,
          updatedAt: new Date(),
        },
      });

      details.push({ factorName, oldWeight, newWeight, accuracy: Math.round(accuracy * 100) });
      updated++;
    }

    // Normalize weights per factor type
    for (const type of ['technical', 'fundamental']) {
      const rows = await prisma.modelWeight.findMany({ where: { factorType: type } });
      const sum = rows.reduce((s, r) => s + r.weight, 0);
      if (sum > 0) {
        for (const row of rows) {
          await prisma.modelWeight.update({
            where: { factorName: row.factorName },
            data: { weight: Math.round((row.weight / sum) * 1000) / 1000 },
          });
        }
      }
    }

    return { updated, details };
  } catch (err) {
    console.error('[WEIGHTS] updateWeightsAfterEvaluation failed:', err);
    return { updated: 0, details: [] };
  }
}

function normalizeRecord(record: Record<string, number>): void {
  const sum = Object.values(record).reduce((a, b) => a + b, 0);
  if (sum > 0) {
    for (const key of Object.keys(record)) {
      record[key] = Math.round((record[key] / sum) * 1000) / 1000;
    }
  }
}

/** Get all weights for display */
export async function getAllWeights(): Promise<WeightResult[]> {
  try {
    return await prisma.modelWeight.findMany({ orderBy: [{ factorType: 'asc' }, { weight: 'desc' }] });
  } catch (err) {
    console.error('[WEIGHTS] getAllWeights failed:', err);
    return [];
  }
}
