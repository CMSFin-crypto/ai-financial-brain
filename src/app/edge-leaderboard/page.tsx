"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import {
  Trophy,
  AlertTriangle,
  Shield,
  TrendingUp,
  TrendingDown,
  Target,
  Filter,
  Award,
  ArrowUp,
  ArrowDown,
  Minus,
  BarChart3,
  RefreshCw,
  Zap,
  Eye,
  Ban,
} from "lucide-react";

// ---------- Types ----------

interface RankedItem {
  name: string;
  sampleSize: number;
  accuracy: number;
  avgReturn: number;
  avgBenchmarkReturn: number;
  alpha: number;
  noTradeRate: number;
  buyRate: number;
  sellRate: number;
  avgConfidence: number;
  sharpeLike: number;
  edge: string;
  recommendedAction: string;
}

interface TradeFilter {
  dimension: string;
  name: string;
  action: string;
  reason: string;
  accuracyThreshold: number;
  actualAccuracy: number;
  sampleSize: number;
}

interface HorizonEntry {
  horizonDays: number;
  sampleSize: number;
  accuracy: number;
  avgReturn: number;
  alpha: number;
}

interface EdgeLeaderboardData {
  computedAt: string;
  sectors: {
    ranked: RankedItem[];
    best: string;
    worst: string;
    filter: string;
  };
  regimes: {
    ranked: RankedItem[];
    best: string;
    worst: string;
    filter: string;
  };
  horizonBreakdown: HorizonEntry[];
  tradeFilters: TradeFilter[];
}

// ---------- Helpers ----------

const ACTION_ORDER: Record<string, number> = {
  AVOID: 0,
  REDUCE_SIZE: 1,
  NORMAL: 2,
  PREFER: 3,
};

