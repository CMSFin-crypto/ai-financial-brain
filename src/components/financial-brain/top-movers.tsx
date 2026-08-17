'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
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
  Wifi,
  WifiOff,
  Info,
  X,
  TrendingUpIcon,
  DollarSign,
  Percent,
  Scale,
  Crosshair,
  Activity,
} from 'lucide-react';

interface SwingData {
  swingScore: number;
  rsi: number;
  macdSignal: string;
  bollingerPosition: number;
  bollingerSqueeze: boolean;
  sma20vs50: string;
  ema9vs21: string;
  atrPercent: number;
  volumeTrend: string;
  supportLevel: number;
  resistanceLevel: number;
  entryPrice: number;
  stopLoss: number;
  swingTarget: number;
  riskRewardRatio: number;
  confluenceCount: number;
  regime: string;
  swingReasons: string[];
  warningFlags: string[];
}

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
  isLive?: boolean;
  hasFundamentals?: boolean;
  swing?: SwingData | null;
}

interface TopMoversData {
  topGrowth: MoverStock[];
  topRisk: MoverStock[];
  totalAnalyzed: number;
  timestamp: string;
  liveCount?: number;
  fundCount?: number;
  totalFetched?: number;
  cached?: boolean;
  stale?: boolean;
}

// ═══ Metric Explanations (Albanian) ═══
const METRIC_INFO: Record<string, {
  title: string;
  icon: React.ReactNode;
  description: string;
  ideal: string;
  good: string;
  bad: string;
  formula?: string;
  // Visual gauge ranges (0-100 scale)
  gaugeBadEnd: number;
  gaugeGoodStart: number;
  gaugeGoodEnd: number;
  gaugeIdealStart: number;
  gaugeIdealEnd: number;
}> = {
  upside: {
    title: 'Upside (Potenciali)',
    icon: <TrendingUpIcon className="w-4 h-4 text-blue-500" />,
    description:
      'Upside tregon sa % çmimi aktual është nën objektivin mesatar të analistëve. Llogaritet si: (Target - Çmimi aktual) / Çmimi aktual × 100. Një Upside i lartë do të thotë se analistët mendojnë se aksioni ka hapësirë të madhe rritjeje nga niveli aktual.',
    ideal: '+15% deri +40% — Rritje e shëndetshme me potencial real',
    good: '+5% deri +60% — Rrethi i pranueshëm',
    bad: 'Mbi +80% ose negativ — Ose joshi e çmuar, ose targetet janë josë besueshme',
    formula: 'Upside = (Target Mesatar - Çmimi Aktual) / Çmimi Aktual × 100',
    gaugeBadEnd: 20, gaugeGoodStart: 20, gaugeGoodEnd: 70, gaugeIdealStart: 35, gaugeIdealEnd: 55,
  },
  revGrowth: {
    title: 'Revenue Growth (Rritja e të ardhurave)',
    icon: <DollarSign className="w-4 h-4 text-emerald-500" />,
    description:
      'Tregon sa % kanë rritur të ardhurat totale të kompanisë gjatë 12 muajve të fundit. Rritja e të ardhurave është një nga indikatorët më të rëndësishëm sepse konfirmon se kompania po fiton treg, po rritet, apo po shtrëngohet. Kompanitë me rritje të ardhurave >20% konsiderohen me rritje të fortë.',
    ideal: '+15% deri +40% — Rritje e shpejtë por e qëndrueshme',
    good: '+5% deri +15% — Rritje e shëndetshme',
    bad: 'Fitoi −5% ose me ulët — Kompania po humb treg',
    formula: 'Rev Gr = (Të ardhurat vitore aktuale − Të ardhurat vitore të mëparshme) / Të ardhurat e mëparshme × 100',
    gaugeBadEnd: 25, gaugeGoodStart: 25, gaugeGoodEnd: 55, gaugeIdealStart: 35, gaugeIdealEnd: 50,
  },
  epsGrowth: {
    title: 'EPS Growth (Rritja e fitimit per aksion)',
    icon: <Percent className="w-4 h-4 text-violet-500" />,
    description:
      'EPS (Earnings Per Share) tregon sa fitim gjeneron kompania për çdo aksion. Rritja e EPS tregon nëse fitimi po rritet me kalimin e kohës. Kjo është e rëndësishme sepse çmimi i aksionit në afat të gjatë ndjek rritjen e EPS-së. Kompanitë me EPS growth >20% konsiderohen në rritje të fortë.',
    ideal: '+20% deri +50% — Rritje e fortë fitimesh',
    good: '+5% deri +20% — Rritje e shëndetshme',
    bad: 'Fitoi −10% ose me ulët — Fitimi po bie',
    formula: 'EPS Gr = (EPS aktual − EPS i mëparshëm) / EPS i mëparshëm × 100',
    gaugeBadEnd: 25, gaugeGoodStart: 25, gaugeGoodEnd: 55, gaugeIdealStart: 35, gaugeIdealEnd: 50,
  },
  peg: {
    title: 'PEG Ratio (Çmimi për rritjen)',
    icon: <Scale className="w-4 h-4 text-amber-500" />,
    description:
      'PEG (Price/Earnings to Growth) është P/E i ndarë me rritjen e EPS-së. Një PEG = 1.0 do të thotë se çmimi është i arsyeshëm për rritjen. PEG < 1.0 tregon nënvlerësim (aksioni është i lirë për rritjen që ofron). PEG > 2.0 tregon vlerësim të lartë. PEG është më i mirë se P/E vetëm sepse merr parasysh rritjen.',
    ideal: '0.5 deri 1.5 — Vlerësim i arsyeshëm për rritjen',
    good: '0.3 deri 2.0 — Rrethi i pranueshëm',
    bad: 'Mbi 3.0 ose negativ — Vlerësim shumë i lartë ose rritje negative',
    formula: 'PEG = P/E (Trailing) / EPS Growth (% në numra)',
    gaugeBadEnd: 15, gaugeGoodStart: 15, gaugeGoodEnd: 55, gaugeIdealStart: 25, gaugeIdealEnd: 50,
  },
};

