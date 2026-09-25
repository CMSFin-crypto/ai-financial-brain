import { NextRequest, NextResponse } from 'next/server';
import { getCamsNewsIntel } from '@/lib/cams/news-intel';

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════
// GET /api/cams-news?symbol=DELL
// Task 20 — Lajme & Negociata për një kandidat CAMS Top 10:
//   çfarë po negociohet, lajme të rëndësishme, impakti pozitiv/negativ
// dhe pesha e mundshme në të ardhmen. Cache 15-min në server.
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const symbol = (request.nextUrl.searchParams.get('symbol') || '').trim().toUpperCase();

    if (!symbol || !/^[A-Z]{1,5}$/.test(symbol)) {
      return NextResponse.json({ error: 'Simboli mungon ose është i pavlefshëm' }, { status: 400 });
    }

    const result = await getCamsNewsIntel(symbol);

    return NextResponse.json({
      ...result,
      note: 'Analizë automatike e titujve nga Google News — verifiko gjithmonë në burim përpara vendimit.',
    });
  } catch (err: any) {
    console.error('[CAMS-NEWS] Error:', err?.message || err);
    return NextResponse.json(
      { error: err?.message || 'Gabim në marrjen e lajmeve' },
      { status: 500 },
    );
  }
}
