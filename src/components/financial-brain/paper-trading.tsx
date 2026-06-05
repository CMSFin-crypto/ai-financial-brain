'use client';

import { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';

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

interface PortfolioState {
  balance: number;
  totalInvested: number;
  portfolioValue: number;
  portfolio: PortfolioItem[];
  recentTrades: Trade[];
  startingBalance: number;
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

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

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
          fetchPortfolio();
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
  const investedPercent = ((portfolio.totalInvested / portfolio.startingBalance) * 100).toFixed(1);

  return (
    <div className="space-y-4">
      {/* Balance Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Balanca</p>
                <p className="text-xl font-bold text-emerald-500">
                  ${portfolio.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-muted-foreground">{balancePercent}% e lirë</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">E Investuar</p>
                <p className="text-xl font-bold">
                  ${portfolio.totalInvested.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-muted-foreground">{investedPercent}% e kapitalit</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-teal-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Kapitali Total</p>
                <p className="text-xl font-bold">
                  ${(portfolio.balance + portfolio.totalInvested).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-muted-foreground">$100,000 fillim</p>
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
                    {['Technology', 'Healthcare', 'Finance', 'Energy', 'Consumer', 'Industrial', 'Real Estate', 'Utilities', 'Materials', 'Telecom'].map(
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

        <Button variant="outline" size="sm" onClick={resetPortfolio} className="text-xs">
          <RotateCcw className="w-3.5 h-3.5 mr-1" />
          Rivendos
        </Button>
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
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-2">
                  {portfolio.portfolio.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{item.ticker}</span>
                          <Badge variant="outline" className="text-[10px]">{item.sector}</Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                          {item.company}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{item.shares} aks.</p>
                        <p className="text-[11px] text-muted-foreground">
                          @ ${item.avgPrice.toFixed(2)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Total: ${(item.shares * item.avgPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  ))}
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
              <ScrollArea className="max-h-[300px]">
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
    </div>
  );
}