// ═══ Metric Info Popup ═══
function MetricInfoPopup({
  metricKey,
  onClose,
}: {
  metricKey: string;
  onClose: () => void;
}) {
  const info = METRIC_INFO[metricKey];
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleEsc);
    }, 10);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  if (!info) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={popupRef} className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-3 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {info.icon}
            <h3 className="text-sm font-bold">{info.title}</h3>
          </div>
          <button onClick={onClose} className="w-6 h-6 rounded-full bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors">
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground leading-relaxed">{info.description}</p>

        {/* Scale indicators */}
        <div className="space-y-1.5">
          <div className="flex items-start gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-semibold text-emerald-500">Ideal</p>
              <p className="text-[10px] text-muted-foreground">{info.ideal}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 mt-1 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-semibold text-blue-500">I pranueshëm</p>
              <p className="text-[10px] text-muted-foreground">{info.good}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 mt-1 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-semibold text-red-500">Rrezik</p>
              <p className="text-[10px] text-muted-foreground">{info.bad}</p>
            </div>
          </div>
        </div>

        {/* Visual Gauge Bar — shows ideal/good/bad zones */}
        <div className="space-y-1.5">
          <p className="text-[9px] font-medium text-muted-foreground">Shkala e vlerësimit</p>
          <div className="relative h-4 rounded-full overflow-hidden flex">
            {/* Bad zone (red) */}
            <div className="bg-gradient-to-r from-red-500 to-red-400/80" style={{ width: `${info.gaugeBadEnd}%` }} />
            {/* Good zone (blue) */}
            <div className="bg-gradient-to-r from-blue-400 to-blue-500" style={{ width: `${info.gaugeGoodEnd - info.gaugeGoodStart}%` }} />
            {/* Ideal zone (green, highlighted) */}
            <div className="relative bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${info.gaugeIdealEnd - info.gaugeIdealStart}%` }}>
              <div className="absolute inset-0 border-y-2 border-emerald-300/50" />
            </div>
            {/* Remaining good zone */}
            <div className="bg-gradient-to-r from-blue-500 to-blue-400" style={{ width: `${100 - info.gaugeIdealEnd}%` }} />
          </div>
          {/* Zone labels under the bar */}
          <div className="flex justify-between text-[8px] text-muted-foreground px-0.5">
            <span className="text-red-400">Rrezik</span>
            <span className="text-blue-400">I pranueshëm</span>
            <span className="text-emerald-400 font-semibold">Ideal</span>
            <span className="text-blue-400">I pranueshëm</span>
            <span className="text-red-400">Rrezik</span>
          </div>
        </div>

        {/* Formula */}
        {info.formula && (
          <div className="bg-muted/30 rounded-lg p-2 border border-border/50">
            <p className="text-[9px] font-medium text-muted-foreground mb-0.5">Formula</p>
            <p className="text-[10px] font-mono text-foreground/80">{info.formula}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Clickable metric cell
function MetricCell({
  label,
  value,
  metricKey,
  colorClass = '',
}: {
  label: string;
  value: string;
  metricKey: string;
  colorClass?: string;
}) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowInfo(true)}
        className="bg-muted/30 rounded p-1 text-center hover:bg-muted/60 transition-colors cursor-help group relative"
      >
        <div className="flex items-center justify-center gap-0.5">
          <p className="text-[8px] text-muted-foreground">{label}</p>
          <Info className="w-2 h-2 text-muted-foreground/40 group-hover:text-muted-foreground/80 transition-colors" />
        </div>
        <p className={`text-[11px] font-semibold ${colorClass}`}>{value}</p>
      </button>
      {showInfo && <MetricInfoPopup metricKey={metricKey} onClose={() => setShowInfo(false)} />}
    </>
  );
}

