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
import {
  TrendingUp,
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
  const [activeTab, setActiveTab] = useState('quant');
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
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6 space-y-6">
        {/* Hero Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center space-y-2"
        >
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5">
            <Zap className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-xs font-medium text-emerald-600">
              Powered by AI
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            AI Financial Brain
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-sm">
            Lajme → Sinjale Tregu → Parashikime Aksionesh → Paper Trading → Analiza Teknike & Fundamentale
          </p>
        </motion.section>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1 w-full h-auto p-1">
            <TabsTrigger value="quant" className="text-xs sm:text-sm py-2 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
              <Crosshair className="w-3.5 h-3.5 mr-1 hidden sm:inline" />
              Quant Analysis
            </TabsTrigger>
            <TabsTrigger value="sector" className="text-xs sm:text-sm py-2 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
              <Radar className="w-3.5 h-3.5 mr-1 hidden sm:inline" />
              Sector Scan
            </TabsTrigger>
            <TabsTrigger value="daily-picks" className="text-xs sm:text-sm py-2 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
              <Target className="w-3.5 h-3.5 mr-1 hidden sm:inline" />
              Daily Picks
            </TabsTrigger>
            <TabsTrigger value="analyze" className="text-xs sm:text-sm py-2 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
              <Brain className="w-3.5 h-3.5 mr-1 hidden sm:inline" />
              Lajme
            </TabsTrigger>
            <TabsTrigger value="technical" className="text-xs sm:text-sm py-2 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
              <LineChart className="w-3.5 h-3.5 mr-1 hidden sm:inline" />
              Teknike
            </TabsTrigger>
            <TabsTrigger value="fundamental" className="text-xs sm:text-sm py-2 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
              <Building2 className="w-3.5 h-3.5 mr-1 hidden sm:inline" />
              Fundamentale
            </TabsTrigger>
            <TabsTrigger value="trading" className="text-xs sm:text-sm py-2 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
              <ShoppingCart className="w-3.5 h-3.5 mr-1 hidden sm:inline" />
              Trading
            </TabsTrigger>
          </TabsList>

          {/* Tab: Quant Analysis */}
          <TabsContent value="quant" className="mt-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <Card className="border-emerald-500/20 bg-emerald-500/5">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Crosshair className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-semibold">Multi-Agent Quant Analysis</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    4 agjentë të specializuar (Teknik 35%, Fundament 25%, Makro 20%, Lajme 20%) + Debate Bull/Bear + Risk Manager + Scoring Engine. Minimum 3 konfirmime për një sinjal. Mundëso 1% risk per trade.
                  </p>
                </CardContent>
              </Card>
              <QuantDashboard />
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
              <Card className="border-border/50 bg-card/50">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Radar className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-semibold">Sector Scanner — 10 Stoqe per Sektor</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Skanim i plotë i 5 sektorëve kryesore: Teknologji, Shëndetësi, Financa, Energji, Konsum. 10 aksionet më të mira për sektor me multi-factor scoring.
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
              <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Brain className="w-4 h-4 text-emerald-500" />
                    Analizë e Lajmeve & Tweets
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
              <Card className="border-border/50 bg-card/50 mb-4">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <LineChart className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-semibold">Analiza Teknike</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Shkruaj ticker-in e një aksioni për të marrë analizë teknike të plotë: RSI, MACD, Moving Averages, Bollinger Bands, suport/rezistencë, dhe modele grafike.
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
              <Card className="border-border/50 bg-card/50 mb-4">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-semibold">Analiza Fundamentale</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Shkruaj ticker-in për analizë të thellë fundamentale: vlerësimi, fitueshmëria, rritja, shëndeti financiar, EPS, avantazhi konkurrues, dhe konsensusi i analistëve.
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
              <Card className="border-border/50 bg-card/50 mb-4">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <ShoppingCart className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-semibold">Paper Trading — Tregtim Virtual</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Provo tregtim pa rrezik me $100,000 virtuale. Blej dhe shit aksione, ndërto portofolin tënde, dhe mëso pa humbur para të vërteta.
                  </p>
                </CardContent>
              </Card>
              <PaperTrading />
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
