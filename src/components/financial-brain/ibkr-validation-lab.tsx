'use client';

// ═══════════════════════════════════════════════════════════════
// Task 27/28 — IBKR VALIDATION LAB (OOS Dashboard)
// Shtresa e validimit, ekzekutimit dhe kontrollit të rrezikut:
//
//   IBKR Validation
//   ├── In-Sample
//   ├── Out-of-Sample
//   ├── Walk-Forward
//   ├── Paper Trading
//   └── Live Performance
//
//   Task 28: Universe 120/300/400 · Kalendar earnings EDGAR (8-K 2.02)
//   · Testi A/B/C/D i Event Score · Popup ℹ️ për ÇDO tregues
// ═══════════════════════════════════════════════════════════════

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  FlaskConical, Play, RefreshCw, CheckCircle2, XCircle, MinusCircle,
  TrendingUp, TrendingDown, ShieldAlert, Gauge, Layers,
  DollarSign, BarChart3, AlertTriangle, Clock, Info, Timer, CalendarClock, GitCompare,
} from 'lucide-react';
import { useState, useCallback } from 'react';

// ── Tipet (në përputhje me src/lib/validation/) ──
interface MetricSet {
  trades: number; wins: number; losses: number; winRatePct: number;
  profitFactor: number; expectancy: number; avgR: number; netProfit: number;
  grossProfit: number; totalCosts: number; maxDrawdownPct: number;
  maxDrawdownDollars: number; avgHoldDays: number; returnPct: number; costDragPct: number;
}

interface VariantRow {
  key: 'baseline' | 'event-filter' | 'event-score' | 'full';
  label: string;
  description: string;
  is: MetricSet;
  oos: MetricSet;
}

interface Report {
  generatedAt: string;
  period: { from: string; to: string; days: number; isDays: number; oosDays: number };
  universe: { size: number; symbols: string[]; survivorship: { survivorPct: number; recommendedHaircutPct: number; note: string; knownDelistedExcluded: number } };
  equity: { startEquity: number; finalEquity: number };
  table: { inSample: MetricSet; outOfSample: MetricSet; walkForward: MetricSet; paper: MetricSet | null; live: MetricSet | null };
  walkForwardWindows: { window: number; from: string; to: string; trades: number; winRatePct: number; avgR: number; netProfit: number }[];
  scoreBuckets: { label: string; trades: number; winRatePct: number; avgR: number; netProfit: number }[];
  sectorStats: { sector: string; trades: number; winRatePct: number; avgR: number; netProfit: number }[];
  setupSplit: { setupType: string; trades: number; winRatePct: number; avgR: number; netProfit: number }[];
  costs: {
    totalCosts: number; commissionTotal: number; spreadTotal: number;
    slippageTotal: number; impactTotal: number; costDragPct: number;
  };
  execution: {
    signalsGenerated: number; entryOrdersRejected: number;
    rejectReasons: Record<string, number>; exitReasons: Record<string, number>;
  };
  gates: { gate: string; description: string; required: string; actual: string; passed: boolean | null }[];
  autoPause: { winRateDeviationPct: number; avgRDeviation: number; recommendation: 'OK' | 'MONITOR' | 'PAUSE'; note: string };
  topTrades: TradeRow[];
  worstTrades: TradeRow[];
  limitations: string[];
  variants: VariantRow[];
  eventScoreVerdict: {
    oosTradesDelta: number; oosExpectancyDelta: number; oosWinRateDelta: number;
    oosDrawdownDelta: number; keep: boolean; note: string;
  };
  earningsData: { symbolsWithTimeline: number; totalEvents: number; coveragePct: number; source: string };
}

interface TradeRow {
  symbol: string; sector: string; entryDate: string; exitDate: string;
  entryPrice: number; exitPrice: number; shares: number; exitReason: string;
  r: number; pnlNet: number; pnlGross: number; costs: number; score: number;
  scoreBreakdown: { trend: number; pullback: number; rs: number; volume: number; market: number; event: number; risk: number; final: number; max: number };
  setupType: string;
}

