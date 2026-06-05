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
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Customized,
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
  DollarSign,
  AlertTriangle,
} from 'lucide-react';
import { StockSearch } from './stock-search';

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

interface PriceAnalysis {
  currentPrice: number;
  previousClose: number;
  priceChange: number;
  trend: string;
  trendStrength: string;
}

interface TechnicalAnalysisResult {
  ticker: string;
  company: string;
  sector?: string;
  overallSignal: string;
  confidence: number;
  priceAnalysis: PriceAnalysis;
  isDemo?: boolean;
  isRealChart?: boolean;
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

  const runAnalysisForTicker = async (tickerSymbol?: string) => {
    const sym = (tickerSymbol || ticker).trim().toUpperCase();
    if (!sym) return;
    setTicker(sym);
    setIsLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const res = await fetch('/api/technical-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: sym }),
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

  const runAnalysis = () => runAnalysisForTicker();

  const getSignalIcon = (signal: string) => {
    const s = signal.toLowerCase();
    if (s.includes('bullish') || s.includes('buy') || s === 'overbought')
      return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
    if (s.includes('bearish') || s.includes('sell') || s === 'oversold')
      return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
    return <Minus className="w-3.5 h-3.5 text-amber-400" />;
  };

  const getSignalColor = (signal: string) => {
    const s = signal.toLowerCase();
    if (s.includes('bullish') || s.includes('buy')) return 'text-emerald-400';
    if (s.includes('bearish') || s.includes('sell')) return 'text-red-400';
    return 'text-amber-400';
  };

  const getSignalBg = (signal: string) => {
    const s = signal.toLowerCase();
    if (s.includes('bullish') || s.includes('buy')) return 'bg-emerald-500';
    if (s.includes('bearish') || s.includes('sell')) return 'bg-red-500';
    return 'bg-amber-500';
  };

  const price = analysis?.priceAnalysis?.currentPrice;
  const priceChange = analysis?.priceAnalysis?.priceChange;

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="flex gap-2">
        <StockSearch
          onSelect={(t) => runAnalysisForTicker(t)}
          placeholder="Kërko ticker-in... AAPL, TSLA, NVDA"
          className="flex-1"
          inputClassName="h-10 text-sm"
        />
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
          <Skeleton className="h-[120px] rounded-xl" />
          <Skeleton className="h-[300px] rounded-xl" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Skeleton className="h-[180px] rounded-xl" />
            <Skeleton className="h-[180px] rounded-xl" />
            <Skeleton className="h-[180px] rounded-xl" />
          </div>
        </div>
      )}

