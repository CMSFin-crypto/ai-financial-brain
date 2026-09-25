// ═══════════════════════════════════════════════════════════════
// DITARI JAVOR TOP 10 — API (Task 19)
// ═══════════════════════════════════════════════════════════════
// GET  /api/cams-journal?weeks=8&strategy=CAMS
//      → javët me Top 10, rezultatet (5d/10d/20d), analizën
//        "çfarë ndikoi", mësimet automatike dhe shënimet e userit.
// PUT  /api/cams-journal  body: { weekStart, ticker?, note, strategy? }
//      → ruan shënimin e përdoruesit (javë ose aksion specifik).
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { buildWeeklyReview, saveWeeklyNote } from "@/lib/cams-journal";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const weeks = Math.min(Math.max(parseInt(sp.get("weeks") || "8", 10) || 8, 1), 16);
    const strategyParam = sp.get("strategy") || "CAMS";
    const strategy = strategyParam === "IBKR" ? "IBKR_PULLBACK" : "CAMS";
    const report = await buildWeeklyReview(strategy as "CAMS" | "IBKR_PULLBACK", weeks);
    return NextResponse.json(report);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Gabim i panjohur" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body?.weekStart || typeof body.note !== "string") {
      return NextResponse.json({ error: "weekStart dhe note janë të detyrueshme" }, { status: 400 });
    }
    const result = await saveWeeklyNote({
      weekStart: String(body.weekStart),
      strategy: String(body.strategy || "CAMS"),
      ticker: body.ticker ? String(body.ticker) : "",
      note: String(body.note).slice(0, 4000),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Gabim i panjohur" },
      { status: 500 }
    );
  }
}
