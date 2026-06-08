'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Eye,
  UserCheck,
  Wifi,
  Monitor,
  Tablet,
  Smartphone,
  Globe,
  RefreshCw,
  BarChart3,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

/* ---------- types ---------- */
interface RecentVisitor {
  id: string;
  time: string;
  maskedIP: string;
  flag: string;
  device: string;
  browser: string;
  page: string;
  referrer: string;
  country: string;
}

interface AnalyticsResponse {
  totalVisits: number;
  todayVisits: number;
  uniqueVisitors: number;
  onlineNow: number;
  recentVisitors: RecentVisitor[];
  visitsByCountry: { code: string; count: number; flag: string }[];
  deviceBreakdown: Record<string, number>;
  browsers: [string, number][];
  topPages: [string, number][];
  dailyVisits: { date: string; count: number; shortDate: string }[];
}

/* ---------- color palette ---------- */
const PIE_COLORS = ['#10b981', '#8b5cf6', '#f59e0b'];
const BAR_FILL = 'url(#barGradient)';
const BAR_ACTIVE_FILL = '#10b981';

/* ---------- device icon helper ---------- */
function DeviceIcon({ device }: { device: string }) {
  switch (device) {
    case 'Mobile':
      return <Smartphone className="w-3.5 h-3.5 text-violet-400" />;
    case 'Tablet':
      return <Tablet className="w-3.5 h-3.5 text-amber-400" />;
    default:
      return <Monitor className="w-3.5 h-3.5 text-emerald-400" />;
  }
}

/* ---------- custom tooltip for bar chart ---------- */
function BarTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold">{label}</p>
      <p className="text-emerald-500">{payload[0].value} vizita</p>
    </div>
  );
}

/* ---------- custom tooltip for pie chart ---------- */
function PieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold">{payload[0].name}</p>
      <p className="text-muted-foreground">{payload[0].value} vizitorë</p>
    </div>
  );
}

/* ---------- custom label for pie ---------- */
function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: {
  cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; percent: number;
}) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 20;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="currentColor" textAnchor={x > cx ? 'start' : 'end'} className="text-[11px] font-semibold">
      {(percent * 100).toFixed(0)}%
    </text>
  );
}

