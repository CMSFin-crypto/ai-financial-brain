import { NextResponse } from "next/server";
import { computeFactorInsights, getLearnedMultipliers } from "@/lib/scanner-learning/factor-insights";
import { getOutcomeProgress } from "@/lib/scanner-learning/backfill-outcomes";

// ═══ GET /api/scanner-learning/insights ═══
// "Çfarë mësoi sistemi" — për panelin Mësimet në Learning Engine:
//   - sample: sa rezultate, fitore/humbje, baza, a ka mjaftueshmërisht të dhëna
//   - zones: performanca për zonë faktori (p.sh. "RSI 50-60 → 67% fitore, n=12")
//   - multipliers: peshat aktive të aplikuara nga skaneri
//   - progress: vlerësuar vs PENDING
export async function GET() {
  try {
    const [insights, weights, progress] = await Promise.all([
      computeFactorInsights(),
      getLearnedMultipliers(),
      getOutcomeProgress(),
    ]);

    return NextResponse.json({
      ...insights,
      activeWeights: weights,
      progress,
    });
  } catch (err: any) {
    console.error("[SCANNER-LEARNING] Insights error:", err);
    return NextResponse.json({ error: err?.message || "Gabim" }, { status: 500 });
  }
}
