'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TrendingUp,
  RefreshCw,
  Clock,
  Shield,
  Lightbulb,
  AlertTriangle,
  Zap,
  ChevronDown,
  ChevronUp,
  Info,
  BarChart3,
  ArrowRightLeft,
  Layers,
  DollarSign,
  Trophy,
  Target,
  Activity,
} from 'lucide-react';

// ── Types ──
interface TopStockCard {
  symbol: string;
  company?: string;
  sector: string;
  horizonDays: 1 | 3 | 7;
  finalDecision: 'BUY';
  rawScore: number;
  hybridConfidence: number;
  displayRankScore: number;
  regime: string;
  regimeConfidence?: number;
  transitionRisk?: number;
  trendQualityScore: number;
  sectorStrengthScore: number;
  timeframeAlignmentScore: number;
  timeframeAlignmentStatus: string;
  peadScore: number;
  peadSignal: string;
  peadDriftActive: boolean;
  peadDaysSince: number | null;
  peadSurprisePct: number | null;
  universeRankScore: number;
  universePercentile: number;
  isTopDecile: boolean;
  isTopQuintile: boolean;
  momentumRegime: string;
  tradabilityScore: number;
  isTradeable: boolean;
  tradabilityRecommendation: string;
  estSlippageBps: number;
  analystRevisionScore: number;
  analystRevisionTrend: string;
  activeRegimeThresholds?: {
    confidenceFloor: number;
    trendQualityFloor: number;
    sectorStrengthFloor: number;
    tradabilityFloor: number;
  };
  topReasons: string[];
  riskFlags: string[];
  updatedAt: string;
}

interface TopStocksResponse {
  generatedAt: string;
  modelVersion: string;
  topStocks: TopStockCard[];
  totalScanned: number;
  filteredOut: number;
  activeRegime?: string;
  regimeThresholdsApplied?: Record<string, number>;
  message?: string;
}

// ── Horizon badge colors ──
const HORIZON_STYLE: Record<number, { bg: string; text: string; label: string }> = {
  1: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: '1D' },
  3: { bg: 'bg-violet-500/15', text: 'text-violet-400', label: '3D' },
  7: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: '7D' },
};

// ── Score color helper ──
function scoreColor(v: number, good = 40, great = 70): string {
  if (v >= great) return 'text-emerald-400';
  if (v >= good) return 'text-amber-400';
  return 'text-red-400';
}

function scoreBg(v: number, good = 40, great = 70): string {
  if (v >= great) return 'bg-emerald-500/10';
  if (v >= good) return 'bg-amber-500/10';
  return 'bg-red-500/10';
}

// ── Badge sizes (all bumped for readability) ──
const BADGE_XS = 'text-[12px] px-2.5 py-0.5 font-semibold';
const BADGE_SM = 'text-[12px] px-2.5 py-0.5 font-semibold';

// ── Alignment status badge ──
function AlignmentBadge({ status }: { status: string }) {
  if (status === 'ALIGNED') return <Badge className={`bg-emerald-500/15 text-emerald-400 border-emerald-500/30 ${BADGE_XS}`} variant="outline">ALIGNED</Badge>;
  if (status === 'MIXED') return <Badge className={`bg-amber-500/15 text-amber-400 border-amber-500/30 ${BADGE_XS}`} variant="outline">MIXED</Badge>;
  return <Badge className={`bg-red-500/15 text-red-400 border-red-500/30 ${BADGE_XS}`} variant="outline">CONFLICTED</Badge>;
}

// ── PEAD signal badge ──
function PEADBadge({ signal, driftActive, daysSince }: { signal: string; driftActive: boolean; daysSince: number | null }) {
  if (!driftActive) return null;
  if (signal === 'STRONG_BUY' || signal === 'BUY') {
    return <Badge className={`bg-emerald-500/15 text-emerald-400 border-emerald-500/30 ${BADGE_SM}`} variant="outline">PEAD +{daysSince}d</Badge>;
  }
  if (signal === 'SELL' || signal === 'STRONG_SELL') {
    return <Badge className={`bg-red-500/15 text-red-400 border-red-500/30 ${BADGE_SM}`} variant="outline">PEAD SELL</Badge>;
  }
  return <Badge className={`bg-muted/30 text-muted-foreground border-muted/50 ${BADGE_SM}`} variant="outline">PEAD {daysSince}d</Badge>;
}

