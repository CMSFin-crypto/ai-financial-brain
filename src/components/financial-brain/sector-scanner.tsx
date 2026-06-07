'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Loader2,
  Zap,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Target,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Eye,
  Gauge,
  Crosshair,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

interface SectorStock {
  ticker: string;
  company: string;
  signal: string;
  rating?: string;
  confidence: number;
  price: number;
  entryPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
  upside?: number;
  riskReward?: string;
  quickScore: number;
  technicalNote: string;
  fundamentalNote: string;
  catalyst: string;
  reasoning?: string;
  keyRisks?: string[];
  industry?: string;
}

interface SectorData {
  name: string;
  overallSignal: string;
  sectorConfidence: number;
  trend: string;
  stocks: SectorStock[];
}

interface SectorScanResult {
  marketOverview: {
    condition: string;
    sp500trend: string;
    keyMacroFactors: string[];
    topSectors: string[];
    weakSectors: string[];
  };
  sectors: SectorData[];
}

// ═══════════════════════════════════════════
// RATING BADGE — 5-level system
// ═══════════════════════════════════════════

function getRatingConfig(rating?: string) {
  const r = rating?.toUpperCase() || '';
  if (r.includes('STRONG_BUY')) return {
    label: 'STRONG BUY',
    bg: 'bg-emerald-600',
    text: 'text-white',
    border: 'border-emerald-400',
    icon: <ThumbsUp className="w-3 h-3" />,
    dot: 'bg-emerald-400',
  };
  if (r.includes('BUY') && !r.includes('STRONG')) return {
    label: 'BUY',
    bg: 'bg-emerald-500',
    text: 'text-white',
    border: 'border-emerald-300',
    icon: <ThumbsUp className="w-3 h-3" />,
    dot: 'bg-emerald-300',
  };
  if (r.includes('STRONG_SELL')) return {
    label: 'STRONG SELL',
    bg: 'bg-red-600',
    text: 'text-white',
    border: 'border-red-400',
    icon: <ThumbsDown className="w-3 h-3" />,
    dot: 'bg-red-400',
  };
  if (r.includes('SELL') && !r.includes('STRONG')) return {
    label: 'SELL',
    bg: 'bg-red-500',
    text: 'text-white',
    border: 'border-red-300',
    icon: <ThumbsDown className="w-3 h-3" />,
    dot: 'bg-red-300',
  };
  return {
    label: 'HOLD',
    bg: 'bg-amber-500',
    text: 'text-white',
    border: 'border-amber-300',
    icon: <Eye className="w-3 h-3" />,
    dot: 'bg-amber-300',
  };
}

function getSignalColor(signal: string) {
  if (signal?.toUpperCase().includes('BULL')) return 'text-emerald-500';
  if (signal?.toUpperCase().includes('BEAR')) return 'text-red-500';
  return 'text-amber-500';
}

function StockRatingBadge({ rating, className = '' }: { rating?: string; className?: string }) {
  const config = getRatingConfig(rating);
  return (
    <Badge className={`${config.bg} ${config.text} text-[10px] font-bold px-2 py-0.5 flex items-center gap-1 ${className}`}>
      {config.icon}
      {config.label}
    </Badge>
  );
}

// ═══════════════════════════════════════════
// SCORE BAR
// ═══════════════════════════════════════════

