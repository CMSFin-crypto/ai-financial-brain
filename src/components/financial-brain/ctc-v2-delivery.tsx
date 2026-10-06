'use client';

// ═══════════════════════════════════════════════════════════════
// CTC v2 — Delivery (tab i veçantë, kërkesë e userit: «të jetë në
// vete, mos të përzihet me të gjitha strategjitë»)
//
// Këtu jeton VETËM strategjia «Trend Continuation Swing v2» në
// pamjen e saj delivery: skanim funnel → kandidatë delivery (READY
// me Bracket Order) → WATCHLIST → Ditari Top 10.
//
// Mjetet mbetën te tab-i IBKR (zero zhvendosje, zero rrezik):
// Learning Engine, Kërko Aksion, IBKR Validation Lab, referencat.
// Ripërdor karta të njëjta burim (FunnelViz, SectorDonut, StockCard,
// RegimeBanner — të eksportuara nga ibkr-strategy.tsx) që të mos
// dyfishohet asnjë logjikë.
// ═══════════════════════════════════════════════════════════════

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp, CheckCircle2, Eye, RefreshCw, AlertTriangle, Inbox, Activity,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { TermPop } from './metric-pop';
import { FunnelViz, SectorDonut, StockCard, RegimeBanner, Top10JournalCard } from './ibkr-strategy';
import type { FunnelResponse } from '@/app/api/ibkr-scan/route';
import type { FundamentalReport } from '@/lib/fundamentals/normalize';