// Simple seeded pseudo-random for consistent sparklines
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateSparklineData(priceChange: number, ticker: string): Array<{ value: number }> {
  const points = 12;
  const data: Array<{ value: number }> = [];
  const magnitude = Math.min(Math.abs(priceChange), 10);
  // Create a seed from ticker hash + priceChange for consistency
  const hash = ticker.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const rand = seededRandom(hash * 1000 + Math.round(priceChange * 100));
  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1);
    const trend = priceChange >= 0 ? progress * magnitude : -progress * magnitude;
    const noise = (rand() - 0.5) * magnitude * 0.4;
    data.push({ value: 50 + trend + noise });
  }
  return data;
}

function MiniSparkline({ priceChange, color, ticker }: { priceChange: number; color: string; ticker: string }) {
  const data = generateSparklineData(priceChange, ticker);
  return (
    <ResponsiveContainer width="100%" height={28}>
      <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
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

function StockHeader({ stock, index, color }: { stock: MoverStock; index: number; color: 'green' | 'red' }) {
  const bgColor = color === 'green' ? 'bg-emerald-500/20' : 'bg-red-500/20';
  const textColor = color === 'green' ? 'text-emerald-500' : 'text-red-500';
  const liveColor = color === 'green' ? 'text-emerald-500' : 'text-red-400';
  const liveBg = color === 'green' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30';
  const sparkColor = color === 'green' ? '#10b981' : '#ef4444';

  return (
    <div className="flex items-start justify-between mb-2 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <div className={`w-6 h-6 rounded-full ${bgColor} flex items-center justify-center ${textColor} text-[10px] font-bold flex-shrink-0`}>
          {index + 1}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-bold">{stock.ticker}</span>
            {stock.hasFundamentals ? (
              <Badge className={`${liveBg} ${liveColor} text-[7px] px-1 py-0 flex items-center gap-0.5`}>
                <Wifi className="w-2 h-2" /> Live
              </Badge>
            ) : (
              <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-[7px] px-1 py-0 flex items-center gap-0.5">
                <WifiOff className="w-2 h-2" />
              </Badge>
            )}
            <RatingBadge rating={stock.rating} />
            <MoatBadge moat={stock.moat} />
          </div>
          <p className="text-[10px] text-muted-foreground truncate">{stock.company} — {stock.sector}</p>
        </div>
      </div>
      {/* Price — always visible, sparkline hidden on small screens */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <div className="hidden sm:block w-16">
          <MiniSparkline priceChange={stock.priceChange} color={sparkColor} ticker={stock.ticker} />
        </div>
        <div className="text-right">
          <p className="text-sm font-bold">${stock.currentPrice.toFixed(2)}</p>
          <div className={`flex items-center gap-0.5 text-[10px] font-medium ${stock.priceChange >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {stock.priceChange >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {stock.priceChange >= 0 ? '+' : ''}{stock.priceChange.toFixed(2)}%
          </div>
        </div>
      </div>
    </div>
  );
}

function SwingPanel({ swing, type }: { swing: SwingData; type: 'growth' | 'risk' }) {
  const accent = type === 'growth' ? 'emerald' : 'red';
  const rsiColor = swing.rsi < 35 ? 'text-emerald-500' : swing.rsi > 70 ? 'text-red-500' : 'text-amber-500';
  const macdColor = swing.macdSignal === 'BULLISH' ? 'text-emerald-500' : swing.macdSignal === 'BEARISH' ? 'text-red-500' : 'text-amber-500';
  const rrColor = swing.riskRewardRatio >= 2 ? 'text-emerald-500' : swing.riskRewardRatio >= 1 ? 'text-amber-500' : 'text-red-500';

  return (
    <div className={`mt-2 rounded-lg border border-${accent}-500/15 bg-${accent}-500/[0.03] p-2 space-y-2`}
      style={{
        borderLeft: `2px solid ${type === 'growth' ? 'rgb(16, 185, 129)' : 'rgb(239, 68, 68)'}`,
        background: type === 'growth' ? 'rgba(16, 185, 129, 0.03)' : 'rgba(239, 68, 68, 0.03)',
      }}>
      {/* Header: Swing Score + Indicators */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Activity className={`w-3 h-3 text-${accent}-500`} style={{ color: type === 'growth' ? 'rgb(16, 185, 129)' : 'rgb(239, 68, 68)' }} />
          <span className="text-[10px] font-bold text-foreground">Swing Trading</span>
          <Badge className={`text-[8px] px-1 py-0 ${swing.swingScore >= 60 ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' : swing.swingScore >= 45 ? 'bg-amber-500/15 text-amber-500 border-amber-500/30' : 'bg-red-500/15 text-red-500 border-red-500/30'}`}>
            {swing.swingScore}/100
          </Badge>
          {swing.confluenceCount >= 3 && (
            <Badge className="text-[7px] px-1 py-0 bg-blue-500/15 text-blue-400 border-blue-500/30">
              {swing.confluenceCount}/8 confluence
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[9px]">
          <span className={rsiColor}>RSI {swing.rsi.toFixed(0)}</span>
          <span className={macdColor}>{swing.macdSignal}</span>
          <span className="text-muted-foreground">ATR {swing.atrPercent.toFixed(1)}%</span>
          <Badge className="text-[7px] px-1 py-0 bg-purple-500/10 text-purple-400 border-purple-500/20">
            {swing.regime === 'TRENDING_UP' ? 'Trend↑' : swing.regime === 'TRENDING_DOWN' ? 'Trend↓' : swing.regime === 'VOLATILE' ? 'Volatil' : 'Range'}
          </Badge>
        </div>
      </div>

      {/* Entry / Stop / Target Row */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className="bg-background/50 rounded p-1.5 text-center">
          <p className="text-[8px] text-muted-foreground flex items-center justify-center gap-0.5">
            <Crosshair className="w-2 h-2" /> Entry
          </p>
          <p className="text-[11px] font-bold text-foreground">${swing.entryPrice.toFixed(2)}</p>
        </div>
        <div className="bg-background/50 rounded p-1.5 text-center">
          <p className="text-[8px] text-red-400 flex items-center justify-center gap-0.5">
            <ShieldAlert className="w-2 h-2" /> Stop Loss
          </p>
          <p className="text-[11px] font-bold text-red-500">${swing.stopLoss.toFixed(2)}</p>
        </div>
        <div className="bg-background/50 rounded p-1.5 text-center">
          <p className="text-[8px] text-emerald-400 flex items-center justify-center gap-0.5">
            <Target className="w-2 h-2" /> Target
          </p>
          <p className="text-[11px] font-bold text-emerald-500">${swing.swingTarget.toFixed(2)}</p>
        </div>
      </div>

      {/* Risk/Reward + Support/Resistance */}
      <div className="flex items-center justify-between text-[9px]">
        <span className="text-muted-foreground">
          R:R <span className={`font-bold ${rrColor}`}>{swing.riskRewardRatio.toFixed(1)}:1</span>
        </span>
        <span className="text-muted-foreground">
          S: <span className="text-blue-400">${swing.supportLevel.toFixed(2)}</span>
          {' | '}
          R: <span className="text-orange-400">${swing.resistanceLevel.toFixed(2)}</span>
        </span>
      </div>

      {/* Swing Reasons (compact) */}
      {swing.swingReasons.length > 0 && (
        <div className="space-y-0.5">
          {swing.swingReasons.slice(0, 3).map((r, i) => (
            <p key={i} className="text-[9px] text-muted-foreground leading-relaxed">
              {type === 'growth' ? <span className="text-emerald-500">+</span> : <span className="text-red-500">!</span>} {r}
            </p>
          ))}
        </div>
      )}

      {/* Warnings */}
      {swing.warningFlags.length > 0 && (
        <div className="space-y-0.5">
          {swing.warningFlags.slice(0, 2).map((w, i) => (
            <p key={i} className="text-[9px] text-amber-500/80 leading-relaxed">
              <AlertTriangle className="w-2 h-2 inline mr-0.5" /> {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function GrowthCard({ stock, index }: { stock: MoverStock; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={`border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 hover:from-emerald-500/10 hover:to-teal-500/10 transition-all duration-300 overflow-hidden`}>
      <CardContent className="pt-3.5 pb-3 px-3.5">
        <StockHeader stock={stock} index={index} color="green" />

        {/* Score Bar */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[9px] text-muted-foreground">Potencial Rritjeje</span>
            <span className="text-[10px] font-bold text-emerald-500">{stock.score}/100</span>
          </div>
          <ScoreBar score={stock.score} type="growth" />
        </div>

        {/* Key Metrics Grid — clickable */}
        <div className="grid grid-cols-4 gap-1.5 mb-2">
          <MetricCell
            label="Upside"
            value={stock.upside > 0 ? `+${stock.upside}%` : stock.upside < 0 ? `${stock.upside}%` : 'N/A'}
            metricKey="upside"
            colorClass={stock.upside > 0 ? 'text-emerald-500 font-bold' : stock.upside < 0 ? 'text-red-500 font-bold' : 'text-muted-foreground'}
          />
          <MetricCell
            label="Rev Gr"
            value={stock.revGrowth}
            metricKey="revGrowth"
            colorClass={parseFloat(stock.revGrowth) < 0 ? 'text-red-500' : ''}
          />
          <MetricCell
            label="EPS Gr"
            value={stock.epsGrowth}
            metricKey="epsGrowth"
            colorClass={parseFloat(stock.epsGrowth) < 0 ? 'text-red-500' : ''}
          />
          <MetricCell
            label="PEG"
            value={String(stock.peg)}
            metricKey="peg"
          />
        </div>

        {/* Target */}
        <div className="flex items-center justify-between text-[10px] bg-emerald-500/5 rounded p-1.5 border border-emerald-500/10">
          <span className="text-muted-foreground">Objektivi analistëve</span>
          <span className="font-semibold text-emerald-500">{stock.targetPrice}</span>
          <span className="text-muted-foreground">{stock.lowTarget} — {stock.highTarget}</span>
        </div>

        {/* Swing Trading Panel */}
        {stock.swing && <SwingPanel swing={stock.swing} type="growth" />}

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
        <StockHeader stock={stock} index={index} color="red" />

        {/* Score Bar */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[9px] text-muted-foreground">Rreziku i Renies</span>
            <span className="text-[10px] font-bold text-red-500">{stock.score}/100</span>
          </div>
          <ScoreBar score={stock.score} type="risk" />
        </div>

        {/* Key Metrics Grid — clickable */}
        <div className="grid grid-cols-4 gap-1.5 mb-2">
          <MetricCell
            label="Upside"
            value={stock.upside > 0 ? `+${stock.upside}%` : stock.upside < 0 ? `${stock.upside}%` : 'N/A'}
            metricKey="upside"
            colorClass={`font-bold ${stock.upside > 0 ? 'text-emerald-500' : stock.upside < 0 ? 'text-red-500' : 'text-muted-foreground'}`}
          />
          <MetricCell
            label="Rev Gr"
            value={stock.revGrowth}
            metricKey="revGrowth"
            colorClass={parseFloat(stock.revGrowth) < 0 ? 'text-red-500' : ''}
          />
          <MetricCell
            label="EPS Gr"
            value={stock.epsGrowth}
            metricKey="epsGrowth"
            colorClass={parseFloat(stock.epsGrowth) < 0 ? 'text-red-500' : ''}
          />
          <MetricCell
            label="P/E"
            value={`${stock.pe}x`}
            metricKey="peg"
          />
        </div>

        {/* Target Range */}
        <div className="flex items-center justify-between text-[10px] bg-red-500/5 rounded p-1.5 border border-red-500/10">
          <span className="text-muted-foreground">Objektivi analistëve</span>
          <span className="font-semibold">{stock.targetPrice}</span>
          <span className="text-muted-foreground">{stock.lowTarget} — {stock.highTarget}</span>
        </div>

        {/* Swing Trading Panel */}
        {stock.swing && <SwingPanel swing={stock.swing} type="risk" />}

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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4 text-emerald-500" />
            <span className="text-xs text-muted-foreground">
              {data.totalAnalyzed} stoke te analizuar
            </span>
          </div>
          {data.fundCount !== undefined && (
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${data.fundCount > data.totalAnalyzed / 2 ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span className="text-[10px] text-muted-foreground">
                {data.fundCount}/{data.totalFetched || data.totalAnalyzed} me te dhena reale nga Yahoo Finance
              </span>
            </div>
          )}
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
            Swing trading: teknike reale (RSI, MACD, Bollinger, SMA/EMA, ATR) + fundamente + konsensus analistesh
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
            Aksionet me rrezikun me te larte per renie: teknike bearish, fundamente te dobta, vleresim i larte, borxh te larte
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
            Kjo analizë përdor teknike reale (RSI, MACD, Bollinger Bands, SMA/EMA, ATR) + 10 faktorë fundamentalë + konsensusin e analistëve.
            Swing scoring llogaritet nga 3 muaj të dhëna historike. Çmimet e Entry/Stop/Target janë sugjerime, jo këshillë financiare.
          </p>
        </div>
      </div>
    </div>
  );
}
