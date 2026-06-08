'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  BarChart3,
  AlertTriangle,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';

interface IndexCard {
  ticker: string;
  name: string;
  price: number;
  change: number;
}

interface SectorCell {
  ticker: string;
  name: string;
  change: number;
}

interface MarketData {
  indices: IndexCard[];
  sectors: SectorCell[];
}

function FearGreedGauge({ score }: { score: number }) {
  const label =
    score <= 25 ? 'Frikë Ekstreme' :
    score <= 45 ? 'Frikë' :
    score <= 55 ? 'Neutral' :
    score <= 75 ? 'Lakmi' :
    'Lakmi Ekstrem';

  const labelColor =
    score <= 25 ? 'text-red-600' :
    score <= 45 ? 'text-red-400' :
    score <= 55 ? 'text-amber-500' :
    score <= 75 ? 'text-emerald-500' :
    'text-emerald-600';

  const gaugeColor =
    score <= 25 ? 'bg-red-600' :
    score <= 45 ? 'bg-red-400' :
    score <= 55 ? 'bg-amber-500' :
    score <= 75 ? 'bg-emerald-500' :
    'bg-emerald-600';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">Indeksi Frikë & Lakmi</span>
        <span className={`text-xs font-bold ${labelColor}`}>{label}</span>
      </div>
      {/* Gauge bar */}
      <div className="relative">
        <div className="h-4 rounded-full bg-gradient-to-r from-red-600 via-amber-500 to-emerald-500 overflow-hidden">
          <div className="h-full flex items-center justify-end pr-1">
            <div
              className={`w-3 h-3 rounded-full ${gaugeColor} border-2 border-white shadow-lg transition-all duration-700`}
              style={{ marginLeft: `${score}%` }}
            />
          </div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-red-500">0</span>
          <span className="text-[9px] text-amber-500">50</span>
          <span className="text-[9px] text-emerald-500">100</span>
        </div>
      </div>
      {/* Score display */}
      <div className="flex items-center justify-center gap-2">
        <span className={`text-3xl font-bold ${labelColor}`}>{Math.round(score)}</span>
        <span className="text-xs text-muted-foreground">/100</span>
      </div>
      {/* Legend */}
      <div className="grid grid-cols-5 gap-1">
        {[
          { label: 'Frikë Ekstreme', range: '0-25', color: 'text-red-600' },
          { label: 'Frikë', range: '25-45', color: 'text-red-400' },
          { label: 'Neutral', range: '45-55', color: 'text-amber-500' },
          { label: 'Lakmi', range: '55-75', color: 'text-emerald-500' },
          { label: 'Lakmi Ekstrem', range: '75-100', color: 'text-emerald-600' },
        ].map((item) => (
          <div key={item.label} className="text-center">
            <p className={`text-[8px] font-medium ${item.color}`}>{item.label}</p>
            <p className="text-[7px] text-muted-foreground">{item.range}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function getMarketSentiment(indices: IndexCard[]): { score: number; label: string; icon: typeof TrendingUp } {
  if (indices.length === 0) return { score: 50, label: 'Neutral', icon: Minus };

  const avgChange = indices.reduce((sum, idx) => sum + idx.change, 0) / indices.length;
  let score = 50 + avgChange * 10;
  score = Math.max(0, Math.min(100, score));

  const upCount = indices.filter(i => i.change > 0).length;
  const downCount = indices.filter(i => i.change < 0).length;

  if (upCount >= 3 && avgChange > 0.5) {
    return { score: Math.max(score, 65), label: 'Bullish', icon: TrendingUp };
  } else if (downCount >= 3 && avgChange < -0.5) {
    return { score: Math.min(score, 35), label: 'Bearish', icon: TrendingDown };
  } else if (avgChange > 0.2) {
    return { score, label: 'Lehtë Bullish', icon: ArrowUpRight };
  } else if (avgChange < -0.2) {
    return { score, label: 'Lehtë Bearish', icon: ArrowDownRight };
  }
  return { score, label: 'Neutral', icon: Minus };
}

export function MarketDashboard() {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const res = await fetch('/api/market-prices?tickers=SPY,QQQ,DIA,VIX,XLK,SMH,XLV,XLF,XLE,XLI,XLY,ITA,BOTZ');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Gabim');
        return;
      }

      const stocks = json.stocks || [];
      const tickerMap: Record<string, { price: number; change: number; company?: string; sector?: string }> = {};
      stocks.forEach((s: { ticker: string; price: number; change: number; company?: string; sector?: string }) => {
        tickerMap[s.ticker] = s;
      });

      const indexNames: Record<string, string> = {
        SPY: 'S&P 500',
        QQQ: 'NASDAQ 100',
        DIA: 'DOW 30',
        VIX: 'VIX',
      };

      const sectorNames: Record<string, string> = {
        XLK: 'Teknologji',
        SMH: 'Gjysmëpërçues',
        XLV: 'Shëndetësi',
        XLF: 'Financa',
        XLE: 'Energji',
        XLI: 'Industri',
        XLY: 'Konsum',
        ITA: 'Mbrojtje',
        BOTZ: 'AI & Robotikë',
      };

      const indices: IndexCard[] = ['SPY', 'QQQ', 'DIA', 'VIX'].map(ticker => ({
        ticker,
        name: indexNames[ticker],
        price: tickerMap[ticker]?.price ?? 0,
        change: tickerMap[ticker]?.change ?? 0,
      }));

      const sectors: SectorCell[] = ['XLK', 'SMH', 'XLV', 'XLF', 'XLE', 'XLI', 'XLY', 'ITA', 'BOTZ'].map(ticker => ({
        ticker,
        name: sectorNames[ticker],
        price: 0,
        change: tickerMap[ticker]?.change ?? 0,
      }));

      setData({ indices, sectors });
    } catch {
      setError('Gabim rrjeti');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Auto refresh every 60s
  useEffect(() => {
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-[100px] rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-[80px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[200px] rounded-xl" />
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

  if (!data) return null;

  const sentiment = getMarketSentiment(data.indices);
  const bestSector = data.sectors.reduce((best, s) => s.change > best.change ? s : best, data.sectors[0]);
  const worstSector = data.sectors.reduce((worst, s) => s.change < worst.change ? s : worst, data.sectors[0]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-emerald-500" />
          <span className="text-xs text-muted-foreground">Përmbledhje e tregut në kohë reale</span>
        </div>
        <button
          onClick={fetchData}
          disabled={isRefreshing}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-emerald-500 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          Rifresko
        </button>
      </div>

      {/* Market Indices Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {data.indices.map((index, i) => {
          const isUp = index.change >= 0;
          const isVix = index.ticker === 'VIX';

          return (
            <motion.div
              key={index.ticker}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className={`border ${isVix ? 'border-violet-500/20 bg-violet-500/5' : isUp ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'} hover:shadow-md transition-all duration-300`}>
                <CardContent className="pt-3.5 pb-3 px-3.5">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground font-medium">{index.name}</p>
                      <p className="text-xs text-muted-foreground/60">{index.ticker}</p>
                    </div>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isVix ? 'bg-violet-500/20' : isUp ? 'bg-emerald-500/20' : 'bg-red-500/20'
                    }`}>
                      {isUp ? (
                        isVix ? <Activity className="w-4 h-4 text-violet-500" /> : <TrendingUp className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                  </div>
                  <p className="text-lg font-bold tabular-nums">${index.price.toFixed(2)}</p>
                  <div className={`flex items-center gap-1 mt-1 ${
                    isVix
                      ? index.change > 1 ? 'text-red-500' : 'text-emerald-500'
                      : isUp ? 'text-emerald-500' : 'text-red-500'
                  }`}>
                    {isUp ? (
                      <ArrowUpRight className="w-3 h-3" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3" />
                    )}
                    <span className="text-xs font-semibold tabular-nums">
                      {isUp ? '+' : ''}{index.change.toFixed(2)}%
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Bottom row: Sector Heatmap + Market Summary + Fear & Greed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sector Heatmap */}
        <Card className="border-border/50 lg:col-span-1">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-semibold">Hartë e Sektoreve</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-1 gap-2">
              {data.sectors.map((sector) => {
                const isUp = sector.change >= 0;
                const intensity = Math.min(Math.abs(sector.change) / 3, 1);
                const bgColor = isUp
                  ? `rgba(16, 185, 129, ${0.1 + intensity * 0.3})`
                  : `rgba(239, 68, 68, ${0.1 + intensity * 0.3})`;

                return (
                  <div
                    key={sector.ticker}
                    className="rounded-lg p-2.5 border border-border/50 transition-all hover:scale-[1.02] cursor-default"
                    style={{ backgroundColor: bgColor }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold">{sector.name}</p>
                        <p className="text-[9px] text-muted-foreground">{sector.ticker}</p>
                      </div>
                      <span className={`text-xs font-bold ${isUp ? 'text-emerald-600' : 'text-red-600'} tabular-nums`}>
                        {isUp ? '+' : ''}{sector.change.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Market Summary */}
        <Card className="border-border/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-semibold">Përmbledhje e Tregut</h3>
            </div>

            {/* Market condition */}
            <div className={`flex items-center gap-3 rounded-lg p-3 mb-4 ${
              sentiment.label === 'Bullish' || sentiment.label === 'Lehtë Bullish'
                ? 'bg-emerald-500/10 border border-emerald-500/20'
                : sentiment.label === 'Bearish' || sentiment.label === 'Lehtë Bearish'
                ? 'bg-red-500/10 border border-red-500/20'
                : 'bg-amber-500/10 border border-amber-500/20'
            }`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                sentiment.label === 'Bullish' || sentiment.label === 'Lehtë Bullish'
                  ? 'bg-emerald-500/20'
                  : sentiment.label === 'Bearish' || sentiment.label === 'Lehtë Bearish'
                  ? 'bg-red-500/20'
                  : 'bg-amber-500/20'
              }`}>
                <sentiment.icon className={`w-5 h-5 ${
                  sentiment.label === 'Bullish' || sentiment.label === 'Lehtë Bullish'
                    ? 'text-emerald-500'
                    : sentiment.label === 'Bearish' || sentiment.label === 'Lehtë Bearish'
                    ? 'text-red-500'
                    : 'text-amber-500'
                }`} />
              </div>
              <div>
                <p className="text-sm font-bold">
                  Tregu tani: <span className={
                    sentiment.label === 'Bullish' || sentiment.label === 'Lehtë Bullish'
                      ? 'text-emerald-500'
                      : sentiment.label === 'Bearish' || sentiment.label === 'Lehtë Bearish'
                      ? 'text-red-500'
                      : 'text-amber-500'
                  }>{sentiment.label}</span>
                </p>
                <p className="text-[10px] text-muted-foreground">Bazuar në indekset kryesore</p>
              </div>
            </div>

            {/* Key factors */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Faktorë Kryesorë</p>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                  Sektori më i mirë: {bestSector.name} (+{bestSector.change.toFixed(2)}%)
                </Badge>
                <Badge variant="secondary" className="text-[10px] bg-red-500/10 text-red-600 border-red-500/20">
                  Sektori më i dobët: {worstSector.name} ({worstSector.change.toFixed(2)}%)
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  VIX: {data.indices.find(i => i.ticker === 'VIX')?.price.toFixed(2)}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  S&P 500: ${data.indices.find(i => i.ticker === 'SPY')?.price.toFixed(2)}
                </Badge>
              </div>
            </div>

            {/* Indices mini chart */}
            <div className="mt-4 space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Drejtëmia</p>
              {data.indices.filter(i => i.ticker !== 'VIX').map((idx) => {
                const isUp = idx.change >= 0;
                return (
                  <div key={idx.ticker} className="flex items-center gap-2">
                    <span className="text-[10px] font-medium w-16">{idx.ticker}</span>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${isUp ? 'bg-emerald-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(Math.abs(idx.change) * 20, 100)}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-medium tabular-nums w-14 text-right ${isUp ? 'text-emerald-500' : 'text-red-500'}`}>
                      {isUp ? '+' : ''}{idx.change.toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Fear & Greed Gauge */}
        <Card className="border-border/50">
          <CardContent className="pt-4">
            <FearGreedGauge score={sentiment.score} />

            {/* Explanation */}
            <div className="mt-4 border border-border/50 rounded-lg p-3 bg-muted/20">
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                <span className="font-medium text-foreground">Si llogaritet:</span> Indeksi bazohet në ndryshimet e çmimeve
                të indekseve kryesore (S&P 500, NASDAQ, DOW). Vlerë më të larta tregojnë lakmi tek tregu,
                ndërsa vlerë më të ulëta tregojnë frikë.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Disclaimer */}
      <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-amber-600/80 leading-relaxed">
            Të dhënat e tregut përditësohen në kohë reale nga Yahoo Finance. Indeksi Frikë & Lakmi llogaritet
            në bazë të ndryshimeve të indekseve kryesore. Nuk përbën këshillë financiare.
          </p>
        </div>
      </div>
    </div>
  );
}
