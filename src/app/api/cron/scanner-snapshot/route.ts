// ═══════════════════════════════════════════════════════════════
// Scanner Snapshot Cron — Runs IBKR scan and saves snapshots
// Schedule: 7 times per day (9:30, 10:30, 11:30, 12:30, 13:30, 14:30, 15:30 ET)
// Call: GET /api/cron/scanner-snapshot
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { runIBKRScan } from "@/app/api/ibkr-scan/route";
import { saveStrategySnapshots } from "@/lib/scanner-snapshot-service";
import { ScannerStrategy, ScannerDecision } from "@prisma/client";

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
    // Run the scanner
    const scanResult = await runIBKRScan();

    // Map decisions to ScannerDecision enum
    const mapDecision = (d: string): ScannerDecision => {
      const map: Record<string, ScannerDecision> = {
        READY: ScannerDecision.READY,
        WATCHLIST: ScannerDecision.WATCHLIST,
        EVENT_RISK: ScannerDecision.EXTENDED_RISK,
        EXTENDED: ScannerDecision.EXTENDED_RISK,
        NO_TRADE: ScannerDecision.NO_TRADE,
      };
      return map[d] || ScannerDecision.NO_TRADE;
    };

    // Save snapshots for IBKR Pullback strategy
    const saved = await saveStrategySnapshots(
      ScannerStrategy.IBKR_PULLBACK,
      scanResult.results.map((stock: any, index: number) => ({
        ticker: stock.symbol,
        rank: index + 1,
        totalScore: stock.totalScore,
        decision: mapDecision(stock.decision),
        price: stock.price,
        volume: stock.avgVol20d,
        averageVolume20D: stock.avgVol20d,
        avgDollarVolume20D: stock.avgDolVol20d,
        spreadPct: stock.spreadPct,
        liquidityScore: stock.liquidityScore,
        ema20: stock.ema20Val,
        sma50: stock.sma50Val,
        atr14: stock.atr,
        rsi14: stock.rsi,
        adx14: stock.adx,
        trendScore: stock.trendScore,
        volumeScore: stock.volConfScore,
        sector: stock.sector,
        marketRegime: scanResult.regimeOk ? "BULL" : "BEAR",
        reasons: stock.reasons,
        riskFlags: stock.warnings,
      }))
    );

    const elapsedMs = Date.now() - startTime;

    return NextResponse.json({
      status: "ok",
      elapsedMs,
      scannedAt: scanResult.scannedAt,
      regimeOk: scanResult.regimeOk,
      totalCandidates: scanResult.results.length,
      snapshotsSaved: saved.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[CRON-SCANNER-SNAPSHOT] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
