import { NextResponse } from 'next/server';

export const maxDuration = 30;

// Hardcoded realistic earnings data for 2026
const EARNINGS_DATA = [
  // July 2026
  { ticker: 'AA', company: 'Alcoa Corp', date: '2026-07-08', time: 'BMO', epsEstimate: 0.32, epsActual: null },
  { ticker: 'WMT', company: 'Walmart Inc', date: '2026-07-09', time: 'BMO', epsEstimate: 0.65, epsActual: null },
  { ticker: 'JPM', company: 'JPMorgan Chase', date: '2026-07-10', time: 'BMO', epsEstimate: 4.18, epsActual: null },
  { ticker: 'WFC', company: 'Wells Fargo', date: '2026-07-10', time: 'BMO', epsEstimate: 1.28, epsActual: null },
  { ticker: 'C', company: 'Citigroup Inc', date: '2026-07-11', time: 'BMO', epsEstimate: 1.42, epsActual: null },
  { ticker: 'GS', company: 'Goldman Sachs', date: '2026-07-11', time: 'BMO', epsEstimate: 8.52, epsActual: null },
  { ticker: 'MS', company: 'Morgan Stanley', date: '2026-07-12', time: 'BMO', epsEstimate: 1.82, epsActual: null },
  { ticker: 'DAL', company: 'Delta Air Lines', date: '2026-07-11', time: 'BMO', epsEstimate: 2.55, epsActual: null },
  { ticker: 'USB', company: 'US Bancorp', date: '2026-07-12', time: 'BMO', epsEstimate: 0.95, epsActual: null },
  { ticker: 'BLK', company: 'BlackRock Inc', date: '2026-07-12', time: 'BMO', epsEstimate: 11.25, epsActual: null },
  { ticker: 'UNH', company: 'UnitedHealth Group', date: '2026-07-14', time: 'BMO', epsEstimate: 6.82, epsActual: null },
  { ticker: 'BAC', company: 'Bank of America', date: '2026-07-15', time: 'BMO', epsEstimate: 0.85, epsActual: null },
  { ticker: 'TSLA', company: 'Tesla Inc', date: '2026-07-16', time: 'AMC', epsEstimate: 0.92, epsActual: null },
  { ticker: 'NFLX', company: 'Netflix Inc', date: '2026-07-16', time: 'AMC', epsEstimate: 5.12, epsActual: null },
  { ticker: 'ASML', company: 'ASML Holding', date: '2026-07-16', time: 'AMC', epsEstimate: 5.85, epsActual: null },
  { ticker: 'AAPL', company: 'Apple Inc', date: '2026-07-17', time: 'BMO', epsEstimate: 1.58, epsActual: null },
  { ticker: 'INTC', company: 'Intel Corp', date: '2026-07-17', time: 'BMO', epsEstimate: 0.12, epsActual: null },
  { ticker: 'BA', company: 'Boeing Co', date: '2026-07-18', time: 'BMO', epsEstimate: -1.85, epsActual: null },
  { ticker: 'MSFT', company: 'Microsoft Corp', date: '2026-07-22', time: 'BMO', epsEstimate: 3.15, epsActual: null },
  { ticker: 'GOOGL', company: 'Alphabet Inc', date: '2026-07-22', time: 'BMO', epsEstimate: 1.95, epsActual: null },
  { ticker: 'META', company: 'Meta Platforms', date: '2026-07-23', time: 'BMO', epsEstimate: 5.28, epsActual: null },
  { ticker: 'AMD', company: 'Advanced Micro Devices', date: '2026-07-23', time: 'BMO', epsEstimate: 0.68, epsActual: null },
  { ticker: 'AMZN', company: 'Amazon.com Inc', date: '2026-07-24', time: 'BMO', epsEstimate: 1.12, epsActual: null },
  { ticker: 'CAT', company: 'Caterpillar Inc', date: '2026-07-24', time: 'BMO', epsEstimate: 5.12, epsActual: null },
  { ticker: 'CRM', company: 'Salesforce Inc', date: '2026-07-24', time: 'AMC', epsEstimate: 2.42, epsActual: null },
  { ticker: 'SBUX', company: 'Starbucks Corp', date: '2026-07-29', time: 'BMO', epsEstimate: 0.92, epsActual: null },
  { ticker: 'ADBE', company: 'Adobe Inc', date: '2026-07-15', time: 'AMC', epsEstimate: 3.78, epsActual: null },
  { ticker: 'TXN', company: 'Texas Instruments', date: '2026-07-22', time: 'BMO', epsEstimate: 1.75, epsActual: null },
  { ticker: 'QCOM', company: 'Qualcomm Inc', date: '2026-07-23', time: 'BMO', epsEstimate: 2.18, epsActual: null },
  { ticker: 'MRVL', company: 'Marvell Technology', date: '2026-07-25', time: 'AMC', epsEstimate: 0.38, epsActual: null },
  { ticker: 'ON', company: 'ON Semiconductor', date: '2026-07-28', time: 'BMO', epsEstimate: 0.82, epsActual: null },
  { ticker: 'LRCX', company: 'Lam Research', date: '2026-07-23', time: 'AMC', epsEstimate: 2.95, epsActual: null },
  { ticker: 'MU', company: 'Micron Technology', date: '2026-07-25', time: 'BMO', epsEstimate: 1.25, epsActual: null },
  { ticker: 'COIN', company: 'Coinbase Global', date: '2026-07-31', time: 'AMC', epsEstimate: 1.15, epsActual: null },
  { ticker: 'RIVN', company: 'Rivian Automotive', date: '2026-07-29', time: 'AMC', epsEstimate: -0.85, epsActual: null },
  { ticker: 'SMCI', company: 'Super Micro Computer', date: '2026-07-30', time: 'AMC', epsEstimate: 0.55, epsActual: null },
  // August 2026
  { ticker: 'DIS', company: 'Walt Disney Co', date: '2026-08-06', time: 'BMO', epsEstimate: 1.22, epsActual: null },
  { ticker: 'PYPL', company: 'PayPal Holdings', date: '2026-08-07', time: 'BMO', epsEstimate: 1.18, epsActual: null },
  { ticker: 'UBER', company: 'Uber Technologies', date: '2026-08-06', time: 'BMO', epsEstimate: 0.32, epsActual: null },
  { ticker: 'ABNB', company: 'Airbnb Inc', date: '2026-08-07', time: 'BMO', epsEstimate: 2.28, epsActual: null },
  { ticker: 'SNAP', company: 'Snap Inc', date: '2026-08-07', time: 'AMC', epsEstimate: 0.05, epsActual: null },
  { ticker: 'PLTR', company: 'Palantir Technologies', date: '2026-08-04', time: 'AMC', epsEstimate: 0.12, epsActual: null },
  { ticker: 'SQ', company: 'Block Inc', date: '2026-08-01', time: 'BMO', epsEstimate: 0.85, epsActual: null },
];

export async function GET() {
  try {
    const sorted = [...EARNINGS_DATA].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Get unique months
    const months = [...new Set(sorted.map(e => e.date.slice(0, 7)))].sort();

    // Group by date
    const byDate: Record<string, typeof EARNINGS_DATA> = {};
    sorted.forEach(e => {
      if (!byDate[e.date]) byDate[e.date] = [];
      byDate[e.date].push(e);
    });

    return NextResponse.json({
      earnings: sorted,
      byDate,
      months,
      totalEntries: sorted.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('Earnings error:', message);
    return NextResponse.json({ error: 'Të dhënat e fitimeve nuk u gjetën.' }, { status: 500 });
  }
}
