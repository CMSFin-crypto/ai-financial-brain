import { NextRequest, NextResponse } from 'next/server';
import { fetchQuarterlyFinancials, getEdgarFilingUrl } from '@/lib/sec-edgar';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker || ticker.trim().length < 1) {
    return NextResponse.json({ error: 'Ticker është i nevojshëm' }, { status: 400 });
  }

  const sym = ticker.trim().toUpperCase();

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