// ── Tradability recommendation badge ──
function TradabilityBadge({ rec }: { rec: string }) {
  const styles: Record<string, string> = {
    EXCELLENT: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    GOOD: 'bg-emerald-500/10 text-emerald-400/80 border-emerald-500/20',
    ACCEPTABLE: 'bg-amber-500/10 text-amber-400/80 border-amber-500/20',
    POOR: 'bg-red-500/10 text-red-400/80 border-red-500/20',
    UNTRADEABLE: 'bg-red-500/15 text-red-400 border-red-500/30',
  };
  return <Badge className={`${styles[rec] || styles.ACCEPTABLE} ${BADGE_SM}`} variant="outline">{rec}</Badge>;
}

// ── Universe rank badge ──
function UniverseRankBadge({ isTopDecile, isTopQuintile, percentile }: { isTopDecile: boolean; isTopQuintile: boolean; percentile: number }) {
  if (isTopDecile) return <Badge className={`bg-amber-500/15 text-amber-400 border-amber-500/30 ${BADGE_SM}`} variant="outline">TOP 10%</Badge>;
  if (isTopQuintile) return <Badge className={`bg-blue-500/15 text-blue-400 border-blue-500/30 ${BADGE_SM}`} variant="outline">TOP 20%</Badge>;
  if (percentile >= 60) return <span className="text-[12px] text-muted-foreground font-medium">P{percentile}</span>;
  return null;
}

// ── Score Cell Component ──
function ScoreCell({ icon: Icon, label, value, color, bg, active = true }: {
  icon: any; label: string; value: string | number; color: string; bg: string; active?: boolean;
}) {
  return (
    <div className={`rounded-md p-2 text-center ${bg}`}>
      <div className="flex items-center justify-center gap-1">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-[12px] text-muted-foreground font-medium">{label}</p>
      </div>
      <p className={`text-[15px] font-bold mt-0.5 ${active ? color : 'text-muted-foreground/50'}`}>{value}</p>
    </div>
  );
}

