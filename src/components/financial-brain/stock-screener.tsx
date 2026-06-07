'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Filter,
  AlertTriangle,
  RefreshCw,
  ArrowUpDown,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

interface ScreenerStock {
  ticker: string;
  company: string;
  sector: string;
  industry: string;
  price: number;
  change: number;
  volume: string;
  marketCap: string;
  marketCapNum: number;
  pe: number;
  fwdPE: number;
  peg: number;
  ps: number;
  netMargin: string;
  revGrowth: string;
  epsGrowth: string;
  moat: string;
  brandStrength: number;
  rating: string;
  targetPrice: string;
  signal: string;
  trend: string;
  fcf: string;
  score: number;
}

interface ScreenerData {
  stocks: ScreenerStock[];
  totalStocks: number;
  filteredCount: number;
  sectors: string[];
}

function RatingBadge({ rating }: { rating: string }) {
  if (rating === 'STRONG_BUY') return <Badge className="bg-emerald-600 text-white text-[8px] px-1.5 h-4">STRONG BUY</Badge>;
  if (rating === 'BUY') return <Badge className="bg-emerald-500 text-white text-[8px] px-1.5 h-4">BUY</Badge>;
  if (rating === 'HOLD') return <Badge className="bg-amber-500 text-white text-[8px] px-1.5 h-4">HOLD</Badge>;
  if (rating === 'SELL') return <Badge className="bg-red-500 text-white text-[8px] px-1.5 h-4">SELL</Badge>;
  return <Badge className="bg-gray-500 text-white text-[8px] px-1.5 h-4">{rating}</Badge>;
}

function SignalIcon({ signal }: { signal: string }) {
  if (signal === 'BULLISH') return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />;
  if (signal === 'BEARISH') return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
  return <Minus className="w-3.5 h-3.5 text-amber-500" />;
}

