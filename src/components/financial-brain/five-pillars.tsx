'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Flame,
  RefreshCw,
  Volume2,
  Coins,
  DollarSign,
  CandlestickChart,
  TrendingUp,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Trophy,
  Star,
  Zap,
  ArrowUpRight,
  BarChart3,
  Info,
  Wifi,
  WifiOff,
  AlertTriangle,
  Shield,
  ChevronDown,
  ChevronUp,
  Filter,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────

interface PillarResult {
  passed: boolean;
  value: number;
  threshold: string;
  detail: string;
}

interface FivePillarsStock {
  ticker: string;
  company: string;
  sector: string;
  currentPrice: number;
  priceChange: number;
  pillarsPassed: number;
  pillar1_relVolume: PillarResult;
  pillar2_float: PillarResult;
  pillar3_priceRange: PillarResult;
  pillar4_greenCandle: PillarResult;
  pillar5_gapUp: PillarResult;
  overallGrade: string;
  momentumScore: number;
  reasons: string[];
  warnings: string[];
}

interface PillarSummary {
  totalAnalyzed: number;
  withResults: number;
  perfect: number;
  strong: number;
  good: number;
  limited: number;
  none: number;
  pillar1PassRate: number;
  pillar2PassRate: number;
  pillar3PassRate: number;
  pillar4PassRate: number;
  pillar5PassRate: number;
}

// ─── Constants ──────────────────────────────────────────────