      {/* Results */}
      {analysis && !isLoading && (
        <div className="space-y-4">
          {/* ═══ HEADER — Ticker, Price, Signal ═══ */}
          <Card className="border-border/50 bg-card/50">
            <CardContent className="pt-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-2xl font-bold">{analysis.ticker}</h3>
                    <Badge className={`${getSignalBg(analysis.overallSignal)} text-white font-semibold`}>
                      {analysis.overallSignal}
                    </Badge>
                    {analysis.isDemo && (
                      <Badge variant="outline" className="text-[9px] text-muted-foreground border-muted">
                        <AlertTriangle className="w-2.5 h-2.5 mr-0.5" /> Demo
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{analysis.company}</p>
                  {analysis.sector && (
                    <p className="text-[11px] text-muted-foreground">{analysis.sector}</p>
                  )}
                </div>

                {/* PRICE DISPLAY — Prominent */}
                <div className="flex items-center gap-5">
                  <div className="text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      <DollarSign className="w-4 h-4 text-muted-foreground" />
                      <p className="text-3xl font-bold tabular-nums">
                        {price ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                      </p>
                    </div>
                    {priceChange !== undefined && priceChange !== 0 && (
                      <p className={`text-sm font-medium tabular-nums ${priceChange >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {priceChange >= 0 ? '▲' : '▼'} {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Besueshmëria</p>
                    <p className="text-2xl font-bold">{analysis.confidence}<span className="text-sm text-muted-foreground">%</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Trendi</p>
                    <div className="flex items-center gap-1 justify-end">
                      {getSignalIcon(analysis.priceAnalysis?.trend || '')}
                      <span className="text-sm font-medium capitalize">{analysis.priceAnalysis?.trend}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground capitalize">
                      {analysis.priceAnalysis?.trendStrength}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ═══ CHART — Candlestick + Volume ═══ */}
          {analysis.candlestickData && analysis.candlestickData.length > 0 && (
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-500" />
                  Candlestick Chart (30 ditë) + Volumi
                  {analysis.isRealChart && (
                    <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400">Real Data</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={analysis.candlestickData} margin={{ top: 10, right: 60, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(v: string) => v.substring(5)} />
                      <YAxis yAxisId="price" domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="volume" orientation="right" tick={{ fontSize: 9 }} />
                      <Tooltip
                        contentStyle={{
                          background: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '11px',
                        }}
                        formatter={(value: number, name: string) => {
                          if (name === 'Volumi') return [`${(value / 1e6).toFixed(1)}M`, name];
                          return [`$${value.toFixed(2)}`, name];
                        }}
                        content={({ payload, label }) => {
                          if (!payload || payload.length === 0) return null;
                          const d = payload[0]?.payload;
                          if (!d) return null;
                          const isUp = d.close >= d.open;
                          return (
                            <div className="bg-card border border-border rounded-lg p-2.5 shadow-lg text-[11px]">
                              <p className="font-semibold mb-1">{label}</p>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                                <span className="text-muted-foreground">Hapurje:</span>
                                <span className="text-right font-mono">${d.open?.toFixed(2)}</span>
                                <span className="text-muted-foreground">Mbyllje:</span>
                                <span className={`text-right font-mono ${isUp ? 'text-emerald-500' : 'text-red-500'}`}>${d.close?.toFixed(2)}</span>
                                <span className="text-muted-foreground">High:</span>
                                <span className="text-right font-mono text-emerald-400">${d.high?.toFixed(2)}</span>
                                <span className="text-muted-foreground">Low:</span>
                                <span className="text-right font-mono text-red-400">${d.low?.toFixed(2)}</span>
                                <span className="text-muted-foreground">Volumi:</span>
                                <span className="text-right font-mono">{((d.volume || 0) / 1e6).toFixed(1)}M</span>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Customized component={(props: any) => {
                        const { formattedGraphicalItems, xAxisMap, yAxisMap, offset } = props;
                        if (!formattedGraphicalItems || !xAxisMap || !yAxisMap) return null;

                        const xAxis = Object.values(xAxisMap)[0] as any;
                        const priceAxis = Object.values(yAxisMap)[0] as any;
                        const volumeAxis = Object.values(yAxisMap)[1] as any;
                        if (!xAxis || !priceAxis || !volumeAxis) return null;

                        const data = analysis.candlestickData;
                        const bandwidth = Math.max(
                          (xAxis.bandSize || ((offset.width - 40) / data.length)) * 0.6,
                          2
                        );
                        const barWidth = Math.max(bandwidth * 0.65, 1.5);
                        const scaleX = xAxis.scale || xAxis.xScale;
                        if (!scaleX) return null;

                        const priceScale = priceAxis.scale;
                        const volumeScale = volumeAxis.scale;

                        return (
                          <g>
                            {data.map((d, i) => {
                              const x = scaleX(d.date) - bandwidth / 2;
                              const isUp = d.close >= d.open;

                              // Candlestick body
                              const bodyTop = priceScale(Math.max(d.open, d.close));
                              const bodyBottom = priceScale(Math.min(d.open, d.close));
                              const bodyHeight = Math.max(Math.abs(bodyBottom - bodyTop), 1);

                              // Wick (high to low)
                              const wickTop = priceScale(d.high);
                              const wickBottom = priceScale(d.low);

                              // Volume bar
                              const volHeight = Math.max((volumeScale(d.volume) || 0), 0);
                              const volBottom = volumeScale(0) || offset.top + offset.height;
                              const volColor = isUp ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)';

                              return (
                                <g key={`candle-${i}`}>
                                  {/* Volume bar at bottom */}
                                  <rect
                                    x={x}
                                    y={volBottom - volHeight}
                                    width={barWidth}
                                    height={volHeight}
                                    fill={volColor}
                                    rx={1}
                                  />
                                  {/* Wick */}
                                  <line
                                    x1={x + bandwidth / 2}
                                    y1={wickTop}
                                    x2={x + bandwidth / 2}
                                    y2={wickBottom}
                                    stroke={isUp ? '#10b981' : '#ef4444'}
                                    strokeWidth={1}
                                  />
                                  {/* Body */}
                                  <rect
                                    x={x + (bandwidth - barWidth) / 2}
                                    y={bodyTop}
                                    width={barWidth}
                                    height={bodyHeight}
                                    fill={isUp ? '#10b981' : '#ef4444'}
                                    stroke={isUp ? '#10b981' : '#ef4444'}
                                    strokeWidth={0.5}
                                    rx={1}
                                  />
                                </g>
                              );
                            })}
                          </g>
                        );
                      }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend explanation */}
                <div className="flex items-center justify-center gap-4 mt-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                    <span className="text-[10px] text-muted-foreground">Bullish (Çmimi u rrit)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-red-500" />
                    <span className="text-[10px] text-muted-foreground">Bearish (Çmimi u ul)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-muted/40" />
                    <span className="text-[10px] text-muted-foreground">Volumi</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ═══ INDICATORS — Detailed Cards ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">

            {/* RSI */}
            {analysis.indicators?.rsi && (
              <Card className="border-border/50 bg-card/50">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">RSI (14)</span>
                    <div className="flex items-center gap-1.5">
                      {getSignalIcon(analysis.indicators.rsi.signal)}
                      <span className={`text-sm font-bold ${getSignalColor(analysis.indicators.rsi.signal)}`}>
                        {analysis.indicators.rsi.value}
                      </span>
                    </div>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
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
                  {/* RSI zones */}
                  <div className="flex justify-between text-[8px] text-muted-foreground">
                    <span>Nënshitje (&lt;30)</span>
                    <span>Neutral</span>
                    <span>Mbipëshitje (&gt;70)</span>
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
                    <span className="text-xs font-bold">MACD</span>
                    <div className="flex items-center gap-1.5">
                      {getSignalIcon(analysis.indicators.macd.signal)}
                      <span className={`text-xs font-semibold uppercase ${getSignalColor(analysis.indicators.macd.signal)}`}>
                        {analysis.indicators.macd.signal}
                      </span>
                    </div>
                  </div>
                  <p className="text-2xl font-bold tabular-nums">{analysis.indicators.macd.value}</p>
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
                    <span className="text-xs font-bold">Moving Averages</span>
                    <div className="flex items-center gap-1.5">
                      {getSignalIcon(analysis.indicators.movingAverage.signal)}
                      <span className={`text-[10px] font-semibold uppercase ${getSignalColor(analysis.indicators.movingAverage.signal)}`}>
                        {analysis.indicators.movingAverage.signal}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between"><span className="text-muted-foreground">SMA 20</span><span className="font-mono font-medium">${analysis.indicators.movingAverage.sma20}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">SMA 50</span><span className="font-mono font-medium">${analysis.indicators.movingAverage.sma50}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">SMA 200</span><span className="font-mono font-medium">${analysis.indicators.movingAverage.sma200}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">EMA 12</span><span className="font-mono font-medium">${analysis.indicators.movingAverage.ema12}</span></div>
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
                    <span className="text-xs font-bold">Bollinger Bands</span>
                    <div className="flex items-center gap-1.5">
                      {getSignalIcon(analysis.indicators.bollingerBands.signal)}
                      <span className={`text-[10px] font-semibold uppercase ${getSignalColor(analysis.indicators.bollingerBands.signal)}`}>
                        {analysis.indicators.bollingerBands.signal}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between"><span className="text-red-400">Upper Band</span><span className="font-mono font-medium text-red-400">${analysis.indicators.bollingerBands.upper}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Middle (SMA 20)</span><span className="font-mono font-medium">${analysis.indicators.bollingerBands.middle}</span></div>
                    <div className="flex justify-between"><span className="text-emerald-400">Lower Band</span><span className="font-mono font-medium text-emerald-400">${analysis.indicators.bollingerBands.lower}</span></div>
                    {/* Price position indicator */}
                    {price && (
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">Çmimi aktual</span>
                        <span className="font-mono font-bold">${price.toFixed(2)}</span>
                      </div>
                    )}
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
                    <span className="text-xs font-bold">Volumi</span>
                    <div className="flex items-center gap-1.5">
                      {getSignalIcon(analysis.indicators.volume.signal)}
                      <span className={`text-[10px] font-semibold uppercase ${getSignalColor(analysis.indicators.volume.signal)}`}>
                        {analysis.indicators.volume.signal}
                      </span>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-[10px] capitalize">
                    {analysis.indicators.volume.trend}
                  </Badge>
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
                    <span className="text-xs font-bold">Stochastic</span>
                    <div className="flex items-center gap-1.5">
                      {getSignalIcon(analysis.indicators.stochastic.signal)}
                      <span className={`text-[10px] font-semibold uppercase ${getSignalColor(analysis.indicators.stochastic.signal)}`}>
                        {analysis.indicators.stochastic.signal}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span>%K: <b className="font-mono">{analysis.indicators.stochastic.k}</b></span>
                    <span>%D: <b className="font-mono">{analysis.indicators.stochastic.d}</b></span>
                  </div>
                  {/* Stochastic visual bar */}
                  <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                    <div className="absolute left-[20%] w-[60%] h-full bg-emerald-500/20 rounded-full" />
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        analysis.indicators.stochastic.k > 80 ? 'bg-red-500' : analysis.indicators.stochastic.k < 20 ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.min(Math.max(analysis.indicators.stochastic.k, 0), 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {analysis.indicators.stochastic.interpretation}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ═══ SUPPORT/RESISTANCE + PATTERNS ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {analysis.supportResistance && (
              <Card className="border-border/50 bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <ArrowDown className="w-3.5 h-3.5 text-emerald-500" />
                    Suporti & Rezistenca
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs text-emerald-500 font-medium mb-1.5">Suporte (nivele blerjeje)</p>
                    <div className="flex flex-wrap gap-1">
                      {analysis.supportResistance.supports.map((s, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-500 font-mono px-2 py-0.5">
                          ${s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-red-500 font-medium mb-1.5">Rezistencë (nivele shitjeje)</p>
                    <div className="flex flex-wrap gap-1">
                      {analysis.supportResistance.resistances.map((r, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] border-red-500/30 text-red-500 font-mono px-2 py-0.5">
                          ${r}
                        </Badge>
                      ))}
                    </div>
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
                      <div key={i} className={`p-2.5 rounded-lg ${
                        p.type === 'bullish' ? 'bg-emerald-500/5 border border-emerald-500/20'
                        : p.type === 'bearish' ? 'bg-red-500/5 border border-red-500/20'
                        : 'bg-muted/30 border border-muted/30'
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold">{p.name}</span>
                          <Badge
                            variant="outline"
                            className={`text-[9px] ${
                              p.type === 'bullish'
                                ? 'border-emerald-500/30 text-emerald-500'
                                : p.type === 'bearish'
                                  ? 'border-red-500/30 text-red-500'
                                  : 'border-amber-500/30 text-amber-500'
                            }`}
                          >
                            {p.type}
                          </Badge>
                          <Badge variant="outline" className="text-[9px]">
                            {p.reliability}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{p.description}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ═══ SUMMARY & ACTION PLAN — ALWAYS visible, NEVER empty ═══ */}
          {(analysis.summary || analysis.actionPlan) && (
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="pt-5 space-y-4">
              <div>
                <h4 className="text-sm font-bold text-emerald-500 mb-2 flex items-center gap-1.5">
                  <Activity className="w-4 h-4" /> Përmbledhje
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{analysis.summary || 'Analiza teknike është e disponueshme në indikatorët më sipër.'}</p>
              </div>
              <div>
                <h4 className="text-sm font-bold text-emerald-500 mb-2 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4" /> Plan i Veprimit
                </h4>
                <div className="bg-card/80 rounded-lg p-3 border border-emerald-500/20">
                  <p className="text-sm text-foreground leading-relaxed font-medium">{analysis.actionPlan || 'Monitoroni indikatorët dhe prisni sinjal të qartë.'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          )}
        </div>
      )}
    </div>
  );
}
