'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Search,
  Loader2,
  Building2,
  TrendingUp,
  TrendingDown,
  Shield,
  Award,
  Target,
  AlertTriangle,
  DollarSign,
  BarChart3,
  PieChart,
} from 'lucide-react';
import { StockSearch } from './stock-search';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';

interface FundamentalAnalysisResult {
  ticker: string;
  company: string;
  sector: string;
  industry: string;
  overallRating: string;
  score: number;
  valuation: {
    marketCap: string;
    peRatio: number;
    forwardPE: number;
    pegRatio: number;
    priceToSales: number;
    priceToBook: number;
    evToEBITDA: number;
    dividendYield: string;
    rating: string;
    summary: string;
  };
  profitability: {
    grossMargin: string;
    operatingMargin: string;
    netMargin: string;
    returnOnEquity: string;
    returnOnAssets: string;
    returnOnInvestment: string;
    rating: string;
    summary: string;
  };
  growth: {
    revenueGrowth: string;
    earningsGrowth: string;
    revenueGrowth3Y: string;
    earningsGrowth3Y: string;
    quarterlyRevenueGrowth: string;
    quarterlyEarningsGrowth: string;
    rating: string;
    summary: string;
  };
  financialHealth: {
    currentRatio: number;
    quickRatio: number;
    debtToEquity: number;
    debtToAssets: number;
    freeCashFlow: string;
    rating: string;
    summary: string;
  };
  earnings: {
    eps: string;
    epsGrowth: string;
    forwardEps: string;
    nextEarningsDate: string;
    surprises: Array<{ quarter: string; expected: string; actual: string; surprise: string }>;
    rating: string;
    summary: string;
  };
  competitiveAdvantage: {
    moat: string;
    brandStrength: number;
    marketPosition: string;
    keyStrengths: string[];
    keyWeaknesses: string[];
  };
  analystConsensus: {
    rating: string;
    targetPrice: string;
    lowTarget: string;
    highTarget: string;
    buyRatings: number;
    holdRatings: number;
    sellRatings: number;
    averageRating: number;
  };
  summary: string;
  verdict: string;
  risks: string[];
}

function RatingBadge({ rating }: { rating: string }) {
  const colors: Record<string, string> = {
    STRONG_BUY: 'bg-emerald-600 text-white',
    BUY: 'bg-emerald-500 text-white',
    HOLD: 'bg-amber-500 text-white',
    SELL: 'bg-red-500 text-white',
    STRONG_SELL: 'bg-red-600 text-white',
    EXCELLENT: 'bg-emerald-500 text-white',
    GOOD: 'bg-emerald-400 text-white',
    AVERAGE: 'bg-amber-500 text-white',
    POOR: 'bg-red-500 text-white',
    STRONG: 'bg-emerald-500 text-white',
    MODERATE: 'bg-amber-500 text-white',
    WEAK: 'bg-red-500 text-white',
    UNDERVALUED: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
    OVERVALUED: 'bg-red-500/10 text-red-500 border-red-500/30',
    FAIRLY_VALUED: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
    WIDE: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
    NARROW: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
    NONE: 'bg-red-500/10 text-red-500 border-red-500/30',
  };

  return (
    <Badge variant="outline" className={`text-[10px] font-semibold ${colors[rating] || ''}`}>
      {rating.replace(/_/g, ' ')}
    </Badge>
  );
}

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[11px] font-semibold">{value}</span>
    </div>
  );
}

