import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ScannerStrategy, SignalOutcomeType } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const strategyParam = searchParams.get("strategy");

    const strategy =
      strategyParam === "CATALYST_MOMENTUM"
        ? ScannerStrategy.CATALYST_MOMENTUM
        : ScannerStrategy.IBKR_PULLBACK;

    const outcomes = await prisma.signalOutcome.findMany({
      where: {
        strategy,
        outcome: { not: SignalOutcomeType.PENDING },
      },
      select: {
        outcome: true,
        nextDayCloseReturnPct: true,
        maxAdverseExcursionPct: true,
        hitTarget5Pct: true,
        hitTarget10Pct: true,
      },
      orderBy: { evaluatedAt: "desc" },
      take: 500,
    });

    const total = outcomes.length;

    const continuationCount = outcomes.filter(
      (row) =>
        row.outcome === SignalOutcomeType.CONTINUATION ||
        row.outcome === SignalOutcomeType.PULLBACK_SUCCESS
    ).length;

    const fadeCount = outcomes.filter(
      (row) =>
        row.outcome === SignalOutcomeType.FADE ||
        row.outcome === SignalOutcomeType.STOPPED_OUT
    ).length;

    const averageNextDayReturnPct =
      total > 0
        ? outcomes.reduce((sum, row) => sum + (row.nextDayCloseReturnPct ?? 0), 0) / total
        : 0;

    const averageDrawdownPct =
      total > 0
        ? outcomes.reduce((sum, row) => sum + (row.maxAdverseExcursionPct ?? 0), 0) / total
        : 0;

    return NextResponse.json({
      strategy,
      totalSignals: total,
      continuationCount,
      fadeCount,
      continuationRate: total > 0 ? Number(((continuationCount / total) * 100).toFixed(2)) : 0,
      fadeRate: total > 0 ? Number(((fadeCount / total) * 100).toFixed(2)) : 0,
      averageNextDayReturnPct: Number(averageNextDayReturnPct.toFixed(2)),
      averageDrawdownPct: Number(averageDrawdownPct.toFixed(2)),
      target5HitRate:
        total > 0
          ? Number(((outcomes.filter((row) => row.hitTarget5Pct).length / total) * 100).toFixed(2))
          : 0,
      target10HitRate:
        total > 0
          ? Number(((outcomes.filter((row) => row.hitTarget10Pct).length / total) * 100).toFixed(2))
          : 0,
    });
  } catch (err: any) {
    console.error("[SCANNER-LEARNING] Summary error:", err);
    return NextResponse.json({ error: err?.message || "Gabim" }, { status: 500 });
  }
}