// ── Single Stock Card ──
function SwingCard({ stock, rank }: { stock: TopStockCard; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const h = HORIZON_STYLE[stock.horizonDays] || HORIZON_STYLE[3];
  const mainScoreColor = stock.displayRankScore >= 70 ? 'text-emerald-400' : stock.displayRankScore >= 50 ? 'text-amber-400' : 'text-red-400';

  return (
    <Card className="border-border/50 bg-card hover:border-border transition-all duration-200">
      <CardContent className="p-4">
        {/* Top row: rank + ticker + horizon + score */}
        <div className="flex items-center gap-3">
          <div className={"w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 " + (rank <= 3 ? 'bg-amber-500/20 text-amber-400' : 'bg-muted/30 text-muted-foreground')}>
            {rank}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-base text-foreground">{stock.symbol}</span>
              <Badge className={`${h.bg} ${h.text} ${BADGE_SM}`} variant="outline">
                {h.label} Swing
              </Badge>
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 ${BADGE_SM}" variant="outline">
                BUY
              </Badge>
              <PEADBadge signal={stock.peadSignal} driftActive={stock.peadDriftActive} daysSince={stock.peadDaysSince} />
              <UniverseRankBadge isTopDecile={stock.isTopDecile} isTopQuintile={stock.isTopQuintile} percentile={stock.universePercentile} />
            </div>
            <p className="text-[13px] text-muted-foreground mt-1">
              {stock.sector}{stock.regime && stock.regime !== 'UNKNOWN' ? ` · ${stock.regime.replace(/_/g, ' ')}` : ''}
            </p>
          </div>

          <div className="text-right flex-shrink-0">
            <div className={`text-2xl font-bold ${mainScoreColor}`}>{stock.displayRankScore}</div>
            <div className="text-[12px] text-muted-foreground">Rank Score</div>
          </div>
        </div>

        {/* ── Score Grid (7 cells) ── */}
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          <ScoreCell icon={BarChart3} label="Trend" value={stock.trendQualityScore} color={scoreColor(stock.trendQualityScore)} bg={scoreBg(stock.trendQualityScore)} />
          <ScoreCell icon={ArrowRightLeft} label="Sektor" value={stock.sectorStrengthScore} color={scoreColor(stock.sectorStrengthScore)} bg={scoreBg(stock.sectorStrengthScore)} />
          <div className={`rounded-md p-2 text-center ${scoreBg(stock.timeframeAlignmentScore)}`}>
            <div className="flex items-center justify-center gap-1">
              <Layers className="w-3 h-3 text-muted-foreground" />
              <p className="text-[12px] text-muted-foreground font-medium">Align</p>
            </div>
            <div className="flex items-center justify-center gap-1 mt-0.5">
              <p className={`text-[15px] font-bold ${scoreColor(stock.timeframeAlignmentScore)}`}>{stock.timeframeAlignmentScore}</p>
              <AlignmentBadge status={stock.timeframeAlignmentStatus} />
            </div>
          </div>
          <ScoreCell icon={Target} label="PEAD" value={stock.peadDriftActive ? stock.peadScore : '—'} color={stock.peadDriftActive ? scoreColor(stock.peadScore, 15, 40) : 'text-muted-foreground/50'} bg={scoreBg(stock.peadScore, 15, 40)} active={stock.peadDriftActive} />
          <ScoreCell icon={Trophy} label="Rank" value={stock.universeRankScore} color={scoreColor(stock.universeRankScore, 50, 80)} bg={scoreBg(stock.universeRankScore, 50, 80)} />
          <ScoreCell icon={DollarSign} label="Trade" value={stock.tradabilityScore} color={scoreColor(stock.tradabilityScore, 40, 60)} bg={scoreBg(stock.tradabilityScore, 40, 60)} />
          <ScoreCell icon={Activity} label="Analyst" value={stock.analystRevisionScore || '—'} color={stock.analystRevisionScore > 0 ? 'text-emerald-400' : stock.analystRevisionScore < 0 ? 'text-red-400' : 'text-muted-foreground/50'} bg={stock.analystRevisionScore > 20 ? 'bg-emerald-500/10' : stock.analystRevisionScore < -20 ? 'bg-red-500/10' : 'bg-muted/5'} active={stock.analystRevisionScore !== 0} />
        </div>

        {/* Why this stock? */}
        <div className="mt-3 flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-blue-500/5 border border-blue-500/15">
          <Lightbulb className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="space-y-1 min-w-0">
            {stock.topReasons.map((r, i) => (
              <p key={i} className="text-[13px] text-blue-300/80 leading-relaxed">· {r}</p>
            ))}
          </div>
        </div>

        {/* Expanded: all metrics + risk */}
        {expanded && (
          <div className="mt-3 space-y-3 border-t border-border/50 pt-3">
            {/* Core metrics */}
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center">
                <p className="text-[13px] text-muted-foreground">Score</p>
                <p className="text-base font-bold text-foreground">{stock.rawScore}</p>
              </div>
              <div className="text-center">
                <p className="text-[13px] text-muted-foreground">Confidence</p>
                <p className={`text-base font-bold ${scoreColor(stock.hybridConfidence, 58, 70)}`}>{stock.hybridConfidence}%</p>
              </div>
              <div className="text-center">
                <p className="text-[13px] text-muted-foreground">Transition</p>
                <p className={`text-base font-bold ${(stock.transitionRisk ?? 0) > 50 ? 'text-red-400' : 'text-emerald-400'}`}>{stock.transitionRisk ?? 0}%</p>
              </div>
              <div className="text-center">
                <p className="text-[13px] text-muted-foreground">Regime</p>
                <p className={`text-base font-bold ${scoreColor(stock.regimeConfidence ?? 0, 40, 65)}`}>{stock.regimeConfidence ?? '?'}%</p>
              </div>
            </div>

            {/* Advanced metrics row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg p-3 bg-muted/5 text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-[13px] text-muted-foreground">PEAD</p>
                </div>
                <p className={`text-sm font-bold ${stock.peadDriftActive ? scoreColor(stock.peadScore, 15, 40) : 'text-muted-foreground'}`}>
                  {stock.peadDriftActive ? `${stock.peadScore} (${stock.peadSignal})` : 'Jo aktiv'}
                </p>
                {stock.peadSurprisePct !== null && (
                  <p className="text-[12px] text-muted-foreground">
                    Surprise: {stock.peadSurprisePct > 0 ? '+' : ''}{stock.peadSurprisePct.toFixed(1)}%
                  </p>
                )}
              </div>
              <div className="rounded-lg p-3 bg-muted/5 text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-[13px] text-muted-foreground">Universe</p>
                </div>
                <p className={`text-sm font-bold ${scoreColor(stock.universeRankScore, 50, 80)}`}>
                  {stock.universeRankScore}/100 (P{stock.universePercentile})
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {stock.momentumRegime === 'LEADING' ? 'Lider' : stock.momentumRegime === 'DECLINING' ? 'Ngec' : stock.momentumRegime}
                </p>
              </div>
              <div className="rounded-lg p-3 bg-muted/5 text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-[13px] text-muted-foreground">Tradability</p>
                </div>
                <div className="flex items-center justify-center gap-1.5">
                  <p className={`text-sm font-bold ${scoreColor(stock.tradabilityScore, 40, 60)}`}>{stock.tradabilityScore}</p>
                  <TradabilityBadge rec={stock.tradabilityRecommendation} />
                </div>
                <p className="text-[12px] text-muted-foreground">
                  Slippage: ~{stock.estSlippageBps} bps
                </p>
              </div>
            </div>

            {/* Analyst Revision detail */}
            <div className="rounded-lg p-3 bg-muted/5">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-[13px] text-muted-foreground">Analyst Revisions</p>
              </div>
              <div className="flex items-center justify-between">
                <p className={`text-sm font-bold ${stock.analystRevisionScore > 0 ? 'text-emerald-400' : stock.analystRevisionScore < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                  {stock.analystRevisionScore > 0 ? '+' : ''}{stock.analystRevisionScore}
                </p>
                <Badge className={
                  stock.analystRevisionTrend === 'UP' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                  stock.analystRevisionTrend === 'DOWN' ? 'bg-red-500/15 text-red-400 border-red-500/30' :
                  'bg-muted/30 text-muted-foreground border-muted/50'
                } variant="outline">
                  {stock.analystRevisionTrend || 'NO DATA'}
                </Badge>
              </div>
            </div>

            {/* Regime thresholds applied */}
            {stock.activeRegimeThresholds && (
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground/70 px-3 py-2 rounded-lg bg-muted/5">
                <Shield className="w-3.5 h-3.5" />
                <span>
                  Gates: Conf ≥ {stock.activeRegimeThresholds.confidenceFloor}% · Trend ≥ {stock.activeRegimeThresholds.trendQualityFloor} · Sektor ≥ {stock.activeRegimeThresholds.sectorStrengthFloor} · Trade ≥ {stock.activeRegimeThresholds.tradabilityFloor}
                </span>
              </div>
            )}

            {/* Risk Flags */}
            {stock.riskFlags.length > 0 && (
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="flex flex-wrap gap-1.5">
                  {stock.riskFlags.map((f, i) => (
                    <Badge key={i} className="bg-amber-500/10 text-amber-400/80 border-amber-500/20 ${BADGE_SM}" variant="outline">{f}</Badge>
                  ))}
                </div>
              </div>
            )}

            {stock.riskFlags.length === 0 && (
              <div className="flex items-center gap-2 text-[13px] text-emerald-400/70">
                <Shield className="w-4 h-4" /> Asnje flag risku — profili i pastër
              </div>
            )}

            <div className="flex items-center justify-between text-[12px] text-muted-foreground">
              <span>Trend: {stock.trendQualityScore} | Sektor: {stock.sectorStrengthScore} | Align: {stock.timeframeAlignmentStatus} | PEAD: {stock.peadScore} | Analyst: {stock.analystRevisionScore}</span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-3 h-3" />{stock.updatedAt}
              </span>
            </div>
          </div>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1.5 mt-2.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {expanded ? 'Fshi detajet' : 'Shiko 7 shtresat + detajet'}
        </button>
      </CardContent>
    </Card>
  );
}

// ── Main Component ──
export function TopSwingPredictions() {
  const [data, setData] = useState<TopStocksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/top-stocks?_t=' + Date.now(), { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gabim');
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim rrjeti');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-[220px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-500/20 bg-red-500/5">
        <CardContent className="flex items-center gap-3 py-5">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <span className="text-sm text-red-400">{error}</span>
          <button onClick={fetchData} className="ml-auto text-sm text-red-500 hover:underline">Provo perseri</button>
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  if (data.topStocks.length === 0) {
    return (
      <div className="space-y-4">
        <Card className="border-border/50 bg-muted/5">
          <CardContent className="py-10 text-center">
            <Zap className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-base text-muted-foreground font-medium">Asnje kandidat swing per momentin</p>
            <p className="text-sm text-muted-foreground/60 mt-1.5">
              {data.message || 'Modeli nuk ka gjetur aktualisht asnje aksion qe permbush kriteret tona per swing trade.'}
            </p>
            {data.activeRegime && data.activeRegime !== 'UNKNOWN' && (
              <div className="mt-3">
                <Badge className="text-[12px] bg-muted/50 px-2.5 py-0.5" variant="secondary">
                  Regjimi aktiv: {data.activeRegime.replace(/_/g, ' ')}
                </Badge>
              </div>
            )}
            <div className="mt-4 flex items-center justify-center gap-1.5 text-[13px] text-muted-foreground/50">
              <Info className="w-4 h-4" />
              Ky seksion shfaq vetem BUY predictions me confidence, trend, PEAD, universe rank dhe tradability te kontrolluar. Ekzekuto nje scan te ri.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-emerald-500" />
          <span className="text-sm text-muted-foreground">
            {data.topStocks.length} kandidate swing
            {data.totalScanned > 0 && <span className="text-muted-foreground/50"> (prej {data.totalScanned} prediction-eve, {data.filteredOut} te filtruar)</span>}
          </span>
          {data.activeRegime && data.activeRegime !== 'UNKNOWN' && (
            <Badge variant="secondary" className="text-[12px] bg-muted/50 px-2.5 py-0.5">
              {data.activeRegime.replace(/_/g, ' ')}
            </Badge>
          )}
          {data.modelVersion !== 'N/A' && (
            <Badge variant="secondary" className="text-[12px] bg-muted/50 px-2.5 py-0.5">{data.modelVersion}</Badge>
          )}
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-emerald-500 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Rifresko
        </button>
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {data.topStocks.map((stock, i) => (
          <SwingCard key={`${stock.symbol}-${stock.horizonDays}`} stock={stock} rank={i + 1} />
        ))}
      </div>

      {/* Footer info */}
      <div className="border border-border/30 rounded-lg px-4 py-3 space-y-2">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-[12px] text-muted-foreground/70 leading-relaxed">
            <strong>7 shtresat e filtrit:</strong> Trend Quality · Sector Strength · Multi-TF Alignment · PEAD (Post-Earnings Drift) · Universe Rank (cross-sectional momentum) · Tradability (execution quality) · Analyst Revisions (estimate momentum).
          </p>
        </div>
        {data.regimeThresholdsApplied && (
          <div className="flex items-start gap-2 pl-6">
            <Shield className="w-3.5 h-3.5 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
            <p className="text-[12px] text-muted-foreground/50 leading-relaxed">
              Regime gates: Conf ≥ {data.regimeThresholdsApplied.confidenceFloor}% · Trend ≥ {data.regimeThresholdsApplied.trendQualityFloor} · Sektor ≥ {data.regimeThresholdsApplied.sectorStrengthFloor} · Trade ≥ {data.regimeThresholdsApplied.tradabilityFloor} · Rank ≥ {data.regimeThresholdsApplied.universeRankFloor}.
              Maksimum 9 stocks (3/horizon, 2/sector).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
