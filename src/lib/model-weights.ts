// ============================================================
// Model Weights v2 — 5-Factor Horizon-Specific Weight Management
//
// Weights per horizon:
//   1D:  technical 55%, spillover 20%, regime 10%, event 10%, fundamental 5%
//   3D:  technical 45%, spillover 20%, regime 13%, event 10%, fundamental 12%
//   7D:  fundamental 30%, regime 18%, technical 22%, spillover 18%, event 12%
//
// Learning uses 70/30 blending (70% old, 30% new evidence)
// with horizon + sector + regime awareness.
// ============================================================

import prisma from './prisma';

export interface WeightResult {
  factorName: string;
  factorType: string;
  weight: number;
  sampleSize: number;
  minSample: number;
  accuracy: number;
}

// ─── Horizon-specific type weights ──

export interface HorizonWeights {
  technical: number;
  spillover: number;
  regime: number;
  event: number;
  fundamental: number;
}

export const HORIZON_WEIGHTS: Record<number, HorizonWeights> = {
  1: { technical: 0.55, spillover: 0.20, regime: 0.10, event: 0.10, fundamental: 0.05 },
  3: { technical: 0.45, spillover: 0.20, regime: 0.13, event: 0.10, fundamental: 0.12 },
  7: { technical: 0.22, spillover: 0.18, regime: 0.18, event: 0.12, fundamental: 0.30 },
};

// ─── Default per-indicator weights ──

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

const DEFAULT_SPILLOVER_WEIGHTS: Record<string, number> = {
  kospi1d: 0.10, kospi2d: 0.08, nikkei1d: 0.08, hsi1d: 0.06,
  smh1d: 0.12, qqq1d: 0.10, vix1d: 0.10, spy1d: 0.10,
  sectorEtf1d: 0.08, riskAlignment: 0.10, asiaDeceleration: 0.08,
};

const DEFAULT_REGIME_WEIGHTS: Record<string, number> = {
  regimeScore: 0.40, transitionRisk: 0.25, vixLevel: 0.15,
  spyTrend: 0.10, breadth: 0.10,
};

const DEFAULT_EVENT_WEIGHTS: Record<string, number> = {
  earningsProximity: 0.35, fedProximity: 0.30,
  cpiProximity: 0.20, geopoliticalRisk: 0.15,
};

const MIN_SAMPLE = 30;
const BLEND_OLD = 0.70;
const BLEND_NEW = 0.30;

// ─── Seed defaults ──────────────────────────────────────────

export async function seedDefaultWeights(): Promise<void> {
  try {
    const existing = await prisma.modelWeight.count();
    if (existing > 0) return;

    console.log('[WEIGHTS] Seeding default weights...');
    const entries = [
      ...Object.entries(DEFAULT_TECHNICAL_WEIGHTS).map(([name, weight]) => ({
        factorName: name, factorType: 'technical', weight, minSample: MIN_SAMPLE,
      })),
      ...Object.entries(DEFAULT_FUNDAMENTAL_WEIGHTS).map(([name, weight]) => ({
        factorName: name, factorType: 'fundamental', weight, minSample: MIN_SAMPLE,
      })),
      ...Object.entries(DEFAULT_SPILLOVER_WEIGHTS).map(([name, weight]) => ({
        factorName: name, factorType: 'spillover', weight, minSample: MIN_SAMPLE,
      })),
      ...Object.entries(DEFAULT_REGIME_WEIGHTS).map(([name, weight]) => ({
        factorName: name, factorType: 'regime', weight, minSample: MIN_SAMPLE,
      })),
      ...Object.entries(DEFAULT_EVENT_WEIGHTS).map(([name, weight]) => ({
        factorName: name, factorType: 'event', weight, minSample: MIN_SAMPLE,
      })),
    ];

    await prisma.modelWeight.createMany({ data: entries });
    console.log(`[WEIGHTS] Seeded ${entries.length} default weights across 5 factor types`);
  } catch (err) {
    console.error('[WEIGHTS] Seed failed:', err);
  }
}

// ─── Get weights for a horizon ─────────────────────────────

export interface ModelWeightsResult {
  horizonWeights: HorizonWeights;
  technical: Record<string, number>;
  fundamental: Record<string, number>;
  spillover: Record<string, number>;
  regime: Record<string, number>;
  event: Record<string, number>;
}

