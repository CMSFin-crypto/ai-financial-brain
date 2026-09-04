import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ScannerStrategy } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get("ticker")?.toUpperCase();
    const strategyParam = searchParams.get("strategy");
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);

    const strategy =
      strategyParam === "CATALYST_MOMENTUM"
        ? ScannerStrategy.CATALYST_MOMENTUM
        : ScannerStrategy.IBKR_PULLBACK;

    const changes = await prisma.rankingChange.findMany({
      where: {
        strategy,
        ...(ticker ? { ticker } : {}),
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
      include: {
        toSnapshot: {
          select: {
            snapshotAt: true,
            price: true,
            relativeVolume: true,
            aboveVwap: true,
            liquidityScore: true,
            marketRegime: true,
            riskFlags: true,
          },
        },
      },
    });

    return NextResponse.json({
      strategy,
      total: changes.length,
      changes,
    });
  } catch (err: any) {
    console.error("[SCANNER-LEARNING] Changes error:", err);
    return NextResponse.json({ error: err?.message || "Gabim" }, { status: 500 });
  }
}
