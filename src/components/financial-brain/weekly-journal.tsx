'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BookOpen, RefreshCw, ChevronDown, TrendingUp, TrendingDown, Minus,
  Loader2, AlertTriangle, Check, Lightbulb, PenLine, Info, Trophy,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

// ── Tipet (pasqyrë e API /api/cams-journal) ──

interface WeeklyStock {
  ticker: string;
  scanDate: string;
  rank: number;
  tier: string;
  score: number | null;
  priceAtScan: number | null;
  lastClose: number | null;
  ret5d: number | null;
  ret10d: number | null;
  ret20d: number | null;
  maxRunupPct: number | null;
  maxDrawdownPct: number | null;
  verdict: 'ROSE' | 'FELL' | 'FLAT' | 'PENDING';
  analysis: string[];
  tags: string[];
  entryHit: boolean | null;
  stopHit: boolean | null;
  targetHit: boolean | null;
  userNote?: string;
  context?: {
    sub?: { catalyst: number; acceleration: number; structure: number; revision: number; regime: number; penalty: number };
    setup?: string;
    tier?: string;
  } | null;
}

interface WeeklyGroup {
  weekStart: string;
  label: string;
  stocks: WeeklyStock[];
  stats: {
    total: number;
    rose: number;
    fell: number;
    pending: number;
    avgRet10d: number | null;
    best?: { ticker: string; ret: number };
    worst?: { ticker: string; ret: number };
  };
  lessons: string[];
  weekNote?: string;
}

interface JournalResponse {
  dbActive: boolean;
  weeks: WeeklyGroup[];
  error?: string;
}

const TIER_STYLE: Record<string, { bg: string; text: string; border: string; label: string }> = {
  A_KANDIDAT: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/40', label: 'A' },
  WATCHLIST: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/40', label: 'W' },
  MONITOR: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/40', label: 'M' },
  NO_TRADE: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/40', label: 'NT' },
  READY: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/40', label: 'RDY' },
};

function VerdictBadge({ v }: { v: WeeklyStock['verdict'] }) {
  if (v === 'ROSE') return <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"><TrendingUp className="w-2.5 h-2.5" />U RIT</span>;
  if (v === 'FELL') return <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30"><TrendingDown className="w-2.5 h-2.5" />RA</span>;
  if (v === 'FLAT') return <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground border border-muted/40"><Minus className="w-2.5 h-2.5" />PA QEJE</span>;
  return <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/25"><Loader2 className="w-2.5 h-2.5 animate-spin" />PA DATA</span>;
}

