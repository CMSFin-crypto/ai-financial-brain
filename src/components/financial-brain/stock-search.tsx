'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Search, TrendingUp, TrendingDown } from 'lucide-react';
import { getAllStocks } from '@/lib/market-data';

interface StockOption {
  ticker: string;
  company: string;
  sector: string;
  price: number;
  change: number;
}

interface StockSearchProps {
  onSelect: (ticker: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

export function StockSearch({ onSelect, placeholder = 'Kërko aksion...', className = '', inputClassName = '' }: StockSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

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

  const handleSelect = useCallback((ticker: string) => {
    onSelect(ticker);
    setQuery(ticker);
    setIsOpen(false);
  }, [onSelect]);

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

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            const val = e.target.value.toUpperCase();
            setQuery(val);
            setIsOpen(val.trim().length > 0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const val = query.trim().toUpperCase();
              if (val) handleSelect(val);
            }
          }}
          onFocus={() => {
            if (query.trim() && results.length > 0) setIsOpen(true);
          }}
          className={`pl-8 text-xs h-9 ${inputClassName}`}
        />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-[250px] overflow-y-auto">
          {results.map((stock) => (
            <button
              key={stock.ticker}
              onClick={() => handleSelect(stock.ticker)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 text-left transition-colors"
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
        </div>
      )}
    </div>
  );
}
