'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, TrendingUp, TrendingDown, Command, Loader2, Globe, Sparkles } from 'lucide-react';
import { getAllStocks } from '@/lib/market-data';
import type { StockProfile } from '@/lib/market-data';

interface ExternalResult {
  ticker: string;
  company: string;
  exchange?: string;
  price: number;
  change: number;
  volume?: number;
  isExternal: boolean;
}

interface GlobalSearchProps {
  onSelectStock: (ticker: string) => void;
}

export function GlobalSearch({ onSelectStock }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [externalResults, setExternalResults] = useState<ExternalResult[]>([]);
  const [isSearchingExternal, setIsSearchingExternal] = useState(false);
  const [hasSearchedExternal, setHasSearchedExternal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Reset external search when dialog opens/closes or query changes
  useEffect(() => {
    setExternalResults([]);
    setHasSearchedExternal(false);
    setIsSearchingExternal(false);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
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

  const hasExactMatch = useMemo(() => {
    if (!query.trim()) return true;
    const q = query.toUpperCase().trim();
    return allStocks.some((s) => s.ticker === q);
  }, [query, allStocks]);

  // Search external API when no local match found
  const searchExternal = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 2 || hasSearchedExternal) return;

    setIsSearchingExternal(true);
    try {
      const res = await fetch(`/api/ticker-search?q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        // Filter out results that are already in local database
        const localTickers = new Set(allStocks.map(s => s.ticker));
        const filteredExternal = (data.results || []).filter(
          (r: ExternalResult) => !localTickers.has(r.ticker)
        );
        setExternalResults(filteredExternal);
      }
    } catch {
      // Silently fail - external search is best effort
    } finally {
      setIsSearchingExternal(false);
      setHasSearchedExternal(true);
    }
  }, [allStocks, hasSearchedExternal]);

  // Trigger external search after a delay when query has no exact local match
  useEffect(() => {
    if (!query.trim() || query.length < 2 || hasExactMatch || hasSearchedExternal) {
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchExternal(query.trim());
    }, 600);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, hasExactMatch, hasSearchedExternal, searchExternal]);

  const handleSelect = (ticker: string) => {
    setOpen(false);
    setQuery('');
    onSelectStock(ticker);
  };

  // Reset state when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setQuery('');
      setExternalResults([]);
      setHasSearchedExternal(false);
      setIsSearchingExternal(false);
    }
  };

  const totalResults = filtered.length + externalResults.length;
  const showAnalyzeButton = query.trim().length >= 1;
  const upperQuery = query.trim().toUpperCase();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
            placeholder="Kërko aksion... (çdo ticker US)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHasSearchedExternal(false);
              setExternalResults([]);
            }}
            className="border-0 shadow-none focus-visible:ring-0 h-auto p-0 text-sm"
          />
          <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted rounded-md px-1.5 py-0.5 flex-shrink-0">
            <Command className="w-2.5 h-2.5" />
            K
          </div>
        </div>

        {/* Subtitle */}
        <div className="px-4 py-2 border-b border-border/50 bg-muted/30 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Zgjidh për të analizuar</p>
          {totalResults > 0 && (
            <p className="text-[10px] text-muted-foreground">{totalResults} rezultate</p>
          )}
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto">
          {/* Local database results */}
          {filtered.length > 0 && (
            <>
              {query.trim() && (
                <div className="px-4 py-1.5 bg-muted/50 text-[10px] text-muted-foreground font-medium uppercase tracking-wider sticky top-0">
                  📊 Bazë e Dhenave Lokale
                </div>
              )}
              {filtered.map((stock) => (
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
              ))}
            </>
          )}

          {/* External Yahoo Finance results */}
          {isSearchingExternal && (
            <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Duke kërkuar në Yahoo Finance...</span>
            </div>
          )}

          {!isSearchingExternal && externalResults.length > 0 && (
            <>
              <div className="px-4 py-1.5 bg-muted/50 text-[10px] text-muted-foreground font-medium uppercase tracking-wider sticky top-0 border-t border-border/30 flex items-center gap-1.5">
                <Globe className="w-3 h-3" />
                Yahoo Finance — Rezultatet e gjetura
              </div>
              {externalResults.map((stock) => (
                <button
                  key={stock.ticker}
                  onClick={() => handleSelect(stock.ticker)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-emerald-500/5 transition-colors text-left border-b border-border/30 last:border-0"
                >
                  {/* Ticker + Company */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-emerald-400">{stock.ticker}</span>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-emerald-500 border-emerald-500/30">
                        {stock.exchange || 'US'}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{stock.company}</p>
                  </div>

                  {/* Price + Change */}
                  <div className="text-right flex-shrink-0">
                    {stock.price > 0 ? (
                      <>
                        <p className="text-sm font-semibold tabular-nums">
                          ${stock.price.toFixed(2)}
                        </p>
                        <div className={`flex items-center gap-0.5 text-[10px] font-medium ${
                          stock.change >= 0 ? 'text-emerald-500' : 'text-red-500'
                        }`}>
                          {stock.change >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                          {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%
                        </div>
                      </>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">Çmimi në të ardhë</span>
                    )}
                  </div>
                </button>
              ))}
            </>
          )}

          {/* Empty state */}
          {!isSearchingExternal && filtered.length === 0 && externalResults.length === 0 && query.trim().length > 0 && hasSearchedExternal && (
            <div className="py-6 text-center">
              <Search className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Nuk u gjet asnjë aksion për &ldquo;{query}&rdquo;</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Provoni një ticker tjetër (p.sh. AAPL, TSLA)</p>
            </div>
          )}

          {/* ALWAYS show ANALYZO button when user has typed something */}
          {showAnalyzeButton && (
            <button
              onClick={() => handleSelect(upperQuery)}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-3.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-left transition-all border-t border-emerald-500/20 group"
            >
              <Sparkles className="w-4 h-4 text-emerald-500 group-hover:text-emerald-400 transition-colors" />
              <span className="text-sm font-semibold text-emerald-500 group-hover:text-emerald-400 transition-colors">
                ANALIZO {upperQuery}
              </span>
              <span className="text-[10px] text-emerald-500/60 group-hover:text-emerald-400/70 transition-colors">
                — Çdo ticker US është i analizueshëm
              </span>
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
