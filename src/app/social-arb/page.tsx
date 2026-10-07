'use client';

// ═══════════════════════════════════════════════════════════════
// SOCIAL ARB — zbulim automatik i kandidatëve
//
// Kandidatët vijnë VETËM nga databaza e skanerit (data/social-arb.json):
// një proces periodik merr termat në rritje nga Google Trends
// "Trending now", i klasifikon si produkt/markë, i lidh me kompaninë
// dhe i vendos në WATCH; RESEARCH hapet vetëm pas konfirmimit nga
// një burim tjetër (GDELT) dhe kontrollit të reagimit të çmimit.
// Pa kandidatë — e thotë qartë. Pa emra demo. Pa import CSV në ekran:
// CSV-të arkivohen në prapavijë për backtest.
// ═══════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/financial-brain/header';
import { brandsByTicker } from '@/lib/social-arb/brands';
import type { Candidate, CandidateStatus } from '@/lib/social-arb/types';
import {
  FlaskConical, ArrowLeft, ExternalLink, RefreshCw, Database, Search,
  CheckCircle2, XCircle, AlertTriangle, TrendingUp, Newspaper, LineChart as LineChartIcon,
  History as HistoryIcon, Radar,
} from 'lucide-react';

// ── tipet e gjendjes nga API ────────────────────────────────────

interface ScanRec {
  at: string;
  durationMs: number;
  termsScanned: number;
  termsClassified: number;
  discoveredWiki?: number;
  candidatesActive: number;
  sources: Record<string, 'ok' | 'error' | 'throttled'>;
}

interface StateResponse {
  ok: boolean;
  lastScanAt: string | null;
  scanning: boolean;
  candidates: Candidate[];
  counts: { DISCOVERED: number; WATCH: number; RESEARCH: number; REMOVED: number; total: number };
  lastScans: ScanRec[];
  measurements: number;
  csvArchive: { files: number; rows: number };
  storage: { dir: string; persistent: boolean; backend?: 'file' | 'upstash' };
  storeFile: string;
  error?: string;
}

// ── ndihmës ──────────────────────────────────────────────────────

const pct = (n: number | null) => (n === null ? 'n/a' : `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`);

function fmtAgo(iso: string | null): string {
  if (!iso) return 'kurrë';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return 'kurrë';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'tani';
  if (min < 60) return `para ${min} minutash`;
  const h = Math.floor(min / 60);
  if (h < 24) return `para ${h} ${h === 1 ? 'ore' : 'orësh'}`;
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (sameDay) return `sot ${time}`;
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return `dje ${time}`;
  return `më ${d.toLocaleDateString('sq-AL')} ${time}`;
}

type FilterKind = 'ALL' | CandidateStatus;
const FILTERS: { key: FilterKind; label: string }[] = [
  { key: 'ALL', label: 'Të gjithë kandidatët' },
  { key: 'RESEARCH', label: 'Research' },
  { key: 'WATCH', label: 'Watch' },
  { key: 'DISCOVERED', label: 'Discovered' },
  { key: 'REMOVED', label: 'Removed' },
];
const BREAKDOWN_ROWS: { key: keyof Candidate['breakdown']; label: string; max: number }[] = [
  { key: 'demand', label: 'Kërkesa — Wikipedia (25)', max: 25 },
  { key: 'confirmation', label: 'Konfirmimi shumë-burim (20)', max: 20 },
  { key: 'materiality', label: 'Rëndësia ekonomike (20)', max: 20 },
  { key: 'price', label: 'Reagimi relativ i çmimit (15)', max: 15 },
  { key: 'quality', label: 'Cilësia / risku i promocionit (10)', max: 10 },
  { key: 'event', label: 'Risku i eventit (10)', max: 10 },
];
// ── Gate-t e RESEARCH (v4) ──────────────────────────────
const GATE_LABELS: Record<string, string> = {
  sources: 'Burimet e pavarura',
  materiality: 'Materialiteti',
  not_priced: 'S\'është çmuar ende',
  liquidity: 'Likuiditeti',
  persistence: 'Jo modë e shkurtër',
};
const GATE_ORDER = ['sources', 'materiality', 'not_priced', 'liquidity', 'persistence'] as const;

const statusTone: Record<CandidateStatus, string> = {
  RESEARCH: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400',
  WATCH: 'bg-amber-500/15 border-amber-500/40 text-amber-400',
  DISCOVERED: 'bg-sky-500/15 border-sky-500/40 text-sky-400',
  REMOVED: 'bg-red-500/15 border-red-500/40 text-red-400',
};
const barColor: Record<CandidateStatus, string> = { RESEARCH: '#10b981', WATCH: '#f59e0b', DISCOVERED: '#0ea5e9', REMOVED: '#ef4444' };

const CAUSE_TONE: Record<string, string> = {
  positive_demand_possible: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400',
  news_launch_no_proof: 'bg-amber-500/15 border-amber-500/40 text-amber-400',
  negative_event: 'bg-red-500/15 border-red-500/40 text-red-400',
  unclear: 'bg-slate-500/15 border-slate-500/40 text-slate-400',
};
const CAUSE_SHORT: Record<string, string> = {
  positive_demand_possible: 'Kërkesë pozitive?',
  news_launch_no_proof: 'Lajm/lançim pa provë',
  negative_event: 'Ngjarje negative',
  unclear: 'E paqartë',
};

