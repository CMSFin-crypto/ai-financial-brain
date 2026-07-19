import { NextRequest, NextResponse } from 'next/server';
import { fetchHistoricalData } from '@/lib/alpha-vantage';

export const maxDuration = 60;

/**
 * Calculate Pearson correlation coefficient between two arrays.
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let covXY = 0;
  let varX = 0;
  let varY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    covXY += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  const denom = Math.sqrt(varX * varY);
  return denom === 0 ? 0 : covXY / denom;
}

/**
 * Calculate daily returns from closing prices.
 */
function dailyReturns(closes: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
  }
  return returns;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get('symbols') || 'AAPL,MSFT,GOOGL,AMZN,NVDA,META,TSLA';
    const symbols = symbolsParam.split(',').map(s => s.toUpperCase().trim()).filter(Boolean);

    if (symbols.length < 2) {
      return NextResponse.json(
        { error: 'Kërkohen të paktën 2 simbole' },
        { status: 400 }
      );
    }

    // Fetch historical data for each symbol
    const returnsMap: Record<string, number[]> = {};
    const fetchedSymbols: string[] = [];

    // Fetch sequentially to avoid rate limiting
    for (const symbol of symbols) {
      const data = await fetchHistoricalData(symbol, '6mo');
      if (data && data.length > 10) {
        returnsMap[symbol] = dailyReturns(data.map(d => d.close));
        fetchedSymbols.push(symbol);
      }
    }

    if (fetchedSymbols.length < 2) {
      return NextResponse.json(
        { error: 'Të dhëna të pamjaftueshme për llogaritjen e korrelacionit' },
        { status: 404 }
      );
    }

    // Build correlation matrix — align by date index (we assume all arrays are same-ish length, trim to min)
    const minLen = Math.min(...fetchedSymbols.map(s => returnsMap[s].length));
    const alignedReturns: Record<string, number[]> = {};
    for (const s of fetchedSymbols) {
      alignedReturns[s] = returnsMap[s].slice(-minLen);
    }

    // Calculate correlation matrix
    const correlationMatrix: Record<string, Record<string, number>> = {};
    for (const s1 of fetchedSymbols) {
      correlationMatrix[s1] = {};
      for (const s2 of fetchedSymbols) {
        const corr = pearsonCorrelation(alignedReturns[s1], alignedReturns[s2]);
        correlationMatrix[s1][s2] = Math.round(corr * 100) / 100;
      }
    }

    return NextResponse.json({
      symbols: fetchedSymbols,
      correlationMatrix,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('[CORRELATION] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}