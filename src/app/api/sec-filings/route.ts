import { NextRequest, NextResponse } from 'next/server';
import { fetchQuarterlyFinancials, fetchRecentFilings, getEdgarFilingUrl, getFilingUrl } from '@/lib/sec-edgar';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');
  const type = searchParams.get('type');

  if (!ticker || ticker.trim().length < 1) {
    return NextResponse.json({ error: 'Ticker është i nevojshëm' }, { status: 400 });
  }

  const sym = ticker.trim().toUpperCase();

  // === 8-K / Meeting Minutes mode ===
  if (type === '8k' || type === 'filings') {
    try {
      const formTypes = (searchParams.get('forms') || '8-K,DEF 14A,10-Q,10-K').split(',');
      const result = await fetchRecentFilings(sym, formTypes, 25);

      if (!result || result.filings.length === 0) {
        return NextResponse.json(
          { error: `Nuk u gjetën filings për ${sym}` },
          { status: 404 }
        );
      }

      const filingsWithUrls = result.filings.map(f => ({
        ...f,
        edgarUrl: getFilingUrl(result.cik, f.accessionNumber),
      }));

      return NextResponse.json({
        ticker: sym,
        companyName: result.companyName,
        cik: result.cik,
        filings: filingsWithUrls,
        filingCount: filingsWithUrls.length,
      });
    } catch (err) {
      console.error(`[SEC FILINGS] 8-K error for ${sym}:`, err);
      return NextResponse.json({ error: 'Gabim gjatë marrjes së 8-K' }, { status: 500 });
    }
  }

  // === Default: 10-Q financial data ===
  try {
    const data = await fetchQuarterlyFinancials(sym);

    if (!data) {
      return NextResponse.json(
        { error: `Nuk u gjetën të dhëna 10-Q për ${sym}. Sigurohuni që ticker-i është korrekt dhe kompania raporton në SEC.` },
        { status: 404 }
      );
    }

    const edgarUrl = getEdgarFilingUrl(data.cik);

    return NextResponse.json({
      ticker: data.ticker,
      companyName: data.companyName,
      cik: data.cik,
      edgarUrl,
      quarters: data.quarters,
      quarterCount: data.quarters.length,
    });
  } catch (err) {
    console.error(`[SEC FILINGS] Error for ${sym}:`, err);
    return NextResponse.json({ error: 'Gabim gjatë marrjes së të dhënave 10-Q' }, { status: 500 });
  }
}
