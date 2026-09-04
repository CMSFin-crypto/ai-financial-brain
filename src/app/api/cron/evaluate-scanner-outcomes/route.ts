// ═══════════════════════════════════════════════════════════════
// Evaluate Scanner Outcomes Cron — Evaluates pending signal outcomes
// Fetches current prices and updates PENDING outcomes with real data
// Schedule: Daily at 16:30 ET (after market close)
// Call: GET /api/cron/evaluate-scanner-outcomes
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ScannerStrategy, SignalOutcomeType } from "@prisma/client";
import { getRealPrice } from "@/lib/alpha-vantage";
import { calculateOutcome, shouldAllowWeightUpdate } from "@/lib/adaptive-scanner-learning";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  // Auth check
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    // ── Phase 1: Evaluate pending outcomes ──
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const pendingOutcomes = await prisma.signalOutcome.findMany({
      where: {
        outcome: SignalOutcomeType.PENDING,
        snapshot: { snapshotAt: { lte: oneHourAgo } },
      },
      take: 50,
      include: { snapshot: true },
    });

    let evaluated = 0;
    const errors: string[] = [];

    for (const outcome of pendingOutcomes) {
      try {
        const currentPrice = await getRealPrice(outcome.ticker);
        if (!currentPrice) {
          errors.push(`${outcome.ticker}: no price`);
          continue;
        }

        const entryPrice = outcome.entryPrice;
        const snapshotAge = Date.now() - outcome.snapshot.snapshotAt.getTime();
        const hoursSinceSnapshot = snapshotAge / (60 * 60 * 1000);

        const result = calculateOutcome({
          entryPrice,
          priceAfter1Hour: hoursSinceSnapshot >= 1 ? currentPrice.price : null,
          closePrice: hoursSinceSnapshot >= 4 ? currentPrice.price : null,
          nextDayOpenPrice: hoursSinceSnapshot >= 18 ? currentPrice.price : null,
          nextDayHighPrice: hoursSinceSnapshot >= 24 ? currentPrice.price : null,
          nextDayClosePrice: hoursSinceSnapshot >= 24 ? currentPrice.price : null,
          threeDayClosePrice: hoursSinceSnapshot >= 72 ? currentPrice.price : null,
        });

        // Only finalize if we have enough data (at least 1 day)
        if (hoursSinceSnapshot < 24) continue;

        await prisma.signalOutcome.update({
          where: { id: outcome.id },
          data: {
            priceAfter1Hour: result.return1HourPct !== null ? entryPrice * (1 + (result.return1HourPct / 100)) : null,
            closePrice: result.returnToClosePct !== null ? entryPrice * (1 + (result.returnToClosePct / 100)) : null,
            nextDayClosePrice: result.nextDayCloseReturnPct !== null ? entryPrice * (1 + (result.nextDayCloseReturnPct / 100)) : null,
            threeDayClosePrice: result.threeDayReturnPct !== null ? entryPrice * (1 + (result.threeDayReturnPct / 100)) : null,
            return1HourPct: result.return1HourPct,
            returnToClosePct: result.returnToClosePct,
            nextDayCloseReturnPct: result.nextDayCloseReturnPct,
            threeDayReturnPct: result.threeDayReturnPct,
            hitTarget5Pct: result.hitTarget5Pct,
            hitTarget10Pct: result.hitTarget10Pct,
            outcome: result.outcome,
            evaluatedAt: new Date(),
          },
        });

        evaluated++;
      } catch (e) {
        errors.push(`${outcome.ticker}: ${e}`);
      }
    }

    // ── Phase 2: Update adaptive factor weights (weekly) ──
    let weightsUpdated = 0;
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ...
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Only update weights on weekdays
    if (!isWeekend) {
      const factorStats = await prisma.adaptiveFactorStat.findMany({
        where: { isEnabled: true },
      });

      for (const stat of factorStats) {
        const update = shouldAllowWeightUpdate({
          sampleSize: stat.sampleSize,
          currentWeight: stat.currentWeight,
          hitRate: stat.hitRate,
          averageReturnPct: stat.averageReturnPct,
          averageDrawdownPct: stat.averageDrawdownPct,
        });

        if (update.shouldUpdate) {
          await prisma.adaptiveFactorStat.update({
            where: { id: stat.id },
            data: {
              proposedWeight: update.proposedWeight,
            },
          });
          weightsUpdated++;
        }
      }
    }

    const elapsedMs = Date.now() - startTime;

    return NextResponse.json({
      status: "ok",
      elapsedMs,
      pendingChecked: pendingOutcomes.length,
      evaluated,
      weightsUpdated,
      errors: errors.length ? errors.slice(0, 10) : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[CRON-EVALUATE-SCANNER] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