function RetCell({ label, v }: { label: string; v: number | null }) {
  const c = v == null ? 'text-muted-foreground/50' : v >= 2 ? 'text-emerald-400' : v <= -2 ? 'text-red-400' : 'text-muted-foreground';
  return (
    <div className="text-center">
      <p className="text-[9px] text-muted-foreground/70">{label}</p>
      <p className={`text-[12px] font-bold font-mono ${c}`}>{v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`}</p>
    </div>
  );
}

function StockRow({ stock, weekStart, strategy, noteSaved }: {
  stock: WeeklyStock; weekStart: string; strategy: string;
  noteSaved: (weekStart: string, ticker: string, note: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(stock.userNote || '');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const tier = TIER_STYLE[stock.tier] || TIER_STYLE.NO_TRADE;

  const saveNote = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/cams-journal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart, strategy, ticker: stock.ticker, note }),
      });
      if (res.ok) {
        noteSaved(weekStart, stock.ticker, note);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/40 bg-card/60">
      <button
        onClick={() => setOpen(!open)}
        className="w-full p-2.5 flex items-center gap-2 hover:bg-muted/10 transition-colors text-left"
      >
        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${stock.rank <= 3 ? 'bg-violet-500/20 text-violet-400' : 'bg-muted/30 text-muted-foreground'}`}>{stock.rank}</span>
        <span className="font-bold text-[13px] text-foreground w-14 flex-shrink-0">{stock.ticker}</span>
        <Badge variant="outline" className={`text-[9px] px-1 py-0 flex-shrink-0 ${tier.bg} ${tier.text} ${tier.border}`}>{tier.label}</Badge>
        <span className="text-[11px] text-muted-foreground hidden sm:inline flex-shrink-0">CAMS {stock.score ?? '—'}</span>
        <span className="text-[11px] text-muted-foreground/70 hidden md:inline flex-shrink-0">${stock.priceAtScan?.toFixed(2) ?? '—'} → ${stock.lastClose?.toFixed(2) ?? '—'}</span>
        <div className="ml-auto flex items-center gap-3 flex-shrink-0">
          <RetCell label="5d" v={stock.ret5d} />
          <RetCell label="10d" v={stock.ret10d} />
          <RetCell label="20d" v={stock.ret20d} />
          <VerdictBadge v={stock.verdict} />
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border/30">
          {/* Analiza: çfarë ndikoi */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
              <Info className="w-3 h-3 text-blue-400" /> Çfarë ndikoi çmimin?
            </p>
            <ul className="space-y-1">
              {stock.analysis.map((a, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[12px] text-foreground/85 leading-snug">
                  <span className="w-1 h-1 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Sub-score-t në momentin e sinjalit (CAMS) */}
          {stock.context?.sub && (
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              <span className="px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">Katalizatori {stock.context.sub.catalyst}</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Accelerimi {stock.context.sub.acceleration}</span>
              <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">Struktura {stock.context.sub.structure}</span>
              {stock.context.setup && <span className="px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground border border-muted/30">{stock.context.setup}</span>}
              {stock.entryHit === true && <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Hyrja u aktivizua</span>}
              {stock.entryHit === false && <span className="px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground border border-muted/30">Hyrja nuk u aktivizua</span>}
              {stock.targetHit && <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">3R u kap</span>}
              {stock.stopHit && !stock.targetHit && <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30">Stop u godit</span>}
              {stock.tags.filter((t) => t.startsWith('SETUP_') || t === 'NO_RVOL' || t === 'EXTENDED' || t === 'EARNINGS_SOON').slice(0, 3).map((t) => (
                <span key={t} className="px-1.5 py-0.5 rounded bg-muted/20 text-muted-foreground/80 border border-muted/25">{t}</span>
              ))}
            </div>
          )}

          {/* Shënimi i përdoruesit */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
              <PenLine className="w-3 h-3 text-amber-400" /> Shënimi im për {stock.ticker} — çfarë mësova?
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Shkruaj çfarë ke mësuar për këtë kandidat: a e ndoqe planin? Çfarë do të bëje ndryshe?"
              className="w-full min-h-[60px] rounded-md border border-border/50 bg-muted/10 p-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-amber-500/40 resize-y"
            />
            <div className="flex items-center gap-2 mt-1.5">
              <button
                onClick={saveNote}
                disabled={saving}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : savedFlash ? <Check className="w-3 h-3" /> : null}
                {savedFlash ? 'U ruajt!' : 'Ruaj shënimin'}
              </button>
              {savedFlash && <span className="text-[10px] text-emerald-400">Mësimi u regjistrua në ditar</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WeekCard({ week, strategy, noteSaved }: {
  week: WeeklyGroup; strategy: string;
  noteSaved: (weekStart: string, ticker: string, note: string) => void;
}) {
  const [weekNote, setWeekNote] = useState(week.weekNote || '');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const saveWeekNote = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/cams-journal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart: week.weekStart, strategy, note: weekNote }),
      });
      if (res.ok) {
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  const s = week.stats;

  return (
    <Card className="border-border/50">
      <CardContent className="p-4 space-y-3">
        {/* Header javash */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-[14px] font-bold text-foreground">Java e {week.label}</h3>
            <p className="text-[11px] text-muted-foreground">{s.total} kandidatë të Top 10 · skanimet e javës</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-semibold">{s.rose} u rritën</span>
            <span className="text-[11px] px-2 py-1 rounded-md bg-red-500/10 text-red-400 border border-red-500/25 font-semibold">{s.fell} ranë</span>
            {s.pending > 0 && <span className="text-[11px] px-2 py-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/25">{s.pending} në pritje</span>}
            {s.avgRet10d != null && (
              <span className={`text-[11px] px-2 py-1 rounded-md font-mono font-bold border ${s.avgRet10d >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : 'bg-red-500/10 text-red-400 border-red-500/25'}`}>
                10d mes. {s.avgRet10d > 0 ? '+' : ''}{s.avgRet10d}%
              </span>
            )}
          </div>
        </div>

        {/* Mësimet automatike */}
        <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 p-2.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
            <p className="text-[12px] font-semibold text-amber-400">Mësimet e javës — automatike</p>
            <span className="ml-auto text-[10px] text-muted-foreground/60">çfarë tregon data e kësaj jave</span>
          </div>
          <ul className="space-y-1">
            {week.lessons.map((l, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11.5px] text-foreground/85 leading-snug">
                <span className="w-1 h-1 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Tabela e aksioneve */}
        <div className="space-y-1.5">
          {week.stocks.map((st) => (
            <StockRow
              key={st.ticker}
              stock={st}
              weekStart={week.weekStart}
              strategy={strategy}
              noteSaved={noteSaved}
            />
          ))}
        </div>

        {/* Best / worst */}
        {(s.best || s.worst) && (
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            {s.best && <span className="flex items-center gap-1"><Trophy className="w-3 h-3 text-emerald-400" />Më i miri: <strong className="text-emerald-400">{s.best.ticker} {s.best.ret > 0 ? '+' : ''}{s.best.ret}%</strong></span>}
            {s.worst && <span className="flex items-center gap-1"><TrendingDown className="w-3 h-3 text-red-400" />Më i keqi: <strong className="text-red-400">{s.worst.ticker} {s.worst.ret > 0 ? '+' : ''}{s.worst.ret}%</strong></span>}
          </div>
        )}

        {/* Shënimi javor i përdoruesit */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
            <PenLine className="w-3 h-3 text-violet-400" /> Shënimet e mia për këtë javë — gabimet dhe mësimet
          </p>
          <textarea
            value={weekNote}
            onChange={(e) => setWeekNote(e.target.value)}
            placeholder="Çfarë bëra mirë këtë javë? Çfarë gabimi duhet të mos përsëris? Çfarë modeloash po shoh te kandidatët?"
            className="w-full min-h-[70px] rounded-md border border-border/50 bg-muted/10 p-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-violet-500/40 resize-y"
          />
          <div className="flex items-center gap-2 mt-1.5">
            <button
              onClick={saveWeekNote}
              disabled={saving}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-violet-500/10 border border-violet-500/30 text-violet-400 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : savedFlash ? <Check className="w-3 h-3" /> : null}
              {savedFlash ? 'U ruajt!' : 'Ruaj shënimin e javës'}
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Komponenti kryesor ──

export function WeeklyJournal() {
  const [strategy, setStrategy] = useState<'CAMS' | 'IBKR'>('CAMS');
  const [data, setData] = useState<JournalResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (strat: 'CAMS' | 'IBKR') => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cams-journal?strategy=${strat}&weeks=8&_t=${Date.now()}`, { cache: 'no-store' });
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
  }, []);

  useEffect(() => {
    load('CAMS');
  }, [load]);

  const switchStrategy = (s: 'CAMS' | 'IBKR') => {
    setStrategy(s);
    load(s);
  };

  const noteSaved = useCallback((weekStart: string, ticker: string, note: string) => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        weeks: prev.weeks.map((w) =>
          w.weekStart === weekStart
            ? { ...w, stocks: w.stocks.map((st) => (st.ticker === ticker ? { ...st, userNote: note } : st)) }
            : w
        ),
      };
    });
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-violet-500/20 bg-violet-500/5">
        <CardContent className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-violet-500/15 rounded-lg p-2.5"><BookOpen className="w-6 h-6 text-violet-400" /></div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Ditari Javor Top 10</h2>
                <p className="text-[13px] text-muted-foreground">A u rritën kandidatët? Çfarë ndikoi? Mëso nga çdo javë — shkruaj shënimet e tua.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-md border border-border/50 overflow-hidden">
                <button
                  onClick={() => switchStrategy('CAMS')}
                  className={`text-[12px] px-3 py-1.5 transition-colors ${strategy === 'CAMS' ? 'bg-violet-600 text-white' : 'text-muted-foreground hover:bg-muted/20'}`}
                >CAMS</button>
                <button
                  onClick={() => switchStrategy('IBKR')}
                  className={`text-[12px] px-3 py-1.5 transition-colors ${strategy === 'IBKR' ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:bg-muted/20'}`}
                >IBKR</button>
              </div>
              <button
                onClick={() => load(strategy)}
                disabled={loading}
                className="flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Duke llogaritur...' : 'Rifresko'}
              </button>
            </div>
          </div>
          <p className="text-[11.5px] text-muted-foreground/80 mt-3 leading-relaxed">
            Çdo skanim ruan Top 10 në ditar. Rishikimi javor merr çmimet reale pas skanimit (5 / 10 / 20 ditë tregtimi), analizon çfarë ndikoi —
            a u mbajt gap-u i katalizatorit? a u krye breakout-i? u forcua volumi? cili regjim ishte? — dhe nxjerr mësimet automatike.
            Shkruaj shënimet e tua për çdo aksion dhe për javën: kështu ndërton kujtesën që të parashikosh më mirë.
          </p>
        </CardContent>
      </Card>

      {loading && !data && (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
          <p className="text-center text-[12px] text-muted-foreground">Duke marrë çmimet reale të javëve dhe duke analizuar çdo kandidat...</p>
        </div>
      )}

      {error && (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="p-4 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5" />
            <div>
              <p className="text-[13px] font-semibold text-red-400">Gabim në ditar</p>
              <p className="text-[12px] text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {data && !loading && data.weeks.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center space-y-2">
            <BookOpen className="w-6 h-6 text-muted-foreground mx-auto" />
            <p className="text-[13px] text-muted-foreground">
              {data.dbActive
                ? `Nuk ka ende Top 10 të ruajtur për strategjinë ${strategy}. Nis një skanim ${strategy === 'CAMS' ? 'në tab-in CAMS' : 'në tab-in IBKR'} — ditari mbushet automatikisht.`
                : 'Databaza nuk është aktive (mungon DATABASE_URL).'}
            </p>
          </CardContent>
        </Card>
      )}

      {data && data.weeks.map((w) => (
        <WeekCard key={w.weekStart} week={w} strategy={strategy} noteSaved={noteSaved} />
      ))}
    </div>
  );
}
