'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';
import {
  Target, TrendingUp, TrendingDown, Activity, Gauge, Shield,
  BarChart3, RefreshCw, AlertTriangle, CheckCircle2, Clock,
} from 'lucide-react';

// --- Types ---

type ModelMetrics = {
  sampleSize: number;
  accuracy: number | null;
  avgReturn: number | null;
  winRate: number | null;
  brierScore: number | null;
  brierByRegime: Record<string, { brierScore: number | null; sampleSize: number }>;
  brierByHorizon: Record<string, { brierScore: number | null; sampleSize: number }>;
  precisionBuy: number | null;
  recallBuy: number | null;
  noTradeRate: number | null;
  maxDrawdown: number | null;
};

type MetricSnapshot = {
  id: string;
  modelVersion: string;
  horizonDays: number;
  sampleSize: number;
  accuracy: number | null;
  avgReturn: number | null;
  winRate: number | null;
  brierScore: number | null;
  precisionBuy: number | null;
  recallBuy: number | null;
  noTradeRate: number | null;
  maxDrawdown: number | null;
  createdAt: string;
};

// --- Helpers ---

function pct(v: number | null, decimals = 1): string {
  if (v === null || v === undefined) return 'N/A';
  return `${(v * 100).toFixed(decimals)}%`;
}

function brierColor(v: number | null): string {
  if (v === null) return 'text-muted-foreground';
  if (v < 0.15) return 'text-emerald-500';
  if (v < 0.25) return 'text-amber-500';
  return 'text-red-500';
}

function brierLabel(v: number | null): string {
  if (v === null) return 'No data';
  if (v < 0.15) return 'Well calibrated';
  if (v < 0.25) return 'Slightly overconfident';
  return 'Poorly calibrated';
}

const REGIME_COLORS: Record<string, string> = {
  BULL_LOW_VOL: '#22c55e',
  BULL_HIGH_VOL: '#84cc16',
  BEAR_LOW_VOL: '#f97316',
  BEAR_HIGH_VOL: '#ef4444',
  PANIC_CAPITULATION: '#dc2626',
  RELIEF_RALLY: '#06b6d4',
  RANGE_NEUTRAL: '#8b5cf6',
  UNKNOWN: '#6b7280',
};

// --- Stat Card ---

function StatCard({ title, value, subtitle, icon: Icon, color = 'text-foreground' }: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  color?: string;
}) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">{title}</p>
            <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Main Page ---

