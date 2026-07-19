'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  RefreshCw,
  TrendingDown,
  Minus,
  TrendingUp,
  Flame,
  AlertTriangle,
  Activity,
  Loader2,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────

interface FearGreedData {
  value: number;
  label: string;
  previousValue: number;
  previousLabel: string;
  oneWeekAgo: number;
  oneMonthAgo: number;
  oneYearAgo: number;
  timestamp: string;
  history: { date: string; value: number }[];
  error?: string;
}

// ─── Helpers ───────────────────────────────────────────────────

function scoreToAlbanianLabel(score: number): string {
  if (score <= 24) return 'Frikë Ekstreme';
  if (score <= 44) return 'Frikë';
  if (score <= 55) return 'Neutral';
  if (score <= 75) return 'Grykësi';
  return 'Grykësi Ekstrem';
}

function scoreToColor(score: number): string {
  if (score <= 24) return 'text-red-500';
  if (score <= 44) return 'text-orange-500';
  if (score <= 55) return 'text-yellow-500';
  if (score <= 75) return 'text-emerald-500';
  return 'text-emerald-400';
}

function scoreToStroke(score: number): string {
  if (score <= 24) return 'stroke-red-500';
  if (score <= 44) return 'stroke-orange-500';
  if (score <= 55) return 'stroke-yellow-500';
  if (score <= 75) return 'stroke-emerald-500';
  return 'stroke-emerald-400';
}

function scoreToBadgeClass(score: number): string {
  if (score <= 24) return 'bg-red-500/20 text-red-400 border-red-500/30';
  if (score <= 44) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
  if (score <= 55) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  if (score <= 75) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  return 'bg-emerald-400/20 text-emerald-300 border-emerald-400/30';
}

function scoreToIcon(score: number) {
  if (score <= 24) return <Flame className="w-4 h-4 text-red-500" />;
  if (score <= 44) return <AlertTriangle className="w-4 h-4 text-orange-500" />;
  if (score <= 55) return <Minus className="w-4 h-4 text-yellow-500" />;
  if (score <= 75) return <TrendingUp className="w-4 h-4 text-emerald-500" />;
  return <TrendingUp className="w-4 h-4 text-emerald-400" />;
}

