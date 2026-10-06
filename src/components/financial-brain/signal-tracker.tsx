'use client';

// ═══════════════════════════════════════════════════════════════════
// GJURMUESI — Ditari i Sinjaleve (CTC & REV, të ndara)
// ═══════════════════════════════════════════════════════════════════
// Faqja e ditarit deskriptiv:
//   A. Lista e ditës — filtra Sot/1–5 ditë + strategji; simboli, mosha,
//      statusi, % e rrugës drejt target-it, R aktual, shiriti stop→hyrje→target.
//   B. Statistikat sipas horizontit — rresht d1..d5 për CTC dhe REV:
//      n, % target kumulative, % stop kumulative, % open, R mesatar/median
//      në close, MFE/MAE mesatare, fitimi % pas kostos C.
//   C. Ndarje shtesë — sipas sektorit dhe sipas regjimit (TRENDING /
//      TRANSITIONAL / CHOP).
//
// RREGULLAT E LEXIMIT (spec Seksioni 5):
//   • Nën 30 sinjale → "kampion i vogël, mos nxirr përfundime".
//   • KY ditar NUK përdoret për të tunuar target/stop/pragje.
//   • Krahaso me paper trading dhe OOS të Validation Lab.
// API: /api/signal-journal (GET) · Job A: /api/signal-journal/register ·
// Job B: /api/signal-journal/evaluate
// ═══════════════════════════════════════════════════════════════════

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  RefreshCw, Loader2, AlertTriangle, Info, Target, Shield, Clock,
  TrendingUp, ListChecks, BarChart3, Layers, Ban, Flag,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { TermPop, ThInfoPop, TERM_INFO } from './metric-pop';

// ── Tipet (pasqyrë e /api/signal-journal) ──

interface JournalCheckpoint {
  date: string;
  close: number;
  highSoFar: number;
  lowSoFar: number;
  rAtClose: number;
  mfeR: number;
  maeR: number;
  status: string | null;
}

interface JournalEntry {
  id: string;
  strategy: string;
  symbol: string;
  companyName: string | null;
  sector: string | null;
  signalDate: string;
  entryDate: string | null;
  entry: number | null;
  stop: number | null;
  target: number | null;
  score: number | null;
  regime: string | null;
  noSlot: boolean;
  slotNote: string | null;
  checkpoints: Partial<Record<'d1' | 'd2' | 'd3' | 'd4' | 'd5', JournalCheckpoint>> | null;
  finalStatus: string | null;
  finalDate: string | null;
  finalDayN: number | null;
  exitPrice: number | null;
  resultR: number | null;
  mfeR: number | null;
  maeR: number | null;
  pnlPctNet: number | null;
}

interface StatRow {
  n: number;
  targetPct: number;
  stopPct: number;
  openPct: number;
  meanR: number | null;
  medianR: number | null;
  meanMfe: number | null;
  meanMae: number | null;
  meanPnlNet: number | null;
  smallSample: boolean;
}

type StatTable = Record<'d1' | 'd2' | 'd3' | 'd4' | 'd5', StatRow>;

interface JournalData {
  dbActive: boolean;
  asOf: string;
  costPct: number;
  entries: JournalEntry[];
  stats: {
    byStrategy: { CTC: StatTable; REV: StatTable };
    bySector: Record<string, { CTC: StatTable; REV: StatTable }>;
    byRegime: Record<string, { CTC: StatTable; REV: StatTable }>;
  } | null;
  error?: string;
}

const DAY_KEYS = ['d1', 'd2', 'd3', 'd4', 'd5'] as const;

// ── Ndihmës ──

