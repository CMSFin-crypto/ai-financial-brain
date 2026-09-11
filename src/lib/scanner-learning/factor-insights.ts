// ═══════════════════════════════════════════════════════════════
// FACTOR INSIGHTS — MOTORI I TË MËSUARIT NGA E KALUARA
// ═══════════════════════════════════════════════════════════════
// Analizon rezultatet e vlerësuara (SignalOutcome) bashkë me faktorët
// e ruajtur në momentin e sinjalit (ScannerSnapshot) dhe nxjerr:
//
//   1. ZONA INSIGHT (për UI):  "RSI 50-60 → 67% continuation (n=12)"
//   2. MULTIPLIKATORË TË PESHËS (për skaner): TREND/VOLUME/MOMENTUM/
//      LIQUIDITY ×0.75–1.25 — bazuar në edge real kundër bazës.
//
// Rregulla anti-nëmëri:
//   - Deduplikim: 1 sinjal për (ticker, ditë) — skanimet e përsëritura
//     të të njëjtës ditë nuk inflationojnë mostra
//   - MIN_TOTAL=30 fitore+humje, zona me n<5 nuk vlerësohen
//   - Multiplikatorët levizin max ±0.05 për përditësim (smoothing)
//   - NO_EDGE nuk numërohet as fitje as humbje

import { prisma } from "@/lib/prisma";
import { SignalOutcomeType } from "@prisma/client";

const MIN_TOTAL = 30; // fitore+humje minimale para aplikimit të multiplikatorëve
const MIN_ZONE_N = 5; // mostra minimale brenda një zone
const MAX_STEP = 0.05; // lëvizja maksimale për update
const MULT_MIN = 0.75;
const MULT_MAX = 1.25;
const CACHE_TTL_MS = 5 * 60 * 1000;

// ── Zonat e faktorëve për analiza (UI) ──
type ZoneDef = {
  factor: string;
  label: string;
  field: string; // emri i fushës në snapshot
  buckets: Array<{ label: string; min?: number; max?: number; value?: string }>;
};

const ZONE_DEFS: ZoneDef[] = [
  {
    factor: "RSI",
    label: "RSI",
    field: "rsi14",
    buckets: [
      { label: "RSI < 40", max: 40 },
      { label: "RSI 40-50", min: 40, max: 50 },
      { label: "RSI 50-60", min: 50, max: 60 },
      { label: "RSI 60-70", min: 60, max: 70 },
      { label: "RSI 70+", min: 70 },
    ],
  },
  {
    factor: "ADX",
    label: "ADX (forca e trendit)",
    field: "adx14",
    buckets: [
      { label: "ADX < 20", max: 20 },
      { label: "ADX 20-25", min: 20, max: 25 },
      { label: "ADX 25-35", min: 25, max: 35 },
      { label: "ADX 35+", min: 35 },
    ],
  },
  {
    factor: "TREND",
    label: "Trend Score",
    field: "trendScore",
    buckets: [
      { label: "Trend < 50", max: 50 },
      { label: "Trend 50-70", min: 50, max: 70 },
      { label: "Trend 70+", min: 70 },
    ],
  },
  {
    factor: "VOLUME",
    label: "Volume Score",
    field: "volumeScore",
    buckets: [
      { label: "Volum < 50", max: 50 },
      { label: "Volum 50-70", min: 50, max: 70 },
      { label: "Volum 70+", min: 70 },
    ],
  },
  {
    factor: "LIQUIDITY",
    label: "Likuiditeti",
    field: "liquidityScore",
    buckets: [
      { label: "Likuid < 60", max: 60 },
      { label: "Likuid 60-80", min: 60, max: 80 },
      { label: "Likuid 80+", min: 80 },
    ],
  },
  {
    factor: "REGIME",
    label: "Regjimi i tregut",
    field: "marketRegime",
    buckets: [{ label: "BEAR", value: "BEAR" }, { label: "BULL", value: "BULL" }],
  },
  {
    factor: "RANK",
    label: "Renditja në skaner",
    field: "rank",
    buckets: [
      { label: "Rank #1-3", max: 3 },
      { label: "Rank #4-7", min: 4, max: 7 },
      { label: "Rank #8+", min: 8 },
    ],
  },
];

type OutcomeRow = {
  ticker: string;
  outcome: string;
  nextDayCloseReturnPct: number | null;
  threeDayReturnPct: number | null;
  snapshot: {
    snapshotAt: Date;
    rsi14: number | null;
    adx14: number | null;
    trendScore: number | null;
    volumeScore: number | null;
    liquidityScore: number | null;
    marketRegime: string | null;
    rank: number | null;
  } | null;
};

