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
  // Task 29 — verifikimi me universin 400
  wfCalendarWindows: {
    window: number; label: string;
    trainFrom: string; trainTo: string; testFrom: string; testTo: string;
    train: { trades: number; winRatePct: number; profitFactor: number; netProfit: number };
    test: { trades: number; winRatePct: number; profitFactor: number; expectancy: number; maxDrawdownPct: number; netProfit: number; avgR: number };
  }[];
  universeComparison: {
    primaryLabel: string; baselineLabel: string;
    primary: UniverseSide;
    baseline: UniverseSide;
    note: string;
  } | null;
  finalVerdict: {
    decision: 'APPROVE' | 'HOLD' | 'REJECT';
    criteria: { key: string; label: string; required: string; actual: string; passed: boolean | null }[];
    stableWindows: number; totalWindows: number;
    top3SymbolsProfitSharePct: number | null;
    paperDeviationPct: number | null;
    note: string;
  };
  paperSignals: {
    signalDate: string; dataAvailableAt: string; ticker: string;
    score: number | null; eventScore: number | null; daysToEarnings: number | null;
    entry: number | null; stop: number | null; target: number | null;
    fillStatus: string | null; exitStatus: string | null; resultR: number | null;
    slippageEstPct: number | null;
  }[];
  paperVsOos: {
    paperTradesClosed: number; paperWinRatePct: number | null; paperExpectancyR: number | null;
    oosWinRatePct: number; oosAvgR: number;
    winRateDeviationPct: number | null; avgRDeviation: number | null;
    eventSignalsNear: number; eventSignalsWithScore: number;
    enoughSample: boolean; note: string;
  } | null;
}