function ScoreBar({ score, size = 'sm' }: { score: number; size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 'w-12' : 'w-20';
  const h = size === 'sm' ? 'h-1.5' : 'h-2';
  return (
    <div className="flex items-center gap-1.5">
      <div className={`${w} ${h} bg-muted rounded-full overflow-hidden`}>
        <div
          className={`h-full rounded-full transition-all ${
            score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500'
          }`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
      <span className={`font-bold ${size === 'sm' ? 'text-[10px]' : 'text-xs'}`}>
        {score}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════
// EXPANDABLE STOCK ROW
// ═══════════════════════════════════════════

function StockRow({ stock, onClickStock }: { stock: SectorStock; onClickStock: (ticker: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const ratingConfig = getRatingConfig(stock.rating);
  const upsideVal = stock.upside ?? 0;

  return (
    <div className="rounded-lg overflow-hidden border border-border/30 bg-card/30 hover:bg-card/60 transition-all">
      {/* Main Row — always visible */}
      <div
        className="flex items-center gap-2 px-2.5 py-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Rating Badge */}
        <StockRatingBadge rating={stock.rating} />

        {/* Ticker + Company */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold">{stock.ticker}</span>
            <span className="text-[10px] text-muted-foreground truncate max-w-[90px]">
              {stock.industry || stock.company}
            </span>
          </div>
        </div>

        {/* Price */}
        <div className="text-right shrink-0">
          <p className="text-xs font-semibold">${stock.price}</p>
        </div>

        {/* Upside */}
        <div className="text-right shrink-0 w-[52px]">
          <span className={`text-[10px] font-bold flex items-center gap-0.5 justify-end ${upsideVal >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {upsideVal >= 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
            {upsideVal >= 0 ? '+' : ''}{upsideVal}%
          </span>
        </div>

        {/* Score */}
        <div className="shrink-0">
          <ScoreBar score={stock.quickScore} />
        </div>

        {/* Expand Icon */}
        <div className="shrink-0">
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded Detail Panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-2.5 pb-3 pt-1 border-t border-border/20 space-y-2.5">

              {/* Price Targets Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {stock.entryPrice && (
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-2 py-1.5">
                    <p className="text-[9px] text-blue-400 font-medium mb-0.5">Entry</p>
                    <p className="text-xs font-bold text-blue-300">${stock.entryPrice}</p>
                  </div>
                )}
                {stock.targetPrice && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1.5">
                    <p className="text-[9px] text-emerald-400 font-medium mb-0.5">Target</p>
                    <p className="text-xs font-bold text-emerald-300">${stock.targetPrice}</p>
                  </div>
                )}
                {stock.stopLoss && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-1.5">
                    <p className="text-[9px] text-red-400 font-medium mb-0.5">Stop Loss</p>
                    <p className="text-xs font-bold text-red-300">${stock.stopLoss}</p>
                  </div>
                )}
                {stock.riskReward && (
                  <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg px-2 py-1.5">
                    <p className="text-[9px] text-cyan-400 font-medium mb-0.5">Risk/Reward</p>
                    <p className="text-xs font-bold text-cyan-300">{stock.riskReward}</p>
                  </div>
                )}
              </div>

              {/* Confidence + Quick Score */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <Gauge className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">Besueshmëria:</span>
                  <span className="text-[10px] font-bold">{stock.confidence}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Crosshair className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">Pikët:</span>
                  <ScoreBar score={stock.quickScore} size="md" />
                </div>
              </div>

              {/* Technical Analysis */}
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-blue-400 flex items-center gap-1">
                  <BarChart3 className="w-3 h-3" /> Analizë Teknike
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{stock.technicalNote}</p>
              </div>

              {/* Fundamental Analysis */}
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-purple-400 flex items-center gap-1">
                  <Target className="w-3 h-3" /> Analizë Fundamentale
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{stock.fundamentalNote}</p>
              </div>

              {/* Catalyst */}
              {stock.catalyst && (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-amber-400 flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Katalizator
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{stock.catalyst}</p>
                </div>
              )}

              {/* Detailed Reasoning */}
              {stock.reasoning && (
                <div className="bg-muted/30 border border-border/20 rounded-lg px-2.5 py-2 space-y-1">
                  <p className="text-[10px] font-semibold text-foreground flex items-center gap-1">
                    💡 Përse {ratingConfig.label}?
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{stock.reasoning}</p>
                </div>
              )}

              {/* Key Risks */}
              {stock.keyRisks && stock.keyRisks.length > 0 && (
                <div className="bg-red-500/5 border border-red-500/15 rounded-lg px-2.5 py-2 space-y-1">
                  <p className="text-[10px] font-semibold text-red-400 flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" /> Rreziqet Kryesore
                  </p>
                  <ul className="space-y-0.5">
                    {stock.keyRisks.map((risk, i) => (
                      <li key={i} className="text-[10px] text-red-300/70 flex items-start gap-1">
                        <AlertTriangle className="w-2.5 h-2.5 mt-0.5 shrink-0 text-red-400/50" />
                        <span>{risk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* CTA — Open Quant Analysis */}
              <Button
                size="sm"
                variant="outline"
                className="w-full text-[10px] h-7 border-primary/30 hover:bg-primary/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onClickStock(stock.ticker);
                }}
              >
                <Crosshair className="w-3 h-3 mr-1" />
                Hap Analizën Quant të Plotë për {stock.ticker}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════
// SECTOR CARD
// ═══════════════════════════════════════════

function SectorCard({ sector, onClickStock }: { sector: SectorData; onClickStock: (ticker: string) => void }) {
  const signalColor = sector.overallSignal?.toUpperCase().includes('BULL')
    ? 'border-emerald-500/30 bg-emerald-500/[0.03]'
    : sector.overallSignal?.toUpperCase().includes('BEAR')
      ? 'border-red-500/30 bg-red-500/[0.03]'
      : 'border-amber-500/30 bg-amber-500/[0.03]';

  // Sort stocks by quickScore descending
  const sortedStocks = [...sector.stocks].sort((a, b) => (b.quickScore || 0) - (a.quickScore || 0));

  // Count ratings
  const strongBuyCount = sortedStocks.filter(s => s.rating?.toUpperCase().includes('STRONG_BUY')).length;
  const buyCount = sortedStocks.filter(s => {
    const r = s.rating?.toUpperCase() || '';
    return r.includes('BUY') && !r.includes('STRONG');
  }).length;
  const holdCount = sortedStocks.filter(s => s.rating?.toUpperCase().includes('HOLD')).length;
  const sellCount = sortedStocks.filter(s => s.rating?.toUpperCase().includes('SELL') && !s.rating?.toUpperCase().includes('STRONG')).length;
  const strongSellCount = sortedStocks.filter(s => s.rating?.toUpperCase().includes('STRONG_SELL')).length;

  return (
    <Card className={`border-border/50 ${signalColor}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold flex items-center gap-2">
            <BarChart3 className="w-3.5 h-3.5" />
            {sector.name}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge
              className={`text-[10px] ${
                sector.overallSignal?.toUpperCase().includes('BULL')
                  ? 'bg-emerald-500 text-white'
                  : sector.overallSignal?.toUpperCase().includes('BEAR')
                    ? 'bg-red-500 text-white'
                    : 'bg-amber-500 text-white'
              }`}
            >
              {sector.overallSignal}
            </Badge>
            <span className="text-[10px] text-muted-foreground font-medium">{sector.sectorConfidence}%</span>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{sector.trend}</p>

        {/* Rating Summary Bar */}
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          {strongBuyCount > 0 && (
            <span className="text-[9px] font-semibold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
              {strongBuyCount} Strong Buy
            </span>
          )}
          {buyCount > 0 && (
            <span className="text-[9px] font-semibold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">
              {buyCount} Buy
            </span>
          )}
          {holdCount > 0 && (
            <span className="text-[9px] font-semibold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
              {holdCount} Hold
            </span>
          )}
          {sellCount > 0 && (
            <span className="text-[9px] font-semibold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">
              {sellCount} Sell
            </span>
          )}
          {strongSellCount > 0 && (
            <span className="text-[9px] font-semibold text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded">
              {strongSellCount} Strong Sell
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {sortedStocks.map((stock) => (
            <StockRow key={stock.ticker} stock={stock} onClickStock={onClickStock} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════
// LEGEND
// ═══════════════════════════════════════════

function RatingLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-muted/20 border border-border/30 rounded-lg">
      <span className="text-[9px] font-medium text-muted-foreground">Legjenda e vlerësimit:</span>
      {[
        { rating: 'STRONG_BUY', label: 'Strong Buy' },
        { rating: 'BUY', label: 'Buy' },
        { rating: 'HOLD', label: 'Hold' },
        { rating: 'SELL', label: 'Sell' },
        { rating: 'STRONG_SELL', label: 'Strong Sell' },
      ].map(({ rating, label }) => (
        <StockRatingBadge key={rating} rating={rating} />
      ))}
      <span className="text-[9px] text-muted-foreground">
        | Kliko në aksion për detaje
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════

export function SectorScanner({ onSelectStock }: { onSelectStock: (ticker: string) => void }) {
  const [scan, setScan] = useState<SectorScanResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSector, setSelectedSector] = useState<string>('all');

  const fetchScan = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/sector-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sector: selectedSector === 'all' ? undefined : selectedSector,
          count: 10,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Scan dështoi');
        return;
      }
      setScan(data.scan);
    } catch {
      setError('Gabim rrjeti');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchScan();
  }, []);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Select value={selectedSector} onValueChange={setSelectedSector}>
          <SelectTrigger className="w-[180px] h-9 text-xs">
            <SelectValue placeholder="Zgjidh sektorin" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Të gjithë sektorët</SelectItem>
            <SelectItem value="Technology">Teknologji</SelectItem>
            <SelectItem value="Semiconductors">Semikonduktorë</SelectItem>
            <SelectItem value="Healthcare">Shëndetësi</SelectItem>
            <SelectItem value="Finance">Financa</SelectItem>
            <SelectItem value="Energy">Energji</SelectItem>
            <SelectItem value="Industry">Industri</SelectItem>
            <SelectItem value="Retail">Retail</SelectItem>
            <SelectItem value="Defense">Mbrojtje</SelectItem>
            <SelectItem value="AI">Inteligjencë Artificiale</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchScan}
          disabled={isLoading}
          className="text-xs"
        >
          {isLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
          Skano Tregun
        </Button>
      </div>

      {/* Rating Legend */}
      <RatingLegend />

      {/* Error */}
      {error && (
        <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg p-3">{error}</div>
      )}

      {/* Loading */}
      {isLoading && !scan && (
        <div className="space-y-4">
          <Skeleton className="h-[80px] rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Skeleton className="h-[350px] rounded-xl" />
            <Skeleton className="h-[350px] rounded-xl" />
            <Skeleton className="h-[350px] rounded-xl" />
          </div>
        </div>
      )}

      {/* Results */}
      {scan && (
        <>
          {/* Market Overview */}
          <Card className="border-border/50 bg-card/50">
            <CardContent className="pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {scan.marketOverview.condition === 'bullish' ? (
                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                  ) : scan.marketOverview.condition === 'bearish' ? (
                    <TrendingDown className="w-5 h-5 text-red-500" />
                  ) : (
                    <Minus className="w-5 h-5 text-amber-500" />
                  )}
                  <div>
                    <p className="text-sm font-semibold capitalize">
                      Tregu: {scan.marketOverview.condition}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      S&P 500: {scan.marketOverview.sp500trend}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(scan.marketOverview.topSectors || []).map((s, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-500">
                      ↑ {s}
                    </Badge>
                  ))}
                  {(scan.marketOverview.weakSectors || []).map((s, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] border-red-500/30 text-red-500">
                      ↓ {s}
                    </Badge>
                  ))}
                </div>
              </div>
              {(scan.marketOverview.keyMacroFactors || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(scan.marketOverview.keyMacroFactors || []).map((f, i) => (
                    <Badge key={i} variant="secondary" className="text-[9px]">
                      <Zap className="w-2.5 h-2.5 mr-0.5 text-cyan-500" /> {f}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sector Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {(scan.sectors || []).map((sector, index) => (
              <motion.div
                key={sector.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * index }}
              >
                <SectorCard sector={sector} onClickStock={onSelectStock} />
              </motion.div>
            ))}
          </div>

          {/* Tip */}
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">
              Kliko në çdo aksion për të parë detajet e vlerësimit, ose shtyp &quot;Hap Analizën Quant&quot; për analizën e plotë
            </p>
          </div>
        </>
      )}
    </div>
  );
}