/* ========== MAIN COMPONENT ========== */
export function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/analytics');
      const json = await res.json();
      if (res.ok) setData(json);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-[110px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[300px] rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-[280px] rounded-xl" />
          <Skeleton className="h-[280px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  /* stat cards */
  const stats = [
    {
      label: 'Vizitorë Total',
      value: data.totalVisits,
      icon: Users,
      gradient: 'from-emerald-500/20 to-teal-500/10',
      iconBg: 'bg-emerald-500/20',
      iconColor: 'text-emerald-500',
      border: 'border-emerald-500/20',
    },
    {
      label: 'Vizitorë Sot',
      value: data.todayVisits,
      icon: Eye,
      gradient: 'from-violet-500/20 to-purple-500/10',
      iconBg: 'bg-violet-500/20',
      iconColor: 'text-violet-500',
      border: 'border-violet-500/20',
    },
    {
      label: 'Vizitorë Unikë',
      value: data.uniqueVisitors,
      icon: UserCheck,
      gradient: 'from-teal-500/20 to-cyan-500/10',
      iconBg: 'bg-teal-500/20',
      iconColor: 'text-teal-500',
      border: 'border-teal-500/20',
    },
    {
      label: 'Online Tani',
      value: data.onlineNow,
      icon: Wifi,
      gradient: 'from-emerald-500/20 to-violet-500/10',
      iconBg: 'bg-emerald-500/20',
      iconColor: 'text-emerald-500',
      border: 'border-emerald-500/20',
    },
  ];

  /* pie data */
  const pieData = [
    { name: 'Desktop', value: data.deviceBreakdown.Desktop || 0 },
    { name: 'Mobil', value: data.deviceBreakdown.Mobile || 0 },
    { name: 'Tablet', value: data.deviceBreakdown.Tablet || 0 },
  ].filter((d) => d.value > 0);

  /* browser icon helper */
  function browserIcon(b: string) {
    const colors: Record<string, string> = {
      Chrome: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      Safari: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      Firefox: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      Edge: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
      Opera: 'bg-red-500/10 text-red-500 border-red-500/20',
      Samsung: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
    };
    return colors[b] || 'bg-muted text-muted-foreground border-border';
  }

  const topPageCount = data.topPages.length > 0 ? data.topPages[0][1] : 1;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-emerald-500" />
          <span className="text-xs text-muted-foreground">Statistikat e Vizitorëve — Përditësohet çdo 30s</span>
        </div>
        <button
          onClick={fetchData}
          disabled={isRefreshing}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-emerald-500 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          Rifresko
        </button>
      </div>

      {/* ===== Top Stats Row ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <Card className={`border ${s.border} bg-gradient-to-br ${s.gradient} hover:shadow-md transition-all duration-300`}>
              <CardContent className="pt-3.5 pb-3 px-3.5">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium">{s.label}</p>
                  </div>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.iconBg}`}>
                    <s.icon className={`w-4 h-4 ${s.iconColor}`} />
                  </div>
                </div>
                <p className="text-2xl font-bold tabular-nums">{s.value.toLocaleString()}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* ===== Recent Visitors Table ===== */}
      <Card className="border-border/50">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold">Vizitorët e Fundit</h3>
          </div>

          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 px-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Koha</th>
                  <th className="text-left py-2 px-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">IP</th>
                  <th className="text-left py-2 px-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Vendi</th>
                  <th className="text-left py-2 px-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Pajisja</th>
                  <th className="text-left py-2 px-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Shfletuesi</th>
                  <th className="text-left py-2 px-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Faqja</th>
                  <th className="text-left py-2 px-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Referrali</th>
                </tr>
              </thead>
              <tbody>
                {data.recentVisitors.slice(0, 20).map((v, i) => (
                  <motion.tr
                    key={v.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                  >
                    <td className="py-2 px-1 text-muted-foreground tabular-nums whitespace-nowrap">{v.time}</td>
                    <td className="py-2 px-1 font-mono text-[11px]">{v.maskedIP}</td>
                    <td className="py-2 px-1">
                      <span className="inline-flex items-center gap-1">
                        <span>{v.flag}</span>
                        <span className="hidden sm:inline text-muted-foreground">{v.country}</span>
                      </span>
                    </td>
                    <td className="py-2 px-1 hidden sm:table-cell">
                      <div className="flex items-center gap-1">
                        <DeviceIcon device={v.device} />
                        <span className="text-muted-foreground">{v.device}</span>
                      </div>
                    </td>
                    <td className="py-2 px-1 hidden md:table-cell">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${browserIcon(v.browser)}`}>
                        {v.browser}
                      </Badge>
                    </td>
                    <td className="py-2 px-1 font-medium">{v.page}</td>
                    <td className="py-2 px-1 hidden lg:table-cell text-muted-foreground truncate max-w-[140px]">
                      {v.referrer ? (
                        <span className="block truncate">{v.referrer.replace(/^https?:\/\/(www\.)?/, '').slice(0, 30)}</span>
                      ) : (
                        <span className="text-muted-foreground/50">Direkt</span>
                      )}
                    </td>
                  </motion.tr>
                ))}
                {data.recentVisitors.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-muted-foreground text-xs">
                      Nuk ka vizitorë ende
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ===== Charts Row ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Visits per day bar chart */}
        <Card className="border-border/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-semibold">Vizitat Ditore (30 ditë)</h3>
            </div>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.dailyVisits} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#059669" />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="shortDate"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<BarTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} />
                  <Bar dataKey="count" fill={BAR_FILL} radius={[4, 4, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Device breakdown pie chart */}
        <Card className="border-border/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-violet-500" />
              <h3 className="text-sm font-semibold">Pajisjet</h3>
            </div>
            {pieData.length > 0 ? (
              <div className="h-[250px] w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                      label={PieLabel}
                      labelLine={false}
                    >
                      {pieData.map((_, index) => (
                        <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-xs">
                Nuk ka të dhëna
              </div>
            )}

            {/* Pie legend */}
            <div className="flex items-center justify-center gap-4 mt-2">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-[11px] text-muted-foreground">{d.name}</span>
                  <span className="text-[11px] font-semibold tabular-nums">{d.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===== Bottom Row: Top Pages + Browsers ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top pages */}
        <Card className="border-border/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-semibold">Faqet Kryesore</h3>
            </div>
            <div className="space-y-2">
              {data.topPages.length > 0 ? (
                data.topPages.map(([page, count], i) => {
                  const pct = Math.round((count / topPageCount) * 100);
                  return (
                    <div key={page} className="flex items-center gap-3">
                      <span className="text-xs font-mono text-muted-foreground w-5 text-right">{i + 1}</span>
                      <span className="text-xs font-medium w-20 truncate">{page}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ delay: i * 0.05, duration: 0.5 }}
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                        />
                      </div>
                      <span className="text-xs font-semibold tabular-nums w-10 text-right">{count}</span>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">Nuk ka të dhëna</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Browser stats */}
        <Card className="border-border/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-violet-500" />
              <h3 className="text-sm font-semibold">Shfletuesit</h3>
            </div>
            <div className="space-y-2">
              {data.browsers.length > 0 ? (
                data.browsers.map(([browser, count]) => {
                  const total = data.browsers.reduce((s, b) => s + b[1], 0);
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={browser} className="flex items-center gap-3">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 min-w-[60px] justify-center ${browserIcon(browser)}`}>
                        {browser}
                      </Badge>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.5 }}
                          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-500"
                        />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground w-12 text-right">
                        {count} <span className="text-[10px]">({pct}%)</span>
                      </span>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">Nuk ka të dhëna</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
