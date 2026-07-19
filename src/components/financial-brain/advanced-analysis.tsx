'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Target,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Activity,
  Brain,
  Grid3X3,
  Play,
  Loader2,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────

interface ConfidenceResult {
  symbol: string;
  score: number;
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
  indicators: {
    RSI: { value: number; signal: string; score: number };
    MACD: { value: number; signal: string; score: number };
    Bollinger: { position: string; signal: string; score: number };
    Volume: { ratio: number; signal: string; score: number };
  };
}

interface BacktestResult {
  symbol: string;
  strategy: string;
  totalTrades: number;
  winRate: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  finalEquity: number;
  trades: Array<{
    type: string;
    date: string;
    price: number;
    shares: number;
    pnl?: number;
    pnlPercent?: number;
  }>;
}

interface SentimentResult {
  symbol: string;
  sentiment: string;
  score: number;
  summary: string;
  timestamp: string;
}

interface CorrelationResult {
  symbols: string[];
  correlationMatrix: Record<string, Record<string, number>>;
}

// ─── Helpers ──────────────────────────────────────────────────

function signalColor(signal: string): string {
  if (signal === 'BUY' || signal === 'POSITIVE') return 'text-emerald-500';
  if (signal === 'SELL' || signal === 'NEGATIVE') return 'text-red-500';
  return 'text-yellow-500';
}

function signalBg(signal: string): string {
  if (signal === 'BUY' || signal === 'POSITIVE') return 'border-emerald-500/30 bg-emerald-500/5';
  if (signal === 'SELL' || signal === 'NEGATIVE') return 'border-red-500/30 bg-red-500/5';
  return 'border-yellow-500/30 bg-yellow-500/5';
}

function signalBadgeVariant(signal: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (signal === 'BUY' || signal === 'POSITIVE') return 'default';
  if (signal === 'SELL' || signal === 'NEGATIVE') return 'destructive';
  return 'secondary';
}

function correlationColor(val: number): string {
  if (val > 0.7) return 'bg-emerald-700 text-white';
  if (val > 0.3) return 'bg-emerald-400/60 text-white';
  if (val > -0.3) return 'bg-muted text-foreground';
  if (val > -0.7) return 'bg-red-400/60 text-white';
  return 'bg-red-700 text-white';
}

function scoreColor(score: number): string {
  if (score > 65) return 'text-emerald-500';
  if (score < 35) return 'text-red-500';
  return 'text-yellow-500';
}

function scoreRingColor(score: number): string {
  if (score > 65) return 'stroke-emerald-500';
  if (score < 35) return 'stroke-red-500';
  return 'stroke-yellow-500';
}

// ─── Circular Score Component ────────────────────────────────

