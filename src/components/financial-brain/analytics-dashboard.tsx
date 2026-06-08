'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
  Clock,
  Fingerprint,
  MapPin,
  Laptop,
  MousePointerClick,
  Star,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Filter,
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
  country: string;
  device: string;
  browser: string;
  os: string;
  page: string;
  referrer: string;
  fingerprint: string;
  visitorNumber: number;
  visitCount: number;
  isNewVisitor: boolean;
  screenWidth: number;
  screenHeight: number;
  pixelRatio: number;
  connectionType: string;
  isTouchDevice: boolean;
  language: string;
}

interface TopVisitor {
  fingerprint: string;
  visitorNumber: number;
  visitCount: number;
  firstSeen: string;
  lastSeen: string;
  country: string;
  flag: string;
  os: string;
  device: string;
  browser: string;
}

interface AnalyticsResponse {
  totalVisits: number;
  todayVisits: number;
  uniqueVisitors: number;
  totalUniqueVisitors: number;
  onlineNow: number;
  recentVisitors: RecentVisitor[];
  visitsByCountry: { code: string; count: number; flag: string }[];
  deviceBreakdown: Record<string, number>;
  browsers: [string, number][];
  osList: [string, number][];
  topPages: [string, number][];
  dailyVisits: { date: string; count: number; shortDate: string }[];
  topVisitors: TopVisitor[];
}

/* ---------- color palette ---------- */
const PIE_COLORS = ['#21c55e', '#8b5cf6', '#f59e0b'];
const BAR_FILL = 'url(#barGradient)';

/* ---------- device icon helper ---------- */
function DeviceIcon({ device, className = 'w-3.5 h-3.5' }: { device: string; className?: string }) {
  switch (device) {
    case 'Mobile':
      return <Smartphone className={`${className} text-violet-400`} />;
    case 'Tablet':
      return <Tablet className={`${className} text-amber-400`} />;
    default:
      return <Monitor className={`${className} text-emerald-400`} />;
  }
}