function classify(outcome: string): "WIN" | "LOSS" | "NEUTRAL" {
  if (outcome === SignalOutcomeType.CONTINUATION || outcome === SignalOutcomeType.PULLBACK_SUCCESS) return "WIN";
  if (outcome === SignalOutcomeType.FADE || outcome === SignalOutcomeType.STOPPED_OUT) return "LOSS";
  return "NEUTRAL";
}

function retOf(row: OutcomeRow): number | null {
  return row.threeDayReturnPct ?? row.nextDayCloseReturnPct ?? null;
}

// ═══ Analiza kryesore — lexon DB, kthen insights + multiplikatorë ═══
export async function computeFactorInsights() {
  const rows = (await prisma.signalOutcome.findMany({
    where: { outcome: { not: SignalOutcomeType.PENDING } },
    orderBy: { evaluatedAt: "desc" },
    take: 500,
    include: {
      snapshot: {
        select: {
          snapshotAt: true,
          rsi14: true,
          adx14: true,
          trendScore: true,
          volumeScore: true,
          liquidityScore: true,
          marketRegime: true,
          rank: true,
        },
      },
    },
  })) as unknown as OutcomeRow[];

  // Deduplikim: 1 rast për (ticker, ditë sinjali)
  const seen = new Set<string>();
  const unique: OutcomeRow[] = [];
  for (const row of rows) {
    if (!row.snapshot) continue;
    const day = row.snapshot.snapshotAt.toISOString().split("T")[0];
    const key = `${row.ticker}_${day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }

  const wins = unique.filter((r) => classify(r.outcome) === "WIN").length;
  const losses = unique.filter((r) => classify(r.outcome) === "LOSS").length;
  const decisive = wins + losses;
  const rets = unique.map(retOf).filter((r): r is number => r != null);
  const baselineWinRate = decisive > 0 ? wins / decisive : 0;
  const avgReturn = rets.length > 0 ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;

  // ── Zona insights ──
  const zones: Array<{
    factor: string;
    zone: string;
    n: number;
    wins: number;
    losses: number;
    winRate: number;
    avgReturn: number;
    edge: number; // winRate - baseline (pikë përqindje × 100 në fund)
  }> = [];

  for (const def of ZONE_DEFS) {
    for (const bucket of def.buckets) {
      const inZone = unique.filter((r) => {
        const v = (r.snapshot as any)?.[def.field];
        if (v == null) return false;
        if (bucket.value != null) return String(v).toUpperCase() === bucket.value;
        const num = Number(v);
        if (bucket.min != null && num < bucket.min) return false;
        if (bucket.max != null && num >= bucket.max) return false;
        return true;
      });
      if (inZone.length < MIN_ZONE_N) continue;
      const w = inZone.filter((r) => classify(r.outcome) === "WIN").length;
      const l = inZone.filter((r) => classify(r.outcome) === "LOSS").length;
      if (w + l < MIN_ZONE_N) continue;
      const zr = inZone.map(retOf).filter((r): r is number => r != null);
      const zAvg = zr.length ? zr.reduce((a, b) => a + b, 0) / zr.length : 0;
      const zRate = w / (w + l);
      zones.push({
        factor: def.factor,
        zone: bucket.label,
        n: w + l,
        wins: w,
        losses: l,
        winRate: Math.round(zRate * 100),
        avgReturn: Math.round(zAvg * 100) / 100,
        edge: Math.round((zRate - baselineWinRate) * 100), // pikë përqindje
      });
    }
  }

  // ── Multiplikatorë të peshës (median-split për TREND/VOLUME, zona për MOMENTUM/LIQUIDITY) ──
  const enoughData = decisive >= MIN_TOTAL;
  const multipliers: Record<string, number> = { TREND: 1, VOLUME: 1, MOMENTUM: 1, LIQUIDITY: 1 };

  if (enoughData) {
    const splitEdge = (field: string): number | null => {
      const vals = unique
        .map((r) => (r.snapshot as any)?.[field])
        .filter((v): v is number => typeof v === "number" && v != null)
        .sort((a, b) => a - b);
      if (vals.length < 10) return null;
      const median = vals[Math.floor(vals.length / 2)];
      const high = unique.filter((r) => {
        const v = (r.snapshot as any)?.[field];
        return typeof v === "number" && v > median;
      });
      const low = unique.filter((r) => {
        const v = (r.snapshot as any)?.[field];
        return typeof v === "number" && v <= median;
      });
      const hw = high.filter((r) => classify(r.outcome) === "WIN").length;
      const hl = high.filter((r) => classify(r.outcome) === "LOSS").length;
      const lw = low.filter((r) => classify(r.outcome) === "WIN").length;
      const ll = low.filter((r) => classify(r.outcome) === "LOSS").length;
      if (hw + hl < MIN_ZONE_N || lw + ll < MIN_ZONE_N) return null;
      return hw / (hw + hl) - lw / (lw + ll);
    };

    const fromEdge = (edge: number | null): number => {
      if (edge == null) return 1;
      // edge ±0.2 → multiplikator ±0.10 (i butë dhe i kapur)
      const m = 1 + Math.max(-0.25, Math.min(0.25, edge / 2));
      return Math.max(MULT_MIN, Math.min(MULT_MAX, Math.round(m * 100) / 100));
    };

    multipliers.TREND = fromEdge(splitEdge("trendScore"));
    multipliers.VOLUME = fromEdge(splitEdge("volumeScore"));

    // MOMENTUM nga RSI: edge e zonës më të mirë me mostër të mjaftueshme
    const rsiZones = zones.filter((z) => z.factor === "RSI");
    const bestRsi = rsiZones.reduce((best, z) => (z.edge > (best?.edge ?? -999) ? z : best), undefined as typeof rsiZones[number] | undefined);
    multipliers.MOMENTUM = bestRsi && bestRsi.edge > 0 ? fromEdge(bestRsi.edge / 100) : 1;

    // LIQUIDITY nga zonat e likuiditetit
    const liqZones = zones.filter((z) => z.factor === "LIQUIDITY");
    const bestLiq = liqZones.reduce((best, z) => (z.edge > (best?.edge ?? -999) ? z : best), undefined as typeof liqZones[number] | undefined);
    multipliers.LIQUIDITY = bestLiq && bestLiq.edge > 0 ? fromEdge(bestLiq.edge / 100) : 1;
  }

  return {
    sample: {
      evaluated: unique.length,
      wins,
      losses,
      neutral: unique.length - wins - losses,
      decisive,
      baselineWinRate: Math.round(baselineWinRate * 100),
      avgReturnPct: Math.round(avgReturn * 100) / 100,
      minRequired: MIN_TOTAL,
      enoughData,
    },
    zones: zones.sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge)),
    multipliers,
  };
}

// ═══ Persisto multiplikatorët në ScannerFactorWeight ═══
export async function applyFactorWeights(multipliers: Record<string, number>, sampleSize: number, winRate: number) {
  for (const [factor, target] of Object.entries(multipliers)) {
    const prev = await prisma.scannerFactorWeight.findUnique({ where: { factor } });
    // Butësia: lëviz max MAX_STEP nga pesha e mëparshme
    const capped = prev
      ? Math.max(prev.weight - MAX_STEP, Math.min(prev.weight + MAX_STEP, target))
      : target;
    await prisma.scannerFactorWeight.upsert({
      where: { factor },
      create: { factor, weight: Math.round(capped * 1000) / 1000, sampleSize, winRate },
      update: { weight: Math.round(capped * 1000) / 1000, sampleSize, winRate },
    });
  }
  const saved = await prisma.scannerFactorWeight.findMany();
  return saved.map((w) => ({ factor: w.factor, weight: w.weight, sampleSize: w.sampleSize, winRate: w.winRate, updatedAt: w.updatedAt }));
}

// ═══ Lexo multiplikatorët aktivë (me cache memorie 5 min) ═══
let cache: { at: number; value: any } | null = null;

export async function getLearnedMultipliers() {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.value;

  const defaults = {
    TREND: 1,
    RS: 1,
    MOMENTUM: 1,
    VOLUME: 1,
    SETUP: 1,
    LIQUIDITY: 1,
    RISK: 1,
    learnedFrom: 0,
    updatedAt: null as string | null,
  };

  try {
    const rows = await prisma.scannerFactorWeight.findMany();
    const value = { ...defaults };
    let learnedFrom = 0;
    for (const r of rows) {
      if (r.factor in value && typeof value[r.factor as keyof typeof value] === "number") {
        (value as any)[r.factor] = Math.max(MULT_MIN, Math.min(MULT_MAX, r.weight));
      }
      learnedFrom = Math.max(learnedFrom, r.sampleSize);
    }
    value.learnedFrom = learnedFrom;
    value.updatedAt = rows[0]?.updatedAt?.toISOString() ?? null;
    cache = { at: now, value };
    return value;
  } catch {
    return defaults;
  }
}

// ═══ Cikli i plotë: vlerëso → analizo → persisto ═══
export async function runLearningCycle() {
  const { evaluatePendingOutcomes } = await import("@/lib/scanner-learning/backfill-outcomes");
  const evaluation = await evaluatePendingOutcomes(80);
  const insights = await computeFactorInsights();
  const weights =
    insights.sample.enoughData && insights.sample.decisive > 0
      ? await applyFactorWeights(
          insights.multipliers,
          insights.sample.decisive,
          insights.sample.baselineWinRate / 100
        )
      : await prisma.scannerFactorWeight.findMany().catch(() => []);
  cache = null; // invalido cache-n që skaneri t'i shohë menjëherë
  return { evaluation, insights, weights };
}
