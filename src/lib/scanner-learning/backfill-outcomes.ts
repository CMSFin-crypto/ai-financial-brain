// ═══════════════════════════════════════════════════════════════
// BACKFILL / EVALUATION OF PENDING SIGNAL OUTCOMES
// ═══════════════════════════════════════════════════════════════
// Vlerëson rezultatet PENDING të skanerit me të dhëna HISTORIKE reale
// (Yahoo daily bars — jo çmimi live), sipas konventës:
//   - Skanim PARA hapjes së tregut (< 13:30 UTC) → seanca e NJËJTË ditë
//     llogaritet si "dita 1" pas sinjalit
//   - Skanim GJATË/PAS tregut → dita 1 = ditës tjetër trading
//   - FINALIZOHET vetëm kur ka të paktën 1 seancë të plotë pas sinjalit
//   - 3-ditor + MFE/MAE plotësohen kur ka 3 seanca
//
// Anti-ndotje: çdo (ticker, ditë skanimi) vlerësohet një herë — dublikatat
// nga skanime të shumta të të njëjtës ditë marrin të njëjtat vlera, dhe
// shtresa e insighteve deduplikon për statistika të pastruara.

import { prisma } from "@/lib/prisma";
import { fetchHistoricalData } from "@/lib/alpha-vantage";
import { calculateOutcome } from "@/lib/adaptive-scanner-learning";
import { SignalOutcomeType } from "@prisma/client";

const MIN_AGE_HOURS = 20; // vetëm outcome-t me snapshot ≥ 1 ditë (dhe ca orë)
const MARKET_OPEN_UTC = 13; // 13:30 UTC = 9:30 ET — përdoret si kufiri i paradritës

type DailyBar = { date: string; open: number; high: number; low: number; close: number; volume: number };

function barsAfterSnapshot(bars: DailyBar[], snapshotAt: Date): DailyBar[] {
  const scanDateStr = snapshotAt.toISOString().split("T")[0];
  // Skanim para 13:30 UTC → seanca e njëjtë ditë është pas sinjalit
  const openSameDayMs = Date.parse(`${scanDateStr}T${MARKET_OPEN}:30:00Z`);
  const beforeOpen = snapshotAt.getTime() < openSameDayMs;
  return bars.filter((b) => (beforeOpen ? b.date >= scanDateStr : b.date > scanDateStr));
}

