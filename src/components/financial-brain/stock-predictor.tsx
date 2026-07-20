'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Brain, Play, Loader2, TrendingUp, TrendingDown, Minus,
  Shield, AlertTriangle, Zap, BarChart3, ArrowUp, ArrowDown,
  Target, Clock, Search, RefreshCw, ChevronDown, ChevronUp,
  Sparkles, GraduationCap, BookOpen, CheckCircle2, XCircle, Activity,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────

interface KeyFactor {
  name: string;
  signal: string;
  impact: string;
  score: number;
  description: string;
}

interface TermPrediction {
  prediction: string;
  probability: number;
  expectedMove: number;
}

interface PredictionResult {
  symbol: string;
  score: number;
  direction: string;
  confidence: number;
  shortTerm: TermPrediction;
  mediumTerm: TermPrediction;
  riskLevel: string;
  volatility: string;
  keyFactors: KeyFactor[];
  indicatorScores: Record<string, number>;
  timestamp: string;
}

interface ScanResult {
  scannedAt: string;
  total: number;
  successful: number;
  failed: number;
  errors: string[];
  topPicks: PredictionResult[];
  topShorts: PredictionResult[];
  mostConfident: PredictionResult[];
  allResults: PredictionResult[];
}

// ─── Hybrid Types ───────────────────────────────────────

interface FundamentalFactor {
  score: number;
  name: string;
  description: string;
}

interface FundamentalScore {
  score: number;
  signal: string;
  factors: {
    valuation: FundamentalFactor;
    growth: FundamentalFactor;
    profitability: FundamentalFactor;
    financialHealth: FundamentalFactor;
    analystConsensus: FundamentalFactor;
  };
  timestamp: string;
}

interface HybridPredictionResult extends PredictionResult {
  fundamentalScore: FundamentalScore | null;
  fundamentalAvailable: boolean;
  aiInsight: string;
  totalScore: number;
  hybridConfidence: number;
}

interface LearningStatsData {
  totalRecorded: number;
  totalEvaluated: number;
  totalCorrect: number;
  overallAccuracy: number;
  overallAccuracyPercent: number;
  lessons: Array<{ id: string; category: string; message: string; severity: number; createdAt: string }>;
  indicatorAccuracies: Record<string, {
    indicator: string;
    description: string;
    accuracy: number;
    totalPredictions: number;
    correctPredictions: number;
    weight: number;
    type: string;
  }>;
  tickerAccuracy: Record<string, { total: number; correct: number; accuracy: number }>;
  weightMultipliers: Record<string, number>;
  recentPredictions: Array<{
    ticker: string;
    timestamp: string;
    direction: string;
    totalScore: number;
    confidence: number;
    priceAtPrediction: number;
    actualPrice?: number;
    actualChangePercent?: number;
    wasCorrect?: boolean;
    evaluated: boolean;
    topWrongIndicators: string[];
  }>;
}

interface HybridScanResult {
  scannedAt: string;
  total: number;
  successful: number;
  failed: number;
  errors: string[];
  topPicks: HybridPredictionResult[];
  topShorts: HybridPredictionResult[];
  mostConfident: HybridPredictionResult[];
  allResults: HybridPredictionResult[];
}

// ─── Helper Functions ───────────────────────────────────────

function directionColor(direction: string): string {
  switch (direction) {
    case 'STRONG_BUY': return 'text-emerald-400';
    case 'BUY': return 'text-emerald-500';
    case 'NEUTRAL': return 'text-yellow-500';
    case 'SELL': return 'text-red-500';
    case 'STRONG_SELL': return 'text-red-400';
    default: return 'text-muted-foreground';
  }
}

function directionBg(direction: string): string {
  switch (direction) {
    case 'STRONG_BUY': return 'bg-emerald-500/15 border-emerald-500/30';
    case 'BUY': return 'bg-emerald-500/10 border-emerald-500/20';
    case 'NEUTRAL': return 'bg-yellow-500/10 border-yellow-500/20';
    case 'SELL': return 'bg-red-500/10 border-red-500/20';
    case 'STRONG_SELL': return 'bg-red-500/15 border-red-500/30';
    default: return 'bg-muted/50 border-border/50';
  }
}

function directionLabel(direction: string): string {
  switch (direction) {
    case 'STRONG_BUY': return 'BLERJE E FORTË';
    case 'BUY': return 'BLERJE';
    case 'NEUTRAL': return 'NEUTRAL';
    case 'SELL': return 'SHITJE';
    case 'STRONG_SELL': return 'SHITJE E FORTË';
    default: return direction;
  }
}

function directionBadgeVariant(direction: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (direction === 'STRONG_BUY' || direction === 'BUY') return 'default';
  if (direction === 'SELL' || direction === 'STRONG_SELL') return 'destructive';
  return 'secondary';
}

function scoreColor(score: number): string {
  if (score > 60) return 'text-emerald-400';
  if (score > 25) return 'text-emerald-500';
  if (score > -25) return 'text-yellow-500';
  if (score > -60) return 'text-red-500';
  return 'text-red-400';
}

function confidenceColor(conf: number): string {
  if (conf > 70) return 'text-emerald-400';
  if (conf > 40) return 'text-yellow-400';
  return 'text-red-400';
}

function predictionLabel(prediction: string): string {
  switch (prediction) {
    case 'UP': return 'Rritje';
    case 'DOWN': return 'Ulje';
    case 'SIDEWAYS': return 'Barnë';
    default: return prediction;
  }
}

function predictionIcon(prediction: string) {
  if (prediction === 'UP') return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
  if (prediction === 'DOWN') return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-yellow-400" />;
}

