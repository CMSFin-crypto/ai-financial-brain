'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  AlertTriangle,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Crosshair,
  Activity,
  BarChart3,
  Newspaper,
  Globe,
  Swords,
  Scale,
  Zap,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Gauge,
} from 'lucide-react';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';

interface QuantResult {
  ticker: string;
  company: string;
  sector: string;
  currentPrice: number;
  technical: {
    signal: string;
    confidence: number;
    shortTermTrend: string;
    mediumTermTrend: string;
    longTermTrend: string;
    rsi?: { value: number; signal: string };
    macd?: { value: number; signal: string; histogram?: number };
    sma?: { sma20: string; sma50: string; sma200: string; goldenCross?: boolean; deathCross?: boolean };
    adx?: { value: number; signal: string; strength: string };
    bollingerBands?: { upper: string; middle: string; lower: string; position: string };
    stochastic?: { k: number; d: number; signal: string };
    atr?: { value: number; volatility: string };
    volume?: { trend: string; signal: string; vsAverage: string };
    pivotPoints?: { pp: string; s1: string; s2: string; s3: string; r1: string; r2: string; r3: string };
    supportLevels: string[];
    resistanceLevels: string[];
    patterns: Array<{ name: string; type: string; reliability: string }>;
    whyMayFail: string;
    entryZone?: string;
    stopLoss?: string;
    takeProfits?: { tp1: string; tp2: string; tp3: string };
  };
  fundamental: {
    signal: string;
    confidence: number;
    revenue?: { annual: string; growth: string };
    eps?: { current: string; forward: string; growth: string };
    margins?: { gross: string; operating: string; net: string };
    valuation?: { pe: number; forwardPE: number; peg: number; vsSector: string };
    financialHealth?: { rating: string };
    moat?: { type: string };
    analystConsensus?: { rating: string; target: string };
    whyMayFail: string;
  };
  macro: {
    signal: string;
    confidence: number;
    interestRates?: { fedRate: string; trend: string; impact: string };
    yieldCurve?: { status: string; impact: string };
    inflation?: { cpi: string; trend: string; impact: string };
    fedStance?: string;
    keyFactors: string[];
    sectorImpact?: string;
    whyMayFail: string;
  };
  newsGeopolitical: {
    signal: string;
    confidence: number;
    newsItems: Array<{ headline: string; impactScore: number; sentiment: string; category: string }>;
    geopoliticalRisks: string[];
    sentiment?: string;
    whyMayFail: string;
  };
  debate: {
    bullCase: { summary: string; bestCase: string; catalysts: string[]; probability: number };
    bearCase: { summary: string; worstCase: string; headwinds: string[]; probability: number };
    riskManager: {
      confirmations: number;
      confirmationDetail: string;
      contradictions: string[];
      riskReward: string;
      positionSize: string;
      maxRiskPerTrade: string;
      noGoConditions: string[];
      positionSizing: string;
    };
  };
  scoring: {
    technical: { signal: number; weightedScore: number };
    fundamental: { signal: number; weightedScore: number };
    macro: { signal: number; weightedScore: number };
    newsGeopolitical: { signal: number; weightedScore: number };
    totalScore: number;
    threshold: string;
  };
  final: {
    ticker: string;
    bias: string;
    setup: string;
    entry: string;
    stop: string;
    targets: { tp1: string; tp2: string; tp3: string };
    probability: string;
    timeframe: string;
    riskReward: string;
    mainDrivers: string[];
    riskFactors: string[];
    verdict: string;
    confidence: number;
    positionSize?: string;
  };
}

