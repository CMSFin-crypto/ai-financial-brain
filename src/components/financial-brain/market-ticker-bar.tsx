'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, RefreshCw, Clock } from 'lucide-react';

interface TickerData {
  ticker: string;
  company: string;
  price: number;
  change: number;
  signal: string;
}

const TICKER_LIST = ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'LLY', 'JPM', 'V'];

export function MarketTickerBar() {
  const [tickers, setTickers] = useState<TickerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch('/api/market-prices?tickers=' + TICKER_LIST.join(','));
      if (res.ok) {
        const data = await res.json();
        if (data.stocks) {
          setTickers(data.stocks.map((s: Record<string, unknown>) => ({
            ticker: s.ticker as string,
            company: s.company as string,
            price: s.price as number,
            change: s.change as number,
            signal: s.signal as string,
          })));
          setLastUpdated(new Date().toLocaleTimeString('sq-AL', { hour: '2-digit', minute: '2-digit' }));
        }
      }
    } catch {
      // Silent fail — use fallback data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 60000); // Refresh çdo 60 sekonda
    return () => clearInterval(interval);
  }, [fetchPrices]);

  if (loading && tickers.length === 0) {
    return null; // Don't show skeleton for ticker bar
  }

  return (
    <div className="border-b border-border/30 bg-card/30 backdrop-blur-sm overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center h-10 gap-5 overflow-x-auto scrollbar-hide">
          {/* Time + Refresh */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              {lastUpdated || 'Duke u ngarkuar...'}
            </span>
            <button
              onClick={fetchPrices}
              className="p-0.5 hover:bg-muted/50 rounded transition-colors"
              title="Përditëso çmimet"
            >
              <RefreshCw className={`w-3 h-3 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="w-px h-4 bg-border/50 flex-shrink-0" />

          {/* Scrolling tickers */}
          <div className="flex items-center gap-3 overflow-x-auto">
            {tickers.map((t) => {
              const isUp = t.change >= 0;
              return (
                <div key={t.ticker} className="flex items-center gap-1.5 flex-shrink-0 group">
                  <span className="text-xs font-bold text-foreground">{t.ticker}</span>
                  <span className={`text-xs font-semibold tabular-nums ${isUp ? 'text-emerald-500' : 'text-red-500'}`}>
                    ${t.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className={`flex items-center gap-0.5 text-[11px] ${isUp ? 'text-emerald-500' : 'text-red-500'}`}>
                    {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {isUp ? '+' : ''}{t.change.toFixed(2)}%
                  </span>
                  <div className="w-px h-3 bg-border/30 group-hover:hidden" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
