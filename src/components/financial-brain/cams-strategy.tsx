'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  TrendingUp, AlertTriangle, CheckCircle2, XCircle, Target, BarChart3,
  RefreshCw, Activity, Info, Loader2, Zap, Shield, ShieldAlert, Flame,
  Trophy, Eye, Crosshair, Gauge,
} from 'lucide-react';
import { useState, useEffect } from 'react';

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

const SUBSCORE_DETAILS: Record<string, { desc: string; ideal: string }> = {
  'Katalizatori': {
    desc: 'Pse duhet të vazhdojë lëvizja: EPS beat mbi konsensus (deri +30), reagimi i tregut — gap-up ≥3% me volum ≥1.5x (deri +30), 8-K materiale pozitive (+20), dhe drift-i pas katalizatorit — çmimi mban gap-in dhe EMA20 (deri +20). EPS miss −25.',
    ideal: 'mbi 60 = katalizator i forta. Nën 40 = pa themel fundamental.',
  },
  'Accelerimi': {
    desc: 'Tregu po e konfirmon: RelVolum ≥1.8x (+24), close në 25% të sipërm të range-it (+16), mbi EMA20/50/200 (+20), EMA20>EMA50 me pjerrtësi (+16), top 15% e sektorit 20d (+16), 5d pozitiv pa ekstension (+8).',
    ideal: 'mbi 65 = konfirmim i gjerë. Nën 40 = tregu nuk po konfirmon.',
  },
  'Struktura': {
    desc: 'Setup-i i hyrjes: breakout 20d high me volum (+30), pullback 2–5d në EMA10/20 me trend të mbajtur (+30), konsolidim i ngushtë 3–10d (+20), RSI 55–72 (+10), ADX>20 (+10).',
    ideal: 'mbi 60 = setup i qartë. Nën 40 = pa pikë hyrjeje të përcaktuar.',
  },
  'Revisjonët': {
    desc: 'Prirja e vlerësimeve të analistëve (EPS estimates): 4/4 beats → rritje e konsensusit. Normalizuar nga −100..+100 në 0..100. Pa të dhëna = 50 (neutral).',
    ideal: 'mbi 60 = konsensusi po ngrihet. Nën 40 = konsensusi po bie.',
  },
  'Regjimi': {
    desc: 'SPY mbi SMA50/200 (+15/+15), QQQ mbi SMA50/200 (+15/+15), ETF e sektorit mbi SMA50 (+20), sektori outperformon SPY 20d (+20).',
    ideal: 'mbi 70 = mjedis mbështetës. Nën 40 = kundër-bashkë.',
  },
};

// ── Komponentë të vegjël ──

function SubScoreCell({ label, value }: { label: string; value: number }) {
  const c = value >= 70 ? 'text-emerald-400' : value >= 50 ? 'text-amber-400' : 'text-red-400';
  const detail = SUBSCORE_DETAILS[label];
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

function LevelBox({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`rounded-lg ${bg} border p-2 text-center`}>
      <p className={`text-[10px] ${color} font-medium`}>{label}</p>
      <p className={`text-[13px] font-bold ${color}`}>${value.toFixed(2)}</p>
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
            <p className="text-[12px] text-muted-foreground mt-1">
              ${stock.price.toFixed(2)} · RVol {stock.rvol}x · RSI {stock.rsi14} · ADX {stock.adx14} · Top {100 - stock.sectorRankPct}% sektor · 20d {stock.ret20d > 0 ? '+' : ''}{stock.ret20d}%
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

        {/* Sub-score-t (5) */}
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          <SubScoreCell label="Katalizatori" value={stock.catalystScore} />
          <SubScoreCell label="Accelerimi" value={stock.accelerationScore} />
          <SubScoreCell label="Struktura" value={stock.structureScore} />
          <SubScoreCell label="Revisjonët" value={stock.revisionScore} />
          <SubScoreCell label="Regjimi" value={stock.regimeScore} />
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
