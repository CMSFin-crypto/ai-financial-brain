'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  CheckCircle2, XCircle, AlertTriangle, Clock, Gauge,
  ArrowUpRight, ArrowDownRight, Target, RefreshCw, Shield, Zap,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────

type ExecutionAlarm = {
  metric: string;
  severity: 'WARNING' | 'CRITICAL';
  value: number;
  threshold: number;
  message: string;
};

type QualityReport = {
  sampleSize: number;
  fillRate: number | null;
  rejectRate: number | null;
  avgLatencyMs: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  p99LatencyMs: number | null;
  avgSlippageBps: number | null;
  p50SlippageBps: number | null;
  p95SlippageBps: number | null;
  p99SlippageBps: number | null;
  slippageStdDev: number | null;
  stopAttachedRate: number | null;
  topRejectReasons: Array<{ reason: string; count: number }>;
  alarms: ExecutionAlarm[];
  recentExecutions?: RecentExecution[];
};

type RecentExecution = {
  id: string;
  symbol: string;
  side: string;
  orderType: string;
  quantity: number;
  intendedPrice: number | null;
  filledPrice: number | null;
  slippageBps: number | null;
  latencyMs: number | null;
  status: string;
  rejectReason: string | null;
  stopAttached: boolean;
  submittedAt: string;
  filledAt: string | null;
};

// ─── Helpers ───────────────────────────────────────────────────

function pct(val: number | null | undefined): string {
  if (val == null) return 'N/A';
  return `${(val * 100).toFixed(1)}%`;
}

function bps(val: number | null | undefined): string {
  if (val == null) return 'N/A';
  return `${val.toFixed(1)} bps`;
}

function ms(val: number | null | undefined): string {
  if (val == null) return 'N/A';
  return `${val}ms`;
}

function statusBadge(status: string) {
  const s = status.toUpperCase();
  if (s === 'FILLED') return <Badge variant='default' className='bg-emerald-600'>FILLED</Badge>;
  if (s === 'REJECTED') return <Badge variant='destructive'>REJECTED</Badge>;
  if (s === 'PARTIAL') return <Badge className='bg-amber-500'>PARTIAL</Badge>;
  if (s === 'CANCELLED') return <Badge variant='secondary'>CANCELLED</Badge>;
  return <Badge variant='outline'>{status}</Badge>;
}

function sideIcon(side: string) {
  if (side === 'BUY') return <ArrowUpRight className='w-4 h-4 text-emerald-500' />;
  return <ArrowDownRight className='w-4 h-4 text-red-500' />;
}

function slippageColor(val: number | null): string {
  if (val === null) return 'text-muted-foreground';
  if (val < 0) return 'text-emerald-500'; // favorable
  if (val > 10) return 'text-red-500';
  if (val > 5) return 'text-amber-500';
  return 'text-foreground';
}

// ─── Metric Card ──────────────────────────────────────────────

