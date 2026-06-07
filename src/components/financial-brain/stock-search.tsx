'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Search, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { getAllStocks } from '@/lib/market-data';

interface StockOption {
  ticker: string;
  company: string;
  sector: string;
  price: number;
  change: number;
  isExternal?: boolean;
  exchange?: string;
}

interface StockSearchProps {
  onSelect: (ticker: string) => void;
  onQueryChange?: (query: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

export function StockSearch({ onSelect, onQueryChange, placeholder = 'Kërko aksion...', className = '', inputClassName = '' }: StockSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [externalResults, setExternalResults] = useState<StockOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const allStocks = getAllStocks();
    const q = query.toUpperCase();
    return Object.values(allStocks)
      .filter((s) =>
        s.ticker.toUpperCase().includes(q) ||
        s.company.toUpperCase().includes(q) ||
        s.sector.toUpperCase().includes(q)
      )
      .slice(0, 8) as StockOption[];
  }, [query]);

  const hasExactMatch = useMemo(() => {
    if (!query.trim()) return true;
    const q = query.toUpperCase().trim();
    const allStocks = getAllStocks();
    return Object.keys(allStocks).includes(q);
  }, [query]);

  // Search external API when no local match found
  useEffect(() => {
    if (!query.trim() || query.length < 2 || hasExactMatch) {
      setExternalResults([]);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/ticker-search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          const localTickers = new Set(Object.keys(getAllStocks()));
          const filtered = (data.results || [])
            .filter((r: any) => !localTickers.has(r.ticker))
            .slice(0, 4)
            .map((r: any) => ({
              ticker: r.ticker,
              company: r.company,
              sector: r.exchange || 'US',
              price: r.price || 0,
              change: r.change || 0,
              isExternal: true,
              exchange: r.exchange,
            }));
          setExternalResults(filtered);
        }
      } catch {
        // Silently fail
      } finally {
        setIsSearching(false);
      }
    }, 800);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, hasExactMatch]);

  const handleSelect = useCallback((ticker: string) => {
    onSelect(ticker);
    setQuery(ticker);
    setIsOpen(false);
    setExternalResults([]);
  }, [onSelect]);

  const handleInputChange = useCallback((val: string) => {
    setQuery(val);
    setIsOpen(val.trim().length > 0);
    setExternalResults([]);
    onQueryChange?.(val);
  }, [onQueryChange]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const showExternal = externalResults.length > 0 || (isSearching && query.length >= 2 && !hasExactMatch);

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            const val = e.target.value.toUpperCase();
            handleInputChange(val);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              const val = query.trim().toUpperCase();
              if (val) handleSelect(val);
            }
          }}
          onFocus={() => {
            if (query.trim()) setIsOpen(true);
          }}
          className={`pl-8 text-xs h-9 ${inputClassName}`}
        />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-[300px] overflow-y-auto">
          {results.length > 0 ? (
            <>
              {results.map((stock) => (
                <button
                  key={stock.ticker}
                  onClick={() => handleSelect(stock.ticker)}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/50 text-left transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold shrink-0">{stock.ticker}</span>
                    <span className="text-[10px] text-muted-foreground truncate">{stock.company}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-[10px] text-muted-foreground">${stock.price}</span>
                    <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${stock.change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {stock.change >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                      {stock.change >= 0 ? '+' : ''}{stock.change}%
                    </span>
                  </div>
                </button>
              ))}

              {/* External results divider */}
              {showExternal && <div className="border-t border-border/30 mx-3 my-1" />}

              {/* External results */}
              {isSearching && (
                <div className="flex items-center justify-center gap-1.5 py-2 text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="text-[10px]">Duke kërkuar...</span>
                </div>
              )}
              {externalResults.map((stock) => (
                <button
                  key={`ext-${stock.ticker}`}
                  onClick={() => handleSelect(stock.ticker)}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-emerald-500/5 text-left transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-emerald-400 shrink-0">{stock.ticker}</span>
                    <span className="text-[10px] text-muted-foreground truncate">{stock.company}</span>
                    {stock.exchange && (
                      <span className="text-[8px] px-1 py-0 bg-emerald-500/10 text-emerald-500 rounded shrink-0">{stock.exchange}</span>
                    )}
                  </div>
                  {stock.price > 0 && (
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className="text-[10px] text-muted-foreground">${stock.price.toFixed(2)}</span>
                      <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${stock.change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </>
          ) : showExternal ? (
            <div className="py-2">
              {isSearching ? (
                <div className="flex items-center justify-center gap-1.5 py-2 text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="text-[10px]">Duke kërkuar...</span>
                </div>
              ) : externalResults.length > 0 ? (
                externalResults.map((stock) => (
                  <button
                    key={`ext-${stock.ticker}`}
                    onClick={() => handleSelect(stock.ticker)}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-emerald-500/5 text-left transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-emerald-400 shrink-0">{stock.ticker}</span>
                      <span className="text-[10px] text-muted-foreground truncate">{stock.company}</span>
                    </div>
                    {stock.price > 0 && (
                      <span className="text-[10px] text-muted-foreground shrink-0">${stock.price.toFixed(2)}</span>
                    )}
                  </button>
                ))
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      {/* Always show analyze hint when there's a query but dropdown is closed */}
      {!isOpen && query.trim().length > 0 && (
        <p className="text-[9px] text-emerald-500/60 mt-1 px-0.5">
          ✨ Çdo ticker US mund të analizohet — shtyp Enter
        </p>
      )}
    </div>
  );
}