function getEdgeColor(edge: string): string {
  switch (edge) {
    case "strong":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "moderate":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "weak":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "negative":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "insufficient":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function getEdgeLabel(edge: string): string {
  switch (edge) {
    case "strong":
      return "I fortë";
    case "moderate":
      return "I moderuar";
    case "weak":
      return "I dobët";
    case "negative":
      return "Negativ";
    case "insufficient":
      return "I pamjaftueshëm";
    default:
      return edge;
  }
}

function getActionColor(action: string): string {
  switch (action) {
    case "AVOID":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "REDUCE_SIZE":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "PREFER":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "NORMAL":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function getActionIcon(action: string) {
  switch (action) {
    case "AVOID":
      return <Ban className="h-3.5 w-3.5" />;
    case "REDUCE_SIZE":
      return <TrendingDown className="h-3.5 w-3.5" />;
    case "PREFER":
      return <TrendingUp className="h-3.5 w-3.5" />;
    case "NORMAL":
      return <Minus className="h-3.5 w-3.5" />;
    default:
      return <Minus className="h-3.5 w-3.5" />;
  }
}

function getActionLabel(action: string): string {
  switch (action) {
    case "AVOID":
      return "SHMANG";
    case "REDUCE_SIZE":
      return "ZVOGËLO";
    case "PREFER":
      return "PËRFAVORO";
    case "NORMAL":
      return "NORMAL";
    default:
      return action;
  }
}

function getBarColor(action: string): string {
  switch (action) {
    case "AVOID":
      return "#ef4444";
    case "REDUCE_SIZE":
      return "#f59e0b";
    case "PREFER":
      return "#10b981";
    default:
      return "#6b7280";
  }
}

function getDimensionLabel(dim: string): string {
  switch (dim) {
    case "sector":
      return "Sektor";
    case "regime":
      return "Regjim";
    default:
      return dim;
  }
}

function getHorizonLabel(days: number): string {
  return `${days}D`;
}

function formatPct(v: number, decimals = 1): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}%`;
}

// ---------- Sub-components ----------

function SummaryCard({
  title,
  value,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: "emerald" | "red";
}) {
  const accentClasses =
    accent === "emerald"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : "border-red-500/30 bg-red-500/5";
  const iconColor =
    accent === "emerald" ? "text-emerald-400" : "text-red-400";
  const valueColor =
    accent === "emerald" ? "text-emerald-300" : "text-red-300";

  return (
    <Card className={accentClasses}>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2 text-sm">
          <Icon className={`h-4 w-4 ${iconColor}`} />
          {title}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className={`text-xl font-bold tracking-tight ${valueColor}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function SummaryCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-28" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-7 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function HorizonCard({ entry }: { entry: HorizonEntry }) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-2xl font-bold text-foreground">
          {getHorizonLabel(entry.horizonDays)}
        </CardTitle>
        <CardDescription>
          {entry.sampleSize} njësi analize
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Preciziteti</p>
          <p
            className={`text-lg font-semibold ${
              entry.accuracy >= 55
                ? "text-emerald-400"
                : entry.accuracy >= 48
                  ? "text-amber-400"
                  : "text-red-400"
            }`}
          >
            {entry.accuracy.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Avg Return</p>
          <p
            className={`text-lg font-semibold ${
              entry.avgReturn >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {formatPct(entry.avgReturn)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Alpha</p>
          <p
            className={`text-lg font-semibold ${
              entry.alpha >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {formatPct(entry.alpha)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function HorizonSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-24" />
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3">
            <Skeleton className="h-6 w-12" />
            <Skeleton className="h-6 w-12" />
            <Skeleton className="h-6 w-12" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function LeaderboardTable({
  data,
  nameKey,
}: {
  data: RankedItem[];
  nameKey: "Sektori" | "Regjimi";
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-border">
            <TableHead className="w-10 text-center">#</TableHead>
            <TableHead>{nameKey}</TableHead>
            <TableHead className="text-right">Njësitë</TableHead>
            <TableHead className="text-right">Preciziteti</TableHead>
            <TableHead className="text-right">Avg Return</TableHead>
            <TableHead className="text-right">Alpha</TableHead>
            <TableHead className="text-right">Sharpe</TableHead>
            <TableHead className="text-right">No-Trade %</TableHead>
            <TableHead className="text-right">Avg Confidence</TableHead>
            <TableHead className="text-center">Edge</TableHead>
            <TableHead className="min-w-[180px]">Rekomandimi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item, idx) => (
            <TableRow key={item.name} className="border-border">
              <TableCell className="text-center font-medium text-muted-foreground">
                {idx + 1}
              </TableCell>
              <TableCell className="font-semibold text-foreground">
                {item.name}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {item.sampleSize}
              </TableCell>
              <TableCell
                className={`text-right tabular-nums font-medium ${
                  item.accuracy >= 60
                    ? "text-emerald-400"
                    : item.accuracy >= 50
                      ? "text-amber-400"
                      : "text-red-400"
                }`}
              >
                {item.accuracy.toFixed(1)}%
              </TableCell>
              <TableCell
                className={`text-right tabular-nums ${
                  item.avgReturn >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {formatPct(item.avgReturn)}
              </TableCell>
              <TableCell
                className={`text-right tabular-nums font-medium ${
                  item.alpha > 0
                    ? "text-emerald-400"
                    : item.alpha < 0
                      ? "text-red-400"
                      : "text-muted-foreground"
                }`}
              >
                {formatPct(item.alpha)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-foreground">
                {item.sharpeLike.toFixed(2)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {item.noTradeRate.toFixed(1)}%
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {item.avgConfidence.toFixed(1)}%
              </TableCell>
              <TableCell className="text-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className={`cursor-default ${getEdgeColor(item.edge)}`}
                    >
                      {getEdgeLabel(item.edge)}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs">{item.recommendedAction}</p>
                  </TooltipContent>
                </Tooltip>
              </TableCell>
              <TableCell>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {item.recommendedAction}
                </p>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-border">
            <TableHead className="w-10 text-center">#</TableHead>
            <TableHead>Sektori</TableHead>
            <TableHead className="text-right">Njësitë</TableHead>
            <TableHead className="text-right">Preciziteti</TableHead>
            <TableHead className="text-right">Avg Return</TableHead>
            <TableHead className="text-right">Alpha</TableHead>
            <TableHead className="text-right">Sharpe</TableHead>
            <TableHead className="text-right">No-Trade %</TableHead>
            <TableHead className="text-right">Avg Confidence</TableHead>
            <TableHead className="text-center">Edge</TableHead>
            <TableHead>Rekomandimi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i} className="border-border">
              {Array.from({ length: 11 }).map((_, j) => (
                <TableCell key={j}>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------- Main Component ----------

export default function EdgeLeaderboardPage() {
  const [data, setData] = useState<EdgeLeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/edge-leaderboard");
      if (!res.ok) {
        throw new Error(`Gabim: ${res.status} ${res.statusText}`);
      }
      const json = await res.json();
      if (json.ok && json.data) {
        setData(json.data);
      } else {
        throw new Error(json.error || "Të dhëna të pavlefshme");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gabim i panjohur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sortedFilters = data?.tradeFilters
    ? [...data.tradeFilters].sort(
        (a, b) =>
          (ACTION_ORDER[a.action] ?? 99) - (ACTION_ORDER[b.action] ?? 99)
      )
    : [];

  const chartData = sortedFilters.map((f) => ({
    name: f.name,
    accuracy: f.actualAccuracy,
    action: f.action,
    fill: getBarColor(f.action),
  }));

  // ---------- Loading State ----------
  if (loading && !data) {
    return (
      <main className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Header skeleton */}
          <div className="flex items-center justify-between">
            <div>
              <Skeleton className="h-8 w-72" />
              <Skeleton className="mt-2 h-4 w-96" />
            </div>
            <Skeleton className="h-10 w-10 rounded-md" />
          </div>
          <SummaryCardsSkeleton />
          <Skeleton className="h-64 w-full rounded-xl" />
          <HorizonSkeleton />
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      </main>
    );
  }

  // ---------- Error State ----------
  if (error && !data) {
    return (
      <main className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl">
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="flex flex-col items-center gap-4 py-12">
              <AlertTriangle className="h-12 w-12 text-red-400" />
              <p className="text-lg font-medium text-red-300">{error}</p>
              <Button variant="outline" onClick={fetchData}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Provo përsëri
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (!data) return null;

  // ---------- Render ----------
  return (
    <main className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              <BarChart3 className="h-7 w-7 text-emerald-400" />
              Tabela e Avantazhit: Sektorë & Regjime
            </h1>
            {data.computedAt && (
              <p className="mt-1 text-sm text-muted-foreground">
                Përditësuar më{" "}
                {new Date(data.computedAt).toLocaleString("sq-AL", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="w-fit"
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Rifresko
          </Button>
        </div>

        {/* ---------- Section 1: Summary Cards ---------- */}
        <section aria-label="Përmbledhje">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              title="Sektori Më i Mirë"
              value={data.sectors.best}
              icon={Trophy}
              accent="emerald"
            />
            <SummaryCard
              title="Sektori Më i Keq"
              value={data.sectors.worst}
              icon={AlertTriangle}
              accent="red"
            />
            <SummaryCard
              title="Regjimi Më i Mirë"
              value={data.regimes.best}
              icon={Award}
              accent="emerald"
            />
            <SummaryCard
              title="Regjimi Më i Keq"
              value={data.regimes.worst}
              icon={Shield}
              accent="red"
            />
          </div>
        </section>

        {/* ---------- Section 2: Trade Filters ---------- */}
        <section aria-label="Filtra të rekomanduara">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-amber-400" />
                <CardTitle className="text-lg">
                  Filtra të Rekomanduara të Tregtimit
                </CardTitle>
              </div>
              <CardDescription>
                Veprime të renditura sipas përparësisë — filtrat më kritikë shfaqen
                të parët
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sortedFilters.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
                  <Eye className="h-10 w-10" />
                  <p className="text-sm">
                    Nuk ka të dhëna të mjaftueshme për të gjeneruar filtra
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Bar Chart */}
                  {chartData.length > 0 && (
                    <div className="h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={chartData}
                          margin={{
                            top: 8,
                            right: 8,
                            left: -10,
                            bottom: 0,
                          }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="hsl(var(--border))"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="name"
                            tick={{
                              fill: "hsl(var(--muted-foreground))",
                              fontSize: 10,
                            }}
                            axisLine={{
                              stroke: "hsl(var(--border))",
                            }}
                            tickLine={false}
                            interval={0}
                            angle={-20}
                            textAnchor="end"
                            height={50}
                          />
                          <YAxis
                            tick={{
                              fill: "hsl(var(--muted-foreground))",
                              fontSize: 11,
                            }}
                            axisLine={false}
                            tickLine={false}
                            domain={[0, 100]}
                            tickFormatter={(v: number) => `${v}%`}
                          />
                          <RechartsTooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                              fontSize: "12px",
                              color: "hsl(var(--foreground))",
                            }}
                            formatter={(value: number) => [
                              `${value.toFixed(1)}%`,
                              "Preciziteti",
                            ]}
                          />
                          <Bar dataKey="accuracy" radius={[4, 4, 0, 0]}>
                            {chartData.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={entry.fill}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Filter List */}
                  <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                    {sortedFilters.map((filter, idx) => (
                      <div
                        key={`${filter.dimension}-${filter.name}-${idx}`}
                        className="flex flex-col gap-2 rounded-lg border border-border bg-background/50 p-3 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:gap-3"
                      >
                        {/* Action Badge */}
                        <Badge
                          variant="outline"
                          className={`w-fit shrink-0 ${getActionColor(filter.action)}`}
                        >
                          {getActionIcon(filter.action)}
                          {getActionLabel(filter.action)}
                        </Badge>

                        {/* Dimension Badge */}
                        <Badge
                          variant="outline"
                          className="w-fit shrink-0 bg-secondary/50 text-secondary-foreground border-border"
                        >
                          {getDimensionLabel(filter.dimension)}
                        </Badge>

                        {/* Name */}
                        <span className="shrink-0 font-semibold text-foreground">
                          {filter.name}
                        </span>

                        {/* Reason */}
                        <span className="flex-1 text-xs text-muted-foreground leading-relaxed">
                          {filter.reason}
                        </span>

                        {/* Sample Size */}
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          <Target className="mr-1 inline h-3 w-3" />
                          {filter.sampleSize} njësi
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* ---------- Section 3: Horizon Breakdown ---------- */}
        <section aria-label="Shpërbërja sipas horizontit">
          <div>
            <div className="mb-4 flex items-center gap-2">
              <Zap className="h-5 w-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-foreground">
                Shpërbërja sipas Horizontit
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {data.horizonBreakdown.map((entry) => (
                <HorizonCard key={entry.horizonDays} entry={entry} />
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Section 4: Sector Leaderboard ---------- */}
        <section aria-label="Tabela e sektorëve">
          <div>
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-400" />
              <h2 className="text-lg font-semibold text-foreground">
                Tabela e Sektorëve
              </h2>
            </div>
            <LeaderboardTable
              data={data.sectors.ranked}
              nameKey="Sektori"
            />
          </div>
        </section>

        {/* ---------- Section 5: Regime Leaderboard ---------- */}
        <section aria-label="Tabela e regjimeve">
          <div>
            <div className="mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-foreground">
                Tabela e Regjimeve
              </h2>
            </div>
            <LeaderboardTable
              data={data.regimes.ranked}
              nameKey="Regjimi"
            />
          </div>
        </section>

        {/* ---------- Section 6: Filter Summary ---------- */}
        <section aria-label="Përmbledhja e filtrit">
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
                <CardTitle className="text-lg">
                  Rekomandimi Kryesor
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-foreground/90">
                <span className="font-semibold text-emerald-300">
                  Rekomandimi:
                </span>{" "}
                {data.sectors.filter}
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