const fmt = (n: number, digits = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const sign = (n: number, digits = 0) => `${n >= 0 ? '+' : ''}${fmt(n, digits)}`;
const pnlColor = (n: number) => n >= 0 ? 'text-emerald-400' : 'text-red-400';

// ═══════════════════════════════════════════════════════════════
// DOKUMENTACIONI I TREGUESVE — për çdo metrikë: Çfarë është /
// Si është tani / A është mirë / Si duhet të jetë
// ═══════════════════════════════════════════════════════════════
type Verdict = 'good' | 'bad' | 'neutral';

interface MetricDoc {
  title: string;
  what: string;
  target: string;
  howNow: (r: Report) => string;
  isGood: (r: Report) => Verdict;
}

const METRIC_DOCS: Record<string, MetricDoc> = {
  trades: {
    title: 'Numri i tregtive',
    what: 'Sa tregti u mbyllën në periudhë. Është madhësia e kampionit statistikor: pa mjaftueshëm tregti, çdo win rate ose profit factor është zhurmë — 10 tregti fituese radhazi mund të jetë thjesht fat.',
    target: 'Minimumi statistik: ≥ 100 tregti në IS dhe ≥ 30 në OOS. Më pak se kaq → rezultati nuk është konkluziv, sido që të dalë numri.',
    howNow: (r) => `IS: ${r.table.inSample.trades} tregti · OOS: ${r.table.outOfSample.trades} · WF: ${r.table.walkForward.trades} · Paper: ${r.table.paper ? r.table.paper.trades : '—'}`,
    isGood: (r) => r.table.inSample.trades >= 100 && r.table.outOfSample.trades >= 30 ? 'good'
      : r.table.inSample.trades >= 40 ? 'neutral' : 'bad',
  },
  winRate: {
    title: 'Win rate',
    what: 'Përqindja e tregtive fituese. Vetëm nuk do të thotë asgjë — duhet lexuar bashkë me R mesatar dhe profit factor. Një sistem 40% WR që fiton 2.5R për fitore dhe humb 1R është shumë më i fortë se një 60% WR që fiton 0.3R.',
    target: '35-50% për trend-following me R/R 1:2 e më lart (si kjo strategji). Mbi 60% me fitime shumë të vogla është shenjë alarmi.',
    howNow: (r) => `IS: ${fmt(r.table.inSample.winRatePct, 1)}% · OOS: ${fmt(r.table.outOfSample.winRatePct, 1)}% · WF: ${fmt(r.table.walkForward.winRatePct, 1)}% · Paper: ${r.table.paper ? fmt(r.table.paper.winRatePct, 1) + '%' : '—'}`,
    isGood: (r) => r.table.outOfSample.winRatePct >= 35 && r.table.outOfSample.winRatePct <= 60 ? 'good' : 'neutral',
  },
  profitFactor: {
    title: 'Profit factor',
    what: 'Shuma e fitimeve pjesëtuar me shumën e humbjeve (bruto). PF 1.06 do të thotë: për çdo $100 humbje fiton $106 — një avantazh aq i hollë sa që ekzekutimi real mund ta fshijë. PF 2.0+ është avantazh i fortë dhe i qëndrueshëm.',
    target: 'Gate 1: ≥ 1.3 në IS · Gate 2: ≥ 1.1 në OOS. Nën 1.0 = strategjia humb para në periudhën përkatëse.',
    howNow: (r) => `IS: ${fmt(r.table.inSample.profitFactor, 2)} · OOS: ${fmt(r.table.outOfSample.profitFactor, 2)} · WF: ${fmt(r.table.walkForward.profitFactor, 2)}`,
    isGood: (r) => r.table.outOfSample.profitFactor >= 1.1 ? 'good' : r.table.outOfSample.profitFactor >= 1.0 ? 'neutral' : 'bad',
  },
  expectancy: {
    title: 'Expectancy për tregti',
    what: 'Sa dollarë pritet PËR TREGTI në mesatare, pas kostove të gjitha. Metrika e vërtetë e avantazhit: nëse është negative, strategjia humb para për çdo tregti që bën — sado të bukur të duket ndonjë fitore individuale.',
    target: 'Pozitiv në IS DHE në OOS. Me kapital $25K dhe risk 1%/tregti, mbi +$25/tregti në IS konsiderohet i mirë; OOS brenda 50% të IS.',
    howNow: (r) => `IS: ${sign(r.table.inSample.expectancy, 2)}$/tregti · OOS: ${sign(r.table.outOfSample.expectancy, 2)}$ · WF: ${sign(r.table.walkForward.expectancy, 2)}$`,
    isGood: (r) => r.table.outOfSample.expectancy > 0 ? 'good' : 'bad',
  },
  avgR: {
    title: 'R mesatar',
    what: 'R = rezultati i matshëm ndaj rrezikut fillestar (distanca entry→stop). +2R = fitoi dy herë rrezikun. R mesatar pozitiv do të thotë që fitimet e mëdha kompensojnë humbjet — pavarësisht nga win rate.',
    target: '≥ +0.20R në OOS. Nëse është 0 ose negativ, threshold-i i target/stop-it ose menaxhimi i daljes nuk punon.',
    howNow: (r) => `IS: ${sign(r.table.inSample.avgR, 2)}R · OOS: ${sign(r.table.outOfSample.avgR, 2)}R · WF: ${sign(r.table.walkForward.avgR, 2)}R`,
    isGood: (r) => r.table.outOfSample.avgR >= 0.2 ? 'good' : r.table.outOfSample.avgR >= 0 ? 'neutral' : 'bad',
  },
  netProfit: {
    title: 'Fitimi neto ($)',
    what: 'Fitimi kumulativ pas komisioneve, spread-it, slippage-it dhe market impact. Ky është numri që mbërrin në llogari — dallimi nga fitimi bruto është kosto e vërtetë e sistemit.',
    target: 'Pozitiv në IS DHE OOS. Vëreje koston totale kundrejt fitimit bruto — mbi 30% drag do të thotë që sistemit i duhet shpejtësi ekstreme ekzekutimi.',
    howNow: (r) => `IS: ${sign(r.table.inSample.netProfit)}$ · OOS: ${sign(r.table.outOfSample.netProfit)}$ · Drag i kostos: ${fmt(r.costs.costDragPct, 1)}% i fitimit bruto`,
    isGood: (r) => r.table.outOfSample.netProfit > 0 ? 'good' : 'bad',
  },
  maxDD: {
    title: 'Max drawdown %',
    what: 'Rënia maksimale nga kulmi i ekuilibrit deri në fund. Metrika e parë e mbijetesës: një drawdown 30% kërkon +43% për tu rikthyer; 50% kërkon +100%. Një sistem që të çon në -40% rrallë mbijeton te tregtari.',
    target: '≤ 15-20% me risk 1%/tregti. Mbi 25% → ose rreziku për tregti është i lartë, ose hyrjet janë tepër të korreluara (i njjëjti treg në të njëjtin moment).',
    howNow: (r) => `IS: ${fmt(r.table.inSample.maxDrawdownPct, 1)}% · OOS: ${fmt(r.table.outOfSample.maxDrawdownPct, 1)}% · WF: ${fmt(r.table.walkForward.maxDrawdownPct, 1)}%`,
    isGood: (r) => r.table.outOfSample.maxDrawdownPct <= 20 ? 'good' : r.table.outOfSample.maxDrawdownPct <= 25 ? 'neutral' : 'bad',
  },
  totalCosts: {
    title: 'Kosto totale ($)',
    what: 'Komisione + bid/ask spread + slippage + market impact për të gjitha tregtitë e periudhës. Kjo është pagesa e vërtetë për të luajtur lojën.',
    target: 'Drag i kostos ≤ 20-30% i fitimit bruto. Mbi 50% → strategjia punon për brokerin, jo për ty.',
    howNow: (r) => `Totali: -$${fmt(r.costs.totalCosts)} · ${fmt((r.table.inSample.trades + r.table.outOfSample.trades), 0)} tregti · mesatarisht -$${fmt(r.costs.totalCosts / Math.max(1, r.table.inSample.trades + r.table.outOfSample.trades), 2)}/tregti · drag: ${fmt(r.costs.costDragPct, 1)}%`,
    isGood: (r) => r.costs.costDragPct <= 30 ? 'good' : r.costs.costDragPct <= 50 ? 'neutral' : 'bad',
  },
  holdDays: {
    title: 'Ditë mesatare mbajtje',
    what: 'Kohëza mesatare entry→exit. Strategjia është swing: nëse del nën 3 ditë, ke bërë day-trading dhe kostot të masakrojnë; nëse mbi 20, s\'je më në pullback por në investim të bllokut.',
    target: '5-15 ditë për swing pullback (koha-stop i motorit: 20 ditë).',
    howNow: (r) => `IS: ${fmt(r.table.inSample.avgHoldDays, 1)} ditë · OOS: ${fmt(r.table.outOfSample.avgHoldDays, 1)} ditë`,
    isGood: (r) => r.table.outOfSample.avgHoldDays >= 3 && r.table.outOfSample.avgHoldDays <= 20 ? 'good' : 'neutral',
  },
  costCommission: {
    title: 'Komisionet (IBKR)',
    what: 'IBKR Fixed: $0.005 për aksion, minimum $1 për urdhër, maksimum 1% e vlerës. Dy urdhra për tregti (hyrje + dalje) — prandaj tregtitë e vogla paguajnë më shumë në përqindje.',
    target: 'Varet nga madhësia mesatare e pozicionit — me pozicione > $3-5K duhet të mbetet ~0.02-0.05% e vlerës.',
    howNow: (r) => `Totali: -$${fmt(r.costs.commissionTotal)} për periudhën`,
    isGood: () => 'neutral',
  },
  costSpread: {
    title: 'Bid/Ask spread',
    what: 'Gjysma e distancës bid-ask e paguar në hyrje dhe dalje, estimuar nga ADV (vëllimi mesatar dollaror). Aksionet e ngadaltë kanë spread të gjerë — universi i scanner-it i largon këto.',
    target: 'Së bashku me slippage-in, nën ~0.10% të çmimit për emrat likuidë.',
    howNow: (r) => `Totali: -$${fmt(r.costs.spreadTotal)} për periudhën`,
    isGood: () => 'neutral',
  },
  costSlippage: {
    title: 'Slippage',
    what: 'Diferenca midis çmimit të dëshiruar dhe atij të marrë: 4 bps bazë + 1.2bps për çdo 1% ATR. Urdhrat limit e ulin, por i lasin të pambushura — modeli i ekzekutimit i simulton të dyja.',
    howNow: (r) => `Totali: -$${fmt(r.costs.slippageTotal)} për periudhën`,
    target: 'Kontrollohet në Gate 5: kosto totale e ekzekutimit ≤ 0.35% e pozicionit.',
    isGood: () => 'neutral',
  },
  costImpact: {
    title: 'Market impact',
    what: 'Kur pozicioni yt është i madh kundrejt likuiditetit, vetë tregtia yt e lëviz çmimin kundër teje. Modeli: ~10% e raportit pozicion/ADV.',
    howNow: (r) => `Totali: -$${fmt(r.costs.impactTotal)} për periudhën`,
    target: 'I papërfillshëm me pozicione < 1% të ADV (me $25K kapital pothuajse gjithmonë i tillë).',
    isGood: () => 'neutral',
  },
  costTotal: {
    title: 'Kosto totale e ekzekutimit',
    what: 'Shuma e të katër komponentëve për çdo tregti. Është arsyeja pse shumica e strategjive që duken fituese në Excel dështojnë në treg të vërtetë.',
    howNow: (r) => `Drag total: ${fmt(r.costs.costDragPct, 1)}% i fitimit bruto`,
    target: 'Drag ≤ 20-30%; nëse është mbi 50%, vetëm HFT-ja e shpëton avantazhin.',
    isGood: (r) => r.costs.costDragPct <= 30 ? 'good' : r.costs.costDragPct <= 50 ? 'neutral' : 'bad',
  },
  eventScore: {
    title: 'Event Score (testi A/B/C/D)',
    what: 'Pikët e eventeve mbi score-in bazë: earnings brenda 2 ditëve -3 · 3-7 ditë -1 · surprise pozitiv + drift (PEAD) +2 · surprise pozitiv pa drift +1 · surprise negativ -2. Testi izolon kontributin: A pa event → B vetëm bllokimi → C + surprise/PEAD → D + gjithë filtrat IBKR.',
    target: 'Nëse Event Score ul numrin e tregtive POR rrit expectancy-n dhe ul drawdown-in në OOS → ia vlen të mbahet. Përndryshe është kompleksitet pa pagesë.',
    howNow: (r) => {
      const a = r.variants.find(v => v.key === 'baseline');
      const c = r.variants.find(v => v.key === 'event-score');
      if (!a || !c) return 'Pa të dhëna';
      return `OOS: A ${a.oos.trades} tregti / ${sign(a.oos.expectancy, 2)}$ → C ${c.oos.trades} tregti / ${sign(c.oos.expectancy, 2)}$`;
    },
    isGood: (r) => r.eventScoreVerdict.keep ? 'good' : 'neutral',
  },
  variantsABCD: {
    title: 'Testi A/B/C/D',
    what: 'Katër versione të të njëjtave të dhëna e të njëjtash rregullash bazë: A bërthama Trend+Pullback, B shmang earnings e afërta, C shton surprise/PEAD, D shton gjithë filtrat IBKR (breadth, RS, regjim, RSI>70). Dallimi midis versioneve tregon saktësisht ÇFARË e përmirëson dhe çfarë dëmton.',
    target: 'Versioni përfundimtar duhet të jetë ai me expectancy-n më të lartë OOS, jo ai me fitimin më të madh IS.',
    howNow: (r) => r.variants.map(v => `${v.label.split(' ')[0]}: OOS ${sign(v.oos.netProfit)}$ / ${sign(v.oos.expectancy, 2)}$`).join(' · '),
    isGood: (r) => {
      const d = r.variants.find(v => v.key === 'full');
      return d && d.oos.expectancy > 0 ? 'good' : 'neutral';
    },
  },
  universeInfo: {
    title: 'Universi & funnel-i',
    what: `300-400 emra skanohen → likuiditeti i lë ~250 → trend-i i lë ~80 → setup-i ~70 → gates e lënë top 5-10 në ditë → ekzekutohen vetëm 3-5 pozicione njëkohësisht (max 2 për sektor). Zgjerimi i universit shton statistikë pa shtuar rrezik — pozicionet mbeten të njëjta.`,
    target: '300 emra për balancë statistikë/shpejtësi (400 është max praktik i listës).',
    howNow: (r) => `Aktual: ${r.universe.size} emra · mbijetuesit ${fmt(r.universe.survivorship.survivorPct, 1)}% · ${r.universe.survivorship.knownDelistedExcluded} delistuar përjashtohen`,
    isGood: () => 'neutral',
  },
  autoPauseDoc: {
    title: 'AUTO-PAUSE (kontrolli i devijimit)',
    what: 'Krahason performancën OOS me IS: nëse live/WF bie shumë, strategjia është ose tepër e optimizuar ose avantazhi ka vdekur. Sistemi rekomandon OK / MONITOR / PAUSE para se ti besosh numrave.',
    target: 'Devijim win rate IS→OOS brenda 10 pikëve. Mbi -20 pikë = PAUSE (mos tregto live).',
    howNow: (r) => `Devijimi: ${sign(r.autoPause.winRateDeviationPct, 1)} pk win rate · ${sign(r.autoPause.avgRDeviation, 2)}R · Rekomandimi: ${r.autoPause.recommendation}`,
    isGood: (r) => r.autoPause.recommendation === 'OK' ? 'good' : r.autoPause.recommendation === 'MONITOR' ? 'neutral' : 'bad',
  },
  scoreBuckets: {
    title: 'Performanca sipas score-it',
    what: 'A janë sinjalet me score 85+ vërtet më të mira se ato 45-54? Nëse jo, score-i nuk është i lidhur me rezultatin — dhe nuk ka pse ti besohet Top 10 e scanner-it.',
    target: 'WR dhe R mesatar në rritje monotone nga bucket-i i poshtëm te i epërmi.',
    howNow: (r) => r.scoreBuckets.map(b => `${b.label.split(' ')[0]}: ${b.trades}t ${fmt(b.winRatePct, 0)}% ${sign(b.avgR, 1)}R`).join(' · '),
    isGood: () => 'neutral',
  },
  pipeline: {
    title: 'Pipeline: 6 gates',
    what: 'Rruga e kërkuar para çdo urdhri real: backtest pozitiv → OOS pozitiv → walk-forward → 50-100 paper trades → kontroll slippage → LIVE me gjysmën e rrezikut (0.25%). Çdo gate i dështuar ndalon procesin — jo "ta kalojmë dhe shohim".',
    target: 'Të 5 gates e para KALUAR; gate 6 vetëm me vendim manual.',
    howNow: (r) => r.gates.map(g => `${g.gate.split('.')[0]}:${g.passed === true ? '✓' : g.passed === false ? '✗' : '—'}`).join(' '),
    isGood: (r) => r.gates.filter(g => g.passed === false).length === 0 ? 'good' : 'neutral',
  },
};

// ═══════════════════════════════════════════════════════════════
// POPUP PËR ÇDO TREGUES — 4 seksione
// ═══════════════════════════════════════════════════════════════
function PopupSection({ label, text, accent }: { label: string; text: string; accent?: string }) {
  return (
    <div className="rounded-md bg-muted/5 border border-border/40 px-2.5 py-2">
      <p className={`text-[10px] font-bold uppercase tracking-wide ${accent || 'text-violet-400'}`}>{label}</p>
      <p className="text-[11.5px] text-foreground/90 leading-relaxed mt-0.5">{text}</p>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const map = {
    good: { label: 'Po — brenda pragut', cls: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
    bad: { label: 'Jo — nën pragun', cls: 'text-red-400 border-red-500/30 bg-red-500/10' },
    neutral: { label: 'Kufizuar — prit më shumë të dhëna', cls: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
  } as const;
  const v = map[verdict];
  return <span className={`inline-block rounded-md border px-2 py-0.5 text-[10.5px] font-semibold ${v.cls}`}>{v.label}</span>;
}

function MetricInfoPopup({ metricKey, report }: { metricKey: string; report: Report }) {
  const doc = METRIC_DOCS[metricKey];
  if (!doc) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={`Shpjegim: ${doc.title}`}
          className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full text-muted-foreground/60 hover:text-violet-400 hover:bg-violet-500/10 transition-colors flex-shrink-0"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-[380px] p-0 z-50">
        <div className="space-y-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12.5px] font-bold text-foreground">{doc.title}</p>
            <VerdictBadge verdict={doc.isGood(report)} />
          </div>
          <PopupSection label="Çfarë është" text={doc.what} />
          <PopupSection label="Si është tani" text={doc.howNow(report)} accent="text-blue-400" />
          <PopupSection label="Si duhet të jetë" text={doc.target} accent="text-emerald-400" />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function GateIcon({ passed }: { passed: boolean | null }) {
  if (passed === true) return <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
  if (passed === false) return <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />;
  return <MinusCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />;
}

function MetricCell({ value, invert = false }: { value: number | string; invert?: boolean }) {
  if (typeof value === 'string') return <span className="text-muted-foreground">{value}</span>;
  const good = invert ? value <= 0 : value >= 0;
  return (
    <span className={good ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
      {fmt(value, Math.abs(value) < 100 ? 2 : 0)}
    </span>
  );
}

export function IBKRValidationLab() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [universe, setUniverse] = useState(300);

  const runBacktest = useCallback(async (force = false, uni = 300) => {
    setLoading(true); setError(null); setElapsed(0);
    const t0 = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    try {
      const res = await fetch(`/api/ibkr-backtest?universe=${uni}&years=5${force ? '&force=1' : ''}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gabim në backtest');
      setReport(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gabim rrjeti');
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  }, []);

  const t = report?.table;

  const variantCols = report?.variants ?? [];

  return (
    <Card className="border-violet-500/20 bg-violet-500/5">
      <CardContent className="p-5">
        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-violet-500/15 rounded-lg p-2.5">
              <FlaskConical className="w-6 h-6 text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">IBKR Validation Lab</h2>
              <p className="text-[13px] text-muted-foreground">
                Backtest → Out-of-Sample → Walk-Forward → Paper → Live — shtresa e validimit të strategjisë
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Selektori i universit (Task 28): 300 skanohen → 3-5 tregtohen */}
            <div className="flex items-center rounded-md border border-border/60 overflow-hidden">
              {[120, 300, 400].map(u => (
                <button
                  key={u}
                  onClick={() => {
                    setUniverse(u);
                    if (report) runBacktest(false, u);
                  }}
                  disabled={loading}
                  className={`px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors disabled:opacity-50 ${
                    universe === u
                      ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'}`}
                >
                  {u} emra
                </button>
              ))}
            </div>
            <button
              onClick={() => report ? runBacktest(true, universe) : runBacktest(false, universe)}
              disabled={loading}
              className="flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-md bg-violet-500/10 border border-violet-500/30 text-violet-400 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {loading ? `Duke ekzekutuar... ${elapsed}s` : report ? 'Rifresko (rindiz)' : `Ndez Backtest-in (5v, ${universe} emra)`}
            </button>
          </div>
        </div>

        {loading && (
          <div className="space-y-2 py-6">
            <div className="flex items-center justify-center gap-2 text-[13px] text-violet-300 mb-3">
              <Timer className="w-4 h-4 animate-pulse" />
              <span>
                {universe} emra × 5 vjet (Yahoo) + kalendar earnings (EDGAR 8-K) + 4 variante IS/OOS + Walk-Forward
                — hera e parë ~2-4 min, më pas 6 orë cache
              </span>
            </div>
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[13px] font-semibold text-red-400">Gabim gjatë backtest-it</p>
              <p className="text-[12px] text-muted-foreground mt-1">{error}</p>
              <button onClick={() => runBacktest(true, universe)} className="mt-2 text-[12px] text-red-300 underline">Provo përsëri</button>
            </div>
          </div>
        )}

        {!loading && !report && !error && (
          <div className="py-6 text-center">
            <p className="text-[14px] text-muted-foreground">
              Strategjia ekzistuese ka vetëm skanimin live — pa ditari historik të testimit.
            </p>
            <p className="text-[13px] text-muted-foreground/70 mt-1.5 max-w-2xl mx-auto">
              Ky laborator zbaton <strong className="text-foreground">të njëjtën logjikë të skanerit</strong> (filtra → score → bracket order)
              mbi 5 vitet e fundit, me ekzekutim realist (hyrje në qirinë pasues, gap risk, supozime konservatore),
              kostot e vërteta (komisione + spread + slippage), <strong className="text-foreground">kalendar historik earnings nga SEC EDGAR</strong> (point-in-time)
              dhe ndarje In-Sample / Out-of-Sample / Walk-Forward + testin A/B/C/D të Event Score.
            </p>
          </div>
        )}

        {/* ═══════════ RAPORTI ═══════════ */}
        {!loading && report && t && (
          <div className="space-y-5">
            {/* ── Pipeline Gates ── */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <Layers className="w-4 h-4 text-violet-400" />
                <h3 className="text-[14px] font-bold text-foreground">Pipeline: Backtest → OOS → Walk-Forward → Paper → Live</h3>
                <MetricInfoPopup metricKey="pipeline" report={report} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {report.gates.map((g, i) => (
                  <div key={i} className={`rounded-lg border p-3 flex items-start gap-2.5 ${
                    g.passed === true ? 'border-emerald-500/25 bg-emerald-500/5'
                    : g.passed === false ? 'border-red-500/25 bg-red-500/5'
                    : 'border-amber-500/25 bg-amber-500/5'}`}>
                    <GateIcon passed={g.passed} />
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold text-foreground">{g.gate}</p>
                      <p className="text-[11.5px] text-muted-foreground leading-snug mt-0.5">{g.description}</p>
                      <p className="text-[11.5px] mt-1">
                        <span className="text-muted-foreground">Aktual: </span>
                        <span className={g.passed === true ? 'text-emerald-400' : g.passed === false ? 'text-red-400' : 'text-amber-400'}>{g.actual}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── AUTO-PAUSE banner ── */}
            <div className={`rounded-lg border p-3.5 flex items-start gap-2.5 ${
              report.autoPause.recommendation === 'PAUSE' ? 'border-red-500/30 bg-red-500/10'
              : report.autoPause.recommendation === 'MONITOR' ? 'border-amber-500/30 bg-amber-500/10'
              : 'border-emerald-500/25 bg-emerald-500/5'}`}>
              <ShieldAlert className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                report.autoPause.recommendation === 'PAUSE' ? 'text-red-400'
                : report.autoPause.recommendation === 'MONITOR' ? 'text-amber-400' : 'text-emerald-400'}`} />
              <div className="flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-[13px] font-semibold text-foreground">
                    AUTO-PAUSE: {report.autoPause.recommendation}
                    <span className="ml-2 text-[12px] font-normal text-muted-foreground">
                      devijim IS→OOS: {sign(report.autoPause.winRateDeviationPct, 1)} pk win rate · {sign(report.autoPause.avgRDeviation, 2)}R
                    </span>
                  </p>
                  <MetricInfoPopup metricKey="autoPauseDoc" report={report} />
                </div>
                <p className="text-[12px] text-muted-foreground leading-relaxed mt-1">{report.autoPause.note}</p>
              </div>
            </div>

            {/* ── Tabela kryesore IS / OOS / WF / Paper / Live ── */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <BarChart3 className="w-4 h-4 text-violet-400" />
                <h3 className="text-[14px] font-bold text-foreground">Metrikat kryesore</h3>
                <span className="text-[11.5px] text-muted-foreground">
                  IS {report.period.isDays}d · OOS {report.period.oosDays}d · {report.period.from} → {report.period.to}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[760px]">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="pb-2 text-[12px] font-semibold text-muted-foreground">Metrika</th>
                      <th className="pb-2 text-[12px] font-semibold text-blue-400">In-Sample</th>
                      <th className="pb-2 text-[12px] font-semibold text-amber-400">Out-of-Sample</th>
                      <th className="pb-2 text-[12px] font-semibold text-violet-400">Walk-Forward</th>
                      <th className="pb-2 text-[12px] font-semibold text-cyan-400">Paper</th>
                      <th className="pb-2 text-[12px] font-semibold text-emerald-400">Live</th>
                    </tr>
                  </thead>
                  <tbody className="text-[12.5px]">
                    {[
                      { label: 'Tregti', key: 'trades', get: (m: MetricSet) => <MetricCell value={m.trades} /> },
                      { label: 'Win rate', key: 'winRate', get: (m: MetricSet) => <MetricCell value={m.winRatePct >= 0 ? m.winRatePct : 0} /> },
                      { label: 'Profit factor', key: 'profitFactor', get: (m: MetricSet) => <span className="font-semibold text-foreground">{fmt(m.profitFactor, 2)}</span> },
                      { label: 'Expectancy / tregti', key: 'expectancy', get: (m: MetricSet) => <MetricCell value={m.expectancy} /> },
                      { label: 'R mesatar', key: 'avgR', get: (m: MetricSet) => <MetricCell value={m.avgR} /> },
                      { label: 'Fitimi neto ($)', key: 'netProfit', get: (m: MetricSet) => <MetricCell value={m.netProfit} /> },
                      { label: 'Max drawdown %', key: 'maxDD', get: (m: MetricSet) => <span className="text-red-400 font-semibold">{fmt(m.maxDrawdownPct, 1)}%</span> },
                      { label: 'Kosto totale ($)', key: 'totalCosts', get: (m: MetricSet) => <span className="text-amber-400/80 font-semibold">{fmt(m.totalCosts)}</span> },
                      { label: 'Ditë mesatar mbajtje', key: 'holdDays', get: (m: MetricSet) => <span className="text-foreground">{fmt(m.avgHoldDays, 1)}</span> },
                    ].map((row, ri) => (
                      <tr key={ri} className="border-b border-border/30 last:border-0">
                        <td className="py-2 pr-3">
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            {row.label}
                            <MetricInfoPopup metricKey={row.key} report={report} />
                          </span>
                        </td>
                        <td className="py-2 pr-3">{row.get(t.inSample)}</td>
                        <td className="py-2 pr-3">{row.get(t.outOfSample)}</td>
                        <td className="py-2 pr-3">{row.get(t.walkForward)}</td>
                        <td className="py-2 pr-3">{t.paper ? row.get(t.paper) : <span className="text-muted-foreground/50">—</span>}</td>
                        <td className="py-2 pr-3"><span className="text-muted-foreground/50">—</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-muted-foreground/70 mt-2">
                Kolona Paper mbushet nga journal-i Top10 i skanerit (kërkon ≥ 50 rezultate të gjurmuara); Live aktivizohet pasi kalohen gates 1-5.
                Kliko ℹ️ për shpjegimin e çdo treguesi.
              </p>
            </div>

            {/* ═══ TESTI A/B/C/D I EVENT SCORE (Task 28) ═══ */}
            <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <GitCompare className="w-4 h-4 text-cyan-400" />
                <h3 className="text-[14px] font-bold text-foreground">Testi A/B/C/D — ndikimi i Event Score</h3>
                <MetricInfoPopup metricKey="variantsABCD" report={report} />
                <span className="text-[11px] text-muted-foreground">
                  Kalendar real earnings: {report.earningsData.symbolsWithTimeline} simbole me timeline EDGAR · {report.earningsData.totalEvents} events 8-K Item 2.02 ({fmt(report.earningsData.coveragePct, 0)}% mbulim)
                </span>
              </div>
              <p className="text-[11.5px] text-muted-foreground mb-3">
                Të njëjtat të dhëna, të njëjtat rregulla bazë — secili version shton VETËM një shtresë: kështu dallohet saktësisht çfarë e përmirëson.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[720px]">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Metrika</th>
                      {variantCols.map(v => (
                        <th key={v.key} className="pb-2 text-[11.5px] font-semibold text-cyan-400">
                          {v.label}
                          <span className="block text-[9.5px] font-normal text-muted-foreground/70 leading-tight mt-0.5 max-w-[170px]">{v.description}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="text-[12px]">
                    {([
                      { label: 'Tregti', get: (m: MetricSet) => fmt(m.trades) },
                      { label: 'Win rate', get: (m: MetricSet) => `${fmt(m.winRatePct, 1)}%` },
                      { label: 'Profit factor', get: (m: MetricSet) => fmt(m.profitFactor, 2) },
                      { label: 'Expectancy / tregti', get: (m: MetricSet) => `${sign(m.expectancy, 2)}$` },
                      { label: 'R mesatar', get: (m: MetricSet) => `${sign(m.avgR, 2)}R` },
                      { label: 'Fitimi neto', get: (m: MetricSet) => `${sign(m.netProfit)}$` },
                      { label: 'Max drawdown', get: (m: MetricSet) => `${fmt(m.maxDrawdownPct, 1)}%` },
                    ] as { label: string; get: (m: MetricSet) => string }[]).map((row, ri) => (
                      <tr key={ri} className="border-b border-border/30 last:border-0">
                        <td className="py-1.5 pr-3 text-muted-foreground">{row.label}</td>
                        {variantCols.map(v => {
                          const isNeg = row.label === 'Max drawdown';
                          const good = row.label === 'Max drawdown' ? v.oos.maxDrawdownPct <= 20 : v.oos.netProfit >= 0;
                          return (
                            <td key={v.key} className="py-1.5 pr-3">
                              <span className="block text-foreground">{row.get(v.is)} <span className="text-[9.5px] text-muted-foreground/60">IS</span></span>
                              <span className={`block font-semibold ${good ? (isNeg ? 'text-emerald-400' : 'text-emerald-400') : 'text-red-400'}`}>
                                {row.get(v.oos)} <span className="text-[9.5px] text-muted-foreground/60 font-normal">OOS</span>
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Verdikti i Event Score */}
              <div className={`mt-3 rounded-lg border p-3 flex items-start gap-2.5 ${
                report.eventScoreVerdict.keep ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-amber-500/25 bg-amber-500/5'}`}>
                <CalendarClock className={`w-5 h-5 mt-0.5 flex-shrink-0 ${report.eventScoreVerdict.keep ? 'text-emerald-400' : 'text-amber-400'}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-[12.5px] font-bold text-foreground">
                      Event Score: {report.eventScoreVerdict.keep ? 'IA VLEN të mbahet' : 'NUK justifikohet në këto të dhëna'}
                    </p>
                    <MetricInfoPopup metricKey="eventScore" report={report} />
                  </div>
                  <p className="text-[11.5px] text-muted-foreground leading-relaxed mt-0.5">{report.eventScoreVerdict.note}</p>
                  <div className="flex flex-wrap gap-3 mt-1.5 text-[11px]">
                    <span className="text-muted-foreground">Tregti OOS (C vs A): <strong className={report.eventScoreVerdict.oosTradesDelta <= 0 ? 'text-blue-400' : 'text-amber-400'}>{sign(report.eventScoreVerdict.oosTradesDelta)}</strong></span>
                    <span className="text-muted-foreground">Expectancy: <strong className={pnlColor(report.eventScoreVerdict.oosExpectancyDelta)}>{sign(report.eventScoreVerdict.oosExpectancyDelta, 2)}$</strong></span>
                    <span className="text-muted-foreground">Win rate: <strong className={pnlColor(report.eventScoreVerdict.oosWinRateDelta)}>{sign(report.eventScoreVerdict.oosWinRateDelta, 1)} pk</strong></span>
                    <span className="text-muted-foreground">Drawdown: <strong className={pnlColor(report.eventScoreVerdict.oosDrawdownDelta)}>{sign(report.eventScoreVerdict.oosDrawdownDelta, 1)} pk</strong></span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* ── Walk-Forward windows ── */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <Gauge className="w-4 h-4 text-violet-400" />
                  <h3 className="text-[14px] font-bold text-foreground">Walk-Forward (4 dritare OOS)</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Dritarja</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Periudha</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Tregti</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">WR%</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">R</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Neto $</th>
                      </tr>
                    </thead>
                    <tbody className="text-[12px]">
                      {report.walkForwardWindows.map((w) => (
                        <tr key={w.window} className="border-b border-border/30 last:border-0">
                          <td className="py-1.5 text-violet-400 font-semibold">WF{w.window}</td>
                          <td className="py-1.5 text-muted-foreground">{w.from.slice(0, 7)} → {w.to.slice(0, 7)}</td>
                          <td className="py-1.5 text-foreground">{w.trades}</td>
                          <td className={`py-1.5 font-semibold ${w.winRatePct >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(w.winRatePct, 1)}%</td>
                          <td className={`py-1.5 font-semibold ${pnlColor(w.avgR)}`}>{sign(w.avgR, 2)}</td>
                          <td className={`py-1.5 font-semibold ${pnlColor(w.netProfit)}`}>{sign(w.netProfit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-muted-foreground/70 mt-1.5">
                  Parametrat nuk ndryshohen gjatë OOS — çdo dritare teston stabilitetin në kohë.
                </p>
              </div>

              {/* ── Rezultatet sipas score-it ── */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <TrendingUp className="w-4 h-4 text-violet-400" />
                  <h3 className="text-[14px] font-bold text-foreground">Performanca sipas score-it</h3>
                  <MetricInfoPopup metricKey="scoreBuckets" report={report} />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Score</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Tregti</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">WR%</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">R</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Neto $</th>
                      </tr>
                    </thead>
                    <tbody className="text-[12px]">
                      {report.scoreBuckets.map((b) => (
                        <tr key={b.label} className="border-b border-border/30 last:border-0">
                          <td className="py-1.5 text-foreground font-semibold">{b.label}</td>
                          <td className="py-1.5 text-foreground">{b.trades}</td>
                          <td className={`py-1.5 font-semibold ${b.winRatePct >= 50 ? 'text-emerald-400' : b.trades > 0 ? 'text-red-400' : 'text-muted-foreground/50'}`}>
                            {b.trades > 0 ? `${fmt(b.winRatePct, 1)}%` : '—'}
                          </td>
                          <td className={`py-1.5 font-semibold ${pnlColor(b.avgR)}`}>{b.trades > 0 ? sign(b.avgR, 2) : '—'}</td>
                          <td className={`py-1.5 font-semibold ${pnlColor(b.netProfit)}`}>{b.trades > 0 ? sign(b.netProfit) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-muted-foreground/70 mt-1.5">
                  Kështu shihet nëse sinjalet me score të lartë janë vërtet më të mira apo vetëm duken më të mira.
                </p>
              </div>

              {/* ── Sipas sektorit ── */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <Layers className="w-4 h-4 text-violet-400" />
                  <h3 className="text-[14px] font-bold text-foreground">Sipas sektorit</h3>
                </div>
                <div className="overflow-x-auto max-h-56 overflow-y-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Sektori</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Tregti</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">WR%</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">R</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Neto $</th>
                      </tr>
                    </thead>
                    <tbody className="text-[12px]">
                      {report.sectorStats.map((s) => (
                        <tr key={s.sector} className="border-b border-border/30 last:border-0">
                          <td className="py-1.5 text-foreground font-semibold">{s.sector}</td>
                          <td className="py-1.5 text-foreground">{s.trades}</td>
                          <td className={`py-1.5 font-semibold ${s.winRatePct >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(s.winRatePct, 1)}%</td>
                          <td className={`py-1.5 font-semibold ${pnlColor(s.avgR)}`}>{sign(s.avgR, 2)}</td>
                          <td className={`py-1.5 font-semibold ${pnlColor(s.netProfit)}`}>{sign(s.netProfit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Continuation vs fade + ekzekutimi ── */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <TrendingDown className="w-4 h-4 text-violet-400" />
                  <h3 className="text-[14px] font-bold text-foreground">Continuation kundrejt fade</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Setup-i</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Tregti</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">WR%</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">R</th>
                        <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Neto $</th>
                      </tr>
                    </thead>
                    <tbody className="text-[12px]">
                      {report.setupSplit.map((s) => (
                        <tr key={s.setupType} className="border-b border-border/30 last:border-0">
                          <td className="py-1.5 text-foreground font-semibold">{s.setupType}</td>
                          <td className="py-1.5 text-foreground">{s.trades}</td>
                          <td className={`py-1.5 font-semibold ${s.winRatePct >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(s.winRatePct, 1)}%</td>
                          <td className={`py-1.5 font-semibold ${pnlColor(s.avgR)}`}>{sign(s.avgR, 2)}</td>
                          <td className={`py-1.5 font-semibold ${pnlColor(s.netProfit)}`}>{sign(s.netProfit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Exit reasons */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {Object.entries(report.execution.exitReasons).map(([r, n]) => (
                    <Badge key={r} variant="outline" className={`text-[10.5px] ${
                      r.includes('TARGET') ? 'border-emerald-500/30 text-emerald-400'
                      : r.includes('STOP') ? 'border-red-500/30 text-red-400'
                      : 'border-border/50 text-muted-foreground'}`}>
                      {r.replace('_', ' ')}: {n}
                    </Badge>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground/70 mt-1.5">
                  GAP_STOP = hapur nën stop (humbje përtej stopit) · GAP_TARGET = hapur mbi target.
                  Nëse stop dhe target preken në të njëjtin qiri → supozimi KONSERVATIV (stop i pari).
                </p>
              </div>
            </div>

            {/* ── Kostot — me popup për çdo komponent ── */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <DollarSign className="w-4 h-4 text-amber-400" />
                <h3 className="text-[14px] font-bold text-foreground">Modeli i kostos (çdo tregti zbritet)</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {[
                  { label: 'Komisione (IBKR)', key: 'costCommission', value: report.costs.commissionTotal, hint: '$0.005/aksion, min $1' },
                  { label: 'Bid/Ask spread', key: 'costSpread', value: report.costs.spreadTotal, hint: 'estimuar nga ADV' },
                  { label: 'Slippage', key: 'costSlippage', value: report.costs.slippageTotal, hint: '4bps + ATR factor' },
                  { label: 'Market impact', key: 'costImpact', value: report.costs.impactTotal, hint: 'pjesëmarrja vs ADV' },
                  { label: 'TOTAL', key: 'costTotal', value: report.costs.totalCosts, hint: `drag ${fmt(report.costs.costDragPct, 1)}% i fitimit bruto`, highlight: true },
                ].map((c, i) => (
                  <div key={i} className={`rounded-lg border p-3 ${c.highlight ? 'border-amber-500/30 bg-amber-500/10' : 'border-border/50 bg-muted/5'}`}>
                    <p className={`text-[11px] flex items-center gap-1 ${c.highlight ? 'text-amber-400' : 'text-muted-foreground'}`}>
                      {c.label}
                      {report && <MetricInfoPopup metricKey={c.key} report={report} />}
                    </p>
                    <p className={`text-[16px] font-bold mt-1 ${c.highlight ? 'text-amber-400' : 'text-foreground'}`}>-${fmt(c.value)}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">{c.hint}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Ekzekutimi: sinjale / refuzime ── */}
            <div className="rounded-lg border border-border/50 bg-muted/5 p-3.5">
              <div className="flex items-center gap-2 mb-2">
                <ActivityIcon />
                <h3 className="text-[13px] font-bold text-foreground">Ekzekutimi realist</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
                <div>
                  <p className="text-muted-foreground">Sinjale të gjeneruara</p>
                  <p className="text-[16px] font-bold text-foreground mt-0.5">{fmt(report.execution.signalsGenerated)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Urdhra të pamjaftuar</p>
                  <p className="text-[16px] font-bold text-red-400 mt-0.5">{fmt(report.execution.entryOrdersRejected)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Kapitali fillestar</p>
                  <p className="text-[16px] font-bold text-foreground mt-0.5">${fmt(report.equity.startEquity)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Ekuilibri final (IS+OOS)</p>
                  <p className={`text-[16px] font-bold mt-0.5 ${pnlColor(report.equity.finalEquity - report.equity.startEquity)}`}>
                    ${fmt(report.equity.finalEquity)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {Object.entries(report.execution.rejectReasons).map(([r, n]) => (
                  <Badge key={r} variant="outline" className={`text-[10.5px] ${
                    r === 'EVENT_EARNINGS' ? 'border-cyan-500/40 text-cyan-400' : 'border-border/50 text-muted-foreground'}`}>
                    {r.replace(/_/g, ' ')}: {n}
                  </Badge>
                ))}
              </div>
            </div>

            {/* ── Top / Worst trades ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[
                { title: '5 më të mirat', trades: report.topTrades, color: 'text-emerald-400', icon: TrendingUp },
                { title: '5 më të këqijat', trades: report.worstTrades, color: 'text-red-400', icon: TrendingDown },
              ].map((block) => (
                <div key={block.title}>
                  <div className="flex items-center gap-2 mb-2">
                    <block.icon className={`w-4 h-4 ${block.color}`} />
                    <h4 className="text-[13px] font-bold text-foreground">{block.title}</h4>
                  </div>
                  <div className="space-y-1.5">
                    {block.trades.map((tr, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 rounded-md bg-muted/5 border border-border/30 px-2.5 py-1.5 text-[12px]">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-foreground">{tr.symbol}</span>
                          <span className="text-muted-foreground/60 text-[10.5px]">{tr.setupType}</span>
                          <span className="text-muted-foreground/50 text-[10.5px] hidden sm:inline">
                            {tr.entryDate} → {tr.exitDate}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10.5px] text-muted-foreground" title="Confidence score">
                            {tr.scoreBreakdown.final}/10
                          </span>
                          <span className={`font-bold ${pnlColor(tr.r)}`}>{sign(tr.r, 2)}R</span>
                          <span className={`font-bold ${pnlColor(tr.pnlNet)}`}>{sign(tr.pnlNet)}$</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* ── Universe + kufizimet ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="w-4 h-4 text-blue-400" />
                  <h4 className="text-[13px] font-bold text-foreground">Universi & Survivorship</h4>
                  <MetricInfoPopup metricKey="universeInfo" report={report} />
                </div>
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  Universi: <strong className="text-foreground">{report.universe.size} emra</strong> likuidë nga lista 400-e ·
                  mbijetuesit: {fmt(report.universe.survivorship.survivorPct, 1)}% ·
                  {report.universe.survivorship.knownDelistedExcluded} emra të delistuar përjashtohen sipas datës së zhdukjes.
                  Haircut i rekomanduar mbi fitimin: <strong className="text-amber-400">{report.universe.survivorship.recommendedHaircutPct}%</strong>.
                </p>
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/5 p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <h4 className="text-[13px] font-bold text-foreground">Kufizimet e njohura (lexo para se tu besosh numrave)</h4>
                </div>
                <ul className="space-y-1">
                  {report.limitations.map((l, i) => (
                    <li key={i} className="text-[11.5px] text-muted-foreground leading-snug flex items-start gap-1.5">
                      <span className="text-amber-400/70 mt-px">•</span>{l}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground/60 text-center">
              Ky raport nuk garanton fitime — të tregon në mënyrë të matshme nëse strategjia ka avantazh real apo vetëm rezultat të bukur historik.
              Generuar: {new Date(report.generatedAt).toLocaleString('sq-AL')}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityIcon() {
  return <Clock className="w-4 h-4 text-muted-foreground" />;
}
