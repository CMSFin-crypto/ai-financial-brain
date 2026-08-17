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
import { SecFilings } from '@/components/financial-brain/sec-filings';
import { FivePillars } from '@/components/financial-brain/five-pillars';

import {
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
  Gauge,
  BrainCircuit,
  Activity,
  Shield,
  Trophy,
  ExternalLink,
  FileText,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { AnalyticsDashboard } from '@/components/financial-brain/analytics-dashboard';
import { AdvancedAnalysis } from '@/components/financial-brain/advanced-analysis';
import FearGreedIndex from '@/components/financial-brain/fear-greed-index';
import { StockPredictor } from '@/components/financial-brain/stock-predictor';
import Link from 'next/link';

function KontrolTab({ icon, title, desc, pageUrl }: { icon: React.ReactNode; title: string; desc: string; pageUrl: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-4">
      <Card className="border-orange-500/20 bg-orange-500/5">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-start gap-4">
            <div className="bg-orange-500/15 rounded-lg p-2.5 text-orange-400 flex-shrink-0">{icon}</div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{desc}</p>
              <div className="mt-3 flex items-center gap-2">
                <Link href={pageUrl} className="inline-flex items-center gap-1.5 rounded-md bg-orange-500/10 border border-orange-500/30 px-3 py-1.5 text-xs font-medium text-orange-400 hover:bg-orange-500/20 transition-colors">
                  Hape faqen e plotë <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
          <div className="mt-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2.5">
            <p className="text-xs text-yellow-400/90">
              <strong>Shënim:</strong> Këto funksione kanë nevojë për database PostgreSQL. Për t&apos;i aktivizuar, shto variablin <code className="bg-yellow-500/15 px-1 rounded text-yellow-300">DATABASE_URL</code> në Vercel Environment Variables.
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState('top-movers');
  const [quantTicker, setQuantTicker] = useState('');

  return (
    <div className="min-h-screen flex flex-col bg-background" suppressHydrationWarning>
      <Header />
      <MarketTickerBar />
      <GlobalSearch onSelectStock={(ticker) => { setQuantTicker(ticker); setActiveTab('quant'); }} />

      {/* 10-Q Direct Access Banner */}
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6">
        <Link href="/sec-q" className="flex items-center gap-2 bg-amber-600/15 hover:bg-amber-600/25 border border-amber-500/30 rounded-lg px-4 py-2.5 transition-colors group">
          <FileText className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-amber-400">10-Q SEC Filings</span>
            <span className="text-xs text-amber-400/70 ml-2 hidden sm:inline">Raportet financiare tremujore nga SEC EDGAR</span>
          </div>
          <ArrowRight className="w-4 h-4 text-amber-400/60 group-hover:translate-x-1 transition-transform flex-shrink-0" />
        </Link>
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6 space-y-6">
        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
                  <TabsTrigger value="5-pillars" className="text-xs py-2 px-3 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                    <Zap className="w-3.5 h-3.5 mr-1.5" />5 Pillars
                  </TabsTrigger>
                  <TabsTrigger value="sector" className="text-xs py-2 px-3 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                    <Radar className="w-3.5 h-3.5 mr-1.5" />Sektoret
                  </TabsTrigger>
                  <TabsTrigger value="fear-greed" className="text-xs py-2 px-3 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                    <Gauge className="w-3.5 h-3.5 mr-1.5" />Fear & Greed
                  </TabsTrigger>
                </TabsList>
              </div>
              {/* Category: Analizë */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-14 flex-shrink-0">Analizë</span>
                <TabsList className="flex gap-1 h-auto p-1 flex-1 overflow-x-auto scrollbar-none">
                  <TabsTrigger value="daily-picks" className="text-xs py-2 px-3 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                    <Target className="w-3.5 h-3.5 mr-1.5" />Pikat Ditore
                  </TabsTrigger>
                  <TabsTrigger value="quant" className="text-xs py-2 px-3 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                    <Crosshair className="w-3.5 h-3.5 mr-1.5" />Quant
                  </TabsTrigger>
                  <TabsTrigger value="technical" className="text-xs py-2 px-3 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                    <LineChart className="w-3.5 h-3.5 mr-1.5" />Teknike
                  </TabsTrigger>
                  <TabsTrigger value="fundamental" className="text-xs py-2 px-3 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                    <Building2 className="w-3.5 h-3.5 mr-1.5" />Fundamentale
                  </TabsTrigger>
                  <TabsTrigger value="earnings" className="text-xs py-2 px-3 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                    <CalendarDays className="w-3.5 h-3.5 mr-1.5" />Fitimet
                  </TabsTrigger>
                  <TabsTrigger value="screener" className="text-xs py-2 px-3 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                    <Filter className="w-3.5 h-3.5 mr-1.5" />Screener
                  </TabsTrigger>
                  <TabsTrigger value="sec-filings" className="text-xs py-2 px-3 whitespace-nowrap flex-shrink-0 bg-amber-600/20 border border-amber-500/40 text-amber-400 data-[state=active]:bg-amber-600 data-[state=active]:text-white">
                    <FileText className="w-3.5 h-3.5 mr-1.5" />10-Q
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
                  <TabsTrigger value="advanced" className="text-xs py-2 px-3 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                    <Brain className="w-3.5 h-3.5 mr-1.5" />Analiza
                  </TabsTrigger>
                  <TabsTrigger value="predictor" className="text-xs py-2 px-3 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                    <BrainCircuit className="w-3.5 h-3.5 mr-1.5" />Predikues
                  </TabsTrigger>
                </TabsList>
              </div>
              {/* Category: Kontroll */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-14 flex-shrink-0">Kontrol</span>
                <TabsList className="flex gap-1 h-auto p-1 flex-1">
                  <TabsTrigger value="drift" className="text-xs py-2 px-3 data-[state=active]:bg-orange-600 data-[state=active]:text-white">
                    <Activity className="w-3.5 h-3.5 mr-1.5" />Drift
                  </TabsTrigger>
                  <TabsTrigger value="overrides" className="text-xs py-2 px-3 data-[state=active]:bg-orange-600 data-[state=active]:text-white">
                    <Shield className="w-3.5 h-3.5 mr-1.5" />Override
                  </TabsTrigger>
                  <TabsTrigger value="edge" className="text-xs py-2 px-3 data-[state=active]:bg-orange-600 data-[state=active]:text-white">
                    <Trophy className="w-3.5 h-3.5 mr-1.5" />Edge
                  </TabsTrigger>
                  <TabsTrigger value="metrics" className="text-xs py-2 px-3 data-[state=active]:bg-orange-600 data-[state=active]:text-white">
                    <BarChart3 className="w-3.5 h-3.5 mr-1.5" />Metrics
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>
          {/* Mobile/Tablet: scrollable horizontal tabs by category */}
          <div className="lg:hidden space-y-2">
              {/* Tregu */}
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground w-10 flex-shrink-0">Tregu</span>
                <TabsList className="flex gap-0.5 h-auto p-0.5 overflow-x-auto flex-nowrap w-full scrollbar-none">
                  <TabsTrigger value="watchlist" className="text-[10px] py-1.5 px-2.5 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                    <Eye className="w-3 h-3 mr-1" />Watchlist
                  </TabsTrigger>
                  <TabsTrigger value="dashboard" className="text-[10px] py-1.5 px-2.5 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                    <LayoutDashboard className="w-3 h-3 mr-1" />Tregu
                  </TabsTrigger>
                  <TabsTrigger value="top-movers" className="text-[10px] py-1.5 px-2.5 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                    <Flame className="w-3 h-3 mr-1" />Top 5+5
                  </TabsTrigger>
                  <TabsTrigger value="5-pillars" className="text-[10px] py-1.5 px-2.5 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                    <Zap className="w-3 h-3 mr-1" />5 Pillars
                  </TabsTrigger>
                  <TabsTrigger value="sector" className="text-[10px] py-1.5 px-2.5 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                    <Radar className="w-3 h-3 mr-1" />Sektoret
                  </TabsTrigger>
                  <TabsTrigger value="fear-greed" className="text-[10px] py-1.5 px-2.5 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                    <Gauge className="w-3 h-3 mr-1" />F&G
                  </TabsTrigger>
                </TabsList>
              </div>
              {/* Analizë */}
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground w-10 flex-shrink-0">Analiz</span>
                <TabsList className="flex gap-0.5 h-auto p-0.5 overflow-x-auto flex-nowrap w-full scrollbar-none">
                  <TabsTrigger value="sec-filings" className="text-[10px] py-1.5 px-2.5 whitespace-nowrap flex-shrink-0 bg-amber-600/20 border border-amber-500/40 text-amber-400 data-[state=active]:bg-amber-600 data-[state=active]:text-white">
                    <FileText className="w-3 h-3 mr-1" />10-Q
                  </TabsTrigger>
                  <TabsTrigger value="daily-picks" className="text-[10px] py-1.5 px-2.5 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                    <Target className="w-3 h-3 mr-1" />Pikat
                  </TabsTrigger>
                  <TabsTrigger value="quant" className="text-[10px] py-1.5 px-2.5 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                    <Crosshair className="w-3 h-3 mr-1" />Quant
                  </TabsTrigger>
                  <TabsTrigger value="technical" className="text-[10px] py-1.5 px-2.5 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                    <LineChart className="w-3 h-3 mr-1" />Teknike
                  </TabsTrigger>
                  <TabsTrigger value="fundamental" className="text-[10px] py-1.5 px-2.5 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                    <Building2 className="w-3 h-3 mr-1" />Fund.
                  </TabsTrigger>
                  <TabsTrigger value="earnings" className="text-[10px] py-1.5 px-2.5 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                    <CalendarDays className="w-3 h-3 mr-1" />Fitimet
                  </TabsTrigger>
                  <TabsTrigger value="screener" className="text-[10px] py-1.5 px-2.5 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                    <Filter className="w-3 h-3 mr-1" />Screener
                  </TabsTrigger>
                </TabsList>
              </div>
              {/* AI & Trading */}
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground w-10 flex-shrink-0">AI &</span>
                <TabsList className="flex gap-0.5 h-auto p-0.5 overflow-x-auto flex-nowrap w-full scrollbar-none">
                  <TabsTrigger value="trading" className="text-[10px] py-1.5 px-2.5 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                    <ShoppingCart className="w-3 h-3 mr-1" />Trading
                  </TabsTrigger>
                  <TabsTrigger value="chat" className="text-[10px] py-1.5 px-2.5 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                    <MessageSquare className="w-3 h-3 mr-1" />AI Chat
                  </TabsTrigger>
                  <TabsTrigger value="analytics" className="text-[10px] py-1.5 px-2.5 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                    <BarChart3 className="w-3 h-3 mr-1" />Statistikat
                  </TabsTrigger>
                  <TabsTrigger value="advanced" className="text-[10px] py-1.5 px-2.5 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                    <Brain className="w-3 h-3 mr-1" />Analiza
                  </TabsTrigger>
                  <TabsTrigger value="predictor" className="text-[10px] py-1.5 px-2.5 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                    <BrainCircuit className="w-3 h-3 mr-1" />Predikues
                  </TabsTrigger>
                </TabsList>
              </div>
              {/* Kontrol */}
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground w-10 flex-shrink-0">Kontrol</span>
                <TabsList className="flex gap-0.5 h-auto p-0.5 overflow-x-auto flex-nowrap w-full scrollbar-none">
                  <TabsTrigger value="drift" className="text-[10px] py-1.5 px-2.5 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-orange-600 data-[state=active]:text-white">
                    <Activity className="w-3 h-3 mr-1" />Drift
                  </TabsTrigger>
                  <TabsTrigger value="overrides" className="text-[10px] py-1.5 px-2.5 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-orange-600 data-[state=active]:text-white">
                    <Shield className="w-3 h-3 mr-1" />Override
                  </TabsTrigger>
                  <TabsTrigger value="edge" className="text-[10px] py-1.5 px-2.5 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-orange-600 data-[state=active]:text-white">
                    <Trophy className="w-3 h-3 mr-1" />Edge
                  </TabsTrigger>
                  <TabsTrigger value="metrics" className="text-[10px] py-1.5 px-2.5 whitespace-nowrap flex-shrink-0 data-[state=active]:bg-orange-600 data-[state=active]:text-white">
                    <BarChart3 className="w-3 h-3 mr-1" />Metrics
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>
          </div>

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

          {/* Tab: Ross Cameron 5 Pillars */}
          <TabsContent value="5-pillars" className="mt-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <Card className="border-amber-500/20 bg-amber-500/5">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <h3 className="text-sm font-semibold">Ross Cameron 5 Pillars Scanner</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Skanues i bazuar në metodologjinë e Warrior Trading: Rel Volume ≥5x, Float i ulët, Çmimi në zonë, Green Candle, dhe Gap Up. Identifikon aksionet me momentum më të lartë.
                  </p>
                </CardContent>
              </Card>
              <FivePillars />
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

          {/* Tab: Fear & Greed Index */}
          <TabsContent value="fear-greed" className="mt-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <Card className="border-emerald-500/20 bg-emerald-500/5">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Gauge className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-semibold">Indeksi i Frikës & Grykesisë (Fear & Greed)</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Tregon gjendjen psikologjike të tregut amerikan — nga frika ekstreme deri te grykesia ekstreme. Një treg me frikë është mundësi blerjeje.
                  </p>
                </CardContent>
              </Card>
              <FearGreedIndex />
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

          {/* Tab: SEC Filings (10-Q) */}
          <TabsContent value="sec-filings" className="mt-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <Card className="border-blue-500/20 bg-blue-500/5">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-4 h-4 text-blue-500" />
                    <h3 className="text-sm font-semibold">Raportet 10-Q (SEC EDGAR)</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Të dhëna financiare tremujore direkt nga SEC — Income Statement, Balance Sheet, Cash Flow për çdo kuartal.
                  </p>
                </CardContent>
              </Card>
              <SecFilings />
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

          {/* Tab: Advanced Analysis */}
          <TabsContent value="advanced" className="mt-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-4">
              <Card className="border-violet-500/20 bg-violet-500/5">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Brain className="w-4 h-4 text-violet-500" />
                    <h3 className="text-sm font-semibold">Analiza e Avancuar</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Confidence Score 0-100, Backtesting me 3 strategji, Sentiment AI, dhe Matrica e Korrelacionit.
                  </p>
                </CardContent>
              </Card>
              <AdvancedAnalysis />
            </motion.div>
          </TabsContent>

          {/* Tab: AI Stock Predictor */}
          <TabsContent value="predictor" className="mt-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-4">
              <Card className="border-violet-500/20 bg-violet-500/5">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <BrainCircuit className="w-4 h-4 text-violet-500" />
                    <h3 className="text-sm font-semibold">Predikues i Stoqeve me 15 Indikatorë Teknikë</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Modeli analizon 15 indikatorë (RSI, MACD, Bollinger, MA, Stochastic, ADX, OBV, etj.) dhe prodhon predikime afatshkurtra dhe afatgjata. Skanon 116 stoqe dhe i rendit sipas potencialit.
                  </p>
                </CardContent>
              </Card>
              <StockPredictor />
            </motion.div>
          </TabsContent>

          {/* Tab: Drift Review */}
          <TabsContent value="drift" className="mt-4">
            <KontrolTab
              icon={<Activity className="w-5 h-5" />}
              title="Drift Review"
              desc="Gjurmon shëndetin e modelit: preciziteti sipas afatit, kalibrimi (Brier/ECE), degradimi i regjimit dhe sektorit."
              pageUrl="/drift-review"
            />
          </TabsContent>

          {/* Tab: Override Journal */}
          <TabsContent value="overrides" className="mt-4">
            <KontrolTab
              icon={<Shield className="w-5 h-5" />}
              title="Override Journal"
              desc="Gjurmon çdo ndërhyrje njerëzore: a ndihmoi apo dëmtoi? Modeli vs njeriu, shkaku i override."
              pageUrl="/override-journal"
            />
          </TabsContent>

          {/* Tab: Edge Leaderboard */}
          <TabsContent value="edge" className="mt-4">
            <KontrolTab
              icon={<Trophy className="w-5 h-5" />}
              title="Edge Leaderboard"
              desc="Ku ka sistemi avantazhin e vërtetë? Sektorët dhe regjimet me performancën më të mirë."
              pageUrl="/edge-leaderboard"
            />
          </TabsContent>

          {/* Tab: Model Metrics */}
          <TabsContent value="metrics" className="mt-4">
            <KontrolTab
              icon={<BarChart3 className="w-5 h-5" />}
              title="Model Metrics"
              desc="Brier score, ECE, precision/recall, alpha, drawdown — metrikat e plotë të kalibrit dhe performancës."
              pageUrl="/model-metrics"
            />
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