export function StockScreener() {
  const [data, setData] = useState<ScreenerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  // Filter state
  const [sectorFilter, setSectorFilter] = useState('All');
  const [marketCapFilter, setMarketCapFilter] = useState('All');
  const [peFilter, setPeFilter] = useState('All');
  const [changeFilter, setChangeFilter] = useState('All');
  const [signalFilter, setSignalFilter] = useState('All');
  const [sortField, setSortField] = useState('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();

    if (sectorFilter !== 'All') params.set('sector', sectorFilter);

    if (marketCapFilter !== 'All') {
      if (marketCapFilter === 'small') {
        params.set('marketCapMax', '2B');
      } else if (marketCapFilter === 'mid') {
        params.set('marketCapMin', '2B');
        params.set('marketCapMax', '10B');
      } else if (marketCapFilter === 'large') {
        params.set('marketCapMin', '10B');
        params.set('marketCapMax', '200B');
      } else if (marketCapFilter === 'mega') {
        params.set('marketCapMin', '200B');
      }
    }

    if (peFilter !== 'All') {
      if (peFilter === 'value') {
        params.set('peMax', '15');
      } else if (peFilter === 'moderate') {
        params.set('peMin', '15');
        params.set('peMax', '25');
      } else if (peFilter === 'growth') {
        params.set('peMin', '25');
        params.set('peMax', '50');
      } else if (peFilter === 'premium') {
        params.set('peMin', '50');
      }
    }

    if (changeFilter !== 'All') {
      if (changeFilter === 'up5') {
        params.set('changeMin', '5');
      } else if (changeFilter === 'up10') {
        params.set('changeMin', '10');
      } else if (changeFilter === 'down5') {
        params.set('changeMax', '-5');
      } else if (changeFilter === 'down10') {
        params.set('changeMax', '-10');
      }
    }

    if (signalFilter !== 'All') {
      params.set('signal', signalFilter);
    }

    const sortStr = sortDir === 'desc' ? `-${sortField}` : sortField;
    params.set('sort', sortStr);

    return params.toString();
  }, [sectorFilter, marketCapFilter, peFilter, changeFilter, signalFilter, sortField, sortDir]);

  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const query = buildQuery();
      const res = await fetch(`/api/screener${query ? `?${query}` : ''}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Gabim');
        return;
      }
      setData(json);
    } catch {
      setError('Gabim rrjeti');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [buildQuery]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, []);

  // Apply filters
  const applyFilters = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[120px] rounded-xl" />
        <Skeleton className="h-[500px] rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-500/20 bg-red-500/5">
        <CardContent className="flex items-center gap-2 py-4">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-sm text-red-400">{error}</span>
          <button onClick={fetchData} className="ml-auto text-xs text-red-500 hover:underline">Provo përsëri</button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Controls */}
      <Card className="border-border/50 bg-card/50">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-semibold">Filtra</h3>
            </div>
            <Button
              onClick={applyFilters}
              disabled={isRefreshing}
              className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs"
            >
              {isRefreshing ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Search className="w-3 h-3 mr-1" />
              )}
              Filtro
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Sector */}
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Sektori</label>
              <Select value={sectorFilter} onValueChange={setSectorFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">Të gjithë</SelectItem>
                  {data?.sectors.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Market Cap */}
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Kapitalizimi</label>
              <Select value={marketCapFilter} onValueChange={setMarketCapFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">Të gjithë</SelectItem>
                  <SelectItem value="small">I Vogël (&lt;2B)</SelectItem>
                  <SelectItem value="mid">I Mesëm (2-10B)</SelectItem>
                  <SelectItem value="large">I Madh (10B+)</SelectItem>
                  <SelectItem value="mega">Mega (200B+)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* P/E Ratio */}
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">P/E Raporti</label>
              <Select value={peFilter} onValueChange={setPeFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">Të gjithë</SelectItem>
                  <SelectItem value="value">Vlerë (&lt;15)</SelectItem>
                  <SelectItem value="moderate">Moderat (15-25)</SelectItem>
                  <SelectItem value="growth">Rritje (25-50)</SelectItem>
                  <SelectItem value="premium">Premium (&gt;50)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Change */}
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Ndryshimi %</label>
              <Select value={changeFilter} onValueChange={setChangeFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">Të gjithë</SelectItem>
                  <SelectItem value="up10">+10% ose më shumë</SelectItem>
                  <SelectItem value="up5">+5% ose më shumë</SelectItem>
                  <SelectItem value="down5">-5% ose më pak</SelectItem>
                  <SelectItem value="down10">-10% ose më pak</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Signal */}
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Sinjali</label>
              <Select value={signalFilter} onValueChange={setSignalFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">Të gjithë</SelectItem>
                  <SelectItem value="BULLISH">Bullish</SelectItem>
                  <SelectItem value="BEARISH">Bearish</SelectItem>
                  <SelectItem value="NEUTRAL">Neutral</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{data?.filteredCount || 0}</span> nga {data?.totalStocks || 0} aksione
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={isRefreshing}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-blue-500 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            Rifresko
          </button>
          <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-blue-500 transition-colors">
            <Download className="w-3 h-3" />
            Eksporto
          </button>
        </div>
      </div>

      {/* Results Table */}
      <Card className="border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                {[
                  { key: 'ticker', label: 'Ticker' },
                  { key: 'company', label: 'Kompania' },
                  { key: 'sector', label: 'Sektori' },
                  { key: 'price', label: 'Çmimi' },
                  { key: 'change', label: 'Ndryshimi' },
                  { key: 'pe', label: 'P/E' },
                  { key: 'marketCapNum', label: 'Kap. Tregut' },
                  { key: 'signal', label: 'Sinjali' },
                  { key: 'score', label: 'Pikët' },
                ].map(col => (
                  <th
                    key={col.key}
                    className="py-2.5 px-3 text-left font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors whitespace-nowrap"
                    onClick={() => toggleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {sortField === col.key && (
                        sortDir === 'desc'
                          ? <ChevronDown className="w-3 h-3" />
                          : <ChevronUp className="w-3 h-3" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {data?.stocks.map((stock, i) => {
                  const isUp = stock.change >= 0;
                  const isExpanded = expandedTicker === stock.ticker;

                  return (
                    <motion.tr
                      key={stock.ticker}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className={`border-b border-border/30 transition-colors ${
                        isExpanded ? 'bg-blue-500/5' : 'hover:bg-muted/30'
                      } cursor-pointer`}
                      onClick={() => setExpandedTicker(isExpanded ? null : stock.ticker)}
                    >
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-foreground">{stock.ticker}</span>
                      </td>
                      <td className="py-2.5 px-3 max-w-[120px] truncate text-muted-foreground">
                        {stock.company}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant="secondary" className="text-[8px] px-1.5 h-4">{stock.sector}</Badge>
                      </td>
                      <td className="py-2.5 px-3 font-semibold tabular-nums">
                        ${stock.price.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`flex items-center gap-0.5 font-medium tabular-nums ${isUp ? 'text-emerald-500' : 'text-red-500'}`}>
                          {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {isUp ? '+' : ''}{stock.change.toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3 tabular-nums">
                        {stock.pe > 0 ? stock.pe.toFixed(1) : 'N/A'}
                      </td>
                      <td className="py-2.5 px-3 tabular-nums">
                        {stock.marketCap}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1">
                          <SignalIcon signal={stock.signal} />
                          <span className="text-[10px] font-medium">{stock.signal === 'BULLISH' ? 'Bullish' : stock.signal === 'BEARISH' ? 'Bearish' : 'Neutral'}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                stock.score >= 70 ? 'bg-emerald-500' :
                                stock.score >= 50 ? 'bg-amber-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${stock.score}%` }}
                            />
                          </div>
                          <span className={`text-[10px] font-bold tabular-nums ${
                            stock.score >= 70 ? 'text-emerald-500' :
                            stock.score >= 50 ? 'text-amber-500' : 'text-red-500'
                          }`}>
                            {stock.score}
                          </span>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {data && data.stocks.length === 0 && (
          <div className="text-center py-12">
            <Filter className="w-10 h-10 mx-auto mb-2 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground">Nuk u gjetën aksione me këto filtra</p>
            <p className="text-[10px] text-muted-foreground/70 mt-1">Ndrysho filtrat dhe provo përsëri</p>
          </div>
        )}
      </Card>

      {/* Expanded stock detail */}
      <AnimatePresence>
        {expandedTicker && data && (() => {
          const stock = data.stocks.find(s => s.ticker === expandedTicker);
          if (!stock) return null;
          return (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <Card className="border-blue-500/20 bg-blue-500/5">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold">{stock.ticker}</span>
                      <RatingBadge rating={stock.rating} />
                      <Badge variant="secondary" className="text-[9px]">{stock.sector}</Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedTicker(null)}
                      className="h-7 w-7 p-0"
                    >
                      ✕
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                    {[
                      { label: 'Çmimi', value: `$${stock.price.toFixed(2)}`, color: '' },
                      { label: 'Ndryshimi', value: `${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)}%`, color: stock.change >= 0 ? 'text-emerald-500' : 'text-red-500' },
                      { label: 'P/E', value: stock.pe > 0 ? `${stock.pe.toFixed(1)}x` : 'N/A', color: '' },
                      { label: 'Fwd P/E', value: `${stock.fwdPE.toFixed(1)}x`, color: '' },
                      { label: 'PEG', value: `${stock.peg.toFixed(1)}`, color: '' },
                      { label: 'P/S', value: `${stock.ps.toFixed(1)}x`, color: '' },
                      { label: 'Marzh Net', value: stock.netMargin, color: '' },
                      { label: 'Rritja Rev', value: stock.revGrowth, color: parseFloat(stock.revGrowth) >= 0 ? 'text-emerald-500' : 'text-red-500' },
                      { label: 'Rritja EPS', value: stock.epsGrowth, color: parseFloat(stock.epsGrowth) >= 0 ? 'text-emerald-500' : 'text-red-500' },
                      { label: 'FCF', value: stock.fcf, color: '' },
                      { label: 'Objektivi', value: stock.targetPrice, color: 'text-emerald-500' },
                      { label: 'Vëllimi', value: stock.volume, color: '' },
                    ].map(item => (
                      <div key={item.label} className="bg-muted/30 rounded-lg p-2 text-center">
                        <p className="text-[8px] text-muted-foreground">{item.label}</p>
                        <p className={`text-xs font-bold ${item.color}`}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Disclaimer */}
      <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-amber-600/80 leading-relaxed">
            Skaner i Aksioneve përdor data nga Yahoo Finance dhe analiza bazë. Pikët llogariten sipas rritjes,
            vlerësimit, sinjaleve, dhe forcës konkurruese. Kliko në një rresht për detaje. Nuk përbën këshillë financiare.
          </p>
        </div>
      </div>
    </div>
  );
}