function MetricCard({
  title, value, subtitle, icon: Icon, alarm,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  alarm?: boolean;
}) {
  return (
    <Card className={alarm ? 'border-red-500/50' : ''}>
      <CardHeader className='flex flex-row items-center justify-between pb-2 space-y-0'>
        <CardTitle className='text-sm font-medium text-muted-foreground'>{title}</CardTitle>
        <Icon className={`w-4 h-4 ${alarm ? 'text-red-500' : 'text-muted-foreground'}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${alarm ? 'text-red-500' : ''}`}>{value}</div>
        {subtitle && <p className='text-xs text-muted-foreground mt-1'>{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────

export default function ExecutionQualityPage() {
  const [data, setData] = useState<QualityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState('7');
  const [symbol, setSymbol] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ days, recent: 'true' });
      if (symbol !== 'all') params.set('symbol', symbol);
      const res = await fetch(`/api/execution-quality?${params}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to fetch execution quality:', err);
    } finally {
      setLoading(false);
    }
  }, [days, symbol]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const alarmMap = new Map(data?.alarms?.map(a => [a.metric, a]) ?? []);

  return (
    <div className='min-h-screen bg-background p-4 md:p-8 space-y-6'>
      {/* Header */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
        <div>
          <h1 className='text-2xl font-bold flex items-center gap-2'>
            <Gauge className='w-6 h-6' /> Execution Quality Monitor
          </h1>
          <p className='text-sm text-muted-foreground mt-1'>
            Fill rate, slippage, latency & reject tracking
          </p>
        </div>
        <div className='flex items-center gap-3'>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className='w-32'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='1'>1 Day</SelectItem>
              <SelectItem value='7'>7 Days</SelectItem>
              <SelectItem value='30'>30 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant='outline' size='icon' onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Alarms */}
      {data?.alarms && data.alarms.length > 0 && (
        <div className='space-y-2'>
          {data.alarms.map((alarm, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${
                alarm.severity === 'CRITICAL'
                  ? 'bg-red-950/30 border-red-800 text-red-200'
                  : 'bg-amber-950/30 border-amber-800 text-amber-200'
              }`}
            >
              <AlertTriangle className='w-5 h-5 shrink-0' />
              <span className='text-sm font-medium'>{alarm.message}</span>
              <Badge variant={alarm.severity === 'CRITICAL' ? 'destructive' : 'secondary'} className='ml-auto shrink-0'>
                {alarm.severity}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4'>
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className='p-6'><Skeleton className='h-16' /></CardContent></Card>
          ))}
        </div>
      ) : (
        <>
          {/* No data state */}
          {data && data.sampleSize === 0 && (
            <Card className='border-dashed'>
              <CardContent className='py-12 text-center text-muted-foreground'>
                <Target className='w-10 h-10 mx-auto mb-3 opacity-40' />
                <p className='text-lg font-medium'>No execution data yet</p>
                <p className='text-sm mt-1'>
                  Execute trades via the paper-trade or broker integration to see quality metrics here.
                </p>
              </CardContent>
            </Card>
          )}

          {/* 6 Metric Cards */}
          <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4'>
            <MetricCard
              title='Fill Rate'
              value={pct(data?.fillRate)}
              subtitle={`of ${data?.sampleSize ?? 0} orders`}
              icon={CheckCircle2}
              alarm={!!alarmMap.get('fillRate')}
            />
            <MetricCard
              title='Reject Rate'
              value={pct(data?.rejectRate)}
              subtitle={data?.rejectRate != null && data.rejectRate > 0.02 ? 'Above 2% threshold' : undefined}
              icon={XCircle}
              alarm={!!alarmMap.get('rejectRate')}
            />
            <MetricCard
              title='Avg Slippage'
              value={bps(data?.avgSlippageBps)}
              subtitle={`p50: ${bps(data?.p50SlippageBps)} · p95: ${bps(data?.p95SlippageBps)}`}
              icon={Target}
              alarm={!!alarmMap.get('avgSlippage')}
            />
            <MetricCard
              title='P95 Slippage'
              value={bps(data?.p95SlippageBps)}
              subtitle={`p99: ${bps(data?.p99SlippageBps)}`}
              icon={Zap}
            />
            <MetricCard
              title='Avg Latency'
              value={ms(data?.avgLatencyMs)}
              subtitle={`p50: ${ms(data?.p50LatencyMs)} · p95: ${ms(data?.p95LatencyMs)}`}
              icon={Clock}
              alarm={!!alarmMap.get('p95Latency')}
            />
            <MetricCard
              title='Stop Attached'
              value={pct(data?.stopAttachedRate)}
              subtitle={data?.stopAttachedRate != null && data.stopAttachedRate < 1 ? 'Some trades without stop' : undefined}
              icon={Shield}
            />
          </div>

          {/* Latency Distribution Detail */}
          {data && data.sampleSize > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Latency Distribution</CardTitle>
                <CardDescription>Round-trip time from submit to ack/fill</CardDescription>
              </CardHeader>
              <CardContent>
                <div className='grid grid-cols-4 gap-4 text-center'>
                  <div><p className='text-xs text-muted-foreground'>P50</p><p className='text-lg font-bold'>{ms(data.p50LatencyMs)}</p></div>
                  <div><p className='text-xs text-muted-foreground'>P95</p><p className='text-lg font-bold'>{ms(data.p95LatencyMs)}</p></div>
                  <div><p className='text-xs text-muted-foreground'>P99</p><p className='text-lg font-bold'>{ms(data.p99LatencyMs)}</p></div>
                  <div><p className='text-xs text-muted-foreground'>Avg</p><p className='text-lg font-bold'>{ms(data.avgLatencyMs)}</p></div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Two tables side by side */}
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
            {/* Top Reject Reasons */}
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Top Reject Reasons</CardTitle>
                <CardDescription>Most common rejection causes</CardDescription>
              </CardHeader>
              <CardContent>
                {(!data?.topRejectReasons || data.topRejectReasons.length === 0) ? (
                  <p className='text-sm text-muted-foreground py-4 text-center'>No rejections recorded</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reason</TableHead>
                        <TableHead className='text-right'>Count</TableHead>
                        <TableHead className='text-right'>%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.topRejectReasons.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className='font-mono text-sm'>{r.reason}</TableCell>
                          <TableCell className='text-right'>{r.count}</TableCell>
                          <TableCell className='text-right'>{data.sampleSize > 0 ? ((r.count / data.sampleSize) * 100).toFixed(1) : 0}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Last 20 Executions */}
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Recent Executions</CardTitle>
                <CardDescription>Last {data?.recentExecutions?.length ?? 0} orders</CardDescription>
              </CardHeader>
              <CardContent>
                {(!data?.recentExecutions || data.recentExecutions.length === 0) ? (
                  <p className='text-sm text-muted-foreground py-4 text-center'>No executions recorded</p>
                ) : (
                  <div className='overflow-auto max-h-80'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Symbol</TableHead>
                          <TableHead>Side</TableHead>
                          <TableHead>Slip</TableHead>
                          <TableHead>Latency</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.recentExecutions.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell className='font-semibold'>{e.symbol}</TableCell>
                            <TableCell>{sideIcon(e.side)}</TableCell>
                            <TableCell className={slippageColor(e.slippageBps)}>
                              {e.slippageBps !== null ? `${e.slippageBps > 0 ? '+' : ''}${e.slippageBps.toFixed(1)}` : '—'}
                            </TableCell>
                            <TableCell>{e.latencyMs != null ? `${e.latencyMs}ms` : '—'}</TableCell>
                            <TableCell>{statusBadge(e.status)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
