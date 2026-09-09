import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ScannerStrategy } from "@prisma/client";

// Check if DATABASE_URL is configured for the current environment
function isDbConfigured(): boolean {
  // Strip quotes (Vercel may keep literal quotes from .env file)
  const url = (process.env.DATABASE_URL || "").replace(/^["']|["']$/g, "");
  if (!url) return false;
  // SQLite needs file: protocol — won't work on Vercel serverless
  if (url.startsWith("file:")) {
    // file: works only in local dev, not on Vercel
    return process.env.VERCEL !== "1";
  }
  // PostgreSQL/MySQL URLs work on Vercel
  return url.startsWith("postgresql:") || url.startsWith("mysql:");
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get("ticker")?.toUpperCase();
    const strategyParam = searchParams.get("strategy");
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);

    // If DB is not configured (e.g., Vercel without DATABASE_URL), return empty
    if (!isDbConfigured()) {
      return NextResponse.json({
        strategy: strategyParam || "IBKR_PULLBACK",
        total: 0,
        changes: [],
        notice: "Database nuk është konfiguruar në këtë mjedis. Snapshots ruhen vetëm në sandbox lokal.",
      });
    }

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
    // Return empty instead of 500 error when DB is unavailable
    return NextResponse.json({
      strategy: "IBKR_PULLBACK",
      total: 0,
      changes: [],
      error: "Database nuk është i aksesueshëm në këtë mjedis.",
    });
  }
}
