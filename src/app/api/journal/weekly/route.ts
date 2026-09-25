// ═══════════════════════════════════════════════════════════════
// Ditar Top 10 — raporti javor (i shkurtër, automatik)
// GET /api/journal/weekly?days=7
// ═══════════════════════════════════════════════════════════════
// Përmban: target/stop hit-rate, drejtimin e saktë, expectancy në R,
// 3 gabimet më të shpeshta, faktorët që ndihmuan, dhe "missed winners"
// (aksionet jashtë Top 10 që ecën mirë — nga snapshot-i i vogël).

import { NextRequest, NextResponse } from "next/server";
import { buildWeeklyReport } from "@/lib/top10-journal";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const days = Math.min(
      Math.max(parseInt(request.nextUrl.searchParams.get("days") || "7", 10) || 7, 1),
      90
    );
    const report = await buildWeeklyReport(days);
    return NextResponse.json(report);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Gabim i panjohur" },
      { status: 500 }
    );
  }
}
