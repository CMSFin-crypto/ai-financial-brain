'use client';

// ═══════════════════════════════════════════════════════════════
// TASK 26 — FUNDAMENTAL POPUP (Faza 1: vetëm kontekst informues)
// ═══════════════════════════════════════════════════════════════
// Popup-i i fundamentit për ÇDO kandidat të IBKR scanner-it.
// Organizimi sipas spec-it të userit:
//
//   Fundamentals
//   ├── Growth
//   ├── Profitability
//   ├── Cash Flow
//   ├── Valuation
//   ├── Earnings & Estimates
//   ├── Ownership
//   └── Risk Flags
//
// Për secilin tregues: vlera aktuale · ndryshimi periodik · periudha ·
// burimi · timestamp-i · statusi (strong/neutral/weak).
// Metrikë që mungon → "N/A — data unavailable" (kurrë zero fallco).
//
// ⚠️ RREGULLI I FAZËS 1: fundamentet NUK ndryshojnë Technical Score,
// READY, BUY ose WATCH — shfaqen si kontekst derisa testi rigoroz
// (Technical-only vs Technical + Fundamental) të vendosë ndryshe.
// ═══════════════════════════════════════════════════════════════

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp, BarChart3, DollarSign, Scale, CalendarClock,
  Building2, AlertTriangle, Loader2, Info, Database,
} from 'lucide-react';
import type { FundamentalMetric, FundamentalReport, MetricStatus, SectionKey } from '@/lib/fundamentals/normalize';

// ─── Konfigurimi i seksioneve (7 — sipas spec-it) ───
// Etiketa të shkurtra për tab-in (dialogu ngushtë — një rresht, scroll horizontal)
const SECTION_META: Record<SectionKey, { icon: typeof TrendingUp; tab: string; short: string }> = {
  growth:        { icon: TrendingUp, tab: 'Growth', short: 'Growth' },
  profitability: { icon: BarChart3, tab: 'Profitability', short: 'Profitab.' },
  cashFlow:      { icon: DollarSign, tab: 'Cash Flow', short: 'Cash' },
  valuation:     { icon: Scale, tab: 'Valuation', short: 'Valuation' },
  earnings:      { icon: CalendarClock, tab: 'Earnings & Estimates', short: 'Earnings' },
  ownership:     { icon: Building2, tab: 'Ownership', short: 'Own.' },
  risk:          { icon: AlertTriangle, tab: 'Risk Flags', short: 'Risk' },
};

