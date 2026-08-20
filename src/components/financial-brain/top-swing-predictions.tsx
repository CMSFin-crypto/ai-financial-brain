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
  message?: string;
}

// ── Horizon badge colors ──
const HORIZON_STYLE: Record<number, { bg: string; text: string; label: string }> = {
  1: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: '1D' },
  3: { bg: 'bg-violet-500/15', text: 'text-violet-400', label: '3D' },
  7: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: '7D' },
};

// ── Single Stock Card ──
function SwingCard({ stock, rank }: { stock: TopStockCard; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const h = HORIZON_STYLE[stock.horizonDays] || HORIZON_STYLE[3];
  const scoreColor = stock.displayRankScore >= 70 ? 'text-emerald-400' : stock.displayRankScore >= 50 ? 'text-amber-400' : 'text-red-400';
  const confColor = stock.hybridConfidence >= 70 ? 'text-emerald-400' : stock.hybridConfidence >= 58 ? 'text-amber-400' : 'text-red-400';

  return (
    <Card className="border-border/50 bg-card hover:border-border transition-all duration-200">
      <CardContent className="p-3.5">
        {/* Top row: rank + ticker + horizon + score */}
        <div className="flex items-center gap-3">
          {/* Rank */}
          <div className={"w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 " + (rank <= 3 ? 'bg-amber-500/20 text-amber-400' : 'bg-muted/30 text-muted-foreground')}>
            {rank}
          </div>

          {/* Ticker + sector */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-foreground">{stock.symbol}</span>
              <Badge className={`${h.bg} ${h.text} text-[9px] px-1.5 py-0 font-semibold`} variant="outline">
                {h.label} Swing
              </Badge>
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[9px] px-1.5 py-0 font-semibold" variant="outline">
                BUY
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {stock.sector}{stock.regime && stock.regime !== 'UNKNOWN' ? ` · ${stock.regime.replace(/_/g, ' ')}` : ''}
            </p>
          </div>

          {/* Display Score — prominent */}
          <div className="text-right flex-shrink-0">
            <div className={`text-xl font-bold ${scoreColor}`}>{stock.displayRankScore}</div>
            <div className="text-[8px] text-muted-foreground">Rank Score</div>
          </div>
        </div>

        {/* Why this stock? — always visible */}
        <div className="mt-2.5 flex items-start gap-2 px-2 py-2 rounded-md bg-blue-500/5 border border-blue-500/15">
          <Lightbulb className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="space-y-0.5">
            {stock.topReasons.map((r, i) => (
              <p key={i} className="text-[10px] text-blue-300/80 leading-relaxed">• {r}</p>
            ))}
          </div>
        </div>

        {/* Expanded: metrics + risk */}
        {expanded && (
          <div className="mt-2.5 space-y-2 border-t border-border/50 pt-2.5">
            {/* Metrics grid */}
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <p className="text-[9px] text-muted-foreground">Score</p>
                <p className="text-sm font-bold text-foreground">{stock.rawScore}</p>
              </div>
              <div className="text-center">
                <p className="text-[9px] text-muted-foreground">Confidence</p>
                <p className={`text-sm font-bold ${confColor}`}>{stock.hybridConfidence}%</p>
              </div>
              <div className="text-center">
                <p className="text-[9px] text-muted-foreground">Transition</p>
                <p className={`text-sm font-bold ${(stock.transitionRisk ?? 0) > 50 ? 'text-red-400' : 'text-emerald-400'}`}>{stock.transitionRisk ?? 0}%</p>
              </div>
            </div>

            {/* Risk Flags */}
            {stock.riskFlags.length > 0 && (
              <div className="flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="flex flex-wrap gap-1">
                  {stock.riskFlags.map((f, i) => (
                    <Badge key={i} className="bg-amber-500/10 text-amber-400/80 border-amber-500/20 text-[8px] px-1.5 py-0" variant="outline">
                      {f}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {stock.riskFlags.length === 0 && (
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-400/70">
                <Shield className="w-3 h-3" /> Asnje event kritik · Profili i riskut eshte i pastër
              </div>
            )}

            {/* Regime details */}
            <div className="flex items-center justify-between text-[9px] text-muted-foreground">
              <span>Regime confidence: {stock.regimeConfidence ?? '?'}%</span>
              <span className="flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />Updated {stock.updatedAt}
              </span>
            </div>
          </div>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1 mt-2 text-[9px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? 'Fshi detajet' : 'Shiko detajet'}
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

  // Loading
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-[140px] rounded-xl" />
        ))}
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <Card className="border-red-500/20 bg-red-500/5">
        <CardContent className="flex items-center gap-2 py-4">
        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
        <span className="text-sm text-red-400">{error}</span>
          <button onClick={fetchData} className="ml-auto text-xs text-red-500 hover:underline">Provo përsëri</button>
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  // No predictions yet
  if (data.topStocks.length === 0) {
    return (
      <div className="space-y-4">
        <Card className="border-border/50 bg-muted/5">
          <CardContent className="py-8 text-center">
            <Zap className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground font-medium">Asnjë kandidat swing aktualisht</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {data.message || 'Ekzekuto një prediction scan për të gjeneruar kandidatë.'}
            </p>
            <div className="mt-3 flex items-center justify-center gap-1 text-[10px] text-muted-foreground/50">
              <Info className="w-3 h-3" />
              Ky seksion tregon vetëm BUY predictions me confidence &ge; 58% dhe risk të ulët
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
          <TrendingUp className="w-4 h-4 text-emerald-500" />
          <span className="text-xs text-muted-foreground">
            {data.topStocks.length} kandidate swing
            {data.totalScanned > 0 && <span className="text-muted-foreground/50"> (prej {data.totalScanned} prediction-eve)</span>}
          </span>
          {data.modelVersion !== 'N/A' && (
            <Badge variant="secondary" className="text-[9px] bg-muted/50">
              {data.modelVersion}
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

      {/* Cards */}
      <div className="space-y-2.5">
        {data.topStocks.map((stock, i) => (
          <SwingCard key={`${stock.symbol}-${stock.horizonDays}`} stock={stock} rank={i + 1} />
        ))}
      </div>

      {/* Footer info */}
      <div className="border border-border/30 rounded-lg px-3 py-2 flex items-start gap-2">
        <Info className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
        <p className="text-[9px] text-muted-foreground/70 leading-relaxed">
          Swing candidates me probabilitet më të lartë për upside 1D, 3D apo 7D. Filtruar: vetëm BUY, confidence ≥ 58%,
          pa event risk kritik, transition risk ≤ 65%. Maksimum 9 stocks (3 per horizon, 2 per sector).
        </p>
      </div>
    </div>
  );
}
