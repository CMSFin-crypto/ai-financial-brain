'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
  Bell,
  BellRing,
  Eye,
  Target,
  AlertCircle,
  SkipForward,
  BarChart3,
  TrendingDown,
  Clock,
  Search,
  GitBranch,
  Trophy,
  Star,
  ExternalLink,
  AlertOctagon,
  Lightbulb,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────

interface PillarDetail {
  passed: boolean;
  value: number;
  threshold: string;
  detail: string;
}

interface HistoricalSetup {
  date: string;
  dayChangePct: number;
  dayRelVol: number;
  return1d: number;
  return2d: number;
  return3d: number;
  return5d: number;
  maxGain5d: number;
  maxDrawdown5d: number;
  setupType: string;
}

interface PatternAnalysis {
  winRate1d: number;
  winRate2d: number;
  winRate3d: number;
  winRate5d: number;
  avgReturn1d: number;
  avgReturn2d: number;
  avgReturn3d: number;
  avgReturn5d: number;
  bestReturn1d: number;
  worstReturn1d: number;
  bestReturn5d: number;
  avgMaxGain5d: number;
  avgMaxDrawdown5d: number;
  setupsFound: number;
  patternConfidence: number;
  historicalBias: 'bullish' | 'bearish' | 'neutral';
  setupBreakdown: { label: string; count: number; winRate5d: number; avgReturn5d: number }[];
  setups: HistoricalSetup[];
}

interface Candidate {
  symbol: string;
  price: number;
  prevClose: number;
  dailyChangePct: number;
  currentVolume: number;
  averageVolume30d: number;
  relativeVolume: number;
  floatShares: number | null;
  catalystStatus: 'VERIFIED' | 'REVIEW' | 'MISSING';
  catalystHeadline?: string;
  catalystSource?: string;
  passesRvol: boolean;
  passesMomentum: boolean;
  passesPrice: boolean;
  passesFloat: boolean;
  passesCatalyst: boolean;
  pillarCount: number;
  status: 'ELIGIBLE' | 'WATCH' | 'REJECTED' | 'FLOAT_REVIEW';
  setupTags: string[];
  riskFlags: string[];
  company?: string;
  sector?: string;
  momentumScore: number;
  strongMomentum: boolean;
  highMomentum: boolean;
  pillarDetails: {
    rvol: PillarDetail;
    momentum: PillarDetail;
    catalyst: PillarDetail;
    price: PillarDetail;
    float: PillarDetail;
  };
  entryZone: string;
  stopReference: string;
  takeProfitTargets: string[];
  historicalScore: number;
  historicalPattern: PatternAnalysis;
  riseReason: string;
  cautionSignals: string[];
  newsHeadlines: { headline: string; source: string; publishedAt: string; url: string }[];
}

interface ScanSummary {
  totalUniverse: number;
  totalPreFiltered: number;
  totalAnalyzed: number;
  eligible: number;
  watch: number;
  rejected: number;
  floatReview: number;
  strongMomentum: number;
  highMomentum: number;
  pillarPassRates: { rvol: number; momentum: number; catalyst: number; price: number; float: number };
}

type StatusFilter = 'ALL' | 'ELIGIBLE' | 'WATCH' | 'FLOAT_REVIEW' | 'REJECTED';

// ─── Status Config ──────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode; desc: string }> = {
  ELIGIBLE: {
    label: 'ELIGIBLE',
    color: 'text-emerald-300',
    bg: 'bg-emerald-500/12',
    border: 'border-emerald-500/40',
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
    desc: '5/5 pillars + catalyst — kandidat i fortë',
  },
  WATCH: {
    label: 'WATCH',
    color: 'text-amber-300',
    bg: 'bg-amber-500/12',
    border: 'border-amber-500/40',
    icon: <Eye className="w-4 h-4 text-amber-400" />,
    desc: '4/5 pillars — vëzhro pranë',
  },
  FLOAT_REVIEW: {
    label: 'FLOAT REVIEW',
    color: 'text-blue-300',
    bg: 'bg-blue-500/12',
    border: 'border-blue-500/40',
    icon: <Search className="w-4 h-4 text-blue-400" />,
    desc: 'Potencial i mirë — verifiko float',
  },
  REJECTED: {
    label: 'REJECTED',
    color: 'text-red-300',
    bg: 'bg-red-500/8',
    border: 'border-red-500/30',
    icon: <XCircle className="w-4 h-4 text-red-400" />,
    desc: 'Nuk plotëson kushtet minimale',
  },
};

const PILLAR_LABELS = [
  { key: 'rvol', label: 'RVol ≥ 5x', icon: Volume2, color: 'text-blue-400' },
  { key: 'momentum', label: 'Daily gain ≥ 10%', icon: TrendingUp, color: 'text-emerald-400' },
  { key: 'catalyst', label: 'News catalyst', icon: Newspaper, color: 'text-orange-400' },
  { key: 'price', label: 'Price $1–$20', icon: DollarSign, color: 'text-purple-400' },
  { key: 'float', label: 'Float < 10M', icon: Coins, color: 'text-amber-400' },
] as const;

// ─── Component ──────────────────────────────────────────────