function SignalBadge({ signal }: { signal: string }) {
  const s = (signal || '').toUpperCase();
  if (s.includes('BULL') || s.includes('BUY') || s === '1')
    return <Badge className="bg-emerald-500 text-white text-[10px]">{signal}</Badge>;
  if (s.includes('BEAR') || s.includes('SELL') || s === '-1')
    return <Badge className="bg-red-500 text-white text-[10px]">{signal}</Badge>;
  return <Badge className="bg-amber-500 text-white text-[10px]">{signal || 'NEUTRAL'}</Badge>;
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const v = (verdict || '').toUpperCase();
  if (v.includes('STRONG_BUY'))
    return <Badge className="bg-emerald-600 text-white text-xs px-3 py-1 font-bold">STRONG BUY</Badge>;
  if (v === 'BUY')
    return <Badge className="bg-emerald-500 text-white text-xs px-3 py-1 font-bold">BUY</Badge>;
  if (v.includes('LEAN_BULL'))
    return <Badge className="bg-emerald-500/70 text-white text-xs px-3 py-1">LEAN BULLISH</Badge>;
  if (v.includes('LEAN_BEAR'))
    return <Badge className="bg-red-500/70 text-white text-xs px-3 py-1">LEAN BEARISH</Badge>;
  if (v === 'SELL')
    return <Badge className="bg-red-500 text-white text-xs px-3 py-1 font-bold">SELL</Badge>;
  if (v.includes('STRONG_SELL'))
    return <Badge className="bg-red-600 text-white text-xs px-3 py-1 font-bold">STRONG SELL</Badge>;
  return <Badge className="bg-gray-500 text-white text-xs px-3 py-1">NO TRADE / WAIT</Badge>;
}

