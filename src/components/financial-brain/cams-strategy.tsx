'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  TrendingUp, AlertTriangle, CheckCircle2, XCircle, Target, BarChart3,
  RefreshCw, Activity, Info, Loader2, Zap, Shield, ShieldAlert, Flame,
  Trophy, Eye, Crosshair, Gauge, Minus, Layers, Newspaper, ExternalLink,
  Clock, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useState, useEffect, type ReactNode } from 'react';

// ── Tipet (pasqyrë e API response) ──

interface CamsStock {
  rank: number;
  symbol: string;
  sector: string;
  sectorEtf: string;
  price: number;
  catalystScore: number;
  accelerationScore: number;
  structureScore: number;
  revisionScore: number;
  regimeScore: number;
  penalty: number;
  camsScore: number;
  tier: 'A_KANDIDAT' | 'WATCHLIST' | 'MONITOR' | 'NO_TRADE';
  setup: 'PEAD_CONTINUATION' | 'PULLBACK' | 'BREAKOUT' | 'NONE';
  entry: number;
  stop: number;
  target1R: number;
  target2R: number;
  target3R: number;
  riskPct: number;
  positionSize: number;
  positionValue: number;
  riskDollars: number;
  riskBudgetPct: number;
  extensionFiltered: boolean;
  extensionAtr: number;
  reasons: string[];
  warnings: string[];
  invalidation: string;
  catalystEvidence: string[];
  avgDolVol20d: number;
  avgVol20d: number;
  ema20: number;
  ema50: number;
  rsi14: number;
  adx14: number;
  atrPct: number;
  rvol: number;
  ret20d: number;
  sectorRankPct: number;
  daysToEarnings: number | null;
  gapUp: { daysAgo: number; gapPct: number; rvolOnGap: number; closeOnGap: number; date: string } | null;
  // Task 19: diagnostika për zbërthimin konkret të sub-score-ve
  diag: {
    ema10: number; ema200: number; ema20Slope: number; ema50Slope: number;
    closeLocation: number; ret5d: number; high20: number;
    consolidationDays: number; consolidationHigh: number; pullbackDays: number;
    swingLow: number; epsSurprisePct: number | null; analystRevisionScore: number | null;
    daysSinceEarnings: number | null; material8KSentiment: string;
    spyAbove50: boolean; spyAbove200: boolean; qqqAbove50: boolean; qqqAbove200: boolean;
    sectorAbove50: boolean; sectorVsSpy20d: number;
  };
}

interface CamsResponse {
  scannedAt: string;
  durationSec: number;
  regime: { ok: boolean; spy: { above50: boolean; above200: boolean }; qqq: { above50: boolean; above200: boolean } };
  funnel: { universe: number; withData: number; passedLiquidity: number; withCatalyst: number; scored60plus: number; displayed: number };
  enrichment: { alphaVantage: boolean; enriched: number; note: string };
  results: CamsStock[];
  error?: string;
}

// ── Config vizuale ──

const TIER_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; desc: string }> = {
  A_KANDIDAT: {
    label: 'A-KANDIDAT', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/40',
    desc: 'Hyrje vetëm me trigger teknik — breakout i konfirmuar ose pullback i kontrolluar.',
  },
  WATCHLIST: {
    label: 'WATCHLIST', bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/40',
    desc: 'Prit pullback të pastër ose breakout — mos e ndjek lart.',
  },
  MONITOR: {
    label: 'MONITORIM', bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/40',
    desc: 'Mungon një konfirmim i rëndësishëm — vetëm vëzhgim.',
  },
  NO_TRADE: {
    label: 'PA TREGTIM', bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/40',
    desc: 'Nuk plen kushtet e strategjisë — mos e tregto.',
  },
};

const SETUP_LABEL: Record<string, string> = {
  PEAD_CONTINUATION: 'PEAD Continuation',
  PULLBACK: 'Pullback',
  BREAKOUT: 'Breakout',
  NONE: 'Pa setup',
};

// ── Komponentë të vegjël ──

// ═══ Task 19: Zbërthimi konkret i secilit sub-score CAMS ═══
// "Çka ka bo dhe si duhet të jetë" — kushtet reale me ✅/❌ për secilin kandidat.

interface CamsPart {
  label: string;
  pts: number;
  active: boolean;
  detail: string;
  base?: boolean;
  neutral?: boolean;
}

