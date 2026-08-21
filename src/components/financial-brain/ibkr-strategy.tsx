'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  Shield, TrendingUp, AlertTriangle, CheckCircle2, XCircle, Target,
  BarChart3, DollarSign, Clock, Layers, Zap, ArrowRight, Calculator,
  ChevronDown, ChevronUp, RefreshCw, Eye, EyeOff, Activity,
  Filter, ArrowDown, CircleDot, Info,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

// ── Types ──
type Decision = 'READY' | 'WATCHLIST' | 'NO_TRADE' | 'EVENT_RISK' | 'EXTENDED';

interface FunnelStock {
  symbol: string; price: number;
  avgVol20d: number; avgDolVol20d: number;
  passedLiquidity: boolean; passedTrend: boolean;
  trendScore: number; rsScore: number; momentumScore: number;
  volConfScore: number; setupScore: number; riskScore: number; totalScore: number;
  setup: 'PULLBACK' | 'BREAKOUT' | 'TREND_CONT' | 'NONE';
  horizon: string; rsi: number; atr: number; atrPct: number;
  volRatio: number; volDeclining: boolean; lastDaySpike: boolean;
  pullbackDays: number; pullbackPct: number;
  distFromEMA10: number; distFromEMA20: number;
  aboveSMA50: boolean; aboveSMA200: boolean; sma50Above200: boolean;
  rsVsSPY: number; rsVsQQQ: number; rsVsSPY60d: number;
  entry: number; stop: number; target1R: number; target2R: number;
  riskPct: number; rewardRiskRatio: number; swingLow: number;
  decision: Decision; reasons: string[]; warnings: string[];
}