const PILLAR_META = [
  { key: 'pillar1_relVolume', label: 'Rel Volume', icon: Volume2, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  { key: 'pillar2_float', label: 'Low Float', icon: Coins, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  { key: 'pillar3_priceRange', label: 'Price Range', icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  { key: 'pillar4_greenCandle', label: 'Green Candle', icon: CandlestickChart, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30' },
  { key: 'pillar5_gapUp', label: 'Gap Up', icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
] as const;

type FilterGrade = 'ALL' | 'PERFECT' | 'STRONG' | 'GOOD' | 'LIMITED' | 'NONE';

const GRADE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; emoji: string }> = {
  PERFECT: { label: '5/5 Setup i Plotë', color: 'text-yellow-300', bg: 'bg-yellow-500/15', border: 'border-yellow-500/40', emoji: '👑' },
  STRONG: { label: '4/5 i Fortë', color: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', emoji: '🔥' },
  GOOD: { label: '3/5 i Mirë', color: 'text-blue-300', bg: 'bg-blue-500/15', border: 'border-blue-500/40', emoji: '✓' },
  LIMITED: { label: '2/5 i Limituar', color: 'text-orange-300', bg: 'bg-orange-500/15', border: 'border-orange-500/40', emoji: '⚠' },
  NONE: { label: '0-1/5 Asnje Setup', color: 'text-red-300', bg: 'bg-red-500/15', border: 'border-red-500/40', emoji: '✗' },
};

// ─── Component ──────────────────────────────────────────────

export function FivePillars() {
  const [stocks, setStocks] = useState<FivePillarsStock[]>([]);
  const [summary, setSummary] = useState<PillarSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [filterGrade, setFilterGrade] = useState<FilterGrade>('ALL');
  const [showAll, setShowAll] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/five-pillars');
      if (!res.ok) throw new Error('Gabim');
      const data = await res.json();
      setStocks(data.stocks || []);
      setSummary(data.summary || null);
      setCached(data.cached || false);
    } catch {
      setError('Nuk u arrit të ngarkoheshin të dhënat');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredStocks = stocks.filter(s => {
    if (filterGrade === 'ALL') return true;
    return s.overallGrade === filterGrade;
  });

  const displayStocks = showAll ? filteredStocks : filteredStocks.slice(0, 15);

  // ─── Pillar Icon ───
  function PillarBadge({ passed, meta }: { passed: boolean; meta: typeof PILLAR_META[number] }) {
    const Icon = meta.icon;
    return (
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs ${passed ? meta.bg + ' ' + meta.border + ' border' : 'bg-muted/30 border border-border/50 opacity-50'}`}>
        {passed
          ? <CheckCircle2 className={`w-3.5 h-3.5 ${meta.color}`} />
          : <XCircle className="w-3.5 h-3.5 text-muted-foreground/50" />
        }
        <span className={passed ? meta.color : 'text-muted-foreground/60'}>{meta.label}</span>
      </div>
    );
  }

  // ─── Stock Card ───
  function StockRow({ stock }: { stock: FivePillarsStock }) {
    const isExpanded = expandedTicker === stock.ticker;
    const grade = GRADE_CONFIG[stock.overallGrade] || GRADE_CONFIG.NONE;
    const isPositive = stock.priceChange >= 0;

    const pillars: Array<{ p: PillarResult; meta: typeof PILLAR_META[number] }> = [
      { p: stock.pillar1_relVolume, meta: PILLAR_META[0] },
      { p: stock.pillar2_float, meta: PILLAR_META[1] },
      { p: stock.pillar3_priceRange, meta: PILLAR_META[2] },
      { p: stock.pillar4_greenCandle, meta: PILLAR_META[3] },
      { p: stock.pillar5_gapUp, meta: PILLAR_META[4] },
    ];

    return (
      <Card className={`${isExpanded ? grade.border : 'border-border/50'} ${isExpanded ? grade.bg : 'bg-card/50'} transition-all duration-200 hover:border-border/80`}>
        <CardContent className="p-3 sm:p-4">
          {/* Header Row */}
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => setExpandedTicker(isExpanded ? null : stock.ticker)}
          >
            {/* Ticker & Company */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-foreground">{stock.ticker}</span>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${grade.color} ${grade.border} border`}>
                  {stock.pillarsPassed}/5 {grade.emoji}
                </Badge>
                <Badge
                  className={`text-[10px] px-1.5 py-0 ${isPositive ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-red-500/15 text-red-400 border-red-500/30'}`}
                  variant="outline"
                >
                  {isPositive ? '+' : ''}{stock.priceChange.toFixed(2)}%
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground truncate">{stock.company}</span>
                <span className="text-[10px] text-muted-foreground/60">{stock.sector}</span>
              </div>
            </div>

            {/* Price & Momentum */}
            <div className="text-right flex-shrink-0">
              <div className="font-semibold text-sm">${stock.currentPrice.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground">Momentum: {stock.momentumScore}</div>
            </div>

            {/* Expand Icon */}
            <div className="flex-shrink-0 ml-1">
              {isExpanded
                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground" />
              }
            </div>
          </div>

          {/* Pillar Badges Row */}
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {pillars.map(({ p, meta }) => (
              <PillarBadge key={meta.key} passed={p.passed} meta={meta} />
            ))}
          </div>

          {/* Expanded Details */}
          {isExpanded && (
            <div className="mt-4 space-y-3 border-t border-border/50 pt-3">
              {/* Grade Banner */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${grade.bg} border ${grade.border}`}>
                <span className="text-lg">{grade.emoji}</span>
                <div>
                  <div className={`text-sm font-semibold ${grade.color}`}>{grade.label}</div>
                  <div className="text-xs text-muted-foreground">Momentum Score: {stock.momentumScore}/100</div>
                </div>
              </div>

              {/* Individual Pillar Details */}
              <div className="space-y-2">
                {pillars.map(({ p, meta }) => {
                  const Icon = meta.icon;
                  return (
                    <div key={meta.key} className={`flex items-start gap-2.5 p-2 rounded-md ${p.passed ? meta.bg : 'bg-muted/20'}`}>
                      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${p.passed ? meta.color : 'text-muted-foreground/40'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{meta.label}</span>
                          <span className="text-[10px] text-muted-foreground">Kufiri: {p.threshold}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{p.detail}</p>
                      </div>
                      <div className="flex-shrink-0">
                        {p.passed
                          ? <CheckCircle2 className={`w-4 h-4 ${meta.color}`} />
                          : <XCircle className="w-4 h-4 text-muted-foreground/40" />
                        }
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reasons & Warnings */}
              {stock.reasons.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Sinjale Pozitive
                  </div>
                  {stock.reasons.map((r, i) => (
                    <div key={i} className="text-xs text-muted-foreground pl-4 flex items-start gap-1.5">
                      <ArrowUpRight className="w-3 h-3 text-emerald-500/60 mt-0.5 flex-shrink-0" />
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              )}

              {stock.warnings.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Shënime
                  </div>
                  {stock.warnings.map((w, i) => (
                    <div key={i} className="text-xs text-muted-foreground pl-4 flex items-start gap-1.5">
                      <MinusCircle className="w-3 h-3 text-amber-500/60 mt-0.5 flex-shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ─── Loading State ───
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }

  // ─── Error State ───
  if (error) {
    return (
      <Card className="border-red-500/20 bg-red-500/5">
        <CardContent className="pt-6 pb-6 text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-400">{error}</p>
        </CardContent>
      </Card>
    );
  }

  // ─── Main Content ───
  const pillarStats = summary ? [
    { label: 'Rel Volume ≥5x', passRate: summary.pillar1PassRate, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Float <100M', passRate: summary.pillar2PassRate, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Price $2-$50', passRate: summary.pillar3PassRate, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Green Candle', passRate: summary.pillar4PassRate, color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: 'Gap Up ≥2%', passRate: summary.pillar5PassRate, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  ] : [];

  const gradeFilterOptions: Array<{ key: FilterGrade; label: string; count: number }> = [
    { key: 'ALL', label: 'Të Gjitha', count: filteredStocks.length },
    { key: 'PERFECT', label: '👑 5/5', count: stocks.filter(s => s.overallGrade === 'PERFECT').length },
    { key: 'STRONG', label: '🔥 4/5', count: stocks.filter(s => s.overallGrade === 'STRONG').length },
    { key: 'GOOD', label: '✓ 3/5', count: stocks.filter(s => s.overallGrade === 'GOOD').length },
    { key: 'LIMITED', label: '⚠ 2/5', count: stocks.filter(s => s.overallGrade === 'LIMITED').length },
    { key: 'NONE', label: '✗ 0-1', count: stocks.filter(s => s.overallGrade === 'NONE').length },
  ];

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {pillarStats.map((ps, i) => (
            <div key={i} className={`${ps.bg} border border-border/50 rounded-lg p-2.5 text-center`}>
              <div className="text-[10px] text-muted-foreground mb-1">{ps.label}</div>
              <div className={`text-sm font-bold ${ps.color}`}>{ps.passRate.toFixed(0)}%</div>
              <div className="text-[10px] text-muted-foreground">kalojnė</div>
            </div>
          ))}
        </div>
      )}

      {/* Grade Distribution */}
      {summary && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Rezultatet:</span>
          {summary.perfect > 0 && (
            <Badge className="bg-yellow-500/15 text-yellow-300 border-yellow-500/30 border text-[10px]">
              👑 {summary.perfect} Perfect
            </Badge>
          )}
          {summary.strong > 0 && (
            <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 border text-[10px]">
              🔥 {summary.strong} të Forta
            </Badge>
          )}
          {summary.good > 0 && (
            <Badge className="bg-blue-500/15 text-blue-300 border-blue-500/30 border text-[10px]">
              ✓ {summary.good} të Mira
            </Badge>
          )}
          <Badge className="bg-muted/30 text-muted-foreground border border-border/50 text-[10px]">
            {summary.totalAnalyzed} analizuara
          </Badge>
        </div>
      )}

      {/* Filter Buttons */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        {gradeFilterOptions.filter(o => o.key === 'ALL' || o.count > 0).map(opt => (
          <button
            key={opt.key}
            onClick={() => { setFilterGrade(opt.key); setShowAll(false); }}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors border ${
              filterGrade === opt.key
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/50'
            }`}
          >
            {opt.label} ({opt.count})
          </button>
        ))}
      </div>

      {/* Stock List */}
      <div className="space-y-2">
        {displayStocks.length === 0 ? (
          <Card className="border-border/50">
            <CardContent className="pt-6 pb-6 text-center">
              <Flame className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {filterGrade === 'ALL'
                  ? 'Asnjë aksion nuk kaloi filtërim — tregu është i qetë'
                  : `Asnjë aksion me grade "${filterGrade}"`}
              </p>
            </CardContent>
          </Card>
        ) : (
          displayStocks.map(stock => <StockRow key={stock.ticker} stock={stock} />)
        )}
      </div>

      {/* Show More / Refresh */}
      <div className="flex items-center justify-between">
        {filteredStocks.length > 15 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1"
          >
            {showAll ? 'Shfaq më pak' : `Shfaq të gjitha (${filteredStocks.length})`}
            <ChevronDown className={`w-3 h-3 transition-transform ${showAll ? 'rotate-180' : ''}`} />
          </button>
        )}
        <button
          onClick={fetchData}
          disabled={loading}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 ml-auto"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Rifresko
          {cached && <span className="text-[10px] text-muted-foreground/60">(cached)</span>}
        </button>
      </div>

      {/* Info Footer */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="pt-3 pb-3">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="text-[11px] text-muted-foreground space-y-1">
              <p>
                <strong className="text-amber-400">Ross Cameron 5 Pillars</strong> — Metodologjia e Warrior Trading për identifikimin e aksioneve me momentum të lartë për day trading.
              </p>
              <p>
                5 Pillarët: <strong>Rel Volume ≥5x</strong> (volumi eksplodiv), <strong>Float i ulët</strong> (levizje e shpejtë), <strong>Çmimi në zonë</strong> ($2-$50), <strong>Green Candle</strong> (sinjal bull), <strong>Gap Up</strong> (gap para hapjes).
              </p>
              <p className="text-amber-400/70">
                ⚠ Ky skaner përdor çmime live dhe histori 3 mujore. Nuk është këshillë financiare — përdor vetëm për arsim.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