export default function ModelMetricsDashboard() {
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [history, setHistory] = useState<MetricSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [snapshotting, setSnapshotting] = useState(false);
  const [horizonFilter, setHorizonFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (horizonFilter !== 'all') params.set('horizonDays', horizonFilter);
      params.set('modelVersion', 'predict-v3-regime-spillover');
      const [metricsRes, historyRes] = await Promise.all([
        fetch(`/api/model-metrics?${params}`),
        fetch(`/api/model-metrics?history=true&days=90&modelVersion=predict-v3-regime-spillover`),
      ]);
      const metricsData = await metricsRes.json();
      const historyData = await historyRes.json();
      setMetrics(metricsData);
      setHistory(historyData.snapshots || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  }, [horizonFilter]);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  const handleSnapshot = async () => {
    setSnapshotting(true);
    try {
      const res = await fetch('/api/model-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelVersion: 'predict-v3-regime-spillover', horizonDays: 1 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await fetchMetrics();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Snapshot failed');
    } finally {
      setSnapshotting(false);
    }
  };

  // Prepare chart data
  const brierByRegimeData = metrics?.brierByRegime
    ? Object.entries(metrics.brierByRegime).map(([regime, data]) => ({
        regime: regime.replace(/_/g, ' '),
        brierScore: data.brierScore ?? 0,
        sampleSize: data.sampleSize,
        fill: REGIME_COLORS[regime] || '#6b7280',
      })).sort((a, b) => a.brierScore - b.brierScore)
    : [];

  const brierByHorizonData = metrics?.brierByHorizon
    ? Object.entries(metrics.brierByHorizon).map(([h, data]) => ({
        horizon: `${h}D`,
        brierScore: data.brierScore ?? 0,
        sampleSize: data.sampleSize,
      }))
    : [];

  const historyChartData = history.map(s => ({
    date: new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    accuracy: s.accuracy ? +(s.accuracy * 100).toFixed(1) : null,
    brierScore: s.brierScore ? +(s.brierScore * 100).toFixed(2) : null,
    winRate: s.winRate ? +(s.winRate * 100).toFixed(1) : null,
    sampleSize: s.sampleSize,
  }));

  // Gate rate pie data
  const gateData = metrics ? [
    { name: 'Traded', value: Math.round((1 - (metrics.noTradeRate ?? 0)) * metrics.sampleSize), fill: '#22c55e' },
    { name: 'No Trade', value: Math.round((metrics.noTradeRate ?? 0) * metrics.sampleSize), fill: '#6b7280' },
  ].filter(d => d.value > 0) : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Model Calibration</h1>
            <p className="text-sm text-muted-foreground">
              Brier score, accuracy, and per-regime calibration metrics
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={horizonFilter} onValueChange={setHorizonFilter}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Horizon" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Horizons</SelectItem>
                <SelectItem value="1">1 Day</SelectItem>
                <SelectItem value="5">5 Days</SelectItem>
                <SelectItem value="20">20 Days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={fetchMetrics}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
            </Button>
            <Button size="sm" onClick={handleSnapshot} disabled={snapshotting}>
              {snapshotting ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Gauge className="h-3.5 w-3.5 mr-1.5" />}
              Snapshot
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-red-500/50 bg-red-500/5">
            <CardContent className="p-3 flex items-center gap-2 text-sm text-red-500">
              <AlertTriangle className="h-4 w-4" /> {error}
            </CardContent>
          </Card>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Sample Size"
            value={metrics?.sampleSize?.toLocaleString() ?? '0'}
            subtitle={metrics ? `${Math.round((metrics.noTradeRate ?? 0) * 100)}% filtered` : undefined}
            icon={BarChart3}
          />
          <StatCard
            title="Accuracy"
            value={pct(metrics?.accuracy ?? null)}
            subtitle={metrics && metrics.accuracy !== null ? `${metrics.sampleSize} predictions` : 'No data'}
            icon={metrics && metrics.accuracy !== null && metrics.accuracy >= 0.5 ? CheckCircle2 : Target}
            color={metrics && metrics.accuracy !== null && metrics.accuracy >= 0.55 ? 'text-emerald-500' : metrics && metrics.accuracy !== null && metrics.accuracy < 0.45 ? 'text-red-500' : ''}
          />
          <StatCard
            title="Brier Score"
            value={metrics?.brierScore != null ? metrics.brierScore.toFixed(4) : 'N/A'}
            subtitle={brierLabel(metrics?.brierScore ?? null)}
            icon={Gauge}
            color={brierColor(metrics?.brierScore ?? null)}
          />
          <StatCard
            title="Avg Return"
            value={metrics?.avgReturn != null ? `${metrics.avgReturn > 0 ? '+' : ''}${metrics.avgReturn.toFixed(2)}%` : 'N/A'}
            subtitle={metrics?.winRate != null ? `Win rate: ${pct(metrics.winRate)}` : undefined}
            icon={metrics && metrics.avgReturn != null && metrics.avgReturn > 0 ? TrendingUp : TrendingDown}
            color={metrics && metrics.avgReturn != null && metrics.avgReturn > 0 ? 'text-emerald-500' : metrics && metrics.avgReturn != null && metrics.avgReturn < 0 ? 'text-red-500' : ''}
          />
        </div>

        {/* Secondary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Precision (BUY)"
            value={pct(metrics?.precisionBuy ?? null)}
            subtitle="Of BUY signals, % correct"
            icon={Target}
          />
          <StatCard
            title="Recall (BUY)"
            value={pct(metrics?.recallBuy ?? null)}
            subtitle="Of all ups, % caught"
            icon={Activity}
          />
          <StatCard
            title="No-Trade Rate"
            value={pct(metrics?.noTradeRate ?? null)}
            subtitle="Regime-filtered predictions"
            icon={Shield}
          />
          <StatCard
            title="Max Drawdown"
            value={metrics?.maxDrawdown != null ? `-${metrics.maxDrawdown.toFixed(2)}%` : 'N/A'}
            subtitle="Cumulative peak-to-trough"
            icon={TrendingDown}
            color={metrics && metrics.maxDrawdown != null && metrics.maxDrawdown > 10 ? 'text-red-500' : ''}
          />
        </div>

        {/* Charts */}
        <Tabs defaultValue="brier-regime" className="space-y-4">
          <TabsList>
            <TabsTrigger value="brier-regime">Brier by Regime</TabsTrigger>
            <TabsTrigger value="brier-horizon">Brier by Horizon</TabsTrigger>
            <TabsTrigger value="timeline">Metrics Timeline</TabsTrigger>
            <TabsTrigger value="gates">Gate Analysis</TabsTrigger>
          </TabsList>

          {/* Brier by Regime */}
          <TabsContent value="brier-regime">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Brier Score by Market Regime</CardTitle>
                <CardDescription>Lower = better probability calibration. Target: below 0.15.</CardDescription>
              </CardHeader>
              <CardContent>
                {brierByRegimeData.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                    <Clock className="h-4 w-4 mr-2" /> No evaluated predictions yet
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={brierByRegimeData} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="regime" width={140} tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                        formatter={(value: number) => [value?.toFixed(4), 'Brier Score']}
                      />
                      <Bar dataKey="brierScore" radius={[0, 4, 4, 0]}>
                        {brierByRegimeData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.fill} opacity={0.85} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Brier by Horizon */}
          <TabsContent value="brier-horizon">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Brier Score by Prediction Horizon</CardTitle>
                <CardDescription>Compare calibration quality across 1D, 5D, 20D horizons.</CardDescription>
              </CardHeader>
              <CardContent>
                {brierByHorizonData.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                    <Clock className="h-4 w-4 mr-2" /> No evaluated predictions yet
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={brierByHorizonData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="horizon" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 'auto']} tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                        formatter={(value: number) => [value?.toFixed(4), 'Brier Score']}
                      />
                      <Bar dataKey="brierScore" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Timeline */}
          <TabsContent value="timeline">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Metrics Over Time</CardTitle>
                <CardDescription>Accuracy and Brier score evolution across snapshots.</CardDescription>
              </CardHeader>
              <CardContent>
                {historyChartData.length < 2 ? (
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                    <Clock className="h-4 w-4 mr-2" /> Need at least 2 snapshots to show timeline
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={historyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" domain={[0, 'auto']} tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                      />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="accuracy" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Accuracy %" />
                      <Line yAxisId="left" type="monotone" dataKey="winRate" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3 }} name="Win Rate %" />
                      <Line yAxisId="right" type="monotone" dataKey="brierScore" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} name="Brier Score" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Gate Analysis */}
          <TabsContent value="gates">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Trade vs No-Trade</CardTitle>
                  <CardDescription>How often the regime gate filters predictions.</CardDescription>
                </CardHeader>
                <CardContent>
                  {gateData.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                      <Clock className="h-4 w-4 mr-2" /> No data
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie data={gateData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                          {gateData.map((entry, idx) => (
                            <Cell key={idx} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Regime Distribution</CardTitle>
                  <CardDescription>Sample sizes per regime state.</CardDescription>
                </CardHeader>
                <CardContent>
                  {brierByRegimeData.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                      <Clock className="h-4 w-4 mr-2" /> No data
                    </div>
                  ) : (
                    <div className="space-y-2 mt-2">
                      {brierByRegimeData.map((d) => (
                        <div key={d.regime} className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.fill }} />
                          <span className="text-sm flex-1 truncate">{d.regime}</span>
                          <Badge variant="secondary" className="tabular-nums font-mono">{d.sampleSize}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Info Footer */}
        <Card className="bg-muted/30">
          <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
            <p><strong>Brier Score</strong> = mean((f - o)^2) where f = predicted probability, o = actual binary outcome. Lower is better. Perfect calibration = 0. Random guessing = 0.25.</p>
            <p><strong>Prediction Lifecycle</strong>: generate (predict route) {'->'} save (with regime + transition risk) {'->'} evaluate (cron at dueAt) {'->'} compute Brier {'->'} snapshot {'->'} recalibrate.</p>
            <p>Endpoints: <code className="bg-muted px-1 rounded">GET /api/model-metrics</code> for current metrics, <code className="bg-muted px-1 rounded">POST /api/model-metrics</code> to snapshot, <code className="bg-muted px-1 rounded">POST /api/evaluator/cron</code> to run evaluation batch.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}