function riskLabel(level: string): string {
  switch (level) {
    case 'LOW': return 'Ulët';
    case 'MEDIUM': return 'Mesatar';
    case 'HIGH': return 'I Lartë';
    default: return level;
  }
}

function riskVariant(level: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (level === 'LOW') return 'default';
  if (level === 'HIGH') return 'destructive';
  return 'secondary';
}

function volatilityLabel(level: string): string {
  switch (level) {
    case 'LOW': return 'Ulët';
    case 'MEDIUM': return 'Mesatar';
    case 'HIGH': return 'I Lartë';
    default: return level;
  }
}

function indicatorScoreColor(score: number): string {
  if (score > 0) return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
  if (score < 0) return 'text-red-400 border-red-500/20 bg-red-500/5';
  return 'text-yellow-400 border-yellow-500/20 bg-yellow-500/5';
}

// ─── Inline Components ──────────────────────────────────────

function PredictionScoreGauge({ score, direction }: { score: number; direction: string }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const normalizedScore = ((score + 100) / 200) * 100;
  const offset = circumference - (normalizedScore / 100) * circumference;

  const ringColor = score > 25
    ? 'stroke-emerald-500'
    : score > -25
      ? 'stroke-yellow-500'
      : 'stroke-red-500';

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-36 h-36">
        <svg className="w-36 h-36 -rotate-90" viewBox="0 0 120 120">
          <circle
            cx="60" cy="60" r={radius}
            fill="none" className="stroke-muted/30" strokeWidth="8"
          />
          <motion.circle
            cx="60" cy="60" r={radius}
            fill="none" className={ringColor}
            strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold ${scoreColor(score)}`}>
            {score > 0 ? '+' : ''}{score}
          </span>
          <span className="text-[10px] text-muted-foreground">-100 — +100</span>
        </div>
      </div>
      <Badge
        variant={directionBadgeVariant(direction)}
        className="text-sm px-4 py-1.5 font-semibold"
      >
        {directionLabel(direction)}
      </Badge>
    </div>
  );
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const barColor = confidence > 70
    ? 'bg-emerald-500'
    : confidence > 40
      ? 'bg-yellow-500'
      : 'bg-red-500';

  return (
    <div className="w-full space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Besimi</span>
        <span className={`text-xs font-bold ${confidenceColor(confidence)}`}>
          {confidence.toFixed(1)}%
        </span>
      </div>
      <div className="w-full h-2 rounded-full bg-muted/50 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${barColor}`}
          initial={{ width: 0 }}
          animate={{ width: `${confidence}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

function TermCard({
  label,
  data,
}: {
  label: string;
  data: TermPrediction;
}) {
  return (
    <Card className={`border ${directionBg(data.prediction === 'UP' ? 'BUY' : data.prediction === 'DOWN' ? 'SELL' : 'NEUTRAL')}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Clock className="w-3 h-3" />
          {label}
        </div>
        <div className="flex items-center gap-2">
          {predictionIcon(data.prediction)}
          <span className={`text-sm font-bold ${directionColor(data.prediction === 'UP' ? 'BUY' : data.prediction === 'DOWN' ? 'SELL' : 'NEUTRAL')}`}>
            {predictionLabel(data.prediction)}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Probabiliteti</span>
          <span className="font-semibold text-foreground">{data.probability.toFixed(1)}%</span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Lëvizja e pritur</span>
          <span className={`font-semibold ${data.expectedMove >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {data.expectedMove >= 0 ? '+' : ''}{data.expectedMove.toFixed(2)}%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreBar({ score }: { score: number }) {
  const normalized = ((score + 100) / 200) * 100;

  return (
    <div className="relative w-full h-2.5 rounded-full overflow-hidden">
      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-emerald-500 opacity-40" />
      <motion.div
        className="absolute top-1/2 -translate-y-1/2 w-1.5 h-3.5 rounded-sm bg-white shadow-sm border border-foreground/20"
        initial={{ left: '50%' }}
        animate={{ left: `${Math.max(2, Math.min(98, normalized))}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

export function StockPredictor() {
  // Mode
  const [mode, setMode] = useState<'single' | 'scan' | 'ai-hybrid'>('scan');

  // Single mode
  const [ticker, setTicker] = useState('');
  const [singleResult, setSingleResult] = useState<PredictionResult | null>(null);
  const [singleLoading, setSingleLoading] = useState(false);
  const [singleError, setSingleError] = useState('');

  // Scan mode
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanProgress, setScanProgress] = useState('');
  const [viewTab, setViewTab] = useState<'top-picks' | 'top-shorts' | 'most-confident' | 'all'>('top-picks');
  const [sortField, setSortField] = useState<'score' | 'confidence' | 'symbol' | 'totalScore' | 'hybridConfidence'>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  // AI Hybrid scan mode
  const [hybridResult, setHybridResult] = useState<HybridScanResult | null>(null);
  const [hybridLoading, setHybridLoading] = useState(false);
  const [hybridError, setHybridError] = useState('');
  const [hybridViewTab, setHybridViewTab] = useState<'top-picks' | 'top-shorts' | 'most-confident' | 'all'>('top-picks');
  const [hybridSortField, setHybridSortField] = useState<'totalScore' | 'hybridConfidence' | 'symbol'>('totalScore');
  const [hybridSortDir, setHybridSortDir] = useState<'asc' | 'desc'>('desc');
  const [hybridExpandedSymbol, setHybridExpandedSymbol] = useState<string | null>(null);

  // ─── Handlers ─────────────────────────────────────────────

  const handleSinglePredict = useCallback(async () => {
    if (!ticker.trim()) return;
    setSingleLoading(true);
    setSingleError('');
    setSingleResult(null);
    try {
      const res = await fetch(`/api/predict/${ticker.trim().toUpperCase()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gabim gjatë predikimit');
      setSingleResult(data);
    } catch (err: unknown) {
      setSingleError(err instanceof Error ? err.message : 'Gabim i papritur');
    } finally {
      setSingleLoading(false);
    }
  }, [ticker]);

  const handleFullScan = useCallback(async () => {
    setScanLoading(true);
    setScanError('');
    setScanResult(null);
    setScanProgress('Duke filluar skanimin...');
    setExpandedSymbol(null);
    try {
      const res = await fetch('/api/predict-scan', {
        signal: AbortSignal.timeout(300000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gabim gjatë skanimit');
      setScanResult(data);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        setScanError('Koha i mbaroi. Provoni përsëri.');
      } else {
        setScanError(err instanceof Error ? err.message : 'Gabim i papritur');
      }
    } finally {
      setScanLoading(false);
      setScanProgress('');
    }
  }, []);

  const handleSort = useCallback((field: 'score' | 'confidence' | 'symbol' | 'totalScore' | 'hybridConfidence') => {
    if (sortField === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }, [sortField]);

  const handleHybridScan = useCallback(async () => {
    setHybridLoading(true);
    setHybridError('');
    setHybridResult(null);
    setHybridExpandedSymbol(null);
    try {
      const res = await fetch('/api/ai-predict-scan', {
        signal: AbortSignal.timeout(300000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gabim gjatë skanimit hibrid');
      setHybridResult(data);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        setHybridError('Koha i mbaroi. Provoni përsëri.');
      } else {
        setHybridError(err instanceof Error ? err.message : 'Gabim i papritur');
      }
    } finally {
      setHybridLoading(false);
    }
  }, []);

  const handleHybridSort = useCallback((field: 'totalScore' | 'hybridConfidence' | 'symbol') => {
    if (hybridSortField === field) {
      setHybridSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setHybridSortField(field);
      setHybridSortDir('desc');
    }
  }, [hybridSortField]);

  // ─── Derived Data ─────────────────────────────────────────

  // Hybrid derived data
  const currentHybridResults: HybridPredictionResult[] | null = (() => {
    if (!hybridResult) return null;
    const src = (() => {
      switch (hybridViewTab) {
        case 'top-picks': return hybridResult.topPicks;
        case 'top-shorts': return hybridResult.topShorts;
        case 'most-confident': return hybridResult.mostConfident;
        case 'all': return hybridResult.allResults;
        default: return null;
      }
    })();
    if (!src) return null;
    if (hybridViewTab !== 'all') return src;
    return [...src].sort((a, b) => {
      if (hybridSortField === 'symbol') {
        return hybridSortDir === 'asc'
          ? a.symbol.localeCompare(b.symbol)
          : b.symbol.localeCompare(a.symbol);
      }
      const aVal = a[hybridSortField];
      const bVal = b[hybridSortField];
      return hybridSortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  })();

  const currentResults: PredictionResult[] | null = (() => {
    if (!scanResult) return null;
    switch (viewTab) {
      case 'top-picks': return scanResult.topPicks;
      case 'top-shorts': return scanResult.topShorts;
      case 'most-confident': return scanResult.mostConfident;
      case 'all': {
        const sorted = [...scanResult.allResults].sort((a, b) => {
          if (sortField === 'symbol') {
            return sortDir === 'asc'
              ? a.symbol.localeCompare(b.symbol)
              : b.symbol.localeCompare(a.symbol);
          }
          const aVal = sortField === 'score' ? a.score : a.confidence;
          const bVal = sortField === 'score' ? b.score : b.confidence;
          return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        });
        return sorted;
      }
      default: return null;
    }
  })();

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* ═══════ Title ═══════ */}
      <div className="flex items-center gap-2.5">
        <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
          <Brain className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Predikues i Stoqeve me AI</h2>
          <p className="text-xs text-muted-foreground">Analizë teknike e avancuar me më shumë se 15 indikatorë</p>
        </div>
      </div>

      {/* ═══════ Mode Toggle ═══════ */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={mode === 'single' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('single')}
          className={mode === 'single' ? 'bg-violet-600 hover:bg-violet-700' : ''}
        >
          <Search className="w-3.5 h-3.5 mr-1.5" />
          Predikim Individual
        </Button>
        <Button
          variant={mode === 'scan' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('scan')}
          className={mode === 'scan' ? 'bg-violet-600 hover:bg-violet-700' : ''}
        >
          <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
          Skanim Teknik
        </Button>
        <Button
          variant={mode === 'ai-hybrid' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('ai-hybrid')}
          className={mode === 'ai-hybrid' ? 'bg-violet-600 hover:bg-violet-700' : ''}
        >
          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
          AI Hybrid
        </Button>
      </div>

      <AnimatePresence mode="wait">
        {/* ═══════════════════════════════════════════════════ */}
        {/* SINGLE STOCK MODE                                 */}
        {/* ═══════════════════════════════════════════════════ */}
        {mode === 'single' && (
          <motion.div
            key="single"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <p className="text-xs text-muted-foreground">
              Shkruani një ticker për të marrë predikimin e detajuar me indikatorë teknike, sinjale dhe faturët kryesorë.
            </p>

            {/* Input row */}
            <div className="flex gap-2">
              <Input
                placeholder="Shkruaj ticker (p.sh. AAPL)"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleSinglePredict()}
                className="max-w-xs"
              />
              <Button
                onClick={handleSinglePredict}
                disabled={singleLoading || !ticker.trim()}
                size="sm"
              >
                {singleLoading
                  ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  : <Zap className="w-4 h-4 mr-1.5" />
                }
                Analizo
              </Button>
            </div>

            {/* Error */}
            {singleError && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-sm text-red-400 flex items-center gap-1.5"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                {singleError}
              </motion.p>
            )}

            {/* Loading */}
            {singleLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-center gap-3 py-12 text-muted-foreground"
              >
                <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
                <span className="text-sm">Duke analizuar {ticker}...</span>
              </motion.div>
            )}

            {/* Result */}
            {singleResult && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="space-y-4"
              >
                <Card className="border-violet-500/20 bg-violet-500/5">
                  <CardContent className="pt-5 space-y-5">
                    {/* Top row: Gauge + Meta */}
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                      <PredictionScoreGauge
                        score={singleResult.score}
                        direction={singleResult.direction}
                      />
                      <div className="flex-1 space-y-3 w-full">
                        <div>
                          <h3 className="text-xl font-bold">{singleResult.symbol}</h3>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(singleResult.timestamp).toLocaleString('sq-AL')}
                          </p>
                        </div>
                        <ConfidenceBar confidence={singleResult.confidence} />
                        <div className="flex gap-2 flex-wrap">
                          <Badge variant={riskVariant(singleResult.riskLevel)} className="text-[10px]">
                            <Shield className="w-3 h-3 mr-1" />
                            Rreziku: {riskLabel(singleResult.riskLevel)}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            <BarChart3 className="w-3 h-3 mr-1" />
                            Volatiliteti: {volatilityLabel(singleResult.volatility)}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* Term predictions */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <TermCard
                        label="Afati i Shkurtër (1-3 ditë)"
                        data={singleResult.shortTerm}
                      />
                      <TermCard
                        label="Afati i Gjatë (1-2 javë)"
                        data={singleResult.mediumTerm}
                      />
                    </div>

                    {/* Key Factors */}
                    {singleResult.keyFactors.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Target className="w-3 h-3" />
                          Faktorët Kryesorë
                        </h4>
                        <div className="overflow-x-auto rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-[10px]">Emri</TableHead>
                                <TableHead className="text-[10px]">Sinjali</TableHead>
                                <TableHead className="text-[10px]">Ndikimi</TableHead>
                                <TableHead className="text-[10px] text-right">Pikët</TableHead>
                                <TableHead className="text-[10px]">Përshkrimi</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {singleResult.keyFactors.map((f, i) => (
                                <TableRow key={i}>
                                  <TableCell className="text-xs font-medium py-1.5">{f.name}</TableCell>
                                  <TableCell className="py-1.5">
                                    <Badge
                                      variant={directionBadgeVariant(f.signal)}
                                      className="text-[10px]"
                                    >
                                      {directionLabel(f.signal)}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-[10px] py-1.5">{f.impact}</TableCell>
                                  <TableCell className={`text-xs font-bold text-right py-1.5 ${scoreColor(f.score)}`}>
                                    {f.score > 0 ? '+' : ''}{f.score}
                                  </TableCell>
                                  <TableCell className="text-[10px] text-muted-foreground py-1.5 max-w-[250px] truncate">
                                    {f.description}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    {/* All Indicators Grid */}
                    {Object.keys(singleResult.indicatorScores).length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                          <BarChart3 className="w-3 h-3" />
                          Indikatorët
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                          {Object.entries(singleResult.indicatorScores).map(([name, score]) => (
                            <div
                              key={name}
                              className={`rounded-md border px-2.5 py-1.5 text-center ${indicatorScoreColor(score)}`}
                            >
                              <p className="text-[10px] opacity-70 truncate">{name}</p>
                              <p className="text-xs font-bold">
                                {score > 0 ? '+' : ''}{score}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* SCAN MODE                                         */}
        {/* ═══════════════════════════════════════════════════ */}
        {mode === 'scan' && (
          <motion.div
            key="scan"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <p className="text-xs text-muted-foreground">
              Skanoni të gjitha 116 stoqet me një klikim. AI analizon çdo stoqe me indikatorë teknike dhe i rendit sipas pikëve.
            </p>

            {/* Scan button */}
            {!scanResult && !scanLoading && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <Button
                  onClick={handleFullScan}
                  size="lg"
                  className="bg-violet-600 hover:bg-violet-700 text-white font-semibold px-8 h-12 text-sm"
                >
                  <Zap className="w-5 h-5 mr-2" />
                  Skanoni 116 Stoqet
                </Button>
              </motion.div>
            )}

            {/* Loading state */}
            {scanLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-4 py-16"
              >
                <div className="relative">
                  <motion.div
                    className="w-20 h-20 rounded-full border-2 border-violet-500/30"
                    animate={{ scale: [1, 1.15, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-violet-400/50"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.7, 0.3] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Brain className="w-8 h-8 text-violet-400" />
                  </div>
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    Duke skanuar stoqet...
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Kjo mund të zgjasë 2-3 minuta
                  </p>
                </div>
                {scanProgress && (
                  <p className="text-[10px] text-violet-400">{scanProgress}</p>
                )}
                {/* Fake progress bar */}
                <div className="w-64 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                    initial={{ width: '0%' }}
                    animate={{ width: '90%' }}
                    transition={{ duration: 120, ease: 'linear' }}
                  />
                </div>
              </motion.div>
            )}

            {/* Error */}
            {scanError && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 text-sm text-red-400"
              >
                <AlertTriangle className="w-4 h-4" />
                {scanError}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFullScan}
                  className="ml-2"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Provo përsëri
                </Button>
              </motion.div>
            )}

            {/* Scan Results */}
            {scanResult && !scanLoading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="space-y-4"
              >
                {/* Stats bar */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span className="font-semibold text-foreground">{scanResult.total}</span> skanuar
                  </div>
                  <div className="text-xs text-muted-foreground">|</div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-emerald-400 font-semibold">{scanResult.successful}</span>
                    <span className="text-muted-foreground">me sukses</span>
                  </div>
                  <div className="text-xs text-muted-foreground">|</div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-red-400 font-semibold">{scanResult.failed}</span>
                    <span className="text-muted-foreground">dështuan</span>
                  </div>
                  {scanResult.scannedAt && (
                    <>
                      <div className="text-xs text-muted-foreground">|</div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(scanResult.scannedAt).toLocaleString('sq-AL')}
                      </div>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleFullScan}
                    className="ml-auto h-7 text-[10px]"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Rifresko
                  </Button>
                </div>

                {/* Sub-tabs */}
                <div className="flex gap-1.5 flex-wrap">
                  {([
                    { key: 'top-picks' as const, label: '🎯 Top Picks (Blerje)', count: scanResult.topPicks.length },
                    { key: 'top-shorts' as const, label: '📉 Top Shorts (Shitje)', count: scanResult.topShorts.length },
                    { key: 'most-confident' as const, label: '✅ Më të Sigurtat', count: scanResult.mostConfident.length },
                    { key: 'all' as const, label: '📊 Të Gjitha', count: scanResult.allResults.length },
                  ]).map((tab) => (
                    <Button
                      key={tab.key}
                      variant={viewTab === tab.key ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => { setViewTab(tab.key); setExpandedSymbol(null); }}
                      className={`text-[10px] h-7 ${viewTab === tab.key ? 'bg-violet-600 hover:bg-violet-700' : ''}`}
                    >
                      {tab.label}
                      <Badge variant="outline" className="ml-1.5 text-[9px] px-1.5 py-0 h-4">
                        {tab.count}
                      </Badge>
                    </Button>
                  ))}
                </div>

                {/* Table */}
                <div className="max-h-[70vh] overflow-y-auto rounded-md border">
                  {currentResults && currentResults.length > 0 ? (
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10">
                        <TableRow>
                          <TableHead className="text-[10px] w-8 text-center">#</TableHead>
                          <TableHead className="text-[10px]">Ticker</TableHead>
                          <TableHead
                            className="text-[10px] cursor-pointer select-none hover:text-foreground transition-colors"
                            onClick={() => handleSort('score')}
                          >
                            <div className="flex items-center gap-1">
                              Pikët
                              {sortField === 'score' && (
                                sortDir === 'desc'
                                  ? <ChevronDown className="w-3 h-3" />
                                  : <ChevronUp className="w-3 h-3" />
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="text-[10px]">Sinjali</TableHead>
                          <TableHead
                            className="text-[10px] cursor-pointer select-none hover:text-foreground transition-colors"
                            onClick={() => handleSort('confidence')}
                          >
                            <div className="flex items-center gap-1">
                              Besimi %
                              {sortField === 'confidence' && (
                                sortDir === 'desc'
                                  ? <ChevronDown className="w-3 h-3" />
                                  : <ChevronUp className="w-3 h-3" />
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="text-[10px]">Afatshkurtër</TableHead>
                          <TableHead className="text-[10px]">Afatgjatë</TableHead>
                          <TableHead className="text-[10px]">Rreziku</TableHead>
                          <TableHead className="text-[10px]">Volatiliteti</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currentResults.map((r, idx) => {
                          const isExpanded = expandedSymbol === r.symbol;
                          return (
                            <motion.tr
                              key={r.symbol}
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.2, delay: idx * 0.03 }}
                              className="group"
                            >
                              {/* Regular row */}
                              <TableCell className="text-[10px] text-muted-foreground text-center py-1.5">
                                {idx + 1}
                              </TableCell>
                              <TableCell className="py-1.5">
                                <button
                                  onClick={() => setExpandedSymbol(isExpanded ? null : r.symbol)}
                                  className="flex items-center gap-1 font-bold text-xs hover:text-violet-400 transition-colors"
                                >
                                  {r.symbol}
                                  {isExpanded
                                    ? <ChevronUp className="w-3 h-3 text-muted-foreground" />
                                    : <ChevronDown className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                  }
                                </button>
                              </TableCell>
                              <TableCell className="py-1.5">
                                <div className="space-y-0.5">
                                  <span className={`text-xs font-bold ${scoreColor(r.score)}`}>
                                    {r.score > 0 ? '+' : ''}{r.score}
                                  </span>
                                  <ScoreBar score={r.score} />
                                </div>
                              </TableCell>
                              <TableCell className="py-1.5">
                                <Badge
                                  variant={directionBadgeVariant(r.direction)}
                                  className="text-[9px] px-1.5 py-0"
                                >
                                  {directionLabel(r.direction)}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-1.5">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-12 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                        r.confidence > 70
                                          ? 'bg-emerald-500'
                                          : r.confidence > 40
                                            ? 'bg-yellow-500'
                                            : 'bg-red-500'
                                      }`}
                                      style={{ width: `${r.confidence}%` }}
                                    />
                                  </div>
                                  <span className={`text-[10px] font-semibold ${confidenceColor(r.confidence)}`}>
                                    {r.confidence.toFixed(0)}%
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="py-1.5">
                                <div className="flex items-center gap-1 text-[10px]">
                                  {predictionIcon(r.shortTerm.prediction)}
                                  <span className="font-medium">{predictionLabel(r.shortTerm.prediction)}</span>
                                  <span className="text-muted-foreground">({r.shortTerm.probability.toFixed(0)}%)</span>
                                </div>
                              </TableCell>
                              <TableCell className="py-1.5">
                                <div className="flex items-center gap-1 text-[10px]">
                                  {predictionIcon(r.mediumTerm.prediction)}
                                  <span className="font-medium">{predictionLabel(r.mediumTerm.prediction)}</span>
                                  <span className="text-muted-foreground">({r.mediumTerm.probability.toFixed(0)}%)</span>
                                </div>
                              </TableCell>
                              <TableCell className="py-1.5">
                                <Badge variant={riskVariant(r.riskLevel)} className="text-[9px] px-1.5 py-0">
                                  {riskLabel(r.riskLevel)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-[10px] text-muted-foreground py-1.5">
                                {volatilityLabel(r.volatility)}
                              </TableCell>

                              {/* Expanded detail row */}
                              {isExpanded && (
                                <TableCell colSpan={9} className="p-0">
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="border-t border-border/50 bg-muted/20 px-4 py-3"
                                  >
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                      {/* Key Factors */}
                                      {r.keyFactors.length > 0 && (
                                        <div>
                                          <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">
                                            Faktorët Kryesorë
                                          </p>
                                          <div className="space-y-1">
                                            {r.keyFactors.map((f, fi) => (
                                              <div
                                                key={fi}
                                                className="flex items-start gap-2 text-[10px] rounded-md border px-2 py-1"
                                              >
                                                <div className="flex-1">
                                                  <span className="font-medium">{f.name}</span>
                                                  <span className="text-muted-foreground ml-1.5">{f.description}</span>
                                                </div>
                                                <Badge
                                                  variant={directionBadgeVariant(f.signal)}
                                                  className="text-[9px] px-1.5 py-0 shrink-0"
                                                >
                                                  {directionLabel(f.signal)}
                                                </Badge>
                                                <span className={`font-bold shrink-0 ${scoreColor(f.score)}`}>
                                                  {f.score > 0 ? '+' : ''}{f.score}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* Indicator Scores */}
                                      {Object.keys(r.indicatorScores).length > 0 && (
                                        <div>
                                          <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">
                                            Indikatorët
                                          </p>
                                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                                            {Object.entries(r.indicatorScores).map(([name, score]) => (
                                              <div
                                                key={name}
                                                className={`rounded-md border px-2 py-1 text-center ${indicatorScoreColor(score)}`}
                                              >
                                                <p className="text-[9px] opacity-70 truncate">{name}</p>
                                                <p className="text-[10px] font-bold">
                                                  {score > 0 ? '+' : ''}{score}
                                                </p>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                </TableCell>
                              )}
                            </motion.tr>
                          );
                        })}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <BarChart3 className="w-8 h-8 mb-2 opacity-40" />
                      <p className="text-sm">Nuk u gjetën predikime</p>
                    </div>
                  )}
                </div>

                {/* Errors */}
                {scanResult.errors.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                      {scanResult.errors.length} gabime
                    </summary>
                    <ul className="mt-1 space-y-0.5 pl-4 text-red-400/80 list-disc">
                      {scanResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </motion.div>
            )}
          </motion.div>
        )}
        {/* ═══════════════════════════════════════════════════ */}
        {/* AI HYBRID MODE                                   */}
        {/* ═══════════════════════════════════════════════════ */}
        {mode === 'ai-hybrid' && (
          <motion.div
            key="ai-hybrid"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <p className="text-xs text-muted-foreground">
              Predikim hibrid që kombinon analizën teknike (60%) me analizën themelore (40%) për rezultate më të sakta.
            </p>

            {/* Scan button */}
            {!hybridResult && !hybridLoading && (
              <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
                <Button
                  onClick={handleHybridScan}
                  size="lg"
                  className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white font-semibold px-8 h-12 text-sm"
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  Skanim Hibrid AI (116 stoqe)
                </Button>
              </motion.div>
            )}

            {/* Loading state */}
            {hybridLoading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4 py-16">
                <div className="relative">
                  <motion.div className="w-20 h-20 rounded-full border-2 border-violet-500/30" animate={{ scale: [1, 1.15, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }} />
                  <motion.div className="absolute inset-0 rounded-full border-2 border-fuchsia-400/50" animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-fuchsia-400" />
                  </div>
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-semibold text-foreground">Duke skanuar me AI Hybrid...</p>
                  <p className="text-xs text-muted-foreground">Teknikë + Fundamente — kjo mund të zgjasë 3-5 minuta</p>
                </div>
                <div className="w-64 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                  <motion.div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" initial={{ width: '0%' }} animate={{ width: '90%' }} transition={{ duration: 180, ease: 'linear' }} />
                </div>
              </motion.div>
            )}

            {/* Error */}
            {hybridError && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-sm text-red-400">
                <AlertTriangle className="w-4 h-4" />
                {hybridError}
                <Button variant="outline" size="sm" onClick={handleHybridScan} className="ml-2">
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Provo përsëri
                </Button>
              </motion.div>
            )}

            {/* Scan Results */}
            {hybridResult && !hybridLoading && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="space-y-4">
                {/* Stats bar */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Sparkles className="w-3.5 h-3.5 text-fuchsia-400" />
                    <span className="font-semibold text-foreground">{hybridResult.total}</span> skanuar hibrid
                  </div>
                  <div className="text-xs text-muted-foreground">|</div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-emerald-400 font-semibold">{hybridResult.successful}</span>
                    <span className="text-muted-foreground">me sukses</span>
                  </div>
                  <div className="text-xs text-muted-foreground">|</div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-red-400 font-semibold">{hybridResult.failed}</span>
                    <span className="text-muted-foreground">dështuan</span>
                  </div>
                  {hybridResult.scannedAt && (
                    <>
                      <div className="text-xs text-muted-foreground">|</div>
                      <div className="text-[10px] text-muted-foreground">{new Date(hybridResult.scannedAt).toLocaleString('sq-AL')}</div>
                    </>
                  )}
                  <Button variant="ghost" size="sm" onClick={handleHybridScan} className="ml-auto h-7 text-[10px]">
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Rifresko
                  </Button>
                </div>

                {/* Sub-tabs */}
                <div className="flex gap-1.5 flex-wrap">
                  {([
                    { key: 'top-picks' as const, label: '🎯 Top Picks', count: hybridResult.topPicks.length },
                    { key: 'top-shorts' as const, label: '📉 Top Shorts', count: hybridResult.topShorts.length },
                    { key: 'most-confident' as const, label: '✅ Më të Sigurtat', count: hybridResult.mostConfident.length },
                    { key: 'all' as const, label: '📊 Të Gjitha', count: hybridResult.allResults.length },
                  ]).map((tab) => (
                    <Button
                      key={tab.key}
                      variant={hybridViewTab === tab.key ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => { setHybridViewTab(tab.key); setHybridExpandedSymbol(null); }}
                      className={`text-[10px] h-7 ${hybridViewTab === tab.key ? 'bg-violet-600 hover:bg-violet-700' : ''}`}
                    >
                      {tab.label}
                      <Badge variant="outline" className="ml-1.5 text-[9px] px-1.5 py-0 h-4">{tab.count}</Badge>
                    </Button>
                  ))}
                </div>

                {/* Hybrid Table */}
                <div className="max-h-[70vh] overflow-y-auto rounded-md border">
                  {currentHybridResults && currentHybridResults.length > 0 ? (
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10">
                        <TableRow>
                          <TableHead className="text-[10px] w-8 text-center">#</TableHead>
                          <TableHead className="text-[10px]">Ticker</TableHead>
                          <TableHead
                            className="text-[10px] cursor-pointer select-none hover:text-foreground transition-colors"
                            onClick={() => handleHybridSort('totalScore')}
                          >
                            <div className="flex items-center gap-1">
                              Total
                              {hybridSortField === 'totalScore' && (
                                hybridSortDir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="text-[10px]">Teknik</TableHead>
                          <TableHead className="text-[10px]">Fundamentet</TableHead>
                          <TableHead className="text-[10px]">Sinjali</TableHead>
                          <TableHead
                            className="text-[10px] cursor-pointer select-none hover:text-foreground transition-colors"
                            onClick={() => handleHybridSort('hybridConfidence')}
                          >
                            <div className="flex items-center gap-1">
                              Besim H.
                              {hybridSortField === 'hybridConfidence' && (
                                hybridSortDir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="text-[10px]">AI Insight</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currentHybridResults.map((r, idx) => {
                          const isExpanded = hybridExpandedSymbol === r.symbol;
                          return (
                            <motion.tr
                              key={r.symbol}
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.2, delay: Math.min(idx * 0.02, 0.5) }}
                              className="group"
                            >
                              <TableCell className="text-[10px] text-muted-foreground text-center py-1.5">{idx + 1}</TableCell>
                              <TableCell className="py-1.5">
                                <button
                                  onClick={() => setHybridExpandedSymbol(isExpanded ? null : r.symbol)}
                                  className="flex items-center gap-1 font-bold text-xs hover:text-violet-400 transition-colors"
                                >
                                  {r.symbol}
                                  {isExpanded
                                    ? <ChevronUp className="w-3 h-3 text-muted-foreground" />
                                    : <ChevronDown className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                  }
                                </button>
                              </TableCell>
                              <TableCell className="py-1.5">
                                <div className="space-y-0.5">
                                  <span className={`text-xs font-bold ${scoreColor(r.totalScore)}`}>
                                    {r.totalScore > 0 ? '+' : ''}{r.totalScore}
                                  </span>
                                  <ScoreBar score={r.totalScore} />
                                </div>
                              </TableCell>
                              <TableCell className="py-1.5">
                                <span className={`text-[10px] font-semibold ${scoreColor(r.score)}`}>
                                  {r.score > 0 ? '+' : ''}{r.score}
                                </span>
                              </TableCell>
                              <TableCell className="py-1.5">
                                {r.fundamentalAvailable && r.fundamentalScore ? (
                                  <span className={`text-[10px] font-semibold ${scoreColor(r.fundamentalScore.score)}`}>
                                    {r.fundamentalScore.score > 0 ? '+' : ''}{r.fundamentalScore.score}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="py-1.5">
                                <Badge variant={directionBadgeVariant(r.direction)} className="text-[9px] px-1.5 py-0">
                                  {directionLabel(r.direction)}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-1.5">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-12 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                r.hybridConfidence > 70
                                  ? 'bg-emerald-500'
                                  : r.hybridConfidence > 40
                                    ? 'bg-yellow-500'
                                    : 'bg-red-500'
                              }`}
                                      style={{ width: `${r.hybridConfidence}%` }}
                                    />
                                  </div>
                                  <span className={`text-[10px] font-semibold ${confidenceColor(r.hybridConfidence)}`}>
                                    {r.hybridConfidence.toFixed(0)}%
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="py-1.5 max-w-[220px]">
                                <p className="text-[9px] text-muted-foreground leading-tight line-clamp-2">{r.aiInsight}</p>
                              </TableCell>

                              {/* Expanded detail */}
                              {isExpanded && (
                                <TableCell colSpan={8} className="p-0">
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="border-t border-border/50 bg-muted/20 px-4 py-3"
                                  >
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                      {/* Technical Key Factors */}
                                      {r.keyFactors.length > 0 && (
                                        <div>
                                          <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">Faktorët Teknikë</p>
                                          <div className="space-y-1">
                                            {r.keyFactors.slice(0, 5).map((f, fi) => (
                                              <div key={fi} className="flex items-start gap-2 text-[10px] rounded-md border px-2 py-1">
                                                <div className="flex-1">
                                                  <span className="font-medium">{f.name}</span>
                                                  <span className="text-muted-foreground ml-1.5">{f.description}</span>
                                                </div>
                                                <span className={`font-bold shrink-0 ${scoreColor(f.score)}`}>{f.score > 0 ? '+' : ''}{f.score}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* Fundamental Factors */}
                                      {r.fundamentalAvailable && r.fundamentalScore && (
                                        <div>
                                          <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">Faktorët Themelorë</p>
                                          <div className="space-y-1">
                                            {Object.entries(r.fundamentalScore.factors).map(([key, f]) => (
                                              <div key={key} className="flex items-start gap-2 text-[10px] rounded-md border px-2 py-1">
                                                <div className="flex-1">
                                                  <span className="font-medium">{f.name}</span>
                                                  <span className="text-muted-foreground ml-1.5">{f.description}</span>
                                                </div>
                                                <span className={`font-bold shrink-0 ${scoreColor(f.score)}`}>{f.score > 0 ? '+' : ''}{f.score}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* No fundamentals notice */}
                                      {!r.fundamentalAvailable && (
                                        <div className="col-span-2">
                                          <p className="text-[10px] text-muted-foreground italic">Të dhëna themelore nuk janë të disponueshme për {r.symbol}. Predikimi bazohet vetëm në analizën teknike.</p>
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                </TableCell>
                              )}
                            </motion.tr>
                          );
                        })}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <Sparkles className="w-8 h-8 mb-2 opacity-40" />
                      <p className="text-sm">Nuk u gjetën predikime hibride</p>
                    </div>
                  )}
                </div>

                {/* Errors */}
                {hybridResult.errors.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">{hybridResult.errors.length} gabime</summary>
                    <ul className="mt-1 space-y-0.5 pl-4 text-red-400/80 list-disc">
                      {hybridResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                  </details>
                )}

                {/* ─── LEARNING STATS ─────────────────────────── */}
                {hybridResult.learning && hybridResult.learning.totalRecorded > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    transition={{ duration: 0.4 }}
                    className="mt-4"
                  >
                    <Card className="border-blue-500/20 bg-blue-500/5">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <GraduationCap className="w-4 h-4 text-blue-400" />
                          <h3 className="text-sm font-bold">Sistemi i Mesimit nga Historia</h3>
                          <Badge variant="outline" className="text-[10px] ml-auto">
                            <Brain className="w-3 h-3 mr-1" />
                            AI Learning
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                          <div className="text-center p-2 rounded-lg bg-muted/30">
                            <p className="text-[10px] text-muted-foreground">Të Regjistruara</p>
                            <p className="text-lg font-bold">{hybridResult.learning.totalRecorded}</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-muted/30">
                            <p className="text-[10px] text-muted-foreground">Të Vlerësuara</p>
                            <p className="text-lg font-bold">{hybridResult.learning.totalEvaluated}</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-muted/30">
                            <p className="text-[10px] text-muted-foreground">Saktesia</p>
                            <p className={`text-lg font-bold ${hybridResult.learning.overallAccuracy > 55 ? 'text-emerald-400' : hybridResult.learning.overallAccuracy > 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                              {hybridResult.learning.overallAccuracy}%
                            </p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-muted/30">
                            <p className="text-[10px] text-muted-foreground">Mësime</p>
                            <p className="text-lg font-bold">{hybridResult.learning.lessonsCount}</p>
                          </div>
                        </div>

                        {/* Evaluation result from this scan */}
                        {hybridResult.learning.evaluationResult && hybridResult.learning.evaluationResult.evaluated > 0 && (
                          <div className="mb-3 p-2.5 rounded-lg border bg-muted/20">
                            <div className="flex items-center gap-2 mb-1">
                              <Activity className="w-3.5 h-3.5 text-blue-400" />
                              <span className="text-xs font-semibold">Vlerësim i fundit nga kjo skanë</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              Vlerësuan {hybridResult.learning.evaluationResult.evaluated} parashikime të kaluara:{' '}
                              <span className={hybridResult.learning.evaluationResult.correct > 0 ? 'text-emerald-400' : 'text-red-400'}>
                                {hybridResult.learning.evaluationResult.correct} ({hybridResult.learning.evaluationResult.accuracy}%) ishin
                              </span>
                              {hybridResult.learning.evaluationResult.newLessons > 0 && (
                                <span className="text-yellow-400">• {hybridResult.learning.evaluationResult.newLessons} mësime të reja</span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* No data yet message */}
                        {hybridResult.learning.totalEvaluated < 5 && (
                          <div className="text-center py-4">
                            <BookOpen className="w-6 h-6 text-blue-400/40 mx-auto mb-2" />
                            <p className="text-xs text-muted-foreground">
                              Sistemi po mëson. Pas {5 - 10} skane, do të fillojë të tregojë saktesinë
                              per indikatorë dhe të rregullojë peshat automatikisht.
                            </p>
                            <p className="text-[10px] text-muted-foreground/60 mt-1">
                              Çdo skanë regjistron parashikimet dhe i vlerëson më pas me çmimet aktuale.
                            </p>
                          </div>
                        )}

                        {/* Recent evaluated predictions */}
                        {hybridResult.learning.totalEvaluated >= 5 && (
                          <LearningPreview learning={hybridResult.learning} />
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}