export function FundamentalAnalysis() {
  const [ticker, setTicker] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<FundamentalAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAnalysisForTicker = async (tickerSymbol?: string) => {
    const sym = (tickerSymbol || ticker).trim().toUpperCase();
    if (!sym) return;
    setTicker(sym);
    setIsLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const res = await fetch('/api/fundamental-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: sym }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Analiza dështoi');
        return;
      }
      setAnalysis(data.analysis);
    } catch {
      setError('Gabim rrjeti. Provo përsëri.');
    } finally {
      setIsLoading(false);
    }
  };

  const runAnalysis = () => runAnalysisForTicker();

  // Radar chart data
  const getRadarData = () => {
    if (!analysis) return [];
    return [
      { subject: 'Vlerësimi', value: analysis.valuation.rating === 'UNDERVALUED' ? 85 : analysis.valuation.rating === 'FAIRLY_VALUED' ? 60 : 30 },
      { subject: 'Fitueshmëria', value: analysis.profitability.rating === 'EXCELLENT' ? 90 : analysis.profitability.rating === 'GOOD' ? 70 : 40 },
      { subject: 'Rritja', value: analysis.growth.rating === 'STRONG' ? 85 : analysis.growth.rating === 'MODERATE' ? 60 : 35 },
      { subject: 'Shëndeti', value: analysis.financialHealth.rating === 'STRONG' ? 85 : analysis.financialHealth.rating === 'MODERATE' ? 60 : 30 },
      { subject: 'Fitimi', value: analysis.earnings.rating === 'STRONG' ? 80 : analysis.earnings.rating === 'MODERATE' ? 60 : 35 },
      { subject: 'Moat', value: analysis.competitiveAdvantage.brandStrength * 10 },
    ];
  };

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="flex gap-2">
        <StockSearch
          onSelect={(t) => runAnalysisForTicker(t)}
          onQueryChange={(q) => setSearchQuery(q)}
          placeholder="Kërko ticker-in... AAPL, VRT, GLW"
          className="flex-1"
          inputClassName="h-10 text-sm"
        />
        <Button
          onClick={() => runAnalysisForTicker(searchQuery || ticker)}
          disabled={isLoading || !(searchQuery.trim() || ticker.trim())}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4 mr-1.5" />}
          Analizo
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-[100px] rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Skeleton className="h-[250px] rounded-xl" />
            <Skeleton className="h-[250px] rounded-xl" />
          </div>
        </div>
      )}

      {/* Results */}
      {analysis && !isLoading && (
        <div className="space-y-4">
          {/* Header */}
          <Card className="border-border/50 bg-card/50">
            <CardContent className="pt-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-2xl font-bold">{analysis.ticker}</h3>
                    <RatingBadge rating={analysis.overallRating} />
                  </div>
                  <p className="text-sm text-muted-foreground">{analysis.company}</p>
                  <p className="text-xs text-muted-foreground">{analysis.sector} • {analysis.industry}</p>
                </div>
                <div className="text-center sm:text-right">
                  <p className="text-xs text-muted-foreground">Score Total</p>
                  <p className="text-3xl font-bold">{analysis.score}<span className="text-lg text-muted-foreground">/100</span></p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="pt-5">
              <p className="text-sm leading-relaxed text-muted-foreground">{analysis.summary}</p>
              <p className="text-sm leading-relaxed mt-2 font-medium">{analysis.verdict}</p>
            </CardContent>
          </Card>

          {/* Radar + Analyst Consensus */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-emerald-500" />
                  Score Radari
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={getRadarData()}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 8 }} />
                      <Radar
                        name="Score"
                        dataKey="value"
                        stroke="#21c55e"
                        fill="#21c55e"
                        fillOpacity={0.2}
                        strokeWidth={2}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {analysis.analystConsensus && (
              <Card className="border-border/50 bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Target className="w-4 h-4 text-amber-500" />
                    Konsensusi i Analistëve
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <RatingBadge rating={analysis.analystConsensus.rating} />
                    <span className="text-lg font-bold">${analysis.analystConsensus.targetPrice}</span>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="bg-muted/50 px-2 py-1 rounded">Low: ${analysis.analystConsensus.lowTarget}</span>
                    <span className="bg-muted/50 px-2 py-1 rounded">High: ${analysis.analystConsensus.highTarget}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-3 h-3 rounded-sm bg-emerald-500" />
                      <span className="flex-1">Blej: {analysis.analystConsensus.buyRatings}</span>
                      <Progress value={(analysis.analystConsensus.buyRatings / (analysis.analystConsensus.buyRatings + analysis.analystConsensus.holdRatings + analysis.analystConsensus.sellRatings)) * 100} className="flex-1 h-1.5 [&>div]:bg-emerald-500" />
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-3 h-3 rounded-sm bg-amber-500" />
                      <span className="flex-1">Mbaj: {analysis.analystConsensus.holdRatings}</span>
                      <Progress value={(analysis.analystConsensus.holdRatings / (analysis.analystConsensus.buyRatings + analysis.analystConsensus.holdRatings + analysis.analystConsensus.sellRatings)) * 100} className="flex-1 h-1.5 [&>div]:bg-amber-500" />
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-3 h-3 rounded-sm bg-red-500" />
                      <span className="flex-1">Shit: {analysis.analystConsensus.sellRatings}</span>
                      <Progress value={(analysis.analystConsensus.sellRatings / (analysis.analystConsensus.buyRatings + analysis.analystConsensus.holdRatings + analysis.analystConsensus.sellRatings)) * 100} className="flex-1 h-1.5 [&>div]:bg-red-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Valuation */}
          {analysis.valuation && (
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-500" />
                  Vlerësimi
                  <div className="ml-auto">
                    <RatingBadge rating={analysis.valuation.rating} />
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <MetricRow label="Market Cap" value={analysis.valuation.marketCap} />
                  <MetricRow label="P/E Ratio" value={analysis.valuation.peRatio} />
                  <MetricRow label="Forward P/E" value={analysis.valuation.forwardPE} />
                  <MetricRow label="PEG Ratio" value={analysis.valuation.pegRatio} />
                  <MetricRow label="P/S Ratio" value={analysis.valuation.priceToSales} />
                  <MetricRow label="P/B Ratio" value={analysis.valuation.priceToBook} />
                  <MetricRow label="EV/EBITDA" value={analysis.valuation.evToEBITDA} />
                  <MetricRow label="Dividend Yield" value={analysis.valuation.dividendYield} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">{analysis.valuation.summary}</p>
              </CardContent>
            </Card>
          )}

          {/* Profitability + Growth + Financial Health + Earnings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Profitability */}
            {analysis.profitability && (
              <Card className="border-border/50 bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    Fitueshmëria
                    <div className="ml-auto">
                      <RatingBadge rating={analysis.profitability.rating} />
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <MetricRow label="Gross Margin" value={analysis.profitability.grossMargin} />
                  <MetricRow label="Operating Margin" value={analysis.profitability.operatingMargin} />
                  <MetricRow label="Net Margin" value={analysis.profitability.netMargin} />
                  <MetricRow label="ROE" value={analysis.profitability.returnOnEquity} />
                  <MetricRow label="ROA" value={analysis.profitability.returnOnAssets} />
                  <MetricRow label="ROI" value={analysis.profitability.returnOnInvestment} />
                  <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">{analysis.profitability.summary}</p>
                </CardContent>
              </Card>
            )}

            {/* Growth */}
            {analysis.growth && (
              <Card className="border-border/50 bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-amber-500" />
                    Rritja
                    <div className="ml-auto">
                      <RatingBadge rating={analysis.growth.rating} />
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <MetricRow label="Rritja e të Ardhurave" value={analysis.growth.revenueGrowth} />
                  <MetricRow label="Rritja e Fitimeve" value={analysis.growth.earningsGrowth} />
                  <MetricRow label="Rritja 3-vjeçare (Ardhura)" value={analysis.growth.revenueGrowth3Y} />
                  <MetricRow label="Rritja 3-vjeçare (Fitime)" value={analysis.growth.earningsGrowth3Y} />
                  <MetricRow label="Kuartali Ardhura" value={analysis.growth.quarterlyRevenueGrowth} />
                  <MetricRow label="Kuartali Fitime" value={analysis.growth.quarterlyEarningsGrowth} />
                  <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">{analysis.growth.summary}</p>
                </CardContent>
              </Card>
            )}

            {/* Financial Health */}
            {analysis.financialHealth && (
              <Card className="border-border/50 bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Shield className="w-4 h-4 text-teal-500" />
                    Shëndeti Financiar
                    <div className="ml-auto">
                      <RatingBadge rating={analysis.financialHealth.rating} />
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <MetricRow label="Current Ratio" value={analysis.financialHealth.currentRatio} />
                  <MetricRow label="Quick Ratio" value={analysis.financialHealth.quickRatio} />
                  <MetricRow label="Debt/Equity" value={analysis.financialHealth.debtToEquity} />
                  <MetricRow label="Debt/Assets" value={analysis.financialHealth.debtToAssets} />
                  <MetricRow label="Free Cash Flow" value={analysis.financialHealth.freeCashFlow} />
                  <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">{analysis.financialHealth.summary}</p>
                </CardContent>
              </Card>
            )}

            {/* Earnings */}
            {analysis.earnings && (
              <Card className="border-border/50 bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-500" />
                    Fitimi (EPS)
                    <div className="ml-auto">
                      <RatingBadge rating={analysis.earnings.rating} />
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <MetricRow label="EPS" value={analysis.earnings.eps} />
                  <MetricRow label="EPS Rritja" value={analysis.earnings.epsGrowth} />
                  <MetricRow label="Forward EPS" value={analysis.earnings.forwardEps} />
                  <MetricRow label="Fitimi i Ardhshëm" value={analysis.earnings.nextEarningsDate} />
                  {analysis.earnings.surprises && analysis.earnings.surprises.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground">Surprizat e fundit:</p>
                      {analysis.earnings.surprises.map((s, i) => (
                        <div key={i} className="text-[10px] flex justify-between bg-muted/30 rounded px-2 py-1">
                          <span>{s.quarter}</span>
                          <span className={s.surprise.startsWith('+') ? 'text-emerald-500' : 'text-red-500'}>
                            {s.surprise}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">{analysis.earnings.summary}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Competitive Advantage */}
          {analysis.competitiveAdvantage && (
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-500" />
                  Avantazhi Konkurrues (Moat)
                  <div className="ml-auto">
                    <RatingBadge rating={analysis.competitiveAdvantage.moat} />
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{analysis.competitiveAdvantage.marketPosition}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-medium text-emerald-500 mb-1">Pikë të Forta</p>
                    <ul className="space-y-1">
                      {analysis.competitiveAdvantage.keyStrengths.map((s, i) => (
                        <li key={i} className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <span className="w-1 h-1 bg-emerald-500 rounded-full" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-red-500 mb-1">Pikë të Dobëta</p>
                    <ul className="space-y-1">
                      {analysis.competitiveAdvantage.keyWeaknesses.map((w, i) => (
                        <li key={i} className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <span className="w-1 h-1 bg-red-500 rounded-full" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Risks */}
          {analysis.risks && analysis.risks.length > 0 && (
            <Card className="border-red-500/20 bg-red-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  Risket Kryesore
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {analysis.risks.map((risk, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                      <span className="leading-relaxed">{risk}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