interface FunnelResponse {
  scannedAt: string; regimeOk: boolean;
  regimeDetail: { spy: { above50: boolean; above200: boolean }; qqq: { above50: boolean; above200: boolean } };
  funnel: { universe: number; passedLiquidity: number; passedTrend: number; passedSetup: number; passedRisk: number; displayed: number; };
  results: FunnelStock[];
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
  { element: 'Filtri mekanik', icon: Filter, rule: 'Cmimi >= $10, Vol >= 1M, DolVol >= $20M, mbi SMA50, SMA50 > SMA200, RS > SPY', color: 'text-emerald-400' },
  { element: 'Analize teknike', icon: BarChart3, rule: 'Trend, momentum, RS, ATR, setup quality, volum konfirmim', color: 'text-blue-400' },
  { element: 'Event-risk gate', icon: AlertTriangle, rule: 'R:R >= 1:2, RSI 30-75, risk <= 8%, regjimi i tregut, jo extended', color: 'text-red-400' },
  { element: 'Top Stocks', icon: Target, rule: '5-10 kandidate me score me te larte, READY ose WATCHLIST', color: 'text-amber-400' },
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
  { gate: 'Trend + RS', desc: 'Mbi 50/200 SMA, RS > SPY ne 60d', icon: TrendingUp },
  { gate: 'Setup Quality', desc: 'Pullback/Breakout me volum, RSI, EMA proximity', icon: BarChart3 },
  { gate: 'Risk Gate', desc: 'R:R >= 1:2, risk <= 8%, RSI 30-75', icon: AlertTriangle },
  { gate: 'IBKR Bracket', desc: 'Entry + Stop + Take-profit automatik', icon: Target },
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
    title: '6. Top Stocks — Kandidatet Finale',
    icon: Target,
    desc: 'Keto jane 5-10 kompanite me score me te larte qe kane kaluar te gjithe funnel-in. Ato renditen sipas totalScore (0-100) dhe statusit (READY para WATCHLIST para EVENT_RISK). Secila ka Entry, Stop, Target 1R dhe Target 2R te llogaritur automatikisht.',
    ideal: 'READY = Gati per tregtim me rreziqet e percaktuara. WATCHLIST = Setup i mire por tregu ose kushtet nuk lejojne hyrje tani — vërehtu. EVENT_RISK = RSI i larte, rrezik kthimi.',
    why: 'Ne tregjtojme vetem keto kompani. Cdo gje tjeter eshte te dhena ose analize, por jo sinjal tregtimi.',
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

// ── Stock Card ──
function StockCard({ stock, rank }: { stock: FunnelStock; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const ds = DECISION_STYLE[stock.decision];
  const setupColor = stock.setup === 'PULLBACK' ? 'text-amber-400' : stock.setup === 'BREAKOUT' ? 'text-blue-400' : stock.setup === 'TREND_CONT' ? 'text-emerald-400' : 'text-muted-foreground';
  const setupBg = stock.setup === 'PULLBACK' ? 'bg-amber-500/15 border-amber-500/30' : stock.setup === 'BREAKOUT' ? 'bg-blue-500/15 border-blue-500/30' : 'bg-emerald-500/15 border-emerald-500/30';

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
            <div className={`text-2xl font-bold ${stock.totalScore >= 65 ? 'text-emerald-400' : stock.totalScore >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{stock.totalScore}</div>
            <div className="text-[12px] text-muted-foreground">Score</div>
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

        {/* Entry / Stop / Target */}
        <div className="mt-3 grid grid-cols-4 gap-2">
          <EntryBox label="ENTRY" value={stock.entry} color="text-blue-400" bg="bg-blue-500/5 border-blue-500/15" />
          <EntryBox label="STOP" value={stock.stop} color="text-red-400" bg="bg-red-500/5 border-red-500/15" />
          <EntryBox label="TARGET 1R" value={stock.target1R} color="text-emerald-400" bg="bg-emerald-500/5 border-emerald-500/15" />
          <EntryBox label="TARGET 2R" value={stock.target2R} color="text-emerald-400" bg="bg-emerald-500/5 border-emerald-500/20" />
        </div>

        {/* Quick stats row */}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
          <span>RSI <strong className={stock.rsi >= 40 && stock.rsi <= 65 ? 'text-emerald-400' : 'text-amber-400'}>{stock.rsi}</strong></span>
          <span>R:R <strong className={stock.rewardRiskRatio >= 2 ? 'text-emerald-400' : 'text-amber-400'}>1:{stock.rewardRiskRatio}</strong></span>
          <span>Risk <strong className={stock.riskPct <= 4 ? 'text-emerald-400' : stock.riskPct <= 6 ? 'text-amber-400' : 'text-red-400'}>{stock.riskPct}%</strong></span>
          <span>RS SPY <strong className={stock.rsVsSPY > 0 ? 'text-emerald-400' : 'text-red-400'}>{stock.rsVsSPY > 0 ? '+' : ''}{stock.rsVsSPY.toFixed(1)}%</strong></span>
          <span>ATR {stock.atrPct}%</span>
          <span>DolVol ${(stock.avgDolVol20d / 1e6).toFixed(0)}M</span>
        </div>

        {/* Reasons */}
        {stock.reasons.length > 0 && (
          <div className="mt-3 flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-blue-500/5 border border-blue-500/15">
            <CheckCircle2 className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="space-y-1 min-w-0">
              {stock.reasons.map((r, i) => <p key={i} className="text-[13px] text-blue-300/80 leading-relaxed">· {r}</p>)}
            </div>
          </div>
        )}

        {/* Warnings */}
        {stock.warnings.length > 0 && (
          <div className="mt-2 flex items-start gap-2.5 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/15">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="space-y-1 min-w-0">
              {stock.warnings.map((w, i) => <p key={i} className="text-[13px] text-amber-300/80 leading-relaxed">· {w}</p>)}
            </div>
          </div>
        )}

        {/* Expanded detail */}
        {expanded && (
          <div className="mt-3 border-t border-border/50 pt-3 space-y-2 text-[13px] text-muted-foreground">
            <div className="grid grid-cols-2 gap-2">
              <div>SMA 50: <span className={stock.aboveSMA50 ? 'text-emerald-400' : 'text-red-400'}>{stock.aboveSMA50 ? 'Mbi' : 'Nen'}</span></div>
              <div>SMA 200: <span className={stock.aboveSMA200 ? 'text-emerald-400' : 'text-red-400'}>{stock.aboveSMA200 ? 'Mbi' : 'Nen'}</span></div>
              <div>50/200: <span className={stock.sma50Above200 ? 'text-emerald-400' : 'text-red-400'}>{stock.sma50Above200 ? 'Golden' : 'Death'}</span></div>
              <div>ATR: ${stock.atr.toFixed(2)}</div>
              <div>Dist EMA10: {stock.distFromEMA10 > 0 ? '+' : ''}{stock.distFromEMA10.toFixed(1)}%</div>
              <div>Dist EMA20: {stock.distFromEMA20 > 0 ? '+' : ''}{stock.distFromEMA20.toFixed(1)}%</div>
              <div>RS vs QQQ: {stock.rsVsQQQ > 0 ? '+' : ''}{stock.rsVsQQQ.toFixed(1)}%</div>
              <div>RS 60d vs SPY: {stock.rsVsSPY60d > 0 ? '+' : ''}{stock.rsVsSPY60d.toFixed(1)}%</div>
              <div>Swing Low: ${stock.swingLow.toFixed(2)}</div>
              <div>Vol Ratio: {stock.volRatio}x</div>
            </div>
          </div>
        )}

        <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-center gap-1.5 mt-2.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {expanded ? 'Fshi detajet' : 'Shiko detajet'}
        </button>
      </CardContent>
    </Card>
  );
}

function ScoreCell({ label, value }: { label: string; value: number }) {
  const c = value >= 70 ? 'text-emerald-400' : value >= 50 ? 'text-amber-400' : 'text-red-400';
  return (
    <div className="rounded-md p-1.5 text-center bg-muted/5">
      <p className="text-[10px] text-muted-foreground font-medium">{label}</p>
      <p className={`text-[14px] font-bold ${c}`}>{value}</p>
    </div>
  );
}

function EntryBox({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`rounded-lg ${bg} border p-2.5 text-center`}>
      <p className={`text-[11px] ${color} font-medium`}>{label}</p>
      <p className={`text-[14px] font-bold ${color}`}>${value.toFixed(2)}</p>
    </div>
  );
}

// ── Regime Banner ──
function RegimeBanner({ data }: { data: FunnelResponse }) {
  const { regimeDetail, regimeOk } = data;
  return (
    <Card className={`${regimeOk ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Shield className={`w-5 h-5 ${regimeOk ? 'text-emerald-400' : 'text-red-400'} flex-shrink-0`} />
          <div className="flex-1">
            <p className={`text-[14px] font-semibold ${regimeOk ? 'text-emerald-400' : 'text-red-400'}`}>
              {regimeOk ? 'REGJIMI OK — Mund te besh Long Trades' : 'REGJIMI JO OK — Vetem WATCHLIST'}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[13px]">
              <span className="text-muted-foreground">SPY: <span className={regimeDetail.spy.above50 ? 'text-emerald-400' : 'text-red-400'}>{regimeDetail.spy.above50 ? 'Mbi 50' : 'Nen 50'}</span> · <span className={regimeDetail.spy.above200 ? 'text-emerald-400' : 'text-red-400'}>{regimeDetail.spy.above200 ? 'Mbi 200' : 'Nen 200'}</span></span>
              <span className="text-muted-foreground">QQQ: <span className={regimeDetail.qqq.above50 ? 'text-emerald-400' : 'text-red-400'}>{regimeDetail.qqq.above50 ? 'Mbi 50' : 'Nen 50'}</span> · <span className={regimeDetail.qqq.above200 ? 'text-emerald-400' : 'text-red-400'}>{regimeDetail.qqq.above200 ? 'Mbi 200' : 'Nen 200'}</span></span>
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
export function IBKRStrategy() {
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);

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

  return (
    <div className="space-y-4">
      {/* Overview */}
      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-emerald-500/15 rounded-lg p-2.5"><TrendingUp className="w-6 h-6 text-emerald-400" /></div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Strategjia: Trend Pullback Swing</h2>
              <p className="text-[13px] text-muted-foreground">Funnel: 200 → Liquidity → Trend → Setup → Risk Gate → 5-10 Top Stocks</p>
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
                <h3 className="text-[15px] font-bold text-foreground">Funnel Scanner — 200 Aksione</h3>
                <p className="text-[13px] text-muted-foreground">200 → likuiditet → trend → setup → risk gate → top stocks</p>
              </div>
            </div>
            <button onClick={runScan} disabled={loading} className="flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Duke skanuar...' : 'Rifresko'}
            </button>
          </div>
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
        <RegimeBanner data={data} />

        {/* Funnel */}
        {data.funnel && <FunnelViz funnel={data.funnel} />}

        {/* Scan time */}
        <div className="flex items-center gap-4 text-[13px] text-muted-foreground flex-wrap">
          <span><strong className="text-emerald-400">{readyStocks.length}</strong> READY</span>
          <span>·</span>
          <span><strong className="text-amber-400">{otherStocks.length}</strong> WATCHLIST / OTHER</span>
          {data.scannedAt && (<><span>·</span><span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{new Date(data.scannedAt).toLocaleTimeString('sq-AL')}</span></>)}
        </div>

        {/* READY stocks */}
        {readyStocks.length > 0 && (
          <div className="space-y-3">
            <p className="text-[13px] text-emerald-400 font-medium flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> READY — Kandidate per IBKR Bracket Order ({readyStocks.length})</p>
            {readyStocks.map((s, i) => <StockCard key={s.symbol} stock={s} rank={i + 1} />)}
          </div>
        )}

        {/* Other stocks */}
        {otherStocks.length > 0 && (
          <div className="space-y-3">
            <p className="text-[13px] text-amber-400 font-medium flex items-center gap-2"><Eye className="w-4 h-4" /> WATCHLIST / EVENT RISK ({otherStocks.length})</p>
            {otherStocks.map((s, i) => <StockCard key={s.symbol} stock={s} rank={readyStocks.length + i + 1} />)}
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
          <div className="rounded-lg bg-violet-500/5 border border-violet-500/15 p-4"><p className="font-semibold text-[13px] text-violet-400 mb-1.5">Entry</p><p className="text-[13px] text-muted-foreground leading-relaxed">Buy limit per pullback ose buy stop-limit per breakout.</p></div>
          <div className="rounded-lg bg-violet-500/5 border border-violet-500/15 p-4"><p className="font-semibold text-[13px] text-violet-400 mb-1.5">Stop-Loss</p><p className="text-[13px] text-muted-foreground leading-relaxed">Sipas struktures se chart-it, jo nje perqindje arbitrare.</p></div>
          <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-4"><p className="font-semibold text-[13px] text-emerald-400 mb-1.5">Take-Profit</p><p className="text-[13px] text-muted-foreground leading-relaxed">Target 2R; ne 1R shesh 25-50%, cosh stop-in ne breakeven.</p></div>
          <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 p-4"><p className="font-semibold text-[13px] text-amber-400 mb-1.5">Trailing Stop</p><p className="text-[13px] text-muted-foreground leading-relaxed">Vetem ne fitim, trend i forte. Stop-i nuk leviz prapa.</p></div>
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
