import { NextRequest, NextResponse } from "next/server";

// Check if we should even try to use the database
function shouldUseDb(): boolean {
  const url = (process.env.DATABASE_URL || "").replace(/^["']|["']$/g, "").trim();
  if (!url) return false;
  if (url.startsWith("file:")) {
    // SQLite works in local dev, not on Vercel serverless
    return process.env.VERCEL !== "1";
  }
  // PostgreSQL/MySQL work everywhere
  return url.startsWith("postgresql:") || url.startsWith("mysql:");
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get("ticker")?.toUpperCase();
    const strategyParam = searchParams.get("strategy") || "IBKR_PULLBACK";
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);

    // If DB is not available, return empty immediately
    if (!shouldUseDb()) {
      return NextResponse.json({
        strategy: strategyParam,
        total: 0,
        changes: [],
        notice: "Snapshots ruhen vetëm në sandbox lokal. Për Vercel, konfiguro PostgreSQL.",
      });
    }

    // Only import Prisma when DB is available
    const { prisma } = await import("@/lib/prisma");
    const { ScannerStrategy } = await import("@prisma/client");

    const strategy =
      strategyParam === "CATALYST_MOMENTUM"
        ? ScannerStrategy.CATALYST_MOMENTUM
        : ScannerStrategy.IBKR_PULLBACK;

    const changes = await prisma.rankingChange.findMany({
      where: {
        strategy,
        ...(ticker ? { ticker } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        toSnapshot: {
          select: {
            snapshotAt: true, price: true, relativeVolume: true,
            aboveVwap: true, liquidityScore: true, marketRegime: true, riskFlags: true,
          },
        },
      },
    });

    return NextResponse.json({ strategy, total: changes.length, changes });
  } catch (err: any) {
    console.error("[SCANNER-LEARNING] Changes error:", err);
    return NextResponse.json({
      strategy: "IBKR_PULLBACK",
      total: 0,
      changes: [],
      notice: "Snapshots ruhen vetëm në sandbox lokal.",
    });
  }
}