export function CTCDelivery() {
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [didScan, setDidScan] = useState(false);

  // TASK 26 (i trashëguar nga pamja IBKR): Fundamental Context për
  // kandidatët e shfaqur — jo-blokues, karta vizatohen menjëherë.
  const [fundReports, setFundReports] = useState<Record<string, FundamentalReport>>({});
  const [fundLoading, setFundLoading] = useState(false);

  const runScan = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/ibkr-scan?_t=' + Date.now(), { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gabim');
      setData(json); setDidScan(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gabim rrjeti');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { runScan(); }, [runScan]);

  // Fundamentet për kandidatët e skanimit (një thirrje e vetme, cache 15 min në server)
  useEffect(() => {
    const syms: string[] = (data?.results || []).map(r => r.symbol).slice(0, 15);
    if (syms.length === 0) return;
    let cancelled = false;
    setFundLoading(true);
    fetch(`/api/fundamental-context?symbols=${syms.join(',')}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (!cancelled && j?.results) setFundReports(j.results);
      })
      .catch(() => { /* fundamentet mungojnë → N/A, jo error fatal */ })
      .finally(() => { if (!cancelled) setFundLoading(false); });
    return () => { cancelled = true; };
  }, [data]);

  const readyStocks = data?.results.filter(r => r.decision === 'READY') || [];
  const otherStocks = data?.results.filter(r => r.decision !== 'READY') || [];

  return (
    <div className="space-y-4">
      {/* Shënimi i tab-it të dedikuar */}
      <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-[12px] text-muted-foreground flex items-start gap-2">
        <TrendingUp className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
        <span>
          Tab i dedikuar për strategjinë <strong className="text-emerald-400">CTC v2 — Delivery</strong>: skanimi, kandidatët dhe ditari janë këtu të izoluar.
          Mjetet ndihmëse (Learning Engine, Kërko Aksion, Validation Lab) mbeten te tab-i <strong className="text-foreground">IBKR</strong> — asnjë përzierje.
        </span>
      </div>

      {/* Overview — strategjia delivery */}
      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-emerald-500/15 rounded-lg p-2.5"><TrendingUp className="w-6 h-6 text-emerald-400" /></div>
            <div>
              <h2 className="text-lg font-bold text-foreground">CTC v2 — <span className="text-emerald-400">Delivery</span></h2>
              <p className="text-[13px] text-muted-foreground">Trend Continuation Swing v2 · pozicione swing «delivery» 1–10 ditë — jo intraday</p>
            </div>
          </div>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            Swing trading i rregulluar nga trendi — çdo kandidat delivery kalon funnel-in:
            <strong className="text-foreground"> Bazë core (~200 US-domestic) → Top-kuintil likuiditet → Trend → Setup (vetëm TREND_CONT) → Risk+Gap Gate → Top 1–5</strong>.
            Komponimi i score-it:{' '}
            <TermPop term="w_trend" iconClass="w-2.5 h-2.5"><Badge variant="outline" className="mx-0.5 text-[11px] border-blue-500/30 text-blue-400 bg-blue-500/10">15% Trend</Badge></TermPop>+
            <TermPop term="w_rs" iconClass="w-2.5 h-2.5"><Badge variant="outline" className="mx-0.5 text-[11px] border-violet-500/30 text-violet-400 bg-violet-500/10">25% RS</Badge></TermPop>+
            <TermPop term="w_momentum" iconClass="w-2.5 h-2.5"><Badge variant="outline" className="mx-0.5 text-[11px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10">15% Momentum</Badge></TermPop>+
            <TermPop term="w_volum" iconClass="w-2.5 h-2.5"><Badge variant="outline" className="mx-0.5 text-[11px] border-cyan-500/30 text-cyan-400 bg-cyan-500/10">15% Volum</Badge></TermPop>+
            <TermPop term="w_setup" iconClass="w-2.5 h-2.5"><Badge variant="outline" className="mx-0.5 text-[11px] border-amber-500/30 text-amber-400 bg-amber-500/10">10% Setup</Badge></TermPop>+
            <TermPop term="w_likuiditet" iconClass="w-2.5 h-2.5"><Badge variant="outline" className="mx-0.5 text-[11px] border-sky-500/30 text-sky-400 bg-sky-500/10">10% Likuiditet</Badge></TermPop>+
            <TermPop term="w_risk" iconClass="w-2.5 h-2.5"><Badge variant="outline" className="mx-0.5 text-[11px] border-red-500/30 text-red-400 bg-red-500/10">10% Risk</Badge></TermPop>
          </p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
            <div className="rounded-lg bg-muted/20 border border-border/40 px-3 py-2">
              <TermPop term="politika_setup" iconClass="w-2.5 h-2.5">
                <span className="text-muted-foreground">Politika e setup-it (10-vjeçar): </span>
                <strong className="text-emerald-400">TREND_CONT i vetmi i tregtueshëm</strong>
                <span className="text-muted-foreground"> (+$2.7K) — PULLBACK (-$12.3K) dhe BREAKOUT (-$2.2K) vetëm WATCHLIST</span>
              </TermPop>
            </div>
            <div className="rounded-lg bg-muted/20 border border-border/40 px-3 py-2">
              <TermPop term="frekuenca" iconClass="w-2.5 h-2.5">
                <span className="text-muted-foreground">Frekuenca: </span>
                <strong className="text-emerald-400">max 3 pozicione · 1/sektor · 10-ditë cooldown/simbol</strong>
                <span className="text-muted-foreground"> — kundër kostove (hanin 149% të fitimit bruto)</span>
              </TermPop>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Skanimi live — funnel i njëjtë si IBKR (një API, zero dyfishim logjike) */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-blue-400" />
              <div>
                <h3 className="text-[15px] font-bold text-foreground">Funnel Scanner — Univers Core <span className="text-emerald-400">v2</span> (~200)</h3>
                <p className="text-[13px] text-muted-foreground">Kandidatët delivery: bazë core US-domestic (~200) → top-kuintil dollar-vol → trend → vetëm TREND_CONT → risk+gap gate → max 3 pozicione</p>
              </div>
            </div>
            <button onClick={runScan} disabled={loading} className="flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Duke skanuar...' : 'Rifresko'}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Gjendja e gabimit */}
      {error && (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="p-4 flex items-center gap-2 text-[13px] text-red-400">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Skanimi dështoi: {error}</span>
          </CardContent>
        </Card>
      )}

      {/* Rezultatet — funnel, regime, sektoret */}
      {data && (
        <div className="space-y-4">
          <FunnelViz funnel={data.funnel} />
          <p className="text-[11px] text-muted-foreground">
            Skanuar: {new Date(data.scannedAt).toLocaleTimeString('sq-AL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
          <RegimeBanner regimeDetail={data.regimeDetail} regimeOk={data.regimeOk} />
          <SectorDonut sectorExposure={data.sectorExposure} />

          {/* READY — kandidatët delivery */}
          {readyStocks.length > 0 && (
            <div className="space-y-3">
              <p className="text-[13px] text-emerald-400 font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <TermPop term="ready" iconClass="w-3 h-3">READY — Kandidate Delivery, Bracket Order gati ({readyStocks.length})</TermPop>
              </p>
              {readyStocks.map((s, i) => <StockCard key={s.symbol} stock={s} rank={i + 1} fund={fundReports[s.symbol]} fundLoading={fundLoading} />)}
            </div>
          )}

          {/* WATCHLIST / EVENT RISK */}
          {otherStocks.length > 0 && (
            <div className="space-y-3">
              <p className="text-[13px] text-amber-400 font-medium flex items-center gap-2">
                <Eye className="w-4 h-4" />
                <TermPop term="watchlist" iconClass="w-3 h-3">WATCHLIST / EVENT RISK ({otherStocks.length})</TermPop>
              </p>
              {otherStocks.map((s, i) => <StockCard key={s.symbol} stock={s} rank={readyStocks.length + i + 1} fund={fundReports[s.symbol]} fundLoading={fundLoading} />)}
            </div>
          )}

          {/* Pa rezultate */}
          {didScan && data.results.length === 0 && !error && (
            <Card className="border-border/50 bg-muted/5">
              <CardContent className="p-6 text-center text-[13px] text-muted-foreground flex flex-col items-center gap-2">
                <Inbox className="w-5 h-5" />
                <span>Skanimi sot s&rsquo;prodhoi kandidatë delivery — filtrat e funnel-it i larguan të gjithë. Diagnoza e hollësishme e funnel-it gjendet te tab-i <strong className="text-foreground">IBKR</strong>.</span>
              </CardContent>
            </Card>
          )}

          {/* Ditari Top 10 — journal i tregtive delivery të kësaj strategjie */}
          <Top10JournalCard />
        </div>
      )}
    </div>
  );
}
