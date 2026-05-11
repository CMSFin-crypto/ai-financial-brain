'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Header } from '@/components/financial-brain/header';
import { AnalysisInput } from '@/components/financial-brain/analysis-input';
import { SentimentGauge } from '@/components/financial-brain/sentiment-gauge';
import { StockPredictionCard } from '@/components/financial-brain/stock-prediction-card';
import { MarketOverview } from '@/components/financial-brain/market-overview';
import { AnalysisCharts } from '@/components/financial-brain/analysis-charts';
import {
  TrendingUp,
  Zap,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ArrowRight,
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

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 space-y-8">
        {/* Hero Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center space-y-3"
        >
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5">
            <Zap className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-xs font-medium text-emerald-600">
              Powered by AI
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Lajme, Politika, Tweets{' '}
            <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">
              → Sinjale Tregu
            </span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-sm sm:text-base">
            Shndërro lajmet, politikat, dhe postimet sociale në sinjale tregu të
            kuptueshme. AI Brain analizon dhe parashikon cilat aksione mund të rriten,
            arsyet pse, dhe çfarë bën çdo kompani.
          </p>
        </motion.section>

        {/* Input Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                Fushe e Analizës
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AnalysisInput onAnalyze={handleAnalyze} isLoading={isLoading} />
            </CardContent>
          </Card>
        </motion.section>

        {/* Loading State */}
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Skeleton className="h-[200px] rounded-xl" />
                <Skeleton className="h-[200px] rounded-xl" />
                <Skeleton className="h-[200px] rounded-xl" />
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Error State */}
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

        {/* Analysis Results */}
        <AnimatePresence>
          {analysis && !isLoading && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="space-y-6"
            >
              {/* Section Header */}
              <div className="flex items-center gap-3">
                <div className="w-1 h-8 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-full" />
                <div>
                  <h3 className="text-xl font-bold">Rezultatet e Analizës</h3>
                  <p className="text-xs text-muted-foreground">
                    Rezultatet e përpunuara nga AI Financial Brain
                  </p>
                </div>
              </div>

              {/* Top Section: Sentiment + Overview */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Sentiment Gauge */}
                <div className="flex items-start justify-center lg:justify-start">
                  <SentimentGauge
                    sentiment={analysis.sentiment}
                    score={analysis.sentimentScore}
                  />
                </div>

                {/* Market Overview */}
                <div className="lg:col-span-2">
                  <MarketOverview
                    overview={analysis.marketOverview}
                    keyInsights={analysis.keyInsights}
                    riskFactors={analysis.riskFactors}
                  />
                </div>
              </div>

              {/* Charts */}
              {analysis.predictions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <AnalysisCharts predictions={analysis.predictions} />
                </motion.div>
              )}

              {/* Stock Predictions */}
              {analysis.predictions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-semibold">
                        Parashikime Aksionesh
                      </h4>
                      <Badge
                        variant="secondary"
                        className="bg-emerald-500/10 text-emerald-500"
                      >
                        {analysis.predictions.length} aksione
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

                  {/* Show More / Less Button */}
                  {analysis.predictions.length > 3 && (
                    <div className="flex justify-center">
                      <button
                        onClick={() => setShowAllPredictions(!showAllPredictions)}
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-emerald-500 transition-colors px-4 py-2 rounded-lg hover:bg-emerald-500/5"
                      >
                        {showAllPredictions ? (
                          <>
                            <ChevronUp className="w-4 h-4" />
                            Shfaq më pak
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-4 h-4" />
                            Shfaq të gjitha ({analysis.predictions.length})
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Disclaimer */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-4"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-amber-600/80 leading-relaxed space-y-1">
                    <p className="font-medium text-amber-600">
                      Shënim i Rëndësishëm
                    </p>
                    <p>
                      Kjo analizë gjenerohet nga AI dhe nuk përbën këshillë
                      financiare profesionale. Përpara se të marrësh vendime
                      investimi, konsultohu me një këshilltar financiar të licencuar.
                      Të dhënat historike nuk garantojnë rezultate të ardhshme.
                    </p>
                  </div>
                </div>
              </motion.div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Empty State - How it works */}
        {!analysis && !isLoading && !error && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="space-y-6"
          >
            <div className="text-center space-y-2 py-8">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                <TrendingUp className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-lg font-semibold">
                Si funksionon AI Financial Brain?
              </h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Ndjek 3 hapa të thjeshtë për të marrë sinjale tregu nga AI
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  step: '01',
                  title: 'Hape lajmin apo tweet-in',
                  description:
                    'Ngjit një lajm, politikë qeveritare, apo tweet nga figura të rëndësishme në fushën e inputit.',
                  icon: '📰',
                },
                {
                  step: '02',
                  title: 'AI analizon të dhënat',
                  description:
                    'AI Financial Brain përpunon tekstin, identifikon kompanitë e prekura dhe analizon sentimentin.',
                  icon: '🧠',
                },
                {
                  step: '03',
                  title: 'Merr sinjale tregu',
                  description:
                    'Merr parashikime të aksioneve, sinjale BLEJ/MBAJ/SHIT, besueshmëri, dhe arsyetime të detajuara.',
                  icon: '📊',
                },
              ].map((item) => (
                <Card
                  key={item.step}
                  className="border-border/50 bg-card/50 hover:bg-card/80 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5"
                >
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{item.icon}</span>
                      <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        HAPI {item.step}
                      </span>
                    </div>
                    <h4 className="font-semibold text-sm">{item.title}</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.section>
        )}
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
