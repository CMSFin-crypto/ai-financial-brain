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
  Crosshair,
  ArrowUp,
  ArrowDown,
  Target,
} from 'lucide-react';
import { motion } from 'framer-motion';

interface SectorStock {
  ticker: string;
  company: string;
  signal: string;
  confidence: number;
  price: number;
  technicalNote: string;
  fundamentalNote: string;
  catalyst: string;
  quickScore: number;
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

function QuickSignalIcon({ signal }: { signal: string }) {
  if (signal?.toUpperCase().includes('BULL')) return <ArrowUp className="w-3.5 h-3.5 text-emerald-500" />;
  if (signal?.toUpperCase().includes('BEAR')) return <ArrowDown className="w-3.5 h-3.5 text-red-500" />;
  return <Minus className="w-3.5 h-3.5 text-amber-500" />;
}

function SectorCard({ sector, onClickStock }: { sector: SectorData; onClickStock: (ticker: string) => void }) {
  const signalColor = sector.overallSignal?.toUpperCase().includes('BULL')
    ? 'border-emerald-500/30 bg-emerald-500/5'
    : sector.overallSignal?.toUpperCase().includes('BEAR')
      ? 'border-red-500/30 bg-red-500/5'
      : 'border-amber-500/30 bg-amber-500/5';

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
            <span className="text-[10px] text-muted-foreground">{sector.sectorConfidence}%</span>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">{sector.trend}</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {sector.stocks.map((stock) => (
            <div
              key={stock.ticker}
              className="flex items-center justify-between p-2 rounded-lg bg-card/50 hover:bg-card transition-colors cursor-pointer group"
              onClick={() => onClickStock(stock.ticker)}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <QuickSignalIcon signal={stock.signal} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold">{stock.ticker}</span>
                    <span className="text-[9px] text-muted-foreground truncate max-w-[80px]">{stock.industry || stock.company}</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground truncate max-w-[200px]">{stock.technicalNote}</p>
                </div>
              </div>
              <div className="text-right flex-shrink-0 ml-2">
                <p className="text-xs font-semibold">${stock.price}</p>
                <div className="flex items-center gap-1">
                  <div className="w-8 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        stock.quickScore >= 70 ? 'bg-emerald-500' : stock.quickScore >= 40 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${stock.quickScore}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground">{stock.quickScore}</span>
                </div>
              </div>
            </div>
          ))}

        </div>
      </CardContent>
    </Card>
  );
}

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
              Kliko në çdo aksion për të hapur analizën e plotë Quant
            </p>
          </div>
        </>
      )}
    </div>
  );
}
