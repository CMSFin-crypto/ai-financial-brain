'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  Shield, TrendingUp, AlertTriangle, CheckCircle2, XCircle, Target,
  BarChart3, DollarSign, Clock, Layers, Zap, ArrowRight, Calculator,
  ChevronDown, ChevronUp, RefreshCw, Eye, EyeOff, Activity,
  Filter, ArrowDown, CircleDot, Info, Search, X, Loader2,
  Copy, Check, Briefcase, FileText, ShieldAlert, Moon,
  GitCompareArrows, TrendingDown, ArrowUpRight, ArrowDownRight, LogIn, LogOut,
  BookOpen, History, Brain, Sparkles,
} from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';

// ── Types ──
type Decision = 'READY' | 'WATCHLIST' | 'NO_TRADE' | 'EVENT_RISK' | 'EXTENDED';

interface FunnelStock {
  symbol: string; price: number;
  avgVol20d: number; avgDolVol20d: number;
  passedLiquidity: boolean; passedTrend: boolean;
  passedStackedMA: boolean; passedADX: boolean; passedEventRisk: boolean;
  trendScore: number; rsScore: number; momentumScore: number;
  volConfScore: number; setupScore: number; riskScore: number; totalScore: number; learningAdj?: number;
  setup: 'PULLBACK' | 'BREAKOUT' | 'TREND_CONT' | 'NONE';
  horizon: string; rsi: number; atr: number; atrPct: number; adx: number;
  volRatio: number; volDeclining: boolean; lastDaySpike: boolean;
  pullbackDays: number; pullbackPct: number;
  distFromEMA10: number; distFromEMA20: number;
  aboveSMA50: boolean; aboveSMA200: boolean; sma50Above200: boolean; stackedMA: boolean;
  rsVsSPY: number; rsVsQQQ: number; rsVsSPY60d: number;
  entry: number; stop: number; target1R: number; target2R: number; target3R: number;
  riskPct: number; rewardRiskRatio: number; swingLow: number;
  sector: string;
  positionSize: number; positionValue: number; riskDollars: number;
  eventRisk: string; eventRiskSeverity: string;
  // Catalyst Gate
  // RS vs Sector ETF
  sectorEtf: string;
  rsVsSector20d: number;
  sectorAboveSma50: boolean;
  sectorRsStatus: string;
  catalystStatus: string;
  daysToEarnings: number | null;
  macroEventWithin24h: string | null;
  material8KLast30d: boolean;
  material8KSentiment: string;
  positionSizeMultiplier: number;
  allowNewEntry: boolean;
  bracketOrder?: object | null;
  decision: Decision; reasons: string[]; warnings: string[];
  // Swing Prediction
  ema10Val: number; ema20Val: number; sma50Val: number;
  pullbackZone: string;
  nextResistance: number;
  projectedUpsidePct: number;
  dailyExpRange: string;
  daysTo1R: number; daysTo2R: number; daysTo3R: number;
  // Overnight Risk
  avgOvernightGap20: number;
  avgOvernightGap60: number;
  overnightGapUpPct: number;
  maxOvernightGapDown: number;
  maxOvernightGapUp: number;
  overnightRiskLevel: string;
  overnightBias: string;
  gapCanSkipStop: boolean;
  stopDistPct: number;
  // Liquidity Metrics
  spreadPct: number;
  liquidityScore: number;
  liquidityStatus: string;
  // NEW: Entry quality — RVOL + 52W High
  rvol: number;
  rvolStatus: string;
  high52w: number;
  distFrom52wHighPct: number;
  near52wHigh: boolean;
  // NEW: Tradability — ATR% gate
  atrStatus: string;
  atrTradable: boolean;
}

interface FunnelResponse {
  scannedAt: string; regimeOk: boolean;
  regimeDetail: {
    spy: { above50: boolean; above200: boolean };
    qqq: { above50: boolean; above200: boolean };
    vix?: { level: number; status: string };
    breadth?: { pct: number; status: string };
    regimeLevel?: string;
    regimeMultiplier?: number;
    stopVolMultiplier?: number;
  };
  funnel: { universe: number; passedLiquidity: number; passedTrend: number; passedSetup: number; passedRisk: number; passedEventRisk: number; passedSectorLimit: number; displayed: number; };
  results: FunnelStock[];
  sectorExposure?: Record<string, number>;
}