function AgentCard({ title, icon, signal, confidence, children, whyMayFail }: {
  title: string;
  icon: React.ReactNode;
  signal: string;
  confidence: number;
  children: React.ReactNode;
  whyMayFail: string;
}) {
  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
          <div className="flex items-center gap-2">
            <SignalBadge signal={signal} />
            <span className="text-[10px] text-muted-foreground">{confidence}%</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {children}
        <Separator className="my-2" />
        <div className="flex items-start gap-1.5">
          <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-red-400/80 leading-relaxed">{whyMayFail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function QuantDashboard() {
  const [ticker, setTicker] = useState('');
  const [universe, setUniverse] = useState('sp500');
  const [timeframe, setTimeframe] = useState('swing');
  const [riskPerTrade, setRiskPerTrade] = useState('1');
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<QuantResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    agents: true, debate: true, scoring: true, final: true,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const runAnalysis = async () => {
    if (!ticker.trim()) return;
    setIsLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const res = await fetch('/api/quant-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: ticker.trim().toUpperCase(),
          universe,
          timeframe,
          riskPerTrade: Number(riskPerTrade),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Analiza dështoi');
        return;
      }
      setAnalysis(data.analysis);
      setIsDemo(!!data.demo);
    } catch {
      setError('Gabim rrjeti');
    } finally {
      setIsLoading(false);
    }
  };

  const scoringRadar = analysis ? [
    { subject: 'Teknike', value: Math.abs(analysis.scoring?.technical?.weightedScore || 0) * 1.5 },
    { subject: 'Fundamentale', value: Math.abs(analysis.scoring?.fundamental?.weightedScore || 0) * 2 },
    { subject: 'Makro', value: Math.abs(analysis.scoring?.macro?.weightedScore || 0) * 2.5 },
    { subject: 'Lajme/Geo', value: Math.abs(analysis.scoring?.newsGeopolitical?.weightedScore || 0) * 2.5 },
  ] : [];

  const scoringBar = analysis ? [
    { name: 'Teknike (35%)', score: analysis.scoring?.technical?.weightedScore || 0, max: 35, color: '#10b981' },
    { name: 'Fundam. (25%)', score: analysis.scoring?.fundamental?.weightedScore || 0, max: 25, color: '#f59e0b' },
    { name: 'Makro (20%)', score: analysis.scoring?.macro?.weightedScore || 0, max: 20, color: '#06b6d4' },
    { name: 'Lajme (20%)', score: analysis.scoring?.newsGeopolitical?.weightedScore || 0, max: 20, color: '#8b5cf6' },
  ] : [];

  return (
    <div className="space-y-4">
      {/* Configuration Bar */}
      <Card className="border-border/50 bg-card/50">
        <CardContent className="pt-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Shkruaj ticker... AAPL, NVDA, MSFT..."
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && runAnalysis()}
                className="pl-9 h-10 text-sm"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={universe} onValueChange={setUniverse}>
                <SelectTrigger className="w-[130px] h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sp500">S&P 500</SelectItem>
                  <SelectItem value="tech">Tech Only</SelectItem>
                  <SelectItem value="high-liquidity">High Liquidity</SelectItem>
                </SelectContent>
              </Select>
              <Select value={timeframe} onValueChange={setTimeframe}>
                <SelectTrigger className="w-[140px] h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="swing">Swing Trade</SelectItem>
                  <SelectItem value="day">Day Trading</SelectItem>
                  <SelectItem value="long-term">Long Term</SelectItem>
                </SelectContent>
              </Select>
              <Select value={riskPerTrade} onValueChange={setRiskPerTrade}>
                <SelectTrigger className="w-[100px] h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.5">0.5% Risk</SelectItem>
                  <SelectItem value="1">1% Risk</SelectItem>
                  <SelectItem value="2">2% Risk</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={runAnalysis} disabled={isLoading || !ticker.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white h-10">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4 mr-1.5" />}
                Quant Analyzo
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-4 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-red-500 font-medium">{error}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Nëse problemi vazhdon, provoni të rifilloni aplikacionin.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={runAnalysis}
            className="border-red-500/30 text-red-500 hover:bg-red-500/10"
          >
            <Activity className="w-3 h-3 mr-1.5" />
            Provo Përsëri
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-[120px] rounded-xl" />
          <Skeleton className="h-[400px] rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-[250px] rounded-xl" />
            <Skeleton className="h-[250px] rounded-xl" />
          </div>
        </div>
      )}

      {analysis && !isLoading && (
        <div className="space-y-4">
          {/* Demo Banner */}
          {isDemo && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-amber-500 font-medium">Modaliteti Demo — AI i pavlefshëm</p>
                <p className="text-[10px] text-muted-foreground">Të dhënat e mëposhtme janë simulime realistike. Kur AI të jetë në linjë, do të shihni analiza reale.</p>
              </div>
            </div>
          )}

          {/* FINAL VERDICT — Top Banner */}
          <Card className={`border-2 ${
            analysis.final?.verdict?.toUpperCase().includes('BUY')
              ? 'border-emerald-500/50 bg-gradient-to-r from-emerald-500/10 to-teal-500/10'
              : analysis.final?.verdict?.toUpperCase().includes('SELL')
                ? 'border-red-500/50 bg-gradient-to-r from-red-500/10 to-rose-500/10'
                : 'border-gray-500/50 bg-gradient-to-r from-gray-500/10 to-slate-500/10'
          }`}>
            <CardContent className="pt-5">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold">{analysis.ticker}</h2>
                    <VerdictBadge verdict={analysis.final?.verdict || ''} />
                    <Badge variant="outline" className="text-xs">
                      {analysis.final?.timeframe?.replace('-', ' ').toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{analysis.company} • {analysis.sector}</p>
                  <p className="text-sm">{analysis.final?.setup}</p>
                  {analysis.final?.mainDrivers && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {analysis.final.mainDrivers.map((d, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-500">
                          {d}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right space-y-1">
                  <p className="text-xs text-muted-foreground">Besueshmëria</p>
                  <p className="text-3xl font-bold">{analysis.final?.confidence}%</p>
                  <p className="text-xs text-muted-foreground">
                    Score: {analysis.scoring?.totalScore?.toFixed(1)}
                  </p>
                </div>
              </div>

              {/* Entry / Stop / Targets */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <div className="bg-card/80 rounded-lg p-3 border border-border/50">
                  <p className="text-[10px] text-muted-foreground">Hyrja (Entry)</p>
                  <p className="text-lg font-bold">{analysis.final?.entry}</p>
                </div>
                <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/30">
                  <p className="text-[10px] text-red-500">Stop Loss</p>
                  <p className="text-lg font-bold text-red-500">{analysis.final?.stop}</p>
                </div>
                <div className="bg-emerald-500/10 rounded-lg p-3 border border-emerald-500/30">
                  <p className="text-[10px] text-emerald-500">Target 1</p>
                  <p className="text-lg font-bold text-emerald-500">{analysis.final?.targets?.tp1}</p>
                </div>
                <div className="bg-emerald-500/10 rounded-lg p-3 border border-emerald-500/30">
                  <p className="text-[10px] text-emerald-500">Target 2</p>
                  <p className="text-lg font-bold text-emerald-500">{analysis.final?.targets?.tp2}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-2">
                <div className="bg-muted/50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-muted-foreground">Probabiliteti</p>
                  <p className="text-sm font-bold">{analysis.final?.probability}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-muted-foreground">Risk/Reward</p>
                  <p className="text-sm font-bold">{analysis.final?.riskReward}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-muted-foreground">Pozicioni</p>
                  <p className="text-xs font-bold">{analysis.final?.positionSize || '—'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SCORING ENGINE */}
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleSection('scoring')}>
            <Scale className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-bold">Scoring Engine</h3>
            <Badge variant="secondary" className="text-[10px]">{analysis.scoring?.threshold}</Badge>
            <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${expandedSections.scoring ? 'rotate-180' : ''}`} />
          </div>
          {expandedSections.scoring && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card className="border-border/50 bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs">Score Radari</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={scoringRadar}>
                        <PolarGrid stroke="hsl(var(--border))" />
                        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                        <PolarRadiusAxis domain={[0, 50]} tick={{ fontSize: 8 }} />
                        <Radar name="Score" dataKey="value" stroke="#10b981" fill="#10b981" fillOpacity={0.2} strokeWidth={2} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/50 bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs">Peshat e Agjentëve</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={scoringBar} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis type="number" domain={[-35, 35]} tick={{ fontSize: 9 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={80} />
                        <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '11px' }} />
                        <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={16}>
                          {scoringBar.map((entry, index) => (
                            <Cell key={index} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* MULTI-AGENT ANALYSIS */}
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleSection('agents')}>
            <Gauge className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-bold">Multi-Agent Analysis</h3>
            <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${expandedSections.agents ? 'rotate-180' : ''}`} />
          </div>
          {expandedSections.agents && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Technical Agent */}
              <AgentCard
                title="Agent 1: Teknike (35%)"
                icon={<Activity className="w-3.5 h-3.5 text-emerald-500" />}
                signal={analysis.technical?.signal}
                confidence={analysis.technical?.confidence}
                whyMayFail={analysis.technical?.whyMayFail}
              >
                <div className="space-y-2">
                  <div className="flex gap-2 flex-wrap text-[10px]">
                    <span className={`px-1.5 py-0.5 rounded ${analysis.technical?.shortTermTrend === 'uptrend' ? 'bg-emerald-500/10 text-emerald-500' : analysis.technical?.shortTermTrend === 'downtrend' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'}`}>
                      Shkurt: {analysis.technical?.shortTermTrend}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded ${analysis.technical?.mediumTermTrend === 'uptrend' ? 'bg-emerald-500/10 text-emerald-500' : analysis.technical?.mediumTermTrend === 'downtrend' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'}`}>
                      Mesëm: {analysis.technical?.mediumTermTrend}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded ${analysis.technical?.longTermTrend === 'uptrend' ? 'bg-emerald-500/10 text-emerald-500' : analysis.technical?.longTermTrend === 'downtrend' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'}`}>
                      Gjatë: {analysis.technical?.longTermTrend}
                    </span>
                  </div>
                  {analysis.technical?.sma?.goldenCross && (
                    <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]">Golden Cross ✓</Badge>
                  )}
                  {analysis.technical?.sma?.deathCross && (
                    <Badge className="bg-red-500/10 text-red-500 border-red-500/30 text-[10px]">Death Cross ✗</Badge>
                  )}
                  <div className="grid grid-cols-3 gap-1 text-[10px]">
                    {analysis.technical?.rsi && (
                      <div className="bg-muted/30 rounded p-1.5">
                        <p className="text-muted-foreground">RSI</p>
                        <p className="font-semibold">{analysis.technical.rsi.value}</p>
                      </div>
                    )}
                    {analysis.technical?.adx && (
                      <div className="bg-muted/30 rounded p-1.5">
                        <p className="text-muted-foreground">ADX</p>
                        <p className="font-semibold">{analysis.technical.adx.value}</p>
                      </div>
                    )}
                    {analysis.technical?.macd && (
                      <div className="bg-muted/30 rounded p-1.5">
                        <p className="text-muted-foreground">MACD</p>
                        <p className="font-semibold">{analysis.technical.macd.signal}</p>
                      </div>
                    )}
                  </div>
                  {/* Pivot Points */}
                  {analysis.technical?.pivotPoints && (
                    <div className="mt-1">
                      <p className="text-[10px] font-semibold mb-1">Pivot Points</p>
                      <div className="grid grid-cols-4 gap-1 text-[9px]">
                        <div className="bg-muted/30 rounded p-1 text-center"><p className="text-muted-foreground">S2</p>{analysis.technical.pivotPoints.s2}</div>
                        <div className="bg-muted/30 rounded p-1 text-center"><p className="text-muted-foreground">S1</p>{analysis.technical.pivotPoints.s1}</div>
                        <div className="bg-emerald-500/10 rounded p-1 text-center"><p className="text-emerald-500">PP</p>{analysis.technical.pivotPoints.pp}</div>
                        <div className="bg-muted/30 rounded p-1 text-center"><p className="text-muted-foreground">R1</p>{analysis.technical.pivotPoints.r1}</div>
                      </div>
                    </div>
                  )}
                  {/* Support/Resistance */}
                  <div className="flex gap-1 flex-wrap">
                    {(analysis.technical?.supportLevels || []).slice(0, 3).map((s, i) => (
                      <Badge key={i} variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-500">S: ${s}</Badge>
                    ))}
                    {(analysis.technical?.resistanceLevels || []).slice(0, 3).map((r, i) => (
                      <Badge key={i} variant="outline" className="text-[9px] border-red-500/30 text-red-500">R: ${r}</Badge>
                    ))}
                  </div>
                </div>
              </AgentCard>

              {/* Fundamental Agent */}
              <AgentCard
                title="Agent 2: Fundamentale (25%)"
                icon={<BarChart3 className="w-3.5 h-3.5 text-amber-500" />}
                signal={analysis.fundamental?.signal}
                confidence={analysis.fundamental?.confidence}
                whyMayFail={analysis.fundamental?.whyMayFail}
              >
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    {analysis.fundamental?.valuation?.pe && (
                      <div className="bg-muted/30 rounded p-1.5">
                        <p className="text-muted-foreground">P/E</p>
                        <p className="font-semibold">{analysis.fundamental.valuation.pe}</p>
                      </div>
                    )}
                    {analysis.fundamental?.valuation?.forwardPE && (
                      <div className="bg-muted/30 rounded p-1.5">
                        <p className="text-muted-foreground">Fwd P/E</p>
                        <p className="font-semibold">{analysis.fundamental.valuation.forwardPE}</p>
                      </div>
                    )}
                    {analysis.fundamental?.valuation?.peg && (
                      <div className="bg-muted/30 rounded p-1.5">
                        <p className="text-muted-foreground">PEG</p>
                        <p className="font-semibold">{analysis.fundamental.valuation.peg}</p>
                      </div>
                    )}
                    {analysis.fundamental?.eps?.growth && (
                      <div className="bg-muted/30 rounded p-1.5">
                        <p className="text-muted-foreground">EPS Gr</p>
                        <p className="font-semibold">{analysis.fundamental.eps.growth}</p>
                      </div>
                    )}
                    {analysis.fundamental?.revenue?.growth && (
                      <div className="bg-muted/30 rounded p-1.5">
                        <p className="text-muted-foreground">Rev Gr</p>
                        <p className="font-semibold">{analysis.fundamental.revenue.growth}</p>
                      </div>
                    )}
                    {analysis.fundamental?.moat && (
                      <div className="bg-muted/30 rounded p-1.5">
                        <p className="text-muted-foreground">Moat</p>
                        <p className="font-semibold">{analysis.fundamental.moat.type}</p>
                      </div>
                    )}
                  </div>
                  {analysis.fundamental?.analystConsensus && (
                    <div className="bg-muted/30 rounded p-1.5 text-[10px] flex justify-between">
                      <span className="text-muted-foreground">Konsensusi</span>
                      <span className="font-semibold">{analysis.fundamental.analystConsensus.rating} @ ${analysis.fundamental.analystConsensus.target}</span>
                    </div>
                  )}
                  {analysis.fundamental?.financialHealth && (
                    <div className="text-[10px] flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-500" />
                      Shëndeti: {analysis.fundamental.financialHealth.rating}
                    </div>
                  )}
                </div>
              </AgentCard>

              {/* Macro Agent */}
              <AgentCard
                title="Agent 3: Makro (20%)"
                icon={<Globe className="w-3.5 h-3.5 text-cyan-500" />}
                signal={analysis.macro?.signal}
                confidence={analysis.macro?.confidence}
                whyMayFail={analysis.macro?.whyMayFail}
              >
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    {analysis.macro?.interestRates && (
                      <div className="bg-muted/30 rounded p-1.5">
                        <p className="text-muted-foreground">Fed Rate</p>
                        <p className="font-semibold">{analysis.macro.interestRates.fedRate}</p>
                        <p className="text-[9px] text-emerald-500">{analysis.macro.interestRates.trend}</p>
                      </div>
                    )}
                    {analysis.macro?.yieldCurve && (
                      <div className="bg-muted/30 rounded p-1.5">
                        <p className="text-muted-foreground">Yield Curve</p>
                        <p className="font-semibold">{analysis.macro.yieldCurve.status}</p>
                      </div>
                    )}
                    {analysis.macro?.inflation && (
                      <div className="bg-muted/30 rounded p-1.5">
                        <p className="text-muted-foreground">CPI</p>
                        <p className="font-semibold">{analysis.macro.inflation.cpi}</p>
                        <p className="text-[9px] text-emerald-500">{analysis.macro.inflation.trend}</p>
                      </div>
                    )}
                    {analysis.macro?.fedStance && (
                      <div className="bg-muted/30 rounded p-1.5">
                        <p className="text-muted-foreground">Fed Stance</p>
                        <p className="font-semibold">{analysis.macro.fedStance}</p>
                      </div>
                    )}
                  </div>
                  {(analysis.macro?.keyFactors || []).length > 0 && (
                    <div className="space-y-0.5">
                      {(analysis.macro.keyFactors || []).map((f, i) => (
                        <p key={i} className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Zap className="w-2.5 h-2.5 text-cyan-500" /> {f}
                        </p>
                      ))}
                    </div>
                  )}
                  {analysis.macro?.sectorImpact && (
                    <p className="text-[10px] text-muted-foreground">{analysis.macro.sectorImpact}</p>
                  )}
                </div>
              </AgentCard>

              {/* News/Geopolitical Agent */}
              <AgentCard
                title="Agent 4: Lajme/Geopolitikë (20%)"
                icon={<Newspaper className="w-3.5 h-3.5 text-purple-500" />}
                signal={analysis.newsGeopolitical?.signal}
                confidence={analysis.newsGeopolitical?.confidence}
                whyMayFail={analysis.newsGeopolitical?.whyMayFail}
              >
                <div className="space-y-2">
                  {(analysis.newsGeopolitical?.newsItems || []).slice(0, 3).map((item, i) => (
                    <div key={i} className="bg-muted/30 rounded p-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium truncate flex-1">{item.headline}</span>
                        <Badge variant="outline" className={`text-[9px] ml-1 ${item.sentiment === 'positive' ? 'border-emerald-500/30 text-emerald-500' : 'border-red-500/30 text-red-500'}`}>
                          Impact: {item.impactScore}/10
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {(analysis.newsGeopolitical?.geopoliticalRisks || []).length > 0 && (
                    <div className="space-y-0.5">
                      {(analysis.newsGeopolitical.geopoliticalRisks || []).map((r, i) => (
                        <p key={i} className="text-[10px] text-red-400 flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5" /> {r}
                        </p>
                      ))}
                    </div>
                  )}
                  {analysis.newsGeopolitical?.sentiment && (
                    <p className="text-[10px] text-muted-foreground">Sentimenti: {analysis.newsGeopolitical.sentiment.replace(/_/g, ' ')}</p>
                  )}
                </div>
              </AgentCard>
            </div>
          )}

          {/* DEBATE PANEL */}
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleSection('debate')}>
            <Swords className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-bold">Debate Panel: Bull vs Bear vs Risk Manager</h3>
            <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${expandedSections.debate ? 'rotate-180' : ''}`} />
          </div>
          {expandedSections.debate && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Bull */}
              <Card className="border-emerald-500/30 bg-emerald-500/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                    BULL CASE
                    <Badge className="ml-auto bg-emerald-500 text-white text-[10px]">{analysis.debate?.bullCase?.probability}%</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-[11px] leading-relaxed">{analysis.debate?.bullCase?.summary}</p>
                  <p className="text-[10px] text-emerald-500 font-medium">Skenari më i mirë:</p>
                  <p className="text-[11px] text-muted-foreground">{analysis.debate?.bullCase?.bestCase}</p>
                  <div className="space-y-0.5">
                    {(analysis.debate?.bullCase?.catalysts || []).map((c, i) => (
                      <p key={i} className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" /> {c}
                      </p>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Bear */}
              <Card className="border-red-500/30 bg-red-500/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold flex items-center gap-2">
                    <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                    BEAR CASE
                    <Badge className="ml-auto bg-red-500 text-white text-[10px]">{analysis.debate?.bearCase?.probability}%</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-[11px] leading-relaxed">{analysis.debate?.bearCase?.summary}</p>
                  <p className="text-[10px] text-red-500 font-medium">Skenari më i keq:</p>
                  <p className="text-[11px] text-muted-foreground">{analysis.debate?.bearCase?.worstCase}</p>
                  <div className="space-y-0.5">
                    {(analysis.debate?.bearCase?.headwinds || []).map((h, i) => (
                      <p key={i} className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <XCircle className="w-3 h-3 text-red-500" /> {h}
                      </p>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Risk Manager */}
              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-amber-500" />
                    RISK MANAGER
                    <Badge className={`ml-auto text-[10px] ${(analysis.debate?.riskManager?.confirmations || 0) >= 3 ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                      {analysis.debate?.riskManager?.confirmations || 0}/3 konfirmime
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    <div className="bg-muted/30 rounded p-1">
                      <p className="text-muted-foreground">Risk/Reward</p>
                      <p className="font-semibold">{analysis.debate?.riskManager?.riskReward}</p>
                    </div>
                    <div className="bg-muted/30 rounded p-1">
                      <p className="text-muted-foreground">Pozicioni</p>
                      <p className="font-semibold">{analysis.debate?.riskManager?.positionSize}</p>
                    </div>
                    <div className="bg-muted/30 rounded p-1">
                      <p className="text-muted-foreground">Max Risk</p>
                      <p className="font-semibold">{analysis.debate?.riskManager?.maxRiskPerTrade}</p>
                    </div>
                    <div className="bg-muted/30 rounded p-1">
                      <p className="text-muted-foreground">Konfirmime</p>
                      <p className="font-semibold">{analysis.debate?.riskManager?.confirmationDetail}</p>
                    </div>
                  </div>
                  {(analysis.debate?.riskManager?.contradictions || []).length > 0 && (
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-amber-500 font-medium">Kontradiktat:</p>
                      {(analysis.debate?.riskManager.contradictions || []).map((c, i) => (
                        <p key={i} className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5 text-amber-500" /> {c}
                        </p>
                      ))}
                    </div>
                  )}
                  {(analysis.debate?.riskManager?.noGoConditions || []).filter(n => n !== 'None triggered').length > 0 && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded p-1.5">
                      <p className="text-[10px] text-red-500 font-medium">NO-GO: {(analysis.debate?.riskManager?.noGoConditions || []).filter(n => n !== 'None triggered').join(', ')}</p>
                    </div>
                  )}
                  {analysis.debate?.riskManager?.positionSizing && (
                    <p className="text-[10px] text-muted-foreground bg-muted/30 rounded p-1.5">
                      {analysis.debate?.riskManager.positionSizing}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Risk Factors */}
          {(analysis.final?.riskFactors || []).length > 0 && (
            <Card className="border-red-500/20 bg-red-500/5">
              <CardContent className="pt-4">
                <p className="text-xs font-semibold text-red-500 mb-2 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" /> Faktorët e Riskut
                </p>
                <div className="flex flex-wrap gap-2">
                  {(analysis.final.riskFactors || []).map((r, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] border-red-500/30 text-red-500">{r}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
