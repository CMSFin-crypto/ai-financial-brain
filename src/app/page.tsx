'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Header } from '@/components/financial-brain/header';
import { AnalysisInput } from '@/components/financial-brain/analysis-input';
import { SentimentGauge } from '@/components/financial-brain/sentiment-gauge';
import { StockPredictionCard } from '@/components/financial-brain/stock-prediction-card';
import { MarketOverview } from '@/components/financial-brain/market-overview';
import { AnalysisCharts } from '@/components/financial-brain/analysis-charts';
import { PaperTrading } from '@/components/financial-brain/paper-trading';
import { TechnicalAnalysis } from '@/components/financial-brain/technical-analysis';
import { FundamentalAnalysis } from '@/components/financial-brain/fundamental-analysis';
import { DailyPicks } from '@/components/financial-brain/daily-picks';
import { QuantDashboard } from '@/components/financial-brain/quant-dashboard';
import { SectorScanner } from '@/components/financial-brain/sector-scanner';
import { MarketTickerBar } from '@/components/financial-brain/market-ticker-bar';
import { TopMovers } from '@/components/financial-brain/top-movers';
import { Watchlist } from '@/components/financial-brain/watchlist';
import { AIChat } from '@/components/financial-brain/ai-chat';
import {
  TrendingUp,
  TrendingDown,
  Zap,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Brain,
  BarChart3,
  ShoppingCart,
  LineChart,
  Building2,
  Sparkles,
  Target,
  Crosshair,
  Radar,
  Flame,
  MessageSquare,
  Eye,
} from 'lucide-react';

interface StockPrediction {
  ticker: string;
  company: string;
  sector: string;
  description: string;
  signal: string;
  confidence: number;
  reasoning: string;
  priceTargetDirection: string;
  riskLevel: string;
  impactLevel: string;
}