// ── Decision styling ──
const DECISION_STYLE: Record<Decision, { bg: string; text: string; border: string; label: string }> = {
  READY:        { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'READY' },
  WATCHLIST:    { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30', label: 'WATCHLIST' },
  EVENT_RISK:   { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30', label: 'EVENT RISK' },
  EXTENDED:     { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30', label: 'EXTENDED' },
  NO_TRADE:     { bg: 'bg-muted/15', text: 'text-muted-foreground', border: 'border-muted/30', label: 'NO TRADE' },
};

// ── Strategy Reference Data ──
const STRATEGY_RULES = [
  { element: 'Universe', icon: Layers, rule: '200 kompani te medha, likuide, tregtueshme ne IBKR', color: 'text-blue-400' },
  { element: 'Filtri mekanik', icon: Filter, rule: 'Cmimi >= $10, Vol >= 1M, DolVol >= $20M, mbi SMA50, SMA50 > SMA200, Stacked MA, ADX > 25, RS > SPY', color: 'text-emerald-400' },
  { element: 'Analize teknike', icon: BarChart3, rule: 'Trend (me Stacked MA + ADX bonus), momentum, RS, ATR, setup quality, volum konfirmim', color: 'text-blue-400' },
  { element: 'Event-risk gate', icon: AlertTriangle, rule: 'R:R >= 1:2 (3R target), RSI 30-75, risk <= 8%, regjimi OK, jo earnings/FOMC/CPI, max 2 per sektor', color: 'text-red-400' },
  { element: 'Top Stocks', icon: Target, rule: '5-10 kandidate me score me te larte, READY (me IBKR bracket order) ose WATCHLIST', color: 'text-amber-400' },
];

const ENTRY_RULES = [
  'Tregu i pergjithshem eshte bullish; mos detyro long trades kur indekset jane ne trend te dobet.',
  'Kompania ka raport te mire earnings, rritje te te ardhurave/fitimit ose katalizator te qarte.',
  'Cmimi eshte mbi 50 SMA dhe 200 SMA.',
  'Ka bere pullback te kontrolluar me volum me te ulet, pastaj jep candle rikthimi me volum.',
  'Entry vendose mbi high-in e candle-it te konfirmimit, zakonisht me buy stop-limit ose limit ne pullback.',
];

const DONT_RULES = [
  'Mos bej day trading te rastessishem vetem sepse IBKR e ben execution-in te lehte.',
  'Mos hy para earnings nese nuk je duke tregtuar qellimisht event risk.',
  'Mos ble aksione qe jane 10-15% mbi 10/20 EMA pas nje rally te shpejte.',
  'Mos perdor leverage/margin derisa strategjia te jete e testuar.',
  'Mos u mbeshtet vetem te RSI ose MACD; keta jane filtra, jo edge i vetem.',
];

const SYSTEM_GATES = [
  { gate: 'Market Regime', desc: 'SPY/QQQ mbi 50 dhe 200 SMA', icon: Shield },
  { gate: 'Liquidity', desc: 'Vol > 1M, DolVol > $20M, cmimi > $10', icon: DollarSign },
  { gate: 'Trend + RS', desc: 'Mbi 50/200 SMA, Stacked MA, ADX > 25, RS > SPY ne 60d', icon: TrendingUp },
  { gate: 'Setup Quality', desc: 'Pullback/Breakout me volum, RSI, EMA proximity', icon: BarChart3 },
  { gate: 'Risk Gate', desc: 'R:R >= 1:2 (3R target), risk <= 8%, RSI 30-75', icon: AlertTriangle },
  { gate: 'Sector Limit', desc: 'Max 2 aksione per sektor (diversifikim)', icon: Layers },
  { gate: 'IBKR Bracket', desc: 'Entry + Stop (1.5 ATR) + Take-profit 3R automatik', icon: Target },
];

// ── Section ──
function Section({ title, icon: Icon, children, color = 'text-emerald-400', defaultOpen = true }: {
  title: string; icon: any; children: React.ReactNode; color?: string; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="border-border/50 bg-card">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/5 transition-colors rounded-t-lg">
        <Icon className={`w-5 h-5 ${color} flex-shrink-0`} />
        <span className="font-semibold text-[15px] text-foreground flex-1">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <CardContent className="pt-0 pb-4 px-4">{children}</CardContent>}
    </Card>
  );
}

// ── Funnel step detail popups ──
const FUNNEL_DETAILS: Record<string, { title: string; desc: string; ideal: string; why: string; icon: any }> = {
  'Universe': {
    title: '1. Universe — 200 Kompanite Me te Medha',
    icon: Layers,
    desc: 'Kjo eshte hapa e pare e funnel-it. Ne fillojme me 200 kompanite me te medha sipas kapitalizimit ne tregun amerikan (S&P 500 top). Keto kompani jane te zgjedhura sepse kane likuiditet te larte, jane te disponueshme per tregtim ne IBKR, dhe zakonisht kane volatilite me te mire per swing trading.',
    ideal: 'Idealisht 200 kompani. Ceshtje nese keni me pak se 150 (some tickers nuk u morren nga API).',
    why: 'Nuk ka rendesi sa kompani kalojne — qellimi eshte te kete nje base te ampler per te gjetur cfaredo setup-i i mire qe ekziston ne treg.',
  },
  'Liquidity': {
    title: '2. Liquidity — Filtri Mekanik',
    icon: DollarSign,
    desc: 'Filtri i pare qe heq kompanite qe nuk jane te tregtueshme. Nje aksion duhet te kete cmim minimal $10, volumn mesatar ditor > 1M aksione, dhe volumn ditor ne dollare > $20M. Kjo siguron qe mund te hysh dhe te dalish pa problem likuiditeti, dhe se spread-i bid/ask eshte i ngushte.',
    ideal: 'Sa me shume kompani te kalojne, aq me i mire. Nje treg i shendetshem duhet te kaloje 70-90% te universe-it. Nese kalojne me pak se 50%, tregu mund te jete shume i dobet ose keni probleme te dhena.',
    why: 'Kompanite me likuiditet te ulet kane spread te gjere, slippage te larte, dhe jane te veshtira per te vendosur stop-loss efektiv. Ne duam vetem aksione qe ne mund te tregtojme me besoje.',
  },
  'Trend + RS': {
    title: '3. Trend + Relative Strength',
    icon: TrendingUp,
    desc: 'Ketu kontrollojme nese aksioni eshte ne trend rrites (bullish). Kushtet jane: (1) cmimi mbi SMA 50, (2) SMA 50 mbi SMA 200 (Golden Cross), dhe (3) performanca ne 60 ditet e fundit eshte me e mire sesa SPY (Relative Strength pozitiv). Vetem aksione ne trend rrites kalojne ne fazen tjeter.',
    ideal: 'Normalisht 20-60 kompani kalojne kete filter (10-30% te universe). Nese asnje nuk kalon, tregu mund te jete ne rnie te pergjithshme — aso kohe rreziu i long trades eshte i larte.',
    why: 'Strategjia jonse Trend Pullback Swing punon vetem ne aksione qe jane ne trend rrites. Nje pullback ne nje aksion ne rnie eshte thjesht rije e vazhdueshme, jo oportunite. RS > SPY do te thote se aksioni eshte me i fort se tregu — kjo jep nje edge shtese.',
  },
  'Setup': {
    title: '4. Setup Quality — Pullback / Breakout',
    icon: BarChart3,
    desc: 'Ketu identifikojme nese aksioni ka nje setup konkret: (1) PULLBACK: renie e kontrolluar 2-8 dite drejt EMA 10/20 me volum ne renie, pastaj candle rikthimi. (2) BREAKOUT: cmimi afeer 20d high me volum spike. (3) TREND CONTINUATION: konsolidim afat te larte me trend i forte. Çdo setup vleresohet me score 0-100 bazuar ne RSI, proximitet EMA, volum, dhe RS.',
    ideal: 'Zakonisht 5-25 kompani kane setup te vlefshem. Nese asnje nuk ka, tregu mund te jete ne faze tranzicioni ose te gjithe aksionet jane ose te te ekstenduara ose ne rije.',
    why: 'Pa nje setup te qarte, nuk ka arsye per te hyr. Pullback-i i kontrolluar ne trend rrites eshte njeri nga setup-et me te besueshme ne swing trading, sepse rreziku eshte i definuar (swing low) dhe shperblimi eshte i qarte (rijet e trendit).',
  },
  'Risk Gate': {
    title: '5. Risk Gate — Kontrolli i fundit',
    icon: AlertTriangle,
    desc: 'Hapa i fundit me para se te shfaqet ne liste. Kontrollohet: (1) Reward-to-Risk >= 1:2 (fitimi potential te jete te pakten 2x rrezikun), (2) RSI 30-75 (jo i mbivleresuar), (3) Risk per aksion <= 8% (jo shume i larte), (4) Regjimi i tregut OK (SPY/QQQ mbi SMA 50/200). Kompanite qe kalojneohen kategorizojne si READY ose WATCHLIST.',
    ideal: 'Sa me shume READY aq me i mire. 2-10 kompani ne fund eshte normalja. Nese keni shume WATCHLIST pa READY, rreziu i tregut (regime) mund te jete problemi.',
    why: 'Edhe nje setup i persosur nuk eshte i mire nese R:R eshte i ulet (riskum me i madh se shperblimi) ose nese tregu i pergjithshem nuk eshte mbeshtetes. Ky gate mbron nga marja e trades me probabilitet te ulet.',
  },
  'Top Stocks': {
    title: '8. Top Stocks — Kandidatet Finale',
    icon: Target,
    desc: 'Keto jane 5-10 kompanite me score me te larte qe kane kaluar te gjithe funnel-in. Ato renditen sipas totalScore (0-100) dhe statusit (READY para WATCHLIST para EVENT_RISK). Secila ka Entry, Stop, Target 1R, 2R dhe 3R te llogaritur automatikisht.',
    ideal: 'READY = Gati per tregtim me rreziqet e percaktuara. WATCHLIST = Setup i mire por tregu ose kushtet nuk lejojne hyrje tani — vërehtu. EVENT_RISK = Ngjarje kritike prane, mos hyr.',
    why: 'Ne tregjtojme vetem keto kompani. Cdo gje tjeter eshte te dhena ose analize, por jo sinjal tregtimi.',
  },
  'Event Risk': {
    title: '6. Event & Catalyst Gate',
    icon: ShieldAlert,
    desc: 'Kjo faze kontrollon ngjarje qe chart-i nuk mund t\'i parashikoje: earnings brenda 3 diteve (mos hap long), earnings 4-7 dite (pozicion 50%), FOMC/CPI/NFP brenda 24h (kujdes), 8-K material negative (NO_TRADE), dhe rrezik fundjave. Kategorizohen si CLEAR, POSITIVE, MIXED, EVENT_RISK, ose NO_TRADE.',
    ideal: 'Catalyst Status: CLEAR = asnje ngjarje, hyrje normale. POSITIVE = katalizator pozitiv (8-K positive). MIXED = ul pozicionin (50-75%). EVENT_RISK / NO_TRADE = mos hap.',
    why: 'Nje breakout i persosur teknik mund te shkatërrohet nga nje earnings gap 8-10%. Event gate-i nuk prodhon sinjale — ai mbron setup-in teknik nga gap risk dhe volatilite te papritur.',
  },
  'Sector Limit': {
    title: '7. Sector Limit — Diversifikim',
    icon: Layers,
    desc: 'Max 2 aksione per sektor ne listen finale. Kjo siguron qe nuk je i ekspozuar shume ne nje sektor te vetem (p.sh. 5 aksione tech). Nese nje sektor ka tashme 2 aksione me score me te larte, aksioni i trete hidhet jashe edhe nese ka score te larte.',
    ideal: '2 aksione per sektor maksimum. Nese shikon 3+ aksione ne te njejten sektor, disa u hoqen nga limiti.',
    why: 'Diversifikim i rëndësishëm: nese sektori i teknologjise bie 5% ne nje dite, nuk duhet te kesh 60% te portofolit atje. Max 2 per sektor te siguron nje shperndarje me te shendetshme.',
  },
};

// ── Funnel Visualization ──
function FunnelViz({ funnel }: { funnel: FunnelResponse['funnel'] }) {
  const steps = [
    { label: 'Universe', count: funnel.universe, color: 'bg-blue-500/20 text-blue-400' },
    { label: 'Liquidity', count: funnel.passedLiquidity, color: 'bg-cyan-500/20 text-cyan-400' },
    { label: 'Trend + RS', count: funnel.passedTrend, color: 'bg-emerald-500/20 text-emerald-400' },
    { label: 'Setup', count: funnel.passedSetup, color: 'bg-violet-500/20 text-violet-400' },
    { label: 'Risk Gate', count: funnel.passedRisk, color: 'bg-amber-500/20 text-amber-400' },
    { label: 'Event Risk', count: funnel.passedEventRisk ?? funnel.passedRisk, color: 'bg-red-500/20 text-red-400' },
    { label: 'Sector Limit', count: funnel.passedSectorLimit ?? funnel.passedRisk, color: 'bg-indigo-500/20 text-indigo-400' },
    { label: 'Top Stocks', count: funnel.displayed, color: 'bg-emerald-500/20 text-emerald-400' },
  ];

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {steps.map((s, i) => {
        const detail = FUNNEL_DETAILS[s.label];
        return (
          <div key={s.label} className="flex items-center gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <button className={`rounded-md px-2.5 py-1.5 text-center ${s.color} hover:brightness-125 transition-all cursor-pointer group relative`}>
                  <div className="flex items-center justify-center gap-1">
                    <p className="text-[11px] font-medium opacity-70">{s.label}</p>
                    <Info className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                  </div>
                  <p className="text-[15px] font-bold">{s.count}</p>
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="center" className="w-80 sm:w-96 p-0 overflow-hidden">
                <div className="bg-gradient-to-b from-primary/10 to-transparent px-4 pt-3 pb-2">
                  <div className="flex items-center gap-2">
                    {detail && <detail.icon className={`w-4.5 h-4.5 ${s.color.split(' ')[1]}`} />}
                    <h3 className="text-sm font-bold text-foreground">{detail?.title}</h3>
                  </div>
                </div>
                <div className="px-4 pb-4 space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Çfarë bën kjo fazë?</p>
                    <p className="text-[13px] leading-relaxed text-foreground/85">{detail?.desc}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Idealisht</p>
                    <p className="text-[13px] leading-relaxed text-foreground/85">{detail?.ideal}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400 mb-1">Pse është e rëndësishme?</p>
                    <p className="text-[13px] leading-relaxed text-foreground/85">{detail?.why}</p>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            {i < steps.length - 1 && <ArrowDown className="w-3.5 h-3.5 text-muted-foreground/40" />}
          </div>
        );
      })}
    </div>
  );
}

// ── Bracket Order Block ──
function BracketOrderBlock({ order }: { order: object }) {
  const [copied, setCopied] = useState(false);
  const jsonStr = JSON.stringify(order, null, 2);
  const handleCopy = () => {
    navigator.clipboard.writeText(jsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="mt-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-emerald-400" />
          <p className="text-[13px] font-semibold text-emerald-400">IBKR Bracket Order</p>
        </div>
        <button onClick={handleCopy} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Kopjuar!' : 'Kopjo JSON'}
        </button>
      </div>
      <pre className="text-[11px] text-foreground/70 bg-black/20 rounded p-2.5 overflow-x-auto max-h-40 leading-relaxed">{jsonStr}</pre>
    </div>
  );
}

// ── News Impact Block ──
function NewsImpactBlock({ symbol }: { symbol: string }) {
  const [signal, setSignal] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    fetch(`/api/news/signal?ticker=${symbol}`)
      .then(r => r.json())
      .then(setSignal)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [symbol]);

  if (loading) {
    return (
      <div className="mt-2 rounded-lg bg-orange-500/5 border border-orange-500/15 p-3">
        <div className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 text-orange-400 animate-spin" /><span className="text-[12px] text-orange-400">Duke ngarkuar news signal...</span></div>
      </div>
    );
  }

  if (!signal || signal.confidence < 0.15) return null;

  return (
    <div className="mt-2 rounded-lg bg-orange-500/5 border border-orange-500/15 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <FileText className="w-3.5 h-3.5 text-orange-400" />
        <p className="text-[12px] font-semibold text-orange-400">News Impact Signal</p>
        <Badge variant="outline" className="ml-auto text-[10px] border-orange-500/30 text-orange-300">{Math.round(signal.confidence * 100)}% konfidencë</Badge>
      </div>
      <div className="grid grid-cols-4 gap-x-3 gap-y-1.5 text-[12px]">
        <div className="flex justify-between"><span className="text-muted-foreground">Impakt Prob.</span><span className={signal.impactProbability > 0.5 ? 'text-orange-300 font-medium' : 'text-foreground/80'}>{Math.round(signal.impactProbability * 100)}%</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Move 1D</span><span className={signal.expectedMove1d > 0 ? 'text-emerald-300' : 'text-red-300'}>{signal.expectedMove1d > 0 ? '+' : ''}{(signal.expectedMove1d * 100).toFixed(1)}%</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Move 3D</span><span className={signal.expectedMove3d > 0 ? 'text-emerald-300' : 'text-red-300'}>{signal.expectedMove3d > 0 ? '+' : ''}{(signal.expectedMove3d * 100).toFixed(1)}%</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Horizon</span><span className="text-foreground/80">{signal.bestHorizon}</span></div>
      </div>
      {signal.similarCases && signal.similarCases.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-[11px] text-muted-foreground">Raste të ngjashme:</p>
          {signal.similarCases.slice(0, 3).map((c: any, i: number) => (
            <div key={i} className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">{c.date} {c.ticker}</span>
              <span className={c.abnormalReturn1d > 0 ? 'text-emerald-400' : 'text-red-400'}>
                1D: {c.abnormalReturn1d > 0 ? '+' : ''}{(c.abnormalReturn1d * 100).toFixed(1)}% | 3D: {c.abnormalReturn3d > 0 ? '+' : ''}{(c.abnormalReturn3d * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stock Card ──
function StockCard({ stock, rank, vp }: { stock: FunnelStock; rank: number; vp?: any }) {
  const [expanded, setExpanded] = useState(false);
  const [rankingChanges, setRankingChanges] = useState<any[] | null>(null);
  const [loadingChanges, setLoadingChanges] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [changesError, setChangesError] = useState<string | null>(null);

  // Fetch ranking changes for this ticker
  const fetchRankingChanges = useCallback(async () => {
    if (rankingChanges !== null) return; // already fetched
    setLoadingChanges(true);
    setChangesError(null);
    try {
      const res = await fetch(`/api/scanner-learning/changes?ticker=${stock.symbol}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        if (data.error) {
          setChangesError(data.error);
          setRankingChanges([]);
        } else {
          setRankingChanges(data.changes || []);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setChangesError(data.error || 'Gabim ne server');
        setRankingChanges([]);
      }
    } catch (e) {
      setChangesError('Gabim rrjeti');
      setRankingChanges([]);
    } finally {
      setLoadingChanges(false);
    }
  }, [stock.symbol, rankingChanges]);
  const ds = DECISION_STYLE[stock.decision];
  const setupColor = stock.setup === 'PULLBACK' ? 'text-amber-400' : stock.setup === 'BREAKOUT' ? 'text-blue-400' : stock.setup === 'TREND_CONT' ? 'text-emerald-400' : 'text-muted-foreground';
  const setupBg = stock.setup === 'PULLBACK' ? 'bg-amber-500/15 border-amber-500/30' : stock.setup === 'BREAKOUT' ? 'bg-blue-500/15 border-blue-500/30' : 'bg-emerald-500/15 border-emerald-500/30';

  // ── Dynamic verdicts for each indicator ──
  const vRSI = stock.rsi >= 40 && stock.rsi <= 65
    ? `RSI ${stock.rsi.toFixed(0)} eshte ne zone ideale (40-65). Aksioni ka bere nje pullback te kontrolluar — forca e bleres eshte akoma e pranishme por jo e mbivleresuar. Kjo eshte zona me e mire per entry ne strategjine Pullback Swing.`
    : stock.rsi > 70
    ? `RSI ${stock.rsi.toFixed(0)} eshte i larte (mbi 70). Aksioni eshte ne rrezik te mbivleresuar — bleresit kane qene shume agresiv. Nje pullback ose korektim eshte i mundshem. Mos hyr tani, prit nje rikthim drejt EMA 10/20.`
    : stock.rsi < 30
    ? `RSI ${stock.rsi.toFixed(0)} eshte shume i ulet (nen 30). Aksioni eshte ne zone nje shitje te tepruar. Ka potentiale per rikthim, por shpesh tregon nje trend te dobet.`
    : `RSI ${stock.rsi.toFixed(0)} eshte jashte zones ideale (40-65). Nuk eshte i keq, por nuk eshte ne zone optimale per pullback entry.`;

  const vRR = stock.rewardRiskRatio >= 3
    ? `1:${stock.rewardRiskRatio} eshte shume i mire (mbi 1:3). Per cdo $1 rrezik, target 3R jep $${stock.rewardRiskRatio} fitim. Edhe me 40% winrate, keshtu fiton ne fund.`
    : stock.rewardRiskRatio >= 2
    ? `1:${stock.rewardRiskRatio} eshte i mjaftueshem (mbi 1:2). Stop-i eshte i ngushte sa duhet ndaj target 3R. Me nje winrate 50%+, kjo jep edge pozitiv.`
    : `1:${stock.rewardRiskRatio} eshte i ulet (nen 1:2). Rreziku eshte me i madh se shperblimi potential. Nje R:R i ulet do te thote qe stop-i eshte shume gjere ose target-i 3R eshte shume afer.`;

  const vRisk = stock.riskPct <= 3
    ? `Risku ${stock.riskPct}% eshte shume i ulet. Stop-i eshte i ngushte — cmimi duhet te leveze vetem ${stock.riskPct}% kunder teje per te goditur stop. Kjo eshte e shkelqyer per pengese minimale dhe R:R te larte.`
    : stock.riskPct <= 5
    ? `Risku ${stock.riskPct}% eshte akoma i pranueshem. Stop-i eshte i arsyeshem per nje swing trade 5-10 ditor. Jo ideal, por funksional nese setup-i teknik eshte i forte.`
    : `Risku ${stock.riskPct}% eshte i larte. Nese stop goditet, humb ${stock.riskPct}% nga kapitali. Konsidero te prisesh nje pullback me i thelle per nje stop me te ngushte.`;

  const rsSign = stock.rsVsSPY > 0 ? '+' : '';
  const vRS = stock.rsVsSPY > 3
    ? `RS ${rsSign}${stock.rsVsSPY.toFixed(1)}% eshte shume i forte. Aksioni po outperformon S&P 500 ne 22 dite. Institucionet po akumulojne — kjo tregon besim te larte.`
    : stock.rsVsSPY > 0
    ? `RS ${rsSign}${stock.rsVsSPY.toFixed(1)}% eshte pozitiv. Aksioni po performon me mire se S&P 500. Kjo eshte e pranueshme per pullback swing — trendi institucional eshte akoma i pranishem.`
    : stock.rsVsSPY > -3
    ? `RS ${stock.rsVsSPY.toFixed(1)}% eshte negativ por jo shume i keq. Mund te jete nje pullback i perkohshem. Verehtu — nese RS nuk rimerr, trendi mund te jete ne ndryshim.`
    : `RS ${stock.rsVsSPY.toFixed(1)}% eshte i dobet. Aksioni po underperformon S&P 500. Kjo tregon humbje interesi institucional. Shmang per momentin.`;

  const vATR = stock.atrPct <= 1.5
    ? `ATR ${stock.atrPct}% eshte shume i ulet. Aksioni leveze mesatarisht vetem $${stock.atr.toFixed(2)} ne dite. Stop-loss mund te jete shume i ngushte, lëvizjet drejt target 3R jane me te parashikueshme.`
    : stock.atrPct <= 2.5
    ? `ATR ${stock.atrPct}% eshte ne rregull. Levizja mesatare ditorne eshte $${stock.atr.toFixed(2)}. Volatiliteti i arsyeshem per swing trading.`
    : stock.atrPct <= 3.5
    ? `ATR ${stock.atrPct}% eshte i larte. Levizje $${stock.atr.toFixed(2)} ne dite. Stop-loss do te jete i gjere, rreziku i gap overnight rritet.`
    : `ATR ${stock.atrPct}% eshte shume i larte. Aksioni eshte shume volatil — nuk eshte i pershtatshem per strategjine Pullback Swing.`;

  const dolVolM = `$${(stock.avgDolVol20d / 1e6).toFixed(0)}M`;
  const vDolVol = stock.avgDolVol20d >= 100e6
    ? `${dolVolM}/dite eshte likuiditet shume i larte. Mund te hysh e te dalish me ordra te medha pa asnje ndikim ne cmim. Spread-i minimal, stop-loss ekzekutohet me precision.`
    : stock.avgDolVol20d >= 50e6
    ? `${dolVolM}/dite eshte i mire. Likuiditet i mjaftueshem per stop-loss pa problem. I pershtatshem per swing trading.`
    : stock.avgDolVol20d >= 20e6
    ? `${dolVolM}/dite eshte i pranueshem por jo ideal. Perdor limit ordere, jo market ordera.`
    : `${dolVolM}/dite eshte i ulet. Rrezik per slippage te larte. Nuk rekomandohet per swing trading.`;

  const vADX = stock.adx >= 50
    ? `ADX ${stock.adx} eshte shume i larte. Aksioni ka nje trend shume te forte, pothuaj ne fazen e eksplozimit. Hyr vetem nese R:R eshte shume i mire.`
    : stock.adx >= 25
    ? `ADX ${stock.adx} tregon nje trend te forte. Aksioni ka nje drejtim te qarte — pullback-i ka me shume probabilitet te jete i perkohshem. Zona optimale.`
    : stock.adx >= 20
    ? `ADX ${stock.adx} tregon nje trend po formohet. Forca eshte akoma ne zhvillim. Konsidero pozicion me te vogel ose prit konfirmim.`
    : `ADX ${stock.adx} eshte i ulet. Aksioni nuk ka trend te qarte — strategjia Pullback Swing nuk funksionon ketu. Shmang.`;

  return (
    <Card className={`border-border/50 bg-card hover:border-border transition-all ${stock.decision === 'READY' ? 'border-emerald-500/30' : ''}`}>
      <CardContent className="p-4">
        {/* Top row */}
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${rank <= 3 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-muted/30 text-muted-foreground'}`}>{rank}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-base text-foreground">{stock.symbol}</span>
              <Badge className={`${setupBg} ${setupColor} text-[12px] px-2.5 py-0.5 font-semibold`} variant="outline">
                {stock.setup === 'TREND_CONT' ? 'TREND CONT' : stock.setup}
              </Badge>
              <Badge className={`${ds.bg} ${ds.text} ${ds.border} text-[12px] px-2.5 py-0.5 font-semibold`} variant="outline">
                {ds.label}
              </Badge>
              <Badge variant="outline" className="text-[11px] border-border/30 text-muted-foreground px-2 py-0.5">{stock.horizon}</Badge>
            </div>
            <p className="text-[13px] text-muted-foreground mt-1">
              ${stock.price.toFixed(2)} · Pullback {stock.pullbackDays}d ({stock.pullbackPct > 0 ? '+' : ''}{stock.pullbackPct.toFixed(1)}%)
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <MiniPopover label={"Total Score " + stock.totalScore + "/100"} desc={"Score-i total (0-100) është kombinimi ponderuar i 6 nën-scoreve: 25% Trend Quality + 20% Relative Strength + 15% Momentum + 15% Volume Confirmation + 10% Setup Quality + 5% Risk Quality. Mat cilësinë e përgjithshme të setup-it për swing trading. Idealisht: 65-100 = SETUP I MIRË (jeshil) — kushte të forta për hyrje, 50-64 = MESATAR (portokalli) — hyrje vetëm me kushte të tjera pozitive (VP_OK, regjimi OK, pa event risk), 0-49 = RREZIK (kuq) — setup i dobët, shmang hyrjen ose vetëm watchlist. Kujdes: score-i i lartë NUK e kompenson event-risk — aksioni me score 88 por earnings nesër merr EVENT_RISK/NO_TRADE. Kontrollo gjithmonë edhe: Earnings, VP location, dhe regjimin e tregut përpara hyrjes." + (stock.totalScore >= 65 ? " — VLERËSIMI PËR KËTË AKSION: Score i mirë, kushtet teknike janë të forta." : stock.totalScore >= 50 ? " — VLERËSIMI PËR KËTË AKSION: Score mesatar — kërko konfirmime shtesë përpara hyrjes." : " — VLERËSIMI PËR KËTË AKSION: Score i dobët — rrezik i lartë, konsidero vetëm watchlist.")} >
              <div className="text-right">
                <div className={`text-2xl font-bold ${stock.totalScore >= 65 ? 'text-emerald-400' : stock.totalScore >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{stock.totalScore}</div>
                <div className="text-[12px] text-muted-foreground">Score</div>
                {stock.learningAdj != null && Math.abs(stock.learningAdj) >= 1 && (
                  <MiniPopover label={`Mësimi ${stock.learningAdj > 0 ? '+' : ''}${stock.learningAdj}`} desc={"Learning Engine e rregulloi këtë score bazuar në rezultatet historike reale: faktorët që kanë fituar në të kaluarën (p.sh. Trend i fortë, RSI në zonën fituese) marrin peshë më të lartë, dhe faktorët me performancë të dobët ulen. Diferenca tregon saktësisht sa pikë shtoi/hoqi mësimi."} >
                    <div className={`mt-0.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${stock.learningAdj > 0 ? 'bg-violet-500/15 text-violet-300 border border-violet-500/20' : 'bg-amber-500/15 text-amber-300 border border-amber-500/20'}`}>
                      <Brain className="w-2.5 h-2.5" />
                      {stock.learningAdj > 0 ? '+' : ''}{stock.learningAdj}
                    </div>
                  </MiniPopover>
                )}
              </div>
            </MiniPopover>
          </div>
        </div>

        {/* Score breakdown - 6 sub-scores */}
        <div className="mt-3 grid grid-cols-6 gap-1.5">
          <ScoreCell label="Trend" value={stock.trendScore} />
          <ScoreCell label="RS" value={stock.rsScore} />
          <ScoreCell label="Momentum" value={stock.momentumScore} />
          <ScoreCell label="Volum" value={stock.volConfScore} />
          <ScoreCell label="Setup" value={stock.setupScore} />
          <ScoreCell label="Risk" value={stock.riskScore} />
        </div>

        {/* Entry / Stop / Target — 5 columns with 3R */}
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          <EntryBox label="ENTRY" value={stock.entry} color="text-blue-400" bg="bg-blue-500/5 border-blue-500/15" />
          <EntryBox label="STOP" value={stock.stop} color="text-red-400" bg="bg-red-500/5 border-red-500/15" />
          <EntryBox label="TARGET 1R" value={stock.target1R} color="text-emerald-400" bg="bg-emerald-500/5 border-emerald-500/15" />
          <EntryBox label="TARGET 2R" value={stock.target2R} color="text-emerald-400" bg="bg-emerald-500/5 border-emerald-500/20" />
          <EntryBox label="TARGET 3R" value={stock.target3R} color="text-emerald-300" bg="bg-emerald-500/10 border-emerald-500/30" />
        </div>

        <div className="mt-2.5 rounded-lg bg-cyan-500/5 border border-cyan-500/15 p-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <p className="text-[12px] font-semibold text-cyan-400">Swing Prediction</p>
          </div>
          {/* Row 1: 4 columns — zone, resistance, upside, range */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5 text-[12px]">
            <MiniPopover label="Pullback Zone" desc={"Zona e pullback-it — nga low-i 10-ditor (mbështetja) deri te cmimi aktual. Kjo është zona ku aksioni po bën korektimin brenda trendit rritës. Nëse cmimi preket këtë zonë dhe jep candle rikthimi, është sinjal hyrjeje. Zona e gjerë tregon korektim më të thellë."} >
              <div className="flex flex-col gap-0.5 w-full"><span className="text-muted-foreground">Pullback Zone</span><span className="text-cyan-300 font-medium truncate">{stock.pullbackZone ?? '—'}</span></div>
            </MiniPopover>
            <MiniPopover label="Rezistenca" desc={"Niveli i ardhshëm i rezistencës — high-i më i lartë 20-ditor. Kjo është zona ku çmimi mund të hasë shitje. Nëse target 3R është afër kësaj rezistence, mund të ketë vështirësi për të kaluar atë. Rezistencë të lartë = upsides më të kufizuara."} >
              <div className="flex flex-col gap-0.5 w-full"><span className="text-muted-foreground">Rezistenca</span><span className="text-orange-300 font-medium">${(stock.nextResistance ?? 0).toFixed(2)}</span></div>
            </MiniPopover>
            <MiniPopover label="Upside 3R" desc={"Potenciali i fitimit deri te Target 3R si përqindje. Llogaritet: (Target3R - Cmimi aktual) / Cmimi aktual x 100. Nëse është pozitiv, ka hapësirë fitimi. Nëse negativ, target 3R është poshtë cmimit aktual (setup i keq ose stop shumë i gjerë)."} >
              <div className="flex flex-col gap-0.5 w-full"><span className="text-muted-foreground">Upside 3R</span><span className={(stock.projectedUpsidePct ?? 0) > 0 ? 'text-emerald-300 font-medium' : 'text-red-300 font-medium'}>{(stock.projectedUpsidePct ?? 0) > 0 ? '+' : ''}{stock.projectedUpsidePct ?? 0}%</span></div>
            </MiniPopover>
            <MiniPopover label="Rangu Ditor (Expected Range)" desc={"Rangu i pritur ditor — llogaritet si Cmimi ± ATR (Average True Range). Kjo tregon se sa larg mund të lëvizë çmimi sot bazuar në volatilitetin e fundit. Përdoret për të vendosur pritjet realiste — mos pres që 1R të arrihet në një ditë nëse rangu ditor është më i vogël se distanca 1R."} >
              <div className="flex flex-col gap-0.5 w-full"><span className="text-muted-foreground">Rangu Ditor</span><span className="text-foreground/80 truncate">{stock.dailyExpRange ?? '—'}</span></div>
            </MiniPopover>
          </div>
          {/* Row 2: 3 columns — days to target */}
          <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-[12px] mt-1.5">
            <MiniPopover label="Ditë deri te 1R" desc={"Sa ditë (afërsisht) deri sa çmimi të arrijë Target 1R, bazuar në ATR. Llogaritet: distanca 1R / ATR. Nëse 1R = $6 dhe ATR = $2, atëherë ~3 ditë. Kjo jep ide kohore — nëse është shumë e gjatë (mbi 15d), rreziku i tregut rritet."} >
              <div className="flex justify-between w-full"><span className="text-muted-foreground">1R ne</span><span className="text-foreground/80 font-medium">{stock.daysTo1R ?? 0}d</span></div>
            </MiniPopover>
            <MiniPopover label="Ditë deri te 2R" desc={"Sa ditë (afërsisht) deri sa çmimi të arrijë Target 2R. Llogaritet: distanca 2R / ATR. Shumica e swing trade-ve mbahen 3-10 ditë. Nëse 2R kërkon mbi 10 ditë, konsidero nje setup me R:R më të mirë ose ATR më të lartë."} >
              <div className="flex justify-between w-full"><span className="text-muted-foreground">2R ne</span><span className="text-foreground/80 font-medium">{stock.daysTo2R ?? 0}d</span></div>
            </MiniPopover>
            <MiniPopover label="Ditë deri te 3R" desc={"Sa ditë (afërsisht) deri sa çmimi të arrijë Target 3R. Llogaritet: distanca 3R / ATR. Kjo është horizonti kohor i plotë i trade-it. Nëse 3R kërkon mbi 15 ditë, rreziku i regjimit të tregut ndryshimit rritet — konsidero reduktim të pozicionit në 2R."} >
              <div className="flex justify-between w-full"><span className="text-muted-foreground">3R ne</span><span className="text-foreground/80 font-medium">{stock.daysTo3R ?? 0}d</span></div>
            </MiniPopover>
          </div>
        </div>


        {/* Quick stats row */}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
          <StatPopover label="RSI" value={stock.rsi} good={stock.rsi >= 40 && stock.rsi <= 65} warn={stock.rsi > 70 || stock.rsi < 30}
            ideal="40 - 65 (pullback zone)" warnRange="mbi 70 (mbivleresuar) ose nen 30"
            desc="Relative Strength Index — mat forcen e levizjes se fundit ne nje shkalle 0-100. Ne pullback swing, duam RSI 40-65."
            verdict={vRSI}
          />
          <StatPopover label="R:R" value={`1:${stock.rewardRiskRatio}`} good={stock.rewardRiskRatio >= 2} warn={stock.rewardRiskRatio < 1.5}
            ideal="1:2.0 ose me i larte" warnRange="nen 1:1.5 (rrezik me i madh se shperblimi)"
            desc="Reward-to-Risk Ratio — sa dollar fitimi per cdo dollar rreziqi. Me R:R te larte, edhe nje winrate me te ulet jep fitim."
            verdict={vRR}
          />
          <StatPopover label="Risk" value={`${stock.riskPct}%`} good={stock.riskPct <= 4} warn={stock.riskPct > 6}
            ideal="2% - 4%" warnRange="mbi 6% (shume i larte per nje swing trade)"
            desc="Rreziku per aksion — distance nga Entry deri te Stop si perqindje e cmimit te hyrjes. Maximum 8%."
            verdict={vRisk}
          />
          <StatPopover label="RS SPY" value={`${stock.rsVsSPY > 0 ? '+' : ''}${stock.rsVsSPY.toFixed(1)}%`} good={stock.rsVsSPY > 0} warn={stock.rsVsSPY < -3}
            ideal="Positive (mbi 0%)" warnRange="nen -3% (aksioni eshte me i dobet se tregu)"
            desc="Relative Strength vs SPY — sa me mire ka performuar aksioni ne 22 dite krah SPY."
            verdict={vRS}
          />
          <StatPopover label="ATR" value={`${stock.atrPct}%`} good={stock.atrPct <= 2} warn={stock.atrPct > 3.5}
            ideal="1% - 2.5%" warnRange="mbi 3.5% (shume volatil, i pakontrollueshem)"
            desc="Average True Range — mat volatilitetin mesatar ditor. Perdoret per te vendosur stop-loss."
            verdict={vATR}
          />
          <StatPopover label="DolVol" value={`${(stock.avgDolVol20d / 1e6).toFixed(0)}M`} good={stock.avgDolVol20d >= 50e6} warn={stock.avgDolVol20d < 20e6}
            ideal="mbi $50M/dite" warnRange="nen $20M/dite (likuiditet i ulet, spread i gjere)"
            desc="Dollar Volume mesatar 20-ditor — sa dollarra tregtohen ne dite. DolVol i larte siguron ekzekutim pa problem."
            verdict={vDolVol}
          />
          <StatPopover label="ADX" value={stock.adx} good={stock.adx > 25} warn={stock.adx < 20}
            ideal="mbi 25 (trend i forte)" warnRange="nen 20 (pa trend ose trend i dobet)"
            desc="Average Directional Index — mat forcen e trendit pa marre parasysh drejtimin. 25-50 = trend i forte."
            verdict={vADX}
          />        </div>

        {/* EMA / SMA values */}
        <div className="mt-1.5 flex items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
          <span>EMA10 <span className="text-cyan-300 font-medium">${(stock.ema10Val ?? 0).toFixed(2)}</span></span>
          <span>EMA20 <span className="text-cyan-300 font-medium">${(stock.ema20Val ?? 0).toFixed(2)}</span></span>
          <span>SMA50 <span className="text-foreground/70 font-medium">${(stock.sma50Val ?? 0).toFixed(2)}</span></span>
        </div>

        {/* Liquidity Metrics */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
          <MiniPopover label={"ADV " + (stock.avgDolVol20d >= 1e9 ? (stock.avgDolVol20d / 1e9).toFixed(1) + 'B' : (stock.avgDolVol20d / 1e6).toFixed(0) + 'M')} desc={"Average Dollar Volume 20D: sa dollarra tregtohen mesatarisht ne dite. Llogaritet si mesatarja e (close x volume) per 20 ditet e fundit. >$100M = Excellent, $50-100M = Strong, $20-50M = Good."} >
            <span className={"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium " + (stock.avgDolVol20d >= 50e6 ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" : stock.avgDolVol20d >= 20e6 ? "bg-amber-500/15 text-amber-400 border border-amber-500/20" : "bg-red-500/15 text-red-400 border border-red-500/20")}>
              ADV {(stock.avgDolVol20d >= 1e9 ? (stock.avgDolVol20d / 1e9).toFixed(1) + 'B' : (stock.avgDolVol20d / 1e6).toFixed(0) + 'M')}
            </span>
          </MiniPopover>
          <MiniPopover label={"Spread " + (stock.spreadPct ?? 0).toFixed(2) + "%"} desc={"Bid-Ask Spread %: kushtet e hyrjes ne treg. <= 0.10% = Excellent, 0.10-0.25% = Good, 0.25-0.50% = Medium, > 0.50% = Weak. Spread i ulet do te thote ekzekutim me i mire."} >
            <span className={"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium " + ((stock.spreadPct ?? 0) <= 0.10 ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" : (stock.spreadPct ?? 0) <= 0.25 ? "bg-amber-500/15 text-amber-400 border border-amber-500/20" : "bg-red-500/15 text-red-400 border border-red-500/20")}>
              Spread {(stock.spreadPct ?? 0).toFixed(2)}%
            </span>
          </MiniPopover>
          <MiniPopover label={"Likuiditeti " + (stock.liquidityScore ?? 0) + "/100"} desc={"Liquidity Score 0-100: kombinim 60% Dollar Volume Score + 40% Spread Score. 80-100 = High, 60-79 = Good, 40-59 = Medium, <40 = Low."} >
            <span className={"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium " + ((stock.liquidityScore ?? 0) >= 80 ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" : (stock.liquidityScore ?? 0) >= 60 ? "bg-blue-500/15 text-blue-400 border border-blue-500/20" : (stock.liquidityScore ?? 0) >= 40 ? "bg-amber-500/15 text-amber-400 border border-amber-500/20" : "bg-red-500/15 text-red-400 border border-red-500/20")}>
              Likuiditeti {stock.liquidityScore ?? 0}/100
            </span>
          </MiniPopover>
          {/* NEW: RVOL badge */}
          <MiniPopover label={"RVOL " + (stock.rvol ?? 0) + "x — " + (stock.rvolStatus ?? 'N/A')} desc={"Relative Volume — volumi i ditës së fundit të përfunduar përballë mesatares 20-ditore. Mat participimin institucional. Idealisht: mbi 1.5x = HIGH (institucionet janë aktivë — konfirmim i hyrjes, +10 pikë në volum score), 0.8-1.5x = NORMAL (volum standard), nën 0.8x = LOW (interesi i ulët — pullback-i mund të vazhdojë pa bounce, prit konfirmim). RVOL i lartë në ditën e rikthimit (bounce) nga pullback = sinjali më i fortë i hyrjes — dikush i madh po blen. RVOL i ulët në bounce = rrezik i hyrjes së rreme." + ((stock.rvol ?? 0) >= 1.5 ? " — VLERËSIMI: RVOL i lartë — konfirmim institucional!" : (stock.rvol ?? 0) >= 0.8 ? " — VLERËSIMI: RVOL normal." : " — VLERËSIMI: RVOL i ulët — prit volum konfirmues para hyrjes.")} >
            <span className={"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium " + ((stock.rvol ?? 0) >= 1.5 ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" : (stock.rvol ?? 0) >= 0.8 ? "bg-blue-500/15 text-blue-400 border border-blue-500/20" : "bg-amber-500/15 text-amber-400 border border-amber-500/20")}>
              RVOL {(stock.rvol ?? 0).toFixed(2)}x
            </span>
          </MiniPopover>
          {/* NEW: 52W High distance badge */}
          <MiniPopover label={"52W High: $" + (stock.high52w ?? 0).toFixed(2) + " (" + (stock.distFrom52wHighPct ?? 0).toFixed(1) + "% larg)"} desc={"Distancën nga maja e 52 javëve (1 vit). Aksionet brenda 15% të maksimumit vjetor kanë avantazh statistikor momentum-i (studimet O'Neil/Minervini: liderët e tregut dalin nga bazat afër majave të reja, jo thellë poshtë). Idealisht: 0-15% = ZONA E MIRË (momentum edge, +10 pikë në momentum score — 'near 52w high'), 15-30% = mesatare (ka nevojë për rikuperim), mbi 30% = larg majës (setup i dobët për momentum swing — çmimi duhet të rifitojë shumë terren). Kujdes: aksioni PRANË maksimumit por pa bazë (base) të formuar = rrezik bli-në-majë; më i mirë është pullback brenda 15% të majës." + ((stock.near52wHigh ?? false) ? " — VLERËSIMI: Brenda 15% të majës — momentum edge aktiv!" : " — VLERËSIMI: Larg 52w high — setup-i ka më pak forcë momentum-i.")} >
            <span className={"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium " + ((stock.distFrom52wHighPct ?? 100) <= 15 ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" : (stock.distFrom52wHighPct ?? 100) <= 30 ? "bg-amber-500/15 text-amber-400 border border-amber-500/20" : "bg-red-500/15 text-red-400 border border-red-500/20")}>
              52W {(stock.distFrom52wHighPct ?? 0).toFixed(1)}%
            </span>
          </MiniPopover>
          {/* NEW: ATR% tradability badge */}
          <MiniPopover label={"ATR% " + (stock.atrPct ?? 0).toFixed(2) + "% — " + (stock.atrStatus ?? 'N/A')} desc={"ATR% — Average True Range si përqindje e çmimit: sa lëviz aksioni mesatarisht në një ditë. Idealisht: 1.5-6% = OK (rangu ideal për swing trading — 1R arrihet në 2-5 ditë), mbi 6% = TOO_VOLATILE (stop-i brutal, rrezik për share shumë i madh — READY kthehet në WATCHLIST deri volatiliteti të qetësohet), nën 1.5% = TOO_SLOW (aksion 'i ngadaltë' — targetat 2R/3R duan javë të tëra, kapitali bllokohet pa dobi). ATR% të lartë gjatë regjimit CAUTION = rrezik i dyfishuar." + ((stock.atrStatus ?? '') === 'OK' ? " — VLERËSIMI: Volatilitet ideal për swing." : (stock.atrStatus ?? '') === 'TOO_VOLATILE' ? " — VLERËSIMI: Shume i paqëndrueshëm — konsidero pritje ose pozicion shume te vogel." : " — VLERËSIMI: I ngadaltë — targetat duan shume kohe.")} >
            <span className={"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium " + ((stock.atrStatus ?? '') === 'OK' ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" : (stock.atrStatus ?? '') === 'TOO_VOLATILE' ? "bg-red-500/15 text-red-400 border border-red-500/20" : "bg-amber-500/15 text-amber-400 border border-amber-500/20")}>
              ATR {(stock.atrPct ?? 0).toFixed(1)}%
            </span>
          </MiniPopover>
          {/* Pse ndryshoi? button */}
          <button
            onClick={() => {
              if (!showChanges) fetchRankingChanges();
              setShowChanges(!showChanges);
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-500/15 text-violet-400 border border-violet-500/20 hover:bg-violet-500/25 transition-colors cursor-pointer"
            title="Pse ndryshoi renditja?"
          >
            <GitCompareArrows className="w-3 h-3" />
            Pse ndryshoi?
            {showChanges && <ChevronUp className="w-3 h-3" />}
            {!showChanges && <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Volume Profile info — from Adaptive Scanner Engine */}
        {vp && (
          <div className="mt-2 rounded-lg bg-blue-500/5 border border-blue-500/15 p-2.5">
            <div className="flex items-center gap-1.5 mb-2">
              <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
              <p className="text-[12px] font-semibold text-blue-400">Volume Profile — {stock.symbol}</p>
              {vp.vpScore != null && (
                <span className="ml-auto">
                  <MiniPopover label={"VP Score " + vp.vpScore + "/100"} desc={"Volume Profile Score 0-100: sa i mirë është setup-i i çmimit në raport me volumin e tregtuar gjatë 20 ditëve të fundit (Daily timeframe). Llogaritet: +35 pikë nëse ka mbështetje volumi (HVN/POC) poshtë çmimit, +20 nëse çmimi është brenda ose mbi Value Area, +25 nëse ka së paku 2% hapësirë deri te rezistenca e ardhshme, +20 nëse nuk ka rezistencë të afërt sipër. Idealisht: 80-100 = Setup i shkelqyer (kushte ideale per hyrje), 60-79 = Setup i mire (hyrje me kujdes), 40-59 = Mesatar (prit konfirmim), 0-39 = Setup i dobet (shmang)."} >
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">
                      VP {vp.vpScore}/100
                    </span>
                  </MiniPopover>
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              {vp.poc != null && (
                <MiniPopover label={"POC (Point of Control) — $" + vp.poc.toFixed(2)} desc={"Pika e Kontrollit — niveli i cmimit ku eshte tregtuar VOLUMI me i madh gjate 20 ditet e fundit. Ky eshte niveli me pranimin me te larte te tregut dhe vepron si 'magnet' — cmimi ka tendence te kthehet te POC. Idealisht: POC duhet te jete POSHTE cmimit aktual (funksionon si mbeshtetje ku hyrja ka kuptim) ose shume afer cmimit gjate hyrjes ne pullback. Nese POC eshte shume lart, cmimi ka tendence te terhiqet poshte — prit pullback para hyrjes."} >
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">POC</span>
                    <span className="font-mono font-bold text-amber-400">${vp.poc.toFixed(2)}</span>
                  </div>
                </MiniPopover>
              )}
              {vp.val != null && (
                <MiniPopover label={"VAL (Value Area Low) — $" + vp.val.toFixed(2)} desc={"Fundi i Value Area — niveli me i ulet i zones ku eshte tregtuar 70% e volumit (20 dite). Poshte VAL = zone me pranim te ulet —bleresit nuk e mbeshtesin cmimin atje. Idealisht per pullback entry: hyrja afer VAL me candle rikthimi (bounce) jep R:R shume te mire sepse stop-i vendoset afer nen VAL. Kujdes: nese cmimi e thyen VAL me volum te larte, shmang long — eshte shenje renieje me te thelle."} >
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">VAL</span>
                    <span className="font-mono font-bold text-blue-400">${vp.val.toFixed(2)}</span>
                  </div>
                </MiniPopover>
              )}
              {vp.vah != null && (
                <MiniPopover label={"VAH (Value Area High) — $" + vp.vah.toFixed(2)} desc={"Maja e Value Area — niveli me i larte i zones ku eshte tregtuar 70% e volumit (20 dite). Idealisht: cmimi aktual duhet te jete NEN VAH me hapesire per te ngjitur (target-i 2R/3R ka vend per te arritur) ose duke e thyer VAH me volum te larte (breakout i vertete drejt targets me te larta). Kujdes: nese cmimi eshte shume afer VAH dhe nuk e thyen, mund te refuzohet (rejection) poshte. VAH i thyer pa volum = breakout i rreme — mos e ndjek."} >
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">VAH</span>
                    <span className="font-mono font-bold text-blue-400">${vp.vah.toFixed(2)}</span>
                  </div>
                </MiniPopover>
              )}
            </div>
            <div className="flex items-center gap-3 mt-2 text-[10px]">
              {vp.hvnBelow != null && (
                <MiniPopover label={"HVN poshte (Support) — $" + vp.hvnBelow.toFixed(2)} desc={"High Volume Node poshte — zona ku eshte tregtuar volum te pakten 1.5x mesatarja, tani NEN cmimin aktual. Kjo eshte MBËSHTETJE e FORTE sepse investitoret e mbrojne cmimin ku kane blere me shume. Idealisht: HVN poshte brenda 1.2% te cmimit aktual = mbeshtetje e afer (shfaq '(support)' — kondita ideale per hyrje). Sa me afer, aq me i sigurt stop-loss-i dhe R:R me i mire. Kujdes: HVN poshte shume larg = stop i gjere dhe risk me i larte per share."} >
                  <span className="flex items-center gap-1">
                    <span className="text-muted-foreground">HVN↓</span>
                    <span className="font-mono text-emerald-400">${vp.hvnBelow.toFixed(2)}</span>
                    {vp.supportBelow && <span className="text-emerald-400 font-bold">(support)</span>}
                  </span>
                </MiniPopover>
              )}
              {vp.hvnAbove != null && (
                <MiniPopover label={"HVN sipër (Rezistencë) — $" + vp.hvnAbove.toFixed(2)} desc={"High Volume Node sipër — zona ku eshte tregtuar volum te pakten 1.5x mesatarja, tani MBI cmimin aktual. Kjo eshte REZISTENCE e forte sepse aty jane grumbulluar shume bleres qe duan te dalin ne fitim (selling pressure). Idealisht: HVN sipër duhet te jete se pakut 2% larg cmimit (hapesire mjaftueshme fitimi deri atje — 'room up'). Kujdes: nese eshte brenda 1.2% te cmimit shfaqet 'NO_CHASE' — mos e ndjek cmimin atje, prit pullback ose thyerje te konfirmuar me volum."} >
                  <span className="flex items-center gap-1">
                    <span className="text-muted-foreground">HVN↑</span>
                    <span className="font-mono text-red-400">${vp.hvnAbove.toFixed(2)}</span>
                    {vp.resistanceAbove && <span className="text-red-400 font-bold">(resist)</span>}
                  </span>
                </MiniPopover>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1.5 text-[10px]">
              {vp.vpLocation && (
                <MiniPopover label={"Location: " + vp.vpLocation.replace('_', ' ')} desc={"Vendndodhja e cmimit aktual ne raport me Value Area (zona e 70% te volumit, 20 dite): IN VA = cmimi brenda zones se pranuar — gjendje normale, balanced, entry me i sigurt (pullback brenda VA). ABOVE VA = cmimi MBI zones — moment i forte (bullish) por i zgjeruar; rrezik refuzimi pas ne VA; kerkon konfirmim volumi per te mbetur sipër. BELOW VA = cmimi NEN zones — pranim i ulet, momentum negativ; shmang long derisa cmimi te kthehet brenda VA."} >
                  <span className="px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">
                    Location: {vp.vpLocation.replace('_', ' ')}
                  </span>
                </MiniPopover>
              )}
              {vp.supportBelow && !vp.resistanceAbove && (
                <MiniPopover label="VP_OK — Setup Ideal" desc={"Vlerësim POZITIV: ka mbështetje volumi te afer poshte (HVN ose POC brenda 1.2% te cmimit) DHE nuk ka rezistencë të afërt sipër. Kjo eshte konfigurimi IDEAL per hyrje long: risk-i i definuar qarte (stop afer mbeshtetjes) dhe hapesire fitimi e paster sipër. Idealisht: hyr me LIMIT ORDER ne zonen e pullback, jo me market order. Ky kombinim + score mbi 60 = kandidate me prioritet per tregtim."} >
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">
                    ✓ VP_OK (support poshtë, sipër pastër)
                  </span>
                </MiniPopover>
              )}
              {vp.resistanceAbove && (
                <MiniPopover label="⚠ NO_CHASE — Mos e Ndjek Cmimin" desc={"PARALAJMERIM: ka rezistencë volumi (HVN ose VAH) brenda 1.2% SIPËR cmimit aktual. MOS e ndjek cmimin me market order — rreziku i refuzimit te cmimit eshte shume i larte dhe mund te mbetesh i bllokuar ne humbje. Idealisht bëj njerën nga keto dy: (1) PRIT pullback te mbeshtetja (HVN poshte / EMA20) dhe hyj me limit order atje, ose (2) prit THYERJE te konfirmuar te rezistencës me volum mbi mesataren + mbyllje ditore mbi VAH. Chase-i ne rezistencë = humbje te shpeshta."} >
                  <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-bold">
                    ⚠ NO_CHASE (resistance sipër)
                  </span>
                </MiniPopover>
              )}
            </div>
          </div>
        )}

        {/* Ranking Changes expanded panel */}
        {showChanges && (
          <div className="mt-2 rounded-lg bg-violet-500/5 border border-violet-500/15 p-2.5">
            <div className="flex items-center gap-1.5 mb-2">
              <GitCompareArrows className="w-3.5 h-3.5 text-violet-400" />
              <p className="text-[12px] font-semibold text-violet-400">Ndryshimet e Renditjes — {stock.symbol}</p>
            </div>
            {loadingChanges && (
              <div className="flex items-center gap-2 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                <span className="text-[12px] text-muted-foreground">Duke ngarkuar...</span>
              </div>
            )}
            {!loadingChanges && changesError && (
              <div className="flex items-start gap-2 py-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[12px] text-amber-400">Nuk u lidh me databazën</p>
                  <p className="text-[11px] text-muted-foreground/60">{changesError}</p>
                </div>
              </div>
            )}
            {!loadingChanges && !changesError && rankingChanges && rankingChanges.length === 0 && (
              <p className="text-[12px] text-muted-foreground py-1">Asnje ndryshim i regjistruar per momentin. Snapshots mbledhen automatikisht kur scanner punon.</p>
            )}
            {!loadingChanges && rankingChanges && rankingChanges.length > 0 && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {rankingChanges.map((ch: any, i: number) => {
                  const isPositive = ch.action === 'RANK_UP' || ch.action === 'ENTERED_LIST' || ch.action === 'SCORE_UP';
                  const isNegative = ch.action === 'RANK_DOWN' || ch.action === 'EXITED_LIST' || ch.action === 'SCORE_DOWN';
                  const actionLabel: Record<string, string> = {
                    ENTERED_LIST: 'Hyri ne list',
                    EXITED_LIST: 'Doli nga list',
                    RANK_UP: 'Rank u permiresua',
                    RANK_DOWN: 'Rank ra',
                    SCORE_UP: 'Score u rrit',
                    SCORE_DOWN: 'Score ra',
                    STATUS_CHANGED: 'Status ndryshoi',
                  };
                  return (
                    <div key={i} className="flex items-center gap-2 p-1.5 rounded-md bg-muted/15">
                      {isPositive && <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}
                      {isNegative && <ArrowDownRight className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                      {!isPositive && !isNegative && <Activity className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-foreground">{actionLabel[ch.action] || ch.action}</p>
                        <div className="flex gap-2 text-[10px] text-muted-foreground">
                          {ch.oldRank != null && ch.newRank != null && <span>#{ch.oldRank} → #{ch.newRank}</span>}
                          {ch.scoreChange != null && <span>Score: {ch.scoreChange > 0 ? '+' : ''}{ch.scoreChange}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Reasons */}
        {stock.reasons.length > 0 && (
          <div className="mt-3 flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-blue-500/5 border border-blue-500/15">
            <CheckCircle2 className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="space-y-1 min-w-0 flex-1">
              {stock.reasons.map((r, i) => (
                <MiniPopover key={i} label={r} desc={getReasonExplanation(r)}>
                  <p className="text-[13px] text-blue-300/80 leading-relaxed hover:text-blue-300 transition-colors">· {r}</p>
                </MiniPopover>
              ))}
            </div>
          </div>
        )}

        {/* Warnings */}
        {stock.warnings.length > 0 && (
          <div className="mt-2 flex items-start gap-2.5 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/15">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="space-y-1 min-w-0 flex-1">
              {stock.warnings.map((w, i) => (
                <MiniPopover key={i} label={w.replace(/ — .*$/, '')} desc={getWarningExplanation(w)}>
                  <p className="text-[13px] text-amber-300/80 leading-relaxed hover:text-amber-300 transition-colors">· {w}</p>
                </MiniPopover>
              ))}
            </div>
          </div>
        )}

        {/* Expanded detail */}
        {expanded && (
          <div className="mt-3 border-t border-border/50 pt-3 space-y-2 text-[13px] text-muted-foreground">
            <div className="grid grid-cols-2 gap-2">
              <DetailPopover label="SMA 50" value={stock.aboveSMA50 ? 'Mbi' : 'Nen'} good={stock.aboveSMA50} desc="Simple Moving Average 50-ditor — mesatarja e cmimeve te mbylljes per 50 dite tregtimi. Aksioni ne trend rrites duhet te jete mbi SMA50. Nese cmimi bie nen SMA50, shpesh tregon nje ndryshim trendi apo nje korektim te thelle." ideal="Cmimi mbi SMA50 per swing long trades." />
              <DetailPopover label="SMA 200" value={stock.aboveSMA200 ? 'Mbi' : 'Nen'} good={stock.aboveSMA200} desc="Simple Moving Average 200-ditor — mesatarja e gjate. Kjo eshte linja me e rendesishme e trendit institucional. Shumica e fondeve te medha shikojne SMA200. Nese cmimi eshte mbi, aksioni eshte ne secular bull trend." ideal="Cmimi mbi SMA200 per konfirmim trendi afatgjate." />
              <DetailPopover label="50/200" value={stock.sma50Above200 ? 'Golden Cross' : 'Death Cross'} good={stock.sma50Above200} desc="Kur SMA50 kalon mbi SMA200 quhet Golden Cross — sinjal i fuqishem bullish. Kur SMA50 bie nen SMA200 quhet Death Cross — sinjal bearish. Kjo cross tregon drejtimin e trendit afatmesem." ideal="Golden Cross (SMA50 mbi SMA200) per trend rrites." />
              <DetailPopover label="Stacked MA" value={stock.stackedMA ? 'Po ( perfekte )' : 'Jo'} good={stock.stackedMA} desc="Stacked Moving Averages — kur cmimi eshte mbi EMA20, EMA20 mbi SMA50, dhe SMA50 mbi SMA200. Kjo eshte struktura me e forte e trendit rrites: te gjithe mesataret jane ne rradhe te sakte, tregojne nje trend te shendetshem multi-timeframe. Aksione me stacked MA kane probabilitet me te larte per te vazhduar rritjen." ideal="Po — te gjithe mesataret ne rradhe (Close > EMA20 > SMA50 > SMA200)." />
              <DetailPopover label="Entry Type" value={stock.setup === 'BREAKOUT' ? 'A: Breakout' : 'B: Pullback'} good={stock.setup === 'PULLBACK'} desc={stock.setup === 'BREAKOUT' ? 'Entry Type A (Breakout) — cmimi thyen 20d high me volum me te larte se mesatarja. Hyrja vendoset pak mbi 20d high (high20 x 1.002) me buy stop-limit. Kerkon volum konfirmim sepse pa te, breakout-i mund te jete false.' : 'Entry Type B (Pullback) — aksioni ne trend rrites ben nje renie te kontrolluar 2-8 dite drejt EMA10/20, pastaj jep candle rikthimi. Hyrja vendoset ne cmimin aktual (limit order). Kjo eshte entry-y me e besueshme e strategjise.'} ideal="Pullback (B) eshte me i besueshem. Breakout (A) kerkon volum te larte." />
              <DetailPopover label="ATR" value={'$' + stock.atr.toFixed(2)} good={stock.atrPct <= 2} warn={stock.atrPct > 3.5} desc="Average True Range — levizja mesatare ditorne e aksionit, llogaritur nga high-low, high-prev_close, dhe low-prev_close per 14 dite. Perdoret per te vendosur stop-loss: 1.5 x ATR nen entry, ose nen swing-low minus 0.2 x ATR (cdofer eshte me i ngushte)." ideal="Me i ulet aq me i mire. ATR 1-2% per stop te ngushte." />
              <DetailPopover label="Dist EMA10" value={(stock.distFromEMA10 > 0 ? '+' : '') + stock.distFromEMA10.toFixed(1) + '%'} good={Math.abs(stock.distFromEMA10) < 3} warn={Math.abs(stock.distFromEMA10) > 6} desc="Distanca e cmimit aktual nga EMA (Exponential Moving Average) 10-ditore si perqindje. Ne nje pullback ideal, cmimi afrohet EMA10. Nese distanca eshte negative e madhe, aksioni eshte shume larg mesatares se shkurter." ideal="-3% deri +3%. Pullback ideal afrohet EMA10." />
              <DetailPopover label="Dist EMA20" value={(stock.distFromEMA20 > 0 ? '+' : '') + stock.distFromEMA20.toFixed(1) + '%'} good={Math.abs(stock.distFromEMA20) < 3} warn={Math.abs(stock.distFromEMA20) > 6} desc="Distanca nga EMA 20-ditore. EMA20 eshte mesatarja e shkurter qe institucionet ndiqne. Nje pullback qe teston EMA20 pa e thyer eshte nje zone e mire hyrjeje. Distancat e medha tregojne te bizhnozuar." ideal="-3% deri +3%. Test i EMA20 pa thyer = i mire." />
              <DetailPopover label="RS vs QQQ" value={(stock.rsVsQQQ > 0 ? '+' : '') + stock.rsVsQQQ.toFixed(1) + '%'} good={stock.rsVsQQQ > 0} warn={stock.rsVsQQQ < -3} desc="Relative Strength vs QQQ (Nasdaq 100) ne 22 dite te fundit. Nese pozitiv, aksioni po performon me mire se sektori teknologjik. I rendesishem per aksione tech/AI — nese RS vs QQQ eshte negativ, aksioni po humbet terren krah te njejten klas." ideal="Positive (mbi 0%). Outperformance ndaj QQQ = fute me te fort." />
              <DetailPopover label="RS 60d vs SPY" value={(stock.rsVsSPY60d > 0 ? '+' : '') + stock.rsVsSPY60d.toFixed(1) + '%'} good={stock.rsVsSPY60d > 0} warn={stock.rsVsSPY60d < -5} desc="Relative Strength vs SPY (S&P 500) ne 60 dite te fundit. Ky eshte nje indikator me afatgjate se RS 22d. Nje aksion me RS 60d pozitiv ka nje trend outperformance qe zgjat me shume se nje spike te shkurter." ideal="Positive (mbi 0%). Me i larte aq me i mire per swing." />
              <DetailPopover label="Swing Low" value={'$' + stock.swingLow.toFixed(2)} desc="Cmimi me i ulet qe aksioni ka arritur qe nga fillimi i pullback-it (prej peak-it te fundit 10-ditor). Kjo eshte baza per vendosjen e stop-loss: stop vendoset nen swing-low minus 0.2 x ATR, ose 1.5 x ATR nen entry — cdofer eshte me i ngushte (me i larte)." ideal="Nje swing-low i qarte (i persosur) jep nje stop te definuar sakte." />
              <DetailPopover label="Vol Ratio" value={stock.volRatio + 'x'} good={stock.volRatio >= 0.8 && stock.volRatio <= 1.5} warn={stock.volRatio > 2} desc="Raporti i volumit 3-ditor te fundit ndaj mesatares 20-ditore. 1.0x = volum normal. Nen 1.0x tregon volum te ulet (i mire gjate pullback-it). Mbi 1.5x tregon interes te larte (i mire per konfirmim)." ideal="0.8x - 1.5x. Pullback: nen 1.0x. Konfirmim: mbi 1.2x." />
            </div>

            {/* Position Sizing */}
            {stock.positionSize > 0 && (
              <div className="mt-2 rounded-lg bg-violet-500/5 border border-violet-500/15 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Briefcase className="w-4 h-4 text-violet-400" />
                  <p className="text-[13px] font-semibold text-violet-400">Pozicionimi (1% risk per trade, $25K account)</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <MiniPopover label="Shares (Numri i aksioneve)" desc="Numri i aksioneve që duhet të blinësh. Llogaritet si: (Account x Risk%) / (Entry - Stop). Për $25K account me 1% risk: $250 / risk_per_share. Kjo siguron që nuk humbësh më shumë se 1% të account-it në një trade." >
                    <div className="w-full text-center"><p className="text-[11px] text-muted-foreground">Shares</p><p className="text-[14px] font-bold text-foreground">{stock.positionSize}</p></div>
                  </MiniPopover>
                  <MiniPopover label="Vlera e Pozicionit" desc="Vlera totale e pozicionit në dollarë: Shares x Cmimi i hyrjes. Kjo tregon sa kapital do të zë trade-i. Për një account $25K, një pozicion $5,000 është 20% — kjo është e pranueshme për një swing trade i vetëm." >
                    <div className="w-full text-center"><p className="text-[11px] text-muted-foreground">Pozicioni</p><p className="text-[14px] font-bold text-foreground">${stock.positionValue.toLocaleString()}</p></div>
                  </MiniPopover>
                  <MiniPopover label="Risk $ (Rreziku në dollarë)" desc="Humbja maksimale nëse stop-loss preket: Shares x (Entry - Stop). Kjo duhet të jetë 1% e account-it ($250 për $25K). Nëse risk $ është më i lartë, ul numrin e aksioneve. Kjo është rregulli më i rëndësishëm i menaxhimit të riskut." >
                    <div className="w-full text-center"><p className="text-[11px] text-muted-foreground">Risk $</p><p className="text-[14px] font-bold text-red-400">${stock.riskDollars.toLocaleString()}</p></div>
                  </MiniPopover>
                </div>
              </div>
            )}

            {stock.catalystStatus && (
              <div className="mt-2 rounded-lg border p-3 space-y-2" style={{
                backgroundColor: stock.catalystStatus === 'CLEAR' ? 'rgba(16, 185, 129, 0.05)' :
                  stock.catalystStatus === 'POSITIVE' ? 'rgba(59, 130, 246, 0.05)' :
                  stock.catalystStatus === 'MIXED' ? 'rgba(245, 158, 11, 0.05)' :
                  stock.catalystStatus === 'EVENT_RISK' ? 'rgba(239, 68, 68, 0.05)' :
                  'rgba(239, 68, 68, 0.08)',
                borderColor: stock.catalystStatus === 'CLEAR' ? 'rgba(16, 185, 129, 0.2)' :
                  stock.catalystStatus === 'POSITIVE' ? 'rgba(59, 130, 246, 0.2)' :
                  stock.catalystStatus === 'MIXED' ? 'rgba(245, 158, 11, 0.2)' :
                  'rgba(239, 68, 68, 0.2)',
              }}>
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" style={{
                    color: stock.catalystStatus === 'CLEAR' ? '#10b981' :
                      stock.catalystStatus === 'POSITIVE' ? '#3b82f6' :
                      stock.catalystStatus === 'MIXED' ? '#f59e0b' :
                      '#ef4444',
                  }} />
                  <p className="text-[13px] font-semibold" style={{
                    color: stock.catalystStatus === 'CLEAR' ? '#10b981' :
                      stock.catalystStatus === 'POSITIVE' ? '#3b82f6' :
                      stock.catalystStatus === 'MIXED' ? '#f59e0b' :
                      '#ef4444',
                  }}>Event & Catalyst Gate</p>
                </div>
                <div className="space-y-1.5 text-[13px]">
                  <MiniPopover label="Catalyst Status" desc="Statusi i katalizatorëve dhe ngjarjeve. CLEAR = asnje ngjarje e afërt, hyrje normale. POSITIVE = ka katalizator pozitiv (8-K pozitiv, upgrade). MIXED = ka ngjarje me rrezik të përzier (ul pozicionin 50-75%). EVENT_RISK = earnings ose ngjarje makro pranë, mos hap. NO_TRADE = rrezik i lartë, asnjë lëvizje." >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-muted-foreground">Catalyst status</span>
                      <span className="font-semibold" style={{
                        color: stock.catalystStatus === 'CLEAR' ? '#10b981' :
                          stock.catalystStatus === 'POSITIVE' ? '#3b82f6' :
                          stock.catalystStatus === 'MIXED' ? '#f59e0b' :
                          '#ef4444',
                      }}>{stock.catalystStatus}</span>
                    </div>
                  </MiniPopover>
                  <MiniPopover label="Earnings" desc="Ditë deri te raporti i ardhurave (earnings) tjetër. Nëse earnings është brenda 3 ditësh, nuk rekomandohet të hapësh long (risk gap). 4-7 ditë: konsidero pozicion 50%. Mbi 7 ditë ose asnjë: nuk ndikon. Earnings mund të shkaktojë gap 8-10% që shkatërron stop-loss." >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-muted-foreground">Earnings</span>
                      <span className="font-medium text-foreground">
                        {stock.daysToEarnings !== null
                          ? `${stock.daysToEarnings} ditë`
                          : 'Asnjë në afërsi'}
                      </span>
                    </div>
                  </MiniPopover>
                  <MiniPopover label="SEC Filings (8-K)" desc="Kontrollon raportet 8-K materialë të depozituara te SEC në 30 ditët e fundit. 8-K material përfshin ndryshime të rëndësishme: fuzionime, ndryshime drejtuesish, rezultate të papritura. Negative = NO_TRADE. Positive = sinjal i mirë. Neutral ose asnjë = nuk ndikon." >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-muted-foreground">SEC filings</span>
                      <span className="font-medium" style={{
                        color: stock.material8KLast30d && stock.material8KSentiment === 'negative' ? '#ef4444' :
                          stock.material8KLast30d && stock.material8KSentiment === 'positive' ? '#10b981' :
                          'var(--muted-foreground)',
                      }}>
                        {stock.material8KLast30d
                          ? `Material 8-K — ${stock.material8KSentiment === 'negative' ? 'negative' : stock.material8KSentiment === 'positive' ? 'positive' : 'neutral'}`
                          : 'Asnjë 8-K material 30d'}
                      </span>
                    </div>
                  </MiniPopover>
                  <MiniPopover label="Ngjarje Makro" desc="Kontrollon ngjarjet makroekonomike brenda 24 orëve: FOMC (vendimi i interesit), CPI (inflacioni), NFP (punësimit). Këto ngjarje mund të shkaktojnë volatilitet të lartë në të gjithë tregun. Nëse ka ngjarje, kujdes — konsidero ulje pozicioni ose prit pas ngjarjes." >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-muted-foreground">Macro</span>
                      <span className="font-medium" style={{
                        color: stock.macroEventWithin24h ? '#f59e0b' : 'var(--muted-foreground)',
                      }}>
                        {stock.macroEventWithin24h || 'Asnjë ngjarje makro 24h'}
                      </span>
                    </div>
                  </MiniPopover>
                  <MiniPopover label="Trade Action" desc="Veprimi përfundimtar bazuar në të gjithë kontrollat: READY = të gjithë kontrollat janë kaluar, mund të hapësh pozicion. READY me % size = hap por me pozicion të reduktuar (për shkak të ngjarjeve). NO ENTRY = mos hap — ka rrezik të lartë (earnings pranë, 8-K negative, ose regjim i dobët)." >
                    <div className="flex items-center justify-between w-full pt-1.5 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                      <span className="text-muted-foreground">Trade action</span>
                      <span className="font-bold" style={{
                        color: !stock.allowNewEntry ? '#ef4444' :
                          stock.positionSizeMultiplier < 1 ? '#f59e0b' :
                          '#10b981',
                      }}>
                        {!stock.allowNewEntry ? 'NO ENTRY' :
                          stock.positionSizeMultiplier < 1
                            ? `READY, ${Math.round(stock.positionSizeMultiplier * 100)}% size`
                            : 'READY'}
                      </span>
                    </div>
                  </MiniPopover>
                </div>
              </div>
            )}

            {stock.sectorEtf && (
              <div className="mt-2 rounded-lg border p-3 space-y-1.5" style={{
                backgroundColor: stock.sectorRsStatus === 'LEADING' ? 'rgba(16, 185, 129, 0.05)' :
                  stock.sectorRsStatus === 'LAGGING' ? 'rgba(239, 68, 68, 0.05)' :
                  'rgba(100, 116, 139, 0.05)',
                borderColor: stock.sectorRsStatus === 'LEADING' ? 'rgba(16, 185, 129, 0.2)' :
                  stock.sectorRsStatus === 'LAGGING' ? 'rgba(239, 68, 68, 0.2)' :
                  'rgba(100, 116, 139, 0.15)',
              }}>
                <MiniPopover label="Sector ETF" desc="ETF-ja e sektorit për këtë aksion (p.sh. XLK për teknologji, XLF për financë). Kjo është baza për krahasimin e performancës relative (RS). Nëse aksioni po bën më mirë se ETF-ja e sektorit të tij, ka një edge të vërtetë — nuk është thjesht sektori në rritje." >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[13px] text-muted-foreground">Sector ETF</span>
                    <span className="text-[13px] font-semibold text-foreground">{stock.sectorEtf}</span>
                  </div>
                </MiniPopover>
                <MiniPopover label="RS vs Sector (20D)" desc="Relative Strength vs Sector ETF — sa më mirë ka performuar aksioni krah ETF-së së sektorit të tij në 20 ditët e fundit. Nëse pozitiv (+), aksioni është duke udhëhequr sektorin. Nëse negativ (-), edhe pse aksioni mund të jetë në rritje, po bën më keq se konkurrentët e tij — kjo është sinjal i dobët." >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[13px] text-muted-foreground">RS vs Sector (20D)</span>
                    <span className="text-[13px] font-semibold" style={{
                      color: stock.rsVsSector20d > 0 ? '#10b981' : stock.rsVsSector20d < 0 ? '#ef4444' : 'var(--muted-foreground)',
                    }}>
                      {stock.rsVsSector20d > 0 ? '+' : ''}{stock.rsVsSector20d}%
                    </span>
                  </div>
                </MiniPopover>
                <MiniPopover label="Sector Trend" desc="Trendi i sektorit — a është ETF-ja e sektorit mbi SMA 50-ditore. Bullish = sektori është në trend rritës, çdo lëvizje pozitive ka mbështetje të gjerë. Weak = sektori është nën SMA50, rreziku është më i lartë sepse edhe një aksion i fortë mund të tërhiqet poshtë nga rënia e sektorit." >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[13px] text-muted-foreground">Sector Trend</span>
                    <span className="text-[13px] font-medium" style={{
                      color: stock.sectorAboveSma50 ? '#10b981' : '#ef4444',
                    }}>
                      {stock.sectorAboveSma50 ? 'Bullish' : 'Weak'}
                    </span>
                  </div>
                </MiniPopover>
                <MiniPopover label="Status (RS vs Sector)" desc="Statusi i përgjithshëm i aksionit krah sektorit: LEADING = aksioni po udhëheq sektorin (i fortë, prioritet), INLINE = performancë e barabartë me sektorin (normal), LAGGING = aksioni po mbetet pas sektorit (sinjal i dobët, kujdes). Leading është më i mirë sepse tregon kërkesë institucionale specifike për këtë aksion." >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[13px] text-muted-foreground">Status</span>
                    <span className="text-[13px] font-bold" style={{
                      color: stock.sectorRsStatus === 'LEADING' ? '#10b981' :
                        stock.sectorRsStatus === 'LAGGING' ? '#ef4444' :
                        '#f59e0b',
                    }}>
                      {stock.sectorRsStatus}
                    </span>
                  </div>
                </MiniPopover>
              </div>
            )}


            {/* News Impact Signal */}
            <NewsImpactBlock symbol={stock.symbol} />
          </div>
        )}

        {/* Overnight Risk */}
        <div className="mt-2.5 rounded-lg border p-3 space-y-1.5" style={{
            backgroundColor: stock.overnightRiskLevel === 'SAFE' ? 'rgba(16, 185, 129, 0.05)' :
              stock.overnightRiskLevel === 'MODERATE' ? 'rgba(245, 158, 11, 0.05)' :
              'rgba(239, 68, 68, 0.05)',
            borderColor: stock.overnightRiskLevel === 'SAFE' ? 'rgba(16, 185, 129, 0.2)' :
              stock.overnightRiskLevel === 'MODERATE' ? 'rgba(245, 158, 11, 0.2)' :
              'rgba(239, 68, 68, 0.2)',
          }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Moon className="w-4 h-4" style={{
                  color: stock.overnightRiskLevel === 'SAFE' ? '#10b981' :
                    stock.overnightRiskLevel === 'MODERATE' ? '#f59e0b' :
                    '#ef4444',
                }} />
                <p className="text-[13px] font-semibold" style={{
                  color: stock.overnightRiskLevel === 'SAFE' ? '#10b981' :
                    stock.overnightRiskLevel === 'MODERATE' ? '#f59e0b' :
                    '#ef4444',
                }}>Overnight Risk</p>
              </div>
              <span className="text-[13px] font-bold" style={{
                color: stock.overnightRiskLevel === 'SAFE' ? '#10b981' :
                  stock.overnightRiskLevel === 'MODERATE' ? '#f59e0b' :
                  '#ef4444',
              }}>{stock.overnightRiskLevel === 'SAFE' ? 'SIGURË' : stock.overnightRiskLevel === 'MODERATE' ? 'MESATARE' : 'E LARTË'}</span>
            </div>
            <div className="grid grid-cols-4 gap-x-3 gap-y-1 text-[12px]">
              <MiniPopover label="Avg Gap (20d)" desc={"Mesatarja e gap-it overnight (nga close i ditës në open tjetër) për 20 ditët e fundit. Nëse e vogël (< 0.3%), aksioni është i qetë gjatë natës."} >
                <div className="flex flex-col items-center text-center w-full"><span className="text-muted-foreground">Avg Gap 20d</span><span className="font-medium text-foreground">{stock.avgOvernightGap20}%</span></div>
              </MiniPopover>
              <MiniPopover label="Avg Gap (60d)" desc={"Mesatarja e gap-it overnight për 60 ditët e fundit. Pamje më e gjerë se 20d."} >
                <div className="flex flex-col items-center text-center w-full"><span className="text-muted-foreground">Avg Gap 60d</span><span className="font-medium text-foreground">{stock.avgOvernightGap60}%</span></div>
              </MiniPopover>
              <MiniPopover label="Max Gap Down" desc={"Gap-i më i keq overnight në 60 ditët e fundit. Nëse më i madhe se distanca e stop-it, ekziston rreziku i gap skip."} >
                <div className="flex flex-col items-center text-center w-full"><span className="text-muted-foreground">Max Down</span><span className="font-medium" style={{ color: Math.abs(stock.maxOvernightGapDown) > stock.stopDistPct ? '#ef4444' : 'var(--foreground)' }}>{stock.maxOvernightGapDown}%</span></div>
              </MiniPopover>
              <MiniPopover label="Max Gap Up" desc={"Gap-i më i mirë overnight në 60 ditët e fundit. Potential fitimi ndërsa flen."} >
                <div className="flex flex-col items-center text-center w-full"><span className="text-muted-foreground">Max Up</span><span className="font-medium text-emerald-400">+{stock.maxOvernightGapUp}%</span></div>
              </MiniPopover>
            </div>
            <div className="grid grid-cols-4 gap-x-3 gap-y-1 text-[12px] pt-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <MiniPopover label="Gap Up %" desc={"Përqindja e netëve me gap pozitiv. Mbi 55% = tendencë bullish overnight."} >
                <div className="flex flex-col items-center text-center w-full"><span className="text-muted-foreground">Gap Up %</span><span className="font-medium text-foreground">{stock.overnightGapUpPct}%</span></div>
              </MiniPopover>
              <MiniPopover label="Overnight Bias" desc={"Tendenca overnight: BULLISH = gap pozitiv më shpesh, BEARISH = gap negativ më shpesh, NEUTRAL = pa drejtim."} >
                <div className="flex flex-col items-center text-center w-full"><span className="text-muted-foreground">Bias</span><span className="font-semibold" style={{ color: stock.overnightBias === 'BULLISH' ? '#10b981' : stock.overnightBias === 'BEARISH' ? '#ef4444' : 'var(--foreground)' }}>{stock.overnightBias === 'BULLISH' ? 'Bullish' : stock.overnightBias === 'BEARISH' ? 'Bearish' : 'Neutral'}</span></div>
              </MiniPopover>
              <MiniPopover label="Gap vs Stop" desc={"A mund gap-i overnight të kapërcyë stop-loss-in? Nëse PO, humbja mund të jetë 2-3x më e madhe nga planifikuar."} >
                <div className="flex flex-col items-center text-center w-full"><span className="text-muted-foreground">Gap vs Stop</span><span className="font-semibold" style={{ color: stock.gapCanSkipStop ? '#ef4444' : '#10b981' }}>{stock.gapCanSkipStop ? 'RREZIK' : 'Sigur'}</span></div>
              </MiniPopover>
              <MiniPopover label="Dist. Stop" desc={"Distanca në perqindje nga Entry deri te Stop."} >
                <div className="flex flex-col items-center text-center w-full"><span className="text-muted-foreground">Dist. Stop</span><span className="font-medium text-foreground">{stock.stopDistPct}%</span></div>
              </MiniPopover>
            </div>
          </div>

        <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-center gap-1.5 mt-2.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {expanded ? 'Fshi detajet' : 'Shiko detajet'}
        </button>
      </CardContent>
    </Card>
  );
}

const SCORE_DETAILS: Record<string, { ideal: string; desc: string }> = {
  'Trend': {    desc: 'Mat cilesine e trendit rrites: cmimi mbi SMA50 (+20), cmimi mbi SMA200 (+20), SMA50 mbi SMA200 / Golden Cross (+15), Stacked MA — Close > EMA20 > SMA50 > SMA200 (+15), higher-high structure (+15), dhe ADX > 25 — trend i forte (+15). Nje score i larte tregon nje trend te forte, te shendetshem, multi-timeframe.',    ideal: 'mbi 75 = trend i forte. Nen 50 = trend i dobet ose i perzier.',  },
  'RS': {
    desc: 'Relative Strength — sa me mire ka performuar aksioni krah SPY ne 22d dhe 60d te fundit. RS 22d ka 25 pike peshe, RS 60d ka 25 pike. Nese RS > 0, aksioni po e tebin tregun. Institucionet po akumulojne — kjo jep edge.',
    ideal: 'mbi 60 = outperformer i qarte. 40-60 = ne rregull. Nen 40 = underperformer.',
  },
  'Momentum': {
    desc: 'Mat forcen e lëvizjes se fundit: nese 5d change eshte me i vogel se 2% (+10), 10d positive (+15), 22d positive (+15), dhe nuk eshte i ekstenduar — 5d nen 8% (+10). Momentum i mire pa ekstension tregon nje aksion ne rritje te shendetshme.',
    ideal: 'mbi 65 = momentum i forte. Nen 40 = rihet ose i ftohte.',
  },
  'Volum': {
    desc: 'Konfirmon lëvizjen me volum: volumi ne renie gjate pullback-it (+20), spike volumi ne diten e fundit (+15), volumi relativ 0.8-1.5x mesatarja (+10), dhe volumn mesatar mbaltes mbi 5M (+5). Pullback me volum ne renie + rikthim me volum = konfirmim.',
    ideal: 'mbi 65 = volum i mire. Nen 40 = pa konfirmim volumi.',
  },
  'Setup': {
    desc: 'Vlereson cilësinë e setup-it konkret: Pullback 3-6d ideal (+20), afer EMA 10/20 (+20), volum ne renie (+15), spike konfirmimi (+15), RSI 40-65 (+10). Breakout 20d high + volum. Me i larte score-i, aq me i besueshem setup-i.',
    ideal: 'mbi 60 = setup i fort. 40-60 = i mesem. Nen 40 = i dobët.',
  },
  'Risk': {
    desc: 'Mat cilësinë e risk-reward: risk per aksion nen 3% (+20) ose 3-5% (+10), R:R mbi 2 (+15) ose 1.5-2 (+5), ATR nen 2% (+10) ose mbi 4% (-10). Risk score i larte = stop i ngushte me target te gjere.',
    ideal: 'mbi 60 = kushtet e mira risk. Nen 40 = rrezik i larte ose R:R i dobet.',
  },
};

function ScoreCell({ label, value }: { label: string; value: number }) {
  const c = value >= 70 ? 'text-emerald-400' : value >= 50 ? 'text-amber-400' : 'text-red-400';
  const detail = SCORE_DETAILS[label];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="rounded-md p-1.5 text-center bg-muted/5 hover:bg-muted/10 transition-all cursor-pointer group w-full">
          <div className="flex items-center justify-center gap-0.5">
            <p className="text-[10px] text-muted-foreground font-medium">{label}</p>
            <Info className="w-2.5 h-2.5 opacity-0 group-hover:opacity-50 transition-opacity" />
          </div>
          <p className={`text-[14px] font-bold ${c}`}>{value}</p>
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="center" className="w-72 sm:w-80 p-0 overflow-hidden">
        <div className="bg-gradient-to-b from-primary/10 to-transparent px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-foreground">Score: {label}</p>
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${value >= 70 ? 'bg-emerald-500/15 text-emerald-400' : value >= 50 ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'}`}>{value}/100</span>
          </div>
        </div>
        <div className="px-4 pb-4 space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Si llogaritet?</p>
            <p className="text-[13px] leading-relaxed text-foreground/85">{detail?.desc}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Idealisht</p>
            <p className="text-[13px] leading-relaxed text-foreground/85">{detail?.ideal}</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const ENTRY_DETAILS: Record<string, string> = {
  'ENTRY': 'Çmimi i hyrjes — nivele ku duhet të vendosësh buy order. Për pullback: limit order afër EMA10/20. Për breakout: buy stop-limit pak mbi 20d high. Kjo nuk është rekomandim blerjeje, por pikë referencë e llogaritur nga strategjia.',
  'STOP': 'Stop-loss — nivele ku pozicioni mbyllet automatikisht nëse cmimi bie. Vendoset 1.5 x ATR nën entry, ose nën swing-low minus 0.2 x ATR (cilado është më i ngushtë). Qëllimi është të limitojë humbjen maksimale.',
  'TARGET 1R': 'Target 1R — çmimi ku fitimi është 1x rrezikun (1R = Entry - Stop). Nëse rreziku është $3, target 1R është Entry + $3. Kjo është zona e parë ku mund të mbyllësh një pjesë të pozicionit.',
  'TARGET 2R': 'Target 2R — çmimi ku fitimi është 2x rrezikun. Shumica e trader-ët e preferuar mbyllin 50-70% të pozicionit këtu dhe lënë rrestën për 3R me trailing stop.',
  'TARGET 3R': 'Target 3R — çmimi ku fitimi është 3x rrezikun. Kjo është zona përfundimtare e targetit. Strategjia kërkon R:R minimal 1:2, por 1:3 është ideali. Target 3R llogaritet si Entry + 3 x (Entry - Stop).',
};

function EntryBox({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className={`rounded-lg ${bg} border p-2.5 text-center cursor-pointer hover:brightness-110 transition-all group`}>
          <div className="flex items-center justify-center gap-0.5">
            <p className={`text-[11px] ${color} font-medium`}>{label}</p>
            <Info className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
          </div>
          <p className={`text-[14px] font-bold ${color}`}>${value.toFixed(2)}</p>
        </div>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="center" className="w-72 sm:w-80 p-0 overflow-hidden">
        <div className="bg-gradient-to-b from-primary/10 to-transparent px-4 pt-3 pb-2">
          <h3 className="text-sm font-bold text-foreground">{label}</h3>
        </div>
        <div className="px-4 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Çfarë bën?</p>
          <p className="text-[13px] leading-relaxed text-foreground/85">{ENTRY_DETAILS[label]}</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StatPopover({ label, value, good, warn, ideal, warnRange, desc, verdict }: {
  label: string; value: string | number; good: boolean; warn: boolean;
  ideal: string; warnRange: string; desc: string; verdict?: string;
}) {
  const colorCls = good ? 'text-emerald-400' : warn ? 'text-red-400' : 'text-amber-400';
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="hover:brightness-125 transition-all cursor-pointer group flex items-center gap-0.5">
          <span>{label} </span>
          <strong className={colorCls}>{value}</strong>
          <Info className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-80 sm:w-96 p-0 overflow-hidden">
        <div className="bg-gradient-to-b from-primary/10 to-transparent px-4 pt-3 pb-2">
          <h3 className="text-sm font-bold text-foreground">{label}</h3>
        </div>
        <div className="px-4 pb-4 space-y-3">
          {verdict && (
            <div className="rounded-md p-2.5" style={{ backgroundColor: good ? 'rgba(16,185,129,0.08)' : warn ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)' }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: good ? '#10b981' : warn ? '#ef4444' : '#f59e0b' }}>Vlerësimi për këtë aksion</p>
              <p className="text-[13px] leading-relaxed text-foreground/90">{verdict}</p>
            </div>
          )}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Çfarë bën?</p>
            <p className="text-[13px] leading-relaxed text-foreground/85">{desc}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Idealisht</p>
            <p className="text-[13px] leading-relaxed text-foreground/85">{ideal}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-red-400 mb-1">Kujdes</p>
            <p className="text-[13px] leading-relaxed text-foreground/85">{warnRange}</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DetailPopover({ label, value, good, warn, desc, ideal }: {
  label: string; value: string; good?: boolean; warn?: boolean; desc: string; ideal: string;
}) {
  const colorCls = good ? 'text-emerald-400' : warn ? 'text-red-400' : 'text-muted-foreground';
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 hover:brightness-125 transition-all cursor-pointer group w-full text-left">
          <span className="text-muted-foreground/70">{label}:</span>
          <strong className={colorCls}>{value}</strong>
          <Info className="w-2.5 h-2.5 opacity-0 group-hover:opacity-50 transition-opacity ml-auto" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-72 sm:w-80 p-0 overflow-hidden">
        <div className="bg-gradient-to-b from-primary/10 to-transparent px-4 pt-3 pb-2">
          <h3 className="text-sm font-bold text-foreground">{label}</h3>
        </div>
        <div className="px-4 pb-4 space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Cka eshte?</p>
            <p className="text-[13px] leading-relaxed text-foreground/85">{desc}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Idealisht</p>
            <p className="text-[13px] leading-relaxed text-foreground/85">{ideal}</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Popups for Reasons (blue — positive signals) ──
function getReasonExplanation(reason: string): string {
  if (/Pullback \d+d/.test(reason)) {
    const ideal = /ideal/.test(reason);
    return `Pullback — aksioni ka rënë nga maja e fundit për disa ditë radhazi pa e thyer strukturën e trendit. Kjo është baza e strategjisë Pullback Swing: hyhet kur tërheqja përfundon dhe çmimi kthehet lart. Ditët ideale: 3-6 (mjaftueshëm për të pastruar shitësit e dobët, jo aq gjatë sa të prishë trendin). Një pullback 2-8 ditësh me volum në renie është i shëndetshëm.${ideal ? ' Ky pullback është brenda rangut IDEAL (3-6 ditë).' : ''}`;
  }
  if (/Afer EMA 10\/20/.test(reason)) {
    return `Afer EMA 10/20 — çmimi aktual është brenda ±3% të mesatares eksponenciale 10 ose 20-ditore. Kjo është zona klasike e hyrjes: pullback-i ka sjellë çmimin te mesatarja që institucionet e mbrojnë, dhe stop-loss-i vendoset afër (nën EMA ose swing low). Idealisht: distanca -3% deri +3%. Kujdes: nëse çmimi e thyen EMA20 me volum të lartë, pullback-i mund të thellohet.`;
  }
  if (/Volumi ne renie/.test(reason)) {
    return `Volumi në renie — gjatë pullback-it, volumi ditor po bie (5 ditët e fundit < 5 ditët para tyre). Ky është SHENJË E MIRË: rënia po bëhet nga shitës të dobët (retail), jo institucione. Pullback me volum të lartë = panik; pullback me volum të ulët = pushim normal i trendit. Kur të kthehet çmimi lart me volum spike, cikli është i plotë.`;
  }
  if (/Volum konfirmim/.test(reason)) {
    return `Volum konfirmim — dita e fundit ka volum mbi 1.1x mesataren 20-ditore. Kjo tregon pjesëmarrje reale blerësiash në lëvizjen aktuale. Një rikthim (bounce) nga pullback PA volum është i dyshimtë — mund të jetë vetëm një kthim teknik i shkurtër që ndalet sërish. Volumi është 'karburanti' i lëvizjes: pa të, targetat 2R/3R arrihen rrallë.`;
  }
  if (/^RSI \d+/.test(reason)) {
    return `RSI në rangun e duhur — RSI (Relative Strength Index) 14-ditor është brenda zonës së pritshme për hyrje (40-65 për pullback). Nën 40 = momentum shumë i dobët (rritja ka humbet forcë); mbi 65-70 = i mbivlerësuar (rrezik kthimi i menjëhershëm). RSI ideal për hyrje swing: zona 45-60 — aksioni është rikthyer nga mbishitje pa humbur trendin.`;
  }
  if (/Breakout 20d \+ volum/.test(reason)) {
    return `Breakout 20d + volum — çmimi ka thyer majën 20-ditore ME volum mbi mesataren. Ky është Entry Type A: hyrja vendoset pak mbi 20d high (high20 × 1.002) me buy stop-limit. Volumi i lartë në momentin e thyerjes është kritik — pa të, 70% e breakout-eve dështojnë (false breakout). Kujdes: mos e ndjek nëse çmimi është tashmë 3-5% mbi nivelin e thyerjes — prit re-test ose pullback.`;
  }
  if (/Trend continuation/.test(reason)) {
    return `Trend continuation — aksioni nuk është në pullback as në breakout, por po ecën anash (konsolidim) MBI SMA50 pas një rritjeje. Ky është Entry Type B2: çmimi i qetë pas lëvizjes lart tregon se blerësit po mbajnë pozicionet pa shitur. Hyrja bëhet me limit në zonën aktuale me stop nën fundin e konsolidimit. Idealisht: RSI 50-65 gjatë konsolidimit.`;
  }
  return `Arsye pozitive e identifikuar nga scanner-i për këtë setup. Kliko elementet e tjera për detaje.`;
}

// ── Popups for Warnings (amber — caution signals) ──
function getWarningExplanation(warning: string): string {
  if (/^R:R /.test(warning)) {
    return `Risk:Reward i ulët — raporti rrezik-fitim është nën 1:2. Strategjia kërkon që distanca deri te target 3R të jetë së paku 2x distanca e stop-loss. Me R:R 1:1.5, edhe me 50% win-rate humb para afatgjatë. Pse ndodh: stop-i është i gjerë (ATR i lartë ose swing low i largët) ose rezistenca e afërt këput target-in. Idealisht: R:R ≥ 2.0 (me 3R target standard).`;
  }
  if (/i mbivleresuar/.test(warning)) {
    return `RSI i mbivlerësuar — RSI mbi 75 tregon se aksioni është blerë në masë të madhe në kohë të shkurtër (overbought). Rreziku: kthimi i menjëhershëm (reversal) sapo blerësit e mbarojnë. Hynë tani = blejnë në majë. Idealisht: prit RSI të ftohet nën 65 ose një pullback 3-5 ditësh para hyrjes. Kujdes: në trende shumë të forta RSI mund të qëndrojë i lartë javë të tëra — përdor stop të disiplinuar nëse je brenda.`;
  }
  if (/^Rreziku /.test(warning)) {
    return `Rreziku për aksion shumë i lartë — distanca Entry→Stop kalon 8% e çmimit. Kjo do të thotë: një goditje e vetme stop të kushton 8%+ të pozicionit dhe pozicioni duhet reduktuar shumë për të mbajtur risk 1% të llogarisë. Pse ndodh: ATR i lartë (aksion volatil) ose swing low larg. Idealisht: risk për aksion 2-5%. Nëse mbi 8%: konsidero pritje për një hyrje më afër mbështetjes.`;
  }
  if (/^ADX /.test(warning)) {
    return `ADX i dobët — ADX (Average Directional Index) nën 20 tregon trend pa forcë drejtuese: çmimi po ecën anash (range), jo trend. Strategjia Pullback Swing FUNKSIONON VETËM NË TRENDE — në range, pullback-et nuk kthehen sepse nuk ka blerës trendi pas tyre. ADX > 25 = trend i qartë. Kujdes: ADX bie shpesh gjatë pullback-it kur është i shëndetshëm — verifiko që rënia është e përkohshme dhe ADX ishte > 25 para pullback.`;
  }
  if (/i paqendrueshem per swing/.test(warning)) {
    return `ATR% SHUMË I LARTË — ATR si % e çmimit kalon 6%: aksioni lëviz mesatarisht 6%+ në ditë. Për swing: stop-i 1.5×ATR bëhet brutal (9%+ nën entry), gap-et overnight e kalojnë lehtë, dhe pozicioni duhet të jetë shumë i vogël. Ky është gate-i i tradability: READY kthehet automatikisht në WATCHLIST derisa volatiliteti të qetësohet. Idealisht: ATR% 1.5-6%. Mbi 6% = zona day-trade, jo swing.`;
  }
  if (/i ngadalte per swing/.test(warning)) {
    return `ATR% SHUMË I ULËT — ATR si % e çmimit është nën 1.5%: aksioni 'i vdekur', lëviz shumë pak në ditë. Përse është problem: target 3R me ritëm 1%/ditë kërkon javë të tëra — kapitali bllokohet, dhe komisionet/spread-i hanë pjesën e fitimit. Aksione të ngadaltë i përshtaten më shumë dividend/investim sesa swing trading. Idealisht: ATR% 1.5-6% — 1R arrihet brenda 2-5 ditësh.`;
  }
  if (/^RVOL /.test(warning)) {
    return `RVOL i ulët — Volumi relativ i ditës së fundit është nën 0.8x mesatares 20-ditore: interesi tregtar po bie. Në një bounce nga pullback, RVOL i ulët = rrezik hyrjeje të rreme — nuk ka institucione pas lëvizjes, vetëm shitës të vegjël. Idealisht: prit ditën kur RVOL ≥ 1.5x (konfirmim institucional) para hyrjes. Kliko badge-n 'RVOL' lart për vlerat aktuale.`;
  }
  if (/^REGJIMI RISK/.test(warning)) {
    return `REGJIMI RISK — kushtet e tregut nuk lejojnë pozicione të reja long: ose SPY/QQQ nën mesataret, ose Breadth (aksionet mbi SMA50) ka rënë nën 35%. Hyrjet bllokohen automatikisht; aksioni shkon në WATCHLIST. Pse ekziston ky gate: në regjime RISK, pullback-et nuk kthehen — vazhdojnë të bien. Çfarë të bësh: vetëm monitoro, përgatit lista për kur regjimi kthehet OK (breadth rikuperohet 2-3 ditë PARA indekseve).`;
  }
  if (/^REGJIMI CAUTION/.test(warning)) {
    return `REGJIMI CAUTION — tregu funksionon por me frikë: VIX i ngritur (20-25) ose Breadth i përzier (40-55% e aksioneve mbi SMA50). Ndikimi praktik: pozicioni reduktohet automatikisht në 75%, stop-i vendoset 1.2x më i gjerë (kur VIX ELEVATED) sepse lëvizjet ditore janë më të mëdha. Hyrjet lejohen vetëm për setup-et më të forta (score 60+). Kujdes: CAUTION shpesh përparon drejt RISK — verifiko breadth çdo ditë.`;
  }
  if (/^REGJIMI SPY\/QQQ/.test(warning)) {
    return `Regjimi strukturor JO OK — SPY ose QQQ janë nën SMA50/SMA200. Kur indekset janë nën këto mesatare, korektimet sistemike i tërheqin TË GJITHË aksionet poshtë, pavarësisht cilësisë individuale të setup-it. Historikisht, swing long nën këto kushte ka win-rate shumë më të ulët. Çfarë të bësh: prit indekset të rikuperojnë mbi SMA50 përpara hyrjeve të reja.`;
  }
  if (/^EVENT_?RISK/.test(warning)) {
    return `EVENT RISK — ka një ngjarje kritike afër (earnings, FOMC, CPI, ose 8-K material): raporti i fitimit, takimi i FED, ose indeksi i çmimeve brenda ditëve të ardhshme. Këto ngjarje krijojnë gap-e 5-15% që stop-i NUK i mbrojnë (stop-i ekzekutohet në çmimin e hapjes, jo atë të vendosur). Përse ka gate: statistikisht humbjet më të mëdha të swing traders vijnë nga pozicionet e mbajura përmes ngjarjeve. Idealisht: hyn VETËM pas ngjarjes, kur rreziku i panjohur është zhdukur.`;
  }
  if (/^Sector limit/.test(warning)) {
    return `Sector limit — sektori ka arritur limitin e pozicioneve: MAX 2 aksione për sektor. Përse ekziston: kur dy aksione të njëjti sektor (p.sh. Tech) janë tashmë në listën READY, shtimi i i treti treqfishon ekspozimin ndaj të njëjtit faktor rreziku — njoftimi i keq i sektorit i godet të tria njëherësh (korelacion i lartë). Diversifikimi real kërkon sektorë të ndryshëm. Çfarë të bësh: zgjidh kandidatin me score-in më të lartë të sektorit, ose prit që një nga të dytit të dalë nga lista.`;
  }
  if (/^CATALYST GATE/.test(warning)) {
    return `CATALYST GATE — kontrolli i katalizatorit ka gjetur diçka të përzier (p.sh. 8-K material brenda 30 ditëve, sentiment neutral/pa-qartësi, ose ngjarje makro brenda 24 orësh). Statusi MIXED nuk e bllokon tregtimin plotësisht por kërkon kujdes: verifiko lajmin përpara hyrjes (sekuenca 8-K, njoftimet e kompanisë). Pozicioni mund të reduktohet automatikisht. Idealisht: catalyst CLEAR — pa lajme të paqarta, hyn me plan të plotë.`;
  }
  if (/^MA jo te stackuara/.test(warning)) {
    return `MA jo të stackuara — hierarkia e mesatareve NUK është në rresht të plotë: duhet Close > EMA20 > SMA50 > SMA200. Kur një lidhje mungon, struktura e trendit ka një dobësi: p.sh. çmimi nën EMA20 = korrigjim i shkurtër në zhvillim; SMA50 nën SMA200 = problem afatgjatë. Aksione me stacked MA të plotë kanë probabilitet shumë më të lartë për të vazhduar rritjen pas pullback-it.`;
  }
  if (/extended/.test(warning)) {
    return `Jo pullback i vërtetë — 'extended' — aksioni deklarohet PULLBACK por është afër majës pa rënë reale (mbi -0.5% nga maja 10-ditore). Ky është rrezik bli-në-majë: hynë kur tërheqja sapo ka filluar. Pse renditet warning: pullback-et nën 0.5% nuk kanë pastruar shitësit e dobët — bounce-i i ardhshëm ka bazë të brishtë. Idealisht: prit një rënie -2% deri -8% me volum në renie.`;
  }
  if (/^SECTOR RS/.test(warning)) {
    return `SECTOR RS i dobët — aksioni po LANGET kundra ETF-në e sektorit të vet (-3% ose më keq në 20 ditë) DHE vetë sektori është nën SMA50. Doble problem: edhe aksioni edhe sektori janë të dobët. Statistikisht, aksionet që i tejkalojnë sektori i tyre kanë më shumë gjasa për të vazhduar; kur të dy janë negativ, momentum-i mungon në të dy nivelet. Idealisht: aksion LEADING (+3% kundra ETF) me sektor mbi SMA50.`;
  }
  if (/^WATCHLIST:/.test(warning)) {
    return `Kufizim hyrjeje — kjo kategori e vendimit READY → WATCHLIST: kushti i treguar nuk e bllokon monitorimin, por kërkon zgjidhje përpara hyrjes reale me para. Lexo arsyet specifike të tjera në listë: regjimi, event risk, ATR% ose sector RS. Kur të gjitha kushtet kthehen në rregull, vendimi rikthehet automatikisht në READY në scan-in e ardhshëm.`;
  }
  return `Paralajmërim i identifikuar nga scanner-i për këtë setup. Verifiko kushtet përpara hyrjes — kliko elementet e tjera për detaje.`;
}

// ── Mini Popover (reusable for grid labels) ──
function MiniPopover({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="hover:brightness-125 transition-all cursor-pointer group w-full text-left">
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-72 sm:w-80 p-0 overflow-hidden">
        <div className="bg-gradient-to-b from-primary/10 to-transparent px-4 pt-3 pb-2">
          <h3 className="text-sm font-bold text-foreground">{label}</h3>
        </div>
        <div className="px-4 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Çfarë bën?</p>
          <p className="text-[13px] leading-relaxed text-foreground/85">{desc}</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Regime Banner ──
function RegimeBanner({ regimeDetail, regimeOk, compact }: { regimeDetail: FunnelResponse['regimeDetail']; regimeOk: boolean; compact?: boolean }) {
  const vix = regimeDetail.vix;
  const breadth = regimeDetail.breadth;
  const regimeLevel = regimeDetail.regimeLevel ?? (regimeOk ? 'OK' : 'RISK');
  const regimeMultiplier = regimeDetail.regimeMultiplier ?? 1;
  const stopVolMultiplier = regimeDetail.stopVolMultiplier ?? 1;
  const levelColor = regimeLevel === 'OK' ? 'text-emerald-400' : regimeLevel === 'CAUTION' ? 'text-amber-400' : 'text-red-400';
  return (
    <Card className={`${compact ? 'py-0' : ''} ${regimeLevel === 'OK' ? 'border-emerald-500/20 bg-emerald-500/5' : regimeLevel === 'CAUTION' ? 'border-amber-500/20 bg-amber-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
      <CardContent className={compact ? 'px-3.5 py-2.5' : 'p-4'}>
        <div className="flex items-center gap-3">
          <Shield className={`w-5 h-5 ${levelColor} flex-shrink-0`} />
          <div className="flex-1">
            <p className={`${compact ? 'text-[13px]' : 'text-[14px]'} font-semibold ${levelColor}`}>
              {regimeLevel === 'OK' ? 'REGJIMI OK — Mund te besh Long Trades (size 100%)' : regimeLevel === 'CAUTION' ? `REGJIMI CAUTION — Hyrje me pozicion ${Math.round(regimeMultiplier * 100)}%` : 'REGJIMI RISK — Vetem WATCHLIST'}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[13px]">
              <span className="text-muted-foreground">SPY: <span className={regimeDetail.spy.above50 ? 'text-emerald-400' : 'text-red-400'}>{regimeDetail.spy.above50 ? 'Mbi 50' : 'Nen 50'}</span> · <span className={regimeDetail.spy.above200 ? 'text-emerald-400' : 'text-red-400'}>{regimeDetail.spy.above200 ? 'Mbi 200' : 'Nen 200'}</span></span>
              <span className="text-muted-foreground">QQQ: <span className={regimeDetail.qqq.above50 ? 'text-emerald-400' : 'text-red-400'}>{regimeDetail.qqq.above50 ? 'Mbi 50' : 'Nen 50'}</span> · <span className={regimeDetail.qqq.above200 ? 'text-emerald-400' : 'text-red-400'}>{regimeDetail.qqq.above200 ? 'Mbi 200' : 'Nen 200'}</span></span>
              {vix && (
                <MiniPopover label={`VIX ${vix.level} — ${vix.status}`} desc={`VIX (Volatility Index) — frika e tregut te opcioneve S&P 500. Mat sa volatil pritet te jete tregu ne 30 ditet e ardhshme. Idealisht: nen 20 = CALM (treg i qete, kushte ideale per swing, size i plote), 20-25 = ELEVATED (kujdes — pozicion 75%, stop-i 1.2x me i gjere), mbi 25 = HIGH (rrezik i larte — pozicion 50%, stop-i 1.5x me i gjere, vetem setup-et me te forta), mbi 30 = panik. VIX i larte do te thote gap-e me te medha dhe fake breakout-e me te shumta — presicioni i sinjaleve bie. Kjo eshte arsyeja perse hyrjet reduktohen automatikisht.`} >
                  <span className="text-muted-foreground">VIX: <span className={vix.status === 'CALM' ? 'text-emerald-400' : vix.status === 'ELEVATED' ? 'text-amber-400' : 'text-red-400 font-bold'}>{vix.level} ({vix.status})</span></span>
                </MiniPopover>
              )}
              {breadth && (
                <MiniPopover label={`Breadth ${breadth.pct}% — ${breadth.status}`} desc={`Market Breadth — % e aksioneve ne universe (400) qe jane mbi SMA50. Ky eshte indikator PARALEL I REGJIMIT: SPY mund te jete mbi SMA50 por nese pak aksione jane mbi te = renie e fshehur. Idealisht: 55-100% = HEALTHY (participim i gjere, trend i shendetshhem), 40-55% = MIXED (treg i perzier — pozicione me te vogla), nen 40% = WEAK (shume pak aksione ne trend — kujdes i madh, vetem setup perfekte), nen 35% = RISK (bllokon hyrjet). Breadth ka tendence te kthehet PARA indekseve — eshte sinjal i hershem.`} >
                  <span className="text-muted-foreground">Breadth: <span className={breadth.status === 'HEALTHY' ? 'text-emerald-400' : breadth.status === 'MIXED' ? 'text-amber-400' : 'text-red-400 font-bold'}>{breadth.pct}% ({breadth.status})</span></span>
                </MiniPopover>
              )}
              {stopVolMultiplier > 1 && (
                <MiniPopover label={`Stop Multiplier x${stopVolMultiplier}`} desc={`Stop-loss i zgjeruar automatikisht nga VIX: kur VIX eshte 20-25 (ELEVATED) stop-i vendoset 1.2x me gjere, kur VIX > 25 (HIGH) 1.5x me gjere. Pse: ne tregje me volatilitet te larte, levizjet normale ditorre i kalojne stop-et e ngushte — stop-i standard te nxjerre jashte pozicionit para kohe (whipsaw). E kunderta: stop me i gjere = me shume rrezik per share, ndaj pozicioni reduktohet njekohesisht (75% ose 50%).`} >
                  <span className="text-muted-foreground">Stop: <span className="text-amber-400">x{stopVolMultiplier} (i gjere per shkak te VIX)</span></span>
                </MiniPopover>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
interface SearchResult { ticker: string; company: string; exchange: string; price: number; change: number; volume: number; }

// ── Single Stock Search Component ──
function StockSearchBox() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [analyzedStock, setAnalyzedStock] = useState<FunnelStock | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [regimeOk, setRegimeOk] = useState(true);
  const [regimeDetail, setRegimeDetail] = useState<FunnelResponse['regimeDetail'] | null>(null);
  const [funnelPhases, setFunnelPhases] = useState({ passedLiquidity: 0, passedTrend: 0, passedSetup: 0, passedRisk: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  // Search with debounce
  const handleInput = (val: string) => {
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (val.length < 2) { setResults([]); setShowDropdown(false); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ticker-search?q=${encodeURIComponent(val)}`);
        const json = await res.json();
        setResults(json.results || []);
        setShowDropdown(true);
      } catch { setResults([]); }
    }, 350);
  };

  const selectTicker = async (ticker: string) => {
    setShowDropdown(false); setQuery(ticker);
    setAnalyzedStock(null); setAnalyzeError(null); setRegimeDetail(null);
    setAnalyzing(ticker);
    try {
      const res = await fetch(`/api/ibkr-analyze/${ticker}?_t=${Date.now()}`, { cache: 'no-store' });
      const json = await res.json();
      setRegimeOk(json.regimeOk);
      setRegimeDetail(json.regimeDetail ?? null);
      setFunnelPhases(json.funnel || { passedLiquidity: 0, passedTrend: 0, passedSetup: 0, passedRisk: 0 });
      if (json.error && !json.stock) {
        setAnalyzeError(json.error);
      } else if (json.stock) {
        setAnalyzedStock(json.stock);
      }
    } catch { setAnalyzeError('Gabim rrjeti'); }
    setAnalyzing(null);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => handleInput(e.target.value)}
              onFocus={() => results.length > 0 && setShowDropdown(true)}
              placeholder="Kerko nje aksion (p.sh. AAPL, TSLA, COIN...)"
              className="w-full pl-9 pr-9 py-2.5 rounded-lg bg-muted/10 border border-border/50 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
            />
            {query && (
              <button onClick={() => { setQuery(''); setResults([]); setShowDropdown(false); setAnalyzedStock(null); setAnalyzeError(null); }} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-muted-foreground/50 hover:text-muted-foreground" /></button>
            )}
          </div>
          {query.length >= 1 && !analyzing && (
            <button onClick={() => selectTicker(query.toUpperCase())} className="flex items-center gap-1.5 text-[13px] px-3 py-2.5 rounded-lg bg-violet-500/10 border border-violet-500/30 text-violet-400 hover:bg-violet-500/20 transition-colors whitespace-nowrap">
              <Activity className="w-3.5 h-3.5" /> Analizo
            </button>
          )}
          {analyzing && (
            <div className="flex items-center gap-1.5 text-[13px] px-3 py-2.5 text-violet-400 whitespace-nowrap">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Duke analizuar {analyzing}...
            </div>
          )}
        </div>
        {/* Dropdown */}
        {showDropdown && results.length > 0 && (
          <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border/60 rounded-lg shadow-xl overflow-hidden">
            {results.map(r => (
              <button key={r.ticker} onClick={() => selectTicker(r.ticker)} className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-muted/10 transition-colors text-left">
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-[13px] text-foreground">{r.ticker}</span>
                  <span className="text-[12px] text-muted-foreground ml-2 truncate">{r.company}</span>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-[13px] text-foreground font-medium">${r.price}</span>
                  <span className={`text-[12px] ml-1.5 ${r.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.change >= 0 ? '+' : ''}{r.change.toFixed(1)}%</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Analyze Error */}
      {analyzeError && (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="flex items-center gap-3 py-3 px-4">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span className="text-[13px] text-red-400">{analyzeError}</span>
          </CardContent>
        </Card>
      )}

      {/* Analyzed Stock Result */}
      {analyzedStock && (
        <div className="space-y-2">
          {/* Regime context with VIX/Breadth popups (single-stock view) */}
          {regimeDetail && (
            <RegimeBanner regimeDetail={regimeDetail} regimeOk={regimeOk} compact />
          )}
          {/* Funnel diagnostic for single stock */}
          <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
            <span className={`px-2 py-1 rounded-md ${funnelPhases.passedLiquidity ? 'bg-cyan-500/20 text-cyan-400' : 'bg-red-500/10 text-red-400/60 line-through'}`}>Likuiditet {funnelPhases.passedLiquidity ? '✓' : '✗'}</span>
            <ArrowDown className="w-3 h-3 text-muted-foreground/30" />
            <span className={`px-2 py-1 rounded-md ${funnelPhases.passedTrend ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/10 text-red-400/60 line-through'}`}>Trend + RS {funnelPhases.passedTrend ? '✓' : '✗'}</span>
            <ArrowDown className="w-3 h-3 text-muted-foreground/30" />
            <span className={`px-2 py-1 rounded-md ${funnelPhases.passedSetup ? 'bg-violet-500/20 text-violet-400' : 'bg-red-500/10 text-red-400/60 line-through'}`}>Setup {funnelPhases.passedSetup ? '✓' : '✗'}</span>
            <ArrowDown className="w-3 h-3 text-muted-foreground/30" />
            <span className={`px-2 py-1 rounded-md ${funnelPhases.passedRisk ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/10 text-red-400/60 line-through'}`}>Risk Gate {funnelPhases.passedRisk ? '✓' : '✗'}</span>
            {!regimeOk && <span className="text-[11px] text-red-400/70 ml-1">(Regjimi JO OK)</span>}
          </div>
          <StockCard stock={analyzedStock} rank={0} />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DITARI TOP 10 — IBKR Trade Journal
// Sistemi mban ditar vetëm për Top 10 (kandidatët READY).
// Raporti i detajuar shfaqet VETËM kur klikon simbolin.
// ═══════════════════════════════════════════════════════════════

function journalStatusBadge(s: string | null | undefined, active: boolean) {
  if (s === 'HIT_TARGET') return { cls: 'bg-emerald-500/15 text-emerald-400', label: 'TARGET ✓' };
  if (s === 'HIT_STOP') return { cls: 'bg-red-500/15 text-red-400', label: 'STOP ✗' };
  if (s === 'EXPIRED') return { cls: 'bg-muted/50 text-muted-foreground', label: 'SKADOI' };
  if (s === 'NO_FILL') return { cls: 'bg-blue-500/10 text-blue-400/80', label: 'PA HYRJE' };
  if (s === 'OPEN') return { cls: 'bg-amber-500/15 text-amber-400', label: 'HAPUR' };
  if (active) return { cls: 'bg-cyan-500/15 text-cyan-400', label: 'NË TOP 10' };
  return { cls: 'bg-muted/40 text-muted-foreground/70', label: 'DOLI' };
}

function tagChip(tag: string) {
  const map: Record<string, string> = {
    CONTINUATION: 'bg-emerald-500/10 text-emerald-400/90',
    FADE: 'bg-red-500/10 text-red-400/90',
    NO_RVOL: 'bg-amber-500/10 text-amber-400/90',
    REGIME: 'bg-violet-500/10 text-violet-400/90',
    GAVE_BACK: 'bg-orange-500/10 text-orange-400/90',
    NO_FILL: 'bg-blue-500/10 text-blue-400/90',
  };
  return (
    <span key={tag} className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${map[tag] || 'bg-muted/30 text-muted-foreground/80'}`}>
      {tag}
    </span>
  );
}

export function Top10JournalCard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // Detajet — vetëm me kërkesë
  const [detailSymbol, setDetailSymbol] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Raporti javor — vetëm me kërkesë
  const [weekly, setWeekly] = useState<any>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [showWeekly, setShowWeekly] = useState(false);

  // Setup-i i tabelave (1 klik) kur mungojnë
  const [setupBusy, setSetupBusy] = useState(false);

  // Vëzhguesi live i çmimeve (alarme hyrjeje)
  const [watch, setWatch] = useState<any>(null);
  const [watchBusy, setWatchBusy] = useState(false);
  const [watchEvents, setWatchEvents] = useState<any[]>([]);

  const fetchJournal = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/journal/today?_t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchJournal(); }, [fetchJournal, reloadKey]);

  const openDetail = useCallback(async (symbol: string) => {
    if (detailSymbol === symbol) { setDetailSymbol(null); setDetail(null); return; }
    setDetailSymbol(symbol);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/journal/stock/${symbol}?days=30`, { cache: 'no-store' });
      if (res.ok) setDetail(await res.json());
    } catch { /* ignore */ }
    finally { setDetailLoading(false); }
  }, [detailSymbol]);

  const openWeekly = useCallback(async () => {
    if (showWeekly) { setShowWeekly(false); return; }
    setShowWeekly(true);
    if (weekly) return;
    setWeeklyLoading(true);
    try {
      const res = await fetch('/api/journal/weekly?days=7', { cache: 'no-store' });
      if (res.ok) setWeekly(await res.json());
    } catch { /* ignore */ }
    finally { setWeeklyLoading(false); }
  }, [showWeekly, weekly]);

  const runDbSetup = async () => {
    setSetupBusy(true);
    try {
      const res = await fetch('/api/db-setup', { method: 'POST' });
      if (res.ok) {
        await fetchJournal();
        setReloadKey(k => k + 1);
      } else {
        const j = await res.json().catch(() => ({}));
        alert(j.error || 'Krijimi i tabelave dështoi.');
      }
    } catch { alert('Gabim rrjeti gjatë setup-it.'); }
    finally { setSetupBusy(false); }
  };

  // Kontroll i menjëhershëm i çmimeve: nivelet e Ditarit ndaj quote-ve live
  const runWatch = useCallback(async () => {
    setWatchBusy(true);
    try {
      const res = await fetch('/api/journal/price-watch', { cache: 'no-store' });
      if (res.ok) {
        const w = await res.json();
        setWatch({ ...w, checkedAtTime: new Date().toLocaleTimeString('sq-AL') });
        if ((w.events || []).length) {
          setWatchEvents(w.events);
          await fetchJournal(); // rifresko badge-t (TARGET ✓ / STOP ✗)
        }
      }
    } catch { /* ignore */ }
    finally { setWatchBusy(false); }
  }, [fetchJournal]);

  // Automatikisht: 1 kontroll në hapje + çdo 15 min (sa kohë faqja është hapur)
  useEffect(() => {
    if (!data?.dbActive || !data?.tablesReady) return;
    const t = setTimeout(runWatch, 1500);
    const iv = setInterval(runWatch, 15 * 60 * 1000);
    return () => { clearTimeout(t); clearInterval(iv); };
  }, [data?.dbActive, data?.tablesReady, runWatch]);

  const entries: any[] = data?.entries || [];
  const recent: any[] = data?.recent || [];
  const totals = data?.totals;
  const tablesMissing = data?.dbActive && !data?.tablesReady;

  return (
    <Card className="border-cyan-500/20 bg-cyan-500/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-cyan-400" />
            <h3 className="text-[14px] font-bold text-foreground">Ditar Top 10</h3>
            <span className="text-[11px] text-muted-foreground">— vetëm kandidatët e tregtimit (READY) në Top 10</span>
          </div>
          <div className="flex items-center gap-2">
            {totals && totals.entries > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-muted/30 text-muted-foreground">
                total: {totals.entries} · {totals.hits}✓ · {totals.stops}✗
              </span>
            )}
            <button onClick={openWeekly} className="flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-colors">
              <History className="w-3.5 h-3.5" />
              Raporti Javor
            </button>
          </div>
        </div>
        <p className="text-[12px] text-muted-foreground mt-1.5">
          Ditar i detajuar ruhet automatikisht vetëm për Top 10; WATCHLIST, ATR BLOCK dhe sinjalet e dobëta NUK futen.
          Kliko simbolin për raportin e detajuar (diagnozë + mësim).
        </p>

        {/* Vëzhguesi live — alarmet e hyrjes/targetit/stop-it (Telegram) */}
        {!loading && data?.dbActive && data?.tablesReady && (
          <div className="mt-2.5 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.03] px-2.5 py-2 flex items-center gap-2 flex-wrap">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] text-muted-foreground">Vëzhgues Live — hyrje · stop · target</span>
            {watch && (
              <span className="text-[10px] text-muted-foreground/60">
                {watch.marketOpen ? 'tregu HAPUR' : 'tregu mbyllur'}
                {watch.checkedAtTime ? ` · kontroll ${watch.checkedAtTime}` : ''}
              </span>
            )}
            {watch && !watch.alertsConfigured && (
              <span className="text-[10px] text-amber-400/80">Telegram jo i konfiguruar (Vercel → env)</span>
            )}
            <button onClick={runWatch} disabled={watchBusy} className="ml-auto flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
              {watchBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {watchBusy ? 'Duke kontrolluar...' : 'Kontrollo çmimet tani'}
            </button>
          </div>
        )}

        {/* Njoftimet e reja nga kontrolli i fundit */}
        {watchEvents.length > 0 && (
          <div className="mt-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-2.5 space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-emerald-400/90 uppercase tracking-wide">Njoftime të reja ({watchEvents.length})</p>
              <button onClick={() => setWatchEvents([])} className="text-[11px] text-muted-foreground/60 hover:text-foreground">fsheh ×</button>
            </div>
            {watchEvents.map((ev: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                {ev.kind === 'ENTRY' && <LogIn className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                {ev.kind === 'TARGET' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                {ev.kind === 'STOP' && <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                <span className="font-bold text-foreground">{ev.ticker}</span>
                <span className="text-muted-foreground">
                  {ev.kind === 'ENTRY' && `hyrja ${ev.level?.toFixed(2)} u kap — çmimi ${ev.price?.toFixed(2)}`}
                  {ev.kind === 'TARGET' && `target ${ev.level?.toFixed(2)} u kap — çmimi ${ev.price?.toFixed(2)}`}
                  {ev.kind === 'STOP' && `stop ${ev.level?.toFixed(2)} aktivizohet — çmimi ${ev.price?.toFixed(2)}`}
                </span>
                {ev.alertSent && <span className="text-[10px] text-emerald-400/70">→ Telegram ✓</span>}
              </div>
            ))}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="mt-3 space-y-2">
            <Skeleton className="h-8 rounded-md" />
            <Skeleton className="h-8 rounded-md w-2/3" />
          </div>
        )}

        {/* DB JOAKTIVE */}
        {!loading && data && !data.dbActive && (
          <div className="mt-3 rounded-lg bg-amber-500/5 border border-amber-500/15 p-3 text-[12px] text-amber-400/90">
            Ditarit i duhet PostgreSQL (Neon). Aktivizoje: Vercel → Storage → Connect Database (Neon), pastaj tabela krijohet automatikisht.
          </div>
        )}

        {/* TABELAT MUNGOJNË */}
        {!loading && tablesMissing && (
          <div className="mt-3 rounded-lg bg-amber-500/5 border border-amber-500/15 p-3">
            <p className="text-[12px] text-amber-400/90 mb-2">Databaza është aktive, por tabela e ditarit nuk ekziston ende.</p>
            <button onClick={runDbSetup} disabled={setupBusy} className="flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 transition-colors disabled:opacity-50">
              {setupBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {setupBusy ? 'Duke krijuar...' : 'Krijo tabelat tani (1 klik)'}
            </button>
          </div>
        )}

        {/* Hyrjet e ditës */}
        {!loading && data?.dbActive && data?.tablesReady && entries.length === 0 && (
          <div className="mt-3 rounded-lg bg-muted/5 border border-border/30 p-3 text-[12px] text-muted-foreground/80">
            S&apos;ka hyrje në ditar për {data.scanDate}. Hyrjet krijohen automatikisht kur skanimi gjen kandidate READY brenda Top 10 — kliko &quot;Rifresko&quot; më sipër ose prit skanimin e radhës.
          </div>
        )}

        {!loading && entries.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {entries.map((e: any) => {
              const sb = journalStatusBadge(e.exitStatus, e.active);
              return (
                <div key={e.id} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 border ${e.active ? 'border-cyan-500/15 bg-cyan-500/[0.03]' : 'border-border/30 bg-muted/5 opacity-70'}`}>
                  <span className="text-[10px] font-mono text-muted-foreground/60 w-5">#{e.rank}</span>
                  <button onClick={() => openDetail(e.ticker)} className={`text-[13px] font-bold hover:underline underline-offset-2 ${detailSymbol === e.ticker ? 'text-cyan-400 underline' : 'text-foreground'}`}>
                    {e.ticker}
                  </button>
                  <span className="text-[10px] font-mono text-amber-400/80">{Math.round(e.score || 0)}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/70 hidden sm:inline">
                    E ${e.entry?.toFixed(2)} · S ${e.stop?.toFixed(2)} · T ${e.target?.toFixed(2)}
                  </span>
                  <div className="ml-auto flex items-center gap-1.5 flex-wrap justify-end">
                    {e.resultR != null && (
                      <span className={`text-[11px] font-mono font-bold ${e.resultR > 0 ? 'text-emerald-400' : e.resultR < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                        {e.resultR > 0 ? '+' : ''}{e.resultR.toFixed(2)}R
                      </span>
                    )}
                    {(e.tags || []).slice(0, 3).map(tagChip)}
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${sb.cls}`}>{sb.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Detajet — shfaqen VETËM me kërkesë */}
        {detailSymbol && (
          <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.03] p-3">
            {detailLoading && (
              <div className="flex items-center gap-2 py-3 justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                <span className="text-[12px] text-muted-foreground">Duke ngarkuar raportin për {detailSymbol}...</span>
              </div>
            )}
            {!detailLoading && detail?.message && (
              <p className="text-[12px] text-muted-foreground py-2">{detail.message}</p>
            )}
            {!detailLoading && detail?.stats && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[15px] font-bold text-foreground">{detail.symbol}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {detail.stats.total} sinjale · {detail.stats.targetHits}✓ / {detail.stats.stopHits}✗
                    {detail.stats.hitRate != null && ` · hit-rate ${detail.stats.hitRate}%`}
                    {detail.stats.avgResultR != null && ` · avg ${detail.stats.avgResultR > 0 ? '+' : ''}${detail.stats.avgResultR}R`}
                  </span>
                </div>
                {detail.evalNote && (
                  <pre className="text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap font-sans bg-muted/10 rounded-md p-2.5 border border-border/30">
                    {detail.evalNote}
                  </pre>
                )}
                {detail.entries?.length > 1 && (
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Historia (30 ditë)</p>
                    {detail.entries.map((en: any) => {
                      const sb = journalStatusBadge(en.exitStatus, en.active);
                      return (
                        <div key={en.id} className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
                          <span className="w-[70px]">{en.scanDate}</span>
                          <span className={sb.cls + ' px-1.5 py-0.5 rounded text-[9px] font-bold'}>{sb.label}</span>
                          {en.resultR != null && (
                            <span className={en.resultR > 0 ? 'text-emerald-400' : 'text-red-400'}>
                              {en.resultR > 0 ? '+' : ''}{en.resultR.toFixed(2)}R
                            </span>
                          )}
                          {en.changeReason && <span className="text-[10px] text-muted-foreground/60 truncate hidden sm:inline">— {en.changeReason}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Raporti javor — i shkurtër, automatik */}
        {showWeekly && (
          <div className="mt-3 rounded-lg border border-cyan-500/20 bg-muted/5 p-3">
            <div className="flex items-center gap-2 mb-2">
              <History className="w-3.5 h-3.5 text-cyan-400" />
              <p className="text-[12px] font-bold text-foreground">Raporti Javor</p>
              <span className="text-[10px] text-muted-foreground/60">{weekly?.window?.from} → {weekly?.window?.to}</span>
            </div>
            {weeklyLoading && (
              <div className="flex items-center gap-2 py-3 justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                <span className="text-[12px] text-muted-foreground">Duke llogaritur...</span>
              </div>
            )}
            {!weeklyLoading && weekly?.dbActive === false && (
              <p className="text-[12px] text-muted-foreground py-2">Databaza nuk është aktive.</p>
            )}
            {!weeklyLoading && weekly?.dbActive && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-md bg-emerald-500/5 border border-emerald-500/15 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">Target Hit</p>
                    <p className="text-[15px] font-bold text-emerald-400">{weekly.totals?.targetHits ?? 0}</p>
                  </div>
                  <div className="rounded-md bg-red-500/5 border border-red-500/15 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">Stop Hit</p>
                    <p className="text-[15px] font-bold text-red-400">{weekly.totals?.stopHits ?? 0}</p>
                  </div>
                  <div className="rounded-md bg-cyan-500/5 border border-cyan-500/15 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">Hit-Rate</p>
                    <p className="text-[15px] font-bold text-cyan-400">{weekly.hitRate != null ? weekly.hitRate + '%' : '—'}</p>
                  </div>
                  <div className="rounded-md bg-violet-500/5 border border-violet-500/15 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">Expectancy</p>
                    <p className={`text-[15px] font-bold ${(weekly.expectancyR ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {weekly.expectancyR != null ? (weekly.expectancyR > 0 ? '+' : '') + weekly.expectancyR + 'R' : '—'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 text-[11px] text-muted-foreground flex-wrap">
                  <span>Drejtimi i saktë: <strong className="text-foreground">{weekly.directionAccuracy != null ? weekly.directionAccuracy + '%' : '—'}</strong></span>
                  <span>MFE mes.: <strong className="text-foreground">{weekly.avgMfeR != null ? '+' + weekly.avgMfeR + 'R' : '—'}</strong></span>
                  <span>MAE mes.: <strong className="text-foreground">{weekly.avgMaeR != null ? '-' + Math.abs(weekly.avgMaeR) + 'R' : '—'}</strong></span>
                  <span>Hapur: <strong className="text-foreground">{weekly.totals?.open ?? 0}</strong></span>
                </div>
                {weekly.mistakes?.length > 0 && (
                  <div>
                    <p className="text-[10px] text-red-400/80 uppercase tracking-wide mb-1">3 gabimet më të shpeshta</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {weekly.mistakes.map((m: any) => (
                        <span key={m.tag} className="px-2 py-0.5 rounded bg-red-500/10 text-red-400/90 text-[10px] font-mono">{m.tag} ×{m.count}</span>
                      ))}
                    </div>
                  </div>
                )}
                {weekly.winningFactors?.length > 0 && (
                  <div>
                    <p className="text-[10px] text-emerald-400/80 uppercase tracking-wide mb-1">Faktorët që ndihmuan</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {weekly.winningFactors.map((m: any) => (
                        <span key={m.tag} className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400/90 text-[10px] font-mono">{m.tag} ×{m.count}</span>
                      ))}
                    </div>
                  </div>
                )}
                {weekly.missedWinners?.length > 0 && (
                  <div>
                    <p className="text-[10px] text-amber-400/80 uppercase tracking-wide mb-1">Missed Winners — jashtë Top 10</p>
                    <div className="space-y-1">
                      {weekly.missedWinners.map((w: any) => (
                        <div key={w.symbol} className="flex items-center gap-2 text-[11px]">
                          <span className="font-bold text-foreground">{w.symbol}</span>
                          <span className="text-muted-foreground/60">{w.scanDate}</span>
                          <span className="font-mono text-amber-400">+{w.ret5dPct}%</span>
                          <span className="text-muted-foreground/50 text-[10px] hidden sm:inline">{w.verdict}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(weekly.totals?.entries ?? 0) === 0 && (
                  <p className="text-[12px] text-muted-foreground/70">Pa hyrje në ditar brenda dritares — ditarit mbushet pas skanimeve të ardhshme me kandidate READY.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Historia e afërt e mbyllur */}
        {!loading && recent.length > 0 && !showWeekly && !detailSymbol && (
          <div className="mt-3 pt-2 border-t border-border/30">
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mb-1.5">Përfundimet e fundit</p>
            <div className="flex gap-1.5 flex-wrap">
              {recent.map((r: any) => {
                const sb = journalStatusBadge(r.exitStatus, false);
                return (
                  <button key={r.id} onClick={() => openDetail(r.ticker)} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/10 border border-border/30 hover:border-cyan-500/30 transition-colors">
                    <span className="text-[11px] font-bold text-foreground">{r.ticker}</span>
                    <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${sb.cls}`}>{sb.label}</span>
                    {r.resultR != null && (
                      <span className={`text-[10px] font-mono ${r.resultR > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {r.resultR > 0 ? '+' : ''}{r.resultR.toFixed(1)}R
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function IBKRStrategy() {
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);

  // Learning Engine state
  const [learningSummary, setLearningSummary] = useState<any | null>(null);
  const [learningLoading, setLearningLoading] = useState(false);
  const [showLearning, setShowLearning] = useState(false);

  // Learning Insights state (Mësimet nga e kaluara)
  const [insights, setInsights] = useState<any | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [learnRunning, setLearnRunning] = useState(false);

  const fetchInsights = useCallback(async (force = false) => {
    if (!force && insights) return;
    setInsightsLoading(true);
    try {
      const res = await fetch('/api/scanner-learning/insights', { cache: 'no-store' });
      if (res.ok) setInsights(await res.json());
    } catch { /* ignore */ }
    finally { setInsightsLoading(false); }
  }, [insights]);

  const runLearningNow = useCallback(async () => {
    setLearnRunning(true);
    try {
      await fetch('/api/scanner/learn', { method: 'POST' });
      await fetchInsights(true); // rifresko pas ciklit
      setLearningSummary(null); // rifresko edhe statistikat kur hapen
    } catch { /* ignore */ }
    finally { setLearnRunning(false); }
  }, [fetchInsights]);

  const fetchLearningSummary = useCallback(async () => {
    if (learningSummary) return;
    setLearningLoading(true);
    try {
      const res = await fetch('/api/scanner-learning/summary');
      if (res.ok) {
        const data = await res.json();
        setLearningSummary(data);
      }
    } catch { /* ignore */ }
    finally { setLearningLoading(false); }
  }, [learningSummary]);

  const runScan = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/ibkr-scan?_t=' + Date.now(), { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gabim');
      setData(json); setHasScanned(true);
    } catch (err: any) {
      setError(err?.message || 'Gabim rrjeti');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { runScan(); }, [runScan]);

  const readyStocks = data?.results.filter(r => r.decision === 'READY') || [];
  const otherStocks = data?.results.filter(r => r.decision !== 'READY') || [];
  // VP data from Adaptive Scanner Engine
  const vpMap = new Map<string, any>((data?.vpReady || []).map((v: any) => [v.symbol, v]));

  return (
    <div className="space-y-4">
      {/* Overview */}
      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-emerald-500/15 rounded-lg p-2.5"><TrendingUp className="w-6 h-6 text-emerald-400" /></div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Strategjia: Trend Pullback Swing</h2>
              <p className="text-[13px] text-muted-foreground">Funnel: 400 → Liquidity → Trend → Setup → Risk Gate → 5-10 Top Stocks</p>
            </div>
          </div>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            Swing trading i rregulluar nga trendi per <strong className="text-foreground">IBKR</strong>.
            Komponimi: <Badge variant="outline" className="mx-0.5 text-[11px] border-blue-500/30 text-blue-400 bg-blue-500/10">25% Trend</Badge> +
            <Badge variant="outline" className="mx-0.5 text-[11px] border-violet-500/30 text-violet-400 bg-violet-500/10">20% RS</Badge> +
            <Badge variant="outline" className="mx-0.5 text-[11px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10">15% Momentum</Badge> +
            <Badge variant="outline" className="mx-0.5 text-[11px] border-cyan-500/30 text-cyan-400 bg-cyan-500/10">15% Volum</Badge> +
            <Badge variant="outline" className="mx-0.5 text-[11px] border-amber-500/30 text-amber-400 bg-amber-500/10">10% Setup</Badge> +
            <Badge variant="outline" className="mx-0.5 text-[11px] border-red-500/30 text-red-400 bg-red-500/10">5% Risk</Badge>
          </p>
        </CardContent>
      </Card>

      {/* Live Scan */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-blue-400" />
              <div>
                <h3 className="text-[15px] font-bold text-foreground">Funnel Scanner — 400 Aksione</h3>
                <p className="text-[13px] text-muted-foreground">400 → likuiditet → trend → setup → risk gate → top stocks</p>
              </div>
            </div>
            <button onClick={runScan} disabled={loading} className="flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Duke skanuar...' : 'Rifresko'}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Learning Engine — Adaptive Scanner (lart në faqe, pas Funnel Scanner) */}
      <Card className="border-violet-500/20 bg-violet-500/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitCompareArrows className="w-4 h-4 text-violet-400" />
              <h3 className="text-[14px] font-bold text-foreground">Learning Engine</h3>
              <span className="text-[11px] text-muted-foreground">— mëson nga rezultatet e kaluara</span>
            </div>
            <div className="flex items-center gap-2">
              {/* ═══ MËSIMET — çfarë mësoi sistemi nga e kaluara ═══ */}
              <Popover open={showInsights} onOpenChange={(open) => {
                setShowInsights(open);
                if (open) fetchInsights();
              }}>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-md bg-violet-500/15 border border-violet-500/40 text-violet-300 hover:bg-violet-500/25 transition-colors">
                    <Brain className="w-3.5 h-3.5" />
                    Mësimet
                    {insights?.sample?.enoughData && (
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400" title="Mësim aktiv — peshat aplikohen në skaner" />
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[380px] p-4 bg-popover border-border/50 max-h-[70vh] overflow-y-auto" side="bottom" align="end">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Brain className="w-5 h-5 text-violet-400" />
                      <p className="text-sm font-semibold text-foreground">Çfarë mësoi sistemi</p>
                      <button
                        onClick={runLearningNow}
                        disabled={learnRunning || insightsLoading}
                        className="ml-auto flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-violet-500/10 border border-violet-500/30 text-violet-400 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
                        title="Vlerëso rezultatet e reja + përditëso peshat"
                      >
                        {learnRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        {learnRunning ? 'Duke mësuar...' : 'Përditëso tani'}
                      </button>
                    </div>

                    {insightsLoading && !insights && (
                      <div className="flex items-center gap-2 py-4 justify-center">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        <span className="text-[12px] text-muted-foreground">Duke ngarkuar mësimet...</span>
                      </div>
                    )}

                    {!insightsLoading && !insights && (
                      <p className="text-[12px] text-muted-foreground py-2">Mësimet nuk u ngarkuan.</p>
                    )}

                    {!insightsLoading && insights && (
                      <div className="space-y-3">
                        {/* Mostra e të mësuarit */}
                        <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 p-2.5">
                          <div className="flex items-center justify-between text-[12px]">
                            <span className="text-muted-foreground">Mësuar nga</span>
                            <span className="text-violet-300 font-bold">{insights.sample?.evaluated ?? 0} rezultate</span>
                          </div>
                          <div className="flex items-center justify-between text-[12px] mt-1">
                            <span className="text-muted-foreground">Fitore bazë (continuation)</span>
                            <span className="text-emerald-400 font-bold">{insights.sample?.baselineWinRate ?? 0}%</span>
                          </div>
                          <div className="flex items-center justify-between text-[12px] mt-1">
                            <span className="text-muted-foreground">Kthimi mesatar</span>
                            <span className={`font-bold ${(insights.sample?.avgReturnPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{(insights.sample?.avgReturnPct ?? 0) > 0 ? '+' : ''}{insights.sample?.avgReturnPct ?? 0}%</span>
                          </div>
                          {/* Progresi */}
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                              <span>Progresi i mostrës</span>
                              <span>{insights.sample?.decisive ?? 0}/{insights.sample?.minRequired ?? 30} vendime</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${Math.min(100, ((insights.sample?.decisive ?? 0) / (insights.sample?.minRequired ?? 30)) * 100)}%`,
                                  background: insights.sample?.enoughData ? 'rgb(167 139 250)' : 'rgb(245 158 11)',
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Zonat e faktorëve */}
                        {insights.zones?.length > 0 ? (
                          <div>
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Zonat që dallohen</p>
                            <div className="space-y-1.5">
                              {insights.zones.slice(0, 7).map((z: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 p-1.5 rounded-md bg-muted/15">
                                  {z.winRate < 0
                                    ? <Activity className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
                                    : z.edge > 0
                                    ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                    : <ArrowDownRight className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11.5px] font-medium text-foreground truncate">{z.zone}</p>
                                    <p className="text-[10px] text-muted-foreground">
                                      {z.winRate >= 0 ? `${z.winRate}% fitore · ` : 'pa vendime · '}
                                      n={z.n} · kthimi {(z.avgReturn > 0 ? '+' : '') + z.avgReturn}%
                                    </p>
                                  </div>
                                  {z.winRate >= 0 && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${z.edge > 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                                      {z.edge > 0 ? '+' : ''}{z.edge}pp
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-[12px] text-muted-foreground">Ende nuk ka zona me mostër të mjaftueshme (min 5 raste për zonë).</p>
                        )}

                        {/* Peshat e aplikuara */}
                        <div className="rounded-lg bg-muted/10 border border-border/30 p-2.5">
                          <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">Peshat e aplikuara në skaner</p>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              { k: 'Trend', v: insights.multipliers?.TREND },
                              { k: 'Volum', v: insights.multipliers?.VOLUME },
                              { k: 'Momentum', v: insights.multipliers?.MOMENTUM },
                              { k: 'Likuiditet', v: insights.multipliers?.LIQUIDITY },
                            ].map(({ k, v }) => (
                              <span key={k} className={`text-[11px] px-2 py-0.5 rounded-full font-mono border ${v == null ? 'text-muted-foreground bg-muted/10 border-border/30' : v > 1 ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' : v < 1 ? 'bg-red-500/15 text-red-400 border-red-500/20' : 'text-muted-foreground bg-muted/10 border-border/30'}`}>
                                {k} ×{v ?? 1}
                              </span>
                            ))}
                          </div>
                          <p className="text-[10px] text-muted-foreground/70 mt-2 leading-relaxed">
                            {insights.sample?.enoughData
                              ? 'Këto pesha janë AKTIVE — skaneri i rradhë i aplikimit automatikisht në score. Aksionet me faktorë fitues ngjiten lart, me faktorë humbës bien poshtë. Kufiri: ×0.75–×1.25, lëvizja max ±0.05 për ditë.'
                              : `Akoma nuk ka të dhëna të mjaftueshme (duhen ${insights.sample?.minRequired ?? 30} fitore+humbje). Peshat mbeten neutrale (×1) deri atëherë. Vlerësimi automatik: çdo ditë 05:00 UTC pas mbylljes së tregut.`}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              <Popover open={showLearning} onOpenChange={(open) => {
                setShowLearning(open);
                if (open) fetchLearningSummary();
              }}>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-md bg-violet-500/10 border border-violet-500/30 text-violet-400 hover:bg-violet-500/20 transition-colors">
                  <BarChart3 className="w-3.5 h-3.5" />
                  Statistikat
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-96 p-4 bg-popover border-border/50" side="bottom" align="end">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <GitCompareArrows className="w-5 h-5 text-violet-400" />
                    <p className="text-sm font-semibold text-foreground">Adaptive Learning Summary</p>
                  </div>
                  {learningLoading && (
                    <div className="flex items-center gap-2 py-4 justify-center">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      <span className="text-[12px] text-muted-foreground">Duke ngarkuar...</span>
                    </div>
                  )}
                  {!learningLoading && !learningSummary && (
                    <p className="text-[12px] text-muted-foreground py-2">Te dhenat nuk u ngarkuan.</p>
                  )}
                  {!learningLoading && learningSummary && (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-2.5 text-center">
                          <p className="text-[11px] text-muted-foreground">Sinjale Total</p>
                          <p className="text-lg font-bold text-emerald-400">{learningSummary.totalSignals ?? 0}</p>
                        </div>
                        <div className="rounded-lg bg-blue-500/5 border border-blue-500/15 p-2.5 text-center">
                          <p className="text-[11px] text-muted-foreground">Continuation Rate</p>
                          <p className="text-lg font-bold text-blue-400">{learningSummary.continuationRate ?? 0}%</p>
                        </div>
                        <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 p-2.5 text-center">
                          <p className="text-[11px] text-muted-foreground">Fade Rate</p>
                          <p className="text-lg font-bold text-amber-400">{learningSummary.fadeRate ?? 0}%</p>
                        </div>
                        <div className="rounded-lg bg-cyan-500/5 border border-cyan-500/15 p-2.5 text-center">
                          <p className="text-[11px] text-muted-foreground">Avg Next Day Return</p>
                          <p className={`text-lg font-bold ${(learningSummary.averageNextDayReturnPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{(learningSummary.averageNextDayReturnPct ?? 0) > 0 ? '+' : ''}{learningSummary.averageNextDayReturnPct ?? 0}%</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-lg bg-muted/10 p-2 text-center">
                          <p className="text-[10px] text-muted-foreground">Avg Drawdown</p>
                          <p className="text-sm font-bold text-red-400">{learningSummary.averageDrawdownPct ?? 0}%</p>
                        </div>
                        <div className="rounded-lg bg-muted/10 p-2 text-center">
                          <p className="text-[10px] text-muted-foreground">Target 5% Hit</p>
                          <p className="text-sm font-bold text-emerald-400">{learningSummary.target5HitRate ?? 0}%</p>
                        </div>
                        <div className="rounded-lg bg-muted/10 p-2 text-center">
                          <p className="text-[10px] text-muted-foreground">Target 10% Hit</p>
                          <p className="text-sm font-bold text-violet-400">{learningSummary.target10HitRate ?? 0}%</p>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground/60">Weights adaptohen ±0.05 per jav, minimum 50 raste. Walk-forward test mujore.</p>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            </div>
          </div>
          <p className="text-[12px] text-muted-foreground mt-1.5">
            Sistemi mëson vetë nga e kaluara: vlerëson rezultatet e sinjaleve me daily bars reale, zbulon zonat fituese (RSI, ADX, Trend, Volum, Regjim) dhe i aplikon si pesha në skanerin e radhës — automatikisht, çdo ditë në 05:00 UTC.
          </p>
        </CardContent>
      </Card>

      {/* Search single stock */}
      <Card className="border-violet-500/20 bg-violet-500/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Search className="w-4 h-4 text-violet-400" />
            <h3 className="text-[14px] font-bold text-foreground">Kerko Aksion</h3>
            <span className="text-[11px] text-muted-foreground">— Analizo cfaredo aksion me strategjine IBKR</span>
          </div>
          <StockSearchBox />
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-[200px] rounded-xl" />)}</div>}

      {/* Error */}
      {error && !loading && (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <span className="text-sm text-red-400">{error}</span>
            <button onClick={runScan} className="ml-auto text-sm text-red-500 hover:underline">Provo perseri</button>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {data && !loading && (<>
        <RegimeBanner regimeDetail={data.regimeDetail} regimeOk={data.regimeOk} />

        {/* Funnel */}
        {data.funnel && <FunnelViz funnel={data.funnel} />}

        {/* Scan time */}
        <div className="flex items-center gap-4 text-[13px] text-muted-foreground flex-wrap">
          <span><strong className="text-emerald-400">{readyStocks.length}</strong> READY</span>
          <span>·</span>
          <span><strong className="text-amber-400">{otherStocks.length}</strong> WATCHLIST / OTHER</span>
          {data.scannedAt && (<><span>·</span><span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{new Date(data.scannedAt).toLocaleTimeString('sq-AL')}</span></>)}
        </div>

        {/* Sector Exposure */}
        {data.sectorExposure && Object.keys(data.sectorExposure).length > 0 && (
          <div className="flex items-center gap-2 flex-wrap text-[12px] text-muted-foreground">
            <Layers className="w-3.5 h-3.5 text-muted-foreground/50" />
            {Object.entries(data.sectorExposure).map(([sec, count]) => (
              <span key={sec} className="px-2 py-0.5 rounded bg-muted/10 border border-border/30">
                {sec} <strong className="text-foreground">{count}</strong>
              </span>
            ))}
          </div>
        )}

        {/* READY stocks */}
        {readyStocks.length > 0 && (
          <div className="space-y-3">
            <p className="text-[13px] text-emerald-400 font-medium flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> READY — Kandidate per IBKR Bracket Order ({readyStocks.length})</p>
            {readyStocks.map((s, i) => <StockCard key={s.symbol} stock={s} rank={i + 1} vp={vpMap.get(s.symbol)} />)}
          </div>
        )}

        {/* Other stocks */}
        {otherStocks.length > 0 && (
          <div className="space-y-3">
            <p className="text-[13px] text-amber-400 font-medium flex items-center gap-2"><Eye className="w-4 h-4" /> WATCHLIST / EVENT RISK ({otherStocks.length})</p>
            {otherStocks.map((s, i) => <StockCard key={s.symbol} stock={s} rank={readyStocks.length + i + 1} vp={vpMap.get(s.symbol)} />)}
          </div>
        )}

        {/* VP READY stocks — from Adaptive Scanner Engine (not in IBKR top 10) */}
        {data?.vpReady && data.vpReady.length > 0 && (
          <div className="space-y-3">
            <p className="text-[13px] text-blue-400 font-medium flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              VP READY — Volume Profile konfirmoi support ({data.vpReady.length})
            </p>
            <p className="text-[11px] text-muted-foreground -mt-2">
              Këto tickers kaluan VP gate: trend + pullback EMA20 + persist + volum + VP support poshtë + pa resistance sipër
            </p>
            {data.vpReady.map((vp: any, i: number) => (
              <Card key={vp.symbol} className="border-blue-500/20 bg-blue-500/5">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold">{vp.symbol}</span>
                      <MiniPopover label="VP READY — Kaloi VP Gate" desc={"Kjo etiketë tregon se aksioni ka kaluar Volume Profile gate-in e Adaptive Scanner Engine: (1) trend rritës me pullback te EMA20, (2) persistencë 2+ ditë, (3) volum konfirmues, (4) VP support poshtë çmimit (HVN/POC brenda 1.2%), DHE (5) pa rezistencë volumi të afërt sipër. Idealisht: këto janë kandidatët me prioritet për tregtim — kushtet e hyrjes janë konfirmuar nga volumi i tregtuar. Kujdes: VP READY nuk e zëvendëson kontrollin e earnings/macro events — verifikoi gjithmonë Event Gate para hyrjes. Këto tickers mund të mos jenë në listën Top 10 të IBKR funnel-it sepse janë nga universe-i i plotë i 400 aksioneve."} >
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-bold">
                          VP READY
                        </span>
                      </MiniPopover>
                      <MiniPopover label={"Scanner Score " + vp.score + "/100"} desc={"Score-i i scanner-it (0-100) për këtë aksion në universe-in e 400 — i njëjti score total i përdorur për renditjen: kombinim i 6 shtresave (trend, RS, momentum, volum, setup, risk). Idealisht: mbi 65 = kandidat i fortë, 50-64 = mesatar, nën 50 = i dobët. Ky score është i ndryshëm nga VP Score (kyudit) që mat vetëm cilësinë e setup-it të çmimit kundrejt volumit." + (vp.score >= 65 ? " — VLERËSIMI: Score i fortë, kandidat me prioritet." : vp.score >= 50 ? " — VLERËSIMI: Score mesatar — kërko konfirmime shtesë." : " — VLERËSIMI: Score i ulët — kujdes.")} >
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-mono">
                          Score {vp.score}
                        </span>
                      </MiniPopover>
                    </div>
                    <MiniPopover label={"VP Score " + vp.vpScore + "/100"} desc={"Volume Profile Score 0-100: sa i mirë është setup-i i çmimit në raport me volumin e tregtuar gjatë 20 ditëve të fundit (Daily timeframe). Llogaritet: +35 pikë nëse ka mbështetje volumi (HVN/POC) poshtë çmimit, +20 nëse çmimi është brenda ose mbi Value Area, +25 nëse ka së paku 2% hapësirë deri te rezistenca e ardhshme, +20 nëse nuk ka rezistencë të afërt sipër. Idealisht: 80-100 = Setup i shkëlqyer, 60-79 = Setup i mirë, 40-59 = Mesatar, 0-39 = Setup i dobët."} >
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">
                        VP {vp.vpScore}/100
                      </span>
                    </MiniPopover>
                  </div>
                  {/* VP metrics */}
                  <div className="grid grid-cols-3 gap-2 text-[11px] mb-2">
                    <MiniPopover label={"POC (Point of Control) — $" + (vp.poc?.toFixed(2) ?? '—')} desc={"Pika e Kontrollit — niveli i çmimit ku është tregtuar VOLUMI më i madh gjatë 20 ditëve të fundit. Niveli me pranimin më të lartë të tregut, vepron si 'magnet' — çmimi ka tendencë të kthehet te POC. Idealisht: POC duhet të jetë POSHTË çmimit aktual (funksionon si mbështetje) ose shumë afër çmimit gjatë hyrjes në pullback."} >
                      <div className="flex flex-col">
                        <span className="text-muted-foreground">POC</span>
                        <span className="font-mono font-bold text-amber-400">${vp.poc?.toFixed(2)}</span>
                      </div>
                    </MiniPopover>
                    <MiniPopover label={"VAL (Value Area Low) — $" + (vp.val?.toFixed(2) ?? '—')} desc={"Fundi i Value Area — niveli më i ulët i zonës ku është tregtuar 70% e volumit (20 ditë). Poshtë VAL = zonë me pranim të ulët. Idealisht për pullback entry: hyrja afër VAL me candle rikthimi (bounce) jep R:R shumë të mirë sepse stop-i vendoset afër nën VAL. Kujdes: nëse çmimi e thyen VAL me volum të lartë, shmang long."} >
                      <div className="flex flex-col">
                        <span className="text-muted-foreground">VAL</span>
                        <span className="font-mono font-bold text-blue-400">${vp.val?.toFixed(2)}</span>
                      </div>
                    </MiniPopover>
                    <MiniPopover label={"VAH (Value Area High) — $" + (vp.vah?.toFixed(2) ?? '—')} desc={"Maja e Value Area — niveli më i lartë i zonës ku është tregtuar 70% e volumit (20 ditë). Idealisht: çmimi aktual duhet të jetë NËN VAH me hapësirë për të ngjitur, ose duke e thyer VAH me volum të lartë (breakout i vërtetë). Kujdes: VAH i thyer pa volum = breakout i rremë — mos e ndjek."} >
                      <div className="flex flex-col">
                        <span className="text-muted-foreground">VAH</span>
                        <span className="font-mono font-bold text-blue-400">${vp.vah?.toFixed(2)}</span>
                      </div>
                    </MiniPopover>
                  </div>
                  {/* HVN info */}
                  <div className="flex items-center gap-3 text-[10px] mb-2">
                    {vp.hvnBelow != null && (
                      <MiniPopover label={"HVN poshte (Support) — $" + vp.hvnBelow.toFixed(2)} desc={"High Volume Node poshtë — zona ku është tregtuar volum të paktën 1.5x mesatarja, tani NËN çmimin aktual. MBËSHTETJE e fortë sepse investitorët e mbrojnë çmimin ku kanë blerë më shumë. Idealisht: brenda 1.2% të çmimit aktual = mbështetje e afërt. Sa më afërt, aq më i sigurt stop-loss-i dhe R:R më i mirë."} >
                        <span className="flex items-center gap-1">
                          <span className="text-muted-foreground">HVN↓</span>
                          <span className="font-mono text-emerald-400">${vp.hvnBelow.toFixed(2)}</span>
                          {vp.supportBelow && <span className="text-emerald-400 font-bold">✓ support</span>}
                        </span>
                      </MiniPopover>
                    )}
                    {vp.hvnAbove != null && (
                      <MiniPopover label={"HVN sipër (Rezistencë) — $" + vp.hvnAbove.toFixed(2)} desc={"High Volume Node sipër — zona ku është tregtuar volum të paktën 1.5x mesatarja, tani MBI çmimin aktual. REZISTENCË e fortë sepse aty janë grumbulluar shumë blerës që duan të dalin në fitim. Idealisht: së paku 2% larg çmimit (hapësirë fitimi). Kujdes: brenda 1.2% = NO_CHASE — mos e ndjek çmimin, prit pullback ose thyerje të konfirmuar."} >
                        <span className="flex items-center gap-1">
                          <span className="text-muted-foreground">HVN↑</span>
                          <span className="font-mono text-muted-foreground">${vp.hvnAbove.toFixed(2)}</span>
                          {vp.resistanceAbove ? (
                            <span className="text-red-400 font-bold">⚠ resist</span>
                          ) : (
                            <span className="text-emerald-400">pastër</span>
                          )}
                        </span>
                      </MiniPopover>
                    )}
                  </div>
                  {/* Location + status badges */}
                  <div className="flex items-center gap-2 text-[10px]">
                    {vp.vpLocation && (
                      <MiniPopover label={"Location: " + vp.vpLocation.replace('_', ' ')} desc={"Vendndodhja e çmimit në raport me Value Area (70% volum, 20 ditë): IN VA = brenda zonës së pranuar — normale, balanced, entry më i sigurt. ABOVE VA = mbi zonë — moment i fortë por i zgjeruar, rrezik refuzimi; kërkon konfirmim volumi. BELOW VA = nën zonë — pranim i ulët, shmang long derisa kthehet në VA."} >
                        <span className="px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">
                          Location: {vp.vpLocation.replace('_', ' ')}
                        </span>
                      </MiniPopover>
                    )}
                    {vp.supportBelow && !vp.resistanceAbove && (
                      <MiniPopover label="VP_OK — Setup Ideal" desc={"Vlerësim POZITIV: ka mbështetje volumi të afërt poshtë (HVN/POC brenda 1.2%) DHE nuk ka rezistencë të afërt sipër. Konfigurimi IDEAL për hyrje long: risk-i i definuar qartë (stop afër mbështetjes) dhe hapësirë fitimi e pastër sipër. Idealisht: hyr me LIMIT ORDER në zonën e pullback."} >
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">
                          ✓ VP_OK
                        </span>
                      </MiniPopover>
                    )}
                    {vp.resistanceAbove && (
                      <MiniPopover label="⚠ NO_CHASE — Mos e Ndjek Çmimin" desc={"PARALAJMËRIM: ka rezistencë volumi (HVN ose VAH) brenda 1.2% SIPËR çmimit aktual. MOS e ndjek çmimin me market order — rreziku i refuzimit është i lartë. Idealisht: (1) prit pullback te mbështetja dhe hyj me limit order, ose (2) prit thyerje të konfirmuar me volum + mbyllje ditore mbi VAH."} >
                        <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-bold">
                          ⚠ NO_CHASE
                        </span>
                      </MiniPopover>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* No results */}
        {data.results.length === 0 && hasScanned && (
          <Card className="border-border/50 bg-muted/5">
            <CardContent className="py-6 text-center">
              <Target className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-[14px] text-muted-foreground font-medium">Asnje setup i pershtatshem</p>
              <p className="text-[13px] text-muted-foreground/60 mt-1.5 mb-4">Asnje aksion nuk kaloi te gjithe fazat e funnel-it.</p>
              {/* Diagnostic funnel breakdown */}
              <div className="inline-flex items-center gap-1.5 text-[12px] flex-wrap justify-center">
                <span className="text-blue-400">{data.funnel.universe} universe</span>
                <ArrowDown className="w-3 h-3 text-muted-foreground/30" />
                <span className={data.funnel.passedLiquidity === 0 ? 'text-red-400 font-bold' : 'text-cyan-400'}>{data.funnel.passedLiquidity} likuiditet</span>
                <ArrowDown className="w-3 h-3 text-muted-foreground/30" />
                <span className={data.funnel.passedTrend === 0 ? 'text-red-400 font-bold' : 'text-emerald-400'}>{data.funnel.passedTrend} trend</span>
                <ArrowDown className="w-3 h-3 text-muted-foreground/30" />
                <span className={data.funnel.passedSetup === 0 ? 'text-red-400 font-bold' : 'text-violet-400'}>{data.funnel.passedSetup} setup</span>
                <ArrowDown className="w-3 h-3 text-muted-foreground/30" />
                <span className="text-amber-400 font-bold">{data.funnel.passedRisk} risk gate</span>
              </div>
              {/* Bottleneck explanation */}
              <div className="mt-4 max-w-sm mx-auto">
                {data.funnel.passedLiquidity === 0 && (
                  <p className="text-[12px] text-red-400/80">Te dhenat nuk u morren mjaftueshem. Kontrollo API key.</p>
                )}
                {data.funnel.passedLiquidity > 0 && data.funnel.passedTrend === 0 && (
                  <p className="text-[12px] text-amber-400/80">Asnje aksion nuk eshte ne trend rrites — tregu mund te jete i dobet ose ne rije. Regjimi: {data.regimeOk ? 'OK' : 'JO OK'}.</p>
                )}
                {data.funnel.passedTrend > 0 && data.funnel.passedSetup === 0 && (
                  <p className="text-[12px] text-amber-400/80">{data.funnel.passedTrend} aksione ne trend, por asnje nuk ka pullback/breakout aktual. Pris nje pullback 2-8 ditesh.</p>
                )}
                {data.funnel.passedSetup > 0 && data.funnel.passedRisk === 0 && (
                  <p className="text-[12px] text-amber-400/80">{data.funnel.passedSetup} setup-i te gjithe u refuzuan nga risk gate (R:R me i ulet se 1:2, rreziqet e larte, ose regjimi jo OK). Provo perseri me vone.</p>
                )}
              </div>
              {!data.regimeOk && (
                <p className="text-[12px] text-red-400/70 mt-3">Regjimi i tregut nuk lejon long tani (SPY/QQQ jo mbi SMA 50/200).</p>
              )}
            </CardContent>
          </Card>
        )}
      </>)}

      {/* Ditar Top 10 — Trade Journal (vetëm kandidatët READY; detajet me kërkesë) */}
      <Top10JournalCard />

      {/* Strategy Reference (collapsed after scan) */}
      <Section title="Rregullat e Filtrit (Funnel Steps)" icon={Calculator} color="text-blue-400" defaultOpen={!hasScanned}>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="border-b border-border/50"><th className="pb-2 text-[13px] font-semibold text-muted-foreground w-36">Elementi</th><th className="pb-2 text-[13px] font-semibold text-muted-foreground">Rregulli</th></tr></thead>
            <tbody>{STRATEGY_RULES.map((r, i) => (
              <tr key={i} className="border-b border-border/30 last:border-0">
                <td className="py-3 pr-4"><div className="flex items-center gap-2"><r.icon className={`w-4 h-4 ${r.color} flex-shrink-0`} /><span className="font-semibold text-[13px] text-foreground">{r.element}</span></div></td>
                <td className="py-3 text-[13px] text-muted-foreground leading-relaxed">{r.rule}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Section>

      <Section title="Rregullat e Hyrjes" icon={Target} color="text-emerald-400" defaultOpen={false}>
        <ul className="space-y-2.5">{ENTRY_RULES.map((r, i) => (
          <li key={i} className="flex items-start gap-2.5"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /><span className="text-[13px] text-muted-foreground leading-relaxed">{r}</span></li>
        ))}</ul>
        <div className="mt-4 rounded-lg bg-blue-500/5 border border-blue-500/15 p-4">
          <div className="flex items-start gap-2.5"><BarChart3 className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" /><p className="text-[13px] text-blue-300/90 leading-relaxed"><strong>Shembull:</strong> NVDA mbi 50/200 SMA, SMH/QQQ bullish, bie 4d te 20 EMA me volum ne renie, pastaj mbyllet fort. Hyrja pak mbi high; stop nen swing-low. Nese distanca 4%, target 8% per R:R 1:2.</p></div>
        </div>
      </Section>

      <Section title="Cka te Mos Bejesh" icon={XCircle} color="text-red-400" defaultOpen={false}>
        <ul className="space-y-2.5">{DONT_RULES.map((r, i) => (
          <li key={i} className="flex items-start gap-2.5"><XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" /><span className="text-[13px] text-muted-foreground leading-relaxed">{r}</span></li>
        ))}</ul>
      </Section>

      <Section title="Si ta Perdorosh IBKR" icon={Zap} color="text-violet-400" defaultOpen={false}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg bg-violet-500/5 border border-violet-500/15 p-4"><p className="font-semibold text-[13px] text-violet-400 mb-1.5">Entry</p><p className="text-[13px] text-muted-foreground leading-relaxed">Entry Type A (Breakout): buy stop-limit pak mbi 20d high. Entry Type B (Pullback): buy limit ne cmimin aktual afër EMA20.</p></div>
          <div className="rounded-lg bg-violet-500/5 border border-violet-500/15 p-4"><p className="font-semibold text-[13px] text-violet-400 mb-1.5">Stop-Loss</p><p className="text-[13px] text-muted-foreground leading-relaxed">1.5 x ATR nen entry, ose nen swing-low minus 0.2 x ATR — cdofer eshte me i ngushte (me i larte). Stop struktural, jo perqindje arbitrare.</p></div>
          <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-4"><p className="font-semibold text-[13px] text-emerald-400 mb-1.5">Take-Profit</p><p className="text-[13px] text-muted-foreground leading-relaxed">Target 3R (shperblimi 3x rrezikun). Ne 1R shesh 25-50%, cosh stop-in ne breakeven. Target 2R = partial exit 2te. Target 3R = full exit.</p></div>
          <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 p-4"><p className="font-semibold text-[13px] text-amber-400 mb-1.5">Position Sizing</p><p className="text-[13px] text-muted-foreground leading-relaxed">1% risk per trade ($250 per $25K account). Shares = risk budget / (entry - stop). Max 2 aksione per sektor. Stop nuk leviz prapa.</p></div>
        </div>
      </Section>

      <Section title="Sistemi (NO_TRADE-first Gates)" icon={Layers} color="text-emerald-400" defaultOpen={false}>
        <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">Sistemi vepron vetem kur tregu, sektori dhe setup-i jane ne harmoni.</p>
        <div className="space-y-2">{SYSTEM_GATES.map((g, i) => (
          <div key={i} className="flex items-start gap-3 rounded-lg bg-muted/5 p-3">
            <g.icon className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
            <div><p className="font-semibold text-[13px] text-foreground">{g.gate}</p><p className="text-[13px] text-muted-foreground leading-relaxed">{g.desc}</p></div>
            <ArrowRight className="w-4 h-4 text-emerald-400/50 mt-1 flex-shrink-0" />
          </div>
        ))}</div>
      </Section>

      {/* Score formula reference */}
      <div className="border border-blue-500/20 rounded-lg px-4 py-3 bg-blue-500/5">
        <p className="text-[12px] text-blue-400/70 leading-relaxed">
          <strong>Score =</strong> 25% Trend Quality + 20% Relative Strength + 15% Momentum + 15% Volume Confirmation + 10% Setup Quality + 10% Fundamentals (placeholder) + 5% Risk Quality. Nje score i larte teknik nuk e kompensoj event-risk-un. Nje aksion me score 88 por earnings neserr marre <strong>EVENT_RISK</strong> ose <strong>NO_TRADE</strong>.
        </p>
      </div>
    </div>
  );
}