interface UniverseSide {
  size: number; signals: number; signalsScore80Plus: number;
  oos: MetricSet; wfTest: MetricSet;
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
    what: `400 emra skanohen → likuiditeti i lë ~350 → trend-i i lë ~100 → setup-i ~80 → gates e lënë top 5-10 në ditë → ekzekutohen vetëm 3-5 pozicione njëkohësisht (max 2 për sektor). Zgjerimi i universit shton statistikë pa shtuar rrezik — pozicionet mbeten të njëjta.`,
    target: '400 emra për verifikimin final (120 si bazë krahasimi).',
    howNow: (r) => `Aktual: ${r.universe.size} emra · mbijetuesit ${fmt(r.universe.survivorship.survivorPct, 1)}% · ${r.universe.survivorship.knownDelistedExcluded} delistuar përjashtohen`,
    isGood: () => 'neutral',
  },
  finalVerdict: {
    title: 'Verdikti automatik (APPROVE / HOLD / REJECT)',
    what: 'Vendimi final i laboratorit mbi bazën e pragjeve të punës: APPROVE kërkon OOS profit factor ≥ 1.20, expectancy pozitive, drawdown brenda kufirit, qëndrueshmëri në disa dritere walk-forward dhe paper trading pa devijim të madh. REJECT del kur expectancy është negative, PF nën 1, drawdown-i shumë i lartë ose fitimi vjen nga një periudhë / disa aksione. Çdo gjëje mes tyre është HOLD — vazhdo paper, jo LIVE. Këto pragje janë rregulla pune, jo garanci fitimi.',
    target: 'APPROVE para çdo urdhri real — dhe edhe atëherë LIVE niset me gjysmën e rrezikut (0.25%).',
    howNow: (r) => `Vendimi: ${r.finalVerdict.decision} · ${r.finalVerdict.stableWindows}/${r.finalVerdict.totalWindows} dritere pozitive · top-3 simbolet ${r.finalVerdict.top3SymbolsProfitSharePct !== null ? fmt(r.finalVerdict.top3SymbolsProfitSharePct, 0) + '%' : '—'}`,
    isGood: (r) => r.finalVerdict.decision === 'APPROVE' ? 'good' : r.finalVerdict.decision === 'HOLD' ? 'neutral' : 'bad',
  },
  wfCalendar: {
    title: 'Walk-Forward kalendarike (5 dritere 5v→1v)',
    what: 'Pesë dritere të përsëritura në kohë reale: 2016–2020 train → 2021 test · 2017–2021 → 2022 · 2018–2022 → 2023 · 2019–2023 → 2024 · 2020–2024 → 2025. Parametrat fiks — nuk ripërshtaten asnjëherë pasi shihet testi. Nëse fitimi vjen vetëm nga një periudhë, nuk është strategji, është cikël tregu.',
    target: 'Së paku 3 nga 5 driterat test me fitim pozitiv (me ≥ 5 tregti) — pa këtë, rezultati IS nuk i besohet dot.',
    howNow: (r) => r.wfCalendarWindows.map(w => `${w.label.split(' ')[2]}: ${w.test.trades}t ${fmt(w.test.profitFactor, 2)}PF`).join(' · ') || 'Vetëm në run-et 10-vjeçare',
    isGood: (r) => r.finalVerdict.stableWindows >= 3 ? 'good' : r.finalVerdict.stableWindows >= 2 ? 'neutral' : 'bad',
  },
  universeComparison: {
    title: 'Krahasimi Universe 120 vs 400',
    what: 'I njëjti motor, të njëjtat rregulla, të njëjtat dritere — ndryshon VETËM numri i emrave të skanimit. Universi i gjerë shton sinjale (statistikë) por mund të sjellë emra më pak cilësorë: pritet më shumë tregti, por PF dhe expectancy duhen mbajtur. Nëse rrit vetëm numrin e tregtive dhe jo cilësinë — zgjerimi nuk ia vlen.',
    target: 'Më shumë sinjale me score 8+, OOS PF të mbajtur dhe drawdown pa u përkeqësuar ndjeshëm.',
    howNow: (r) => {
      const c = r.universeComparison;
      if (!c) return 'Aktive vetëm për universin 400 ose 120';
      return `${c.baselineLabel}: ${c.baseline.signals} sinjale / ${c.baseline.oos.trades}t OOS → ${c.primaryLabel}: ${c.primary.signals} sinjale / ${c.primary.oos.trades}t OOS`;
    },
    isGood: (r) => {
      const c = r.universeComparison;
      if (!c) return 'neutral';
      return c.primary.oos.expectancy > 0 && c.primary.oos.expectancy >= c.baseline.oos.expectancy ? 'good' : 'neutral';
    },
  },
  paperEvents: {
    title: 'Paper trading me event real',
    what: 'Sinjalet e ditarit Top10 (tregtim simuluar me çmime reale) të pasura me event score real: kalendarit historik EDGAR 8-K 2.02 as-of ditën e sinjalit. Për çdo sinjal ruhet: data, çmimi i disponueshëm në atë moment (EOD), score, event score, ditët deri në earnings, entry/stop/target, fill-i i simuluar, slippage-i i estimuar dhe rezultati final në R.',
    target: '≥ 20 të mbyllura për krahasim (50+ për gate-in 4) dhe devijim win rate brenda 15 pikëve nga OOS. Kujdes: fills janë të simuluara sipas top-of-book — stop/urdhrat kompleksë sillen ndryshe në llogari reale.',
    howNow: (r) => r.paperVsOos ? `${r.paperVsOos.paperTradesClosed} të mbyllura · WR ${r.paperVsOos.paperWinRatePct !== null ? fmt(r.paperVsOos.paperWinRatePct, 0) + '%' : '—'} vs OOS ${fmt(r.paperVsOos.oosWinRatePct, 0)}% · ${r.paperVsOos.eventSignalsNear} me earnings ≤2 ditë` : 'Journal-i nuk u lexua',
    isGood: (r) => r.paperVsOos && r.paperVsOos.paperTradesClosed >= 20 && Math.abs(r.paperVsOos.winRateDeviationPct ?? 0) <= 15 ? 'good' : 'neutral',
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

  // ═══ TASK 26: popup ℹë për TË GJITHË treguesit që mbeteshin pa shpjegim ═══
  gate1: {
    title: 'Gate 1 — Backtest pozitiv (In-Sample)',
    what: 'Testi i parë kundrejt vetvetes: strategjia duhet të jetë fitimprurëse në të dhënat që e formuan (IS). PF ≥ 1.3 do të thotë: për çdo $100 humbje, së paku $130 fitim bruto. Nën 1.3, pas kostos reale të ekzekutimit ngec zerove — në IS asnjë lloj optimizimi nuk e shpëton më vonë.',
    target: 'netProfit > 0 · PF ≥ 1.3 · ≥ 20 tregti in-sample.',
    howNow: (r) => `Aktual: ${r.gates[0]?.actual ?? '—'} — ${r.gates[0]?.passed === true ? 'KALUAR' : r.gates[0]?.passed === false ? 'DESAKT' : 'në pritje'}`,
    isGood: (r) => r.gates[0]?.passed === true ? 'good' : r.gates[0]?.passed === false ? 'bad' : 'neutral',
  },
  gate2: {
    title: 'Gate 2 — OOS pozitiv (Out-of-Sample)',
    what: '30% e fundit e të dhënave mbahet jashtë zhvillimit — këtu shihet nëse avantazhi ekziston apo u mësuash përmemërisë (overfitting). Nëse IS fiton e OOS humb, atë që kishe ishte kurvë e rastit, jo strategji.',
    target: 'OOS netProfit > 0 · PF ≥ 1.1.',
    howNow: (r) => `Aktual: ${r.gates[1]?.actual ?? '—'} — ${r.gates[1]?.passed === true ? 'KALUAR' : r.gates[1]?.passed === false ? 'DESAKT' : 'në pritje'}`,
    isGood: (r) => r.gates[1]?.passed === true ? 'good' : r.gates[1]?.passed === false ? 'bad' : 'neutral',
  },
  gate3: {
    title: 'Gate 3 — Walk-forward pozitiv',
    what: '4 dritare OOS të ankoruara rrëshqitës: secila testohet me parametrat e dhënë para saj. Kërkon së paku 10 tregti dhe win rate jo më shumë se 25 pikë nën IS — pa këtë, stabiliteti në kohë nuk ekziston.',
    target: 'WF trades ≥ 10 · WR ≥ max(35%, IS−25pk).',
    howNow: (r) => `Aktual: ${r.gates[2]?.actual ?? '—'} — ${r.gates[2]?.passed === true ? 'KALUAR' : r.gates[2]?.passed === false ? 'DESAKT' : 'në pritje'}`,
    isGood: (r) => r.gates[2]?.passed === true ? 'good' : r.gates[2]?.passed === false ? 'bad' : 'neutral',
  },
  gate4: {
    title: 'Gate 4 — Paper trading',
    what: 'Sinjalet reale të skanerit ndiqen në llogari simuluar me çmime reale — 50-100 zbatime para çdo dollar të vërtetë. Këtu dalin problemet që asnjë backtest nuk i tregon: urdhra të pamjaftueshëm, tick-e që kapërcehen, psikologjia e pritjes.',
    target: '≥ 50 paper trades të mbyllura.',
    howNow: (r) => `Aktual: ${r.gates[3]?.actual ?? '—'} — ${r.gates[3]?.passed === true ? 'KALUAR' : r.gates[3]?.passed === false ? 'DESAKT' : 'në pritje'}`,
    isGood: (r) => r.gates[3]?.passed === true ? 'good' : r.gates[3]?.passed === false ? 'bad' : 'neutral',
  },
  gate5: {
    title: 'Gate 5 — Kontroll slippage',
    what: 'Kosto totale e ekzekutimit (komision + spread + slippage + market impact) nën 0.35% të vlerës së pozicionit. Mbi këtë prag, avantazhi i hollë strategjik brehet nga realiteti i mbushjes së urdhrave.',
    target: 'Kosto ekzekutimi ≤ 0.35% e pozicionit.',
    howNow: (r) => `Aktual: ${r.gates[4]?.actual ?? '—'} — ${r.gates[4]?.passed === true ? 'KALUAR' : r.gates[4]?.passed === false ? 'DESAKT' : 'në pritje'}`,
    isGood: (r) => r.gates[4]?.passed === true ? 'good' : r.gates[4]?.passed === false ? 'bad' : 'neutral',
  },
  gate6: {
    title: 'Gate 6 — LIVE me 0.25% risk',
    what: 'Hapi i fundit dhe i vetmi manual: kalimi në para reale me gjysmën e rrezikut (1% → 0.25% për tregti). Nëse edhe me gjysmë rreziku ekuilibri bie si në backtest, atëherë rritet gradualisht — kurrë anasjelltas.',
    target: 'Vetëm pas gates 1-5 kaluar; aktivizohet me vendim manual.',
    howNow: (r) => `Aktual: ${r.gates[5]?.actual ?? '—'} — ${r.gates[5]?.passed === true ? 'KALUAR' : 'në pritje (manual)'}`,
    isGood: (r) => r.gates[5]?.passed === true ? 'good' : 'neutral',
  },
  wfAnchored: {
    title: 'Walk-Forward (4 dritare OOS të ankoruara)',
    what: 'Katër dritare test të njëpasnjëshme: secila testohet me parametrat e fiksuar PARA se të shihet rezultati. WF1 fillon më herët, WF4 më vonë — nëse fitimi vjen vetëm nga një dritare, nuk ke strategji, ke një periudhë tregu që Ra fort.',
    target: 'Të paktën 3 nga 4 dritare pozitive ose neutral me R mesatar jo-negativ.',
    howNow: (r) => r.walkForwardWindows.map(w => `WF${w.window}: ${w.trades}t ${sign(w.netProfit)}$ ${sign(w.avgR, 2)}R`).join(' · '),
    isGood: (r) => r.walkForwardWindows.filter(w => w.netProfit > 0).length >= 3 ? 'good'
      : r.walkForwardWindows.filter(w => w.netProfit > 0).length >= 2 ? 'neutral' : 'bad',
  },
  setupSplit: {
    title: 'Continuation kundrejt fade',
    what: 'Tregtimi ndahet sipas setup-it: PULLBACK (kthim brenda trendit), TREND_CONT (vazhdim pas konsolidimi) dhe BREAKOUT (thyerje e 20-d high). Nëse vetëm një setup fiton ndërsa të tjerët humbasin, strategjia mund të ngushtohet — ose të paktën të peshohet ndryshe.',
    target: 'Të tre setup-et me expectancy jo-negative; nëse një zhvendosje e bëhet barra e fitimit, ai duhet izoluar.',
    howNow: (r) => r.setupSplit.map(s => `${s.setupType}: ${s.trades}t ${fmt(s.winRatePct, 0)}% ${sign(s.netProfit)}$`).join(' · '),
    isGood: (r) => r.setupSplit.filter(s => s.netProfit > 0).length >= 2 ? 'good' : 'neutral',
  },
  setupPULLBACK: {
    title: 'Setup PULLBACK (hyrja B — më e besueshmja)',
    what: 'Aksioni në trend rritës bën një rënie të kontrolluar 2-8 ditë drejt EMA10/20 me volum në rënie, pastaj jep candle rikthimi. Hyrja me limit brenda zonës — stop-i nën swing low ka kuptim, sepse shitësit e vërtetë janë deri aty.',
    target: 'WR 40-55% me R mesatar ≥ +0.2R — kjo është bërthama e strategjisë.',
    howNow: (r) => { const s = r.setupSplit.find(x => x.setupType.includes('PULLBACK')); return s ? `${s.trades} tregti · WR ${fmt(s.winRatePct, 1)}% · ${sign(s.avgR, 2)}R · ${sign(s.netProfit)}$` : 'Pa tregti'; },
    isGood: (r) => { const s = r.setupSplit.find(x => x.setupType.includes('PULLBACK')); return s ? (s.avgR >= 0.1 ? 'good' : s.avgR >= 0 ? 'neutral' : 'bad') : 'neutral'; },
  },
  setupBREAKOUT: {
    title: 'Setup BREAKOUT (hyrja A — kërkon volum)',
    what: 'Çmimi thyen high 20-ditor me volum mbi mesataren. Hyrja me buy stop pak mbi nivelin — stop-i duhet të jetë i ngushtë sepse thyerjet e rreme bie menjëherë. Vërejtje: kosto më e lartë sepse ekzekutohet me stop order në lëvizje.',
    target: 'Vetëm me RVOL të lartë; pa volum, thyerja është kurvë.',
    howNow: (r) => { const s = r.setupSplit.find(x => x.setupType.includes('BREAKOUT')); return s ? `${s.trades} tregti · WR ${fmt(s.winRatePct, 1)}% · ${sign(s.avgR, 2)}R · ${sign(s.netProfit)}$` : 'Pa tregti'; },
    isGood: (r) => { const s = r.setupSplit.find(x => x.setupType.includes('BREAKOUT')); return s ? (s.avgR >= 0.1 ? 'good' : s.avgR >= 0 ? 'neutral' : 'bad') : 'neutral'; },
  },
  setupTREND_CONT: {
    title: 'Setup TREND_CONT (vazhdim i trendit)',
    what: 'Konsolidim i ngushtë afat të lartë (kohë pa lëvizje të mëdha) brenda një trendi të fortë — pastaj zgjerimi. Më i vështiri për tregtimi automatik: momenti i hyrjes kërkon durim dhe konfirmim volumi.',
    target: 'R mesatar jo-negativ; nëse humb vazhdimisht, hiq nga universi i sinjaleve.',
    howNow: (r) => { const s = r.setupSplit.find(x => x.setupType.includes('TREND_CONT') || x.setupType.includes('TREND CONT')); return s ? `${s.trades} tregti · WR ${fmt(s.winRatePct, 1)}% · ${sign(s.avgR, 2)}R · ${sign(s.netProfit)}$` : 'Pa tregti'; },
    isGood: (r) => { const s = r.setupSplit.find(x => x.setupType.includes('TREND_CONT') || x.setupType.includes('TREND CONT')); return s ? (s.avgR >= 0.1 ? 'good' : s.avgR >= 0 ? 'neutral' : 'bad') : 'neutral'; },
  },
  executionRealistic: {
    title: 'Ekzekutimi realist',
    what: 'Çdo sinjal kalon nëpër modelin real të ekzekutimit: sinjali në mbyllje → urdhri mbushet në qirinë PASUES, limit/stop sipas setup-it, gap-i i mëngjesit pranohet si është, dhe kur stop-i me target-in preken në të njëjtin qiri llogaritet konservativisht stop-i i pari. "Urdhra të pamjaftueshëm" janë sinjale të vlefshme që s\'u mbush dot me kushte — jo rrugëshpëtim.',
    target: 'Refuzimet < 20% e sinjaleve; ekuilibri final brenda pritjes së IS+OOS.',
    howNow: (r) => `${fmt(r.execution.signalsGenerated)} sinjale · ${fmt(r.execution.entryOrdersRejected)} të pamjaftuara (${fmt(r.execution.signalsGenerated > 0 ? (r.execution.entryOrdersRejected / r.execution.signalsGenerated) * 100 : 0, 1)}%) · $${fmt(r.equity.startEquity)} → $${fmt(r.equity.finalEquity)}`,
    isGood: (r) => r.execution.signalsGenerated > 0 && (r.execution.entryOrdersRejected / r.execution.signalsGenerated) <= 0.2 ? 'good' : 'neutral',
  },
  topWorst: {
    title: '5 më të mirat / 5 më të këqijat',
    what: 'Anatomia e shpërndarjes së fitimeve: nëse 5 më të mirat mbajnë pjesën dërrmuese të fitimit neto, strategjia varet nga raste të rralla — një statistikë e dobët për të ardhmen. 5 më të këqijat tregojnë si duket dështimi normal (jo fati i keq): stop i ekzekutuar mirë duhet të jetë afër −1R.',
    target: '5 më të mirat jo më shumë se ~50% e fitimit neto; 5 më të këqijat brenda −1 deri −1.5R.',
    howNow: (r) => {
      const top5 = r.topTrades.reduce((s, t) => s + t.pnlNet, 0);
      const worst5 = r.worstTrades.reduce((s, t) => s + t.pnlNet, 0);
      return `Top5: ${sign(top5)}$ (${r.topTrades.map(t => t.symbol).slice(0, 5).join(', ')}) · Worst5: ${sign(worst5)}$ (më i keqi ${sign(r.worstTrades[0]?.r ?? 0, 1)}R)`;
    },
    isGood: (r) => { const top5 = r.topTrades.reduce((s, t) => s + t.pnlNet, 0); const total = r.table.inSample.netProfit + r.table.outOfSample.netProfit; return total > 0 && top5 / total <= 0.5 ? 'good' : 'neutral'; },
  },
  sectorStatsDoc: {
    title: 'Performanca sipas sektorit',
    what: 'Ndarja e tregtive dhe fitimeve sipas sektorit ekonomik. Dy rreziqe të fshehura këtu: (1) sektori që fiton sot mund të jetë thjesht cikli i tij i mirë — jo meritë e strategjisë; (2) koncentrimi në 1-2 sektorë do të thotë korrelacion i lartë i pozicioneve (bie bashkë).',
    target: 'Fitim i shpërndarë mbi 3+ sektorë; asnjë sektor më shumë se ~40% e fitimit neto.',
    howNow: (r) => r.sectorStats.slice(0, 5).map(s => `${s.sector}: ${s.trades}t ${sign(s.netProfit)}$`).join(' · '),
    isGood: (r) => { const pos = r.sectorStats.filter(s => s.netProfit > 0).length; return pos >= 3 ? 'good' : 'neutral'; },
  },
  exitReasonsDoc: {
    title: 'Arsyet e daljes (exit reasons)',
    what: 'Si mbyllen tregtitë: TARGET (fitim i planifikuar), STOP (humbje e kontrolluar), GAP_STOP (hapur nën stop — humbje PËRTEJ planit), GAP_TARGET (hapur mbi target — fitim shtesë), TIME (kohë-stop 20 ditë) ose EOD (fund i periudhës). Përqindja e GAP_STOP-it është matja e vetme e gap risk real.',
    target: 'STOP + GAP_STOP së bashku nën 60% e daljeve; GAP_STOP vetëm nën 10%.',
    howNow: (r) => Object.entries(r.execution.exitReasons).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · '),
    isGood: (r) => { const total = Object.values(r.execution.exitReasons).reduce((a, b) => a + b, 0) || 1; const gs = (r.execution.exitReasons.GAP_STOP || 0) / total; return gs <= 0.1 ? 'good' : gs <= 0.2 ? 'neutral' : 'bad'; },
  },
  variantA: {
    title: 'A — Baseline (bërthama Trend+Pullback)',
    what: 'Vetëm bërthama mekanike: likuiditeti, trend-i me stacked MA, setup-i PULLBACK/BREAKOUT, score ≥ 45, RSI 30-75, risk ≤ 8%, ATR 1.5-6%. PA event, PA filtra sektori, PA regjim — pastron pamjen për atë që vërtetë punon.',
    target: 'Është pika e krahasimit: çdo filtër shtesë duhet justifikuar ndaj kësaj bazë.',
    howNow: (r) => { const v = r.variants.find(x => x.key === 'baseline'); return v ? `IS: ${v.is.trades}t ${sign(v.is.netProfit)}$ · OOS: ${v.oos.trades}t ${sign(v.oos.netProfit)}$ PF ${fmt(v.oos.profitFactor, 2)}` : '—'; },
    isGood: () => 'neutral',
  },
  variantB: {
    title: 'B — Event Filter (shmang earnings e afërta)',
    what: 'Bërthama A + bllokimi i hyrjeve kur earnings është brenda 2 ditësh dhe ulja e pikëve për afërsinë 3-7 ditë. Shtresa e parë e menaxhimit të gap risk — kostoja e vetme: pak sinjale.',
    target: 'Vitin e humbjeve nga eventet pa prekur expectancy-n bazë.',
    howNow: (r) => { const v = r.variants.find(x => x.key === 'event-filter'); return v ? `IS: ${v.is.trades}t ${sign(v.is.netProfit)}$ · OOS: ${v.oos.trades}t ${sign(v.oos.netProfit)}$ PF ${fmt(v.oos.profitFactor, 2)}` : '—'; },
    isGood: (r) => { const a = r.variants.find(x => x.key === 'baseline'); const b = r.variants.find(x => x.key === 'event-filter'); return a && b && b.oos.netProfit > a.oos.netProfit ? 'good' : 'neutral'; },
  },
  variantC: {
    title: 'C — Event Score (surprise + PEAD)',
    what: 'B + pikët e surprizës së fitimeve dhe drift-ut pas njoftimit (PEAD — post-earnings announcement drift). Njëkohësisht shton edhe 8-K materialet negative. Kjo e kthen event-in nga rrezik në avantazh të matshëm.',
    target: 'Expectancy më e lartë se B në OOS me numër tregtish të ngjashëm.',
    howNow: (r) => { const v = r.variants.find(x => x.key === 'event-score'); return v ? `IS: ${v.is.trades}t ${sign(v.is.netProfit)}$ · OOS: ${v.oos.trades}t ${sign(v.oos.netProfit)}$ PF ${fmt(v.oos.profitFactor, 2)}` : '—'; },
    isGood: (r) => { const b = r.variants.find(x => x.key === 'event-filter'); const c = r.variants.find(x => x.key === 'event-score'); return b && c && c.oos.expectancy > b.oos.expectancy ? 'good' : 'neutral'; },
  },
  variantD: {
    title: 'D — Full Strategy (të gjithë filtrat IBKR)',
    what: 'C + të gjithë filtrat e skanerit live: Sector Breadth Gate (DEAD/WEAK), RS kundrejt sektorit, regjimi VIX+breadth, RSI > 70, stop multiplier sipas VIX dhe cap-i i tregut. Ky është versioni që tregtohet në paper — D kundrejt A tregon vlerën e plotë të shtresave.',
    target: 'Versioni i vetëm me pretendim për tregtim: expectancy pozitive OOS + drawdown i ulët.',
    howNow: (r) => { const v = r.variants.find(x => x.key === 'full'); return v ? `IS: ${v.is.trades}t ${sign(v.is.netProfit)}$ · OOS: ${v.oos.trades}t ${sign(v.oos.netProfit)}$ PF ${fmt(v.oos.profitFactor, 2)}` : '—'; },
    isGood: (r) => { const d = r.variants.find(x => x.key === 'full'); return d && d.oos.expectancy > 0 ? 'good' : 'neutral'; },
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
  const [universe, setUniverse] = useState(400);
  const [years, setYears] = useState(10);

  const runBacktest = useCallback(async (force = false, uni = 400, yrs = 10) => {
    setLoading(true); setError(null); setElapsed(0);
    const t0 = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    try {
      const res = await fetch(`/api/ibkr-backtest?universe=${uni}&years=${yrs}${force ? '&force=1' : ''}`, { cache: 'no-store' });
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
            {/* Selektori i universit: 400 skanohen → 3-5 tregtohen (Task 29) */}
            <div className="flex items-center rounded-md border border-border/60 overflow-hidden">
              {[120, 300, 400].map(u => (
                <button
                  key={u}
                  onClick={() => {
                    setUniverse(u);
                    if (report) runBacktest(false, u, years);
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
            {/* Periudha: 5v e shpejtë · 10v = verifikimi me dritere kalendarike */}
            <div className="flex items-center rounded-md border border-border/60 overflow-hidden">
              {[5, 10].map(y => (
                <button
                  key={y}
                  onClick={() => {
                    setYears(y);
                    if (report) runBacktest(false, universe, y);
                  }}
                  disabled={loading}
                  className={`px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors disabled:opacity-50 ${
                    years === y
                      ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'}`}
                >
                  {y}v{y === 10 ? ' ⭐' : ''}
                </button>
              ))}
            </div>
            <button
              onClick={() => report ? runBacktest(true, universe, years) : runBacktest(false, universe, years)}
              disabled={loading}
              className="flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-md bg-violet-500/10 border border-violet-500/30 text-violet-400 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {loading ? `Duke ekzekutuar... ${elapsed}s` : report ? 'Rifresko (rindiz)' : `Ndez Verifikimin (${years}v, ${universe} emra)`}
            </button>
          </div>
        </div>

        {loading && (
          <div className="space-y-2 py-6">
            <div className="flex items-center justify-center gap-2 text-[13px] text-violet-300 mb-3">
              <Timer className="w-4 h-4 animate-pulse" />
              <span>
                {universe} emra × {years} vjet (Yahoo) + kalendar earnings (EDGAR 8-K) + 4 variante IS/OOS
                {years === 10 ? ' + Walk-Forward kalendarike 5 dritere (2016→2025)' : ''}
                {universe === 400 || universe === 120 ? ' + krahasimi 120 vs 400' : ''}
                — hera e parë ~2-5 min, më pas 6 orë cache
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
                      <p className="text-[12.5px] font-semibold text-foreground inline-flex items-center gap-1 flex-wrap">
                        {g.gate}
                        <MetricInfoPopup metricKey={`gate${i + 1}`} report={report} />
                      </p>
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

            {/* ═══ TASK 29: VERDIKTI AUTOMATIK — APPROVE / HOLD / REJECT ═══ */}
            <div className={`rounded-lg border p-4 flex items-start gap-3 ${
              report.finalVerdict.decision === 'APPROVE' ? 'border-emerald-500/40 bg-emerald-500/10'
              : report.finalVerdict.decision === 'REJECT' ? 'border-red-500/40 bg-red-500/10'
              : 'border-amber-500/40 bg-amber-500/10'}`}>
              {report.finalVerdict.decision === 'APPROVE'
                ? <CheckCircle2 className="w-7 h-7 text-emerald-400 mt-0.5 flex-shrink-0" />
                : report.finalVerdict.decision === 'REJECT'
                  ? <XCircle className="w-7 h-7 text-red-400 mt-0.5 flex-shrink-0" />
                  : <MinusCircle className="w-7 h-7 text-amber-400 mt-0.5 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-[15px] font-extrabold tracking-wide ${
                    report.finalVerdict.decision === 'APPROVE' ? 'text-emerald-400'
                    : report.finalVerdict.decision === 'REJECT' ? 'text-red-400' : 'text-amber-400'}`}>
                    VERDIKTI: {report.finalVerdict.decision}
                  </p>
                  <span className="text-[11px] text-muted-foreground">
                    {report.finalVerdict.decision === 'APPROVE' ? 'kalon kufijtë e punës — kalo te paper i vazhdueshëm para LIVE (0.25% risk)'
                    : report.finalVerdict.decision === 'REJECT' ? 'nuk kalon kufijtë e punës — jo për tregti reale në këtë formë'
                    : 'rezultate të pamezuara — vazhdo paper trading dhe monitorim'}
                  </span>
                  <MetricInfoPopup metricKey="finalVerdict" report={report} />
                </div>
                <p className="text-[12px] text-muted-foreground leading-relaxed mt-1">{report.finalVerdict.note}</p>
                {/* Kriteret si chips */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1.5 mt-2.5">
                  {report.finalVerdict.criteria.map((c) => (
                    <div key={c.key} className={`rounded-md border px-2.5 py-1.5 flex items-start gap-1.5 ${
                      c.passed === true ? 'border-emerald-500/25 bg-emerald-500/5'
                      : c.passed === false ? 'border-red-500/25 bg-red-500/5'
                      : 'border-amber-500/25 bg-amber-500/5'}`}>
                      <GateIcon passed={c.passed} />
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-foreground leading-tight">{c.label}</p>
                        <p className="text-[10.5px] text-muted-foreground leading-snug">
                          {c.actual} <span className="text-muted-foreground/60">(duhet: {c.required})</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
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
                      <th className="pb-2 text-[12px] font-semibold text-violet-400 inline-flex items-center gap-1">Walk-Forward<MetricInfoPopup metricKey="wfAnchored" report={report} /></th>
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
                          <span className="inline-flex items-center gap-1">
                            {v.label}
                            <MetricInfoPopup metricKey={`variant${v.key === 'baseline' ? 'A' : v.key === 'event-filter' ? 'B' : v.key === 'event-score' ? 'C' : 'D'}`} report={report} />
                          </span>
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

            {/* ═══ TASK 29: KRAHASIMI I UNIVERSIT — 120 kundrejt 400 ═══ */}
            {report.universeComparison && (() => {
              const c = report.universeComparison;
              const rows: { label: string; get: (s: UniverseSide) => string; good?: (s: UniverseSide) => boolean | null }[] = [
                { label: 'Numri i sinjaleve', get: (s) => fmt(s.signals) },
                { label: 'Sinjale me score 8+ (/10)', get: (s) => `${fmt(s.signalsScore80Plus)} (${fmt(s.signals > 0 ? (s.signalsScore80Plus / s.signals) * 100 : 0, 0)}%)` },
                { label: 'Tregti OOS', get: (s) => fmt(s.oos.trades) },
                { label: 'Win rate OOS', get: (s) => `${fmt(s.oos.winRatePct, 1)}%` },
                { label: 'Profit factor OOS', get: (s) => fmt(s.oos.profitFactor, 2), good: (s) => s.oos.profitFactor >= 1.1 },
                { label: 'Expectancy OOS ($/tregti)', get: (s) => `${sign(s.oos.expectancy, 2)}$`, good: (s) => s.oos.expectancy > 0 },
                { label: 'Max drawdown OOS', get: (s) => `${fmt(s.oos.maxDrawdownPct, 1)}%`, good: (s) => s.oos.maxDrawdownPct <= 25 },
                { label: 'Return neto OOS', get: (s) => `${sign(s.oos.netProfit)}$`, good: (s) => s.oos.netProfit > 0 },
                { label: 'Tregti WF-test (5 dritare)', get: (s) => s.wfTest.trades > 0 ? fmt(s.wfTest.trades) : '—' },
                { label: 'PF WF-test', get: (s) => s.wfTest.trades > 0 ? fmt(s.wfTest.profitFactor, 2) : '—', good: (s) => s.wfTest.trades > 0 ? s.wfTest.profitFactor >= 1.0 : null },
              ];
              return (
                <div className="rounded-lg border border-blue-500/25 bg-blue-500/5 p-4">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <GitCompare className="w-4 h-4 text-blue-400" />
                    <h3 className="text-[14px] font-bold text-foreground">Krahasimi: {c.baselineLabel} kundrejt {c.primaryLabel}</h3>
                    <MetricInfoPopup metricKey="universeComparison" report={report} />
                    <span className="text-[11px] text-muted-foreground">strategjia FULL (D) · të njëjtat rregulla, të njëjtat dritare</span>
                  </div>
                  <p className="text-[11.5px] text-muted-foreground mb-3">{c.note}</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[520px]">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Metrika</th>
                          <th className="pb-2 text-[11.5px] font-semibold text-blue-400">{c.baselineLabel} (bazë)</th>
                          <th className="pb-2 text-[11.5px] font-semibold text-blue-300">{c.primaryLabel} (verifikimi)</th>
                        </tr>
                      </thead>
                      <tbody className="text-[12px]">
                        {rows.map((row, ri) => {
                          const good = row.good ? row.good(c.primary) : null;
                          return (
                            <tr key={ri} className="border-b border-border/30 last:border-0">
                              <td className="py-1.5 pr-3 text-muted-foreground">{row.label}</td>
                              <td className="py-1.5 pr-3 text-foreground">{row.get(c.baseline)}</td>
                              <td className={`py-1.5 font-semibold ${good === null || good === undefined ? 'text-foreground' : good ? 'text-emerald-400' : 'text-red-400'}`}>
                                {row.get(c.primary)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-muted-foreground/70 mt-2">
                    Nëse universi i gjerë rrit numrin e tregtive por ul profit factor ose rrit drawdown-in, nuk është domosdoshmërisht përmirësim — cilësia mbi sasinë.
                  </p>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* ── Walk-Forward: kalendarike (10v) ose anchored (3v/5v) ── */}
              <div className={report.wfCalendarWindows.length > 0 ? 'lg:col-span-2' : ''}>
                <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                  <Gauge className="w-4 h-4 text-violet-400" />
                  <h3 className="text-[14px] font-bold text-foreground">
                    {report.wfCalendarWindows.length > 0
                      ? `Walk-Forward kalendarike (${report.wfCalendarWindows.length} dritare train 5v → test 1v)`
                      : 'Walk-Forward (4 dritare OOS)'}
                  </h3>
                  <MetricInfoPopup metricKey={report.wfCalendarWindows.length > 0 ? 'wfCalendar' : 'wfAnchored'} report={report} />
                </div>
                {report.wfCalendarWindows.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[880px]">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Dritarja</th>
                          <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Train</th>
                          <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Tregti</th>
                          <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Train PF</th>
                          <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Test</th>
                          <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Tregti</th>
                          <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">WR%</th>
                          <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">PF</th>
                          <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Exp $</th>
                          <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">DD%</th>
                          <th className="pb-2 text-[11.5px] font-semibold text-muted-foreground">Neto $</th>
                        </tr>
                      </thead>
                      <tbody className="text-[12px]">
                        {report.wfCalendarWindows.map((w) => (
                          <tr key={w.window} className="border-b border-border/30 last:border-0">
                            <td className="py-1.5 text-violet-400 font-semibold">WF{w.window}</td>
                            <td className="py-1.5 text-muted-foreground text-[11px]">{w.trainFrom.slice(0, 7)} → {w.trainTo.slice(0, 7)}</td>
                            <td className="py-1.5 text-foreground/80">{w.train.trades} <span className="text-[9.5px] text-muted-foreground/60">({sign(w.train.netProfit)}$)</span></td>
                            <td className={`py-1.5 font-semibold ${w.train.profitFactor >= 1.1 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(w.train.profitFactor, 2)}</td>
                            <td className="py-1.5 text-foreground text-[11px] font-medium">{w.testFrom.slice(0, 7)} → {w.testTo.slice(0, 7)}</td>
                            <td className="py-1.5 text-foreground">{w.test.trades}</td>
                            <td className={`py-1.5 font-semibold ${w.test.winRatePct >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(w.test.winRatePct, 1)}%</td>
                            <td className={`py-1.5 font-semibold ${w.test.profitFactor >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(w.test.profitFactor, 2)}</td>
                            <td className={`py-1.5 font-semibold ${pnlColor(w.test.expectancy)}`}>{sign(w.test.expectancy, 2)}</td>
                            <td className="py-1.5 text-red-400/90">{fmt(w.test.maxDrawdownPct, 1)}%</td>
                            <td className={`py-1.5 font-semibold ${pnlColor(w.test.netProfit)}`}>{sign(w.test.netProfit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-[11px] text-muted-foreground/70 mt-1.5">
                      Të njëjtat dritare siç janë specifikuar: 2016–2020→2021 · 2017–2021→2022 · 2018–2022→2023 · 2019–2023→2024 · 2020–2024→2025.
                      Parametrat nuk ndryshohen pasi shihet testi — nëse ndryshojnë, duhet nisur dritare e re train/test.
                    </p>
                  </div>
                ) : (
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
                    <p className="text-[11px] text-muted-foreground/70 mt-1.5">
                      Dritare OOS të ankoruara — parametrat nuk ndryshohen gjatë OOS. Për dritaret kalendarike 2016→2025 zgjidh 10v.
                    </p>
                  </div>
                )}
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
                  <MetricInfoPopup metricKey="sectorStatsDoc" report={report} />
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
                  <MetricInfoPopup metricKey="setupSplit" report={report} />
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
                      {report.setupSplit.map((s) => {
                        const setupKey = s.setupType.includes('PULLBACK') ? 'setupPULLBACK'
                          : s.setupType.includes('BREAKOUT') ? 'setupBREAKOUT' : 'setupTREND_CONT';
                        return (
                          <tr key={s.setupType} className="border-b border-border/30 last:border-0">
                            <td className="py-1.5 text-foreground font-semibold inline-flex items-center gap-1">
                              {s.setupType}
                              <MetricInfoPopup metricKey={setupKey} report={report} />
                            </td>
                            <td className="py-1.5 text-foreground">{s.trades}</td>
                            <td className={`py-1.5 font-semibold ${s.winRatePct >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(s.winRatePct, 1)}%</td>
                            <td className={`py-1.5 font-semibold ${pnlColor(s.avgR)}`}>{sign(s.avgR, 2)}</td>
                            <td className={`py-1.5 font-semibold ${pnlColor(s.netProfit)}`}>{sign(s.netProfit)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Exit reasons */}
                <div className="mt-3 flex flex-wrap gap-1.5 items-center">
                  {Object.entries(report.execution.exitReasons).map(([r, n]) => (
                    <Badge key={r} variant="outline" className={`text-[10.5px] ${
                      r.includes('TARGET') ? 'border-emerald-500/30 text-emerald-400'
                      : r.includes('STOP') ? 'border-red-500/30 text-red-400'
                      : 'border-border/50 text-muted-foreground'}`}>
                      {r.replace('_', ' ')}: {n}
                    </Badge>
                  ))}
                  <MetricInfoPopup metricKey="exitReasonsDoc" report={report} />
                </div>
                <p className="text-[11px] text-muted-foreground/70 mt-1.5">
                  GAP_STOP = hapur nën stop (humbje përtej stopit) · GAP_TARGET = hapur mbi target.
                  Nëse stop dhe target preken në të njëjtin qiri → supozimi KONSERVATIV (stop i pari).
                </p>
              </div>
            </div>

            {/* ═══ TASK 29: PAPER TRADING ME EVENT REAL ═══ */}
            <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/5 p-4">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <CalendarClock className="w-4 h-4 text-cyan-400" />
                <h3 className="text-[14px] font-bold text-foreground">Paper trading me event real (journal Top10)</h3>
                <MetricInfoPopup metricKey="paperEvents" report={report} />
                <span className="text-[11px] text-muted-foreground">çmime reale · ekzekutim i simuluar · event score EDGAR as-of ditën e sinjalit</span>
              </div>
              {report.paperSignals.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">
                  Journal-i Top10 nuk ka hyrje në 90 ditët e fundit (kërkon DB aktiv dhe skanime të rregullta live).
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[880px]">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="pb-2 text-[11px] font-semibold text-muted-foreground">Data e sinjalit</th>
                          <th className="pb-2 text-[11px] font-semibold text-muted-foreground">Ticker</th>
                          <th className="pb-2 text-[11px] font-semibold text-muted-foreground">Score</th>
                          <th className="pb-2 text-[11px] font-semibold text-muted-foreground">Event</th>
                          <th className="pb-2 text-[11px] font-semibold text-muted-foreground">DTE</th>
                          <th className="pb-2 text-[11px] font-semibold text-muted-foreground">Entry</th>
                          <th className="pb-2 text-[11px] font-semibold text-muted-foreground">Stop</th>
                          <th className="pb-2 text-[11px] font-semibold text-muted-foreground">Target</th>
                          <th className="pb-2 text-[11px] font-semibold text-muted-foreground">Fill</th>
                          <th className="pb-2 text-[11px] font-semibold text-muted-foreground">Slip. est.</th>
                          <th className="pb-2 text-[11px] font-semibold text-muted-foreground">Rezultati</th>
                        </tr>
                      </thead>
                      <tbody className="text-[11.5px]">
                        {report.paperSignals.map((p, i) => (
                          <tr key={`${p.ticker}-${p.signalDate}-${i}`} className="border-b border-border/30 last:border-0">
                            <td className="py-1.5 text-muted-foreground">{p.signalDate}</td>
                            <td className="py-1.5 font-bold text-foreground">{p.ticker}</td>
                            <td className="py-1.5 text-foreground/80">{p.score != null ? fmt(p.score, 0) : '—'}</td>
                            <td className={`py-1.5 font-bold ${p.eventScore == null ? 'text-muted-foreground/50' : p.eventScore > 0 ? 'text-emerald-400' : p.eventScore < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                              {p.eventScore != null ? sign(p.eventScore, 0) : '—'}
                            </td>
                            <td className="py-1.5 text-muted-foreground">{p.daysToEarnings != null ? fmt(p.daysToEarnings) : '—'}</td>
                            <td className="py-1.5 text-foreground/80">{p.entry != null ? fmt(p.entry, 2) : '—'}</td>
                            <td className="py-1.5 text-red-400/80">{p.stop != null ? fmt(p.stop, 2) : '—'}</td>
                            <td className="py-1.5 text-emerald-400/80">{p.target != null ? fmt(p.target, 2) : '—'}</td>
                            <td className="py-1.5">
                              <span className={`text-[10.5px] px-1.5 py-0.5 rounded border ${
                                p.fillStatus === 'FILL' ? 'border-emerald-500/30 text-emerald-400'
                                : p.fillStatus === 'NO_FILL' ? 'border-muted text-muted-foreground/60'
                                : 'border-amber-500/30 text-amber-400'}`}>
                                {p.fillStatus || '—'}
                              </span>
                            </td>
                            <td className="py-1.5 text-muted-foreground/80">{p.slippageEstPct != null ? `${fmt(p.slippageEstPct * 100, 2)}%` : '—'}</td>
                            <td className="py-1.5">
                              {p.resultR != null ? (
                                <span className={`font-semibold ${pnlColor(p.resultR)}`}>{sign(p.resultR, 2)}R</span>
                              ) : (
                                <span className="text-[10.5px] text-muted-foreground/70">{(p.exitStatus || 'OPEN').replace('_', ' ')}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {report.paperVsOos && (
                    <div className="mt-3 rounded-lg border border-border/50 bg-muted/10 p-3">
                      <div className="flex flex-wrap gap-4 text-[11.5px] mb-1.5">
                        <span className="text-muted-foreground">Të mbyllura: <strong className="text-foreground">{report.paperVsOos.paperTradesClosed}</strong> {report.paperVsOos.enoughSample ? '(≥ 50 — gate 4 plotësohet)' : '(duhen 50+ për gate-in 4)'}</span>
                        <span className="text-muted-foreground">WR paper: <strong className={report.paperVsOos.paperWinRatePct != null && report.paperVsOos.paperWinRatePct >= 50 ? 'text-emerald-400' : 'text-amber-400'}>{report.paperVsOos.paperWinRatePct != null ? `${fmt(report.paperVsOos.paperWinRatePct, 0)}%` : '—'}</strong></span>
                        <span className="text-muted-foreground">WR OOS: <strong className="text-foreground">{fmt(report.paperVsOos.oosWinRatePct, 1)}%</strong></span>
                        <span className="text-muted-foreground">Devijim: <strong className={report.paperVsOos.winRateDeviationPct != null && Math.abs(report.paperVsOos.winRateDeviationPct) <= 15 ? 'text-emerald-400' : 'text-amber-400'}>{report.paperVsOos.winRateDeviationPct != null ? `${sign(report.paperVsOos.winRateDeviationPct, 1)} pk` : '—'}</strong></span>
                        <span className="text-muted-foreground">Expectancy paper: <strong className="text-foreground">{report.paperVsOos.paperExpectancyR != null ? `${sign(report.paperVsOos.paperExpectancyR, 2)}R` : '—'}</strong> vs OOS <strong className="text-foreground">{sign(report.paperVsOos.oosAvgR, 2)}R</strong></span>
                        <span className="text-muted-foreground">Sinjale me earnings ≤ 2 ditë: <strong className="text-cyan-400">{report.paperVsOos.eventSignalsNear}</strong> / {report.paperVsOos.eventSignalsWithScore} me event score</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground/80 leading-relaxed">{report.paperVsOos.note}</p>
                    </div>
                  )}
                </>
              )}
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
                <MetricInfoPopup metricKey="executionRealistic" report={report} />
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
                    <MetricInfoPopup metricKey="topWorst" report={report} />
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