function etTodayStr(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function latestCheckpoint(e: JournalEntry): { key: string; cp: JournalCheckpoint } | null {
  const cps = e.checkpoints;
  if (!cps) return null;
  for (let i = DAY_KEYS.length - 1; i >= 0; i--) {
    const cp = cps[DAY_KEYS[i]];
    if (cp) return { key: DAY_KEYS[i], cp };
  }
  return null;
}

function ageOf(e: JournalEntry): number {
  // Mosha = dita e fundit e vlerësuar (dN); 0 = ende pa ditë tregtare
  if (e.finalDayN && e.finalStatus && e.finalStatus !== 'open') return e.finalDayN;
  const lc = latestCheckpoint(e);
  if (lc) return parseInt(lc.key.slice(1), 10);
  return 0;
}

function priceNow(e: JournalEntry): number | null {
  if (e.finalStatus && e.finalStatus !== 'open' && e.finalStatus !== 'no_entry' && e.exitPrice != null) return e.exitPrice;
  const lc = latestCheckpoint(e);
  return lc ? lc.cp.close : null;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  target: { label: 'TARGET', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  stop: { label: 'STOP', cls: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
  gap_stop: { label: 'GAP_STOP', cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
  time_stop: { label: 'TIME_STOP', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  open: { label: 'OPEN', cls: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  no_entry: { label: 'PA HYRJE', cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
};

function StatusBadge({ e }: { e: JournalEntry }) {
  const st = e.finalStatus ?? 'open';
  const meta = STATUS_META[st] ?? { label: st.toUpperCase(), cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' };
  const statusTerm = (`status_${st}` in TERM_INFO) ? `status_${st}` : null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {statusTerm ? (
        <TermPop term={statusTerm} iconClass="w-2.5 h-2.5">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${meta.cls}`}>{meta.label}</span>
        </TermPop>
      ) : (
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${meta.cls}`}>{meta.label}</span>
      )}
      {e.noSlot && (
        <TermPop term="pa_slot" iconClass="w-2.5 h-2.5">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-orange-500/15 text-orange-400 border-orange-500/30" title={e.slotNote ?? 'pa slot të lirë'}>
            pa_slot
          </span>
        </TermPop>
      )}
    </div>
  );
}

/** Shiriti stop → hyrje → target me çmimin aktual. */
function LevelBar({ e }: { e: JournalEntry }) {
  if (e.entry == null || e.stop == null || e.target == null) {
    return <div className="text-[11px] text-muted-foreground">prit hyrjen (open e ditës pasuese)</div>;
  }
  const span = e.target - e.stop;
  if (!(span > 0)) return <div className="text-[11px] text-muted-foreground">—</div>;
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - e.stop!) / span) * 100));
  const pn = priceNow(e);
  const entryP = pos(e.entry);
  const priceP = pn != null ? pos(pn) : null;
  return (
    <div className="w-full max-w-56">
      <div className="relative h-2 rounded-full bg-rose-500/20 overflow-visible">
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-gradient-to-r from-rose-500/40 via-zinc-500/30 to-emerald-500/40" />
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-0.5 h-3.5 bg-zinc-300" style={{ left: `${entryP}%` }} title={`Hyrja $${e.entry.toFixed(2)}`} />
        {priceP != null && (
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-amber-400 border border-zinc-900" style={{ left: `${priceP}%` }} title={`Tani $${pn!.toFixed(2)}`} />
        )}
      </div>
      <div className="flex justify-between text-[9.5px] text-muted-foreground mt-0.5">
        <span className="text-rose-400">${e.stop.toFixed(2)}</span>
        <span className="text-emerald-400">${e.target.toFixed(2)}</span>
      </div>
    </div>
  );
}

export default function SignalTracker() {
  const [data, setData] = useState<JournalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [strategyFilter, setStrategyFilter] = useState<'TE_GJITHA' | 'CTC' | 'REV'>('TE_GJITHA');
  const [dayFilter, setDayFilter] = useState<'te_gjitha' | number>('te_gjitha');
  const [onlyInSlot, setOnlyInSlot] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/signal-journal', { cache: 'no-store' });
      const json = (await res.json()) as JournalData;
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'gabim');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const entries = data?.entries ?? [];
  const filtered = entries.filter((e) => {
    if (strategyFilter !== 'TE_GJITHA' && e.strategy !== strategyFilter) return false;
    if (dayFilter !== 'te_gjitha' && ageOf(e) !== dayFilter) return false;
    if (onlyInSlot && e.noSlot) return false;
    return true;
  });

  const ctcCount = entries.filter((e) => e.strategy === 'CTC').length;
  const revCount = entries.filter((e) => e.strategy === 'REV').length;

  return (
    <div className="space-y-4">
      {/* ── Koka ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Flag className="h-4 w-4 text-amber-400" />
                Ditari i Sinjaleve — kontrolle pas 1–5 ditësh tregtare
              </h3>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                Deskriptiv — mat çfarë ndodhi. CTC: hyrje në open të ditës pas konfirmimit, time-stop dita 5 ·
                REV: hyrje në close të T+1 me konfirmim kaluar, time-stop dita 3 · Stop i pari kur qiri i prek të dyja ·
                Gap → GAP_STOP te hapja · <TermPop term="kosto_c" iconClass="w-2.5 h-2.5">Kosto C = {data ? data.costPct.toFixed(2) : '0.20'}%</TermPop>.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {data && (
                <div className="text-right text-[11px] text-muted-foreground">
                  <div>CTC: <span className="text-emerald-400 font-semibold">{ctcCount}</span> · REV: <span className="text-cyan-400 font-semibold">{revCount}</span></div>
                  <div>përditësuar: {data.asOf.slice(0, 16).replace('T', ' ')}</div>
                </div>
              )}
              <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Rifresko
              </Button>
            </div>
          </div>
          {!loading && !err && data && data.entries.length === 0 && (
            <div className="mt-3 text-[12px] text-muted-foreground flex items-start gap-2">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Ditari është bosh për momentin — mbushet automatikisht pas skanimeve të para (Job A) dhe vlerësohet ditë pas dite nga croni 22:00/22:45 UTC (Job B).
            </div>
          )}
        </CardContent>
      </Card>

      {loading && !data && (
        <div className="space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {err && (
        <Card>
          <CardContent className="p-4 text-sm text-rose-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Gabim: {err}
          </CardContent>
        </Card>
      )}

      {data && (
        <Tabs defaultValue="lista" className="w-full">
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="lista" className="text-xs gap-1"><ListChecks className="h-3.5 w-3.5" />Lista</TabsTrigger>
            <TabsTrigger value="statistika" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" />Statistika</TabsTrigger>
            <TabsTrigger value="ndarje" className="text-xs gap-1"><Layers className="h-3.5 w-3.5" />Ndarje</TabsTrigger>
          </TabsList>

          {/* ═══════════ 4A — LISTA ═══════════ */}
          <TabsContent value="lista" className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className="text-muted-foreground">Strategjia:</span>
              {(['TE_GJITHA', 'CTC', 'REV'] as const).map((s) => (
                <button key={s} onClick={() => setStrategyFilter(s)}
                  className={`px-2 py-1 rounded border text-[11px] font-medium ${strategyFilter === s ? 'bg-amber-600 text-white border-amber-600' : 'border-border text-muted-foreground hover:bg-muted/40'}`}>
                  {s === 'TE_GJITHA' ? 'Të gjitha' : s}
                </button>
              ))}
              <span className="text-muted-foreground ml-2">Mosha:</span>
              {(['te_gjitha', 0, 1, 2, 3, 4, 5] as const).map((d) => (
                <button key={String(d)} onClick={() => setDayFilter(d)}
                  className={`px-2 py-1 rounded border text-[11px] font-medium ${dayFilter === d ? 'bg-amber-600 text-white border-amber-600' : 'border-border text-muted-foreground hover:bg-muted/40'}`}>
                  {d === 'te_gjitha' ? 'Të gjitha' : d === 0 ? 'Sot' : `${d}d`}
                </button>
              ))}
              <button onClick={() => setOnlyInSlot((v) => !v)}
                className={`px-2 py-1 rounded border text-[11px] font-medium ml-2 ${onlyInSlot ? 'bg-amber-600 text-white border-amber-600' : 'border-border text-muted-foreground hover:bg-muted/40'}`}>
                Vetëm në slot
              </button>
            </div>

            {filtered.length === 0 ? (
              <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Pa sinjale për këto filtra.</CardContent></Card>
            ) : (
              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {filtered.map((e) => {
                  const pn = priceNow(e);
                  const pctToTarget =
                    pn != null && e.entry != null && e.target != null && e.target !== e.entry
                      ? ((pn - e.entry) / (e.target - e.entry)) * 100
                      : null;
                  const rNow =
                    e.finalStatus && e.finalStatus !== 'open' && e.resultR != null
                      ? e.resultR
                      : latestCheckpoint(e)?.cp.rAtClose ?? null;
                  return (
                    <Card key={e.id}>
                      <CardContent className="p-3">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <div className="min-w-28">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-bold">{e.symbol}</span>
                              <span className={`text-[9.5px] font-semibold px-1 py-0.5 rounded ${e.strategy === 'CTC' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-cyan-500/15 text-cyan-400'}`}>{e.strategy}</span>
                            </div>
                            <div className="text-[10.5px] text-muted-foreground">{e.companyName || e.sector || ''}</div>
                          </div>
                          <StatusBadge e={e} />
                          <div className="text-[11px] text-muted-foreground">
                            <Clock className="h-3 w-3 inline mr-1 -mt-0.5" />
                            <TermPop term="mosha" iconClass="w-2.5 h-2.5">sinjal {e.signalDate} · moshë {ageOf(e)}d</TermPop>
                          </div>
                          {pctToTarget != null && (
                            <div className="text-[11px]">
                              <TermPop term="pct_to_target" iconClass="w-2.5 h-2.5">
                                <Target className="h-3 w-3 inline mr-1 -mt-0.5 text-emerald-400" />
                                {pctToTarget >= 0 ? '+' : ''}{pctToTarget.toFixed(0)}% e rrugës
                              </TermPop>
                            </div>
                          )}
                          {rNow != null && (
                            <div className={`text-[11px] font-semibold ${rNow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              <TermPop term="r_now" iconClass="w-2.5 h-2.5">
                                R: {rNow >= 0 ? '+' : ''}{rNow.toFixed(2)}
                              </TermPop>
                            </div>
                          )}
                          {e.regime && (
                            <TermPop term="regjim" iconClass="w-2.5 h-2.5">
                              <Badge variant="outline" className="text-[9.5px] px-1 py-0">{e.regime}</Badge>
                            </TermPop>
                          )}
                          <div className="ml-auto flex items-center gap-1">
                            <LevelBar e={e} />
                            <TermPop term="shiriti" iconClass="w-3 h-3"><span className="sr-only">shiriti</span></TermPop>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ═══════════ 4B — STATISTIKA ═══════════ */}
          <TabsContent value="statistika" className="mt-3 space-y-3">
            <StatsTableCard title="CTC (hyrje në open pas konfirmimit · time-stop dita 5)" table={data.stats?.byStrategy.CTC ?? null} />
            <StatsTableCard title="REV (hyrje në close të T+1 · time-stop dita 3)" table={data.stats?.byStrategy.REV ?? null} />
          </TabsContent>

          {/* ═══════════ 4C — NDARJE ═══════════ */}
          <TabsContent value="ndarje" className="mt-3">
            <SplitStats stats={data.stats} />
          </TabsContent>
        </Tabs>
      )}

      {/* ── Rregullat e leximit (Seksioni 5 i spec-it) ── */}
      <Card>
        <CardContent className="p-3 text-[11.5px] text-muted-foreground space-y-1">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400" />
            <span><b className="text-foreground">Kampion i vogël:</b> nën 30 sinjale në një rresht — mos nxirr përfundime.</span>
          </div>
          <div className="flex items-start gap-2">
            <Ban className="h-3.5 w-3.5 mt-0.5 shrink-0 text-rose-400" />
            <span><b className="text-foreground">Ky ditar NUK tunon parametrat.</b> Nëse sheh një model interesant, regjistroje si hipotezë të re (version i ri) dhe testoje në Validation Lab — mos e ndrysho target, stop apo pragje nga kjo tabelë.</span>
          </div>
          <div className="flex items-start gap-2">
            <TrendingUp className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-400" />
            <span><b className="text-foreground">Krahasim i detyrueshëm:</b> paper trading + OOS i Validation Lab. Nëse ditari jep rezultate shumë ndryshe nga OOS, ka diçka të gabuar në ekzekutim ose në të dhëna.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tabela e statistikave për një strategji ──

function StatsTableCard({ title, table }: { title: string; table: StatTable | null }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[12px] font-semibold mb-2 flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-amber-400" />{title}
        </div>
        {!table ? (
          <div className="text-[12px] text-muted-foreground">Pa të dhëna.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-1.5 pr-2 font-medium"><ThInfoPop info={TERM_INFO.horizont} label="Horizonti" /></th>
                  <th className="py-1.5 pr-2 font-medium"><ThInfoPop info={TERM_INFO.n} label="n" /></th>
                  <th className="py-1.5 pr-2 font-medium"><ThInfoPop info={TERM_INFO.pct_target} label="% target" /></th>
                  <th className="py-1.5 pr-2 font-medium"><ThInfoPop info={TERM_INFO.pct_stop} label="% stop" /></th>
                  <th className="py-1.5 pr-2 font-medium"><ThInfoPop info={TERM_INFO.pct_open} label="% open" /></th>
                  <th className="py-1.5 pr-2 font-medium"><ThInfoPop info={TERM_INFO.r_mean} label="R mes." /></th>
                  <th className="py-1.5 pr-2 font-medium"><ThInfoPop info={TERM_INFO.r_median} label="R med." /></th>
                  <th className="py-1.5 pr-2 font-medium"><ThInfoPop info={TERM_INFO.mfe_mean} label="MFE mes." /></th>
                  <th className="py-1.5 pr-2 font-medium"><ThInfoPop info={TERM_INFO.mae_mean} label="MAE mes." /></th>
                  <th className="py-1.5 font-medium"><ThInfoPop info={TERM_INFO.pnl_net} label="PnL net %" /></th>
                </tr>
              </thead>
              <tbody>
                {DAY_KEYS.map((k) => {
                  const r = table[k];
                  return (
                    <tr key={k} className="border-b border-border/50">
                      <td className="py-1.5 pr-2 font-semibold">{k}</td>
                      <td className="py-1.5 pr-2">{r.n}</td>
                      <td className="py-1.5 pr-2 text-emerald-400">{r.n ? `${r.targetPct.toFixed(0)}%` : '—'}</td>
                      <td className="py-1.5 pr-2 text-rose-400">{r.n ? `${r.stopPct.toFixed(0)}%` : '—'}</td>
                      <td className="py-1.5 pr-2 text-sky-400">{r.n ? `${r.openPct.toFixed(0)}%` : '—'}</td>
                      <td className={`py-1.5 pr-2 ${(r.meanR ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{r.meanR != null ? r.meanR.toFixed(2) : '—'}</td>
                      <td className="py-1.5 pr-2">{r.medianR != null ? r.medianR.toFixed(2) : '—'}</td>
                      <td className="py-1.5 pr-2 text-emerald-400/80">{r.meanMfe != null ? `+${r.meanMfe.toFixed(2)}R` : '—'}</td>
                      <td className="py-1.5 pr-2 text-rose-400/80">{r.meanMae != null ? `${r.meanMae.toFixed(2)}R` : '—'}</td>
                      <td className={`py-1.5 ${(r.meanPnlNet ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {r.meanPnlNet != null ? `${r.meanPnlNet >= 0 ? '+' : ''}${r.meanPnlNet.toFixed(2)}%` : '—'}
                        {r.smallSample && r.n > 0 && (
                          <TermPop term="kamp_i_vogel" iconClass="w-2.5 h-2.5">
                            <span className="ml-1 text-[9px] text-amber-400">⚠ kamp. i vogël</span>
                          </TermPop>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Ndarjet 4C — sipas sektorit dhe regjimit ──

function SplitStats({ stats }: { stats: JournalData['stats'] }) {
  const [split, setSplit] = useState<'sektor' | 'regjim'>('sektor');
  if (!stats) return <Card><CardContent className="p-4 text-sm text-muted-foreground">Pa të dhëna.</CardContent></Card>;
  const groups = split === 'sektor' ? stats.bySector : stats.byRegime;
  const keys = Object.keys(groups)
    .filter((k) => {
      const t = groups[k];
      return DAY_KEYS.some((d) => t.CTC[d].n > 0 || t.REV[d].n > 0);
    })
    .sort((a, b) => {
      const sum = (t: { CTC: StatTable; REV: StatTable }) =>
        DAY_KEYS.reduce((s, d) => s + t.CTC[d].n + t.REV[d].n, 0);
      return sum(groups[b]) - sum(groups[a]);
    });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(['sektor', 'regjim'] as const).map((s) => (
          <button key={s} onClick={() => setSplit(s)}
            className={`px-2.5 py-1 rounded border text-[11px] font-medium capitalize ${split === s ? 'bg-amber-600 text-white border-amber-600' : 'border-border text-muted-foreground hover:bg-muted/40'}`}>
            {s === 'sektor' ? 'Sipas sektorit' : 'Sipas regjimit (TRENDING / TRANSITIONAL / CHOP)'}
          </button>
        ))}
      </div>
      {keys.length === 0 && (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">Pa grupe me të dhëna për momentin.</CardContent></Card>
      )}
      {keys.map((k) => (
        <div key={k} className="space-y-2">
          <div className="text-[12px] font-semibold text-foreground/90">{k}</div>
          {DAY_KEYS.some((d) => groups[k].CTC[d].n > 0) && (
            <StatsTableCard title={`CTC · ${k}`} table={groups[k].CTC} />
          )}
          {DAY_KEYS.some((d) => groups[k].REV[d].n > 0) && (
            <StatsTableCard title={`REV · ${k}`} table={groups[k].REV} />
          )}
        </div>
      ))}
    </div>
  );
}
