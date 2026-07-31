import { prisma } from "@/lib/prisma";

function mean(values: number[]) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function computeBrierScore(
  rows: { calibratedConfidence: number; actualOutcome: number | null }[]
) {
  const valid = rows.filter((r) => r.actualOutcome !== null);
  if (!valid.length) return null;

  return mean(
    valid.map((r) => {
      const f = r.calibratedConfidence / 100;
      const o = r.actualOutcome as number;
      return (f - o) ** 2;
    })
  );
}

function computeMaxDrawdown(returns: number[]) {
  let equity = 1;
  let peak = 1;
  let maxDd = 0;

  for (const r of returns) {
    equity *= 1 + r / 100;
    peak = Math.max(peak, equity);
    const dd = (equity - peak) / peak;
    maxDd = Math.min(maxDd, dd);
  }

  return Math.abs(maxDd) * 100;
}

export async function calculateModelMetrics(params?: {
  modelVersion?: string;
  horizonDays?: number;
  regime?: string;
}) {
  const rows = await prisma.prediction.findMany({
    where: {
      ...(params?.modelVersion ? { modelVersion: params.modelVersion } : {}),
      ...(params?.horizonDays ? { horizonDays: params.horizonDays } : {}),
      ...(params?.regime ? { regime: params.regime } : {}),
      evaluationStatus: "EVALUATED",
      actualOutcome: { not: null },
    },
    orderBy: { predictedAt: "asc" },
  });

  const sampleSize = rows.length;
  if (!sampleSize) {
    return {
      sampleSize: 0,
      accuracy: null,
      avgReturn: null,
      benchmarkReturn: null,
      alpha: null,
      winRate: null,
      brierScore: null,
      precisionBuy: null,
      recallBuy: null,
      noTradeRate: null,
      maxDrawdown: null,
    };
  }

  const accuracy = rows.filter((r) => r.wasCorrect).length / sampleSize;
  const avgReturn = mean(rows.map((r) => r.actualReturn ?? 0));
  const benchmarkReturn = mean(rows.map((r) => r.benchmarkReturn ?? 0));
  const alpha =
    avgReturn !== null && benchmarkReturn !== null
      ? avgReturn - benchmarkReturn
      : null;
  const winRate =
    rows.filter((r) => (r.actualReturn ?? 0) > 0).length / sampleSize;
  const brierScore = computeBrierScore(rows);

  const buys = rows.filter((r) => r.finalDecision === "BUY");
  const buyTp = buys.filter((r) => r.actualOutcome === 1).length;
  const actualPositives = rows.filter((r) => r.actualOutcome === 1).length;
  const precisionBuy = buys.length ? buyTp / buys.length : null;
  const recallBuy = actualPositives ? buyTp / actualPositives : null;
  const noTradeRate =
    rows.filter((r) => r.finalDecision === "NO_TRADE").length / sampleSize;
  const maxDrawdown = computeMaxDrawdown(
    rows.map((r) => r.actualReturn ?? 0)
  );

  return {
    sampleSize,
    accuracy,
    avgReturn,
    benchmarkReturn,
    alpha,
    winRate,
    brierScore,
    precisionBuy,
    recallBuy,
    noTradeRate,
    maxDrawdown,
  };
}

export async function snapshotModelMetrics(params: {
  modelVersion: string;
  horizonDays: number;
}) {
  const metrics = await calculateModelMetrics(params);

  return prisma.modelMetricSnapshot.create({
    data: {
      modelVersion: params.modelVersion,
      horizonDays: params.horizonDays,
      sampleSize: metrics.sampleSize,
      accuracy: metrics.accuracy,
      avgReturn: metrics.avgReturn,
      benchmarkReturn: metrics.benchmarkReturn,
      alpha: metrics.alpha,
      winRate: metrics.winRate,
      brierScore: metrics.brierScore,
      precisionBuy: metrics.precisionBuy,
      recallBuy: metrics.recallBuy,
      noTradeRate: metrics.noTradeRate,
      maxDrawdown: metrics.maxDrawdown,
    },
  });
}

export async function getMetricsHistory(params?: {
  modelVersion?: string;
  horizonDays?: number;
  days?: number;
}) {
  const days = params?.days ?? 90;
  const since = new Date();
  since.setDate(since.getDate() - days);

  return prisma.modelMetricSnapshot.findMany({
    where: {
      ...(params?.modelVersion
        ? { modelVersion: params.modelVersion }
        : {}),
      ...(params?.horizonDays
        ? { horizonDays: params.horizonDays }
        : {}),
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "asc" },
  });
}
