'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Shield,
  User,
  Bot,
  AlertTriangle,
  Clock,
  RefreshCw,
  Plus,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Edit,
  Ban,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Summary {
  totalOverrides: number;
  accepted: number;
  rejected: number;
  modified: number;
  pending: number;
  evaluated: number;
}

interface HitRate {
  modelHitRate: number;
  humanHitRate: number;
  delta: number;
  sampleModel: number;
  sampleHuman: number;
  interpretation: string;
}

interface Reason {
  reason: string;
  count: number;
  pct: number;
  correctOverrides: number;
  wrongOverrides: number;
  hitRate: number;
  pending: number;
}

interface Regime {
  regime: string;
  count: number;
  humanHitRate: number;
  modelWouldHaveBeenRight: number;
}

interface RecentOverride {
  id: string;
  symbol: string;
  originalDecision: string;
  overrideDecision: string;
  overrideReason: string;
  notes: string;
  modelScore: number;
  modelConfidence: number;
  regime: string;
  outcome: string;
  actualReturn: number;
  createdAt: string;
}

interface OverrideData {
  computedAt: string;
  summary: Summary;
  hitRate: HitRate;
  reasons: Reason[];
  regimeBreakdown: Regime[];
  recentOverrides: RecentOverride[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const OVERRIDE_REASONS = [
  'Pajtim me Sinjalin',
  'Lajme / Rrezik Lajmesh',
  'Rregullimi i Madhësisë',
  'Kushte të Papritura tregu',
  'Divergjencë Teknike',
  'Rrezik i Lartë / Stop Loss',
] as const;

const ORIGINAL_DECISIONS = ['BUY', 'SELL', 'HOLD', 'NO_TRADE'] as const;
const OVERRIDE_DECISIONS = ['ACCEPTED', 'REJECTED', 'MODIFIED'] as const;

const RECENT_LIMIT = 25;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function hitRateColor(rate: number): string {
  if (rate > 60) return 'text-emerald-400';
  if (rate >= 40) return 'text-amber-400';
  return 'text-red-400';
}

function hitRateBg(rate: number): string {
  if (rate > 60) return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25';
  if (rate >= 40) return 'bg-amber-500/15 text-amber-400 border-amber-500/25';
  return 'bg-red-500/15 text-red-400 border-red-500/25';
}

function outcomeBadge(outcome: string) {
  switch (outcome) {
    case 'CORRECT_OVERRIDE':
      return (
        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/25 gap-1">
          <CheckCircle2 className="size-3" />
          Korrekt
        </Badge>
      );
    case 'WRONG_OVERRIDE':
      return (
        <Badge className="bg-red-500/15 text-red-400 border-red-500/25 gap-1">
          <XCircle className="size-3" />
          Gabim
        </Badge>
      );
    default:
      return (
        <Badge className="bg-muted text-muted-foreground border-border gap-1">
          <HelpCircle className="size-3" />
          Pending
        </Badge>
      );
  }
}

function overrideDecisionBadge(decision: string) {
  switch (decision) {
    case 'ACCEPTED':
      return (
        <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/25 gap-1">
          <ThumbsUp className="size-3" />
          {decision}
        </Badge>
      );
    case 'REJECTED':
      return (
        <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/25 gap-1">
          <Ban className="size-3" />
          {decision}
        </Badge>
      );
    case 'MODIFIED':
      return (
        <Badge className="bg-violet-500/15 text-violet-400 border-violet-500/25 gap-1">
          <Edit className="size-3" />
          {decision}
        </Badge>
      );
    default:
      return <Badge variant="outline">{decision}</Badge>;
  }
}

function returnCell(value: number | null | undefined) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const color = value >= 0 ? 'text-emerald-400' : 'text-red-400';
  const sign = value >= 0 ? '+' : '';
  return <span className={`font-medium ${color}`}>{sign}{value.toFixed(2)}%</span>;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('sq-AL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* ------------------------------------------------------------------ */
/*  Custom Tooltip for BarChart                                        */
/* ------------------------------------------------------------------ */

interface BarTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: Reason }>;
  label?: string;
}

function BarTooltipContent({ active, payload }: BarTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-sm">
      <p className="font-semibold text-foreground">{d.reason}</p>
      <p className="text-muted-foreground">Numërimi: <span className="text-foreground font-medium">{d.count}</span></p>
      <p className="text-muted-foreground">Hit Rate: <span className={hitRateColor(d.hitRate)}>{d.hitRate}%</span></p>
      <p className="text-muted-foreground">% e gjithë: <span className="text-foreground font-medium">{d.pct}%</span></p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading Skeleton                                                   */
/* ------------------------------------------------------------------ */

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Summary cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20 mb-2" />
              <Skeleton className="h-4 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Comparison skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-6 w-40 mb-4" />
              <Skeleton className="h-16 w-32 mb-2" />
              <Skeleton className="h-4 w-48" />
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Chart skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-56" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
      {/* Table skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function OverrideJournalPage() {
  const [data, setData] = useState<OverrideData | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formSymbol, setFormSymbol] = useState('');
  const [formOriginal, setFormOriginal] = useState('');
  const [formOverride, setFormOverride] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formScore, setFormScore] = useState('');
  const [formConfidence, setFormConfidence] = useState('');
  const [formRegime, setFormRegime] = useState('');

  /* ---------- Data fetching ---------- */

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/override-stats?full=true&limit=50');
      const json = await res.json();
      if (json.ok && json.data) {
        setData(json.data);
      } else {
        toast.error('Gabim gjatë ngarkimit të të dhënave');
      }
    } catch {
      toast.error('Gabim rrjeti — nuk u arrit të ngarkoheshin të dhënat');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ---------- Form submit ---------- */

  const handleSubmit = async () => {
    if (!formSymbol || !formOriginal || !formOverride || !formReason) {
      toast.error('Plotësoni fushat e detyrueshme');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/override-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: formSymbol.toUpperCase(),
          originalDecision: formOriginal,
          overrideDecision: formOverride,
          overrideReason: formReason,
          notes: formNotes || undefined,
          modelScore: formScore ? parseFloat(formScore) : undefined,
          modelConfidence: formConfidence ? parseFloat(formConfidence) : undefined,
          regime: formRegime || undefined,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        toast.success('Override u shtua me sukses');
        // Reset form
        setFormSymbol('');
        setFormOriginal('');
        setFormOverride('');
        setFormReason('');
        setFormNotes('');
        setFormScore('');
        setFormConfidence('');
        setFormRegime('');
        setFormOpen(false);
        fetchData();
      } else {
        toast.error(json.error || 'Gabim gjatë shtimit të override');
      }
    } catch {
      toast.error('Gabim rrjeti');
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- Render ---------- */

  if (loading && !data) return <LoadingSkeleton />;
  if (!data) return null;

  const { summary, hitRate, reasons, regimeBreakdown, recentOverrides } = data;
  const displayedOverrides = recentOverrides.slice(0, RECENT_LIMIT);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/15">
              <Shield className="size-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Ditar i Override-ve</h1>
              <p className="text-sm text-muted-foreground">
                {data.computedAt
                  ? `Përditësuar: ${formatDate(data.computedAt)}`
                  : ''}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="w-fit gap-2"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            Rifresko
          </Button>
        </div>

        {/* Section 1: Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Overrides */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Shield className="size-4" />
                Total Overrides
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{summary.totalOverrides}</div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/25">
                  {summary.accepted} Pranuar
                </Badge>
                <Badge className="bg-red-500/15 text-red-400 border-red-500/25">
                  {summary.rejected} Refuzuar
                </Badge>
                <Badge className="bg-violet-500/15 text-violet-400 border-violet-500/25">
                  {summary.modified} Modifikuar
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Model Hit Rate */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Bot className="size-4" />
                Model Hit Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{hitRate.modelHitRate}%</div>
              <p className="text-xs text-muted-foreground mt-1">
                Nga {hitRate.sampleModel} mostra
              </p>
            </CardContent>
          </Card>

          {/* Card 3: Human Hit Rate */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <User className="size-4" />
                Human Hit Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold">{hitRate.humanHitRate}%</span>
                <Badge
                  className={`gap-1 ${
                    hitRate.delta >= 0
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                      : 'bg-red-500/15 text-red-400 border-red-500/25'
                  }`}
                >
                  {hitRate.delta >= 0 ? (
                    <ThumbsUp className="size-3" />
                  ) : (
                    <ThumbsDown className="size-3" />
                  )}
                  {hitRate.delta >= 0 ? '+' : ''}
                  {hitRate.delta}%
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Nga {hitRate.sampleHuman} mostra
              </p>
            </CardContent>
          </Card>

          {/* Card 4: Pending Evaluation */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="size-4" />
                Në Pritje të Vlerësimit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{summary.pending}</div>
              <p className="text-xs text-muted-foreground mt-1">
                nga {summary.totalOverrides} total
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Section 2: Model vs Human Comparison */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-400" />
            Model vs Njeri — Krahasim
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Model card */}
            <Card className="relative overflow-hidden">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex size-8 items-center justify-center rounded-full bg-blue-500/15">
                    <Bot className="size-4 text-blue-400" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">
                    Model (pa override)
                  </span>
                </div>
                <div className="text-5xl font-bold tracking-tight text-blue-400">
                  {hitRate.modelHitRate}
                  <span className="text-2xl text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Mostra: {hitRate.sampleModel} raste të vlerësuara
                </p>
              </CardContent>
            </Card>

            {/* Human card */}
            <Card className="relative overflow-hidden">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex size-8 items-center justify-center rounded-full bg-emerald-500/15">
                    <User className="size-4 text-emerald-400" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">
                    Njeri (me override)
                  </span>
                </div>
                <div className="text-5xl font-bold tracking-tight text-emerald-400">
                  {hitRate.humanHitRate}
                  <span className="text-2xl text-muted-foreground">%</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <p className="text-xs text-muted-foreground">
                    Mostra: {hitRate.sampleHuman} raste të vlerësuara
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Delta + Interpretation */}
          <div className="mt-4 rounded-lg border border-border bg-card p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Diferenca (Delta):</span>
                <span
                  className={`text-2xl font-bold ${
                    hitRate.delta >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {hitRate.delta >= 0 ? '+' : ''}{hitRate.delta}%
                </span>
              </div>
              <p className="text-sm text-muted-foreground sm:ml-auto">
                {hitRate.interpretation}
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Override Reason Breakdown */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Shpërbërja e Arsyeve të Override</h2>

          {/* Bar chart */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Numërimi sipas arsyes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={reasons}
                    layout="vertical"
                    margin={{ left: 20, right: 20, top: 4, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="reason"
                      width={180}
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                      tickLine={false}
                    />
                    <Tooltip
                      content={(props: BarTooltipProps) => <BarTooltipContent {...props} />}
                      cursor={{ fill: 'hsl(var(--muted))' }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {reasons.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            entry.hitRate > 60
                              ? '#10b981'
                              : entry.hitRate >= 40
                                ? '#f59e0b'
                                : '#ef4444'
                          }
                          fillOpacity={0.8}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Reasons table */}
          <Card>
            <CardContent className="pt-6">
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Arsyeja</TableHead>
                      <TableHead className="text-right">Numërimi</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead className="text-right">Hit Rate</TableHead>
                      <TableHead className="text-right">Korrekt</TableHead>
                      <TableHead className="text-right">Gabim</TableHead>
                      <TableHead className="text-right">Në Pritje</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reasons.map((r) => (
                      <TableRow key={r.reason}>
                        <TableCell className="font-medium">{r.reason}</TableCell>
                        <TableCell className="text-right">{r.count}</TableCell>
                        <TableCell className="text-right">{r.pct}%</TableCell>
                        <TableCell className="text-right">
                          <Badge className={`border ${hitRateBg(r.hitRate)}`}>
                            {r.hitRate}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-emerald-400">
                          {r.correctOverrides}
                        </TableCell>
                        <TableCell className="text-right text-red-400">
                          {r.wrongOverrides}
                        </TableCell>
                        <TableCell className="text-right text-amber-400">
                          {r.pending}
                        </TableCell>
                      </TableRow>
                    ))}
                    {reasons.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          Nuk ka të dhëna
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Section 4: Regime Breakdown */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Shpërbërja sipas Regjimit</h2>
          <Card>
            <CardContent className="pt-6">
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Regjimi</TableHead>
                      <TableHead className="text-right">Numërimi</TableHead>
                      <TableHead className="text-right">Human Hit Rate</TableHead>
                      <TableHead className="text-right">Modeli do të ishte i saktë</TableHead>
                      <TableHead className="text-right">Delta (Vlera e shtuar)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {regimeBreakdown
                      .slice()
                      .sort((a, b) => {
                        const deltaA = a.humanHitRate - (a.count > 0 ? (a.modelWouldHaveBeenRight / a.count) * 100 : 0);
                        const deltaB = b.humanHitRate - (b.count > 0 ? (b.modelWouldHaveBeenRight / b.count) * 100 : 0);
                        return deltaB - deltaA;
                      })
                      .map((r) => {
                        const modelRate = r.count > 0 ? (r.modelWouldHaveBeenRight / r.count) * 100 : 0;
                        const delta = r.humanHitRate - modelRate;
                        return (
                          <TableRow key={r.regime}>
                            <TableCell className="font-medium">{r.regime}</TableCell>
                            <TableCell className="text-right">{r.count}</TableCell>
                            <TableCell className="text-right">
                              <span className={hitRateColor(r.humanHitRate)}>
                                {r.humanHitRate}%
                              </span>
                            </TableCell>
                            <TableCell className="text-right text-blue-400">
                              {r.modelWouldHaveBeenRight}
                              <span className="text-muted-foreground text-xs ml-1">
                                ({modelRate.toFixed(1)}%)
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge
                                className={`gap-1 border ${
                                  delta >= 0
                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                                    : 'bg-red-500/15 text-red-400 border-red-500/25'
                                }`}
                              >
                                {delta >= 0 ? (
                                  <ThumbsUp className="size-3" />
                                ) : (
                                  <ThumbsDown className="size-3" />
                                )}
                                {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    {regimeBreakdown.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          Nuk ka të dhëna
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Section 5: Recent Overrides Table */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Override-t e Fundit</h2>
          <Card>
            <CardContent className="pt-6">
              <div className="max-h-[600px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Simboli</TableHead>
                      <TableHead>Vendimi Origjinal</TableHead>
                      <TableHead>Override</TableHead>
                      <TableHead>Arsyeja</TableHead>
                      <TableHead className="text-right">Model Score</TableHead>
                      <TableHead>Regjimi</TableHead>
                      <TableHead>Rezultati</TableHead>
                      <TableHead className="text-right">Return</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedOverrides.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="text-muted-foreground text-xs">
                          {formatDate(o.createdAt)}
                        </TableCell>
                        <TableCell className="font-semibold">{o.symbol}</TableCell>
                        <TableCell>{o.originalDecision}</TableCell>
                        <TableCell>{overrideDecisionBadge(o.overrideDecision)}</TableCell>
                        <TableCell className="text-xs max-w-[180px] truncate">
                          {o.overrideReason}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-muted-foreground">
                            {o.modelScore?.toFixed(1) ?? '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {o.regime}
                          </Badge>
                        </TableCell>
                        <TableCell>{outcomeBadge(o.outcome)}</TableCell>
                        <TableCell className="text-right">
                          {returnCell(o.actualReturn)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {displayedOverrides.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                          Nuk ka override të fundit
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Section 6: Add Override Form (Collapsible) */}
        <section>
          <Collapsible open={formOpen} onOpenChange={setFormOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/50 transition-colors rounded-t-xl focus:outline-none"
                >
                  <span className="flex items-center gap-2 font-semibold text-sm">
                    <Plus className="size-4" />
                    Shto Override
                  </span>
                  {formOpen ? (
                    <ChevronUp className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="border-t border-border pt-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Symbol */}
                    <div className="space-y-2">
                      <Label htmlFor="form-symbol">Simboli *</Label>
                      <Input
                        id="form-symbol"
                        placeholder="p.sh. NVDA"
                        value={formSymbol}
                        onChange={(e) => setFormSymbol(e.target.value)}
                        className="uppercase"
                      />
                    </div>

                    {/* Original Decision */}
                    <div className="space-y-2">
                      <Label>Vendimi Origjinal *</Label>
                      <Select value={formOriginal} onValueChange={setFormOriginal}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Zgjidh..." />
                        </SelectTrigger>
                        <SelectContent>
                          {ORIGINAL_DECISIONS.map((d) => (
                            <SelectItem key={d} value={d}>
                              {d}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Override Decision */}
                    <div className="space-y-2">
                      <Label>Override *</Label>
                      <Select value={formOverride} onValueChange={setFormOverride}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Zgjidh..." />
                        </SelectTrigger>
                        <SelectContent>
                          {OVERRIDE_DECISIONS.map((d) => (
                            <SelectItem key={d} value={d}>
                              {d}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Override Reason */}
                    <div className="space-y-2">
                      <Label>Arsyeja e Override *</Label>
                      <Select value={formReason} onValueChange={setFormReason}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Zgjidh..." />
                        </SelectTrigger>
                        <SelectContent>
                          {OVERRIDE_REASONS.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Model Score */}
                    <div className="space-y-2">
                      <Label htmlFor="form-score">Model Score</Label>
                      <Input
                        id="form-score"
                        type="number"
                        step="0.1"
                        placeholder="p.sh. 72.5"
                        value={formScore}
                        onChange={(e) => setFormScore(e.target.value)}
                      />
                    </div>

                    {/* Model Confidence */}
                    <div className="space-y-2">
                      <Label htmlFor="form-confidence">Model Confidence</Label>
                      <Input
                        id="form-confidence"
                        type="number"
                        step="0.1"
                        placeholder="p.sh. 68.0"
                        value={formConfidence}
                        onChange={(e) => setFormConfidence(e.target.value)}
                      />
                    </div>

                    {/* Regime */}
                    <div className="space-y-2">
                      <Label htmlFor="form-regime">Regjimi</Label>
                      <Input
                        id="form-regime"
                        placeholder="p.sh. BULL_LOW_VOL"
                        value={formRegime}
                        onChange={(e) => setFormRegime(e.target.value)}
                      />
                    </div>

                    {/* Notes (full width) */}
                    <div className="space-y-2 sm:col-span-2 lg:col-span-2">
                      <Label htmlFor="form-notes">Shënime</Label>
                      <Textarea
                        id="form-notes"
                        placeholder="Shënime shtesë..."
                        value={formNotes}
                        onChange={(e) => setFormNotes(e.target.value)}
                        rows={3}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end mt-6">
                    <Button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="gap-2"
                    >
                      {submitting ? (
                        <RefreshCw className="size-4 animate-spin" />
                      ) : (
                        <Plus className="size-4" />
                      )}
                      {submitting ? 'Duke ruajtur...' : 'Ruaj Override'}
                    </Button>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </section>
      </div>
    </main>
  );
}
