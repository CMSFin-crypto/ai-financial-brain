import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStock } from '@/lib/market-data';
import { getRealPrices } from '@/lib/alpha-vantage';

export const maxDuration = 30;

// GET - fetch all watchlist items + live prices
export async function GET() {
  const session = 'default';

  const items = await db.watchlistItem.findMany({
    where: { sessionId: session },
    orderBy: { createdAt: 'desc' },
  });

  // Fetch live prices
  try {
    const tickers = items.map((i) => i.ticker);
    const prices = await getRealPrices(tickers);

    // Check alerts
    const alerts = items.filter((item) => {
      if (!item.alertActive) return false;
      const livePrice = prices[item.ticker]?.price;
      if (!livePrice) return false;
      if (item.alertAbove && livePrice >= item.alertAbove) return true;
      if (item.alertBelow && livePrice <= item.alertBelow) return true;
      return false;
    });

    // Mark alerted items
    for (const alert of alerts) {
      await db.watchlistItem.update({
        where: { id: alert.id },
        data: { alertedAt: new Date() },
      });
    }

    const enriched = items.map((item) => {
      const stock = getStock(item.ticker);
      const livePrice = prices[item.ticker]?.price;
      return {
        id: item.id,
        ticker: item.ticker,
        company: item.company || stock?.company || item.ticker,
        sector: item.sector || stock?.sector || '',
        note: item.note,
        price: livePrice || stock?.price || 0,
        change: livePrice
          ? prices[item.ticker]?.change || stock?.change || 0
          : stock?.change || 0,
        alertAbove: item.alertAbove,
        alertBelow: item.alertBelow,
        alertActive: item.alertActive,
        alertedAt: item.alertedAt,
        createdAt: item.createdAt,
        triggered: alerts.some((a) => a.id === item.id),
      };
    });

    return NextResponse.json({ items: enriched, alerts: alerts.length });
  } catch {
    // Fallback without live prices
    const enriched = items.map((item) => {
      const stock = getStock(item.ticker);
      return {
        id: item.id,
        ticker: item.ticker,
        company: item.company || stock?.company || item.ticker,
        sector: item.sector || stock?.sector || '',
        note: item.note,
        price: stock?.price || 0,
        change: stock?.change || 0,
        alertAbove: item.alertAbove,
        alertBelow: item.alertBelow,
        alertActive: item.alertActive,
        alertedAt: item.alertedAt,
        createdAt: item.createdAt,
        triggered: false,
      };
    });

    return NextResponse.json({ items: enriched, alerts: 0 });
  }
}

// POST - add/update item
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { ticker, company, sector, note, alertAbove, alertBelow } = body;

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker required' }, { status: 400 });
  }

  const upperTicker = ticker.toUpperCase();

  // Try to fill company/sector from market data if not provided
  const stock = getStock(upperTicker);
  const companyName = company || stock?.company || upperTicker;
  const sectorName = sector || stock?.sector || '';

  const item = await db.watchlistItem.upsert({
    where: { sessionId_ticker: { sessionId: 'default', ticker: upperTicker } },
    update: {
      company: companyName,
      sector: sectorName,
      note: note ?? undefined,
      alertAbove: alertAbove !== null && alertAbove !== undefined ? Number(alertAbove) : undefined,
      alertBelow: alertBelow !== null && alertBelow !== undefined ? Number(alertBelow) : undefined,
      alertActive: true,
      alertedAt: null,
    },
    create: {
      sessionId: 'default',
      ticker: upperTicker,
      company: companyName,
      sector: sectorName,
      note: note ?? undefined,
      alertAbove: alertAbove !== null && alertAbove !== undefined ? Number(alertAbove) : undefined,
      alertBelow: alertBelow !== null && alertBelow !== undefined ? Number(alertBelow) : undefined,
    },
  });

  return NextResponse.json({ item });
}

// PATCH - update alert settings
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { ticker, alertActive, alertAbove, alertBelow } = body;

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker required' }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (typeof alertActive === 'boolean') updateData.alertActive = alertActive;
  if (alertAbove !== null && alertAbove !== undefined) updateData.alertAbove = Number(alertAbove);
  else if (alertAbove === null) updateData.alertAbove = null;
  if (alertBelow !== null && alertBelow !== undefined) updateData.alertBelow = Number(alertBelow);
  else if (alertBelow === null) updateData.alertBelow = null;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const item = await db.watchlistItem.update({
    where: { sessionId_ticker: { sessionId: 'default', ticker: ticker.toUpperCase() } },
    data: updateData,
  });

  return NextResponse.json({ item });
}

// DELETE - remove item
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker required' }, { status: 400 });
  }

  await db.watchlistItem.deleteMany({
    where: { sessionId: 'default', ticker: ticker.toUpperCase() },
  });

  return NextResponse.json({ success: true });
}
