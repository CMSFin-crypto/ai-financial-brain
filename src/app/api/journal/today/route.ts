// ═══════════════════════════════════════════════════════════════
// Ditar Top 10 — lista e ditës + historia e afërt
// GET /api/journal/today
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { getJournalToday } from "@/lib/top10-journal";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getJournalToday();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Gabim i panjohur", dbActive: false, entries: [] },
      { status: 200 }
    );
  }
}
