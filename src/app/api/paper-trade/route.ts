import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Paper trading with virtual $100,000 starting balance
const STARTING_BALANCE = 100000;

interface TradeRequest {
  action: 'BUY' | 'SELL';
  ticker: string;
  company: string;
  sector: string;
  shares: number;
  price: number;
  reason?: string;
}

interface BalanceRequest {
  sessionId?: string;
}

// GET: Get portfolio and balance
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId') || 'default';

    const portfolio = await db.portfolio.findMany({
      where: { sessionId },
    });

    const trades = await db.trade.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const watchlist = await db.watchlistItem.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate spent amount
    const totalSpent = portfolio.reduce((sum, p) => sum + p.avgPrice * p.shares, 0);
    const balance = STARTING_BALANCE - totalSpent;

    // Calculate P&L (using current avg price as proxy since we don't have real-time prices)
    const totalValue = portfolio.reduce((sum, p) => sum + p.avgPrice * p.shares, 0);

    return NextResponse.json({
      balance: Math.round(balance * 100) / 100,
      totalInvested: Math.round(totalSpent * 100) / 100,
      portfolioValue: Math.round(totalValue * 100) / 100,
      totalReturn: 0, // Will be calculated on frontend with current prices
      portfolio,
      recentTrades: trades,
      watchlist,
      startingBalance: STARTING_BALANCE,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Portfolio fetch error:', message);
    return NextResponse.json({ error: 'Failed to fetch portfolio' }, { status: 500 });
  }
}

// POST: Execute a trade
export async function POST(request: NextRequest) {
  try {
    const body: TradeRequest = await request.json();
    const { action, ticker, company, sector, shares, price, reason } = body;
    const sessionId = 'default';

    if (!ticker || !shares || shares <= 0 || !price || price <= 0) {
      return NextResponse.json({ error: 'Invalid trade parameters' }, { status: 400 });
    }

    if (action !== 'BUY' && action !== 'SELL') {
      return NextResponse.json({ error: 'Action must be BUY or SELL' }, { status: 400 });
    }

    // Get current portfolio
    const portfolio = await db.portfolio.findMany({ where: { sessionId } });
    const totalSpent = portfolio.reduce((sum, p) => sum + p.avgPrice * p.shares, 0);
    const balance = STARTING_BALANCE - totalSpent;

    const totalValue = shares * price;

    if (action === 'BUY') {
      if (totalValue > balance) {
        return NextResponse.json(
          { error: `Balance i pamjaftueshëm. Ke $${balance.toFixed(2)} por duhen $${totalValue.toFixed(2)}` },
          { status: 400 }
        );
      }

      // Check if already holding this stock
      const existing = await db.portfolio.findFirst({
        where: { sessionId, ticker: ticker.toUpperCase() },
      });

      if (existing) {
        // Add to existing position
        const newShares = existing.shares + shares;
        const newAvgPrice = (existing.avgPrice * existing.shares + price * shares) / newShares;

        await db.portfolio.update({
          where: { id: existing.id },
          data: { shares: newShares, avgPrice: newAvgPrice },
        });

        await db.trade.create({
          data: {
            sessionId,
            ticker: ticker.toUpperCase(),
            company: company || ticker.toUpperCase(),
            action: 'BUY',
            shares,
            price,
            totalValue,
            reason: reason || `Blerja e ${shares} aksioneve të ${ticker.toUpperCase()}`,
            portfolioId: existing.id,
          },
        });
      } else {
        // New position
        const newPortfolio = await db.portfolio.create({
          data: {
            sessionId,
            ticker: ticker.toUpperCase(),
            company: company || ticker.toUpperCase(),
            sector: sector || 'Unknown',
            shares,
            avgPrice: price,
          },
        });

        await db.trade.create({
          data: {
            sessionId,
            ticker: ticker.toUpperCase(),
            company: company || ticker.toUpperCase(),
            action: 'BUY',
            shares,
            price,
            totalValue,
            reason: reason || `Hyrje e re në ${ticker.toUpperCase()}`,
            portfolioId: newPortfolio.id,
          },
        });
      }

      return NextResponse.json({
        success: true,
        message: `BLEJ: ${shares} ${ticker.toUpperCase()} @ $${price.toFixed(2)} = $${totalValue.toFixed(2)}`,
        remainingBalance: Math.round((balance - totalValue) * 100) / 100,
      });
    }

    if (action === 'SELL') {
      const existing = await db.portfolio.findFirst({
        where: { sessionId, ticker: ticker.toUpperCase() },
      });

      if (!existing || existing.shares < shares) {
        return NextResponse.json(
          { error: `Nuk ke aksione të mjaftueshme ${ticker.toUpperCase()}` },
          { status: 400 }
        );
      }

      const newShares = existing.shares - shares;

      if (newShares === 0) {
        await db.portfolio.delete({ where: { id: existing.id } });
      } else {
        await db.portfolio.update({
          where: { id: existing.id },
          data: { shares: newShares },
        });
      }

      await db.trade.create({
        data: {
          sessionId,
          ticker: ticker.toUpperCase(),
          company: company || ticker.toUpperCase(),
          action: 'SELL',
          shares,
          price,
          totalValue,
          reason: reason || `Shitja e ${shares} aksioneve të ${ticker.toUpperCase()}`,
          portfolioId: existing.id,
        },
      });

      const pnl = (price - existing.avgPrice) * shares;

      return NextResponse.json({
        success: true,
        message: `SHIT: ${shares} ${ticker.toUpperCase()} @ $${price.toFixed(2)} = $${totalValue.toFixed(2)} ${pnl >= 0 ? '(Fitim)' : '(Dëm)'}`,
        pnl: Math.round(pnl * 100) / 100,
        newBalance: Math.round((balance + totalValue) * 100) / 100,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Trade error:', message);
    return NextResponse.json({ error: 'Trade failed' }, { status: 500 });
  }
}

// DELETE: Reset portfolio
export async function DELETE() {
  try {
    const sessionId = 'default';
    await db.trade.deleteMany({ where: { sessionId } });
    await db.portfolio.deleteMany({ where: { sessionId } });
    return NextResponse.json({ success: true, message: 'Portfolio u rivendos' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Reset error:', message);
    return NextResponse.json({ error: 'Reset failed' }, { status: 500 });
  }
}
