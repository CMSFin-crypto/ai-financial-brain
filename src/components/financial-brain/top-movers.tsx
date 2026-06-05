'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  ShieldAlert,
  Target,
  BarChart3,
  RefreshCw,
  AlertTriangle,
  Zap,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';

interface MoverStock {
  ticker: string;
  company: string;
  sector: string;
  industry: string;
  currentPrice: number;
  priceChange: number;
  score: number;
  targetPrice: string;
  highTarget: string;
  lowTarget: string;
  upside: number;
  rating: string;
  signal: string;
  trend: string;
  pe: number;
  fwdPE: number;
  peg: number;
  revGrowth: string;
  epsGrowth: string;
  opMargin: string;
  debtEq: number;
  moat: string;
  marketCap: string;
  reasons: string[];
  strengths: string[];
  weaknesses: string[];
  buyCount: number;
  sellCount: number;
}

interface TopMoversData {
  topGrowth: MoverStock[];
  topRisk: MoverStock[];
  totalAnalyzed: number;
  timestamp: string;
  cached?: boolean;
  stale?: boolean;
}

function ScoreBar({ score, type }: { score: number; type: 'growth' | 'risk' }) {
  const color = type === 'growth'
    ? score >= 70 ? 'bg-emerald-500' : score >= 50 ? 'bg-emerald-400' : 'bg-emerald-300'
    : score >= 70 ? 'bg-red-500' : score >= 50 ? 'bg-red-400' : 'bg-red-300';

  return (
    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${score}%` }} />
    </div>
  );
}

function MoatBadge({ moat }: { moat: string }) {
  if (moat === 'WIDE') return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[9px]">Moat I Gjere</Badge>;
  if (moat === 'NARROW') return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-[9px]">Moat I Ngushte</Badge>;
  return <Badge className="bg-red-500/10 text-red-500 border-red-500/30 text-[9px]">Asnje Moat</Badge>;
}

function RatingBadge({ rating }: { rating: string }) {
  if (rating === 'STRONG_BUY') return <Badge className="bg-emerald-600 text-white text-[9px] px-1.5">STRONG BUY</Badge>;
  if (rating === 'BUY') return <Badge className="bg-emerald-500 text-white text-[9px] px-1.5">BUY</Badge>;
  if (rating === 'HOLD') return <Badge className="bg-amber-500 text-white text-[9px] px-1.5">HOLD</Badge>;
  if (rating === 'SELL') return <Badge className="bg-red-500 text-white text-[9px] px-1.5">SELL</Badge>;
  return <Badge className="bg-gray-500 text-white text-[9px] px-1.5">{rating}</Badge>;
}

function GrowthCard({ stock, index }: { stock: MoverStock; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={`border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 hover:from-emerald-500/10 hover:to-teal-500/10 transition-all duration-300 overflow-hidden`}>
      <CardContent className="pt-3.5 pb-3 px-3.5">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500 text-[10px] font-bold">
              {index + 1}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold">{stock.ticker}</span>
                <RatingBadge rating={stock.rating} />
                <MoatBadge moat={stock.moat} />
              </div>
              <p className="text-[10px] text-muted-foreground">{stock.company} — {stock.sector}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold">${stock.currentPrice.toFixed(2)}</p>
            <div className={`flex items-center gap-0.5 text-[10px] font-medium ${stock.priceChange >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {stock.priceChange >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {stock.priceChange >= 0 ? '+' : ''}{stock.priceChange.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Score Bar */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[9px] text-muted-foreground">Potencial Rritjeje</span>
            <span className="text-[10px] font-bold text-emerald-500">{stock.score}/100</span>
          </div>
          <ScoreBar score={stock.score} type="growth" />
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-4 gap-1.5 mb-2">
          <div className="bg-muted/30 rounded p-1 text-center">
            <p className="text-[8px] text-muted-foreground">Upside</p>
            <p className="text-[11px] font-bold text-emerald-500">+{stock.upside}%</p>
          </div>
          <div className="bg-muted/30 rounded p-1 text-center">
            <p className="text-[8px] text-muted-foreground">Rev Gr</p>
            <p className="text-[11px] font-semibold">{stock.revGrowth}</p>
          </div>
          <div className="bg-muted/30 rounded p-1 text-center">
            <p className="text-[8px] text-muted-foreground">EPS Gr</p>
            <p className="text-[11px] font-semibold">{stock.epsGrowth}</p>
          </div>
          <div className="bg-muted/30 rounded p-1 text-center">
            <p className="text-[8px] text-muted-foreground">PEG</p>
            <p className="text-[11px] font-semibold">{stock.peg}</p>
          </div>
        </div>

        {/* Target */}
        <div className="flex items-center justify-between text-[10px] bg-emerald-500/5 rounded p-1.5 border border-emerald-500/10">
          <span className="text-muted-foreground">Objektivi analistëve</span>
          <span className="font-semibold text-emerald-500">{stock.targetPrice}</span>
          <span className="text-muted-foreground">{stock.lowTarget} — {stock.highTarget}</span>
        </div>

        {/* Reasons (expandable) */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between mt-2 text-[10px] text-emerald-500 hover:text-emerald-400 transition-colors"
        >
          <span className="flex items-center gap-1">
            <Zap className="w-3 h-3" />
            {expanded ? 'Fshi arsyet' : 'Shiko arsyet'}
          </span>
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {expanded && (
          <div className="mt-1.5 space-y-1">
            {stock.reasons.map((reason, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <ArrowUpRight className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                <p className="text-[10px] text-muted-foreground leading-relaxed">{reason}</p>
              </div>
            ))}
            {stock.strengths.slice(0, 2).map((s, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <Shield className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                <p className="text-[10px] text-emerald-500/70 leading-relaxed">{s}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RiskCard({ stock, index }: { stock: MoverStock; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border border-red-500/20 bg-gradient-to-br from-red-500/5 to-rose-500/5 hover:from-red-500/10 hover:to-rose-500/10 transition-all duration-300 overflow-hidden">
      <CardContent className="pt-3.5 pb-3 px-3.5">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 text-[10px] font-bold">
              {index + 1}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold">{stock.ticker}</span>
                <RatingBadge rating={stock.rating} />
                <MoatBadge moat={stock.moat} />
              </div>
              <p className="text-[10px] text-muted-foreground">{stock.company} — {stock.sector}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold">${stock.currentPrice.toFixed(2)}</p>
            <div className={`flex items-center gap-0.5 text-[10px] font-medium ${stock.priceChange >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {stock.priceChange >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {stock.priceChange >= 0 ? '+' : ''}{stock.priceChange.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Score Bar */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[9px] text-muted-foreground">Rreziku i Renies</span>
            <span className="text-[10px] font-bold text-red-500">{stock.score}/100</span>
          </div>
          <ScoreBar score={stock.score} type="risk" />
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-4 gap-1.5 mb-2">
          <div className="bg-muted/30 rounded p-1 text-center">
            <p className="text-[8px] text-muted-foreground">Upside</p>
            <p className={`text-[11px] font-bold ${stock.upside >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {stock.upside >= 0 ? '+' : ''}{stock.upside}%
            </p>
          </div>
          <div className="bg-muted/30 rounded p-1 text-center">
            <p className="text-[8px] text-muted-foreground">Rev Gr</p>
            <p className={`text-[11px] font-semibold ${parseFloat(stock.revGrowth) < 0 ? 'text-red-500' : ''}`}>
              {stock.revGrowth}
            </p>
          </div>
          <div className="bg-muted/30 rounded p-1 text-center">
            <p className="text-[8px] text-muted-foreground">EPS Gr</p>
            <p className={`text-[11px] font-semibold ${parseFloat(stock.epsGrowth) < 0 ? 'text-red-500' : ''}`}>
              {stock.epsGrowth}
            </p>
          </div>
          <div className="bg-muted/30 rounded p-1 text-center">
            <p className="text-[8px] text-muted-foreground">P/E</p>
            <p className="text-[11px] font-semibold">{stock.pe}x</p>
          </div>
        </div>

        {/* Target Range */}
        <div className="flex items-center justify-between text-[10px] bg-red-500/5 rounded p-1.5 border border-red-500/10">
          <span className="text-muted-foreground">Objektivi analistëve</span>
          <span className="font-semibold">{stock.targetPrice}</span>
          <span className="text-muted-foreground">{stock.lowTarget} — {stock.highTarget}</span>
        </div>

        {/* Reasons (expandable) */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between mt-2 text-[10px] text-red-500 hover:text-red-400 transition-colors"
        >
          <span className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {expanded ? 'Fshi arsyet' : 'Shiko arsyet'}
          </span>
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {expanded && (
          <div className="mt-1.5 space-y-1">
            {stock.reasons.map((reason, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <ArrowDownRight className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-[10px] text-muted-foreground leading-relaxed">{reason}</p>
              </div>
            ))}
            {stock.weaknesses.slice(0, 2).map((w, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <ShieldAlert className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-[10px] text-red-400/70 leading-relaxed">{w}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TopMovers() {
  const [data, setData] = useState<TopMoversData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/top-movers');
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
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-[160px] rounded-xl" />
            ))}
          </div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-[160px] rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-500/20 bg-red-500/5">
        <CardContent className="flex items-center gap-2 py-4">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-sm text-red-400">{error}</span>
          <button onClick={fetchData} className="ml-auto text-xs text-red-500 hover:underline">Provo perseri</button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4 text-emerald-500" />
            <span className="text-xs text-muted-foreground">
              {data.totalAnalyzed} stoke te analizuar
            </span>
          </div>
          {data.cached && (
            <Badge variant="secondary" className="text-[9px] bg-muted/50">
              Cache
            </Badge>
          )}
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-emerald-500 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Rifresko
        </button>
      </div>

      {/* Two columns: Growth + Risk */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top 5 Growth */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-6 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-full" />
            <h3 className="text-sm font-bold text-emerald-500 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4" />
              Top 5 — Potencial Rritjeje
            </h3>
          </div>
          <p className="text-[10px] text-muted-foreground -mt-1">
            Aksionet me shenjat me te forta per rritje: signal bullish, rritje te ardhurave, EPS, moat i gjere, momentum pozitiv
          </p>
          <div className="space-y-2.5">
            {data.topGrowth.map((stock, i) => (
              <GrowthCard key={stock.ticker} stock={stock} index={i} />
            ))}
          </div>
        </div>

        {/* Top 5 Risk */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-6 bg-gradient-to-b from-red-500 to-rose-500 rounded-full" />
            <h3 className="text-sm font-bold text-red-500 flex items-center gap-1.5">
              <TrendingDown className="w-4 h-4" />
              Top 5 — Rreziku i Renies
            </h3>
          </div>
          <p className="text-[10px] text-muted-foreground -mt-1">
            Aksionet me rrezikun me te larte per renie: signal bearish, te ardhura ne ulje, vleresim i larte, borxh te larte, momentum negativ
          </p>
          <div className="space-y-2.5">
            {data.topRisk.map((stock, i) => (
              <RiskCard key={stock.ticker} stock={stock} index={i} />
            ))}
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-amber-600/80 leading-relaxed">
            Kjo analizë bazohet në data fundamentale, sinjale teknike, dhe konsensusin e analistëve. 
            Multi-factor scoring përdor 10 faktorë për çdo kategori. Nuk përbën këshillë financiare. Çmimet përditësohen nga Yahoo Finance.
          </p>
        </div>
      </div>
    </div>
  );
}
