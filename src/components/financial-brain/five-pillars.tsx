'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Flame,
  RefreshCw,
  Volume2,
  TrendingUp,
  DollarSign,
  Coins,
  Newspaper,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Zap,
  ArrowUpRight,
  Info,
  AlertTriangle,
  Shield,
  ChevronDown,
  ChevronUp,
  Filter,
  BarChart3,
  AlertCircle,
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
  automatedPassed: number;
  pillar1_relVolume: PillarResult;
  pillar2_dailyChange: PillarResult;
  pillar3_catalyst: PillarResult;
  pillar4_priceRange: PillarResult;
  pillar5_float: PillarResult;
  overallGrade: string;
  momentumScore: number;
  reasons: string[];
  warnings: string[];
  strongMomentum: boolean;
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

// CORRECT Ross Cameron 5 Pillars
const PILLAR_META = [
  { key: 'pillar1_relVolume', label: 'Rel Vol ≥5x', icon: Volume2, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', desc: 'Volumi aktual vs 30-ditore' },
  { key: 'pillar2_dailyChange', label: 'Change ≥10%', icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', desc: 'Momentum ditor i konfirmuar' },
  { key: 'pillar3_catalyst', label: 'Catalyst', icon: Newspaper, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', desc: '≥15% = ka gjasë lajmi (manual)' },
  { key: 'pillar4_priceRange', label: 'Price $1-20', icon: DollarSign, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30', desc: 'Zona optimale day trading' },
  { key: 'pillar5_float', label: 'Float <10M', icon: Coins, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', desc: 'Supply/demand imbalance' },
] as const;

type FilterGrade = 'ALL' | 'PERFECT' | 'STRONG' | 'GOOD' | 'LIMITED' | 'NONE';

const GRADE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; emoji: string }> = {
  PERFECT: { label: '5/5 — Setup i Plotë (GO!)', color: 'text-yellow-300', bg: 'bg-yellow-500/15', border: 'border-yellow-500/40', emoji: '👑' },
  STRONG: { label: '4/5 automated + manual check', color: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', emoji: '✅' },
  GOOD: { label: '3/5 — Setup i Mirë', color: 'text-blue-300', bg: 'bg-blue-500/15', border: 'border-blue-500/40', emoji: '📈' },
  LIMITED: { label: '2/5 — Potencial i Limituar', color: 'text-orange-300', bg: 'bg-orange-500/15', border: 'border-orange-500/40', emoji: '⚠' },
  NONE: { label: '0-1/5 — Asnjë Setup', color: 'text-red-300', bg: 'bg-red-500/15', border: 'border-red-500/40', emoji: '✗' },
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

  const displayStocks = showAll ? filteredStocks : filteredStocks.slice(0, 20);

  // ─── Pillar Badge ───
  function PillarBadge({ pillar, meta }: { pillar: PillarResult; meta: typeof PILLAR_META[number] }) {
    const Icon = meta.icon;
    return (
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs ${pillar.passed ? meta.bg + ' ' + meta.border + ' border' : 'bg-muted/30 border border-border/50 opacity-50'}`}>
        {pillar.passed
          ? <CheckCircle2 className={`w-3.5 h-3.5 ${meta.color}`} />
          : <XCircle className="w-3.5 h-3.5 text-muted-foreground/50" />
        }
        <span className={pillar.passed ? meta.color : 'text-muted-foreground/60'}>{meta.label}</span>
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
      { p: stock.pillar2_dailyChange, meta: PILLAR_META[1] },
      { p: stock.pillar3_catalyst, meta: PILLAR_META[2] },
      { p: stock.pillar4_priceRange, meta: PILLAR_META[3] },
      { p: stock.pillar5_float, meta: PILLAR_META[4] },
    ];

    // GREEN BACKGROUND for PERFECT or STRONG
    const isGreenBg = stock.overallGrade === 'PERFECT' || stock.overallGrade === 'STRONG';

    return (
      <Card className={`${isGreenBg ? 'border-emerald-500/50 bg-emerald-500/8' : isExpanded ? grade.border : 'border-border/50'} ${isExpanded ? grade.bg : 'bg-card/50'} transition-all duration-200 hover:border-border/80`}>
        <CardContent className="p-3 sm:p-4">
          {/* Header Row */}
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => setExpandedTicker(isExpanded ? null : stock.ticker)}
          >
            {/* Ticker & Company */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm text-foreground">{stock.ticker}</span>
                {stock.strongMomentum && (
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30 border text-[10px] animate-pulse">
                    🔥 STRONG
                  </Badge>
                )}
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${grade.color} ${grade.border} border`}>
                  {stock.automatedPassed}/4 {grade.emoji}
                </Badge>
                <Badge
                  className={`text-[10px] px-1.5 py-0 font-semibold ${isPositive ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-red-500/15 text-red-400 border-red-500/30'}`}
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
              <div className="text-[10px] text-muted-foreground">Score: {stock.momentumScore}/100</div>
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
              <PillarBadge key={meta.key} pillar={p} meta={meta} />
            ))}
          </div>

          {/* Expanded Details */}
          {isExpanded && (
            <div className="mt-4 space-y-3 border-t border-border/50 pt-3">
              {/* Grade Banner */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isGreenBg ? 'bg-emerald-500/15 border-emerald-500/30 border' : grade.bg + ' border ' + grade.border}`}>
                <span className="text-lg">{grade.emoji}</span>
                <div className="flex-1">
                  <div className={`text-sm font-semibold ${isGreenBg ? 'text-emerald-300' : grade.color}`}>{grade.label}</div>
                  <div className="text-xs text-muted-foreground">
                    Momentum: {stock.momentumScore}/100
                    {stock.strongMomentum && ' • 🔥 Strong Momentum ≥15% — VERIFIKO LAJMIN'}
                  </div>
                </div>
              </div>

              {/* Individual Pillar Details */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground mb-2">ROSS CAMERON 5 PILLARS — Detaje</div>
                {pillars.map(({ p, meta }, idx) => {
                  const Icon = meta.icon;
                  return (
                    <div key={meta.key} className={`flex items-start gap-2.5 p-2 rounded-md ${p.passed ? meta.bg : 'bg-muted/20'}`}>
                      <div className="flex-shrink-0 mt-0.5">
                        <Icon className={`w-4 h-4 ${p.passed ? meta.color : 'text-muted-foreground/40'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{idx + 1}. {meta.label}</span>
                          <span className="text-[10px] text-muted-foreground">({meta.desc})</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{p.detail}</p>
                        <div className="text-[10px] text-muted-foreground/60 mt-0.5">Kufiri: {p.threshold}</div>
                      </div>
                      <div className="flex-shrink-0 mt-0.5">
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
                    <AlertTriangle className="w-3 h-3" /> Shënime / Warnings
                  </div>
                  {stock.warnings.map((w, i) => (
                    <div key={i} className="text-xs text-muted-foreground pl-4 flex items-start gap-1.5">
                      <MinusCircle className="w-3 h-3 text-amber-500/60 mt-0.5 flex-shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Strategy Guide */}
              <div className="bg-muted/20 rounded-md p-2.5 space-y-1.5">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Strategitë e Ross Cameron</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  <div className="text-[10px] text-muted-foreground flex items-start gap-1">
                    <span className="text-emerald-400">•</span>
                    <span><strong>Gap and Go:</strong> Gap up 10%+ on news, enter above gap high</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-start gap-1">
                    <span className="text-emerald-400">•</span>
                    <span><strong>VWAP Bounce:</strong> Pullback to VWAP, enter on bounce</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-start gap-1">
                    <span className="text-emerald-400">•</span>
                    <span><strong>HOD Breakout:</strong> New high of day with volume surge</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-start gap-1">
                    <span className="text-emerald-400">•</span>
                    <span><strong>ABCD Pattern:</strong> Classic reversal, enter at D-point</span>
                  </div>
                </div>
              </div>
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
          <button onClick={fetchData} className="mt-2 text-xs text-red-400 underline hover:text-red-300">Provo përsëri</button>
        </CardContent>
      </Card>
    );
  }

  // ─── Main Content ───
  const pillarStats = summary ? [
    { label: 'Rel Volume ≥5x', passRate: summary.pillar1PassRate, color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Volume2 },
    { label: 'Change ≥10%', passRate: summary.pillar2PassRate, color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: TrendingUp },
    { label: 'Catalyst ≥15%', passRate: summary.pillar3PassRate, color: 'text-orange-400', bg: 'bg-orange-500/10', icon: Newspaper },
    { label: 'Price $1-20', passRate: summary.pillar4PassRate, color: 'text-purple-400', bg: 'bg-purple-500/10', icon: DollarSign },
    { label: 'Float <10M', passRate: summary.pillar5PassRate, color: 'text-amber-400', bg: 'bg-amber-500/10', icon: Coins },
  ] : [];

  const gradeFilterOptions: Array<{ key: FilterGrade; label: string; count: number }> = [
    { key: 'ALL', label: 'Të Gjitha', count: filteredStocks.length },
    { key: 'PERFECT', label: '👑 5/5', count: stocks.filter(s => s.overallGrade === 'PERFECT').length },
    { key: 'STRONG', label: '✅ 4/5', count: stocks.filter(s => s.overallGrade === 'STRONG').length },
    { key: 'GOOD', label: '📈 3/5', count: stocks.filter(s => s.overallGrade === 'GOOD').length },
    { key: 'LIMITED', label: '⚠ 2/5', count: stocks.filter(s => s.overallGrade === 'LIMITED').length },
    { key: 'NONE', label: '✗ 0-1', count: stocks.filter(s => s.overallGrade === 'NONE').length },
  ];

  const strongCount = stocks.filter(s => s.strongMomentum).length;

  return (
    <div className="space-y-4">
      {/* Summary Bar - 5 Pillar Stats */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {pillarStats.map((ps, i) => (
            <div key={i} className={`${ps.bg} border border-border/50 rounded-lg p-2.5 text-center`}>
              <div className={`text-sm font-bold ${ps.color}`}>{ps.passRate.toFixed(0)}%</div>
              <div className="text-[10px] text-muted-foreground">{ps.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Grade Distribution & Strong Momentum */}
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
              ✅ {summary.strong} të Forta
            </Badge>
          )}
          {summary.good > 0 && (
            <Badge className="bg-blue-500/15 text-blue-300 border-blue-500/30 border text-[10px]">
              📈 {summary.good} të Mira
            </Badge>
          )}
          {strongCount > 0 && (
            <Badge className="bg-red-500/15 text-red-400 border-red-500/30 border text-[10px] animate-pulse">
              🔥 {strongCount} Strong Momentum
            </Badge>
          )}
          <Badge className="bg-muted/30 text-muted-foreground border border-border/50 text-[10px]">
            {summary.totalAnalyzed} analizuara
          </Badge>
        </div>
      )}

      {/* Interpretation Guide — Green / Red explanation */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2.5">
          <div className="text-xs font-semibold text-emerald-400 mb-1">✅ GREEN BG = GO!</div>
          <div className="text-[10px] text-muted-foreground">Të gjitha automated pillars kalojnë. Verifiko lajmin (Pillar 3) para tregtimit.</div>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5">
          <div className="text-xs font-semibold text-red-400 mb-1">❌ NO GREEN = WAIT</div>
          <div className="text-[10px] text-muted-foreground">Së paku një pillar dështoi. Kontrolloni cilat mungojnë.</div>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-2.5">
          <div className="text-xs font-semibold text-orange-400 mb-1">🔥 FLAME = HIGH PRIORITY</div>
          <div className="text-[10px] text-muted-foreground">≥15% momentum — ka gjasë lajmi. Kërkoni lajmin menjëherë!</div>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        {gradeFilterOptions.filter(o => o.key === 'ALL' || o.count > 0).map(opt => (
          <button
            key={opt.key}
            onClick={() => { setFilterGrade(opt.key); setShowAll(false); }}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors border ${
              filterGrade === opt.key
                ? 'bg-amber-600 text-white border-amber-600'
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
                  ? 'Asnjë aksion nuk kaloi filtërim — tregu është i qetë sot'
                  : `Asnjë aksion me grade "${filterGrade}"`}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Ross Cameron kërkon: RelVol 5x+, Change 10%+, Price $1-20, Float 10M or less
              </p>
            </CardContent>
          </Card>
        ) : (
          displayStocks.map(stock => <StockRow key={stock.ticker} stock={stock} />)
        )}
      </div>

      {/* Show More / Refresh */}
      <div className="flex items-center justify-between">
        {filteredStocks.length > 20 && (
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

      {/* Info Footer — Ross Cameron Methodology */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="pt-3 pb-3">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="text-[11px] text-muted-foreground space-y-1.5">
              <p>
                <strong className="text-amber-400">Ross Cameron 5 Pillars — Warrior Trading</strong>
              </p>
              <p>
                <strong>1. Rel Volume ≥5x</strong> (volumi eksplodiv) •
                <strong>2. Daily Change ≥10%</strong> (momentum i konfirmuar) •
                <strong>3. News Catalyst</strong> (manual — flagojmë ≥15%) •
                <strong>4. Price $1-$20</strong> (zona optimale) •
                <strong>5. Float 10M or less</strong> (supply/demand imbalance)
              </p>
              <p className="text-muted-foreground/70">
                Skanon {summary?.totalAnalyzed || 0}+ aksione (main watchlist + low-cap momentum). 4 prej 5 pillarësh janë të automatizuara; Pillar 3 (Catalyst) kërkon verifikim manual të lajmit.
              </p>
              <p className="text-amber-400/70">
                ⚠ DAY TRADING ËSHTË I RREZIKSHËM — Shumica e day traderëve humbasin para. Përdor vetëm për arsim. Nuk është këshillë financiare.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