function CamsBreakdownCell({
  label, value, symbol, icon, parts, footer,
}: {
  label: string; value: number; symbol: string; icon: ReactNode;
  parts: CamsPart[]; footer: string;
}) {
  const c = value >= 70 ? 'text-emerald-400' : value >= 50 ? 'text-amber-400' : 'text-red-400';
  const computed = Math.round(Math.max(0, Math.min(100, parts.reduce((s, p) => s + (p.base || (p.active && !p.neutral) ? p.pts : 0), 0))));
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
      <PopoverContent side="bottom" align="center" className="w-80 sm:w-96 p-0 overflow-hidden">
        <div className="bg-gradient-to-b from-primary/10 to-transparent px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            {icon}
            <p className="text-sm font-bold text-foreground">{label} — {symbol}</p>
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${value >= 70 ? 'bg-emerald-500/15 text-emerald-400' : value >= 50 ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'}`}>{value}/100</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Zbërthimi konkret: çka ka bo ky kandidat</p>
        </div>
        <div className="px-4 pb-4 space-y-1.5">
          {parts.map((p, i) => (
            <div key={i} className="flex items-start gap-2 rounded-md bg-muted/10 p-2">
              {p.base || p.neutral
                ? <Minus className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                : p.active
                ? (p.pts >= 0
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    : <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />)
                : (p.pts >= 0
                    ? <XCircle className="w-3.5 h-3.5 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
                    : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />)}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-foreground leading-snug">{p.label}</p>
                <p className="text-[10.5px] text-muted-foreground leading-snug mt-0.5">{p.detail}</p>
              </div>
              <span className={`text-[11px] font-bold font-mono flex-shrink-0 ${
                p.base ? 'text-muted-foreground'
                : p.neutral ? 'text-muted-foreground/40'
                : p.active ? (p.pts >= 0 ? 'text-emerald-400' : 'text-red-400')
                : (p.pts >= 0 ? 'text-muted-foreground/40 line-through' : 'text-muted-foreground/40')
              }`}>{p.pts >= 0 ? '+' : ''}{p.pts}</span>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-md border border-border/50 px-2.5 py-2">
            <p className="text-[11px] text-muted-foreground">Totali i sub-score-it</p>
            <p className={`text-[13px] font-bold font-mono ${c}`}>{computed}/100</p>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{footer}</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CatalystCell({ stock }: { stock: CamsStock }) {
  const d = stock.diag;
  const gapOk = !!stock.gapUp && stock.gapUp.daysAgo <= 45 && stock.gapUp.rvolOnGap >= 1.5;
  const driftStrong = !!stock.gapUp && stock.price > stock.gapUp.closeOnGap && stock.price > stock.ema20;
  const driftWeak = !!stock.gapUp && !driftStrong && stock.price > stock.gapUp.closeOnGap * 0.98;
  const earnPos = d.daysSinceEarnings != null && d.daysSinceEarnings <= 30 && stock.price > stock.ema20 && stock.ret20d > 0;

  const parts: CamsPart[] = [
    d.epsSurprisePct == null
      ? { label: 'Pa të dhëna EPS reale', pts: 0, active: false, neutral: true, detail: 'kërkon ALPHA_VANTAGE_API_KEY ose raportim të fundit — pa të, katalizatori vlerësohet nga reagimi i tregut (gap + volum) dhe 8-K' }
      : d.epsSurprisePct >= 5
      ? { label: `EPS beat +${d.epsSurprisePct.toFixed(1)}% mbi konsensus`, pts: Math.min(30, Math.round(d.epsSurprisePct * 1.5)), active: true, detail: 'fitimi real raportoi më lart se pritjet — katalizatori më i fortë i mundshëm (deri +30 pikë)' }
      : d.epsSurprisePct > 0
      ? { label: `EPS beat +${d.epsSurprisePct.toFixed(1)}% (i vogël)`, pts: 10, active: true, detail: 'mbi konsensus por pa diferencë të madhe — katalizator i lehtë' }
      : d.epsSurprisePct <= -5
      ? { label: `EPS miss ${d.epsSurprisePct.toFixed(1)}% — kujdes!`, pts: -25, active: true, detail: 'nën pritjet me diferencë të madhe — kjo është arsye për MOS hyrje, jo blerje' }
      : { label: `EPS ${d.epsSurprisePct.toFixed(1)}% (thjesht nën konsensus)`, pts: 0, active: true, neutral: true, detail: 'pak nën pritjet por jo dramatike — neutrale' },
    gapOk && stock.gapUp
      ? { label: `Reagim tregu: gap +${stock.gapUp.gapPct.toFixed(1)}% me volum ${stock.gapUp.rvolOnGap.toFixed(1)}x (${stock.gapUp.date})`, pts: Math.min(30, Math.round(Math.max(0, stock.gapUp.gapPct) * 5)), active: true, detail: 'tregu reagoi ndaj katalizatorit me hapje lart dhe volum të lartë — proxy i verifikueshëm se diçka e vërtetë ndodhi' }
      : earnPos && d.daysSinceEarnings != null
      ? { label: `Earnings ${d.daysSinceEarnings}d më parë — po zhvillohet pozitivisht`, pts: 12, active: true, detail: 'raportimi së fundmi pa gap të madh, por aksioni po rritet qetë mbi EMA20 — drift pozitiv' }
      : { label: 'Pa katalizator të detektueshëm', pts: 0, active: false, detail: 'as gap-up me volum, as earnings të afërt — pa themel themelor për lëvizje të fortë' },
    gapOk && stock.gapUp
      ? (driftStrong
          ? { label: 'Drift pozitiv PEAD — çmimi mban gap-in dhe EMA20', pts: 20, active: true, detail: 'lëvizja po vazhdon pas katalizatorit, jo vetëm një shpërthim një-ditor — ky është modeli Dell/VEEV/CRM' }
          : driftWeak
          ? { label: 'Gap-u po mbahet kryesisht (brenda 2%)', pts: 10, active: true, detail: 'drift i pjesshëm — blerësit nuk po e lënë plotësisht, por as nuk po shtyjnë më tej' }
          : { label: 'Gap-u është mbushur — drift i dobët', pts: 0, active: false, detail: 'çmimi ra nën close-in e ditës së gap-it — katalizatori nuk po mbahet, kujdes' })
      : { label: 'Drift PEAD (vetëm me gap aktiv)', pts: 0, active: false, detail: 'kërkohet gap-up me volum i pari, pastaj vlerësohet mbajtja' },
    d.material8KSentiment === 'positive'
      ? { label: 'Filing 8-K materiale POZITIVE (30d)', pts: 20, active: true, detail: 'dokument zyrtar SEC me lajm pozitë (kontratë, blerje, udhëheqje) — e verifikueshme publikisht' }
      : d.material8KSentiment === 'negative'
      ? { label: 'Filing 8-K materiale NEGATIVE — score-i KUFIzohet në 30', pts: 0, active: true, neutral: true, detail: 'lajm negativ i verifikueshëm — pavarësisht teknikës, kandidati nuk mund të ketë katalizator të fortë' }
      : { label: 'Pa 8-K materiale të fundit', pts: 0, active: false, detail: 'nuk ka dokumente të rëndësishme SEC në 30 ditët e fundit' },
  ];

  return (
    <CamsBreakdownCell
      label="Katalizatori" value={stock.catalystScore} symbol={stock.symbol}
      icon={<Flame className="w-3.5 h-3.5 text-violet-400" />}
      parts={parts}
      footer="Peshon 35% në CAMS. Idealisht: mbi 60 = katalizator i fortë i verifikueshëm. Nën 40 = pa themel — pjesa tjetër e score-it ka kuptim të vogël."
    />
  );
}

function AccelerationCell({ stock }: { stock: CamsStock }) {
  const d = stock.diag;
  const aboveCount = (stock.price > stock.ema20 ? 1 : 0) + (stock.price > stock.ema50 ? 1 : 0) + (stock.price > d.ema200 ? 1 : 0);
  const parts: CamsPart[] = [
    stock.rvol >= 1.8
      ? { label: `RelVolum ${stock.rvol}x (≥1.8x ideal)`, pts: 24, active: true, detail: 'volumi i 3 ditëve të fundit vs mesatarja 20-ditore — mbi 1.8x = pjesëmarrje insticionale reale' }
      : stock.rvol >= 1.4
      ? { label: `RelVolum ${stock.rvol}x (mesatar)`, pts: 14, active: true, detail: 'volum mbi normale por nën konfirmimin e plotë 1.8x' }
      : { label: `RelVolum ${stock.rvol}x (nën 1.4x)`, pts: 24, active: false, detail: 'volum i ulët — tregu nuk po e konfirmon me para reale' },
    d.closeLocation >= 0.75
      ? { label: `Close në top ${Math.round(d.closeLocation * 100)}% të range-it ditor`, pts: 16, active: true, detail: 'mbyllja në të katërtën e sipërme ditore — blerësit kanë kontrollin e fundit të ditës' }
      : { label: `Close në ${Math.round(d.closeLocation * 100)}% të range-it`, pts: 16, active: false, detail: 'mbyllje e dobët — shitësit po ia dalin në fund të ditës; idealisht mbi 75%' },
    aboveCount === 3
      ? { label: 'Mbi EMA20, EMA50 dhe EMA200', pts: 20, active: true, detail: `çmimi ${stock.price} mbi gjithë mesataret — strukturë trendi e plotë në të tri afatet` }
      : aboveCount === 2
      ? { label: 'Mbi 2 nga 3 EMA-të kryesore', pts: 8, active: true, detail: 'i mungon një mesatare — strukturë e pjesshme, jo e plotë' }
      : { label: `Mbi ${aboveCount} nga 3 EMA-të`, pts: 20, active: false, detail: 'nën shumicën e mesatareve — trendi nuk është i konfirmuar' },
    (stock.ema20 > stock.ema50 && d.ema20Slope > 0 && d.ema50Slope > 0)
      ? { label: 'EMA20 mbi EMA50, të dyja me pjerrtësi rritëse', pts: 16, active: true, detail: `EMA20 +${d.ema20Slope}% dhe EMA50 +${d.ema50Slope}% në 10 ditë — trendi po përshpejtohet, jo vetëm ekziston` }
      : { label: 'Pjerrtësitë e EMA20/EMA50 jo konfirmuese', pts: 16, active: false, detail: `EMA20 ${d.ema20Slope > 0 ? '+' : ''}${d.ema20Slope}%, EMA50 ${d.ema50Slope > 0 ? '+' : ''}${d.ema50Slope}% — duhen të dyja rritëse me EMA20 mbi EMA50` },
    stock.sectorRankPct >= 85
      ? { label: `Top ${100 - stock.sectorRankPct}% e sektorit (20d)`, pts: 16, active: true, detail: 'udhëheqës i qartë i sektorit të vet — paratë po qëndrojnë në-theme' }
      : stock.sectorRankPct >= 70
      ? { label: `Në 30% të sipërme të sektorit`, pts: 8, active: true, detail: 'mbi mesatren e sektorit por jo udhëheqës' }
      : { label: `Renditur në top ${100 - stock.sectorRankPct}% të sektorit`, pts: 16, active: false, detail: 'nuk po e ndjek sektorin — idealisht top 15% (pikëza 85+)' },
    (d.ret5d > 0 && d.ret5d < 8)
      ? { label: `5-ditor +${d.ret5d}% — pa ekstension`, pts: 8, active: true, detail: 'rritje e shëndetshme javore (0–8%): mjaftueshme për moment, jo aq sa për t\u2019u zgjatur' }
      : { label: `5-ditor ${d.ret5d > 0 ? '+' : ''}${d.ret5d}%`, pts: 8, active: false, detail: 'duhet pozitive por nën 8% — mbi 8% në 5 ditë është ekstension që kërkon prit' },
  ];
  return (
    <CamsBreakdownCell
      label="Accelerimi" value={stock.accelerationScore} symbol={stock.symbol}
      icon={<Zap className="w-3.5 h-3.5 text-amber-400" />}
      parts={parts}
      footer="Peshon 25% në CAMS. Idealisht: mbi 65 = konfirmim i gjerë i tregut. Nën 40 = tregu nuk po e konfirmon katalizatorin."
    />
  );
}

function StructureCell({ stock }: { stock: CamsStock }) {
  const d = stock.diag;
  const breakoutToday = stock.price > d.high20 && stock.rvol >= 1.3;
  const nearHigh = stock.price >= d.high20 * 0.98;
  const pbShallow = d.pullbackDays >= 2 && d.pullbackDays <= 5 && stock.price > stock.ema20 && stock.price < d.ema10 * 1.02;
  const pbDeep = d.pullbackDays >= 2 && d.pullbackDays <= 5 && !pbShallow && stock.price > stock.ema50;
  const parts: CamsPart[] = [
    breakoutToday
      ? { label: `Breakout mbi 20d high ($${d.high20}) me volum`, pts: 30, active: true, detail: `çmimi ${stock.price} theu majën 20-ditore sot me RelVolum ${stock.rvol}x — hyrja: buy-stop mbi high-in e sotëm` }
      : nearHigh && stock.rvol >= 1.3
      ? { label: `Afër 20d high ($${d.high20}) me volum — ${(((stock.price / d.high20) - 1) * 100).toFixed(1)}% poshtë majës`, pts: 18, active: true, detail: `brenda 2% të majës 20-ditore me volum në ngjitje — po përgatitet thyerja` }
      : { label: `Larg majës 20-ditore ($${d.high20})`, pts: 30, active: false, detail: 'çmimi nuk është pranë zonës së thyerjes — pa trigger hyrjeje të afërt' },
    pbShallow
      ? { label: `Pullback ${d.pullbackDays}d në EMA10/20, trendi i mbajtur`, pts: 30, active: true, detail: `korektim i shëndetshëm drejt mesatareve — hyrja: limit në zonën EMA10/20 ($${d.ema10}–${stock.ema20})` }
      : pbDeep
      ? { label: `Pullback ${d.pullbackDays}d por më i thellë (mbi EMA50)`, pts: 15, active: true, detail: 'korektimi ka futur nën EMA20 — ende i kontrolluar por më i rrezikshëm' }
      : { label: `Pullback: ${d.pullbackDays} ditë rënie`, pts: 30, active: false, detail: 'duhet 2–5 ditë rënie drejt EMA10/20 pa prishur trendin për setup-in ideal' },
    (d.consolidationDays >= 3 && d.consolidationDays <= 10)
      ? { label: `Konsolidim i ngushtë ${d.consolidationDays}d`, pts: 20, active: true, detail: `ditë me range < 1.5 ATR — aksioni po thith volum pa lëvizur; hyrja mbi $${d.consolidationHigh}` }
      : { label: `Konsolidim: ${d.consolidationDays} ditë`, pts: 20, active: false, detail: 'duhen 3–10 ditë konsolidimi i ngushtë pas katalizatorit (modeli PEAD)' },
    (stock.rsi14 >= 55 && stock.rsi14 <= 72)
      ? { label: `RSI ${stock.rsi14} (zona e shëndetshme 55–72)`, pts: 10, active: true, detail: 'momentum i fortë por jo i mbikaluar — dhoma për vazhdim pa rrezik kthese të menjëhershme' }
      : { label: `RSI ${stock.rsi14}`, pts: 10, active: false, detail: 'jashtë zonës 55–72: nën 55 = i ftohtë, mbi 72 = i nxehtë për t\u2019u ndjekur i sigurt' },
    stock.adx14 > 20
      ? { label: `ADX ${stock.adx14} — trend funksional`, pts: 10, active: true, detail: 'forca e trendit mbi 20 — lëvizja ka drejtim, jo zhurmë' }
      : { label: `ADX ${stock.adx14} (nën 20)`, pts: 10, active: false, detail: 'trend i dobët/sideway — pa drejtim të qartë, breakout-et kanë më pak shanse' },
  ];
  return (
    <CamsBreakdownCell
      label="Struktura" value={stock.structureScore} symbol={stock.symbol}
      icon={<Layers className="w-3.5 h-3.5 text-blue-400" />}
      parts={parts}
      footer={`Setup-i i detektuar: ${stock.setup}. Peshon 20% në CAMS. Idealisht: mbi 60 = pikë hyrjeje e përcaktuar me stop real. Nën 40 = pa strukturë hyrjeje.`}
    />
  );
}

function RevisionCell({ stock }: { stock: CamsStock }) {
  const d = stock.diag;
  const rev = d.analystRevisionScore;
  const normalized = rev == null ? 50 : Math.round((rev + 100) / 2);
  const note = rev == null ? 'pa të dhëna' :
    rev >= 50 ? 'estimat po rriten fort (beats të përsëritura)' :
    rev >= 15 ? 'estimat po rriten' :
    rev <= -50 ? 'estimat po bien fort' :
    rev <= -15 ? 'estimat po bien' : 'estimat neutrale';
  const parts: CamsPart[] = [
    { label: 'Neutral baza', pts: 50, active: true, base: true, detail: 'pa të dhëna revisionsh, score-i qëndron neutral 50 — nuk ndikon as pozitiv as negativ' },
    rev == null
      ? { label: 'Pa të dhëna revisionsh (Alpha Vantage)', pts: 0, active: false, neutral: true, detail: 'kërkon API key — pa të, strategjia s\u2019gënjen me shifra artificiale' }
      : { label: `Revisionet e analistëve: ${rev > 0 ? '+' : ''}${rev}/100 — ${note}`, pts: normalized - 50, active: true, detail: 'ndryshimi i konsensusit të EPS-it për ardhmen — kur analistët ngrenë vlerësimet pas beats të përsëritura, fitimet vijnë më shpesh (drift-i i konsensusit)' },
  ];
  return (
    <CamsBreakdownCell
      label="Revisjonët" value={stock.revisionScore} symbol={stock.symbol}
      icon={<TrendingUp className="w-3.5 h-3.5 text-teal-400" />}
      parts={parts}
      footer="Peshon 10% në CAMS. Idealisht: mbi 60 = konsensusi po ngrihet. Nën 40 = konsensusi po bie — erë kundër."
    />
  );
}

function RegimeCell({ stock }: { stock: CamsStock }) {
  const d = stock.diag;
  const parts: CamsPart[] = [
    { label: `SPY ${d.spyAbove50 ? 'mbi' : 'nën'} SMA50`, pts: 15, active: d.spyAbove50, detail: 'indeksi i gjerë mbi mesataren 50-ditore — mjedisi afatmesëm për swing long' },
    { label: `SPY ${d.spyAbove200 ? 'mbi' : 'nën'} SMA200`, pts: 15, active: d.spyAbove200, detail: 'trendi afatgjatë — nën të, gjysma e momentum-eve dështojnë pa dallim' },
    { label: `QQQ ${d.qqqAbove50 ? 'mbi' : 'nën'} SMA50`, pts: 15, active: d.qqqAbove50, detail: 'teknologjia dhe kompanitë e rritjes — sektori që tërheq më shumë kapital momentum' },
    { label: `QQQ ${d.qqqAbove200 ? 'mbi' : 'nën'} SMA200`, pts: 15, active: d.qqqAbove200, detail: 'afatgjata e rritjes — kur është nën, kujdes i madh me kandidate rritjeje' },
    { label: `ETF e sektorit (${stock.sectorEtf}) ${d.sectorAbove50 ? 'mbi' : 'nën'} SMA50`, pts: 20, active: d.sectorAbove50, detail: 'sektori personal i aksionit — kursektori bie, edhe më të mirët bien me të' },
    d.sectorVsSpy20d > 2
      ? { label: `Sektori outperformon SPY me +${d.sectorVsSpy20d}% (20d)`, pts: 20, active: true, detail: 'paratë po hyjnë në këtë sektor — erë në shpinë për çdo kandidat brenda tij' }
      : d.sectorVsSpy20d > -2
      ? { label: `Sektori në linjë me SPY (${d.sectorVsSpy20d > 0 ? '+' : ''}${d.sectorVsSpy20d}%)`, pts: 10, active: true, detail: 'as përpara as pas — mbështetje neutrale' }
      : { label: `Sektori nënperformon SPY me ${d.sectorVsSpy20d}% (20d)`, pts: 0, active: false, detail: 'sektori po lë pas — kandidatët duan konfirmim ekstra' },
  ];
  return (
    <CamsBreakdownCell
      label="Regjimi" value={stock.regimeScore} symbol={stock.symbol}
      icon={<Shield className="w-3.5 h-3.5 text-emerald-400" />}
      parts={parts}
      footer="Peshon 10% në CAMS + mundëson/pezullon tregtinë. Idealisht: mbi 70 = mjedis mbështetës. Nën 40 = kundër-bashkë — në praktikë: vetëm A-kandidatë me konfirmim tëfortë."
    />
  );
}

// ── Treguesi bruto me popup: "çka ka bo dhe si duhet të jetë" ──

function IndChip({ label, value, tone, ideal, what, why }: {
  label: string; value: string; tone: 'good' | 'warn' | 'bad';
  ideal: string; what: string; why: string;
}) {
  const c = tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : 'text-red-400';
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={`font-semibold hover:underline decoration-dotted underline-offset-2 cursor-pointer ${c} group inline-flex items-center gap-0.5`}>
          {label} {value}
          <Info className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-72 sm:w-80 p-0 overflow-hidden">
        <div className="bg-gradient-to-b from-primary/10 to-transparent px-4 pt-3 pb-2">
          <p className="text-sm font-bold text-foreground">{label} — {value}</p>
        </div>
        <div className="px-4 pb-4 space-y-2.5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Çfarë ka bo?</p>
            <p className="text-[13px] leading-relaxed text-foreground/85">{what}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Si duhet të jetë?</p>
            <p className="text-[13px] leading-relaxed text-foreground/85">{ideal}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-400 mb-1">Pse ka rëndësi?</p>
            <p className="text-[13px] leading-relaxed text-foreground/85">{why}</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LevelBox({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`rounded-lg ${bg} border p-2 text-center`}>
      <p className={`text-[10px] ${color} font-medium`}>{label}</p>
      <p className={`text-[13px] font-bold ${color}`}>${value.toFixed(2)}</p>
    </div>
  );
}

// ═══ Task 20: Lajme & Negociata — çfarë po negociohet & impakti i ardhshëm ═══
// Për secilin kandidat Top 10: lajmet e fundit të analizuara — drejtimi
// (POZITIV/NEGATIV), pesha e ardhshme (LART/MESËM/ULËT) dhe nëse
// diçka po negociohet ende (nuk ka mbaruar = peshë e madhe e ardhshme).

interface NewsIntelItemUI {
  headline: string; source: string; publishedAt: string; url: string;
  categoryLabel: string;
  direction: 'POZITIV' | 'NEGATIV' | 'NEUTRAL';
  futureWeight: 'LART' | 'MESËM' | 'ULËT';
  status: 'NE_NEGOCIATE' | 'KONFIRMUAR' | 'INFO';
  impactNote: string;
  daysAgo: number | null;
}

interface NewsIntelApi {
  symbol: string;
  items: NewsIntelItemUI[];
  summary: {
    total: number; positive: number; negative: number; neutral: number;
    negotiating: number; highWeight: number;
    netBias: 'POZITIV' | 'NEGATIV' | 'NEUTRAL'; headline: string;
  };
  note?: string;
  error?: string;
}

function newsTimeAgo(daysAgo: number | null): string {
  if (daysAgo == null) return '';
  if (daysAgo === 0) return 'sot';
  if (daysAgo === 1) return 'dje';
  if (daysAgo <= 7) return `${daysAgo} ditë më parë`;
  return `${daysAgo} ditë`;
}

function NewsIntelSection({ symbol }: { symbol: string }) {
  const [data, setData] = useState<NewsIntelApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    (async () => {
      try {
        const res = await fetch(`/api/cams-news?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || json.error) { setFailed(true); setData(null); }
        else setData(json);
      } catch {
        if (!cancelled) { setFailed(true); setData(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [symbol]);

  if (loading) {
    return (
      <div className="mt-2 rounded-lg bg-blue-500/5 border border-blue-500/15 p-2.5 flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin flex-shrink-0" />
        <p className="text-[11.5px] text-muted-foreground">Duke marrë lajmet &amp; negociatat e fundit për {symbol}...</p>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="mt-2 rounded-lg bg-muted/5 border border-border/30 p-2.5 flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <p className="text-[11.5px] text-muted-foreground">Lajmet për {symbol} s&apos;u morën tani — provo skanimin sërish më vonë.</p>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="mt-2 rounded-lg bg-muted/5 border border-border/30 p-2.5 flex items-center gap-2">
        <Newspaper className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <p className="text-[11.5px] text-muted-foreground">S&apos;u gjetën lajme të fundit relevante për {symbol} — pa lajm nuk do të thotë problem, thjesht s&apos;ka ngjarje të reja.</p>
      </div>
    );
  }

  const s = data.summary;
  const shown = expanded ? data.items : data.items.slice(0, 3);

  return (
    <div className="mt-2 rounded-lg bg-blue-500/5 border border-blue-500/15 p-2.5">
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <Newspaper className="w-3.5 h-3.5 text-blue-400" />
        <p className="text-[12px] font-semibold text-blue-400">Lajme &amp; Negociata — çfarë po negociohet &amp; impakti</p>
        {s.positive > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-medium">▲ {s.positive} pozitive</span>}
        {s.negative > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/25 text-red-400 font-medium">▼ {s.negative} negative</span>}
        {s.negotiating > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300 font-medium">⏳ {s.negotiating} në negociatë</span>}
        {s.highWeight > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/25 text-violet-400 font-medium">{s.highWeight} me peshë të lartë</span>}
      </div>

      <div className="space-y-1.5">
        {shown.map((n, i) => (
          <div key={i} className="rounded-md bg-muted/5 border border-border/30 p-2 space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${n.direction === 'POZITIV' ? 'bg-emerald-500/15 text-emerald-400' : n.direction === 'NEGATIV' ? 'bg-red-500/15 text-red-400' : 'bg-muted/30 text-muted-foreground'}`}>
                {n.direction === 'POZITIV' ? '▲ POZITIV' : n.direction === 'NEGATIV' ? '▼ NEGATIV' : '● NEUTRAL'}
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${n.futureWeight === 'LART' ? 'bg-violet-500/15 text-violet-400' : n.futureWeight === 'MESËM' ? 'bg-amber-500/10 text-amber-400' : 'bg-muted/20 text-muted-foreground'}`}>
                {n.futureWeight === 'LART' ? 'PESHA E LARTË' : n.futureWeight === 'MESËM' ? 'PESHË MESËM' : 'PESHË E ULËT'}
              </span>
              {n.status === 'NE_NEGOCIATE' && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" /> NË NEGOCIATË / PRITË
                </span>
              )}
              <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border/30 text-muted-foreground">{n.categoryLabel}</span>
              <span className="ml-auto text-[10px] text-muted-foreground flex-shrink-0">{newsTimeAgo(n.daysAgo)}</span>
            </div>
            <a href={n.url} target="_blank" rel="noopener noreferrer" className="block text-[12px] font-medium text-foreground hover:text-blue-400 leading-snug">
              {n.headline}
              <ExternalLink className="w-2.5 h-2.5 inline ml-1 opacity-40" />
            </a>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{n.impactNote}</p>
            <p className="text-[10px] text-muted-foreground/60">Burimi: {n.source}</p>
          </div>
        ))}
      </div>

      {data.items.length > 3 && (
        <button onClick={() => setExpanded(!expanded)} className="mt-2 text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1">
          {expanded ? 'Shfaq më pak' : `Shiko të gjitha lajmet (${data.items.length})`}
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      )}

      <p className="mt-2 text-[10px] text-muted-foreground/60 border-t border-border/20 pt-1.5">
        {data.note || 'Analizë automatike e titujve — verifiko gjithmonë në burim.'}
      </p>
    </div>
  );
}

// ── Karta CAMS ──

function CamsCard({ stock }: { stock: CamsStock }) {
  const tc = TIER_CONFIG[stock.tier] || TIER_CONFIG.NO_TRADE;
  const scoreColor = stock.camsScore >= 80 ? 'text-emerald-400' : stock.camsScore >= 70 ? 'text-amber-400' : stock.camsScore >= 60 ? 'text-blue-400' : 'text-red-400';

  return (
    <Card className={`border-border/50 bg-card ${stock.tier === 'A_KANDIDAT' ? 'border-emerald-500/30' : ''}`}>
      <CardContent className="p-4">
        {/* Rreshti i sipërm */}
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${stock.rank <= 3 ? 'bg-violet-500/20 text-violet-400' : 'bg-muted/30 text-muted-foreground'}`}>{stock.rank}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-base text-foreground">{stock.symbol}</span>
              <Badge variant="outline" className="text-[11px] px-2 py-0.5 border-border/30 text-muted-foreground">{stock.sector}</Badge>
              <Badge variant="outline" className={`text-[11px] px-2 py-0.5 font-semibold ${tc.bg} ${tc.text} ${tc.border}`}>{tc.label}</Badge>
              <Badge variant="outline" className="text-[11px] px-2 py-0.5 border-violet-500/30 text-violet-400 bg-violet-500/10">
                {SETUP_LABEL[stock.setup]}
              </Badge>
              {stock.extensionFiltered && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-500/40 text-orange-400 bg-orange-500/10">⚠ E ZGJATUAR {stock.extensionAtr.toFixed(1)} ATR</Badge>
              )}
            </div>
            <p className="text-[12px] text-muted-foreground mt-1 flex flex-wrap items-center gap-x-1.5">
              <span>${stock.price.toFixed(2)}</span>
              <span>·</span>
              <IndChip
                label="RVol" value={`${stock.rvol}x`}
                tone={stock.rvol >= 1.8 ? 'good' : stock.rvol >= 1.4 ? 'warn' : 'bad'}
                what={`Volumi i 3 ditëve të fundit është ${stock.rvol}x mesatarja 20-ditore e këtij aksioni.`}
                ideal="Të paktën 1.8x — volumi në ngjitje konfirmon interesin real të tregut; nën 1.4x = konfirmim i dobët."
                why="Pa volum, lëvizjet e çmimit janë të pabesueshme — mund të manipulohen lehtë dhe s'kanë ndjekës institucionalë. Volumi është 'gjurmë e këmbëve' të parave të mëdha."
              />
              <span>·</span>
              <IndChip
                label="RSI" value={`${stock.rsi14}`}
                tone={stock.rsi14 >= 55 && stock.rsi14 <= 72 ? 'good' : stock.rsi14 >= 45 && stock.rsi14 < 55 ? 'warn' : stock.rsi14 > 72 ? 'warn' : 'bad'}
                what={`Indeksi i forcës relative (14 ditë): momenti aktual i blerjes/shitjes = ${stock.rsi14}.`}
                ideal="55–72 për këtë strategji: i fortë por jo i mbikaluar. Nën 45 = i ftohtë. Mbi 72 = i nxehtë — prit konsolidim ose pullback."
                why="RSI tregon nëse aksioni është i mbishitur në afat të shkurtër — kandidatët idealë e kanë momentum pa qenë ende të ekstrem."
              />
              <span>·</span>
              <IndChip
                label="ADX" value={`${stock.adx14}`}
                tone={stock.adx14 > 25 ? 'good' : stock.adx14 > 20 ? 'warn' : 'bad'}
                what={`Forca e trendit (14 ditë) = ${stock.adx14}.`}
                ideal="Mbi 25 = trend i fortë e i qëndrueshëm. 20–25 = funksional. Nën 20 = treg i ngatërruar (sideway) — breakout-et dështojnë më shpesh."
                why="ADX nuk tregon drejtimin por forcën: sa bindshëm është lëvizja. Trendet e forta vazhdojnë, të dobëtat kthehen."
              />
              <span>·</span>
              <IndChip
                label="Top" value={`${100 - stock.sectorRankPct}% sektor`}
                tone={stock.sectorRankPct >= 85 ? 'good' : stock.sectorRankPct >= 70 ? 'warn' : 'bad'}
                what={`Rendimenti 20-ditor i aksionit renditet në ${100 - stock.sectorRankPct}% e sipërme të sektorit ${stock.sector}.`}
                ideal="Top 15% e sektorit — udhëheqësi që paratë po ndjekin, jo ndjekësi."
                why="Kur aksioni ecën përpara sektorit, kjo tregon forcë të vërtetë të kompanisë (jo vetëm valën e sektorit)."
              />
              <span>·</span>
              <IndChip
                label="20d" value={`${stock.ret20d > 0 ? '+' : ''}${stock.ret20d}%`}
                tone={stock.ret20d > 0 && stock.ret20d < 20 ? 'good' : stock.ret20d >= 20 ? 'warn' : 'bad'}
                what={`Rendimenti i 20 ditëve të fundit: ${stock.ret20d > 0 ? '+' : ''}${stock.ret20d}%.`}
                ideal="Pozitiv por i kontrolluar (0–20%) — rritje që tregon momentum pa qenë vertikale."
                why="Kjo është baza e momentum-it afatmesëm — por rritje mbi 20% në muaj shpesh sjell korektim para se të vazhdojë."
              />
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <div className={`text-2xl font-bold ${scoreColor}`}>{stock.camsScore}</div>
            <div className="text-[10px] text-muted-foreground">CAMS</div>
          </div>
        </div>

        {/* Formula e dukshme */}
        <div className="mt-2 text-[10.5px] text-muted-foreground/80 font-mono bg-muted/10 rounded px-2 py-1">
          0.35×{stock.catalystScore} + 0.25×{stock.accelerationScore} + 0.20×{stock.structureScore} + 0.10×{stock.revisionScore} + 0.10×{stock.regimeScore}
          {stock.penalty > 0 ? ` − ${stock.penalty} penalty` : ''} = {stock.camsScore}
        </div>

        {/* Sub-score-t (5) — me zbërthim konkret me klik */}
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          <CatalystCell stock={stock} />
          <AccelerationCell stock={stock} />
          <StructureCell stock={stock} />
          <RevisionCell stock={stock} />
          <RegimeCell stock={stock} />
        </div>

        {/* Plani i tregtimit */}
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          <LevelBox label="ENTRY" value={stock.entry} color="text-blue-400" bg="bg-blue-500/5 border-blue-500/15" />
          <LevelBox label="STOP" value={stock.stop} color="text-red-400" bg="bg-red-500/5 border-red-500/15" />
          <LevelBox label="1R" value={stock.target1R} color="text-emerald-400" bg="bg-emerald-500/5 border-emerald-500/10" />
          <LevelBox label="2R" value={stock.target2R} color="text-emerald-400" bg="bg-emerald-500/5 border-emerald-500/15" />
          <LevelBox label="3R" value={stock.target3R} color="text-emerald-300" bg="bg-emerald-500/10 border-emerald-500/30" />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Rreziku {stock.riskPct.toFixed(1)}% · {stock.riskBudgetPct}% llogarisë (${stock.riskDollars})</span>
          <span>{stock.positionSize} aksione ≈ ${stock.positionValue.toLocaleString()}</span>
        </div>

        {/* Evidenca e katalizatorit */}
        {stock.catalystEvidence.length > 0 && (
          <div className="mt-3 rounded-lg bg-violet-500/5 border border-violet-500/15 p-2.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Flame className="w-3.5 h-3.5 text-violet-400" />
              <p className="text-[12px] font-semibold text-violet-400">Katalizatori — pse ky kandidat</p>
            </div>
            <ul className="space-y-1">
              {stock.catalystEvidence.map((ev, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11.5px] text-foreground/80 leading-snug">
                  <CheckCircle2 className="w-3 h-3 text-violet-400 mt-0.5 flex-shrink-0" />
                  <span>{ev}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Lajme & Negociata — Task 20: çfarë po negociohet, lajme me peshë, impakti pozitiv/negativ */}
        <NewsIntelSection symbol={stock.symbol} />

        {/* Paralajmërimet */}
        {stock.warnings.length > 0 && (
          <div className="mt-2 rounded-lg bg-orange-500/5 border border-orange-500/20 p-2.5">
            {stock.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[11.5px] text-orange-300 leading-snug">
                <AlertTriangle className="w-3 h-3 text-orange-400 mt-0.5 flex-shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* Invalidimi */}
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground/70">
          <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span><strong className="text-muted-foreground">Invalidimi:</strong> {stock.invalidation}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Komponenti kryesor ──

export function CAMSStrategy() {
  const [data, setData] = useState<CamsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runScan = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cams-scan', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || `Gabim HTTP ${res.status}`);
      } else {
        setData(json);
      }
    } catch (e: any) {
      setError(e?.message || 'Lidhja dështoi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Vetëm scan manual — skanimi zgjat ~1 min (400 aksione + enrichment)
  }, []);

  const regimeOk = data?.regime.ok;

  return (
    <div className="space-y-4">
      {/* Header — strategjia */}
      <Card className="border-violet-500/20 bg-violet-500/5">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-violet-500/15 rounded-lg p-2.5"><Crosshair className="w-6 h-6 text-violet-400" /></div>
            <div>
              <h2 className="text-lg font-bold text-foreground">CAMS — Catalyst, Acceleration, Momentum & Structure</h2>
              <p className="text-[13px] text-muted-foreground">Nuk parashikon çmimin — identifikon kombinimin e sinjaleve që paraprin lëvizje të forta</p>
            </div>
          </div>
          <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
            <strong className="text-foreground">CAMS = 0.35·C + 0.25·A + 0.20·S + 0.10·R + 0.10·M − P</strong> — Katalizator fundamental
            (earnings beat, 8-K, PEAD drift) + konfirmimi i tregut (volum, trend, forcë sektoriale) + struktura e hyrjes +
            revisjonet e analistëve + regjimi i tregut − penalitetet e riskut.
          </p>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-medium">80–100: A-Kandidat — vetëm me trigger teknik</span>
            <span className="px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-400 font-medium">70–79: Watchlist — prit pullback/breakout</span>
            <span className="px-2 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400 font-medium">60–69: Vetëm monitorim</span>
            <span className="px-2 py-1 rounded-full bg-red-500/10 border border-red-500/25 text-red-400 font-medium">&lt;60: Mos e tregto</span>
          </div>
        </CardContent>
      </Card>

      {/* Skanimi */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-blue-400" />
              <div>
                <h3 className="text-[15px] font-bold text-foreground">CAMS Scanner — 400 Aksione</h3>
                <p className="text-[12px] text-muted-foreground">
                  400 → likuiditet (&gt;$5, &gt;1M vol, &gt;$20M dolvol) → katalizator → score → enrichment EPS → Top 10 (max 2/sektor)
                </p>
              </div>
            </div>
            <button
              onClick={runScan}
              disabled={loading}
              className="flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Duke skanuar (~1 min)...' : 'Nis Skanimin'}
            </button>
          </div>
          {loading && (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <p className="text-[11px] text-muted-foreground">Fetch 400 aksione nga Yahoo + enrichment EPS nga Alpha Vantage — durim...</p>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="p-4 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5" />
            <div>
              <p className="text-[13px] font-semibold text-red-400">Gabim në skanim</p>
              <p className="text-[12px] text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* Regjimi */}
          <Card className={`${regimeOk ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Shield className={`w-4 h-4 ${regimeOk ? 'text-emerald-400' : 'text-red-400'}`} />
                <p className={`text-[13px] font-semibold ${regimeOk ? 'text-emerald-400' : 'text-red-400'}`}>
                  {regimeOk ? 'REGJIMI OK — mjedis mbështetës' : 'REGJIMI JO OK — kujdes ekstra'}
                </p>
                <span className="ml-auto text-[11px] text-muted-foreground">Skruar {new Date(data.scannedAt).toLocaleTimeString('sq-AL')} · {data.durationSec}s</span>
              </div>
              <div className="mt-2 flex gap-4 text-[12px] text-muted-foreground">
                <span>SPY: <span className={data.regime.spy.above50 ? 'text-emerald-400' : 'text-red-400'}>{data.regime.spy.above50 ? 'Mbi 50' : 'Nën 50'}</span> · <span className={data.regime.spy.above200 ? 'text-emerald-400' : 'text-red-400'}>{data.regime.spy.above200 ? 'Mbi 200' : 'Nën 200'}</span></span>
                <span>QQQ: <span className={data.regime.qqq.above50 ? 'text-emerald-400' : 'text-red-400'}>{data.regime.qqq.above50 ? 'Mbi 50' : 'Nën 50'}</span> · <span className={data.regime.qqq.above200 ? 'text-emerald-400' : 'text-red-400'}>{data.regime.qqq.above200 ? 'Mbi 200' : 'Nën 200'}</span></span>
              </div>
            </CardContent>
          </Card>

          {/* Funnel */}
          <Card>
            <CardContent className="p-4">
              <p className="text-[12px] font-semibold text-muted-foreground mb-2">Funnel-i</p>
              <div className="flex items-center gap-2 flex-wrap text-[12px]">
                <span className="px-2 py-1 rounded-md bg-muted/30">{data.funnel.universe} univers</span>
                <span className="text-muted-foreground">→</span>
                <span className="px-2 py-1 rounded-md bg-muted/30">{data.funnel.withData} me të dhëna</span>
                <span className="text-muted-foreground">→</span>
                <span className="px-2 py-1 rounded-md bg-blue-500/10 text-blue-400">{data.funnel.passedLiquidity} likuide</span>
                <span className="text-muted-foreground">→</span>
                <span className="px-2 py-1 rounded-md bg-violet-500/10 text-violet-400">{data.funnel.withCatalyst} me katalizator</span>
                <span className="text-muted-foreground">→</span>
                <span className="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400">{data.funnel.scored60plus} score 60+</span>
                <span className="text-muted-foreground">→</span>
                <span className="px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-300 font-semibold">Top {data.funnel.displayed}</span>
              </div>
              <p className="text-[11px] text-muted-foreground/70 mt-2">
                {data.enrichment.note} · Max 2 aksione për sektor · Rregullat e riskut: 0.25–0.75% për tregti.
              </p>
            </CardContent>
          </Card>

          {/* Rezultatet */}
          {data.results.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <Eye className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-[13px] text-muted-foreground">Asnjë kandidat nuk kaloi kushtet CAMS sot.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {data.results.map((s) => <CamsCard key={s.symbol} stock={s} />)}
            </div>
          )}
        </>
      )}

      {/* Rregullat e riskut — gjithmonë të dukshme */}
      <Card className="border-red-500/15 bg-red-500/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <ShieldAlert className="w-4 h-4 text-red-400" />
            <h3 className="text-[14px] font-bold text-foreground">Rregullat e Riskut — CAMS</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[
              { t: 'Rreziko 0.25–0.75% të kapitalit', d: 'Aksione volatile/small-cap (ATR > 4.5% ose të zgjatura): maksimum 0.25% — ose mos i përfshi fare.' },
              { t: 'Stop-loss teknik', d: 'Nën low-in e pullback-ut ose 1.5×ATR(14) nën entry — cilado është më e ngushtë. Kurrë pa stop.' },
              { t: 'Target minimumi 2R', d: 'Merr një pjesë në 2R, lëre restin me trailing stop nën EMA10 ose low-in e ditës paraprake. 3R = dalje e plotë.' },
              { t: 'Max 2 aksione të njëjtin sektor', d: 'CRM, VEEV dhe një software tjetër bien bashkë — diversifikim i ekspozimit narrativ.' },
              { t: 'Mos ble vetëm sepse ka bërë +40%', d: 'Vetëm me katalizator + trend + hyrje të përcaktuar. Extension filter: mbi 2 ATR mbi EMA20 → prit konsolidim.' },
              { t: 'Mos hyr në ditën e earnings', d: 'Earnings brenda 24 orësh = pa pozicion të re. PEAD hyn PAS rapportimit, kur konsolidohet.' },
            ].map((r, i) => (
              <div key={i} className="rounded-lg bg-muted/10 border border-border/30 p-3">
                <p className="text-[12.5px] font-semibold text-foreground mb-1">{r.t}</p>
                <p className="text-[11.5px] text-muted-foreground leading-relaxed">{r.d}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg bg-blue-500/5 border border-blue-500/15 p-3">
            <div className="flex items-start gap-2">
              <Gauge className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-[12px] text-blue-300/90 leading-relaxed">
                <strong>Shembull i formatit të output-it:</strong> "DELL — CAMS 88/100 — Setup: PEAD continuation. Arsye: beat i madh në revenue/EPS, kërkesë AI-server, guidance e ngritur, volum i fortë, trend mbi EMA20/50/200. Hyrje: vetëm mbi high-in e konsolidimit ose në pullback drejt EMA10/20. Invalidation: close nën EMA20 me volum ose ulje e guidance." — Probabilitet, jo premtime fitimi.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
