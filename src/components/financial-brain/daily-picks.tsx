'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowUpCircle,
  ArrowDownCircle,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  RefreshCw,
  Loader2,
  Clock,
  DollarSign,
  ShieldAlert,
  BarChart3,
  AlertTriangle,
} from 'lucide-react';

interface DailyPick {
  ticker: string;
  company: string;
  sector: string;
  currentPrice: number;
  targetPrice: number;
  stopLoss: number;
  signal: string;
  confidence: number;
  timeframe: string;
  technicalReason: string;
  fundamentalReason: string;
  catalyst: string;
  riskReward: string;
  keyLevels: {
    support: string;
    resistance: string;
    pivot: string;
  };
}

interface MarketMover {
  ticker: string;
  direction: string;
  reason: string;
}

interface DailyPicksResult {
  date: string;
  marketCondition: string;
  marketSummary: string;
  topPicks: DailyPick[];
  marketMovers: MarketMover[];
  warnings: string[];
}

export function DailyPicks() {
  const [picks, setPicks] = useState<DailyPicksResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPicks = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/daily-picks');
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Dështoi marrja e picks');
        return;
      }
      setPicks(data.picks);
    } catch {
      setError('Gabim rrjeti. Provo përsëri.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPicks();
  }, []);

  const getPotentialReturn = (current: number, target: number) => {
    return (((target - current) / current) * 100).toFixed(1);
  };

  if (isLoading && !picks) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[100px] rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Skeleton className="h-[280px] rounded-xl" />
          <Skeleton className="h-[280px] rounded-xl" />
          <Skeleton className="h-[280px] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Refresh Button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {picks ? `Përditësuar për ${picks.date}` : 'Kliko për të marrë parashikimet ditore'}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchPicks}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-1.5" />
          )}
          Rifresko
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Market Overview */}
      {picks && (
        <>
          <Card className={`border-border/50 ${
            picks.marketCondition === 'bullish'
              ? 'bg-emerald-500/5 border-emerald-500/20'
              : picks.marketCondition === 'bearish'
                ? 'bg-red-500/5 border-red-500/20'
                : 'bg-amber-500/5 border-amber-500/20'
          }`}>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3 mb-3">
                {picks.marketCondition === 'bullish' ? (
                  <TrendingUp className="w-5 h-5 text-emerald-500" />
                ) : picks.marketCondition === 'bearish' ? (
                  <TrendingDown className="w-5 h-5 text-red-500" />
                ) : (
                  <Minus className="w-5 h-5 text-amber-500" />
                )}
                <div>
                  <p className="text-sm font-semibold capitalize">
                    Tregu: {picks.marketCondition === 'bullish' ? 'Bullish' : picks.marketCondition === 'bearish' ? 'Bearish' : 'Neutral'}
                  </p>
                  <p className="text-xs text-muted-foreground">{picks.marketSummary}</p>
                </div>
              </div>

              {/* Market Movers */}
              {picks.marketMovers && picks.marketMovers.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {picks.marketMovers.map((mover, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className={`text-[10px] ${
                        mover.direction === 'UP'
                          ? 'border-emerald-500/30 text-emerald-500'
                          : 'border-red-500/30 text-red-500'
                      }`}
                    >
                      {mover.ticker} {mover.direction === 'UP' ? '↑' : '↓'} — {mover.reason}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Warnings */}
              {picks.warnings && picks.warnings.length > 0 && (
                <div className="mt-3 space-y-1">
                  {picks.warnings.map((warning, i) => (
                    <p key={i} className="text-[11px] text-amber-500 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {warning}
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Picks Grid */}
          {picks.topPicks && picks.topPicks.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {picks.topPicks.map((pick, index) => {
                const potentialReturn = getPotentialReturn(pick.currentPrice, pick.targetPrice);
                return (
                  <Card
                    key={pick.ticker}
                    className={`border-border/50 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 ${
                      pick.signal === 'BUY'
                        ? 'bg-emerald-500/5 hover:border-emerald-500/30'
                        : 'bg-amber-500/5 hover:border-amber-500/30'
                    }`}
                  >
                    <CardContent className="pt-5 space-y-3">
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-muted-foreground">#{index + 1}</span>
                            <h4 className="text-lg font-bold">{pick.ticker}</h4>
                            <Badge
                              className={
                                pick.signal === 'BUY'
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-amber-500 text-white'
                              }
                            >
                              {pick.signal}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {pick.company} • {pick.sector}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-1">
                            <Zap className="w-3 h-3 text-amber-500" />
                            <span className="text-sm font-bold">{pick.confidence}%</span>
                          </div>
                          <Badge variant="outline" className="text-[10px]">
                            {pick.timeframe}
                          </Badge>
                        </div>
                      </div>

                      {/* Price Levels */}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-muted/50 rounded-lg p-2">
                          <p className="text-[10px] text-muted-foreground">Tani</p>
                          <p className="text-sm font-bold">${pick.currentPrice}</p>
                        </div>
                        <div className="bg-emerald-500/10 rounded-lg p-2">
                          <p className="text-[10px] text-emerald-500">Objektivi</p>
                          <p className="text-sm font-bold text-emerald-500">${pick.targetPrice}</p>
                        </div>
                        <div className="bg-red-500/10 rounded-lg p-2">
                          <p className="text-[10px] text-red-500">Stop Loss</p>
                          <p className="text-sm font-bold text-red-500">${pick.stopLoss}</p>
                        </div>
                      </div>

                      {/* Return + Risk/Reward */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-xs font-medium text-emerald-500">
                            Potenciali: +{potentialReturn}%
                          </span>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          R/R: {pick.riskReward}
                        </Badge>
                      </div>

                      {/* Key Levels */}
                      <div className="flex gap-2 text-[10px]">
                        <span className="bg-muted/50 px-2 py-0.5 rounded">Suport: ${pick.keyLevels?.support || '—'}</span>
                        <span className="bg-muted/50 px-2 py-0.5 rounded">Pivot: ${pick.keyLevels?.pivot || '—'}</span>
                        <span className="bg-muted/50 px-2 py-0.5 rounded">Rezistencë: ${pick.keyLevels?.resistance || '—'}</span>
                      </div>

                      {/* Catalyst */}
                      {pick.catalyst && (
                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-2">
                          <p className="text-[10px] text-amber-500 font-medium flex items-center gap-1">
                            <Zap className="w-3 h-3" /> Katalizatori
                          </p>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">{pick.catalyst}</p>
                        </div>
                      )}

                      {/* Reasons */}
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <BarChart3 className="w-3 h-3" /> {pick.technicalReason}
                        </p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <DollarSign className="w-3 h-3" /> {pick.fundamentalReason}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Disclaimer */}
          <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-600/80 leading-relaxed">
                Këto janë sugjerime nga AI dhe nuk përbëjnë këshillë financiare.
                Gjithmonë bëni kërkimin tuaj para se të investoni.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