const box: React.CSSProperties = { background: '#111c2e', border: '1px solid #334155', borderRadius: 12, padding: 20, margin: '20px 0' };
const ghostButton: React.CSSProperties = { background: 'transparent', color: '#cbd5e1', border: '1px solid #475569', borderRadius: 6, padding: '8px 12px', cursor: 'pointer', fontSize: 12 };

// ── faqja ────────────────────────────────────────────────────────

export default function SocialArbPage() {
  const [state, setState] = useState<StateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const [scanErr, setScanErr] = useState('');
  const [filter, setFilter] = useState<FilterKind>('ALL');
  const [sort, setSort] = useState<'score' | 'recent' | 'name'>('score');
  const [selected, setSelected] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadState = useCallback(async () => {
    try {
      const r = await fetch('/api/social-arb/state', { cache: 'no-store' });
      const j = (await r.json()) as StateResponse;
      if (j.ok) setState(j);
    } catch { /* hesht — rifreskohet në poll */ }
  }, []);

  useEffect(() => {
    loadState().finally(() => setLoading(false));
  }, [loadState]);

  // poll gjatë skanimit
  useEffect(() => {
    if (!scanning) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(() => { loadState(); }, 5000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [scanning, loadState]);

  async function scanNow() {
    setScanning(true); setScanErr(''); setScanMsg('Skanimi po ekzekutohet — merren termat trending, klasifikohen markat, kontrollohen GDELT, Wikipedia dhe çmimet (deri ~1 min)...');
    try {
      const r = await fetch('/api/social-arb/scan', { method: 'POST' });
      // Trajtim i saktë i kodit të statusit — 429/409/503 kanë kuptime të veçanta.
      if (r.status === 429) {
        const retryAfter = Number(r.headers.get('Retry-After') ?? '0');
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        const minLeft = retryAfter > 0 ? Math.max(1, Math.ceil(retryAfter / 60)) : null;
        throw new Error(
          `${j.error ?? 'Shumë kërkesa.'}${minLeft ? ` Provo sërish pas ~${minLeft} minutash.` : ' Provo më vonë.'}`
        );
      }
      if (r.status === 409) {
        throw new Error('Një skanim tjetër po ekzekutohet tashmë (nga cron-i ose një përdorues tjetër) — prit që të përfundojë dhe rifreskohet vetë.');
      }
      if (r.status === 503) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? 'Skanimi i bllokuar nga konfigurimi i serverit (mungon ruajtja e përhershme Upstash në këtë ambient).');
      }
      if (r.status === 401) {
        throw new Error('E paautorizuar — sesioni mund të jetë skaduar. Rifresko faqen dhe provo sërish.');
      }
      const j = await r.json() as {
        ok: boolean; error?: string; termsScanned?: number; termsClassified?: number;
        promoted?: string[]; removed?: string[]; activeCount?: number; archived?: number;
      };
      if (!j.ok) throw new Error(j.error || 'Skanimi dështoi.');
      const pro = j.promoted?.length ?? 0;
      const rem = j.removed?.length ?? 0;
      setScanMsg(
        `Skanimi përfundoi: ${j.termsScanned ?? 0} termе skanuar · ${j.termsClassified ?? 0} klasifikuar si markë · ` +
        `${j.activeCount ?? 0} kandidatë aktivë${pro ? ` · ${pro} ngjitur në RESEARCH` : ''}${rem ? ` · ${rem} hequr` : ''}` +
        `${j.archived ? ` · ${j.archived} rreshta arkivuar CSV` : ''}.`
      );
      await loadState();
    } catch (e) {
      setScanErr((e as Error).message);
    } finally {
      setScanning(false);
    }
  }

  const candidates = state?.candidates ?? [];
  const counts = state?.counts ?? { DISCOVERED: 0, WATCH: 0, RESEARCH: 0, REMOVED: 0, total: 0 };
  const lastScan = state?.lastScans?.[0] ?? null;

  const shown = useMemo(() => {
    let list = [...candidates];
    if (filter !== 'ALL') list = list.filter(c => c.status === filter);
    if (sort === 'score') list.sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker));
    if (sort === 'recent') list.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
    if (sort === 'name') list.sort((a, b) => a.ticker.localeCompare(b.ticker));
    return list;
  }, [candidates, filter, sort]);

  const active = shown.find(c => c.key === selected) ?? shown[0] ?? null;
  const brandDossier = active ? brandsByTicker(active.ticker).find(b => b.dossier)?.dossier ?? null : null;

  return (
    <div className="min-h-screen flex flex-col bg-background" suppressHydrationWarning>
      <Header />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5">
        {/* kokë */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="bg-rose-500/15 rounded-lg p-2.5 text-rose-400 flex-shrink-0">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Social Arb — zbulim automatik</h1>
              <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
                Skaneri merr periodikisht termat në rritje nga Google Trends «Trending now», i klasifikon si produkt/markë
                dhe i lidh me kompaninë. Ngritja në <b>RESEARCH</b> kërkon kalimin e 5 gate-ve: 2+ burime kërkese të
                pavarura në rritje (Trends + Wikipedia) · materialitet · s’është çmuar ende · likuiditet · qëndrueshmëri
                3+ javë. GDELT-të i mbeten vetëm konfirmim mediatik (i vonë) dhe testit mainstream. Kandidatët këtu vijnë
                vetëm nga matjet e ruajtura — jo nga ndonjë listë e fiksuar.
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700/60 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Paneli Kryesor
          </Link>
        </div>

        {/* statusi: përditësuar më + skano tani + burimet */}
        <section style={box} className="!py-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Radar className="w-3.5 h-3.5 text-rose-400" />
              Përditësuar më <b className="text-foreground">{fmtAgo(state?.lastScanAt ?? null)}</b>
              {state?.scanning && <span className="text-rose-400">· po skanon…</span>}
            </span>
            <button
              onClick={scanNow}
              disabled={scanning}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/50 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
              {scanning ? 'Duke skanuar…' : 'Skano tani'}
            </button>
            {lastScan && (
              <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                Burimet:
                {(['google_trends', 'wikipedia', 'gdelt', 'prices'] as const).map(s => {
                  const st = lastScan.sources?.[s];
                  const tone = st === 'ok' ? 'text-emerald-400' : st === 'throttled' ? 'text-amber-400' : 'text-red-400';
                  const name = s === 'google_trends' ? 'Trends RSS' : s === 'wikipedia' ? 'Wikipedia' : s === 'gdelt' ? 'GDELT' : 'Çmimet';
                  return <span key={s} className={tone}>{name}: {st === 'ok' ? 'ok' : st === 'throttled' ? 'kufizuar' : st ? 'gabim' : '—'}</span>;
                })}
              </span>
            )}
          </div>
          {scanMsg && <p role="status" className="mt-2 text-xs" style={{ color: '#86efac' }}>{scanMsg}</p>}
          {scanErr && <p role="alert" className="mt-2 text-xs text-red-400">{scanErr}</p>}
          {lastScan && (
            <p className="mt-2 text-xs text-muted-foreground">
              Skanimi i fundit: {lastScan.termsScanned} termе në 4 rajone (US/GB/CA/AU) · {lastScan.termsClassified} klasifikuar si markë ·
              {' '}{state?.measurements ?? 0} matje në databazë · arkivi CSV: {state?.csvArchive.rows ?? 0} rreshta në {state?.csvArchive.files ?? 0} skedarë.
            </p>
          )}
        </section>

        {/* filtra */}
        <section style={box} className="!py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="flex flex-wrap items-center gap-1.5">
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${filter === f.key ? 'border-rose-500/60 bg-rose-500/15 text-rose-300' : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'}`}
                >
                  {f.label} <span className="tabular-nums opacity-70">({f.key === 'ALL' ? counts.total : counts[f.key]})</span>
                </button>
              ))}
            </span>
            <label className="text-xs text-muted-foreground">Rendit:
              <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} style={{ ...inputStyle }} aria-label="Rendit listën">
                <option value="score">Score ↓</option>
                <option value="recent">Më të rejat</option>
                <option value="name">Emri A-Z</option>
              </select>
            </label>
          </div>
        </section>

        {/* kandidatët */}
        <section style={box}>
          <h2 className="text-sm font-semibold text-foreground">Kandidatët (nga databaza e skanerit)</h2>
          {loading ? (
            <p className="mt-3 text-sm text-muted-foreground">Duke ngarkuar gjendjen…</p>
          ) : shown.length > 0 ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {shown.map(c => (
                <div
                  key={c.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(c.key)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(c.key); } }}
                  className={`rounded-xl border p-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${active?.key === c.key ? 'border-rose-500/60 bg-rose-500/[0.06]' : 'border-slate-700 bg-slate-900/60 hover:border-slate-500'} ${c.status === 'REMOVED' ? 'opacity-70' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold leading-tight text-foreground">{c.ticker}</h3>
                      <p className="truncate text-xs text-muted-foreground">{c.company}{c.region !== 'US' ? ` · ${c.region}` : ''}</p>
                    </div>
                    <span className={`inline-flex flex-shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTone[c.status]}`}>{c.status}</span>
                  </div>
                  <p className="mt-1.5 truncate text-xs text-muted-foreground">trend: <span className="text-foreground/80">«{c.trend}»</span></p>
                  {c.discoveredVia === 'wikipedia' && (
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-sky-400">
                      <Radar className="w-3 h-3" /> zbuluar proaktivisht nga Wikipedia
                    </p>
                  )}
                  {c.trendStart?.at && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      trendi nisi <b className="text-foreground/80">{c.trendStart.at}</b>{c.trendStart.source === 'firstSeen' ? ' (fallback i mangët)' : ''}
                    </p>
                  )}
                  {c.catalyst?.nextEarningsDate && (
                    <p className="mt-1 text-[11px] text-amber-300/90">
                      fitimet: {c.catalyst.nextEarningsDate}{c.catalyst.daysToEarnings != null ? ` (pas ${c.catalyst.daysToEarnings} ditësh)` : ''} — vetëm renditje
                    </p>
                  )}
                  {c.google.inFeedToday && (
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-400">
                      <TrendingUp className="w-3 h-3" /> në trending sot{c.google.approxTraffic ? ` (~${c.google.approxTraffic})` : ''}
                    </p>
                  )}
                  {c.alreadyMoved && (
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-orange-400">
                      <AlertTriangle className="w-3 h-3" /> already_moved — çmimi ka reaguar që nga fillimi i trendit
                    </p>
                  )}
                  {c.gates && c.gates.length > 0 && (
                    <p className="mt-1.5 flex flex-wrap items-center gap-1">
                      {GATE_ORDER.map(gn => {
                        const g = c.gates.find(x => x.gate === gn);
                        if (!g) return null;
                        const tone = g.passed === true
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                          : g.passed === false
                            ? 'border-red-500/40 bg-red-500/10 text-red-400'
                            : 'border-slate-500/40 bg-slate-500/10 text-slate-400';
                        const mark = g.passed === true ? '✓' : g.passed === false ? '✗' : '—';
                        return (
                          <span key={gn} title={g.detail} className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${tone}`}>
                            {mark} {GATE_LABELS[gn]}
                          </span>
                        );
                      })}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700/70">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, c.score))}%`, background: barColor[c.status] }} />
                    </div>
                    <span className="flex-shrink-0 text-sm font-semibold tabular-nums text-foreground">{c.score}/100{c.componentsAvailable != null ? <span className="ml-1 text-[10px] font-normal text-muted-foreground">({c.componentsAvailable}/6 me data)</span> : null}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span>GDELT 7d: <b className={c.gdelt.confirmed ? 'text-emerald-400' : 'text-foreground'}>{c.gdelt.growth !== null ? pct(c.gdelt.growth) : 'n/a'}</b></span>
                    <span>Artikuj 24h: <b className="text-foreground">{c.gdelt.articles1d ?? 'n/a'}</b></span>
                    <span>Çmimi vs SPY: <b className={c.price.priceVsIndex !== null ? 'text-foreground' : 'text-red-400'}>{c.price.priceVsIndex !== null ? pct(c.price.priceVsIndex) : 'e pamatshme'}</b></span>
                    {c.cause && <span>Shkaku: <b className="text-foreground/80">{CAUSE_SHORT[c.cause.type]}</b></span>}
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">parë së pari {fmtAgo(c.firstSeenAt)} · matja e fundit {fmtAgo(c.lastSeenAt)}</p>
                </div>
              ))}
            </div>
          ) : (
            /* empty state i sinqertë */
            <div className="mt-4 rounded-xl border border-dashed border-slate-600 p-6 text-center">
              <p className="text-base font-bold text-slate-200">
                {counts.total === 0 ? 'S\'ka ende kandidatë në databazë' : 'Asnjë kandidat nën këtë filtër'}
              </p>
              <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
                {counts.total === 0
                  ? 'Skaneri punon: merr termat, i klasifikon dhe i ruan matjet. Kur një term që është produkt ose markë të dalë në Google Trends, kandidati i tij shfaqet këtu automatikisht — kjo faqe nuk shfaq emra demo si sinjale reale.'
                  : 'Asnjë kandidat me këtë status. Kalo te «Të gjithë kandidatët» për pamjen e plotë.'}
              </p>
              <div className="mx-auto mt-4 grid max-w-2xl gap-2 text-left sm:grid-cols-2">
                {[
                  ['1. Zbulimi (dy rrugë)', 'A) Google Trends «Trending now» — 4 rajone (US/GB/CA/AU); B) PROAKTIV: fjalori skanohet me Wikipedia në grupe rrotulluese — trendet e ngadalta (pa spike) zbulohen pa pasur nevojë për zhurmë.'],
                  ['2. WATCH', 'Lidhja me ticker-in u verifikua; gate-t e RESEARCH ende s’janë të gjitha të kaluara. Radha e matjeve rrotullohet — asnjë kandidat s’urie.'],
                  ['3. RESEARCH (5 gate-t)', 'Vetëm kur KALOJNË TË GJITHA: 2+ burime kërkese të pavarura (Trends + Wikipedia) · materialitet i mjaftueshëm · s’është çmuar ende (≤+8% vs SPY që nga FILLIMI I TRENDIT) · likuiditet · 3+ javë qëndrueshmëri pa spike. Score-i vetëm rendit (s’ka pikë falas).'],
                  ['4. REJECT/REMOVED', 'Shkak negativ, mainstream (≥200 artikuj/24h), flamuj bllokues, ose ftohja (28+ ditë PA asnjë rritje Wikipedia) — refuzuarit gjurmohen ende 5/20 ditë për sinqeritet statistikor. Kur çmimi ka reaguar, kandidati mbetet në WATCH me flamurin already_moved (s’fshihet).'],
                ].map(([t, d]) => (
                  <div key={t} className="rounded-lg border border-slate-700/70 bg-slate-900/50 p-3">
                    <p className="text-xs font-semibold text-foreground">{t}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{d}</p>
                  </div>
                ))}
              </div>
              {lastScan ? (
                <p className="mt-4 text-xs text-muted-foreground">
                  Skanimi i fundit ({fmtAgo(state?.lastScanAt ?? null)}): {lastScan.termsScanned} termе skanuar, {lastScan.termsClassified} të klasifikuar si markë.
                  {lastScan.termsClassified === 0 && ' Shumica e termave trending janë njerëz/evente/lajme — jo produkte; kjo është normale dhe e pritshme.'}
                  {state?.scanning ? ' Skanimi tjetër po ekzekutohet…' : ' Skanimi vijë periodik (procesi në prapavijë) ose trokit «Skano tani».'}
                </p>
              ) : (
                <p className="mt-4 text-xs text-muted-foreground">
                  Një skanim s\'është kryer ende ndonjëherë — trokit <b className="text-foreground">«Skano tani»</b> ose prit procesin periodik.
                </p>
              )}
            </div>
          )}
        </section>

        {/* dosja e kandidatit të zgjedhur */}
        {active && (
          <section style={box}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Dosja: {active.ticker} — {active.company}</h2>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTone[active.status]}`}>{active.status}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              trend «{active.trend}» · rajoni {active.region} · produkti: {active.product} · parë së pari {fmtAgo(active.firstSeenAt)}
              {' '}· zbulimi: <b className="text-foreground/80">{active.discoveredVia === 'wikipedia' ? 'proaktiv (Wikipedia)' : 'Google Trends'}</b>
              {' '}· grupi statistikor: <b className="text-foreground/80">{active.groupKey ?? `${active.trend.toLowerCase()}|${active.ticker}`}</b> <span title="Mostrat e pavarura numërohen sipas këtij çelësi (pa rajon) — e njëjta tezë në US/GB/CA/AU është NJË rast">(i pavarur)</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a
                href={`https://trends.google.com/trends/explore?q=${encodeURIComponent(active.trend)}&geo=${active.region}`}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-600 px-2.5 py-1 text-[11px] text-slate-300 hover:border-slate-400 transition-colors"
              >
                <Search className="w-3 h-3" /> Google Trends
              </a>
              <a
                href={`https://finviz.com/quote.ashx?t=${active.ticker}`}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-600 px-2.5 py-1 text-[11px] text-slate-300 hover:border-slate-400 transition-colors"
              >
                <LineChartIcon className="w-3 h-3" /> Finviz
              </a>
              <Link
                href={`/?tab=quant&ticker=${active.ticker}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-blue-600/50 bg-blue-600/10 px-2.5 py-1 text-[11px] text-blue-300 hover:bg-blue-600/20 transition-colors"
              >
                <ExternalLink className="w-3 h-3" /> Analizo {active.ticker}
              </Link>
            </div>

            {/* provat e gjalla: shkaku + konfirmimi + çmimet */}
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {/* P2 — shkaku i trendit */}
              <div className="rounded-lg border border-slate-700/70 bg-slate-900/50 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><Newspaper className="w-3.5 h-3.5 text-sky-400" /> Shkaku i trendit</p>
                {active.cause ? (
                  <>
                    <p className="mt-1.5">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${CAUSE_TONE[active.cause.type] ?? CAUSE_TONE.unclear}`}>{CAUSE_SHORT[active.cause.type] ?? active.cause.type}</span>
                      <span className="ml-1.5 text-[10px] text-muted-foreground">kontrolluar {active.cause.checkedAt?.slice(0, 10)}</span>
                    </p>
                    <p className="mt-1.5 text-xs text-foreground/90">{active.cause.reason}</p>
                  </>
                ) : (
                  <p className="mt-1.5 text-xs text-muted-foreground">S'është verifikuar dot — pa klasifikim s'ka ngritje statusi.</p>
                )}
              </div>
              <div className="rounded-lg border border-slate-700/70 bg-slate-900/50 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><TrendingUp className="w-3.5 h-3.5 text-rose-400" /> Konfirmimi mediatik (GDELT)</p>
                <p className="mt-1.5 text-xs text-foreground/90">
                  Rritja 7d vs baza 28d: <b className={active.gdelt.confirmed ? 'text-emerald-400' : 'text-foreground'}>{pct(active.gdelt.growth)}</b>
                  {' '}· artikuj 24h: <b className="text-foreground">{active.gdelt.articles1d ?? 'n/a'}</b>
                  {active.gdelt.confirmed && <span className="text-emerald-400"> — konfirmuar</span>}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  GDELT s'numërohet si burim kërkese — është konfirmim i vonë mediatik; numri i artikujve teston edhe pragun mainstream (≥200 → dil).
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {active.google.inFeedToday
                    ? <>Në «Trending now» sot{active.google.approxTraffic ? ` — trafik ~${active.google.approxTraffic}` : ''}.</>
                    : <>S'është në feed sot — matja e fundit {fmtAgo(active.lastSeenAt)}.</>}
                </p>
              </div>
              {/* P1 — çmimet me burim, datë dhe çmimet e përdora — ose gabimin konkret */}
              <div className="rounded-lg border border-slate-700/70 bg-slate-900/50 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><LineChartIcon className="w-3.5 h-3.5 text-violet-400" /> Reagimi i çmimit</p>
                {active.price.priceVsIndex !== null ? (
                  <p className="mt-1.5 text-xs text-foreground/90">
                    {active.price.fromDate && active.price.asOf
                      ? <>Dritarja <b className="text-foreground">{active.price.fromDate} → {active.price.asOf}</b> (të njëjtat data): {active.ticker} <b className="text-foreground">{active.price.stockPrice?.toFixed(2)}</b> vs SPY <b className="text-foreground">{active.price.indexPrice?.toFixed(2)}</b> → diferencë <b className="text-foreground">{pct(active.price.priceVsIndex)}</b></>
                      : <>Diferenca <b className="text-foreground">{pct(active.price.priceVsIndex)}</b> ndaj indeksit</>}
                    {active.price.source && <> · burimi <b className="text-foreground">{active.price.source}</b></>}
                    {active.price.checkedAt && <> · kontrolluar {active.price.checkedAt.slice(0, 10)}</>}
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-red-400">
                    KRAHASIMI NUK U KRYE — e pamatshme, jo 0%.
                    {active.price.error && <> Gabimi konkret: <span className="text-red-300">{active.price.error}</span></>}
                    {active.price.asOf && active.price.stockPrice !== null && <> (matja e fundit e vlefshme: close {active.price.asOf}, {active.price.stockPrice.toFixed(2)} vs SPY {active.price.indexPrice?.toFixed(2) ?? 'n/a'})</>}
                    {active.price.checkedAt && <> · kontrolluar {active.price.checkedAt.slice(0, 10)}</>}
                  </p>
                )}
              </div>
            </div>

            {/* GATE-T E RESEARCH (v4) — 5 provat, secila me arsye */}
            <div className="mt-2 rounded-lg border border-slate-700/70 bg-slate-900/50 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" /> Gate-t për RESEARCH — 5 provat (të gjitha duhet të kalojnë)
              </p>
              {active.gates && active.gates.length > 0 ? (
                <ul className="mt-1.5 space-y-1.5">
                  {GATE_ORDER.map(gn => {
                    const g = active.gates.find(x => x.gate === gn);
                    if (!g) return null;
                    const tone = g.passed === true ? 'text-emerald-400' : g.passed === false ? 'text-red-400' : 'text-slate-400';
                    const mark = g.passed === true ? '✓ KALOI' : g.passed === false ? '✗ DËSHTOI' : '— E PAMATSHME';
                    return (
                      <li key={gn} className="flex flex-col gap-0.5 rounded border border-slate-700/50 px-2 py-1.5">
                        <span className={`text-[11px] font-bold ${tone}`}>{mark} — {GATE_LABELS[gn]}</span>
                        <span className="text-[11px] text-foreground/85">{g.detail}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-1.5 text-xs text-muted-foreground">Gate-t vlerësohen në skanimin e radhës (kandidati i migruar nga skema e vjetër).</p>
              )}
              <p className="mt-2 text-[10px] text-muted-foreground">
                Wikipedia (kërkesa, jo-lajme): {active.wiki?.article ? <>artikulli «{active.wiki.article}» · rritja 7d vs baza 28d: <b className="text-foreground/85">{pct(active.wiki.growth)}</b></> : <>{active.wiki?.error ?? 'e pakuruar'}</>}
                {active.wiki?.risingWeeks != null && <> · javë rritjeje: <b className="text-foreground/85">{active.wiki.risingWeeks}</b></>}
                {active.wiki?.peakToAvg != null && <> · pik/mesatare: <b className="text-foreground/85">{active.wiki.peakToAvg.toFixed(1)}×</b></>}
                {' '}· Vëllami: <b className="text-foreground/85">{active.liquidity?.avgDollarVolume != null ? `$${(active.liquidity.avgDollarVolume / 1_000_000).toFixed(1)}M/ditë` : (active.liquidity?.error ?? 'n/a')}</b>
                {' '}· Lidhja: <b className="text-foreground/85">{active.materialityInfo?.linkType ?? 'direct'}</b> (kova {active.materialityInfo?.capBucket ?? '?'})
                {active.gates?.[0]?.checkedAt && <> · kontrolluar {new Date(active.gates[0].checkedAt).toLocaleDateString('sq-AL')}</>}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Fillimi i trendit (ankora e «s\'është çmuar»): <b className="text-foreground/85">{active.trendStart?.at ?? 'n/a'}</b>
                {active.trendStart && <> — {active.trendStart.source === 'wiki'
                  ? 'dita e parë e rritjes së vazhdueshme në serinë Wikipedia'
                  : <span className="text-amber-500/90">fallback i mangët: dita kur e pa sistemi (seria Wikipedia s\'mjafton)</span>}</>}
                {active.catalyst && (active.catalyst.nextEarningsDate || active.catalyst.error) && <> · Katalizatori: {active.catalyst.nextEarningsDate
                  ? <><b className="text-foreground/85">{active.catalyst.nextEarningsDate}</b>{active.catalyst.daysToEarnings != null ? ` (pas ${active.catalyst.daysToEarnings} ditësh)` : ''} — vetëm renditje, JO gate</>
                  : <span className="text-red-400">{active.catalyst.error}</span>}</>}
              </p>
            </div>

            {/* P2 — titujt e ruajtur për kontroll manual */}
            {active.cause && active.cause.articles.length > 0 && (
              <div className="mt-2 rounded-lg border border-slate-700/70 bg-slate-900/50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Titujt e përdorur për klasifikim (kontrolloji vetë)</p>
                <ul className="mt-1.5 space-y-1">
                  {active.cause.articles.map((a, i) => (
                    <li key={`${a.url}-${i}`} className="text-[11px]">
                      <a href={a.url} target="_blank" rel="noreferrer" className="text-sky-400 hover:text-sky-300 hover:underline">{a.title}</a>
                      <span className="text-muted-foreground"> · {a.domain || 'pa domen'} · {a.seenAt?.slice(0, 10)}</span>
                    </li>
                  ))}
                </ul>
                {active.cause.newsTitle && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Lajmi në RSS të Trends: «{active.cause.newsTitle}»{active.cause.newsSource ? ` — ${active.cause.newsSource}` : ''}
                  </p>
                )}
              </div>
            )}

            {/* P4 — rezultati pas 5 dhe 20 ditësh, kundrejt SPY (përfshirë refuzuarit) */}
            <div className="mt-2 rounded-lg border border-slate-700/70 bg-slate-900/50 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><HistoryIcon className="w-3.5 h-3.5 text-violet-400" /> Rezultati: çmimi pas 5 dhe 20 ditësh (vs SPY)</p>
              {active.outcome?.baseDate ? (
                <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
                  <p className="text-[11px] text-muted-foreground">Baza (ditë tregtimi PAS zbulimit): <b className="text-foreground">{active.outcome.baseDate}</b> — {active.ticker} {active.outcome.baseStock?.toFixed(2)} · SPY {active.outcome.baseIndex?.toFixed(2)}</p>
                  <p className="text-[11px] text-muted-foreground">Pas 5 ditësh tregtimi: {active.outcome.d5
                    ? <><b className="text-foreground">{active.outcome.d5.date}</b> · {active.ticker} {pct(active.outcome.d5.stockRet)} vs SPY {pct(active.outcome.d5.indexRet)} → <b className={active.outcome.d5.relative >= 0 ? 'text-emerald-400' : 'text-red-400'}>{pct(active.outcome.d5.relative)}</b></>
                    : <span className="text-amber-400">{active.outcome.pendingNote ?? 'prit'}</span>}</p>
                  <p className="text-[11px] text-muted-foreground">Pas 20 ditësh tregtimi: {active.outcome.d20
                    ? <><b className="text-foreground">{active.outcome.d20.date}</b> · {active.ticker} {pct(active.outcome.d20.stockRet)} vs SPY {pct(active.outcome.d20.indexRet)} → <b className={active.outcome.d20.relative >= 0 ? 'text-emerald-400' : 'text-red-400'}>{pct(active.outcome.d20.relative)}</b></>
                    : <span className="text-amber-400">{active.outcome.pendingNote ?? 'prit'}</span>}</p>
                </div>
              ) : (
                <p className="mt-1.5 text-xs text-muted-foreground">{active.outcome?.pendingNote ?? 'baza e gjurmimit (dita e parë e tregtimit PAS zbulimit) vendoset në skanimin e radhës…'}</p>
              )}
              {active.outcomeFromPromotion?.promotedAt && (
                <p className="mt-1.5 border-t border-slate-700/50 pt-1.5 text-[11px] text-muted-foreground">
                  Nga NGJITJA në RESEARCH ({active.outcomeFromPromotion.promotedAt.slice(0, 10)}):
                  {active.outcomeFromPromotion.baseDate
                    ? <> baza <b className="text-foreground">{active.outcomeFromPromotion.baseDate}</b> · d5 {active.outcomeFromPromotion.d5
                      ? <b className={active.outcomeFromPromotion.d5.relative >= 0 ? 'text-emerald-400' : 'text-red-400'}>{pct(active.outcomeFromPromotion.d5.relative)}</b>
                      : <span className="text-amber-400">{active.outcomeFromPromotion.pendingNote ?? 'prit'}</span>}
                      {' '}· d20 {active.outcomeFromPromotion.d20
                      ? <b className={active.outcomeFromPromotion.d20.relative >= 0 ? 'text-emerald-400' : 'text-red-400'}>{pct(active.outcomeFromPromotion.d20.relative)}</b>
                      : <span className="text-amber-400">{active.outcomeFromPromotion.pendingNote ?? 'prit'}</span>}</>
                    : <span className="text-amber-400"> {active.outcomeFromPromotion.pendingNote ?? 'prit ditën e parë të tregtimit pas ngjitjes'}</span>}
                  {' '}— mas tezën e «hendekut të paçmuar» nga momenti i vendimit.
                </p>
              )}
            </div>

            {/* score breakdown */}
            <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">Score: {active.score}/100</p>
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTone[active.status]}`}>{active.status}</span>
              </div>
              <div className="mt-2">
                {BREAKDOWN_ROWS.map(br => (
                  <div key={br.key} className="mt-1.5 flex items-center gap-2">
                    <span className="w-40 sm:w-64 flex-shrink-0 truncate text-[11px] text-muted-foreground">{br.label}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700/70">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, active.breakdown[br.key] / br.max * 100))}%`, background: barColor[active.status] }} />
                    </div>
                    <span className="w-12 flex-shrink-0 text-right text-[11px] tabular-nums text-foreground">{Math.round(active.breakdown[br.key])}/{br.max}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t border-slate-700/60 pt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pse?</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-foreground/90">
                  {active.reasons.map(reason => <li key={reason}>{reason}</li>)}
                </ul>
              </div>
              <small style={{ display: 'block', marginTop: 8 }}>
                Rregullat e statusit (gate-t, skema v5): DISCOVERED — u gjet termi dhe marka (nga Trends ose proaktivisht nga Wikipedia). WATCH — lidhja me ticker-in u verifikua, por 5 gate-t e RESEARCH s'janë të gjitha të kaluara.
                RESEARCH kërkon TË GJITHA: 2+ burime kërkese jo-lajne në rritje (Google Trends + Wikipedia; GDELT = vetëm konfirmim mediatik i vonë, s'numërohet) · materialitet efektiv të mjaftueshëm · kthimi që nga FILLIMI I TRENDIT (dita e parë e rritjes Wikipedia; fallback firstSeen) ≤ +8% vs SPY (s'është çmuar) · vëllami ≥ pragun minimal · 3+ javë rritje e qëndrueshme pa model spike-i. Mbi +8% → WATCH me flamurin already_moved (çmimi si filtër, jo si provë).
                REMOVED/REJECT: shkak negativ, mainstream (≥200 artikuj/24h), flamuj bllokues, ose ftohja (28+ ditë pa asnjë rritje Wikipedia — jo më 10, që trendet e ngadalta të mos ftohen para se të matet qëndrueshmëria 3-javore). Çdo kandidat gjurmohet për rezultatin 5/20 ditë vs SPY nga dita e tregtimit PAS zbulimit — përfshirë refuzuarit; të promovuarit gjurmohen edhe nga dita e ngjitjes.
                Score-i: demand = Wikipedia (prova e kërkesës) — qenia në feed s'jep më pikë; komponentët pa data s'numërohen ({active.componentsAvailable ?? '?'}/6 me data).
                ⚠️ Pragjet (+8%, 3 javë, 2M$/ditë, +50% wiki-discovery, 15% lift-i i trendStart) janë vlera fillestare të pazbatuara nga backtest-i — mos i trajto si të provuara.
              </small>
            </div>

            {/* dosja e hulumtimit të markës (nga fjalori — vetëm kur ekziston) */}
            {brandDossier && (
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-slate-700/70 bg-slate-900/50 p-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Çfarë do ta konfirmonte</p>
                  <p className="mt-1.5 text-xs text-foreground/90">{brandDossier.confirm}</p>
                </div>
                <div className="rounded-lg border border-slate-700/70 bg-slate-900/50 p-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><XCircle className="w-3.5 h-3.5 text-red-400" /> Çfarë e rrëzon tezën</p>
                  <p className="mt-1.5 text-xs text-foreground/90">{brandDossier.kill}</p>
                </div>
                <div className="rounded-lg border border-slate-700/70 bg-slate-900/50 p-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Rreziku i interpretimit</p>
                  <p className="mt-1.5 text-xs text-foreground/90">{brandDossier.risk}</p>
                </div>
              </div>
            )}

            {/* historia e statusit */}
            {active.history.length > 0 && (
              <div className="mt-4 rounded-lg border border-slate-700/70 bg-slate-900/50 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><HistoryIcon className="w-3.5 h-3.5 text-slate-400" /> Historia e statusit</p>
                <ul className="mt-1.5 space-y-1">
                  {active.history.map((h, i) => (
                    <li key={`${h.at}-${i}`} className="text-[11px] text-muted-foreground">
                      <span className="tabular-nums">{new Date(h.at).toLocaleString('sq-AL')}</span>
                      {' — '}<b className="text-foreground">{h.from === 'NEW' ? 'i zbuluar' : h.from} → {h.to}</b>
                      {`: ${h.reason}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* skanimet e fundit */}
        {state?.lastScans && state.lastScans.length > 0 && (
          <section style={box} className="!py-4">
            <h2 className="text-sm font-semibold text-foreground">Skanimet e fundit</h2>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="py-1 pr-4 font-medium">Koha</th>
                    <th className="py-1 pr-4 font-medium">Termа</th>
                    <th className="py-1 pr-4 font-medium">Marka</th>
                    <th className="py-1 pr-4 font-medium" title="Kandidatë të rinj nga zbulimi proaktiv i fjalorit me Wikipedia">Wiki-zbulime</th>
                    <th className="py-1 pr-4 font-medium">Aktivë</th>
                    <th className="py-1 pr-4 font-medium">Burimet</th>
                    <th className="py-1 font-medium">Kohëzgjatja</th>
                  </tr>
                </thead>
                <tbody>
                  {state.lastScans.map(s => (
                    <tr key={s.at} className="border-t border-slate-800">
                      <td className="py-1.5 pr-4 text-foreground/90">{new Date(s.at).toLocaleString('sq-AL')}</td>
                      <td className="py-1.5 pr-4 tabular-nums text-foreground/90">{s.termsScanned}</td>
                      <td className="py-1.5 pr-4 tabular-nums text-foreground/90">{s.termsClassified}</td>
                      <td className="py-1.5 pr-4 tabular-nums text-foreground/90">{s.discoveredWiki != null ? s.discoveredWiki : '—'}</td>
                      <td className="py-1.5 pr-4 tabular-nums text-foreground/90">{s.candidatesActive}</td>
                      <td className="py-1.5 pr-4 text-muted-foreground">
                        {Object.entries(s.sources).filter(([k]) => ['google_trends', 'wikipedia', 'gdelt', 'prices', 'finnhub'].includes(k))
                          .map(([k, v]) => `${k === 'google_trends' ? 'Trends' : k === 'wikipedia' ? 'Wiki' : k === 'gdelt' ? 'GDELT' : k === 'finnhub' ? 'Finnhub' : 'Çmimet'}: ${v === 'ok' ? 'ok' : v === 'throttled' ? 'kufizuar' : 'gabim'}`).join(' · ')}
                      </td>
                      <td className="py-1.5 tabular-nums text-muted-foreground">{(s.durationMs / 1000).toFixed(0)}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* prapavija: arkivi CSV + disclaimer */}
        <section style={box} className="!py-4">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Database className="w-4 h-4 text-rose-400" /> Prapavija</h2>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Çdo matje (Google Trends + Wikipedia + GDELT + çmimet) arkivohet automatikisht si CSV në prapavijë për backtest —
            {' '}<code className="rounded bg-slate-800 px-1 py-0.5 text-[11px] text-slate-300">data/social-arb-backtest/social-arb-YYYY-MM.csv</code> —
            {' '}pa buton ngarkimi në këtë ekran. Aktualisht: {state?.csvArchive.rows ?? 0} rreshta në {state?.csvArchive.files ?? 0} skedarë.
            {state?.storage.backend === 'upstash' && ' Ruajtja: Redis (Upstash) — e qëndrueshme në serverless.'}
            {state?.storage.backend !== 'upstash' && !state?.storage.persistent && ' Shënim: file-sistemi i këtij ambienti është i përkohshëm — ruaj CSV-të për backtest afatgjatë.'}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Kjo faqe është laborator hulumtimi — jo rekomandim tregtimi. Score-i dhe statuset janë hedhje të parashikueshme,
            jo sinjale ekzekutimi; asnjë urdhër s\'dërgohet.
          </p>
        </section>
      </main>
    </div>
  );
}

const inputStyle: React.CSSProperties = { background: '#1e293b', color: 'white', border: '1px solid #64748b', padding: 6, marginLeft: 8 };
