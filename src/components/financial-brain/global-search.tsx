'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, TrendingUp, TrendingDown, Command } from 'lucide-react';
import { getAllStocks } from '@/lib/market-data';
import type { StockProfile } from '@/lib/market-data';

interface GlobalSearchProps {
  onSelectStock: (ticker: string) => void;
}

export function GlobalSearch({ onSelectStock }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  const allStocks = useMemo(() => {
    const stocks = getAllStocks();
    return Object.values(stocks);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return allStocks.slice(0, 12);
    const q = query.toLowerCase().trim();
    return allStocks.filter(
      (s) =>
        s.ticker.toLowerCase().includes(q) ||
        s.company.toLowerCase().includes(q) ||
        s.sector.toLowerCase().includes(q)
    ).slice(0, 12);
  }, [query, allStocks]);

  const handleSelect = (ticker: string) => {
    setOpen(false);
    setQuery('');
    onSelectStock(ticker);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[500px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Kërko Aksion</DialogTitle>
          <DialogDescription>Zgjidh për të analizuar</DialogDescription>
        </DialogHeader>

        {/* Search Input */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <Input
            ref={inputRef}
            placeholder="Kërko aksion..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border-0 shadow-none focus-visible:ring-0 h-auto p-0 text-sm"
          />
          <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted rounded-md px-1.5 py-0.5 flex-shrink-0">
            <Command className="w-2.5 h-2.5" />
            K
          </div>
        </div>

        {/* Subtitle */}
        <div className="px-4 py-2 border-b border-border/50 bg-muted/30">
          <p className="text-xs text-muted-foreground">Zgjidh për të analizuar</p>
        </div>

        {/* Results */}
        <div className="max-h-[320px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="py-8 text-center">
              <Search className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Nuk u gjet asnjë aksion</p>
            </div>
          ) : (
            filtered.map((stock) => (
              <button
                key={stock.ticker}
                onClick={() => handleSelect(stock.ticker)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left border-b border-border/30 last:border-0"
              >
                {/* Ticker + Company */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{stock.ticker}</span>
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                      {stock.sector}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{stock.company}</p>
                </div>

                {/* Price + Change */}
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold tabular-nums">
                    ${stock.price.toFixed(2)}
                  </p>
                  <div className={`flex items-center gap-0.5 text-[10px] font-medium ${
                    stock.change >= 0 ? 'text-emerald-500' : 'text-red-500'
                  }`}>
                    {stock.change >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                    {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
