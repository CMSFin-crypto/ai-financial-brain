"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
  CardAction,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts"
import {
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Shield,
  Clock,
  RefreshCw,
  BarChart3,
  Gauge,
  AlertCircle,
  CheckCircle2,
  Info,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

// ─── Types ───────────────────────────────────────────────────────────────────

interface OverallStats {
  totalEvaluated: number
  totalPending: number
  overallAccuracy: number
  streakCorrect: number
  streakWrong: number
}

interface HorizonData {
  horizonDays: number
  accuracy: number
  sampleSize: number
  accuracy7d: number
  accuracy30d: number
  driftVsBaseline: number
  trend: string
}

interface CalibrationData {
  brierScore: number
  ece: number
  mce: number
  sampleSize: number
  diagnosis: string
  brierTrend7d: string
  eceTrend7d: string
}

interface NoTradeData {
  currentRate: number
  rate7d: number
  rate30d: number
  trend: string
  interpretation: string
}

interface RegimeSlice {
  name: string
  accuracy: number
  sampleSize: number
  accuracy7d: number
  driftVsOverall: number
  warning: string | null
}

interface SectorSlice {
  name: string
  accuracy: number
  sampleSize: number
  accuracy7d: number
  driftVsOverall: number
  warning: string | null
}

interface Warning {
  level: string
  category: string
  message: string
  detail: string
}

interface CalibrationTimeSeriesPoint {
  date: string
  brierScore: number
  ece: number
  sampleSize: number
}

interface DriftHistoryPoint {
  date: string
  accuracy1d: number
  accuracy5d: number
  accuracy20d: number
  brierScore: number
  ece: number
  noTradeRate: number
  warnings: Warning[]
}

interface DriftData {
  computedAt: string
  overall: OverallStats
  horizons: HorizonData[]
  calibration: CalibrationData
  noTrade: NoTradeData
  regimeSlices: RegimeSlice[]
  sectorSlices: SectorSlice[]
  warnings: Warning[]
  calibrationTimeSeries: CalibrationTimeSeriesPoint[]
}

interface ApiResponse {
  ok: boolean
  recorded: boolean
  data: DriftData
  history: DriftHistoryPoint[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPct(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "—"
  return v.toFixed(decimals) + "%"
}

function formatNum(v: number | null | undefined): string {
  if (v == null) return "—"
  return v.toLocaleString("sq-AL")
}

function trendIcon(trend: string) {
  switch (trend) {
    case "improving":
      return <TrendingUp className="size-4 text-emerald-500" />
    case "degrading":
      return <TrendingDown className="size-4 text-red-500" />
    default:
      return <Activity className="size-4 text-muted-foreground" />
  }
}

function trendBadge(trend: string) {
  const map: Record<string, { label: string; cls: string }> = {
    improving: {
      label: "Duke përmirësuar",
      cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    },
    stable: {
      label: "Stabil",
      cls: "bg-muted/50 text-muted-foreground border-border",
    },
    degrading: {
      label: "Duke u dobësuar",
      cls: "bg-red-500/15 text-red-400 border-red-500/30",
    },
  }
  const { label, cls } = map[trend] ?? map.stable
  return (
    <Badge variant="outline" className={cls}>
      {trendIcon(trend)}
      <span className="ml-1">{label}</span>
    </Badge>
  )
}

function driftValue(v: number) {
  const color = v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-muted-foreground"
  const sign = v > 0 ? "+" : ""
  return (
    <span className={color}>
      {sign}
      {formatPct(v)}
    </span>
  )
}

function warningLevelIcon(level: string) {
  switch (level) {
    case "CRITICAL":
      return <AlertCircle className="size-4 text-red-500" />
    case "WARNING":
      return <AlertTriangle className="size-4 text-amber-500" />
    default:
      return <Info className="size-4 text-blue-500" />
  }
}

function warningLevelColor(level: string) {
  switch (level) {
    case "CRITICAL":
      return "border-red-500/40 bg-red-500/10"
    case "WARNING":
      return "border-amber-500/40 bg-amber-500/10"
    default:
      return "border-blue-500/40 bg-blue-500/10"
  }
}

// ─── Loading Skeleton ────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Summary Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="gap-4">
            <CardHeader>
              <Skeleton className="h-4 w-36" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-24 mb-2" />
              <Skeleton className="h-4 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Warnings Skeleton */}
      <Skeleton className="h-24 w-full rounded-xl" />
      {/* Horizon Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="gap-4">
            <CardHeader>
              <Skeleton className="h-4 w-16" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-10 w-20" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Calibration Skeleton */}
      <Skeleton className="h-64 w-full rounded-xl" />
      {/* No-Trade Skeleton */}
      <Skeleton className="h-32 w-full rounded-xl" />
      {/* Tables Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
      {/* History Chart Skeleton */}
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  )
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}

function ChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-xl">
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span
            className="inline-block size-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium text-foreground">
            {typeof entry.value === "number" ? entry.value.toFixed(4) : entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

interface AccuracyTooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}

function AccuracyTooltip({ active, payload, label }: AccuracyTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-xl">
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span
            className="inline-block size-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium text-foreground">
            {typeof entry.value === "number" ? formatPct(entry.value) : entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export default function DriftReviewPage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/drift-review?record=true&history=30")
      if (!res.ok) throw new Error(`Gabim: ${res.status} ${res.statusText}`)
      const json: ApiResponse = await res.json()
      if (!json.ok) throw new Error("Përgjigja nuk ishte e suksesshme")
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gabim i panjohur")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const d = data?.data
  const history = data?.history ?? []

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        {/* ── Header ── */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <Activity className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                Rishikimi i Parashikimeve &amp; Monitorimi i Drift
              </h1>
              <p className="text-sm text-muted-foreground">
                {loading
                  ? "Duke ngarkuar..."
                  : d
                    ? `Përditësuar më ${new Date(d.computedAt).toLocaleString("sq-AL", { dateStyle: "medium", timeStyle: "short" })}`
                    : ""}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="w-fit"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            <span className="ml-2">Rifresko</span>
          </Button>
        </div>

        {/* ── Error State ── */}
        {error && !loading && (
          <Card className="border-red-500/50 bg-red-500/10 gap-4">
            <CardContent className="flex items-center gap-3">
              <AlertCircle className="size-5 text-red-500 shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* ── Loading ── */}
        {loading && !data && <DashboardSkeleton />}

        {/* ── Dashboard Content ── */}
        {!loading && d && (
          <div className="space-y-6">
            {/* ═══ Summary Cards ═══ */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1 — Total Prediktime */}
              <Card className="gap-4">
                <CardHeader className="pb-0">
                  <CardDescription className="flex items-center gap-2">
                    <BarChart3 className="size-4 text-primary" />
                    Prediktime të Vlerësuara
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold">
                      {formatNum(d.overall.totalEvaluated)}
                    </span>
                    {d.overall.totalPending > 0 && (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30">
                        <Clock className="size-3" />
                        <span className="ml-1">{d.overall.totalPending} në pritje</span>
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 2 — Overall Accuracy */}
              <Card className="gap-4">
                <CardHeader className="pb-0">
                  <CardDescription className="flex items-center gap-2">
                    <Gauge className="size-4 text-primary" />
                    Preciziteti i Përgjithshëm
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-3">
                    <span className="text-3xl font-bold">
                      {formatPct(d.overall.overallAccuracy)}
                    </span>
                    {d.overall.streakCorrect > 0 && (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle2 className="size-3" />
                        {d.overall.streakCorrect} i saktë
                      </span>
                    )}
                    {d.overall.streakWrong > 0 && (
                      <span className="flex items-center gap-1 text-xs text-red-400">
                        <AlertCircle className="size-3" />
                        {d.overall.streakWrong} i gabuar
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 3 — Brier Score */}
              <Card className="gap-4">
                <CardHeader className="pb-0">
                  <CardDescription className="flex items-center gap-2">
                    <Shield className="size-4 text-primary" />
                    Brier Score
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-3">
                    <span className="text-3xl font-bold">
                      {d.calibration.brierScore.toFixed(4)}
                    </span>
                    {trendIcon(d.calibration.brierTrend7d)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    ECE: {d.calibration.ece.toFixed(4)} · MCE: {d.calibration.mce.toFixed(4)}
                  </p>
                </CardContent>
              </Card>

              {/* 4 — No-Trade Rate */}
              <Card className="gap-4">
                <CardHeader className="pb-0">
                  <CardDescription className="flex items-center gap-2">
                    <Clock className="size-4 text-primary" />
                    Shkalla No-Trade
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-3">
                    <span className="text-3xl font-bold">
                      {formatPct(d.noTrade.currentRate)}
                    </span>
                    {trendIcon(d.noTrade.trend)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    7d: {formatPct(d.noTrade.rate7d)} · 30d: {formatPct(d.noTrade.rate30d)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* ═══ Warnings Panel ═══ */}
            {d.warnings.length > 0 && (
              <Card className="gap-4">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="size-4 text-amber-500" />
                    Sinjalizime
                    <Badge variant="secondary" className="ml-auto">
                      {d.warnings.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {d.warnings.map((w, i) => (
                    <div
                      key={i}
                      className={`rounded-lg border p-3 ${warningLevelColor(w.level)}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0">
                          {warningLevelIcon(w.level)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={
                                w.level === "CRITICAL"
                                  ? "border-red-500/40 text-red-400"
                                  : w.level === "WARNING"
                                    ? "border-amber-500/40 text-amber-400"
                                    : "border-blue-500/40 text-blue-400"
                              }
                            >
                              {w.level}
                            </Badge>
                            <Badge variant="outline" className="text-muted-foreground">
                              {w.category}
                            </Badge>
                            <span className="text-sm font-medium text-foreground">
                              {w.message}
                            </span>
                          </div>
                          {w.detail && (
                            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                              {w.detail}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* ═══ Horizon Accuracy Cards ═══ */}
            <section>
              <h2 className="mb-4 text-lg font-semibold flex items-center gap-2">
                <Activity className="size-5 text-primary" />
                Preciziteti sipas Horizontit
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {d.horizons.map((h) => {
                  const horizonLabel =
                    h.horizonDays === 1
                      ? "1D"
                      : h.horizonDays === 5
                        ? "5D"
                        : h.horizonDays === 20
                          ? "20D"
                          : `${h.horizonDays}D`
                  return (
                    <Card key={h.horizonDays} className="gap-4">
                      <CardHeader>
                        <CardTitle className="text-base">Horizonti {horizonLabel}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* Big accuracy number */}
                        <div className="flex items-baseline gap-2">
                          <span className="text-4xl font-bold tabular-nums">
                            {formatPct(h.accuracy, 1)}
                          </span>
                          {trendBadge(h.trend)}
                        </div>

                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Mostër</span>
                            <span className="font-medium">{formatNum(h.sampleSize)}</span>
                          </div>
                          <Separator className="bg-border" />
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">7 ditë (rolling)</span>
                            <span className="font-medium">{formatPct(h.accuracy7d)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">30 ditë (rolling)</span>
                            <span className="font-medium">{formatPct(h.accuracy30d)}</span>
                          </div>
                          <Separator className="bg-border" />
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Drift vs Bazal</span>
                            {driftValue(h.driftVsBaseline)}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </section>

            {/* ═══ Calibration Section ═══ */}
            <section>
              <h2 className="mb-4 text-lg font-semibold flex items-center gap-2">
                <Shield className="size-5 text-primary" />
                Kalibrimi
              </h2>
              <div className="space-y-4">
                {/* Metric cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Card className="gap-3">
                    <CardHeader>
                      <CardDescription>Brier Score</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold tabular-nums">
                          {d.calibration.brierScore.toFixed(4)}
                        </span>
                        {trendIcon(d.calibration.brierTrend7d)}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sa më i ulët, aq më mirë (0 = perfekt)
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="gap-3">
                    <CardHeader>
                      <CardDescription>ECE (Kalibrimi i Pritet)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold tabular-nums">
                          {d.calibration.ece.toFixed(4)}
                        </span>
                        {trendIcon(d.calibration.eceTrend7d)}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Gabimi mesatar i kalibrimit
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="gap-3">
                    <CardHeader>
                      <CardDescription>MCE (Kalibrimi Maksimal)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold tabular-nums">
                          {d.calibration.mce.toFixed(4)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Gabimi maksimal i kalibrimit
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Diagnosis */}
                <Card className="gap-4">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Info className="size-4 text-blue-400" />
                      Diagnoza e Kalibrimitt
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {d.calibration.diagnosis}
                    </p>
                  </CardContent>
                </Card>

                {/* Calibration Time Series Chart */}
                {d.calibrationTimeSeries.length > 0 && (
                  <Card className="gap-4">
                    <CardHeader>
                      <CardTitle className="text-base">
                        Seria Kohore e Kalibrimitt
                      </CardTitle>
                      <CardDescription>
                        Brier Score &amp; ECE gjatë kohës
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={d.calibrationTimeSeries}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis
                              dataKey="date"
                              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                              tickLine={false}
                              axisLine={{ stroke: "hsl(var(--border))" }}
                            />
                            <YAxis
                              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                              tickLine={false}
                              axisLine={{ stroke: "hsl(var(--border))" }}
                              domain={["auto", "auto"]}
                            />
                            <Tooltip content={<ChartTooltip />} />
                            <Legend
                              wrapperStyle={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}
                            />
                            <Line
                              type="monotone"
                              dataKey="brierScore"
                              name="Brier Score"
                              stroke="#10b981"
                              strokeWidth={2}
                              dot={{ r: 3 }}
                              activeDot={{ r: 5 }}
                            />
                            <Line
                              type="monotone"
                              dataKey="ece"
                              name="ECE"
                              stroke="#f59e0b"
                              strokeWidth={2}
                              dot={{ r: 3 }}
                              activeDot={{ r: 5 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </section>

            {/* ═══ No-Trade Rate Section ═══ */}
            <section>
              <h2 className="mb-4 text-lg font-semibold flex items-center gap-2">
                <Clock className="size-5 text-primary" />
                Shkalla No-Trade
              </h2>
              <Card className="gap-4">
                <CardHeader>
                  <CardDescription className="flex items-center gap-2">
                    Përqindja e rasteve pa rekomandim tregtimi
                  </CardDescription>
                  <CardAction>
                    {trendBadge(d.noTrade.trend)}
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">Aktuale</p>
                      <p className="text-2xl font-bold tabular-nums">
                        {formatPct(d.noTrade.currentRate)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">7 Ditë</p>
                      <p className="text-2xl font-bold tabular-nums">
                        {formatPct(d.noTrade.rate7d)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">30 Ditë</p>
                      <p className="text-2xl font-bold tabular-nums">
                        {formatPct(d.noTrade.rate30d)}
                      </p>
                    </div>
                  </div>
                  <Separator className="my-4 bg-border" />
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {d.noTrade.interpretation}
                  </p>
                </CardContent>
              </Card>
            </section>

            {/* ═══ Regime & Sector Tables ═══ */}
            <section>
              <h2 className="mb-4 text-lg font-semibold flex items-center gap-2">
                <BarChart3 className="size-5 text-primary" />
                Preciziteti sipas Regjimit &amp; Sektorit
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Regime Table */}
                <Card className="gap-4">
                  <CardHeader>
                    <CardTitle className="text-base">Regjimi</CardTitle>
                    <CardDescription>
                      {d.regimeSlices.length} regjime
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Emri</TableHead>
                          <TableHead className="text-right">Preciziteti</TableHead>
                          <TableHead className="text-right">Mostër</TableHead>
                          <TableHead className="text-right">7d</TableHead>
                          <TableHead className="text-right">Drift</TableHead>
                          <TableHead className="text-center">Sinjalizim</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...d.regimeSlices]
                          .sort((a, b) => b.accuracy - a.accuracy)
                          .map((r) => (
                            <TableRow key={r.name}>
                              <TableCell className="font-medium">
                                <Badge variant="outline" className="font-mono text-xs">
                                  {r.name}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatPct(r.accuracy)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {formatNum(r.sampleSize)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatPct(r.accuracy7d)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {driftValue(r.driftVsOverall)}
                              </TableCell>
                              <TableCell className="text-center">
                                {r.warning ? (
                                  <Badge variant="outline" className="border-amber-500/40 text-amber-400">
                                    <AlertTriangle className="size-3" />
                                    <span className="ml-1">!</span>
                                  </Badge>
                                ) : (
                                  <CheckCircle2 className="size-4 text-emerald-500 mx-auto" />
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Sector Table */}
                <Card className="gap-4">
                  <CardHeader>
                    <CardTitle className="text-base">Sektori</CardTitle>
                    <CardDescription>
                      {d.sectorSlices.length} sektorë
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Emri</TableHead>
                          <TableHead className="text-right">Preciziteti</TableHead>
                          <TableHead className="text-right">Mostër</TableHead>
                          <TableHead className="text-right">7d</TableHead>
                          <TableHead className="text-right">Drift</TableHead>
                          <TableHead className="text-center">Sinjalizim</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...d.sectorSlices]
                          .sort((a, b) => b.accuracy - a.accuracy)
                          .map((s) => (
                            <TableRow key={s.name}>
                              <TableCell className="font-medium">
                                <Badge variant="outline" className="font-mono text-xs">
                                  {s.name}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatPct(s.accuracy)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {formatNum(s.sampleSize)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatPct(s.accuracy7d)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {driftValue(s.driftVsOverall)}
                              </TableCell>
                              <TableCell className="text-center">
                                {s.warning ? (
                                  <Badge variant="outline" className="border-amber-500/40 text-amber-400">
                                    <AlertTriangle className="size-3" />
                                    <span className="ml-1">!</span>
                                  </Badge>
                                ) : (
                                  <CheckCircle2 className="size-4 text-emerald-500 mx-auto" />
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* ═══ Drift History Chart ═══ */}
            {history.length > 0 && (
              <section>
                <h2 className="mb-4 text-lg font-semibold flex items-center gap-2">
                  <Activity className="size-5 text-primary" />
                  Historia e Drift — Preciziteti
                </h2>
                <Card className="gap-4">
                  <CardHeader>
                    <CardTitle className="text-base">
                      Preciziteti sipas Horizontit gjatë kohës
                    </CardTitle>
                    <CardDescription>
                      30 ditë të fundit — 1D, 5D, 20D
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={history}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                            tickLine={false}
                            axisLine={{ stroke: "hsl(var(--border))" }}
                            tickFormatter={(v: string) => {
                              const parts = v.split("-")
                              if (parts.length === 3) {
                                return `${parts[2]}/${parts[1]}`
                              }
                              return v
                            }}
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                            tickLine={false}
                            axisLine={{ stroke: "hsl(var(--border))" }}
                            domain={[0, 100]}
                            tickFormatter={(v: number) => `${v}%`}
                          />
                          <Tooltip content={<AccuracyTooltip />} />
                          <Legend
                            wrapperStyle={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}
                          />
                          <Line
                            type="monotone"
                            dataKey="accuracy1d"
                            name="1D"
                            stroke="#10b981"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="accuracy5d"
                            name="5D"
                            stroke="#f59e0b"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="accuracy20d"
                            name="20D"
                            stroke="#ef4444"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
