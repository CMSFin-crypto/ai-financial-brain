// ═══════════════════════════════════════════════════════════════
// GET /api/signal-journal — Ditari i Sinjaleve (Gjurmuesi)
// Kthen listën e sinjaleve (60 ditët e fundit) + statistikat sipas
// horizontit d1..d5 (CTC/REV të ndara) + ndarjet sipas sektorit dhe
// regjimit. Vetëm lexim — asnjë shkrim këtu.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma, isDbAvailable } from "@/lib/prisma";
import {
  computeSignalStats,
  JOURNAL_COST_PCT,
  type CheckpointsMap,
} from "@/lib/signal-journal";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDbAvailable()) {
    return NextResponse.json(
      { dbActive: false, entries: [], stats: null, error: "DB i pavlefshëm" },
      { status: 503 },
    );
  }
  try {
    const since = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
    const rows = await prisma.signalJournalEntry.findMany({
      where: { signalDate: { gte: since } },
      orderBy: [{ signalDate: "desc" }, { strategy: "asc" }, { symbol: "asc" }],
      take: 500,
    });

    const entries = rows.map((r) => ({
      id: r.id,
      strategy: r.strategy,
      symbol: r.symbol,
      companyName: r.companyName,
      sector: r.sector,
      signalDate: r.signalDate,
      entryDate: r.entryDate,
      entry: r.entry,
      stop: r.stop,
      target: r.target,
      score: r.score,
      regime: r.regime,
      noSlot: r.noSlot,
      slotNote: r.slotNote,
      checkpoints: (r.checkpoints ?? null) as CheckpointsMap | null,
      finalStatus: r.finalStatus,
      finalDate: r.finalDate,
      finalDayN: r.finalDayN,
      exitPrice: r.exitPrice,
      resultR: r.resultR,
      mfeR: r.mfeR,
      maeR: r.maeR,
      pnlPctNet: r.pnlPctNet,
    }));

    const stats = computeSignalStats(rows as never);
    return NextResponse.json(
      {
        dbActive: true,
        asOf: new Date().toISOString(),
        costPct: JOURNAL_COST_PCT,
        entries,
        stats,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e: unknown) {
    return NextResponse.json(
      {
        dbActive: isDbAvailable(),
        entries: [],
        stats: null,
        error: e instanceof Error ? e.message : "gabim",
      },
      { status: 500 },
    );
  }
}