// ═══ Vlerëso të gjitha PENDING të vjetra ═══
export async function evaluatePendingOutcomes(maxOutcomes = 80) {
  const cutoff = new Date(Date.now() - MIN_AGE_HOURS * 60 * 60 * 1000);

  const pending = await prisma.signalOutcome.findMany({
    where: {
      outcome: SignalOutcomeType.PENDING,
      snapshot: { snapshotAt: { lte: cutoff } },
    },
    orderBy: { createdAt: "asc" },
    take: maxOutcomes,
    include: { snapshot: true },
  });

  if (pending.length === 0) {
    return { checked: 0, evaluated: 0, skipped: 0, uniqueTickerDays: 0, errors: [] as string[] };
  }

  // Historiku një herë për ticker (cache në fetchHistoricalData)
  const tickers = [...new Set(pending.map((o) => o.ticker))];
  const histories: Record<string, DailyBar[] | null> = {};
  for (const t of tickers) {
    try {
      histories[t] = (await fetchHistoricalData(t, "1mo")) as DailyBar[] | null;
    } catch {
      histories[t] = null;
    }
  }

  let evaluated = 0;
  let skipped = 0;
  const errors: string[] = [];
  // Deduplikim: vetëm një vlerësim "primar" për (ticker, ditë skanimi)
  const seenTickerDays = new Set<string>();

  for (const outcome of pending) {
    try {
      const ticker = outcome.ticker;
      const scanDay = outcome.snapshot.snapshotAt.toISOString().split("T")[0];
      const dedupeKey = `${ticker}_${scanDay}`;

      const bars = histories[ticker];
      if (!bars || bars.length === 0) {
        errors.push(`${ticker}: pa historik`);
        skipped++;
        continue;
      }

      const after = barsAfterSnapshot(bars, outcome.snapshot.snapshotAt);
      if (after.length < 1) {
        skipped++; // nuk ka ende seancë të plotë pas sinjalit
        continue;
      }

      const day1 = after[0];
      const day3 = after[2] ?? null;
      const window = after.slice(0, 3);
      const maxFavorable = Math.max(...window.map((b) => b.high));
      const maxAdverse = Math.min(...window.map((b) => b.low));

      // Proxy: a mbylli dita-1 jeshil / a u mbajt low-i i ditës 1 deri në ditën 3
      const heldVwapToClose = day1.close >= day1.open;
      const heldDayOneLow = day3 ? day3.close >= day1.low : null;

      const result = calculateOutcome({
        entryPrice: outcome.entryPrice,
        nextDayOpenPrice: day1.open,
        nextDayHighPrice: day1.high,
        nextDayClosePrice: day1.close,
        threeDayClosePrice: day3 ? day3.close : null,
        maxFavorablePrice: maxFavorable,
        maxAdversePrice: maxAdverse,
        heldVwapToClose,
        heldDayOneLow,
      });

      // Etiketa fallback kur calculateOutcome mbetet PENDING (mungojnë fushat e VWAP-it)
      let finalOutcome = result.outcome;
      if (finalOutcome === SignalOutcomeType.PENDING) {
        const r3 = result.threeDayReturnPct;
        const r1 = result.nextDayCloseReturnPct ?? 0;
        const rEff = r3 ?? r1;
        if (rEff >= 3 || r1 >= 5) finalOutcome = SignalOutcomeType.CONTINUATION;
        else if (rEff <= -2 || r1 <= -3) finalOutcome = SignalOutcomeType.FADE;
        else finalOutcome = SignalOutcomeType.NO_EDGE;
      }

      const isPrimary = !seenTickerDays.has(dedupeKey);
      if (isPrimary) seenTickerDays.add(dedupeKey);

      await prisma.signalOutcome.update({
        where: { id: outcome.id },
        data: {
          nextDayOpenPrice: day1.open,
          nextDayHighPrice: day1.high,
          nextDayClosePrice: day1.close,
          threeDayClosePrice: day3 ? day3.close : null,
          nextDayOpenReturnPct: result.nextDayOpenReturnPct,
          nextDayHighReturnPct: result.nextDayHighReturnPct,
          nextDayCloseReturnPct: result.nextDayCloseReturnPct,
          threeDayReturnPct: result.threeDayReturnPct,
          maxFavorableExcursionPct: result.maxFavorableExcursionPct,
          maxAdverseExcursionPct: result.maxAdverseExcursionPct,
          hitTarget5Pct: result.hitTarget5Pct,
          hitTarget10Pct: result.hitTarget10Pct,
          heldVwapToClose,
          heldDayOneLow,
          outcome: finalOutcome,
          evaluatedAt: new Date(),
        },
      });
      evaluated++;
    } catch (e: any) {
      errors.push(`${outcome.ticker}: ${e?.message || e}`);
      skipped++;
    }
  }

  return {
    checked: pending.length,
    evaluated,
    skipped,
    uniqueTickerDays: seenTickerDays.size,
    errors: errors.slice(0, 10),
  };
}

// ═══ Statistika e shpejtë e progresit (për UI) ═══
export async function getOutcomeProgress() {
  const [evaluated, pendingTotal] = await Promise.all([
    prisma.signalOutcome.count({ where: { outcome: { not: SignalOutcomeType.PENDING } } }),
    prisma.signalOutcome.count({ where: { outcome: SignalOutcomeType.PENDING } }),
  ]);
  return { evaluated, pending: pendingTotal, total: evaluated + pendingTotal };
}
