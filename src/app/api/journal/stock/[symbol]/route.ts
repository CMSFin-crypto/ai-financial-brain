// ═══════════════════════════════════════════════════════════════
// Ditar Top 10 — raporti i detajuar për një aksion (VETËM me kërkesë)
// GET /api/journal/stock/[symbol]?days=30
// ═══════════════════════════════════════════════════════════════
// Shembull: /api/journal/stock/NVDA
// Nëse aksioni nuk ka raport të ruajtur në Top 10, kthehet mesazhi
// përkatës — detajet NUK shfaqen automatikisht për çdo simbol.

import { NextRequest, NextResponse } from "next/server";
import { buildStockReport } from "@/lib/top10-journal";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const days = Math.min(
      Math.max(parseInt(request.nextUrl.searchParams.get("days") || "30", 10) || 30, 1),
      365
    );
    const report = await buildStockReport(symbol, days);
    return NextResponse.json(report);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Gabim i panjohur" },
      { status: 500 }
    );
  }
}