function ChangeArrow({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (diff > 0) return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
  if (diff < 0) return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-yellow-400" />;
}

// ─── Circular Gauge ────────────────────────────────────────────

function FearGreedGauge({ score }: { score: number }) {
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative w-44 h-44">
      <svg className="w-44 h-44 -rotate-90" viewBox="0 0 160 160">
        <defs>
          <linearGradient id="fearGreedGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="25%" stopColor="#f97316" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="75%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>
        {/* Background track */}
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          className="stroke-muted/30"
          strokeWidth="10"
        />
        {/* Gradient arc */}
        <motion.circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="url(#fearGreedGrad)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
        {/* Score-colored overlay arc for emphasis */}
        <motion.circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          className={scoreToStroke(score)}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          style={{ opacity: 0.3 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-bold tabular-nums ${scoreToColor(score)}`}>
          {score}
        </span>
        <span className="text-[10px] text-muted-foreground tracking-wider uppercase">
          / 100
        </span>
      </div>
    </div>
  );
}

// ─── Mini Bar Chart (last 30 days) ─────────────────────────────

function MiniBarChart({ history }: { history: { date: string; value: number }[] }) {
  const last30 = history.slice(-30);
  if (last30.length === 0) return null;

  const maxVal = Math.max(...last30.map((h) => h.value), 1);

  return (
    <div className="flex items-end gap-[2px] h-20 w-full">
      {last30.map((point, i) => {
        const height = Math.max((point.value / maxVal) * 100, 4);
        let color = 'bg-yellow-500/70';
        if (point.value <= 24) color = 'bg-red-500/70';
        else if (point.value <= 44) color = 'bg-orange-500/70';
        else if (point.value <= 55) color = 'bg-yellow-500/70';
        else if (point.value <= 75) color = 'bg-emerald-500/70';
        else color = 'bg-emerald-400/70';

        return (
          <motion.div
            key={point.date}
            className={`flex-1 rounded-t-sm ${color} min-w-[3px]`}
            initial={{ height: 0 }}
            animate={{ height: `${height}%` }}
            transition={{ duration: 0.4, delay: i * 0.015 }}
            title={`${point.date}: ${point.value}`}
          />
        );
      })}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────

export default function FearGreedIndex() {
  const [data, setData] = useState<FearGreedData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchFearGreed = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/fear-greed');
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFearGreed();
  }, [fetchFearGreed]);

  if (loading) {
    return (
      <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
        <CardContent className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
        <CardContent className="flex flex-col items-center justify-center py-20 gap-3">
          <AlertTriangle className="w-8 h-8 text-red-400" />
          <p className="text-sm text-muted-foreground">
            Nuk u gjetën të dhëna. Provo përsëri.
          </p>
          <Button size="sm" variant="outline" onClick={fetchFearGreed}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Përditëso
          </Button>
        </CardContent>
      </Card>
    );
  }

  const comparisons = [
    {
      label: 'Mbyllja e Kaluar',
      value: data.previousValue,
      sublabel: data.previousLabel
        ? scoreToAlbanianLabel(data.previousValue)
        : '',
    },
    {
      label: '1 Javë Më Parë',
      value: data.oneWeekAgo,
      sublabel: scoreToAlbanianLabel(data.oneWeekAgo),
    },
    {
      label: '1 Muaj Më Parë',
      value: data.oneMonthAgo,
      sublabel: scoreToAlbanianLabel(data.oneMonthAgo),
    },
    {
      label: '1 Vit Më Parë',
      value: data.oneYearAgo,
      sublabel: scoreToAlbanianLabel(data.oneYearAgo),
    },
  ];

  const timestampStr = data.timestamp
    ? new Date(data.timestamp).toLocaleString('sq-AL', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
      <CardContent className="p-5 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            <h3 className="text-base font-semibold tracking-tight">
              Indeksi i Frikës &amp; Grykesisë
            </h3>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchFearGreed}
            disabled={loading}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Error banner */}
        {data.error && (
          <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-xs text-yellow-400">
            {data.error}
          </div>
        )}

        {/* Main gauge area */}
        <div className="flex flex-col items-center gap-3">
          <FearGreedGauge score={data.value} />

          <Badge
            className={`text-sm px-3 py-1 border ${scoreToBadgeClass(data.value)}`}
          >
            {scoreToIcon(data.value)}
            <span className="ml-1.5 font-medium">
              {scoreToAlbanianLabel(data.value)}
            </span>
          </Badge>

          <p className="text-[11px] text-muted-foreground">{timestampStr}</p>
        </div>

        {/* Scale legend */}
        <div className="flex justify-between px-1 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            0 – Frikë
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            50 – Neutral
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            100 – Grykësi
          </span>
        </div>

        {/* Comparison cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {comparisons.map((comp) => {
            const diff = data.value - comp.value;
            return (
              <motion.div
                key={comp.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="rounded-lg border border-border/50 bg-muted/30 p-3 text-center space-y-1"
              >
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {comp.label}
                </p>
                <div className="flex items-center justify-center gap-1.5">
                  <ChangeArrow current={data.value} previous={comp.value} />
                  <span
                    className={`text-lg font-bold tabular-nums ${scoreToColor(comp.value)}`}
                  >
                    {comp.value}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {comp.sublabel}
                </p>
                <p
                  className={`text-[11px] font-medium ${
                    diff > 0
                      ? 'text-emerald-400'
                      : diff < 0
                        ? 'text-red-400'
                        : 'text-yellow-400'
                  }`}
                >
                  {diff > 0 ? '+' : ''}
                  {diff} pikë
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Mini history chart */}
        {data.history && data.history.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">
              Historiku — 30 ditët e fundit
            </p>
            <MiniBarChart history={data.history} />
            <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
              <span>
                {data.history.slice(-30)[0]?.date ?? ''}
              </span>
              <span>
                {data.history[data.history.length - 1]?.date ?? ''}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}