export async function getModelWeights(horizonDays: number = 1): Promise<ModelWeightsResult> {
  try {
    const dbWeights = await prisma.modelWeight.findMany();
    const hw = HORIZON_WEIGHTS[horizonDays] ?? HORIZON_WEIGHTS[1];

    if (dbWeights.length === 0) {
      return {
        horizonWeights: hw,
        technical: { ...DEFAULT_TECHNICAL_WEIGHTS },
        fundamental: { ...DEFAULT_FUNDAMENTAL_WEIGHTS },
        spillover: { ...DEFAULT_SPILLOVER_WEIGHTS },
        regime: { ...DEFAULT_REGIME_WEIGHTS },
        event: { ...DEFAULT_EVENT_WEIGHTS },
      };
    }

    const buildMap = (type: string, defaults: Record<string, number>): Record<string, number> => {
      const map: Record<string, number> = {};
      const typeRows = dbWeights.filter(w => w.factorType === type);
      for (const [name, def] of Object.entries(defaults)) {
        const row = typeRows.find(r => r.factorName === name);
        if (row && row.sampleSize >= row.minSample) {
          map[name] = row.weight;
        } else {
          map[name] = def;
        }
      }
      normalizeRecord(map);
      return map;
    };

    return {
      horizonWeights: hw,
      technical: buildMap('technical', DEFAULT_TECHNICAL_WEIGHTS),
      fundamental: buildMap('fundamental', DEFAULT_FUNDAMENTAL_WEIGHTS),
      spillover: buildMap('spillover', DEFAULT_SPILLOVER_WEIGHTS),
      regime: buildMap('regime', DEFAULT_REGIME_WEIGHTS),
      event: buildMap('event', DEFAULT_EVENT_WEIGHTS),
    };
  } catch (err) {
    console.error('[WEIGHTS] getModelWeights failed:', err);
    const hw = HORIZON_WEIGHTS[horizonDays] ?? HORIZON_WEIGHTS[1];
    return {
      horizonWeights: hw,
      technical: { ...DEFAULT_TECHNICAL_WEIGHTS },
      fundamental: { ...DEFAULT_FUNDAMENTAL_WEIGHTS },
      spillover: { ...DEFAULT_SPILLOVER_WEIGHTS },
      regime: { ...DEFAULT_REGIME_WEIGHTS },
      event: { ...DEFAULT_EVENT_WEIGHTS },
    };
  }
}

// ─── Update weights after evaluation (with 70/30 blending) ─

export async function updateWeightsAfterEvaluation(options?: {
 horizonDays?: number;
  sector?: string;
  regime?: string;
}): Promise<{
  updated: number;
  details: { factorName: string; oldWeight: number; newWeight: number; accuracy: number }[];
}> {
  try {
    // Build query filter based on options
    const where: any = { wasCorrect: { not: null } };
    if (options?.horizonDays) where.horizonDays = options.horizonDays;
    if (options?.sector) where.sector = options.sector;
    if (options?.regime) where.regime = options.regime;

    const evaluatedPredictions = await prisma.prediction.findMany({
      where,
      include: { factors: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    if (evaluatedPredictions.length < MIN_SAMPLE) {
      return { updated: 0, details: [] };
    }

    // Compute per-factor accuracy
    const tracker: Record<string, { sameSide: number; total: number }> = {};

    for (const pred of evaluatedPredictions) {
      const actualReturn = pred.actualReturn ?? 0;
      const actualUp = actualReturn > 0.1;
      const actualDown = actualReturn < -0.1;

      for (const factor of pred.factors) {
        if (!tracker[factor.factorName]) {
          tracker[factor.factorName] = { sameSide: 0, total: 0 };
        }
        tracker[factor.factorName].total++;

        const factorBullish = factor.score > 0;
        if ((factorBullish && actualUp) || (!factorBullish && actualDown)) {
          tracker[factor.factorName].sameSide++;
        }
      }
    }

    const details: { factorName: string; oldWeight: number; newWeight: number; accuracy: number }[] = [];
    let updated = 0;

    for (const [factorName, t] of Object.entries(tracker)) {
      if (t.total < MIN_SAMPLE) continue;

      const accuracy = t.sameSide / t.total;
      const currentRow = await prisma.modelWeight.findUnique({ where: { factorName } });
      if (!currentRow) continue;

      const oldWeight = currentRow.weight;

      // ── 70/30 BLENDING: don't jump directly to accuracy ──
      // newWeight = 0.70 * oldWeight + 0.30 * accuracy
      // This prevents wild swings from small sample changes
      const evidenceWeight = accuracy;
      const blendedWeight = BLEND_OLD * oldWeight + BLEND_NEW * evidenceWeight;
      const newWeight = Math.round(blendedWeight * 1000) / 1000;

      await prisma.modelWeight.update({
        where: { factorName },
        data: {
          weight: newWeight,
          accuracy: Math.round(accuracy * 100),
          sampleSize: t.total,
          updatedAt: new Date(),
        },
      });

      details.push({
        factorName, oldWeight, newWeight,
        accuracy: Math.round(accuracy * 100),
      });
      updated++;
    }

    // Normalize weights per factor type (after blending)
    const factorTypes = ['technical', 'fundamental', 'spillover', 'regime', 'event'];
    for (const type of factorTypes) {
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

// ─── Helpers ────────────────────────────────────────────────

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
