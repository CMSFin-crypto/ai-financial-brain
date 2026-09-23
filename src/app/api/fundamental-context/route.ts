import { NextRequest, NextResponse } from 'next/server';
import { getRealFundamentalsBatch } from '@/lib/alpha-vantage';
import { normalizeYahooFundamentals, type FundamentalReport } from '@/lib/fundamentals/normalize';

// ═══════════════════════════════════════════════════════════════
// TASK 26 — FUNDAMENTAL CONTEXT për kandidatët e IBKR scanner-it
//
// GET /api/fundamental-context?symbols=AAPL,MSFT,NVDA
//
// Kthen raportin fundamental për secilën simbol: 7 seksionet e
// spec-it (Growth, Profitability, Cash Flow, Valuation, Earnings &
// Estimates, Ownership, Risk Flags) + FundamentalContext minimal
// (për objektin e kandidatit) + etiketa e kontekstit.
//
// ⚠️ FAZA 1: KONTEKST INFORMUES VETËM — nuk ndryshon Technical
// Score, READY, BUY ose WATCH. Testi rigoroz (Technical-only vs
// Technical + Fundamental filter) bëhet veçmas pas kësaj faze.
//
// Cache: 15 min në memorie (fundCache i alpha-vantage) + 5 min
// Cache-Control në edge — fundamentet nuk ndryshojnë brenda ditës.
// ═══════════════════════════════════════════════════════════════

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get('symbols') || '';
  const symbols = [...new Set(
    symbolsParam
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(s => /^[A-Z][A-Z0-9.]{0,5}$/.test(s)),
  )].slice(0, 15);

  if (symbols.length === 0) {
    return NextResponse.json(
      { error: 'Jep simbolet me ?symbols=AAPL,MSFT (max 15, pa ETF).' },
      { status: 400 },
    );
  }

  try {
    const funds = await getRealFundamentalsBatch(symbols);
    const results: Record<string, FundamentalReport> = {};
    for (const sym of symbols) {
      const f = funds[sym];
      if (!f) continue;
      results[sym] = normalizeYahooFundamentals(sym, f, {
        // nextEarningsDate vjen nga Yahoo earningsTrend (0q endDate) —
        // kalon te risk flags për "Earnings të afërta".
        nextEarningsDate: f.nextEarningsDate || undefined,
      });
    }

    return NextResponse.json(
      {
        fetchedAt: new Date().toISOString(),
        requested: symbols.length,
        obtained: Object.keys(results).length,
        missing: symbols.filter(s => !results[s]),
        results,
      },
      { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gabim i panjohur';
    console.error('[FUNDAMENTAL-CONTEXT] ERROR:', msg);
    return NextResponse.json({ error: `Themeloret nuk u moren: ${msg}` }, { status: 500 });
  }
}
