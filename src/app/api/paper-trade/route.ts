import { NextRequest, NextResponse } from 'next/server';
import { getRealPrices } from '@/lib/alpha-vantage';

// ═══════════════════════════════════════════════════════════════
// PAPER TRADING — In-memory storage (works on Vercel serverless)
// NOTE: State resets on each serverless cold start. For persistent
// storage, use Vercel KV, Upstash Redis, or an external database.
// ═══════════════════════════════════════════════════════════════

export const maxDuration = 30;

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

// GET: Get portfolio and balance (with optional ?refresh=1 for live P&L)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shouldRefresh = searchParams.get('refresh') === '1';

    const totalSpent = portfolio.reduce((sum, p) => sum + p.avgPrice * p.shares, 0);
    const balance = STARTING_BALANCE - totalSpent;

    const baseResponse = {
      balance: Math.round(balance * 100) / 100,
      totalInvested: Math.round(totalSpent * 100) / 100,
      portfolioValue: Math.round(totalSpent * 100) / 100,
      totalReturn: 0,
      portfolio,
      recentTrades: trades.slice(-50).reverse(),
      startingBalance: STARTING_BALANCE,
    };

    // If no refresh requested, return base response
    if (!shouldRefresh) {
      return NextResponse.json(baseResponse);
    }

    // ─── Enhanced response with live prices and performance analytics ───

    // 1. Fetch live prices for all holdings
    const tickers = portfolio.map(p => p.ticker);
    let livePrices: Record<string, { price: number; change: number }> = {};

    if (tickers.length > 0) {
      try {
        const realPrices = await getRealPrices(tickers);
        // Extract just price and change for response
        for (const [ticker, data] of Object.entries(realPrices)) {
          livePrices[ticker] = { price: data.price, change: data.change };
        }
        console.log(`[PAPER-TRADE] Fetched live prices for ${Object.keys(livePrices).length}/${tickers.length} tickers`);
      } catch (err) {
        console.error('[PAPER-TRADE] Failed to fetch live prices:', err);
      }
    }

    // 2. Enhance positions with live P&L data
    let totalCurrentValue = 0;
    const enhancedPositions = portfolio.map(item => {
      const livePrice = livePrices[item.ticker]?.price ?? item.avgPrice;
      const currentValue = livePrice * item.shares;
      const unrealizedPnL = (livePrice - item.avgPrice) * item.shares;
      const unrealizedPnLPct = item.avgPrice > 0 ? ((livePrice - item.avgPrice) / item.avgPrice) * 100 : 0;
      const entryValue = item.avgPrice * item.shares;

      totalCurrentValue += currentValue;

      return {
        ...item,
        livePrice: Math.round(livePrice * 100) / 100,
        unrealizedPnL: Math.round(unrealizedPnL * 100) / 100,
        unrealizedPnLPct: Math.round(unrealizedPnLPct * 100) / 100,
        currentValue: Math.round(currentValue * 100) / 100,
        entryValue: Math.round(entryValue * 100) / 100,
      };
    });

    // 3. Calculate portfolio-level metrics
    const totalInvested = totalSpent;
    const totalPnL = totalCurrentValue - totalInvested;
    const totalPnLPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;
    const totalPortfolioValue = balance + totalCurrentValue;

    // 4. Calculate win/loss stats from closed trades (SELL trades)
    const sellTrades = trades.filter(t => t.action === 'SELL');
    let winCount = 0;
    let lossCount = 0;
    const tradePnLs: number[] = [];
    const bestTrades: number[] = [];
    const worstTrades: number[] = [];

    // Build a map of average entry prices by ticker
    const entryPriceMap: Record<string, number> = {};
    const buyTradesByTicker: Record<string, { totalCost: number; totalShares: number }[]> = {};

    // Process trades chronologically to track entry prices at time of sell
    for (const trade of trades) {
      if (trade.action === 'BUY') {
        if (!buyTradesByTicker[trade.ticker]) {
          buyTradesByTicker[trade.ticker] = [{ totalCost: trade.totalValue, totalShares: trade.shares }];
        } else {
          const arr = buyTradesByTicker[trade.ticker];
          // Merge with last entry if we haven't sold since
          const last = arr[arr.length - 1];
          last.totalCost += trade.totalValue;
          last.totalShares += trade.shares;
        }
      } else if (trade.action === 'SELL') {
        const buyArr = buyTradesByTicker[trade.ticker];
        if (buyArr && buyArr.length > 0) {
          const lastBuy = buyArr[buyArr.length - 1];
          const entryPrice = lastBuy.totalShares > 0 ? lastBuy.totalCost / lastBuy.totalShares : trade.price;
          const pnl = (trade.price - entryPrice) * trade.shares;
          const pnlPct = entryPrice > 0 ? ((trade.price - entryPrice) / entryPrice) * 100 : 0;

          tradePnLs.push(pnlPct);
          if (pnl >= 0) {
            winCount++;
            bestTrades.push(pnlPct);
          } else {
            lossCount++;
            worstTrades.push(pnlPct);
          }

          // Update remaining shares
          lastBuy.totalShares -= trade.shares;
          lastBuy.totalCost -= entryPrice * trade.shares;
          if (lastBuy.totalShares <= 0) {
            buyArr.pop();
          }
        }
      }
    }

    const totalClosedTrades = winCount + lossCount;
    const winRate = totalClosedTrades > 0 ? (winCount / totalClosedTrades) * 100 : 0;
    const avgWin = bestTrades.length > 0 ? bestTrades.reduce((a, b) => a + b, 0) / bestTrades.length : 0;
    const avgLoss = worstTrades.length > 0 ? worstTrades.reduce((a, b) => a + b, 0) / worstTrades.length : 0;
    const bestTrade = bestTrades.length > 0 ? Math.max(...bestTrades) : 0;
    const worstTrade = worstTrades.length > 0 ? Math.min(...worstTrades) : 0;

    return NextResponse.json({
      ...baseResponse,
      portfolio: enhancedPositions,
      // Enhanced metrics
      totalInvested: Math.round(totalInvested * 100) / 100,
      totalCurrentValue: Math.round(totalCurrentValue * 100) / 100,
      totalPnL: Math.round(totalPnL * 100) / 100,
      totalPnLPct: Math.round(totalPnLPct * 100) / 100,
      totalPortfolioValue: Math.round(totalPortfolioValue * 100) / 100,
      // Performance stats from closed trades
      winCount,
      lossCount,
      winRate: Math.round(winRate * 10) / 10,
      avgWin: Math.round(avgWin * 10) / 10,
      avgLoss: Math.round(Math.abs(avgLoss) * 10) / 10,
      bestTrade: Math.round(bestTrade * 10) / 10,
      worstTrade: Math.round(Math.abs(worstTrade) * 10) / 10,
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
