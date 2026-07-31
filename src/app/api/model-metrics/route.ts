import { NextRequest, NextResponse } from "next/server";
import { calculateModelMetrics, snapshotModelMetrics, getMetricsHistory } from "@/lib/model-metrics";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const modelVersion = url.searchParams.get("modelVersion") ?? undefined;
    const horizonDaysParam = url.searchParams.get("horizonDays");
    const regime = url.searchParams.get("regime") ?? undefined;
    const horizonDays = horizonDaysParam ? Number(horizonDaysParam) : undefined;
    const history = url.searchParams.get("history") === "true";
    const daysParam = url.searchParams.get("days");
    const days = daysParam ? Number(daysParam) : undefined;

    if (history) {
      const snapshots = await getMetricsHistory({ modelVersion, horizonDays, days });
      return NextResponse.json({ snapshots });
    }

    const metrics = await calculateModelMetrics({ modelVersion, horizonDays, regime });
    return NextResponse.json(metrics);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[MODEL-METRICS] GET failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const modelVersion = body?.modelVersion;
    const horizonDays = Number(body?.horizonDays ?? 1);

    if (!modelVersion || typeof modelVersion !== "string") {
      return NextResponse.json(
        { error: "modelVersion (string) is required" },
        { status: 400 }
      );
    }

    if (horizonDays < 1 || horizonDays > 365) {
      return NextResponse.json(
        { error: "horizonDays must be between 1 and 365" },
        { status: 400 }
      );
    }

    const snapshot = await snapshotModelMetrics({ modelVersion, horizonDays });
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[MODEL-METRICS] POST failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
