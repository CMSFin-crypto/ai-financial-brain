import { NextRequest, NextResponse } from 'next/server';

// ═══════════════════════════════════════════════════════════════
// PAPER TRADING — In-memory storage (works on Vercel serverless)
// NOTE: State resets on each serverless cold start. For persistent
// storage, use Vercel KV, Upstash Redis, or an external database.
// ═══════════════════════════════════════════════════════════════

const STARTING_BALANCE = 100000;

interface PortfolioItem {
  id: string;
  ticker: string;
  company: string;
  sector: string;
  shares: number;
  avgPrice: number;
}

interface Trade {
  id: string;
  ticker: string;
  company: string;
  action: string;
  shares: number;
  price: number;
  totalValue: number;
  reason: string | null;
  createdAt: string;
}

interface TradeRequest {
  action: 'BUY' | 'SELL';
  ticker: string;
  company: string;
  sector: string;
  shares: number;
  price: number;
  reason?: string;
}

// In-memory state
let portfolio: PortfolioItem[] = [];
let trades: Trade[] = [];

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

// GET: Get portfolio and balance
export async function GET() {
  try {
    const totalSpent = portfolio.reduce((sum, p) => sum + p.avgPrice * p.shares, 0);
    const balance = STARTING_BALANCE - totalSpent;

    return NextResponse.json({
      balance: Math.round(balance * 100) / 100,
      totalInvested: Math.round(totalSpent * 100) / 100,
      portfolioValue: Math.round(totalSpent * 100) / 100,
      totalReturn: 0,
      portfolio,
      recentTrades: trades.slice(-50).reverse(),
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

    if (!ticker || !shares || shares <= 0 || !price || price <= 0) {
      return NextResponse.json({ error: 'Invalid trade parameters' }, { status: 400 });
    }

    if (action !== 'BUY' && action !== 'SELL') {
      return NextResponse.json({ error: 'Action must be BUY or SELL' }, { status: 400 });
    }

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

      const existing = portfolio.find(p => p.ticker === ticker.toUpperCase());

      if (existing) {
        const newShares = existing.shares + shares;
        const newAvgPrice = (existing.avgPrice * existing.shares + price * shares) / newShares;
        existing.shares = newShares;
        existing.avgPrice = newAvgPrice;
      } else {
        portfolio.push({
          id: generateId(),
          ticker: ticker.toUpperCase(),
          company: company || ticker.toUpperCase(),
          sector: sector || 'Unknown',
          shares,
          avgPrice: price,
        });
      }

      trades.push({
        id: generateId(),
        ticker: ticker.toUpperCase(),
        company: company || ticker.toUpperCase(),
        action: 'BUY',
        shares,
        price,
        totalValue,
        reason: reason || `Blerja e ${shares} aksioneve të ${ticker.toUpperCase()}`,
        createdAt: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        message: `BLEJ: ${shares} ${ticker.toUpperCase()} @ $${price.toFixed(2)} = $${totalValue.toFixed(2)}`,
        remainingBalance: Math.round((balance - totalValue) * 100) / 100,
      });
    }

    if (action === 'SELL') {
      const existing = portfolio.find(p => p.ticker === ticker.toUpperCase());

      if (!existing || existing.shares < shares) {
        return NextResponse.json(
          { error: `Nuk ke aksione të mjaftueshme ${ticker.toUpperCase()}` },
          { status: 400 }
        );
      }

      const newShares = existing.shares - shares;

      if (newShares === 0) {
        portfolio = portfolio.filter(p => p.ticker !== ticker.toUpperCase());
      } else {
        existing.shares = newShares;
      }

      const pnl = (price - existing.avgPrice) * shares;

      trades.push({
        id: generateId(),
        ticker: ticker.toUpperCase(),
        company: company || ticker.toUpperCase(),
        action: 'SELL',
        shares,
        price,
        totalValue,
        reason: reason || `Shitja e ${shares} aksioneve të ${ticker.toUpperCase()}`,
        createdAt: new Date().toISOString(),
      });

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
    portfolio = [];
    trades = [];
    return NextResponse.json({ success: true, message: 'Portfolio u rivendos' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Reset error:', message);
    return NextResponse.json({ error: 'Reset failed' }, { status: 500 });
  }
}
