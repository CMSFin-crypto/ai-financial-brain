import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ScannerStrategy, SignalOutcomeType } from "@prisma/client";
import { getRealPrice } from "@/lib/alpha-vantage";
import { calculateOutcome } from "@/lib/adaptive-scanner-learning";

// GET: Return recent outcomes
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const strategyParam = searchParams.get("strategy");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

    const strategy =
      strategyParam === "CATALYST_MOMENTUM"
        ? ScannerStrategy.CATALYST_MOMENTUM
        : ScannerStrategy.IBKR_PULLBACK;

    const outcomes = await prisma.signalOutcome.findMany({
      where: { strategy },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        snapshot: {
          select: {
            ticker: true,
            snapshotAt: true,
            price: true,
            decision: true,
            rank: true,
          },
        },
      },
    });

    return NextResponse.json({ strategy, total: outcomes.length, outcomes });
  } catch (err: any) {
    console.error("[SCANNER-LEARNING] Outcomes GET error:", err);
    return NextResponse.json({ error: err?.message || "Gabim" }, { status: 500 });
  }
}

// POST: Evaluate pending outcomes (fetch current prices and update)
export async function POST() {
  try {
    // Find pending outcomes from snapshots that are at least 1 hour old
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const pendingOutcomes = await prisma.signalOutcome.findMany({
      where: {
        outcome: SignalOutcomeType.PENDING,
        snapshot: { snapshotAt: { lte: oneHourAgo } },
      },
      take: 20,
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

    return NextResponse.json({
      checked: pendingOutcomes.length,
      evaluated,
      errors: errors.length ? errors : undefined,
    });
  } catch (err: any) {
    console.error("[SCANNER-LEARNING] Outcomes POST error:", err);
    return NextResponse.json({ error: err?.message || "Gabim" }, { status: 500 });
  }
}
