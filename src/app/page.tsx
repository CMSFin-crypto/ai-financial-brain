'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Header } from '@/components/financial-brain/header';
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
import { GlobalSearch } from '@/components/financial-brain/global-search';
import { MarketDashboard } from '@/components/financial-brain/market-dashboard';
import { EarningsCalendar } from '@/components/financial-brain/earnings-calendar';
import { EconomicCalendar } from '@/components/financial-brain/economic-calendar';
import { StockScreener } from '@/components/financial-brain/stock-screener';
import {
  Zap,
  Brain,
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
  Search,
  LayoutDashboard,
  CalendarDays,
  Filter,
  BarChart3,
  Landmark,
} from 'lucide-react';
import { AnalyticsDashboard } from '@/components/financial-brain/analytics-dashboard';

export default function Home() {
  const [activeTab, setActiveTab] = useState('top-movers');
  const [quantTicker, setQuantTicker] = useState('');

  return (
    <div className="min-h-screen flex flex-col bg-background" suppressHydrationWarning>
      <Header />
      <MarketTickerBar />
      <GlobalSearch onSelectStock={(ticker) => { setQuantTicker(ticker); setActiveTab('quant'); }} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6 space-y-6">
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
                  <TabsTrigger value="dashboard" className="text-xs py-2 px-3 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                    <LayoutDashboard className="w-3.5 h-3.5 mr-1.5" />Tregu
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
                  <TabsTrigger value="earnings" className="text-xs py-2 px-3 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                    <CalendarDays className="w-3.5 h-3.5 mr-1.5" />Fitimet
                  </TabsTrigger>
                  <TabsTrigger value="screener" className="text-xs py-2 px-3 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                    <Filter className="w-3.5 h-3.5 mr-1.5" />Screener
                  </TabsTrigger>
                </TabsList>
              </div>
              {/* Category: AI & Trading */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-14 flex-shrink-0">AI &</span>
                <TabsList className="flex gap-1 h-auto p-1 flex-1">
                  <TabsTrigger value="trading" className="text-xs py-2 px-3 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                    <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />Trading
                  </TabsTrigger>
                  <TabsTrigger value="chat" className="text-xs py-2 px-3 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                    <MessageSquare className="w-3.5 h-3.5 mr-1.5" />AI Chat
                  </TabsTrigger>
                  <TabsTrigger value="analytics" className="text-xs py-2 px-3 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                    <BarChart3 className="w-3.5 h-3.5 mr-1.5" />Statistikat
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>
            {/* Mobile/Tablet: grid wrapped rows */}
            <div className="lg:hidden">
              <TabsList className="flex flex-wrap gap-1 w-full h-auto p-1">
                <TabsTrigger value="watchlist" className="text-xs py-2 px-3 flex-1 min-w-[calc(33%-6px)] data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                  <Eye className="w-3.5 h-3.5 mr-1" />Watchlist
                </TabsTrigger>
                <TabsTrigger value="dashboard" className="text-xs py-2 px-3 flex-1 min-w-[calc(33%-6px)] data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                  <LayoutDashboard className="w-3.5 h-3.5 mr-1" />Tregu
                </TabsTrigger>
                <TabsTrigger value="top-movers" className="text-xs py-2 px-3 flex-1 min-w-[calc(33%-6px)] data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                  <Flame className="w-3.5 h-3.5 mr-1" />Top 5+5
                </TabsTrigger>
                <TabsTrigger value="sector" className="text-xs py-2 px-3 flex-1 min-w-[calc(33%-6px)] data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                  <Radar className="w-3.5 h-3.5 mr-1" />Sektoret
                </TabsTrigger>
                <TabsTrigger value="daily-picks" className="text-xs py-2 px-3 flex-1 min-w-[calc(33%-6px)] data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                  <Target className="w-3.5 h-3.5 mr-1" />Pikat
                </TabsTrigger>
                <TabsTrigger value="quant" className="text-xs py-2 px-3 flex-1 min-w-[calc(33%-6px)] data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                  <Crosshair className="w-3.5 h-3.5 mr-1" />Quant
                </TabsTrigger>
                <TabsTrigger value="technical" className="text-xs py-2 px-3 flex-1 min-w-[calc(33%-6px)] data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                  <LineChart className="w-3.5 h-3.5 mr-1" />Teknike
                </TabsTrigger>
                <TabsTrigger value="fundamental" className="text-xs py-2 px-3 flex-1 min-w-[calc(33%-6px)] data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                  <Building2 className="w-3.5 h-3.5 mr-1" />Fund.
                </TabsTrigger>
                <TabsTrigger value="earnings" className="text-xs py-2 px-3 flex-1 min-w-[calc(33%-6px)] data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                  <CalendarDays className="w-3.5 h-3.5 mr-1" />Fitimet
                </TabsTrigger>
                <TabsTrigger value="screener" className="text-xs py-2 px-3 flex-1 min-w-[calc(33%-6px)] data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                  <Filter className="w-3.5 h-3.5 mr-1" />Screener
                </TabsTrigger>
                <TabsTrigger value="trading" className="text-xs py-2 px-3 flex-1 min-w-[calc(33%-6px)] data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                  <ShoppingCart className="w-3.5 h-3.5 mr-1" />Trading
                </TabsTrigger>
                <TabsTrigger value="chat" className="text-xs py-2 px-3 flex-1 min-w-[calc(33%-6px)] data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                  <MessageSquare className="w-3.5 h-3.5 mr-1" />AI Chat
                </TabsTrigger>
                <TabsTrigger value="analytics" className="text-xs py-2 px-3 flex-1 min-w-[calc(33%-6px)] data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                  <BarChart3 className="w-3.5 h-3.5 mr-1" />Statistikat
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

          {/* Tab: Market Dashboard */}
          <TabsContent value="dashboard" className="mt-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <Card className="border-emerald-500/20 bg-emerald-500/5">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <LayoutDashboard className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-semibold">Dashboard Kryesor i Tregut</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Përmbledhje e tregut: indekset kryesore, sektorët, dhe gjendja e përgjithshme. Çmimet përditësohen në kohë reale.
                  </p>
                </CardContent>
              </Card>
              <MarketDashboard />
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

          {/* Tab: Earnings Calendar */}
          <TabsContent value="earnings" className="mt-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <Card className="border-blue-500/20 bg-blue-500/5">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CalendarDays className="w-4 h-4 text-blue-500" />
                    <h3 className="text-sm font-semibold">Kalendar i Fitimeve & Ekonomik</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Datat e raportimit të ardhurave dhe ngjarjet makroekonomike. Zgjidh tab-in për të parë detaje.
                  </p>
                </CardContent>
              </Card>
              <Tabs defaultValue="earnings-sub" className="w-full">
                <TabsList className="w-full justify-start mb-3">
                  <TabsTrigger value="earnings-sub" className="text-xs py-2 px-3 gap-1.5 data-[state=active]:bg-blue-500/10 data-[state=active]:border-blue-500/30 data-[state=active]:text-blue-600">
                    <CalendarDays className="w-3.5 h-3.5" />
                    Kalendar Fitimesh
                  </TabsTrigger>
                  <TabsTrigger value="economic-sub" className="text-xs py-2 px-3 gap-1.5 data-[state=active]:bg-blue-500/10 data-[state=active]:border-blue-500/30 data-[state=active]:text-blue-600">
                    <Landmark className="w-3.5 h-3.5" />
                    Kalendar Ekonomik
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="earnings-sub">
                  <EarningsCalendar />
                </TabsContent>
                <TabsContent value="economic-sub">
                  <EconomicCalendar />
                </TabsContent>
              </Tabs>
            </motion.div>
          </TabsContent>

          {/* Tab: Stock Screener */}
          <TabsContent value="screener" className="mt-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <Card className="border-blue-500/20 bg-blue-500/5">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Filter className="w-4 h-4 text-blue-500" />
                    <h3 className="text-sm font-semibold">Skaner Aksionesh</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Filtron aksione sipas sektorit, kapitalizimit, P/E, ndryshimit, sinjalit. Kliko në një aksion për detaje.
                  </p>
                </CardContent>
              </Card>
              <StockScreener />
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

          {/* Tab: Analytics Dashboard */}
          <TabsContent value="analytics" className="mt-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <Card className="border-violet-500/20 bg-violet-500/5">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart3 className="w-4 h-4 text-violet-500" />
                    <h3 className="text-sm font-semibold">Statistikat e Vizitorëve</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Shiko vizitorët e faqes: sa kanë vizituar sot, nga vijnë, çfarë pajisje dhe shfletues përdorin.
                  </p>
                </CardContent>
              </Card>
              <AnalyticsDashboard />
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