function CircularScore({ score, signal }: { score: number; signal: string }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-32 h-32">
        <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} fill="none" className="stroke-muted/30" strokeWidth="8" />
          <motion.circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            className={scoreRingColor(score)}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold ${scoreColor(score)}`}>
            {score}
          </span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
      </div>
      <Badge variant={signalBadgeVariant(signal)} className="text-sm px-3 py-1">
        {signal === 'BUY' ? 'BLERJE' : signal === 'SELL' ? 'SHITJE' : 'NEUTRAL'}
      </Badge>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

export function AdvancedAnalysis() {
  // State: Confidence Score
  const [csTicker, setCsTicker] = useState('');
  const [csLoading, setCscLoading] = useState(false);
  const [csResult, setCsResult] = useState<ConfidenceResult | null>(null);
  const [csError, setCsError] = useState('');

  // State: Backtest
  const [btTicker, setBtTicker] = useState('');
  const [btStrategy, setBtStrategy] = useState('rsi_macd');
  const [btRange, setBtRange] = useState('1y');
  const [btStopLoss, setBtStopLoss] = useState('5');
  const [btTakeProfit, setBtTakeProfit] = useState('10');
  const [btLoading, setBtLoading] = useState(false);
  const [btResult, setBtResult] = useState<BacktestResult | null>(null);
  const [btError, setBtError] = useState('');

  // State: Sentiment
  const [saTicker, setSaTicker] = useState('');
  const [saLoading, setSaLoading] = useState(false);
  const [saResult, setSaResult] = useState<SentimentResult | null>(null);
  const [saError, setSaError] = useState('');

  // State: Correlation
  const [corrSymbols, setCorrSymbols] = useState('AAPL,MSFT,GOOGL,AMZN,NVDA,META,TSLA');
  const [corrLoading, setCorrLoading] = useState(false);
  const [corrResult, setCorrResult] = useState<CorrelationResult | null>(null);
  const [corrError, setCorrError] = useState('');

  // Handlers
  const handleConfidenceScore = useCallback(async () => {
    if (!csTicker.trim()) return;
    setCscLoading(true);
    setCsError('');
    setCsResult(null);
    try {
      const res = await fetch(`/api/confidence-score/${csTicker.trim().toUpperCase()}?range=6mo`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gabim');
      setCsResult(data);
    } catch (err: unknown) {
      setCsError(err instanceof Error ? err.message : 'Gabim');
    } finally {
      setCscLoading(false);
    }
  }, [csTicker]);

  const handleBacktest = useCallback(async () => {
    if (!btTicker.trim()) return;
    setBtLoading(true);
    setBtError('');
    setBtResult(null);
    try {
      const params = new URLSearchParams({
        strategy: btStrategy,
        range: btRange,
        stopLoss: (parseFloat(btStopLoss) / 100).toFixed(2),
        takeProfit: (parseFloat(btTakeProfit) / 100).toFixed(2),
      });
      const res = await fetch(`/api/backtest/${btTicker.trim().toUpperCase()}?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gabim');
      setBtResult(data);
    } catch (err: unknown) {
      setBtError(err instanceof Error ? err.message : 'Gabim');
    } finally {
      setBtLoading(false);
    }
  }, [btTicker, btStrategy, btRange, btStopLoss, btTakeProfit]);

  const handleSentiment = useCallback(async () => {
    if (!saTicker.trim()) return;
    setSaLoading(true);
    setSaError('');
    setSaResult(null);
    try {
      const res = await fetch(`/api/sentiment-analysis/${saTicker.trim().toUpperCase()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gabim');
      setSaResult(data);
    } catch (err: unknown) {
      setSaError(err instanceof Error ? err.message : 'Gabim');
    } finally {
      setSaLoading(false);
    }
  }, [saTicker]);

  const handleCorrelation = useCallback(async () => {
    setCorrLoading(true);
    setCorrError('');
    setCorrResult(null);
    try {
      const params = new URLSearchParams({ symbols: corrSymbols });
      const res = await fetch(`/api/correlation?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gabim');
      setCorrResult(data);
    } catch (err: unknown) {
      setCorrError(err instanceof Error ? err.message : 'Gabim');
    } finally {
      setCorrLoading(false);
    }
  }, [corrSymbols]);

  return (
    <div className="space-y-6">
      {/* ═══════ SECTION 1: CONFIDENCE SCORE ═══════ */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-violet-500" />
              <h4 className="text-sm font-semibold">Confidence Score</h4>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Shkruaj ticker (p.sh. AAPL)"
                value={csTicker}
                onChange={(e) => setCsTicker(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleConfidenceScore()}
                className="max-w-xs"
              />
              <Button
                onClick={handleConfidenceScore}
                disabled={csLoading || !csTicker.trim()}
                size="sm"
              >
                {csLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Play className="w-4 h-4 mr-1.5" />}
                Llogarit Score
              </Button>
            </div>

            {csError && (
              <p className="text-sm text-red-500">{csError}</p>
            )}

            {csResult && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-4"
              >
                <div className="flex justify-center py-4">
                  <CircularScore score={csResult.score} signal={csResult.signal} />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {/* RSI Card */}
                  <Card className={`border ${signalBg(csResult.indicators.RSI.signal)}`}>
                    <CardContent className="p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">RSI</p>
                      <p className={`text-lg font-bold ${signalColor(csResult.indicators.RSI.signal)}`}>
                        {csResult.indicators.RSI.value.toFixed(1)}
                      </p>
                      <Badge variant={signalBadgeVariant(csResult.indicators.RSI.signal)} className="text-[10px] mt-1">
                        {csResult.indicators.RSI.signal === 'BUY' ? 'BLERJE' : csResult.indicators.RSI.signal === 'SELL' ? 'SHITJE' : 'NEUTRAL'}
                      </Badge>
                    </CardContent>
                  </Card>

                  {/* MACD Card */}
                  <Card className={`border ${signalBg(csResult.indicators.MACD.signal)}`}>
                    <CardContent className="p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">MACD</p>
                      <p className={`text-lg font-bold ${signalColor(csResult.indicators.MACD.signal)}`}>
                        {csResult.indicators.MACD.value.toFixed(4)}
                      </p>
                      <Badge variant={signalBadgeVariant(csResult.indicators.MACD.signal)} className="text-[10px] mt-1">
                        {csResult.indicators.MACD.signal === 'BUY' ? 'BLERJE' : csResult.indicators.MACD.signal === 'SELL' ? 'SHITJE' : 'NEUTRAL'}
                      </Badge>
                    </CardContent>
                  </Card>

                  {/* Bollinger Card */}
                  <Card className={`border ${signalBg(csResult.indicators.Bollinger.signal)}`}>
                    <CardContent className="p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Bollinger</p>
                      <p className={`text-lg font-bold ${signalColor(csResult.indicators.Bollinger.signal)}`}>
                        {csResult.indicators.Bollinger.position}
                      </p>
                      <Badge variant={signalBadgeVariant(csResult.indicators.Bollinger.signal)} className="text-[10px] mt-1">
                        {csResult.indicators.Bollinger.signal === 'BUY' ? 'BLERJE' : csResult.indicators.Bollinger.signal === 'SELL' ? 'SHITJE' : 'NEUTRAL'}
                      </Badge>
                    </CardContent>
                  </Card>

                  {/* Volume Card */}
                  <Card className={`border ${signalBg(csResult.indicators.Volume.signal)}`}>
                    <CardContent className="p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Volumi</p>
                      <p className={`text-lg font-bold ${signalColor(csResult.indicators.Volume.signal)}`}>
                        {csResult.indicators.Volume.ratio.toFixed(2)}x
                      </p>
                      <Badge variant={signalBadgeVariant(csResult.indicators.Volume.signal)} className="text-[10px] mt-1">
                        {csResult.indicators.Volume.signal === 'BUY' ? 'BLERJE' : csResult.indicators.Volume.signal === 'SELL' ? 'SHITJE' : 'NEUTRAL'}
                      </Badge>
                    </CardContent>
                  </Card>
                </div>
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.section>

      {/* ═══════ SECTION 2: BACKTESTING ═══════ */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-violet-500" />
              <h4 className="text-sm font-semibold">Backtesting</h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              <Input
                placeholder="Ticker (p.sh. AAPL)"
                value={btTicker}
                onChange={(e) => setBtTicker(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleBacktest()}
              />
              <Select value={btStrategy} onValueChange={setBtStrategy}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rsi_macd">RSI + MACD</SelectItem>
                  <SelectItem value="bollinger">Bollinger</SelectItem>
                  <SelectItem value="moving_average">Moving Average</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Stop Loss %"
                type="number"
                value={btStopLoss}
                onChange={(e) => setBtStopLoss(e.target.value)}
                className="w-full"
              />
              <Input
                placeholder="Take Profit %"
                type="number"
                value={btTakeProfit}
                onChange={(e) => setBtTakeProfit(e.target.value)}
                className="w-full"
              />
              <Select value={btRange} onValueChange={setBtRange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6mo">6 muaj</SelectItem>
                  <SelectItem value="1y">1 vit</SelectItem>
                  <SelectItem value="2y">2 vjet</SelectItem>
                  <SelectItem value="5y">5 vjet</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleBacktest}
              disabled={btLoading || !btTicker.trim()}
              size="sm"
            >
              {btLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Play className="w-4 h-4 mr-1.5" />}
              Nis Backtest
            </Button>

            {btError && (
              <p className="text-sm text-red-500">{btError}</p>
            )}

            {btResult && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-4"
              >
                {/* Metrics cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { label: 'Win Rate', value: `${btResult.winRate.toFixed(1)}%`, positive: btResult.winRate > 50 },
                    { label: 'Total Return', value: `${btResult.totalReturn >= 0 ? '+' : ''}${btResult.totalReturn.toFixed(2)}%`, positive: btResult.totalReturn >= 0 },
                    { label: 'Max Drawdown', value: `${btResult.maxDrawdown.toFixed(2)}%`, positive: btResult.maxDrawdown < 10 },
                    { label: 'Sharpe Ratio', value: btResult.sharpeRatio.toFixed(2), positive: btResult.sharpeRatio > 1 },
                    { label: 'Profit Factor', value: btResult.profitFactor.toFixed(2), positive: btResult.profitFactor > 1 },
                    { label: 'Final Equity', value: `$${btResult.finalEquity.toLocaleString()}`, positive: btResult.finalEquity > 10000 },
                  ].map((metric) => (
                    <Card key={metric.label} className={`border ${metric.positive ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                      <CardContent className="p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">{metric.label}</p>
                        <p className={`text-sm font-bold ${metric.positive ? 'text-emerald-500' : 'text-red-500'}`}>
                          {metric.value}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Trades table */}
                {btResult.trades.length > 0 && (
                  <div className="max-h-96 overflow-y-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Tipi</TableHead>
                          <TableHead className="text-xs">Data</TableHead>
                          <TableHead className="text-xs text-right">Çmimi</TableHead>
                          <TableHead className="text-xs text-right">Aksione</TableHead>
                          <TableHead className="text-xs text-right">PnL</TableHead>
                          <TableHead className="text-xs text-right">PnL %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {btResult.trades.slice(-15).reverse().map((trade, idx) => (
                          <TableRow key={idx}>
                            <TableCell>
                              <Badge
                                variant={trade.type === 'BUY' ? 'default' : 'destructive'}
                                className="text-[10px]"
                              >
                                {trade.type === 'BUY' ? 'BLERJE' : 'SHITJE'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">{trade.date}</TableCell>
                            <TableCell className="text-xs text-right">${trade.price.toFixed(2)}</TableCell>
                            <TableCell className="text-xs text-right">{trade.shares}</TableCell>
                            <TableCell className={`text-xs text-right ${trade.pnl !== undefined ? (trade.pnl >= 0 ? 'text-emerald-500' : 'text-red-500') : ''}`}>
                              {trade.pnl !== undefined ? `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}` : '—'}
                            </TableCell>
                            <TableCell className={`text-xs text-right ${trade.pnlPercent !== undefined ? (trade.pnlPercent >= 0 ? 'text-emerald-500' : 'text-red-500') : ''}`}>
                              {trade.pnlPercent !== undefined ? `${trade.pnlPercent >= 0 ? '+' : ''}${trade.pnlPercent.toFixed(2)}%` : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.section>

      {/* ═══════ SECTION 3: SENTIMENT ANALYSIS ═══════ */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-violet-500" />
              <h4 className="text-sm font-semibold">Analizë e Sentimentit me AI</h4>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Shkruaj ticker (p.sh. AAPL)"
                value={saTicker}
                onChange={(e) => setSaTicker(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleSentiment()}
                className="max-w-xs"
              />
              <Button
                onClick={handleSentiment}
                disabled={saLoading || !saTicker.trim()}
                size="sm"
              >
                {saLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Activity className="w-4 h-4 mr-1.5" />}
                Analizo Sentimentin
              </Button>
            </div>

            {saError && (
              <p className="text-sm text-red-500">{saError}</p>
            )}

            {saResult && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col sm:flex-row items-start sm:items-center gap-4"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant={
                      saResult.sentiment === 'POSITIVE' ? 'default' :
                      saResult.sentiment === 'NEGATIVE' ? 'destructive' : 'secondary'
                    }
                    className="text-sm px-4 py-1.5 gap-1.5"
                  >
                    {saResult.sentiment === 'POSITIVE' && <TrendingUp className="w-3.5 h-3.5" />}
                    {saResult.sentiment === 'NEGATIVE' && <TrendingDown className="w-3.5 h-3.5" />}
                    {saResult.sentiment === 'POSITIVE' ? 'BULLISH' : saResult.sentiment === 'NEGATIVE' ? 'BEARISH' : 'NEUTRAL'}
                  </Badge>
                  <span className={`text-2xl font-bold ${scoreColor(saResult.score)}`}>
                    {saResult.score}/100
                  </span>
                </div>
                <p className="text-sm text-muted-foreground flex-1">
                  {saResult.summary}
                </p>
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.section>

      {/* ═══════ SECTION 4: CORRELATION MATRIX ═══════ */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
      >
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="flex items-center gap-2">
              <Grid3X3 className="w-4 h-4 text-violet-500" />
              <h4 className="text-sm font-semibold">Matrica e Korrelacionit</h4>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Simbolet (koma ndarëse)"
                value={corrSymbols}
                onChange={(e) => setCorrSymbols(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleCorrelation()}
                className="flex-1"
              />
              <Button
                onClick={handleCorrelation}
                disabled={corrLoading}
                size="sm"
              >
                {corrLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Play className="w-4 h-4 mr-1.5" />}
                Llogarit Korrelacionin
              </Button>
            </div>

            {corrError && (
              <p className="text-sm text-red-500">{corrError}</p>
            )}

            {corrResult && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="overflow-x-auto"
              >
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="p-1.5 text-[10px] font-semibold text-muted-foreground border border-border/50"></th>
                      {corrResult.symbols.map((s) => (
                        <th key={s} className="p-1.5 text-[10px] font-semibold text-muted-foreground border border-border/50 text-center">
                          {s}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {corrResult.symbols.map((s1) => (
                      <tr key={s1}>
                        <td className="p-1.5 text-[10px] font-semibold text-muted-foreground border border-border/50">
                          {s1}
                        </td>
                        {corrResult.symbols.map((s2) => {
                          const val = corrResult.correlationMatrix[s1]?.[s2] ?? 0;
                          return (
                            <td
                              key={s2}
                              className={`p-1.5 text-xs font-mono text-center border border-border/50 ${correlationColor(val)} ${s1 === s2 ? 'font-bold' : ''}`}
                            >
                              {val.toFixed(2)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-emerald-700" />
                    <span>{'>'} 0.7</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-emerald-400/60" />
                    <span>{'>'} 0.3</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-muted" />
                    <span>~ 0</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-red-400/60" />
                    <span>&lt; -0.3</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-red-700" />
                    <span>&lt; -0.7</span>
                  </div>
                </div>
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.section>
    </div>
  );
}