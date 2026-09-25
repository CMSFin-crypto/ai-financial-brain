// ═══════════════════════════════════════════════════════════════
// Ditar Top 10 — Ndjekja Live e Çmimeve
// GET /api/journal/price-watch
//
// Thirret nga UI (çdo 15 min / manualisht) ose nga një cron i jashtëm
// (p.sh. cron-job.org çdo 15 min gjatë orarit të tregut) për njoftime
// Telegram kur Top 10 kap hyrjen / targetin / stop-in.
// Idempotent — çdo njoftim dërgohet vetëm një herë për nivel.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { watchTop10Prices } from "@/lib/journal-price-watch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const result = await watchTop10Prices();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || "Gabim i panjohur",
        dbActive: false,
        events: [],
        errors: [String(error?.message || error)],
      },
      { status: 200 }
    );
  }
}

export async function POST() {
  return GET();
}