interface AnalysisResult {
  sentiment: string;
  sentimentScore: number;
  predictions: StockPrediction[];
  marketOverview: string;
  keyInsights: string[];
  riskFactors: string[];
}

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllPredictions, setShowAllPredictions] = useState(false);
  const [activeTab, setActiveTab] = useState('top-movers');
  const [quantTicker, setQuantTicker] = useState('');

  const handleAnalyze = async (
    text: string,
    sourceType: 'news' | 'policy' | 'tweet' | 'mixed'
  ) => {
    setIsLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sourceType }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Analiza dështoi. Provo përsëri.');
        return;
      }

      setAnalysis(data.analysis);
    } catch {
      setError('Gabim rrjeti. Kontrollo lidhjen dhe provo përsëri.');
    } finally {
      setIsLoading(false);
    }
  };

  const displayedPredictions = analysis?.predictions
    ? showAllPredictions
      ? analysis.predictions
      : analysis.predictions.slice(0, 3)
    : [];

  return (
    <div className="min-h-screen flex flex-col bg-background" suppressHydrationWarning>
      <Header />
      <MarketTickerBar />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6 space-y-6">
        {/* Hero Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-violet-500/10 border border-emerald-500/20 p-6 sm:p-8"
        >
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
            <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <Brain className="w-7 h-7 text-emerald-500" />
            </div>
            <div className="text-center sm:text-left space-y-1.5">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                  AI Financial Brain
                </h2>
                <div className="inline-flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/25 rounded-full px-2.5 py-0.5">
                  <Zap className="w-3 h-3 text-emerald-500" />
                  <span className="text-[10px] font-semibold text-emerald-600">AI</span>
                </div>
              </div>
              <p className="text-muted-foreground text-sm max-w-xl leading-relaxed">
                Një platformë që lexon lajmet, gjen sinjale tregu, parashikon aksione, dhe ju ndihmon të mësoni tregtimin — gjithçka në një vend.
              </p>
            </div>
          </div>
        </motion.section>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* Tab category labels + tabs */}
          <div className="space-y-2">
            {/* Desktop: grouped tabs with category labels */}
            <div className="hidden lg:flex flex-col gap-2">
              {/* Category: Tregu */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-14 flex-shrink-0">Tregu</span>
                <TabsList className="flex gap-1 h-auto p-1 flex-1">
                  <TabsTrigger value="watchlist" className="text-xs py-2 px-3 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                    <Eye className="w-3.5 h-3.5 mr-1.5" />Watchlist
                  </TabsTrigger>
                  <TabsTrigger value="top-movers" className="text-xs py-2 px-3 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                    <Flame className="w-3.5 h-3.5 mr-1.5" />Top 5+5
                  </TabsTrigger>
                  <TabsTrigger value="sector" className="text-xs py-2 px-3 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                    <Radar className="w-3.5 h-3.5 mr-1.5" />Sektoret
                  </TabsTrigger>
                </TabsList>
              </div>
              {/* Category: Analizë */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-14 flex-shrink-0">Analizë</span>
                <TabsList className="flex gap-1 h-auto p-1 flex-1">
                  <TabsTrigger value="daily-picks" className="text-xs py-2 px-3 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                    <Target className="w-3.5 h-3.5 mr-1.5" />Pikat Ditore
                  </TabsTrigger>
                  <TabsTrigger value="quant" className="text-xs py-2 px-3 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                    <Crosshair className="w-3.5 h-3.5 mr-1.5" />Quant
                  </TabsTrigger>
                  <TabsTrigger value="technical" className="text-xs py-2 px-3 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                    <LineChart className="w-3.5 h-3.5 mr-1.5" />Teknike
                  </TabsTrigger>
                  <TabsTrigger value="fundamental" className="text-xs py-2 px-3 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                    <Building2 className="w-3.5 h-3.5 mr-1.5" />Fundamentale
                  </TabsTrigger>
                </TabsList>
              </div>
              {/* Category: AI & Trading */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-14 flex-shrink-0">AI &</span>
                <TabsList className="flex gap-1 h-auto p-1 flex-1">
                  <TabsTrigger value="analyze" className="text-xs py-2 px-3 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                    <Brain className="w-3.5 h-3.5 mr-1.5" />Lajme AI
                  </TabsTrigger>
                  <TabsTrigger value="trading" className="text-xs py-2 px-3 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                    <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />Trading
                  </TabsTrigger>
                  <TabsTrigger value="chat" className="text-xs py-2 px-3 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                    <MessageSquare className="w-3.5 h-3.5 mr-1.5" />AI Chat
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>
            {/* Mobile/Tablet: scrollable single row */}
            <div className="lg:hidden">
              <TabsList className="flex gap-1 w-full h-auto p-1 overflow-x-auto">
                <TabsTrigger value="watchlist" className="text-xs py-2.5 px-3 whitespace-nowrap data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                  <Eye className="w-3.5 h-3.5 mr-1" />Watchlist
                </TabsTrigger>
                <TabsTrigger value="top-movers" className="text-xs py-2.5 px-3 whitespace-nowrap data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                  <Flame className="w-3.5 h-3.5 mr-1" />Top 5+5
                </TabsTrigger>
                <TabsTrigger value="quant" className="text-xs py-2.5 px-3 whitespace-nowrap data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                  <Crosshair className="w-3.5 h-3.5 mr-1" />Quant
                </TabsTrigger>
                <TabsTrigger value="sector" className="text-xs py-2.5 px-3 whitespace-nowrap data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                  <Radar className="w-3.5 h-3.5 mr-1" />Sektoret
                </TabsTrigger>
                <TabsTrigger value="daily-picks" className="text-xs py-2.5 px-3 whitespace-nowrap data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                  <Target className="w-3.5 h-3.5 mr-1" />Pikat
                </TabsTrigger>
                <TabsTrigger value="analyze" className="text-xs py-2.5 px-3 whitespace-nowrap data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                  <Brain className="w-3.5 h-3.5 mr-1" />Lajme AI
                </TabsTrigger>
                <TabsTrigger value="technical" className="text-xs py-2.5 px-3 whitespace-nowrap data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                  <LineChart className="w-3.5 h-3.5 mr-1" />Teknike
                </TabsTrigger>
                <TabsTrigger value="fundamental" className="text-xs py-2.5 px-3 whitespace-nowrap data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                  <Building2 className="w-3.5 h-3.5 mr-1" />Fund.
                </TabsTrigger>
                <TabsTrigger value="trading" className="text-xs py-2.5 px-3 whitespace-nowrap data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                  <ShoppingCart className="w-3.5 h-3.5 mr-1" />Trading
                </TabsTrigger>
                <TabsTrigger value="chat" className="text-xs py-2.5 px-3 whitespace-nowrap data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                  <MessageSquare className="w-3.5 h-3.5 mr-1" />AI Chat
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          {/* Tab: Watchlist */}
          <TabsContent value="watchlist" className="mt-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <Watchlist />
            </motion.div>
          </TabsContent>

          {/* Tab: Top Movers */}
          <TabsContent value="top-movers" className="mt-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <Card className="border-emerald-500/20 bg-emerald-500/5">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Flame className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-semibold">Aksionet me Performancën Më Të Mirë dhe Më të Keqe</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    10 aksione me rritje më të lartë dhe 10 me rrezik më të madh, të vlerësuara sipas shumë faktorëve. Çmimet përditësohen në kohë reale.
                  </p>
                </CardContent>
              </Card>
              <TopMovers />
            </motion.div>
          </TabsContent>

          {/* Tab: Quant Analysis */}
          <TabsContent value="quant" className="mt-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <Card className="border-blue-500/20 bg-blue-500/5">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Crosshair className="w-4 h-4 text-blue-500" />
                    <h3 className="text-sm font-semibold">Analizë e Thellë me AI</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    4 ekspertë AI analizojnë çdo aksion: teknika, fundamentet, makroekonomia, dhe lajmet. Merrin sinjal vetëm kur 3+ ekspertë bien dakord.
                  </p>
                </CardContent>
              </Card>
              <QuantDashboard initialTicker={quantTicker} />
            </motion.div>
          </TabsContent>

          {/* Tab: Sector Scanner */}
          <TabsContent value="sector" className="mt-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <Card className="border-emerald-500/20 bg-emerald-500/5">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Radar className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-semibold">Skaner Sektorësh — 9 Sektorë, 10 Aksionet Më Të Mira</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Shfleto 9 sektorë kryesorë: Teknologji, AI, Shëndetësi, Financa, Energji, dhe të tjera. Gjen 10 aksionet më të forta në çdo sektor.
                  </p>
                </CardContent>
              </Card>
              <SectorScanner onSelectStock={(t) => { setQuantTicker(t); setActiveTab('quant'); }} />
            </motion.div>
          </TabsContent>

          {/* Tab 3: Daily Picks */}
          <TabsContent value="daily-picks" className="mt-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="border-border/50 bg-card/50 mb-4">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-semibold">Parashikime Ditore — Cilat aksione mund të rriten sot?</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    AI analizojë tregun dhe zgjedh aksionet me potencialin më të lartë për rritje. Secila përfshin çmime hyrjeje, objektiva, stop-loss, dhe arsyetime.
                  </p>
                </CardContent>
              </Card>
              <DailyPicks />
            </motion.div>
          </TabsContent>

          {/* Tab 2: News Analysis */}
          <TabsContent value="analyze" className="mt-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* Input Section */}
              <Card className="border-violet-500/20 bg-violet-500/5 backdrop-blur-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Brain className="w-4 h-4 text-violet-500" />
                    Analizë e Lajmeve me AI
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <AnalysisInput onAnalyze={handleAnalyze} isLoading={isLoading} />
                </CardContent>
              </Card>

              {/* Loading */}
              <AnimatePresence>
                {isLoading && (
                  <motion.section
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-4"
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      <Skeleton className="h-[280px] rounded-2xl" />
                      <div className="lg:col-span-2 space-y-4">
                        <Skeleton className="h-[120px] rounded-xl" />
                        <Skeleton className="h-[120px] rounded-xl" />
                      </div>
                    </div>
                  </motion.section>
                )}
              </AnimatePresence>

              {/* Error */}
              <AnimatePresence>
                {error && !isLoading && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <Card className="border-red-500/30 bg-red-500/5">
                      <CardContent className="flex items-center gap-3 py-4">
                        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                        <p className="text-sm text-red-400">{error}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Results */}
              <AnimatePresence>
                {analysis && !isLoading && (
                  <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="space-y-6"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-1 h-8 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-full" />
                      <div>
                        <h3 className="text-xl font-bold">Rezultatet e Analizës</h3>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      <div className="flex items-start justify-center lg:justify-start">
                        <SentimentGauge
                          sentiment={analysis.sentiment}
                          score={analysis.sentimentScore}
                        />
                      </div>
                      <div className="lg:col-span-2">
                        <MarketOverview
                          overview={analysis.marketOverview}
                          keyInsights={analysis.keyInsights}
                          riskFactors={analysis.riskFactors}
                        />
                      </div>
                    </div>

                    {analysis.predictions.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                      >
                        <AnalysisCharts predictions={analysis.predictions} />
                      </motion.div>
                    )}

                    {analysis.predictions.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="space-y-4"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <h4 className="text-base font-semibold">Parashikime Aksionesh</h4>
                            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500">
                              {analysis.predictions.length}
                            </Badge>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                          {displayedPredictions.map((prediction, index) => (
                            <motion.div
                              key={prediction.ticker}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.1 * index }}
                            >
                              <StockPredictionCard prediction={prediction} />
                            </motion.div>
                          ))}
                        </div>

                        {analysis.predictions.length > 3 && (
                          <div className="flex justify-center">
                            <button
                              onClick={() => setShowAllPredictions(!showAllPredictions)}
                              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-emerald-500 transition-colors px-4 py-2 rounded-lg hover:bg-emerald-500/5"
                            >
                              {showAllPredictions ? (
                                <><ChevronUp className="w-4 h-4" /> Shfaq më pak</>
                              ) : (
                                <><ChevronDown className="w-4 h-4" /> Shfaq të gjitha ({analysis.predictions.length})</>
                              )}
                            </button>
                          </div>
                        )}
                      </motion.div>
                    )}

                    <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-amber-600/80 leading-relaxed">
                          Kjo analizë gjenerohet nga AI dhe nuk përbën këshillë financiare. Konsultohu me një këshilltar të licencuar.
                        </p>
                      </div>
                    </div>
                  </motion.section>
                )}
              </AnimatePresence>

              {!analysis && !isLoading && !error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-center py-12 text-muted-foreground"
                >
                  <Brain className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Hape një lajm, politikë, apo tweet për të filluar analizën</p>
                </motion.div>
              )}
            </motion.div>
          </TabsContent>

          {/* Tab 3: Technical Analysis */}
          <TabsContent value="technical" className="mt-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <Card className="border-blue-500/20 bg-blue-500/5 mb-4">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <LineChart className="w-4 h-4 text-blue-500" />
                    <h3 className="text-sm font-semibold">Analiza Teknike</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Shkruaj ticker-in (p.sh. AAPL) për të parë grafikun, RSI, MACD, mesataret, dhe sinjalet blerje/shitje.
                  </p>
                </CardContent>
              </Card>
              <TechnicalAnalysis />
            </motion.div>
          </TabsContent>

          {/* Tab 4: Fundamental Analysis */}
          <TabsContent value="fundamental" className="mt-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <Card className="border-blue-500/20 bg-blue-500/5 mb-4">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 className="w-4 h-4 text-blue-500" />
                    <h3 className="text-sm font-semibold">Analiza Fundamentale</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Shkruaj ticker-in për të parë sa vlen aksioni, fitueshmërinë, rritjen, dhe cilësitë konkurruese të kompanisë.
                  </p>
                </CardContent>
              </Card>
              <FundamentalAnalysis />
            </motion.div>
          </TabsContent>

          {/* Tab 5: Paper Trading */}
          <TabsContent value="trading" className="mt-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <Card className="border-violet-500/20 bg-violet-500/5 mb-4">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <ShoppingCart className="w-4 h-4 text-violet-500" />
                    <h3 className="text-sm font-semibold">Tregtim Virtual (Paper Trading)</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Provo tregtim me $100,000 virtuale — bli, shit, dhe ndërto portofolin tënde pa rrezik. Mëso pa humbur para të vërteta.
                  </p>
                </CardContent>
              </Card>
              <PaperTrading />
            </motion.div>
          </TabsContent>

          {/* Tab: AI Chat */}
          <TabsContent value="chat" className="mt-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <Card className="border-violet-500/20 bg-violet-500/5">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare className="w-4 h-4 text-violet-500" />
                    <h3 className="text-sm font-semibold">Biseda me AI</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Pyet çdo gjë për aksione, tregjet, ose koncepte financiare. AI-u ju përgjigjet me kontekst të plotë.
                  </p>
                </CardContent>
              </Card>
              <AIChat />
            </motion.div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-card/30 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            AI Financial Brain — Analizë inteligjente e tregut financiar
          </p>
          <p className="text-xs text-muted-foreground">
            Nuk përbën këshillë financiare
          </p>
        </div>
      </footer>
    </div>
  );
}
