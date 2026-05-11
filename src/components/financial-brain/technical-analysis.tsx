'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Area,
  AreaChart,
} from 'recharts';
import {
  BarChart3,
  Activity,
  Search,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

interface CandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Indicator {
  value: number;
  signal: string;
  interpretation: string;
}

interface TechnicalAnalysisResult {
  ticker: string;
  company: string;
  overallSignal: string;
  confidence: number;
  priceAnalysis: {
    currentPrice: number;
    trend: string;
    trendStrength: string;
  };
  indicators: {
    rsi: Indicator;
    macd: Indicator;
    movingAverage: {
      sma20: string;
      sma50: string;
      sma200: string;
      ema12: string;
      signal: string;
      interpretation: string;
    };
    bollingerBands: {
      upper: string;
      middle: string;
      lower: string;
      signal: string;
      interpretation: string;
    };
    volume: Indicator;
    stochastic: { k: number; d: number; signal: string; interpretation: string };
  };
  supportResistance: {
    supports: string[];
    resistances: string[];
  };
  patterns: Array<{ name: string; type: string; reliability: string; description: string }>;
  candlestickData: CandleData[];
  summary: string;
  actionPlan: string;
}

export function TechnicalAnalysis() {
  const [ticker, setTicker] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<TechnicalAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = async () => {
    if (!ticker.trim()) return;
    setIsLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const res = await fetch('/api/technical-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: ticker.trim().toUpperCase() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Analiza dështoi');
        return;
      }
      setAnalysis(data.analysis);
    } catch {
      setError('Gabim rrjeti. Provo përsëri.');
    } finally {
      setIsLoading(false);
    }
  };

  const getSignalIcon = (signal: string) => {
    const s = signal.toLowerCase();
    if (s.includes('bullish') || s.includes('buy'))
      return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
    if (s.includes('bearish') || s.includes('sell'))
      return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
    return <Minus className="w-3.5 h-3.5 text-amber-400" />;
  };

  const getSignalColor = (signal: string) => {
    const s = signal.toLowerCase();
    if (s.includes('bullish') || s.includes('buy')) return 'text-emerald-400';
    if (s.includes('bearish') || s.includes('sell')) return 'text-red-400';
    return 'text-amber-400';
  };

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Shkruaj ticker-in... p.sh. AAPL, TSLA, NVDA"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && runAnalysis()}
            className="pl-9 h-10 text-sm"
          />
        </div>
        <Button
          onClick={runAnalysis}
          disabled={isLoading || !ticker.trim()}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4 mr-1.5" />}
          Analizo
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-[100px] rounded-xl" />
          <Skeleton className="h-[300px] rounded-xl" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Skeleton className="h-[120px] rounded-xl" />
            <Skeleton className="h-[120px] rounded-xl" />
            <Skeleton className="h-[120px] rounded-xl" />
          </div>
        </div>
      )}

      {/* Results */}
      {analysis && !isLoading && (
        <div className="space-y-4">
          {/* Header */}
          <Card className="border-border/50 bg-card/50">
            <CardContent className="pt-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-2xl font-bold">{analysis.ticker}</h3>
                    <Badge
                      className={
                        analysis.overallSignal === 'BULLISH'
                          ? 'bg-emerald-500 text-white'
                          : analysis.overallSignal === 'BEARISH'
                            ? 'bg-red-500 text-white'
                            : 'bg-amber-500 text-white'
                      }
                    >
                      {analysis.overallSignal}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{analysis.company}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Besueshmëria</p>
                    <p className="text-2xl font-bold">{analysis.confidence}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Trendi</p>
                    <div className="flex items-center gap-1">
                      {getSignalIcon(analysis.priceAnalysis.trend)}
                      <span className="text-sm font-medium capitalize">{analysis.priceAnalysis.trend}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground capitalize">
                      {analysis.priceAnalysis.trendStrength}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Candlestick + Volume Chart */}
          {analysis.candlestickData && analysis.candlestickData.length > 0 && (
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-500" />
                  Grafiku i Çmimeve dhe Volumit
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={analysis.candlestickData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="price" domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="volume" orientation="right" tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{
                          background: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '11px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Area yAxisId="price" type="monotone" dataKey="close" fill="url(#priceGradient)" stroke="#10b981" strokeWidth={2} name="Mbyllja" />
                      <Line yAxisId="price" type="monotone" dataKey="high" stroke="#10b981" strokeWidth={1} strokeDasharray="3 3" dot={false} name="Maksimumi" />
                      <Line yAxisId="price" type="monotone" dataKey="low" stroke="#ef4444" strokeWidth={1} strokeDasharray="3 3" dot={false} name="Minimumi" />
                      <Bar yAxisId="volume" dataKey="volume" fill="hsl(var(--muted))" opacity={0.5} name="Volumi" />
                      <defs>
                        <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Indicators Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* RSI */}
            {analysis.indicators?.rsi && (
              <Card className="border-border/50 bg-card/50">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">RSI (14)</span>
                    <div className="flex items-center gap-1">
                      {getSignalIcon(analysis.indicators.rsi.signal)}
                      <span className={`text-xs font-medium ${getSignalColor(analysis.indicators.rsi.signal)}`}>
                        {analysis.indicators.rsi.value}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        analysis.indicators.rsi.value > 70
                          ? 'bg-red-500'
                          : analysis.indicators.rsi.value < 30
                            ? 'bg-emerald-500'
                            : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.min(analysis.indicators.rsi.value, 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {analysis.indicators.rsi.interpretation}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* MACD */}
            {analysis.indicators?.macd && (
              <Card className="border-border/50 bg-card/50">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">MACD</span>
                    <div className="flex items-center gap-1">
                      {getSignalIcon(analysis.indicators.macd.signal)}
                      <span className={`text-xs font-medium ${getSignalColor(analysis.indicators.macd.signal)}`}>
                        {analysis.indicators.macd.signal}
                      </span>
                    </div>
                  </div>
                  <p className="text-lg font-bold">{analysis.indicators.macd.value}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {analysis.indicators.macd.interpretation}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Moving Averages */}
            {analysis.indicators?.movingAverage && (
              <Card className="border-border/50 bg-card/50">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Moving Averages</span>
                    <div className="flex items-center gap-1">
                      {getSignalIcon(analysis.indicators.movingAverage.signal)}
                      <span className={`text-[10px] font-medium ${getSignalColor(analysis.indicators.movingAverage.signal)}`}>
                        {analysis.indicators.movingAverage.signal}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SMA 20</span>
                      <span className="font-medium">{analysis.indicators.movingAverage.sma20}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SMA 50</span>
                      <span className="font-medium">{analysis.indicators.movingAverage.sma50}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SMA 200</span>
                      <span className="font-medium">{analysis.indicators.movingAverage.sma200}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">EMA 12</span>
                      <span className="font-medium">{analysis.indicators.movingAverage.ema12}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {analysis.indicators.movingAverage.interpretation}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Bollinger Bands */}
            {analysis.indicators?.bollingerBands && (
              <Card className="border-border/50 bg-card/50">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Bollinger Bands</span>
                    <div className="flex items-center gap-1">
                      {getSignalIcon(analysis.indicators.bollingerBands.signal)}
                      <span className={`text-[10px] font-medium ${getSignalColor(analysis.indicators.bollingerBands.signal)}`}>
                        {analysis.indicators.bollingerBands.signal}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Upper</span>
                      <span className="font-medium text-red-400">{analysis.indicators.bollingerBands.upper}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Middle</span>
                      <span className="font-medium">{analysis.indicators.bollingerBands.middle}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Lower</span>
                      <span className="font-medium text-emerald-400">{analysis.indicators.bollingerBands.lower}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {analysis.indicators.bollingerBands.interpretation}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Volume */}
            {analysis.indicators?.volume && (
              <Card className="border-border/50 bg-card/50">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Volumi</span>
                    <div className="flex items-center gap-1">
                      {getSignalIcon(analysis.indicators.volume.signal)}
                      <span className={`text-[10px] font-medium ${getSignalColor(analysis.indicators.volume.signal)}`}>
                        {analysis.indicators.volume.signal}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {analysis.indicators.volume.interpretation}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Stochastic */}
            {analysis.indicators?.stochastic && (
              <Card className="border-border/50 bg-card/50">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Stochastic</span>
                    <div className="flex items-center gap-1">
                      {getSignalIcon(analysis.indicators.stochastic.signal)}
                      <span className={`text-[10px] font-medium ${getSignalColor(analysis.indicators.stochastic.signal)}`}>
                        {analysis.indicators.stochastic.signal}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-3 text-sm">
                    <span>%K: <b>{analysis.indicators.stochastic.k}</b></span>
                    <span>%D: <b>{analysis.indicators.stochastic.d}</b></span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {analysis.indicators.stochastic.interpretation}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Support & Resistance + Patterns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {analysis.supportResistance && (
              <Card className="border-border/50 bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Suporti & Rezistenca</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs text-emerald-500 font-medium mb-1 flex items-center gap-1">
                      <ArrowDown className="w-3 h-3" /> Suporte
                    </p>
                    {analysis.supportResistance.supports.map((s, i) => (
                      <Badge key={i} variant="outline" className="mr-1 mb-1 text-[10px] border-emerald-500/30 text-emerald-500">
                        ${s}
                      </Badge>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs text-red-500 font-medium mb-1 flex items-center gap-1">
                      <ArrowUp className="w-3 h-3" /> Rezistencë
                    </p>
                    {analysis.supportResistance.resistances.map((r, i) => (
                      <Badge key={i} variant="outline" className="mr-1 mb-1 text-[10px] border-red-500/30 text-red-500">
                        ${r}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {analysis.patterns && analysis.patterns.length > 0 && (
              <Card className="border-border/50 bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Modelet Grafike</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analysis.patterns.map((p, i) => (
                      <div key={i} className="p-2 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold">{p.name}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              p.type === 'bullish'
                                ? 'border-emerald-500/30 text-emerald-500'
                                : 'border-red-500/30 text-red-500'
                            }`}
                          >
                            {p.type}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {p.reliability}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{p.description}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Summary & Action Plan */}
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="pt-5 space-y-3">
              <div>
                <h4 className="text-sm font-semibold text-emerald-500 mb-1">Përmbledhje</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{analysis.summary}</p>
              </div>
              {analysis.actionPlan && (
                <div>
                  <h4 className="text-sm font-semibold text-emerald-500 mb-1">Plan i Veprimit</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{analysis.actionPlan}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
