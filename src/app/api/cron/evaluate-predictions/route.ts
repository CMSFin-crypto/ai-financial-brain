import { NextRequest, NextResponse } from "next/server";
import { evaluateDuePredictions } from "@/lib/evaluate-due-predictions";
import { fetchHistoricalData } from "@/lib/alpha-vantage";
import { snapshotModelMetrics } from "@/lib/model-metrics";
import { sendKontrolAlerts, alertsConfigured } from "@/lib/alerts";

async function getPrice(symbol: string): Promise<number | null> {
  try {
    const data = await fetchHistoricalData(symbol, "5d");
    if (data && data.length > 0) {
      return data[data.length - 1].close;
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await evaluateDuePredictions(getPrice, 100);

    // Auto-snapshot metrics after evaluation
    type SnapshotRef = { id: string; createdAt: Date } | null;
    let snapshot: SnapshotRef = null;
    const evaluated = results.filter((r) => r.status === "ok").length;
    if (evaluated > 0) {
      const snap = await snapshotModelMetrics({
        modelVersion: "predict-v3-regime-spillover",
        horizonDays: 1,
      }).catch(() => null as SnapshotRef);
      if (snap) snapshot = { id: snap.id, createdAt: snap.createdAt };
    }

    // Telegram alert: CRITICAL drift (or daily digest if enabled).
    // Never let alerting break the evaluation cron.
    let alert = { sent: false, level: "disabled" as string, detail: alertsConfigured() ? "" : "alerts not configured" };
    try {
      alert = await sendKontrolAlerts();
    } catch {
      alert = { sent: false, level: "error", detail: "sendKontrolAlerts threw" };
    }

    return NextResponse.json({
      processed: results.length,
      evaluated,
      metricsSnapshot: snapshot,
      alert,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[CRON-EVAL] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