/* ---------- OS icon helper ---------- */
function osIcon(os: string): string {
  if (/Windows/i.test(os)) return '\u{1F5A5}';
  if (/macOS|Mac/i.test(os)) return '\u{1F34E}';
  if (/iOS/i.test(os)) return '\u{1F4F1}';
  if (/Android/i.test(os)) return '\u{1F4F2}';
  if (/Linux/i.test(os)) return '\u{1F427}';
  if (/Chrome OS/i.test(os)) return '\u{1F310}';
  return '\u{1F4BB}';
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
      <p className="text-muted-foreground">{payload[0].value} vizitor\u00EB</p>
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

/* ---------- Visitor Detail Dialog ---------- */
function VisitorDetailDialog({ visitor }: { visitor: RecentVisitor }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px] text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
        >
          Detaje
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Fingerprint className="w-4 h-4 text-emerald-500" />
            Vizitori #{visitor.visitorNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-xs">
          {/* Identity */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Identifikimi</p>
              <p className="font-mono text-[11px]">{visitor.fingerprint}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">IP</p>
              <p className="font-mono text-[11px]">{visitor.maskedIP}</p>
            </div>
          </div>
          {/* Device & OS */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sistemi Operativ</p>
              <p className="flex items-center gap-1.5">
                <span>{osIcon(visitor.os)}</span>
                <span>{visitor.os}</span>
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pajisja</p>
              <p className="flex items-center gap-1.5">
                <DeviceIcon device={visitor.device} className="w-3.5 h-3.5" />
                <span>{visitor.device}</span>
                {visitor.isTouchDevice && <Badge variant="outline" className="text-[9px] px-1 py-0">Touch</Badge>}
              </p>
            </div>
          </div>
          {/* Browser & Connection */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Shfletuesi</p>
              <p>{visitor.browser}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Lidhja</p>
              <p className="uppercase">{visitor.connectionType}</p>
            </div>
          </div>
          {/* Screen */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ekrani</p>
              <p>{visitor.screenWidth} x {visitor.screenHeight}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pixel Ratio</p>
              <p>{visitor.pixelRatio}x</p>
            </div>
          </div>
          {/* Location & Language */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Vendi</p>
              <p className="flex items-center gap-1.5">
                <span>{visitor.flag}</span>
                <span>{visitor.country}</span>
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gjuha</p>
              <p>{visitor.language}</p>
            </div>
          </div>
          {/* Visits */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Numri i Vizitave</p>
              <p className="font-semibold text-emerald-500">{visitor.visitCount}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Lloji</p>
              <Badge variant={visitor.isNewVisitor ? 'default' : 'secondary'} className="text-[10px]">
                {visitor.isNewVisitor ? 'I Ri' : 'I Rikthyer'}
              </Badge>
            </div>
          </div>
          {/* Page & Referrer */}
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Faqja e Vizituar</p>
              <p className="font-medium">{visitor.page}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Referrali</p>
              <p>{visitor.referrer || 'Direkt'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Koha</p>
              <p>{visitor.time}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ========== MAIN COMPONENT ========== */
export function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAllVisitors, setShowAllVisitors] = useState(false);
  const [sortField, setSortField] = useState<'time' | 'visitorNumber' | 'device' | 'country'>('time');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterDevice, setFilterDevice] = useState<string | null>(null);

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

  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
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
      label: 'Vizitor\u00EB Total',
      value: data.totalVisits,
      icon: Users,
      gradient: 'from-emerald-500/20 to-teal-500/10',
      iconBg: 'bg-emerald-500/20',
      iconColor: 'text-emerald-500',
      border: 'border-emerald-500/20',
    },
    {
      label: 'Vizitor\u00EB Sot',
      value: data.todayVisits,
      icon: Eye,
      gradient: 'from-violet-500/20 to-purple-500/10',
      iconBg: 'bg-violet-500/20',
      iconColor: 'text-violet-500',
      border: 'border-violet-500/20',
    },
    {
      label: 'Vizitor\u00EB Unik\u00EB',
      value: data.totalUniqueVisitors,
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
    {
      label: 'IP Unike (30d)',
      value: data.uniqueVisitors,
      icon: Fingerprint,
      gradient: 'from-blue-500/20 to-indigo-500/10',
      iconBg: 'bg-blue-500/20',
      iconColor: 'text-blue-500',
      border: 'border-blue-500/20',
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

  /* Filter and sort recent visitors */
  const displayVisitors = [...data.recentVisitors]
    .filter((v) => !filterDevice || v.device === filterDevice)
    .sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'time':
          cmp = 0; // already sorted by time desc
          break;
        case 'visitorNumber':
          cmp = a.visitorNumber - b.visitorNumber;
          break;
        case 'device':
          cmp = a.device.localeCompare(b.device);
          break;
        case 'country':
          cmp = a.country.localeCompare(b.country);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const visibleVisitors = showAllVisitors ? displayVisitors : displayVisitors.slice(0, 15);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-emerald-500" />
          <span className="text-xs text-muted-foreground">Statistikat e Vizitor\u00EBve \u2014 P\u00EBrdit\u00EBsohet \u00E7do 30s</span>
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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
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

      {/* ===== Top Visitors Card ===== */}
      <Card className="border-border/50">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Star className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold">Vizitor\u00EBt M\u00EB Aktiv\u00EB (Top 20)</h3>
          </div>
          {data.topVisitors.length > 0 ? (
            <div className="space-y-2">
              {data.topVisitors.map((tv, i) => (
                <motion.div
                  key={tv.fingerprint}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className="flex items-center gap-3 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? 'bg-amber-500/20 text-amber-500' :
                    i === 1 ? 'bg-slate-400/20 text-slate-400' :
                    i === 2 ? 'bg-orange-500/20 text-orange-500' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs">Vizitori #{tv.visitorNumber}</span>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                        {tv.visitCount} vizita
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                      <span>{tv.flag} {tv.country}</span>
                      <span className="hidden sm:inline">|</span>
                      <span className="hidden sm:inline">{osIcon(tv.os)} {tv.os}</span>
                      <span className="hidden md:inline">|</span>
                      <span className="hidden md:inline">{tv.browser}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-right">
                    <DeviceIcon device={tv.device} className="w-3.5 h-3.5" />
                    <span className="text-[10px] text-muted-foreground hidden sm:inline">{tv.device}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground text-right hidden lg:block max-w-[120px]">
                    <div className="flex items-center gap-1 justify-end">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(tv.lastSeen).toLocaleString('sq-AL', { timeZone: 'Europe/Tirane', dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">Nuk ka vizitor\u00EB ende</p>
          )}
        </CardContent>
      </Card>

      {/* ===== Recent Visitors Table ===== */}
      <Card className="border-border/50">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-500" />
              <h3 className="text-sm font-semibold">Vizitor\u00EBt e Fundit</h3>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{displayVisitors.length}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              {/* Device filter */}
              <Button
                variant={filterDevice === null ? 'default' : 'outline'}
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => setFilterDevice(null)}
              >
                <Filter className="w-2.5 h-2.5 mr-1" />
                T\u00EB gjitha
              </Button>
              {pieData.map((d) => (
                <Button
                  key={d.name}
                  variant={filterDevice === d.name ? 'default' : 'outline'}
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => setFilterDevice(filterDevice === d.name ? null : d.name)}
                >
                  <DeviceIcon device={d.name} className="w-2.5 h-2.5 mr-1" />
                  {d.name}
                </Button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 px-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <button onClick={() => toggleSort('visitorNumber')} className="flex items-center gap-0.5 hover:text-foreground transition-colors">
                      Vizitori {sortField === 'visitorNumber' && (sortDir === 'asc' ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />)}
                    </button>
                  </th>
                  <th className="text-left py-2 px-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Koha</th>
                  <th className="text-left py-2 px-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">IP</th>
                  <th className="text-left py-2 px-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <button onClick={() => toggleSort('country')} className="flex items-center gap-0.5 hover:text-foreground transition-colors">
                      Vendi {sortField === 'country' && (sortDir === 'asc' ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />)}
                    </button>
                  </th>
                  <th className="text-left py-2 px-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">OS</th>
                  <th className="text-left py-2 px-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <button onClick={() => toggleSort('device')} className="flex items-center gap-0.5 hover:text-foreground transition-colors">
                      Pajisja {sortField === 'device' && (sortDir === 'asc' ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />)}
                    </button>
                  </th>
                  <th className="text-left py-2 px-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Shfletuesi</th>
                  <th className="text-left py-2 px-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Faqja</th>
                  <th className="text-left py-2 px-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Referrali</th>
                  <th className="text-left py-2 px-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Veprime</th>
                </tr>
              </thead>
              <tbody>
                {visibleVisitors.map((v, i) => (
                  <motion.tr
                    key={v.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className={`border-b border-border/30 hover:bg-muted/30 transition-colors ${v.isNewVisitor ? 'bg-emerald-500/[0.03]' : ''}`}
                  >
                    <td className="py-2 px-1">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold ${
                          v.visitCount > 10 ? 'bg-amber-500/20 text-amber-500' :
                          v.visitCount > 5 ? 'bg-emerald-500/20 text-emerald-500' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          #{v.visitorNumber}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-semibold">{v.visitCount > 1 ? 'I Rikthyer' : 'I Ri'}</span>
                          <span className="text-[9px] text-muted-foreground">{v.visitCount}x</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-1 text-muted-foreground tabular-nums whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5 text-muted-foreground/50" />
                        {v.time}
                      </div>
                    </td>
                    <td className="py-2 px-1 font-mono text-[11px]">{v.maskedIP}</td>
                    <td className="py-2 px-1">
                      <span className="inline-flex items-center gap-1">
                        <span>{v.flag}</span>
                        <span className="hidden sm:inline text-muted-foreground">{v.country}</span>
                      </span>
                    </td>
                    <td className="py-2 px-1">
                      <span className="inline-flex items-center gap-1 text-[11px]">
                        <span>{osIcon(v.os)}</span>
                        <span className="hidden sm:inline text-muted-foreground">{v.os}</span>
                      </span>
                    </td>
                    <td className="py-2 px-1">
                      <div className="flex items-center gap-1">
                        <DeviceIcon device={v.device} />
                        <span className="text-muted-foreground">{v.device}</span>
                        {v.isTouchDevice && <span className="text-[8px] text-violet-400">T</span>}
                      </div>
                    </td>
                    <td className="py-2 px-1 hidden md:table-cell">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${browserIcon(v.browser)}`}>
                        {v.browser}
                      </Badge>
                    </td>
                    <td className="py-2 px-1 font-medium max-w-[80px] truncate">{v.page}</td>
                    <td className="py-2 px-1 hidden lg:table-cell text-muted-foreground truncate max-w-[140px]">
                      {v.referrer ? (
                        <span className="block truncate">{v.referrer.replace(/^https?:\/\/(www\.)?/, '').slice(0, 30)}</span>
                      ) : (
                        <span className="text-muted-foreground/50">Direkt</span>
                      )}
                    </td>
                    <td className="py-2 px-1">
                      <VisitorDetailDialog visitor={v} />
                    </td>
                  </motion.tr>
                ))}
                {displayVisitors.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-6 text-center text-muted-foreground text-xs">
                      Nuk ka vizitor\u00EB ende
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Show more / less */}
          {displayVisitors.length > 15 && (
            <div className="flex justify-center mt-3">
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => setShowAllVisitors(!showAllVisitors)}
              >
                {showAllVisitors ? (
                  <>
                    <ChevronUp className="w-3 h-3 mr-1" />
                    Shiko m\u00EB pak
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3 mr-1" />
                    Shiko t\u00EB gjith\u00EB ({displayVisitors.length})
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== Charts Row ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Visits per day bar chart */}
        <Card className="border-border/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-semibold">Vizitat Ditore (30 dit\u00EB)</h3>
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
                Nuk ka t\u00EB dh\u00EBna
              </div>
            )}

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

      {/* ===== Bottom Row: Top Pages + Browsers + OS ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
                <p className="text-xs text-muted-foreground text-center py-4">Nuk ka t\u00EB dh\u00EBna</p>
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
                <p className="text-xs text-muted-foreground text-center py-4">Nuk ka t\u00EB dh\u00EBna</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* OS stats */}
        <Card className="border-border/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Laptop className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-semibold">Sistemet Operative</h3>
            </div>
            <div className="space-y-2">
              {data.osList && data.osList.length > 0 ? (
                data.osList.map(([os, count]) => {
                  const total = data.osList.reduce((s, o) => s + o[1], 0);
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={os} className="flex items-center gap-3">
                      <span className="w-6 text-center">{osIcon(os)}</span>
                      <span className="text-xs text-muted-foreground min-w-[80px] truncate">{os}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.5 }}
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500"
                        />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground w-12 text-right">
                        {count} <span className="text-[10px]">({pct}%)</span>
                      </span>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">Nuk ka t\u00EB dh\u00EBna</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