export function FivePillars() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [showAll, setShowAll] = useState(false);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const prevEligibleRef = useRef<string[]>([]);
  const [notificationEnabled, setNotificationEnabled] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/momentum/5-pillars');
      if (!res.ok) throw new Error('Gabim');
      const data = await res.json();
      const cands: Candidate[] = data.candidates || [];
      setCandidates(cands);
      setSummary(data.summary || null);
      setCached(data.cached || false);

      // Check for new ELIGIBLE candidates (notifications)
      const newEligible = cands
        .filter(c => c.status === 'ELIGIBLE')
        .map(c => c.symbol);
      const prevEligible = prevEligibleRef.current;
      const freshEligible = newEligible.filter(s => !prevEligible.includes(s));
      if (freshEligible.length > 0 && prevEligible.length > 0) {
        const msgs = freshEligible.map(s => `🎉 ${s} — ELIGIBLE (5 Pillars Momentum)`);
        setNotifications(prev => [...msgs, ...prev].slice(0, 20));
        // Browser notification
        if (notificationEnabled && typeof window !== 'undefined' && 'Notification' in window) {
 freshEligible.forEach(s => {
            new Notification('5 Pillars Momentum — ELIGIBLE', {
              body: `${s} ka kaluar të gjitha 5 pillarët! Momentum score: ${cands.find(c => c.symbol === s)?.momentumScore}/100`,
              icon: '/favicon.ico',
            });
          });
        }
      }
      prevEligibleRef.current = newEligible;
    } catch {
      setError('Nuk u arrit të ngarkoheshin të dhënat');
    } finally {
      setLoading(false);
    }
  }, [notificationEnabled]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Request notification permission
  const enableNotifications = () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      Notification.requestPermission().then(p => {
        setNotificationEnabled(p === 'granted');
      });
    }
  };

  const filtered = candidates.filter(c => {
    if (statusFilter === 'ALL') return true;
    return c.status === statusFilter;
  });

  const displayList = showAll ? filtered : filtered.slice(0, 25);

  // ─── Loading ───
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
    );
  }

  // ─── Error ───
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

  // ─── Pillar Pass Rate Cards ───
  const pillarStats = summary ? [
    { label: 'Rel Volume ≥5x', rate: summary.pillarPassRates.rvol, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Change ≥10%', rate: summary.pillarPassRates.momentum, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Catalyst ≥15%', rate: summary.pillarPassRates.catalyst, color: 'text-orange-400', bg: 'bg-orange-500/10' },
    { label: 'Price $2-20', rate: summary.pillarPassRates.price, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Float <20M', rate: summary.pillarPassRates.float, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  ] : [];

  const filterOptions: Array<{ key: StatusFilter; label: string; count: number }> = [
    { key: 'ALL', label: 'Të Gjitha', count: filtered.length },
    { key: 'ELIGIBLE', label: '✅ ELIGIBLE', count: candidates.filter(c => c.status === 'ELIGIBLE').length },
    { key: 'WATCH', label: '👁 WATCH', count: candidates.filter(c => c.status === 'WATCH').length },
    { key: 'FLOAT_REVIEW', label: '🔍 FLOAT REVIEW', count: candidates.filter(c => c.status === 'FLOAT_REVIEW').length },
    { key: 'REJECTED', label: '❌ REJECTED', count: candidates.filter(c => c.status === 'REJECTED').length },
  ];

  return (
    <div className="space-y-4">
      {/* ─── Summary Stats ─── */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {pillarStats.map((ps, i) => (
            <div key={i} className={`${ps.bg} border border-border/50 rounded-lg p-2.5 text-center`}>
              <div className={`text-sm font-bold ${ps.color}`}>{ps.rate.toFixed(0)}%</div>
              <div className="text-[10px] text-muted-foreground">{ps.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Status Badges Row ─── */}
      {summary && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Rezultatet:</span>
          {summary.eligible > 0 && (
            <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 border text-[10px]">
              ✅ {summary.eligible} ELIGIBLE
            </Badge>
          )}
          {summary.watch > 0 && (
            <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30 border text-[10px]">
              👁 {summary.watch} WATCH
            </Badge>
          )}
          {summary.floatReview > 0 && (
            <Badge className="bg-blue-500/15 text-blue-300 border-blue-500/30 border text-[10px]">
              🔍 {summary.floatReview} FLOAT REVIEW
            </Badge>
          )}
          {summary.highMomentum > 0 && (
            <Badge className="bg-red-500/15 text-red-400 border-red-500/30 border text-[10px] animate-pulse">
              🔥 {summary.highMomentum} HIGH MOMENTUM
            </Badge>
          )}
          {(summary.totalUniverse > 0) && (
            <Badge className="bg-blue-500/15 text-blue-300 border-blue-500/30 border text-[10px]">
              {summary.totalUniverse.toLocaleString()} US stocks scanned
            </Badge>
          )}
          <Badge className="bg-muted/30 text-muted-foreground border border-border/50 text-[10px]">
            {summary.totalPreFiltered || summary.totalAnalyzed} analyzed
          </Badge>
        </div>
      )}

      {/* ─── Interpretation Guide ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2.5">
          <div className="text-xs font-semibold text-emerald-400 mb-1">✅ ELIGIBLE</div>
          <div className="text-[10px] text-muted-foreground">5/5 pillars + catalyst — kandidat për analizë të mëtejshme</div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">
          <div className="text-xs font-semibold text-amber-400 mb-1">👁 WATCH</div>
          <div className="text-[10px] text-muted-foreground">4/5 pillars — vëzhro, verifiko lajmin</div>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-2.5">
          <div className="text-xs font-semibold text-blue-400 mb-1">🔍 FLOAT REVIEW</div>
          <div className="text-[10px] text-muted-foreground">Potencial i mirë — verifiko float në Finviz</div>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5">
          <div className="text-xs font-semibold text-red-400 mb-1">🔥 HIGH MOMENTUM</div>
          <div className="text-[10px] text-muted-foreground">RVol ≥5x DHE change ≥15% — sinjal i fortë</div>
        </div>
      </div>

      {/* ─── Filter Buttons + Notifications ─── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        {filterOptions.filter(o => o.key === 'ALL' || o.count > 0).map(opt => (
          <button
            key={opt.key}
            onClick={() => { setStatusFilter(opt.key); setShowAll(false); }}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors border ${
              statusFilter === opt.key
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/50'
            }`}
          >
            {opt.label} ({opt.count})
          </button>
        ))}

        {/* Notification Bell */}
        <div className="relative ml-auto">
          <button
            onClick={() => {
              if (!notificationEnabled) {
                enableNotifications();
              } else {
                setShowNotifications(!showNotifications);
              }
            }}
            className="relative p-1.5 rounded-md border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors"
            title={notificationEnabled ? 'Shfaq notifikimet' : 'Aktivo notifikimet'}
          >
            {notificationEnabled ? (
              <BellRing className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Bell className="w-3.5 h-3.5 text-muted-foreground" />
            )}
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                {notifications.length > 9 ? '9+' : notifications.length}
              </span>
            )}
          </button>

          {/* Notification Dropdown */}
          {showNotifications && notifications.length > 0 && (
            <div className="absolute right-0 top-full mt-1 w-72 max-h-48 overflow-y-auto bg-card border border-border/50 rounded-lg shadow-xl z-50 p-2">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Notifikime</div>
              {notifications.slice(0, 10).map((n, i) => (
                <div key={i} className="text-[11px] text-muted-foreground py-1 border-b border-border/30 last:border-0">{n}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ TOP 5 ELIGIBLE + TOP 5 WATCH — Highlighted Section ═══ */}
      {(() => {
        const topEligible = candidates.filter(c => c.status === 'ELIGIBLE').slice(0, 5);
        const topWatch = candidates.filter(c => c.status === 'WATCH').slice(0, 5);
        const topFloatReview = candidates.filter(c => c.status === 'FLOAT_REVIEW').slice(0, 5);
        const topPicks = [...topEligible, ...topWatch];
        return (
          <div className="space-y-3">
            {/* Section Header — ALWAYS visible */}
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              <span className="text-sm font-bold text-foreground">TOP 5 ELIGIBLE + TOP 5 WATCH</span>
              <span className="text-[10px] text-muted-foreground ml-1">— renditur sipas Historical Score</span>
            </div>

            {/* No ELIGIBLE/WATCH message */}
            {topPicks.length === 0 && (
              <div className="bg-muted/10 border border-border/50 rounded-lg p-4 text-center">
                <Trophy className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">
                  Asnjë ELIGIBLE ose WATCH nuk u gjet. Tregu mund të jetë i qetë.
                </p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  5 Pillars kërkon: RVol ≥5x, Change ≥10%, Catalyst, Price $1-20, Float &lt;10M
                </p>
                {topFloatReview.length > 0 && (
                  <p className="text-[10px] text-blue-400 mt-2">
                    Ka {topFloatReview.length} FLOAT_REVIEW — këta mund të bëhen ELIGIBLE pasi të verifikohet float-i
                  </p>
                )}
              </div>
            )}

            {/* TOP ELIGIBLE Row */}
            {topEligible.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[11px] font-semibold text-emerald-400">TOP ELIGIBLE ({topEligible.length})</span>
                </div>
                <div className="grid gap-2">
                  {topEligible.map((c, idx) => (
                    <TopPickCard key={c.symbol} candidate={c} rank={idx + 1} type={"ELIGIBLE"} expanded={expandedTicker === c.symbol} onToggle={() => setExpandedTicker(expandedTicker === c.symbol ? null : c.symbol)} />
                  ))}
                </div>
              </div>
            )}

            {/* TOP WATCH Row */}
            {topWatch.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 mt-1">
                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[11px] font-semibold text-amber-400">TOP WATCH ({topWatch.length})</span>
                </div>
                <div className="grid gap-2">
                  {topWatch.map((c, idx) => (
                    <TopPickCard key={c.symbol} candidate={c} rank={idx + 1} type={"WATCH"} expanded={expandedTicker === c.symbol} onToggle={() => setExpandedTicker(expandedTicker === c.symbol ? null : c.symbol)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ─── Separator ─── ALWAYS visible ─── */}
      <div className="border-t border-border/50 pt-2">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Të gjitha rezultatet ({filtered.length})</div>
      </div>

      {/* ─── Candidate Cards ─── */}
      <div className="space-y-2">
        {displayList.length === 0 ? (
          <Card className="border-border/50">
            <CardContent className="pt-6 pb-6 text-center">
              <Flame className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {statusFilter === 'ALL'
                  ? 'Asnjë kandidat nuk u gjet — tregu i qetë'
                  : `Asnjë kandidat me status "${statusFilter}"`}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                5 Pillars: RelVol 5x+, Change 10%+, Catalyst, Price $2-20, Float &lt;10M
              </p>
            </CardContent>
          </Card>
        ) : (
          displayList.map(c => <CandidateCard key={c.symbol} candidate={c} expanded={expandedTicker === c.symbol} onToggle={() => setExpandedTicker(expandedTicker === c.symbol ? null : c.symbol)} />)
        )}
      </div>

      {/* ─── Show More / Refresh ─── */}
      <div className="flex items-center justify-between">
        {filtered.length > 25 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1"
          >
            {showAll ? 'Shfaq më pak' : `Shfaq të gjitha (${filtered.length})`}
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

      {/* ─── Methodology Footer ─── */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="pt-3 pb-3">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="text-[11px] text-muted-foreground space-y-1.5">
              <p>
                <strong className="text-amber-400">Ross Cameron 5 Pillars — Warrior Trading</strong>
              </p>
              <p>
                <strong>1. Rel Volume ≥5x</strong> •
                <strong>2. Daily Change ≥10%</strong> •
                <strong>3. News Catalyst</strong> (auto-flag ≥15%) •
                <strong>4. Price $2-$20</strong> •
                <strong>5. Float &lt;10M</strong>
              </p>
              <p>
                <strong>Historical Pattern Learning</strong>: Analizon 90 ditët e fundit të çdo aksioni për të gjetur raste të ngjashme me sotën,
                matur si performuan në ditët pasuese. Jep win rate (1D/2D/3D/5D), return mesatar, dhe besim (confidence).
              </p>
              <p className="text-muted-foreground/70">
                5 Pillars gjen aksione me momentum të fortë; AI Financial Brain vendos nëse ambienti i tregut e lejon trade-in.
                Kriteret identifikojnë kandidatë për analizë, JO trade të garantuar.
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

// Win Rate Card helper (avoids template literals in JSX)
function WinRateCard({ label, value, ret }: { label: string; value: number; ret: number }) {
  const bgClass = value >= 60 ? 'bg-emerald-500/10 border-emerald-500/30' : value >= 45 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-red-500/10 border-red-500/30';
  const textClass = value >= 60 ? 'text-emerald-400' : value >= 45 ? 'text-amber-400' : 'text-red-400';
  const retClass = ret >= 0 ? 'text-emerald-300' : 'text-red-300';
  return (
    <div className={"rounded-lg p-2 text-center border " + bgClass}>
      <div className={"text-sm font-bold " + textClass}>{value}%</div>
      <div className="text-[9px] text-muted-foreground">{label}</div>
      <div className={"text-[10px] font-medium " + retClass}>
        avg {ret >= 0 ? '+' : ''}{ret}%
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TOP PICK Card — Compact card for Top 5 ELIGIBLE + Top 5 WATCH
// ═══════════════════════════════════════════════════════════════

function TopPickCard({ candidate: c, rank, type, expanded, onToggle }: { candidate: Candidate; rank: number; type: 'ELIGIBLE' | 'WATCH'; expanded: boolean; onToggle: () => void }) {
  const isEligible = type === 'ELIGIBLE';
  const isPositive = c.dailyChangePct >= 0;
  const borderColor = isEligible ? 'border-emerald-500/50' : 'border-amber-500/50';
  const bgColor = isEligible ? 'bg-emerald-500/8' : 'bg-amber-500/8';
  const rankColor = rank === 1 ? 'text-amber-400' : rank === 2 ? 'text-gray-300' : rank === 3 ? 'text-orange-400' : 'text-muted-foreground';

  return (
    <Card className={borderColor + ' ' + bgColor + ' transition-all duration-200 hover:border-border/80'}>
      <CardContent className="p-3">
        <div className="flex items-center gap-3 cursor-pointer" onClick={onToggle}>
          {/* Rank */}
          <div className={"flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold " + (rank === 1 ? 'bg-amber-500/20 text-amber-400' : rank === 2 ? 'bg-gray-500/20 text-gray-300' : rank === 3 ? 'bg-orange-500/20 text-orange-400' : 'bg-muted/30 ' + rankColor)}>
            {rank <= 3 ? <Star className={"w-3.5 h-3.5 " + rankColor} /> : <span className={rankColor}>{rank}</span>}
          </div>

          {/* Ticker + Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-foreground">{c.symbol}</span>
              {c.highMomentum && (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 border text-[9px] animate-pulse px-1 py-0">
                  HIGH MOMENTUM
                </Badge>
              )}
              <Badge variant="outline" className={"text-[9px] px-1 py-0 font-semibold " + (isEligible ? 'text-emerald-300 border-emerald-500/40' : 'text-amber-300 border-amber-500/40')}>
                {isEligible ? 'ELIGIBLE' : 'WATCH'}
              </Badge>
              <Badge className={"text-[9px] px-1 py-0 " + (isPositive ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-red-500/15 text-red-400 border-red-500/30')} variant="outline">
                {isPositive ? '+' : ''}{c.dailyChangePct.toFixed(2)}%
              </Badge>
              <Badge className="text-[9px] px-1 py-0 bg-muted/30 text-muted-foreground border-border/50 border">
                {c.pillarCount}/5 pillars
              </Badge>
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {c.company && c.company !== c.symbol ? c.company + ' ' : ''}
              <span className={"font-medium " + (isPositive ? 'text-emerald-400' : 'text-red-400')}>
                ${c.price.toFixed(2)}
              </span>
              {' '} RVol: <span className={c.passesRvol ? 'text-blue-400' : ''}>{c.relativeVolume}x</span>
              {' '} Float: <span className={c.passesFloat ? 'text-amber-400' : c.floatShares === null ? 'text-blue-400' : ''}>{c.floatShares !== null ? c.floatShares.toFixed(1) + 'M' : '?'}</span>
            </div>
          </div>

          {/* Historical Score — PROMINENT */}
          <div className="text-right flex-shrink-0">
            <div className={"text-lg font-bold " + (c.historicalScore >= 60 ? 'text-emerald-400' : c.historicalScore >= 45 ? 'text-amber-400' : 'text-red-400')}>
              {c.historicalScore >= 60 ? '📈' : c.historicalScore >= 45 ? '➡️' : '📉'} {c.historicalScore}
            </div>
            <div className="text-[9px] text-muted-foreground">History / 100</div>
            <div className="text-[9px] text-muted-foreground">Momentum: {c.momentumScore}/100</div>
          </div>

          <div className="flex-shrink-0 ml-1">
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>

        {/* Rise Reason — always visible */}
        {c.riseReason && (
          <div className="mt-2 flex items-start gap-2 px-2 py-2 rounded-md bg-blue-500/8 border border-blue-500/20">
            <Lightbulb className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-[10px] text-blue-300/90 leading-relaxed">{c.riseReason}</div>
          </div>
        )}

        {/* Quick historical stats bar (always visible) */}
        {c.historicalPattern.setupsFound > 0 && (
          <div className={"mt-2 flex flex-wrap items-center gap-2 text-[10px] px-2 py-1.5 rounded-md " + (isEligible ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-amber-500/8 border-amber-500/20') + " border"}>
            <span className={"font-medium " + (c.historicalPattern.winRate1d >= 60 ? 'text-emerald-400' : 'text-amber-400')}>
              1D: {c.historicalPattern.winRate1d}% win
            </span>
            <span className={"font-medium " + (c.historicalPattern.winRate5d >= 60 ? 'text-emerald-400' : 'text-amber-400')}>
              5D: {c.historicalPattern.winRate5d}% win
            </span>
            <span className={"font-medium " + (c.historicalPattern.avgReturn5d >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              Avg 5D: {c.historicalPattern.avgReturn5d >= 0 ? '+' : ''}{c.historicalPattern.avgReturn5d}%
            </span>
            <span className="text-muted-foreground">
              {c.historicalPattern.setupsFound} raste
            </span>
            <Badge className={"text-[8px] px-1 py-0 ml-auto " + (c.historicalPattern.historicalBias === 'bullish' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : c.historicalPattern.historicalBias === 'bearish' ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-muted/30 text-muted-foreground border-border/50')} variant="outline">
              {c.historicalPattern.historicalBias === 'bullish' ? 'BULLISH' : c.historicalPattern.historicalBias === 'bearish' ? 'BEARISH' : 'NEUTRAL'}
            </Badge>
          </div>
        )}

        {/* Reuse the full expanded content from CandidateCard */}
        {expanded && (
          <div className="mt-3 border-t border-border/50 pt-3">
            {/* Pillar Checks */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {[
                { key: 'rvol', label: 'RVol ≥ 5x', passed: c.passesRvol, color: 'text-blue-400' },
                { key: 'momentum', label: 'Change ≥ 10%', passed: c.passesMomentum, color: 'text-emerald-400' },
                { key: 'catalyst', label: 'Catalyst', passed: c.passesCatalyst, color: 'text-orange-400' },
                { key: 'price', label: 'Price $1-$20', passed: c.passesPrice, color: 'text-purple-400' },
                { key: 'float', label: 'Float <10M', passed: c.passesFloat, color: 'text-amber-400' },
              ].map(p => (
                <div key={p.key} className={"flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] border " + (p.passed ? p.color.replace('text-', 'bg-').replace('400', '500/10') + ' border-border/50' : 'bg-muted/20 border-border/30 opacity-50')}>
                  {p.passed ? <CheckCircle2 className={"w-3 h-3 " + p.color} /> : <XCircle className="w-3 h-3 text-muted-foreground/50" />}
                  <span className={p.passed ? p.color : 'text-muted-foreground/60'}>{p.label}</span>
                </div>
              ))}
            </div>

            {/* Buy / Sell Indicators */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-400">BUY Signal</span>
                </div>
                <div className="text-[10px] text-muted-foreground">Entry: <span className="text-emerald-300">{c.entryZone}</span></div>
                {c.takeProfitTargets.length > 0 && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">Targets: {c.takeProfitTargets.join(' | ')}</div>
                )}
              </div>
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Shield className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-xs font-semibold text-red-400">RISK / STOP</span>
                </div>
                <div className="text-[10px] text-muted-foreground">Stop: <span className="text-red-300">{c.stopReference}</span></div>
                {c.riskFlags.slice(0, 2).map((f, i) => (
                  <div key={i} className="text-[10px] text-red-300/80 flex items-start gap-1 mt-0.5">
                    <AlertTriangle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" /><span>{f}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* News Headlines (real news for top picks) */}
            {c.newsHeadlines.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Newspaper className="w-3.5 h-3.5 text-orange-400" />
                  <span className="text-xs font-medium text-orange-400">Lajme reale</span>
                </div>
                {c.newsHeadlines.map((n, i) => (
                  <a key={i} href={n.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 px-2 py-1.5 rounded-md bg-orange-500/8 border border-orange-500/20 hover:bg-orange-500/15 transition-colors group">
                    <ExternalLink className="w-3 h-3 text-orange-400/60 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-orange-300/90 leading-relaxed group-hover:text-orange-200">{n.headline}</div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">{n.source}</div>
                    </div>
                  </a>
                ))}
              </div>
            )}

            {/* Caution Signals — kur duhet me pas kujdes */}
            {c.cautionSignals.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <AlertOctagon className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-xs font-medium text-red-400">Kujdes!</span>
                  <span className="text-[9px] text-muted-foreground">Kur duhet me pas kujdes</span>
                </div>
                {c.cautionSignals.slice(0, 6).map((s, i) => (
                  <div key={i} className="flex items-start gap-1.5 pl-5">
                    <AlertTriangle className="w-2.5 h-2.5 text-red-400/70 mt-0.5 flex-shrink-0" />
                    <span className="text-[10px] text-red-300/80 leading-relaxed">{s}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Historical Pattern Learning (compact version for top picks) */}
            {c.historicalPattern.setupsFound > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-xs font-medium text-cyan-400">Historical Pattern Learning</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <WinRateCard label="1D Win Rate" value={c.historicalPattern.winRate1d} ret={c.historicalPattern.avgReturn1d} />
                  <WinRateCard label="2D Win Rate" value={c.historicalPattern.winRate2d} ret={c.historicalPattern.avgReturn2d} />
                  <WinRateCard label="3D Win Rate" value={c.historicalPattern.winRate3d} ret={c.historicalPattern.avgReturn3d} />
                  <WinRateCard label="5D Win Rate" value={c.historicalPattern.winRate5d} ret={c.historicalPattern.avgReturn5d} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                  <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-1.5 text-center">
                    <div className={"text-xs font-bold " + (c.historicalScore >= 60 ? 'text-emerald-400' : c.historicalScore >= 45 ? 'text-amber-400' : 'text-red-400')}>{c.historicalScore}/100</div>
                    <div className="text-[8px] text-muted-foreground">History Score</div>
                  </div>
                  <div className="bg-muted/20 border border-border/50 rounded-lg p-1.5 text-center">
                    <div className="text-xs font-bold text-cyan-400">{c.historicalPattern.setupsFound}</div>
                    <div className="text-[8px] text-muted-foreground">Cases</div>
                  </div>
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-1.5 text-center">
                    <div className="text-xs font-bold text-emerald-400">+{c.historicalPattern.avgMaxGain5d}%</div>
                    <div className="text-[8px] text-muted-foreground">Avg Max Gain</div>
                  </div>
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-1.5 text-center">
                    <div className="text-xs font-bold text-red-400">-{c.historicalPattern.avgMaxDrawdown5d}%</div>
                    <div className="text-[8px] text-muted-foreground">Avg Drawdown</div>
                  </div>
                  <div className="bg-muted/20 border border-border/50 rounded-lg p-1.5 text-center">
                    <div className="text-xs font-bold text-purple-400">{c.historicalPattern.patternConfidence}/100</div>
                    <div className="text-[8px] text-muted-foreground">Confidence</div>
                  </div>
                </div>
                {/* Recent Setups Table */}
                {c.historicalPattern.setups.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="text-muted-foreground/70 border-b border-border/30">
                          <th className="text-left py-1 pr-2">Date</th>
                          <th className="text-right py-1 px-1">Change</th>
                          <th className="text-right py-1 px-1">RVol</th>
                          <th className="text-right py-1 px-1">1D</th>
                          <th className="text-right py-1 px-1">5D</th>
                          <th className="text-left py-1 pl-2">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.historicalPattern.setups.slice().reverse().map((s, i) => (
                          <tr key={i} className="border-b border-border/20">
                            <td className="py-1 pr-2 text-muted-foreground">{s.date}</td>
                            <td className="text-right py-1 px-1 text-emerald-400">+{s.dayChangePct}%</td>
                            <td className="text-right py-1 px-1 text-blue-400">{s.dayRelVol}x</td>
                            <td className={"text-right py-1 px-1 font-medium " + (s.return1d >= 0 ? 'text-emerald-400' : 'text-red-400')}>{s.return1d >= 0 ? '+' : ''}{s.return1d}%</td>
                            <td className={"text-right py-1 px-1 font-medium " + (s.return5d >= 0 ? 'text-emerald-400' : 'text-red-400')}>{s.return5d >= 0 ? '+' : ''}{s.return5d}%</td>
                            <td className="py-1 pl-2 text-muted-foreground">{s.setupType}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// Candidate Card Component
// ═══════════════════════════════════════════════════════════════

function CandidateCard({ candidate: c, expanded, onToggle }: { candidate: Candidate; expanded: boolean; onToggle: () => void }) {
  const sc = STATUS_CONFIG[c.status];
  const isGreenBg = c.status === 'ELIGIBLE';
  const isPositive = c.dailyChangePct >= 0;

  const pillars: Array<{ key: string; label: string; passed: boolean; detail: PillarDetail; color: string; icon: React.ComponentType<{ className?: string }> }> = [
    { key: 'rvol', label: 'RVol ≥ 5x', passed: c.passesRvol, detail: c.pillarDetails.rvol, color: 'text-blue-400', icon: Volume2 },
    { key: 'momentum', label: 'Daily gain ≥ 10%', passed: c.passesMomentum, detail: c.pillarDetails.momentum, color: 'text-emerald-400', icon: TrendingUp },
    { key: 'catalyst', label: 'News catalyst', passed: c.passesCatalyst, detail: c.pillarDetails.catalyst, color: 'text-orange-400', icon: Newspaper },
    { key: 'price', label: 'Price $2–$20', passed: c.passesPrice, detail: c.pillarDetails.price, color: 'text-purple-400', icon: DollarSign },
    { key: 'float', label: 'Float < 10M', passed: c.passesFloat, detail: c.pillarDetails.float, color: 'text-amber-400', icon: Coins },
  ];

  return (
    <Card className={`
      ${isGreenBg ? 'border-emerald-500/50 bg-emerald-500/8' : expanded ? sc.border : 'border-border/50'}
      ${expanded ? sc.bg : 'bg-card/50'}
      transition-all duration-200 hover:border-border/80
    `}>
      <CardContent className="p-3 sm:p-4">
        {/* ─── HEADER: Ticker + Status ─── */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={onToggle}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-foreground">{c.symbol}</span>
              {c.highMomentum && (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 border text-[10px] animate-pulse">
                  🔥 HIGH MOMENTUM
                </Badge>
              )}
              {c.strongMomentum && !c.highMomentum && (
                <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 border text-[10px]">
                  🔥 STRONG
                </Badge>
              )}
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-semibold ${sc.color} ${sc.border} border`}>
                {sc.icon}
                <span className="ml-1">{sc.label}</span>
              </Badge>
              <Badge
                className={`text-[10px] px-1.5 py-0 font-semibold ${isPositive ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-red-500/15 text-red-400 border-red-500/30'}`}
                variant="outline"
              >
                {isPositive ? '+' : ''}{c.dailyChangePct.toFixed(2)}%
              </Badge>
              <Badge className="text-[10px] px-1.5 py-0 bg-muted/30 text-muted-foreground border-border/50 border">
                {c.pillarCount}/5
              </Badge>
            </div>
            {c.company && c.company !== c.symbol && (
              <div className="text-xs text-muted-foreground mt-0.5 truncate">{c.company} {c.sector && c.sector !== 'Momentum' ? `• ${c.sector}` : ''}</div>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <div className="font-semibold text-sm">${c.price.toFixed(2)}</div>
            <div className="text-[10px] text-muted-foreground">Score: {c.momentumScore}/100</div>
            {c.historicalPattern.setupsFound > 0 && (
              <div className={`text-[10px] font-medium ${c.historicalScore >= 60 ? 'text-emerald-400' : c.historicalScore >= 45 ? 'text-amber-400' : 'text-red-400'}`}>
                {c.historicalScore >= 60 ? '📈' : c.historicalScore >= 45 ? '➡️' : '📉'} Historia: {c.historicalScore}/100
              </div>
            )}
          </div>
          <div className="flex-shrink-0 ml-1">
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>

        {/* ─── INFO ROW: Price, Change, RVol, Float, Catalyst ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mt-2.5 text-[11px]">
          <div className="flex justify-between sm:block">
            <span className="text-muted-foreground">Price:</span>
            <span className={`font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}> ${c.price.toFixed(2)}</span>
          </div>
          <div className="flex justify-between sm:block">
            <span className="text-muted-foreground">Daily change:</span>
            <span className={`font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}> {isPositive ? '+' : ''}{c.dailyChangePct.toFixed(2)}%</span>
          </div>
          <div className="flex justify-between sm:block">
            <span className="text-muted-foreground">Relative volume:</span>
            <span className={`font-medium ${c.passesRvol ? 'text-blue-400' : 'text-muted-foreground'}`}> {c.relativeVolume}x</span>
          </div>
          <div className="flex justify-between sm:block">
            <span className="text-muted-foreground">Float:</span>
            <span className={`font-medium ${c.passesFloat ? 'text-amber-400' : c.floatShares === null ? 'text-blue-400' : 'text-muted-foreground'}`}>
              {c.floatShares !== null ? `${c.floatShares.toFixed(1)}M` : 'Unknown' }
            </span>
          </div>
          <div className="col-span-2 flex justify-between sm:col-span-1 sm:block">
            <span className="text-muted-foreground">Catalyst:</span>
            <span className={`font-medium ${c.catalystStatus === 'VERIFIED' ? 'text-emerald-400' : c.catalystStatus === 'REVIEW' ? 'text-orange-400' : 'text-muted-foreground'}`}>
              {c.catalystStatus === 'VERIFIED' ? 'Verified' : c.catalystStatus === 'REVIEW' ? 'Review needed' : 'Missing'}
            </span>
          </div>
          <div className="col-span-2 flex justify-between sm:col-span-1 sm:block">
            <span className="text-muted-foreground">Source confidence:</span>
            <span className={`font-medium ${c.catalystStatus === 'VERIFIED' ? 'text-emerald-400' : c.catalystStatus === 'REVIEW' ? 'text-orange-400' : 'text-red-400'}`}>
              {c.catalystStatus === 'VERIFIED' ? 'HIGH' : c.catalystStatus === 'REVIEW' ? 'MEDIUM' : 'LOW'}
            </span>
          </div>
        </div>

        {/* ─── PILLAR CHECKS: Compact ─── */}
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {pillars.map(p => (
            <div
              key={p.key}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] border ${
                p.passed
                  ? `${p.color.replace('text-', 'bg-').replace('400', '500/10')} border-border/50`
                  : 'bg-muted/20 border-border/30 opacity-50'
              }`}
            >
              {p.passed
                ? <CheckCircle2 className={`w-3 h-3 ${p.color}`} />
                : <XCircle className="w-3 h-3 text-muted-foreground/50" />
              }
              <span className={p.passed ? p.color : 'text-muted-foreground/60'}>{p.label}</span>
            </div>
          ))}
        </div>

        {/* ─── EXPANDED DETAILS ─── */}
        {expanded && (
          <div className="mt-4 space-y-3 border-t border-border/50 pt-3">
            {/* Status Banner */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isGreenBg ? 'bg-emerald-500/15 border-emerald-500/30 border' : sc.bg + ' border ' + sc.border}`}>
              {sc.icon}
              <div className="flex-1">
                <div className={`text-sm font-semibold ${sc.color}`}>{c.symbol}: {sc.label}</div>
                <div className="text-xs text-muted-foreground">{sc.desc}</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold {sc.color}">{c.pillarCount}/5</div>
                <div className="text-[10px] text-muted-foreground">Momentum: {c.momentumScore}/100</div>
              </div>
            </div>

            {/* Detailed Pillar Breakdown */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">ROSS CAMERON 5 PILLARS — Detaje</div>
              {pillars.map((p, idx) => {
                const Icon = p.icon;
                return (
                  <div key={p.key} className={`flex items-start gap-2.5 p-2 rounded-md ${p.passed ? 'bg-muted/10' : 'bg-muted/5'}`}>
                    <div className="flex-shrink-0 mt-0.5">
                      {p.passed
                        ? <CheckCircle2 className={`w-4 h-4 ${p.color}`} />
                        : <XCircle className="w-4 h-4 text-muted-foreground/40" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{idx + 1}. {p.label}</span>
                        <span className="text-[10px] text-muted-foreground">{p.detail.threshold}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{p.detail.detail}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <Icon className={`w-4 h-4 ${p.passed ? p.color : 'text-muted-foreground/30'}`} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Catalyst Details */}
            {c.catalystHeadline && (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-md p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Newspaper className="w-3.5 h-3.5 text-orange-400" />
                  <span className="text-xs font-medium text-orange-400">Catalyst Analysis</span>
                  <Badge className="text-[9px] px-1 py-0 bg-orange-500/20 text-orange-300 border-orange-500/30 border ml-auto">
                    {c.catalystStatus}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">{c.catalystHeadline}</p>
              </div>
            )}

            {/* Pse po rritet? */}
            {c.riseReason && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-md p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Lightbulb className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs font-medium text-blue-400">Pse po rritet?</span>
                </div>
                <p className="text-[11px] text-blue-300/90 leading-relaxed">{c.riseReason}</p>
              </div>
            )}

            {/* Real News Headlines */}
            {c.newsHeadlines.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Newspaper className="w-3.5 h-3.5 text-orange-400" />
                  <span className="text-xs font-medium text-orange-400">Lajme reale</span>
                </div>
                {c.newsHeadlines.map((n, i) => (
                  <a key={i} href={n.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 px-2 py-1.5 rounded-md bg-orange-500/8 border border-orange-500/20 hover:bg-orange-500/15 transition-colors group">
                    <ExternalLink className="w-3 h-3 text-orange-400/60 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-orange-300/90 leading-relaxed group-hover:text-orange-200">{n.headline}</div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">{n.source}</div>
                    </div>
                  </a>
                ))}
              </div>
            )}

            {/* Kujdes! — kur duhet me pas kujdes */}
            {c.cautionSignals.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <AlertOctagon className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-xs font-medium text-red-400">Kujdes!</span>
                  <span className="text-[9px] text-muted-foreground">Kur duhet me pas kujdes</span>
                </div>
                {c.cautionSignals.slice(0, 6).map((s, i) => (
                  <div key={i} className="flex items-start gap-1.5 pl-5">
                    <AlertTriangle className="w-2.5 h-2.5 text-red-400/70 mt-0.5 flex-shrink-0" />
                    <span className="text-[10px] text-red-300/80 leading-relaxed">{s}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Setup Watch Tags */}
            {c.setupTags.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-medium text-emerald-400">Setup watch:</span>
                </div>
                <div className="flex flex-wrap gap-1.5 ml-5">
                  {c.setupTags.map((tag, i) => (
                    <Badge key={i} className="bg-emerald-500/10 text-emerald-300 border-emerald-500/30 border text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Buy / Sell Indicators */}
            {(c.status === 'ELIGIBLE' || c.status === 'WATCH' || c.status === 'FLOAT_REVIEW') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Buy Signal */}
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-400">BUY Signal</span>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] text-muted-foreground">
                      <span className="text-muted-foreground/60">Entry zone:</span> <span className="text-emerald-300">{c.entryZone}</span>
                    </div>
                    {c.takeProfitTargets.length > 0 && (
                      <div className="text-[10px] text-muted-foreground">
                        <span className="text-muted-foreground/60">Targets:</span>
                        <div className="mt-0.5 space-y-0.5">
                          {c.takeProfitTargets.map((t, i) => (
                            <div key={i} className="text-emerald-300">{t}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sell / Risk Signal */}
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Shield className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-xs font-semibold text-red-400">RISK / STOP</span>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] text-muted-foreground">
                      <span className="text-muted-foreground/60">Stop reference:</span> <span className="text-red-300">{c.stopReference}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      <span className="text-muted-foreground/60">Status:</span>{' '}
                      <Badge className="text-[9px] px-1 py-0 bg-yellow-500/20 text-yellow-300 border-yellow-500/30 border">
                        PAPER-TRADE REVIEW
                      </Badge>
                    </div>
                    {c.riskFlags.slice(0, 3).map((f, i) => (
                      <div key={i} className="text-[10px] text-red-300/80 flex items-start gap-1">
                        <AlertTriangle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Historical Pattern Analysis */}
            {c.historicalPattern.setupsFound > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-xs font-medium text-cyan-400">Historical Pattern Learning</span>
                  <span className={
                    c.historicalPattern.historicalBias === 'bullish'
                      ? 'text-[9px] px-1 py-0 ml-auto border bg-emerald-500/20 text-emerald-300 border-emerald-500/30 rounded-full'
                      : c.historicalPattern.historicalBias === 'bearish'
                        ? 'text-[9px] px-1 py-0 ml-auto border bg-red-500/20 text-red-300 border-red-500/30 rounded-full'
                        : 'text-[9px] px-1 py-0 ml-auto border bg-muted/30 text-muted-foreground border-border/50 rounded-full'
                  }>
                    {c.historicalPattern.historicalBias === 'bullish' ? 'BULLISH BIAS' : c.historicalPattern.historicalBias === 'bearish' ? 'BEARISH BIAS' : 'NEUTRAL'}
                  </span>
                </div>

                {/* Win Rate Grid */}
                <div className="grid grid-cols-4 gap-2">
                  <WinRateCard label="1D Win Rate" value={c.historicalPattern.winRate1d} ret={c.historicalPattern.avgReturn1d} />
                  <WinRateCard label="2D Win Rate" value={c.historicalPattern.winRate2d} ret={c.historicalPattern.avgReturn2d} />
                  <WinRateCard label="3D Win Rate" value={c.historicalPattern.winRate3d} ret={c.historicalPattern.avgReturn3d} />
                  <WinRateCard label="5D Win Rate" value={c.historicalPattern.winRate5d} ret={c.historicalPattern.avgReturn5d} />
                </div>

                {/* Key Metrics Row */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-2 text-center">
                    <div className={c.historicalScore >= 60 ? 'text-sm font-bold text-emerald-400' : c.historicalScore >= 45 ? 'text-sm font-bold text-amber-400' : 'text-sm font-bold text-red-400'}>{c.historicalScore}/100</div>
                    <div className="text-[9px] text-muted-foreground">History Score</div>
                  </div>
                  <div className="bg-muted/20 border border-border/50 rounded-lg p-2 text-center">
                    <div className="text-sm font-bold text-cyan-400">{c.historicalPattern.setupsFound}</div>
                    <div className="text-[9px] text-muted-foreground">Similar cases found</div>
                  </div>
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2 text-center">
                    <div className="text-sm font-bold text-emerald-400">+{c.historicalPattern.avgMaxGain5d}%</div>
                    <div className="text-[9px] text-muted-foreground">Avg max gain (5D)</div>
                  </div>
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-center">
                    <div className="text-sm font-bold text-red-400">-{c.historicalPattern.avgMaxDrawdown5d}%</div>
                    <div className="text-[9px] text-muted-foreground">Avg drawdown (5D)</div>
                  </div>
                  <div className="bg-muted/20 border border-border/50 rounded-lg p-2 text-center">
                    <div className="text-sm font-bold text-purple-400">{c.historicalPattern.patternConfidence}/100</div>
                    <div className="text-[9px] text-muted-foreground">Model confidence</div>
                  </div>
                </div>

                {/* Setup Type Breakdown */}
                {c.historicalPattern.setupBreakdown.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-medium text-muted-foreground">Setup type breakdown:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {c.historicalPattern.setupBreakdown.map((sb, i) => (
                        <div key={i} className={
                          sb.winRate5d >= 60
                            ? 'px-2 py-0.5 rounded-md text-[10px] border bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : sb.winRate5d >= 45
                              ? 'px-2 py-0.5 rounded-md text-[10px] border bg-amber-500/10 border-amber-500/30 text-amber-300'
                              : 'px-2 py-0.5 rounded-md text-[10px] border bg-red-500/10 border-red-500/30 text-red-300'
                        }>
                          {sb.label} ({sb.count}x): {sb.winRate5d}% win | avg {sb.avgReturn5d > 0 ? '+' : ''}{sb.avgReturn5d}%
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Historical Setups Table */}
                {c.historicalPattern.setups.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-medium text-muted-foreground">Recent similar setups:</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="text-muted-foreground/70 border-b border-border/30">
                            <th className="text-left py-1 pr-2">Date</th>
                            <th className="text-right py-1 px-1">Change</th>
                            <th className="text-right py-1 px-1">RVol</th>
                            <th className="text-right py-1 px-1">1D</th>
                            <th className="text-right py-1 px-1">2D</th>
                            <th className="text-right py-1 px-1">5D</th>
                            <th className="text-left py-1 pl-2">Type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.historicalPattern.setups.slice().reverse().map((s, i) => (
                            <tr key={i} className="border-b border-border/20">
                              <td className="py-1 pr-2 text-muted-foreground">{s.date}</td>
                              <td className="text-right py-1 px-1 text-emerald-400">+{s.dayChangePct}%</td>
                              <td className="text-right py-1 px-1 text-blue-400">{s.dayRelVol}x</td>
                              <td className={s.return1d >= 0 ? 'text-right py-1 px-1 font-medium text-emerald-400' : 'text-right py-1 px-1 font-medium text-red-400'}>{s.return1d >= 0 ? '+' : ''}{s.return1d}%</td>
                              <td className={s.return2d >= 0 ? 'text-right py-1 px-1 text-emerald-400' : 'text-right py-1 px-1 text-red-400'}>{s.return2d >= 0 ? '+' : ''}{s.return2d}%</td>
                              <td className={s.return5d >= 0 ? 'text-right py-1 px-1 font-medium text-emerald-400' : 'text-right py-1 px-1 font-medium text-red-400'}>{s.return5d >= 0 ? '+' : ''}{s.return5d}%</td>
                              <td className="py-1 pl-2 text-muted-foreground">{s.setupType}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Disclaimer */}
                <div className="text-[9px] text-muted-foreground/60 flex items-start gap-1">
                  <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>Past performance does not guarantee future results. These are statistical models from the last 90 days of data. Use as an additional factor, not as a final decision.</span>
                </div>
              </div>
            )}

            {/* Historical Pattern: No Data */}
            {c.historicalPattern.setupsFound === 0 && (
              <div className="bg-muted/10 border border-border/30 rounded-md p-2.5 flex items-start gap-2">
                <GitBranch className="w-3.5 h-3.5 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
                <div className="text-[10px] text-muted-foreground/60">
                  <span className="font-medium">Historical Pattern Learning:</span> No similar cases found in the last 90 days. This stock rarely has such momentum (good or bad).
                </div>
              </div>
            )}
            {/* Full Risk Flags */}
            {c.riskFlags.length > 1 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Risk Flags
                </div>
                {c.riskFlags.map((f, i) => (
                  <div key={i} className="text-[10px] text-muted-foreground pl-4 flex items-start gap-1.5">
                    <MinusCircle className="w-2.5 h-2.5 text-amber-500/60 mt-0.5 flex-shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Volume Details */}
            <div className="bg-muted/20 rounded-md p-2 text-[10px] text-muted-foreground grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>Current vol: {(c.currentVolume / 1e6).toFixed(1)}M</div>
              <div>Avg 30d: {(c.averageVolume30d / 1e6).toFixed(1)}M</div>
              <div>RelVol: {c.relativeVolume}x</div>
              <div>Prev close: ${c.prevClose.toFixed(2)}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
