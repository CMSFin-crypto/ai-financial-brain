import { NextResponse } from "next/server";
import { runIBKRScan } from "@/app/api/ibkr-scan/route";
import { ScannerStrategy, ScannerDecision } from "@prisma/client";
import { saveStrategySnapshots } from "@/lib/scanner-snapshot-service";

// Maps existing Decision type to ScannerDecision enum
function mapDecision(d: string): ScannerDecision {
  const map: Record<string, ScannerDecision> = {
    READY: ScannerDecision.READY,
    WATCHLIST: ScannerDecision.WATCHLIST,
    EVENT_RISK: ScannerDecision.EXTENDED_RISK,
    EXTENDED: ScannerDecision.EXTENDED_RISK,
    NO_TRADE: ScannerDecision.NO_TRADE,
  };
  return map[d] || ScannerDecision.NO_TRADE;
}

export async function GET() {
  try {
    const t0 = Date.now();
    console.log("[CRON-SCANNER] Starting scanner snapshot...");

    // Run the IBKR scan
    const scanResult = await runIBKRScan();

    // Save snapshots for all top stocks
    const saveResult = await saveStrategySnapshots(
      ScannerStrategy.IBKR_PULLBACK,
      scanResult.results.map((stock, index) => ({
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

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[CRON-SCANNER] Saved ${saveResult.length} snapshots in ${elapsed}s`);

    return NextResponse.json({
      ok: true,
      stocksScanned: scanResult.results.length,
      snapshotsSaved: saveResult.length,
      elapsed: `${elapsed}s`,
    });
  } catch (err: any) {
    console.error("[CRON-SCANNER] Error:", err);
    return NextResponse.json({ error: err?.message || "Gabim" }, { status: 500 });
  }
}
