'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
  Plus,
  ShoppingCart,
  MinusCircle,
  Clock,
  DollarSign,
  BarChart3,
  PieChart as PieIcon,
  Loader2,
  Zap,
  Trophy,
  Target,
  Activity,
  RefreshCw,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface PortfolioItem {
  id: string;
  ticker: string;
  company: string;
  sector: string;
  shares: number;
  avgPrice: number;
  // Enhanced fields from refresh=1
  livePrice?: number;
  unrealizedPnL?: number;
  unrealizedPnLPct?: number;
  currentValue?: number;
  entryValue?: number;
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

interface PortfolioState {
  balance: number;
  totalInvested: number;
  portfolioValue: number;
  portfolio: PortfolioItem[];
  recentTrades: Trade[];
  startingBalance: number;
  // Enhanced fields from refresh=1
  totalCurrentValue?: number;
  totalPnL?: number;
  totalPnLPct?: number;
  totalPortfolioValue?: number;
  winCount?: number;
  lossCount?: number;
  winRate?: number;
  avgWin?: number;
  avgLoss?: number;
  bestTrade?: number;
  worstTrade?: number;
}

interface EquityPoint {
  date: string;
  value: number;
  invested: number;
}

interface SectorAllocation {
  name: string;
  value: number;
  color: string;
}

const SECTOR_COLORS: Record<string, string> = {
  Technology: '#10b981',
  Semiconductors: '#6366f1',
  Healthcare: '#f43f5e',
  Finance: '#f59e0b',
  Energy: '#8b5cf6',
  Industry: '#06b6d4',
  Retail: '#ec4899',
  Defense: '#64748b',
  AI: '#14b8a6',
  'E-Commerce/Cloud': '#3b82f6',
  Software: '#22c55e',
  Unknown: '#94a3b8',
};

const SECTOR_COLORS_FALLBACK = [
  '#10b981', '#6366f1', '#f43f5e', '#f59e0b', '#8b5cf6',
  '#06b6d4', '#ec4899', '#64748b', '#14b8a6', '#3b82f6',
  '#22c55e', '#94a3b8', '#d946ef', '#0ea5e9', '#f97316',
];

function getSectorColor(sector: string, index: number): string {
  if (SECTOR_COLORS[sector]) return SECTOR_COLORS[sector];
  // Map broader categories
  if (sector.includes('Tech') || sector.includes('Software') || sector.includes('Internet') || sector.includes('Streaming')) return '#10b981';
  if (sector.includes('Semi')) return '#6366f1';
  if (sector.includes('Health') || sector.includes('Pharma') || sector.includes('Bio') || sector.includes('Medical')) return '#f43f5e';
  if (sector.includes('Finance') || sector.includes('Insur')) return '#f59e0b';
  if (sector.includes('Energy')) return '#8b5cf6';
  if (sector.includes('Industry') || sector.includes('Aerospace') || sector.includes('Logistic') || sector.includes('Railroad') || sector.includes('Machinery') || sector.includes('Electrical')) return '#06b6d4';
  if (sector.includes('Retail') || sector.includes('E-Commerce')) return '#ec4899';
  if (sector.includes('Defense')) return '#64748b';
  if (sector.includes('AI')) return '#14b8a6';
  return SECTOR_COLORS_FALLBACK[index % SECTOR_COLORS_FALLBACK.length];
}

export function PaperTrading() {
  const [portfolio, setPortfolio] = useState<PortfolioState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
  const [tradeForm, setTradeForm] = useState({
    action: 'BUY' as 'BUY' | 'SELL',
    ticker: '',
    company: '',
    sector: 'Technology',
    shares: 0,
    price: 0,
    reason: '',
  });
  const [isTrading, setIsTrading] = useState(false);
  const [tradeResult, setTradeResult] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchPortfolio = useCallback(async () => {
    try {
      const res = await fetch('/api/paper-trade');
      const data = await res.json();
      setPortfolio(data);
    } catch (err) {
      console.error('Failed to fetch portfolio:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchPortfolioWithRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/paper-trade?refresh=1');
      const data = await res.json();
      setPortfolio(data);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Failed to fetch live portfolio:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchPortfolio();
    // Fetch with refresh immediately after initial load
    const timer = setTimeout(() => {
      fetchPortfolioWithRefresh();
    }, 1500);
    return () => clearTimeout(timer);
  }, [fetchPortfolio, fetchPortfolioWithRefresh]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    refreshIntervalRef.current = setInterval(() => {
      fetchPortfolioWithRefresh();
    }, 60000);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [fetchPortfolioWithRefresh]);

  const executeTrade = async () => {
    if (!tradeForm.ticker || tradeForm.shares <= 0 || tradeForm.price <= 0) return;

    setIsTrading(true);
    try {
      const res = await fetch('/api/paper-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tradeForm),
      });
      const data = await res.json();

      if (data.error) {
        setTradeResult(`❌ ${data.error}`);
      } else {
        setTradeResult(`✅ ${data.message}`);
        setTradeForm({ action: 'BUY', ticker: '', company: '', sector: 'Technology', shares: 0, price: 0, reason: '' });
        setTimeout(() => {
          setTradeDialogOpen(false);
          setTradeResult(null);
          fetchPortfolioWithRefresh();
        }, 1500);
      }
    } catch {
      setTradeResult('❌ Gabim rrjeti. Provo përsëri.');
    } finally {
      setIsTrading(false);
    }
  };

  const resetPortfolio = async () => {
    try {
      await fetch('/api/paper-trade', { method: 'DELETE' });
      fetchPortfolio();
    } catch {
      // silent
    }
  };

  // Generate equity curve from trades
  const getEquityCurve = (): EquityPoint[] => {
    if (!portfolio || !portfolio.recentTrades || portfolio.recentTrades.length === 0) return [];

    const tradesCopy = [...portfolio.recentTrades].reverse(); // chronological order
    const curve: EquityPoint[] = [{ date: 'Fillim', value: portfolio.startingBalance, invested: 0 }];

    let equity = portfolio.startingBalance;
    let totalInvested = 0;

    for (const trade of tradesCopy) {
      if (trade.action === 'BUY') {
        equity -= trade.totalValue;
        totalInvested += trade.totalValue;
      } else if (trade.action === 'SELL') {
        equity += trade.totalValue;
      }

      const date = new Date(trade.createdAt);
      const label = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

      curve.push({
        date: label,
        value: Math.round(equity * 100) / 100,
        invested: Math.round(totalInvested * 100) / 100,
      });
    }

    return curve;
  };

  // Calculate sector allocation
  const getSectorAllocation = (): SectorAllocation[] => {
    if (!portfolio || portfolio.portfolio.length === 0) return [];

    const sectorMap: Record<string, number> = {};
    for (const item of portfolio.portfolio) {
      const val = item.currentValue ?? (item.avgPrice * item.shares);
      sectorMap[item.sector] = (sectorMap[item.sector] || 0) + val;
    }

    return Object.entries(sectorMap)
      .map(([name, value], i) => ({
        name,
        value: Math.round(value * 100) / 100,
        color: getSectorColor(name, i),
      }))
      .sort((a, b) => b.value - a.value);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[120px] rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-[160px] rounded-xl" />
          <Skeleton className="h-[160px] rounded-xl" />
          <Skeleton className="h-[160px] rounded-xl" />
        </div>
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">Duke ngarkuar portofolin...</p>
      </div>
    );
  }

  const balancePercent = ((portfolio.balance / portfolio.startingBalance) * 100).toFixed(1);
  const investedPercent = portfolio.totalInvested > 0 ? ((portfolio.totalInvested / portfolio.startingBalance) * 100).toFixed(1) : '0.0';

  // Use live values if available, otherwise fall back to static
  const totalPnL = portfolio.totalPnL ?? 0;
  const totalPnLPct = portfolio.totalPnLPct ?? 0;
  const totalPortfolioValue = portfolio.totalPortfolioValue ?? (portfolio.balance + portfolio.totalInvested);
  const winRate = portfolio.winRate ?? 0;
  const avgWin = portfolio.avgWin ?? 0;
  const avgLoss = portfolio.avgLoss ?? 0;
  const bestTrade = portfolio.bestTrade ?? 0;
  const worstTrade = portfolio.worstTrade ?? 0;
  const totalClosedTrades = (portfolio.winCount ?? 0) + (portfolio.lossCount ?? 0);

  const equityCurve = getEquityCurve();
  const sectorAllocation = getSectorAllocation();

  // Format time since last refresh
  const getRefreshLabel = () => {
    if (!lastRefresh) return '';
    const now = new Date();
    const diffMs = now.getTime() - lastRefresh.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 5) return 'Tani';
    if (diffSec < 60) return `${diffSec}s më parë`;
    const diffMin = Math.floor(diffSec / 60);
    return `${diffMin}m më parë`;
  };

  return (
    <div className="space-y-4">
      {/* Balance Overview - Enhanced with live P&L */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Wallet className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground">Balanca</p>
                <p className="text-base font-bold text-emerald-500 truncate">
                  ${portfolio.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[9px] text-muted-foreground">{balancePercent}% e lirë</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-teal-500/10 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-teal-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground">Vlera e Portfolios</p>
                <p className="text-base font-bold truncate">
                  ${totalPortfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[9px] text-muted-foreground">{investedPercent}% investuar</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2.5">
              <div className={`w-9 h-9 rounded-lg ${totalPnL >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'} flex items-center justify-center`}>
                {totalPnL >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-500" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground">P&L Total</p>
                <p className={`text-base font-bold truncate ${totalPnL >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {totalPnL >= 0 ? '+' : ''}${totalPnL.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
                <p className={`text-[9px] ${totalPnLPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {totalPnLPct >= 0 ? '+' : ''}{totalPnLPct.toFixed(1)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Target className="w-4 h-4 text-amber-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground">Win Rate</p>
                <p className="text-base font-bold text-amber-500 truncate">
                  {winRate.toFixed(1)}%
                </p>
                <p className="text-[9px] text-muted-foreground">{totalClosedTrades} tregtime</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Dialog open={tradeDialogOpen} onOpenChange={setTradeDialogOpen}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              <ShoppingCart className="w-4 h-4 mr-1.5" />
              Blerje / Shitje
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-500" />
                Ekzekuto Tregtim
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              {/* Action */}
              <div className="flex gap-2">
                <Button
                  variant={tradeForm.action === 'BUY' ? 'default' : 'outline'}
                  className={`flex-1 ${tradeForm.action === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
                  onClick={() => setTradeForm({ ...tradeForm, action: 'BUY' })}
                >
                  <ArrowUpRight className="w-4 h-4 mr-1" />
                  BLEJ
                </Button>
                <Button
                  variant={tradeForm.action === 'SELL' ? 'default' : 'outline'}
                  className={`flex-1 ${tradeForm.action === 'SELL' ? 'bg-red-600 hover:bg-red-700' : ''}`}
                  onClick={() => setTradeForm({ ...tradeForm, action: 'SELL' })}
                >
                  <ArrowDownRight className="w-4 h-4 mr-1" />
                  SHIT
                </Button>
              </div>

              {/* Ticker */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Ticker</label>
                <Input
                  placeholder="p.sh. AAPL"
                  value={tradeForm.ticker}
                  onChange={(e) => setTradeForm({ ...tradeForm, ticker: e.target.value.toUpperCase() })}
                  className="h-9 text-sm"
                />
              </div>

              {/* Company */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Kompania (opsionale)</label>
                <Input
                  placeholder="p.sh. Apple Inc."
                  value={tradeForm.company}
                  onChange={(e) => setTradeForm({ ...tradeForm, company: e.target.value })}
                  className="h-9 text-sm"
                />
              </div>

              {/* Sector */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Sektori</label>
                <Select
                  value={tradeForm.sector}
                  onValueChange={(v) => setTradeForm({ ...tradeForm, sector: v })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['Technology', 'Semiconductors', 'Healthcare', 'Finance', 'Energy', 'Industry', 'Retail', 'Defense', 'AI'].map(
                      (s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Shares & Price */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Aksione</label>
                  <Input
                    type="number"
                    placeholder="10"
                    value={tradeForm.shares || ''}
                    onChange={(e) => setTradeForm({ ...tradeForm, shares: Number(e.target.value) })}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Çmimi ($)</label>
                  <Input
                    type="number"
                    placeholder="195.50"
                    value={tradeForm.price || ''}
                    onChange={(e) => setTradeForm({ ...tradeForm, price: Number(e.target.value) })}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              {/* Total Preview */}
              {tradeForm.shares > 0 && tradeForm.price > 0 && (
                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Totali:</span>
                    <span className="font-semibold">
                      ${(tradeForm.shares * tradeForm.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {tradeForm.action === 'BUY' && tradeForm.shares * tradeForm.price > portfolio.balance && (
                    <p className="text-xs text-red-500 mt-1">⚠ Balanca e pamjaftueshme</p>
                  )}
                </div>
              )}

              {/* Reason */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Arsyeja (opsionale)</label>
                <Input
                  placeholder="P.sh. Analiza teknike tregon RSI oversold"
                  value={tradeForm.reason}
                  onChange={(e) => setTradeForm({ ...tradeForm, reason: e.target.value })}
                  className="h-9 text-sm"
                />
              </div>

              {/* Trade Result */}
              {tradeResult && (
                <div className={`text-sm p-2 rounded-lg ${tradeResult.includes('❌') ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                  {tradeResult}
                </div>
              )}

              {/* Submit */}
              <Button
                onClick={executeTrade}
                disabled={isTrading || !tradeForm.ticker || tradeForm.shares <= 0 || tradeForm.price <= 0}
                className={`w-full ${tradeForm.action === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'} text-white`}
              >
                {isTrading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : tradeForm.action === 'BUY' ? (
                  <ArrowUpRight className="w-4 h-4 mr-2" />
                ) : (
                  <ArrowDownRight className="w-4 h-4 mr-2" />
                )}
                {isTrading
                  ? 'Duke ekzekutuar...'
                  : `${tradeForm.action === 'BUY' ? 'BLEJ' : 'SHIT'} ${tradeForm.shares || 0} ${tradeForm.ticker || '---'}`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchPortfolioWithRefresh}
          disabled={isRefreshing}
          className="text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Duke freskuar...' : 'Fresko Çmimet'}
        </Button>

        <Button variant="outline" size="sm" onClick={resetPortfolio} className="text-xs">
          <RotateCcw className="w-3.5 h-3.5 mr-1" />
          Rivendos
        </Button>

        {lastRefresh && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            Përditësuar: {getRefreshLabel()}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Holdings */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-emerald-500" />
              Pozicionet e Hapura
              {portfolio.portfolio.length > 0 && (
                <Badge variant="secondary" className="ml-auto text-xs bg-emerald-500/10 text-emerald-500">
                  {portfolio.portfolio.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {portfolio.portfolio.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nuk ke pozicione të hapura</p>
                <p className="text-xs">Kliko &quot;Blerje / Shitje&quot; për të filluar</p>
              </div>
            ) : (
              <ScrollArea className="max-h-[350px]">
                <div className="space-y-2">
                  {portfolio.portfolio.map((item) => {
                    const livePrice = item.livePrice ?? item.avgPrice;
                    const unrealizedPnL = item.unrealizedPnL ?? 0;
                    const unrealizedPnLPct = item.unrealizedPnLPct ?? 0;
                    const currentValue = item.currentValue ?? (item.avgPrice * item.shares);
                    const hasLiveData = item.livePrice !== undefined && item.livePrice !== item.avgPrice;

                    return (
                      <div
                        key={item.id}
                        className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm">{item.ticker}</span>
                              <Badge variant="outline" className="text-[10px]">{item.sector}</Badge>
                              {hasLiveData && (
                                <Badge variant="outline" className="text-[10px] bg-sky-500/10 border-sky-500/30 text-sky-500">
                                  LIVE
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                              {item.company}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">{item.shares} aks.</p>
                            <p className="text-[11px] text-muted-foreground">
                              Hyrja: @ ${item.avgPrice.toFixed(2)}
                            </p>
                          </div>
                        </div>

                        {/* Live P&L row */}
                        <Separator className="my-1.5 opacity-30" />
                        <div className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-3">
                            <span className="text-muted-foreground">
                              Live: <span className="font-medium text-foreground">${livePrice.toFixed(2)}</span>
                            </span>
                            <span className="text-muted-foreground">
                              Vlera: <span className="font-medium text-foreground">${currentValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${unrealizedPnL >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {unrealizedPnL >= 0 ? '+' : ''}${unrealizedPnL.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                            <Badge
                              variant="secondary"
                              className={`text-[10px] px-1.5 py-0 ${unrealizedPnLPct >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}
                            >
                              {unrealizedPnLPct >= 0 ? '+' : ''}{unrealizedPnLPct.toFixed(1)}%
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Recent Trades */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              Tregtimet e Fundit
              {portfolio.recentTrades.length > 0 && (
                <Badge variant="secondary" className="ml-auto text-xs bg-amber-500/10 text-amber-500">
                  {portfolio.recentTrades.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {portfolio.recentTrades.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nuk ka tregtime</p>
                <p className="text-xs">Tregtimet do shfaqen këtu</p>
              </div>
            ) : (
              <ScrollArea className="max-h-[350px]">
                <div className="space-y-2">
                  {portfolio.recentTrades.map((trade) => (
                    <div
                      key={trade.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {trade.action === 'BUY' ? (
                          <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <ArrowDownRight className="w-4 h-4 text-red-500" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm">{trade.ticker}</span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${trade.action === 'BUY' ? 'border-emerald-500/30 text-emerald-500' : 'border-red-500/30 text-red-500'}`}
                            >
                              {trade.action}
                            </Badge>
                          </div>
                          {trade.reason && (
                            <p className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                              {trade.reason}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {trade.shares} × ${trade.price.toFixed(2)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          ${trade.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Performance Analytics & Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Performance Analytics */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold flex items-center gap-2">
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
              Performanca e Portfolios
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {/* Win Rate */}
              <div className="text-center p-2 rounded-lg bg-muted/30">
                <p className="text-[10px] text-muted-foreground">Win Rate</p>
                <p className={`text-sm font-bold ${winRate >= 50 ? 'text-emerald-500' : 'text-red-500'}`}>{winRate.toFixed(1)}%</p>
              </div>
              {/* Total Trades */}
              <div className="text-center p-2 rounded-lg bg-muted/30">
                <p className="text-[10px] text-muted-foreground">Total Trades</p>
                <p className="text-sm font-bold">{totalClosedTrades}</p>
              </div>
              {/* Avg Win */}
              <div className="text-center p-2 rounded-lg bg-muted/30">
                <p className="text-[10px] text-muted-foreground">Mesatarja Fitimit</p>
                <p className="text-sm font-bold text-emerald-500">+{avgWin.toFixed(1)}%</p>
              </div>
              {/* Avg Loss */}
              <div className="text-center p-2 rounded-lg bg-muted/30">
                <p className="text-[10px] text-muted-foreground">Mesatarja Zbritjes</p>
                <p className="text-sm font-bold text-red-500">-{avgLoss.toFixed(1)}%</p>
              </div>
            </div>

            {/* Best / Worst */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="text-center p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                <p className="text-[10px] text-muted-foreground">Tregtimi më i mirë</p>
                <p className="text-sm font-bold text-emerald-500">+{bestTrade.toFixed(1)}%</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-red-500/5 border border-red-500/10">
                <p className="text-[10px] text-muted-foreground">Tregtimi më i keq</p>
                <p className="text-sm font-bold text-red-500">-{worstTrade.toFixed(1)}%</p>
              </div>
            </div>

            {/* Equity curve chart */}
            {equityCurve.length > 1 && (
              <div>
                <p className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  Lakore e Ekuitetit (Cash Flow)
                </p>
                <div className="h-[150px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={equityCurve}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        contentStyle={{
                          fontSize: 11,
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: 8,
                        }}
                        formatter={(value: number) => [`$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, '']}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={false}
                        name="Ekuiteti"
                      />
                      <Line
                        type="monotone"
                        dataKey="invested"
                        stroke="#6b7280"
                        strokeWidth={1}
                        strokeDasharray="5 5"
                        dot={false}
                        name="E Investuar"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {equityCurve.length <= 1 && (
              <div className="text-center py-6 text-muted-foreground">
                <Activity className="w-6 h-6 mx-auto mb-1 opacity-30" />
                <p className="text-[11px]">Lakorea e ekuitetit shfaqet pas tregtimeve</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sector Allocation */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold flex items-center gap-2">
              <PieIcon className="w-3.5 h-3.5 text-violet-500" />
              Shpërndarja sipas Sektorit
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sectorAllocation.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <PieIcon className="w-6 h-6 mx-auto mb-1 opacity-30" />
                <p className="text-[11px]">Shpërndarja shfaqet pas pozicioneve</p>
              </div>
            ) : (
              <div>
                <div className="h-[160px] mb-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sectorAllocation}
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={65}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {sectorAllocation.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          fontSize: 11,
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: 8,
                        }}
                        formatter={(value: number) => [`$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 'Vlera']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Sector legend */}
                <div className="grid grid-cols-2 gap-1.5">
                  {sectorAllocation.map((sector) => {
                    const totalVal = sectorAllocation.reduce((s, sec) => s + sec.value, 0);
                    const pct = totalVal > 0 ? ((sector.value / totalVal) * 100).toFixed(1) : '0.0';
                    return (
                      <div key={sector.name} className="flex items-center gap-2 text-[11px]">
                        <div
                          className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                          style={{ backgroundColor: sector.color }}
                        />
                        <span className="text-muted-foreground truncate flex-1">{sector.name}</span>
                        <span className="font-medium">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