const STATUS_STYLE: Record<MetricStatus, { label: string; cls: string }> = {
  strong:  { label: 'Strong',  cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' },
  neutral: { label: 'Neutral', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-400' },
  weak:    { label: 'Weak',    cls: 'border-red-500/30 bg-red-500/10 text-red-400' },
  unknown: { label: 'N/A',     cls: 'border-muted/40 bg-muted/10 text-muted-foreground' },
};

const CONTEXT_STYLE: Record<string, string> = {
  'Positive': 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  'Neutral': 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  'Negative': 'border-red-500/40 bg-red-500/10 text-red-400',
  'Insufficient data': 'border-muted/40 bg-muted/10 text-muted-foreground',
};

// ─── Rreshti i një treguesi ───
function MetricRow({ m }: { m: FundamentalMetric }) {
  const st = STATUS_STYLE[m.status];
  return (
    <div className="rounded-lg border border-border/40 bg-muted/5 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold text-foreground leading-tight">{m.label}</p>
          <p className={`text-[16px] font-bold mt-1 ${m.value === undefined ? 'text-muted-foreground/60 text-[13px] font-medium' : 'text-foreground'}`}>
            {m.display}
          </p>
          {m.change && (
            <p className="text-[11px] text-blue-300/90 mt-0.5">{m.change}</p>
          )}
        </div>
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold flex-shrink-0 ${st.cls}`}>
          {st.label}
        </span>
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-border/30 grid gap-0.5 text-[10.5px] text-muted-foreground/80">
        <p><span className="text-muted-foreground/60">Periudha:</span> {m.period}</p>
        <p className="flex items-center gap-1">
          <span className="text-muted-foreground/60">Burimi:</span> {m.source}
          {m.updated && <span className="text-muted-foreground/50">· {new Date(m.updated).toLocaleDateString('sq-AL')}</span>}
        </p>
        {m.note && <p className="text-muted-foreground/70 leading-snug">{m.note}</p>}
      </div>
    </div>
  );
}

// ─── Rreshti i një risk flag ───
function RiskFlagRow({ flag }: { flag: FundamentalReport['riskFlags'][number] }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${flag.severity === 'high'
      ? 'border-red-500/30 bg-red-500/10'
      : 'border-amber-500/25 bg-amber-500/5'}`}>
      <div className="flex items-center gap-2">
        <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 ${flag.severity === 'high' ? 'text-red-400' : 'text-amber-400'}`} />
        <p className={`text-[12.5px] font-bold ${flag.severity === 'high' ? 'text-red-400' : 'text-amber-400'}`}>{flag.label}</p>
        <span className="text-[9.5px] uppercase tracking-wide text-muted-foreground/70 ml-auto">{flag.severity}</span>
      </div>
      <p className="text-[11.5px] text-muted-foreground leading-relaxed mt-1">{flag.detail}</p>
    </div>
  );
}

// ─── Komponenti kryesor ───
export interface FundamentalPopupProps {
  symbol: string;
  report: FundamentalReport | null;
  loading?: boolean;
  /** Kuadrati i verdiktit (tregues teknik + event score + vendimi) — të njëjtat me kartën. */
  technicalScore?: number;      // 0-100
  eventScore?: number;         // 0-2
  verdict?: string;            // READY / WATCHLIST / ...
  compact?: boolean;           // buton më i vogël për brenda kartës
}

export function FundamentalPopup({
  symbol, report, loading, technicalScore, eventScore, verdict, compact,
}: FundamentalPopupProps) {
  const [open, setOpen] = useState(false);

  const contextLabel = report?.contextLabel ?? 'Insufficient data';
  const ctxCls = CONTEXT_STYLE[contextLabel] ?? CONTEXT_STYLE['Insufficient data'];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          disabled={!report && !loading}
          title={!report && !loading
            ? 'N/A — data unavailable'
            : `Fundamentet e ${symbol}: Growth · Profitability · Cash Flow · Valuation · Earnings & Estimates · Ownership · Risk Flags`}
          className={`inline-flex items-center gap-1.5 rounded-md border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            compact
              ? 'px-2 py-0.5 text-[10.5px] bg-sky-500/10 border-sky-500/30 text-sky-300 hover:bg-sky-500/20'
              : 'px-2.5 py-1 text-[11.5px] bg-sky-500/10 border-sky-500/30 text-sky-300 hover:bg-sky-500/20'}`}
        >
          <BarChart3 className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          {loading && !report ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Fundamentet'}
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className="text-foreground">Fundamentet — {symbol}</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-bold ${ctxCls}`}>
              Fundamental Context: {contextLabel}
            </span>
          </DialogTitle>
          <span className="sr-only">
            Raport fundamental me 7 seksione: rritja, rentabiliteti, cash flow, vlerësimi, fitimet dhe estimatet,
            pronësia dhe flamujt e rrezikut — kontekst informues në Fazën 1, jo sinjal tregtimi.
          </span>
        </DialogHeader>

        {report ? (
          <>
            {/* ── Kuadrati i verdiktit (spec i userit) ── */}
            <div className="rounded-lg border border-border/50 bg-muted/5 p-3 text-[12.5px] space-y-1">
              <div className="flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-sky-400 mt-0.5 flex-shrink-0" />
                <p className="text-muted-foreground leading-snug">
                  Fundamentet shfaqen si <strong className="text-foreground">kontekst informues</strong> në Fazën 1.
                  Ato <strong className="text-foreground">nuk ndryshojnë</strong> Technical Score, READY, BUY ose WATCH —
                  derisa testi rigoroz (Technical-only kundrejt Technical + Fundamental) të vendosë ndryshe.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div className="rounded-md bg-muted/10 px-2 py-1.5">
                  <p className="text-[9.5px] uppercase tracking-wide text-muted-foreground/70">Technical Score</p>
                  <p className="text-[13px] font-bold text-foreground">{technicalScore != null ? `${technicalScore}/100` : '—'}</p>
                </div>
                <div className="rounded-md bg-muted/10 px-2 py-1.5">
                  <p className="text-[9.5px] uppercase tracking-wide text-muted-foreground/70">Event Score</p>
                  <p className="text-[13px] font-bold text-foreground">{eventScore != null ? `${eventScore}/2` : '—'}</p>
                </div>
                <div className="rounded-md bg-muted/10 px-2 py-1.5">
                  <p className="text-[9.5px] uppercase tracking-wide text-muted-foreground/70">Fundamental Context</p>
                  <p className={`text-[13px] font-bold ${contextLabel === 'Positive' ? 'text-emerald-400' : contextLabel === 'Negative' ? 'text-red-400' : 'text-amber-400'}`}>{contextLabel}</p>
                </div>
                <div className="rounded-md bg-muted/10 px-2 py-1.5">
                  <p className="text-[9.5px] uppercase tracking-wide text-muted-foreground/70">Trade Verdict</p>
                  <p className={`text-[13px] font-bold ${verdict === 'READY' ? 'text-emerald-400' : 'text-amber-400'}`}>{verdict ?? '—'}</p>
                </div>
              </div>
              {/* Etiketat sipas specit: Growth/Profitability/Cash flow/Valuation/Risk */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[11px] text-muted-foreground">
                {report.sections.filter(s => s.key !== 'risk' && s.key !== 'ownership' && s.key !== 'earnings').map(s => (
                  <span key={s.key}>{s.title}: <strong className={sectionLabelCls(s.label)}>{s.label}</strong></span>
                ))}
                <span>Risk: <strong className={sectionLabelCls(report.sections.find(s => s.key === 'risk')?.label ?? 'Unknown')}>{report.sections.find(s => s.key === 'risk')?.label ?? 'Unknown'}</strong></span>
              </div>
            </div>

            {/* ── 7 seksionet në tabs (një rresht, scroll horizontal — pa wrap që mos
                  të mbivendosen trigger-at me përmbajtjen) ── */}
            <Tabs defaultValue="growth" className="w-full">
              <TabsList className="h-auto w-full justify-start gap-0.5 p-1" style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
                {report.sections.map(s => {
                  const meta = SECTION_META[s.key];
                  const Icon = meta.icon;
                  return (
                    <TabsTrigger key={s.key} value={s.key} className="text-[11px] px-2 py-1 gap-1 whitespace-nowrap flex-shrink-0">
                      <Icon className="w-3 h-3" />
                      <span className="hidden sm:inline">{meta.tab}</span>
                      <span className="sm:hidden">{meta.short}</span>
                      {s.key === 'risk' && report.riskFlags.length > 0 && (
                        <span className="ml-0.5 px-1 rounded bg-red-500/20 text-red-400 text-[9.5px] font-bold">{report.riskFlags.length}</span>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {report.sections.map(s => (
                <TabsContent key={s.key} value={s.key} className="mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[12px] text-muted-foreground">
                      {s.key === 'risk'
                        ? 'Paralajmërime të dukshme — vetëm shënojnë kandidatin, nuk e bllokojnë tregtinë në Fazën 1.'
                        : 'Çdo tregues me periudhë, burim dhe status — pa numra të zhveshur.'}
                    </p>
                    {s.key !== 'risk' && (
                      <Badge variant="outline" className={`text-[10.5px] ${sectionBadgeCls(s.label)}`}>{s.label}</Badge>
                    )}
                  </div>
                  <div className="grid gap-1.5">
                    {s.key === 'risk' ? (
                      report.riskFlags.length === 0 ? (
                        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-3 flex items-center gap-2">
                          <Info className="w-4 h-4 text-emerald-400" />
                          <p className="text-[12.5px] text-emerald-400 font-medium">Asnjë risk flag aktiv me të dhënat e disponueshme.</p>
                        </div>
                      ) : (
                        report.riskFlags.map(f => <RiskFlagRow key={f.code + f.label} flag={f} />)
                      )
                    ) : (
                      s.metrics.map(m => <MetricRow key={m.key} m={m} />)
                    )}
                  </div>
                </TabsContent>
              ))}
            </Tabs>

            {/* ── Footer: burimi + mbulimi ── */}
            <div className="flex items-center justify-between gap-2 flex-wrap text-[10.5px] text-muted-foreground/70 pt-1 border-t border-border/30">
              <span className="flex items-center gap-1">
                <Database className="w-3 h-3" />
                {report.dataInfo.provider} · {new Date(report.dataInfo.fetchedAt).toLocaleString('sq-AL')}
              </span>
              <span>Mbulimi i të dhënave: {report.dataInfo.metricsAvailable}/{report.dataInfo.metricsTotal} tregues bazë ({Math.round(report.coverage * 100)}%)</span>
            </div>
          </>
        ) : (
          <div className="py-8 flex flex-col items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <p className="text-[12.5px] text-muted-foreground">N/A — data unavailable për {symbol}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function sectionLabelCls(label: string): string {
  if (['Positive', 'Strong', 'Cheap'].includes(label)) return 'text-emerald-400';
  if (['Negative', 'Weak', 'Very Expensive', 'High'].includes(label)) return 'text-red-400';
  if (['Expensive', 'Low'].includes(label)) return 'text-amber-400';
  return 'text-muted-foreground';
}

function sectionBadgeCls(label: string): string {
  if (['Positive', 'Strong', 'Cheap'].includes(label)) return 'border-emerald-500/30 text-emerald-400';
  if (['Negative', 'Weak', 'Very Expensive', 'High'].includes(label)) return 'border-red-500/30 text-red-400';
  if (['Expensive', 'Low'].includes(label)) return 'border-amber-500/30 text-amber-400';
  return 'border-border/40 text-muted-foreground';
}
