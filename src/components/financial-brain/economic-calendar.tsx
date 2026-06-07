'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Landmark,
  TrendingUp,
  Users,
  BarChart3,
  Factory,
  ShoppingCart,
  Heart,
  Home,
  Cog,
  Banknote,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Clock,
  Filter,
  ChevronDown,
  Zap,
  Globe,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface EconomicEvent {
  id: string;
  date: string;
  time: string;
  name: string;
  nameSq: string;
  category: string;
  importance: 'HIGH' | 'MEDIUM' | 'LOW';
  previousValue: string;
  forecastValue: string;
  country: string;
  descriptionSq: string;
}

interface WeekGroup {
  weekStart: string;
  weekEnd: string;
  events: EconomicEvent[];
}

interface CalendarData {
  events: EconomicEvent[];
  byWeek: WeekGroup[];
  next7Days: EconomicEvent[];
  totalEvents: number;
  generatedAt: string;
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string; textColor: string; icon: LucideIcon }> = {
  FED: { label: 'FED', color: 'rose', bgColor: 'bg-rose-500/10', borderColor: 'border-rose-500/25', textColor: 'text-rose-600', icon: Landmark },
  CPI: { label: 'CPI', color: 'orange', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/25', textColor: 'text-orange-600', icon: TrendingUp },
  PPI: { label: 'PPI', color: 'orange', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/25', textColor: 'text-orange-600', icon: TrendingUp },
  NFP: { label: 'NFP', color: 'amber', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/25', textColor: 'text-amber-600', icon: Users },
  JOBLESS: { label: 'Punësimi', color: 'amber', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/25', textColor: 'text-amber-600', icon: Users },
  GDP: { label: 'PBB', color: 'blue', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/25', textColor: 'text-blue-600', icon: BarChart3 },
  PMI: { label: 'PMI', color: 'teal', bgColor: 'bg-teal-500/10', borderColor: 'border-teal-500/25', textColor: 'text-teal-600', icon: Factory },
  RETAIL: { label: 'Shitjet', color: 'violet', bgColor: 'bg-violet-500/10', borderColor: 'border-violet-500/25', textColor: 'text-violet-600', icon: ShoppingCart },
  CONSUMER: { label: 'Konsumatori', color: 'pink', bgColor: 'bg-pink-500/10', borderColor: 'border-pink-500/25', textColor: 'text-pink-600', icon: Heart },
  HOUSING: { label: 'Banesat', color: 'cyan', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500/25', textColor: 'text-cyan-600', icon: Home },
  MANUFACTURING: { label: 'Prodhimi', color: 'indigo', bgColor: 'bg-indigo-500/10', borderColor: 'border-indigo-500/25', textColor: 'text-indigo-600', icon: Cog },
  TREASURY: { label: 'Thesari', color: 'emerald', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/25', textColor: 'text-emerald-600', icon: Banknote },
};

const DEFAULT_CATEGORY = { label: 'Tjetër', color: 'gray', bgColor: 'bg-gray-500/10', borderColor: 'border-gray-500/25', textColor: 'text-gray-600', icon: Calendar as LucideIcon };

const ALL_CATEGORIES = ['FED', 'CPI', 'PPI', 'NFP', 'JOBLESS', 'GDP', 'PMI', 'RETAIL', 'CONSUMER', 'HOUSING', 'MANUFACTURING', 'TREASURY'];

const MONTH_NAMES_SQ = [
  'Janar', 'Shkurt', 'Mars', 'Prill', 'Maj', 'Qershor',
  'Korrik', 'Gusht', 'Shtator', 'Tetor', 'Nëntor', 'Dhjetor',
];

const DAY_NAMES_SQ = ['Diel', 'Hën', 'Mar', 'Mër', 'Enj', 'Pre', 'Sht'];

const IMPORTANCE_LABELS: Record<string, string> = {
  ALL: 'Të gjitha',
  HIGH: 'Vetëm i lartë',
  HIGH_MEDIUM: 'I lartë + Mesatar',
};

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${MONTH_NAMES_SQ[d.getMonth()]}`;
}

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAY_NAMES_SQ[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES_SQ[d.getMonth()]}`;
}

function formatWeekRange(weekStart: string, weekEnd: string): string {
  const s = new Date(weekStart + 'T00:00:00');
  const e = new Date(weekEnd + 'T00:00:00');
  return `${s.getDate()} ${MONTH_NAMES_SQ[s.getMonth()]} – ${e.getDate()} ${MONTH_NAMES_SQ[e.getMonth()]}`;
}

function ImportanceDots({ importance }: { importance: string }) {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${
            importance === 'HIGH'
              ? 'bg-red-500'
              : importance === 'MEDIUM'
                ? i < 2 ? 'bg-amber-500' : 'bg-gray-300'
                : i < 1 ? 'bg-amber-500' : 'bg-gray-300'
          }`}
        />
      ))}
    </div>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const config = CATEGORY_CONFIG[category] || DEFAULT_CATEGORY;
  const Icon = config.icon;
  return (
    <Badge
      className={`text-[9px] px-1.5 py-0 h-5 border font-medium ${config.bgColor} ${config.borderColor} ${config.textColor}`}
    >
      <Icon className="w-2.5 h-2.5 mr-0.5" />
      {config.label}
    </Badge>
  );
}

export function EconomicCalendar() {
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set(ALL_CATEGORIES));
  const [importanceFilter, setImportanceFilter] = useState<string>('ALL');
  const [showFilters, setShowFilters] = useState(false);

  const fetchData = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const res = await fetch('/api/economic-calendar');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Gabim');
        return;
      }
      setData(json);
    } catch {
      setError('Gabim rrjeti');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleCategory = (cat: string) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const selectAllCategories = () => setActiveCategories(new Set(ALL_CATEGORIES));
  const clearAllCategories = () => setActiveCategories(new Set());

  // Filter events
  const filteredNext7Days = useMemo(() => {
    if (!data) return [];
    return data.next7Days.filter((evt) => {
      if (!activeCategories.has(evt.category)) return false;
      if (importanceFilter === 'HIGH' && evt.importance !== 'HIGH') return false;
      if (importanceFilter === 'HIGH_MEDIUM' && evt.importance === 'LOW') return false;
      return true;
    });
  }, [data, activeCategories, importanceFilter]);

  const filteredWeeks = useMemo(() => {
    if (!data) return [];
    return data.byWeek
      .map((week) => ({
        ...week,
        events: week.events.filter((evt) => {
          if (!activeCategories.has(evt.category)) return false;
          if (importanceFilter === 'HIGH' && evt.importance !== 'HIGH') return false;
          if (importanceFilter === 'HIGH_MEDIUM' && evt.importance === 'LOW') return false;
          return true;
        }),
      }))
      .filter((week) => week.events.length > 0);
  }, [data, activeCategories, importanceFilter]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[60px] rounded-xl" />
        <Skeleton className="h-[400px] rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-500/20 bg-red-500/5">
        <CardContent className="flex items-center gap-2 py-4">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-sm text-red-400">{error}</span>
          <button onClick={fetchData} className="ml-auto text-xs text-red-500 hover:underline">
            Provo përsëri
          </button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4 text-blue-500" />
          <span className="text-xs text-muted-foreground">
            {data.totalEvents} ngjarje ekonomike
          </span>
          <Badge className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 px-1.5">
            <Globe className="w-2.5 h-2.5 mr-0.5" />
            US
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${
              showFilters
                ? 'bg-blue-500/10 text-blue-600 border border-blue-500/30'
                : 'text-muted-foreground hover:text-blue-500'
            }`}
          >
            <Filter className="w-3 h-3" />
            Filtrat
            <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
          <button
            onClick={fetchData}
            disabled={isRefreshing}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-blue-500 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            Rifresko
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Card className="border-border/50 bg-card/50">
              <CardContent className="pt-4 space-y-3">
                {/* Category Filters */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-muted-foreground">Kategoritë</span>
                    <div className="flex gap-2">
                      <button
                        onClick={selectAllCategories}
                        className="text-[10px] text-blue-500 hover:underline"
                      >
                        Të gjitha
                      </button>
                      <button
                        onClick={clearAllCategories}
                        className="text-[10px] text-muted-foreground hover:underline"
                      >
                        Asnjë
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_CATEGORIES.map((cat) => {
                      const config = CATEGORY_CONFIG[cat] || DEFAULT_CATEGORY;
                      const Icon = config.icon;
                      const isActive = activeCategories.has(cat);
                      return (
                        <button
                          key={cat}
                          onClick={() => toggleCategory(cat)}
                          className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-all ${
                            isActive
                              ? `${config.bgColor} ${config.borderColor} ${config.textColor} font-medium`
                              : 'bg-transparent border-border/50 text-muted-foreground/50 hover:text-muted-foreground'
                          }`}
                        >
                          <Icon className="w-2.5 h-2.5" />
                          {config.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Importance Filter */}
                <div>
                  <span className="text-xs font-semibold text-muted-foreground mb-2 block">Rëndësia</span>
                  <div className="flex gap-1.5">
                    {(['ALL', 'HIGH_MEDIUM', 'HIGH'] as const).map((level) => (
                      <button
                        key={level}
                        onClick={() => setImportanceFilter(level)}
                        className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
                          importanceFilter === level
                            ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 font-medium'
                            : 'bg-transparent border-border/50 text-muted-foreground/50 hover:text-muted-foreground'
                        }`}
                      >
                        {IMPORTANCE_LABELS[level]}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick View: Next 7 Days */}
      {filteredNext7Days.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-teal-500/5">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    Java e ardhme
                  </h3>
                  <p className="text-[10px] text-muted-foreground">
                    Ngjarjet ekonomike për 7 ditët e ardhshme
                  </p>
                </div>
                <Badge className="ml-auto text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                  {filteredNext7Days.length} ngjarje
                </Badge>
              </div>

              <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                <AnimatePresence mode="popLayout">
                  {filteredNext7Days.map((evt, i) => (
                    <motion.div
                      key={evt.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className={`flex items-start gap-3 p-2.5 rounded-lg border transition-all ${
                        evt.importance === 'HIGH'
                          ? 'border-emerald-500/20 bg-emerald-500/5'
                          : 'border-border/50 bg-card/50'
                      }`}
                    >
                      <div className="flex flex-col items-center pt-0.5 min-w-[44px]">
                        <span className="text-[10px] text-muted-foreground">
                          {formatDateShort(evt.date)}
                        </span>
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {evt.time}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold truncate">{evt.nameSq}</span>
                          <CategoryBadge category={evt.category} />
                          <ImportanceDots importance={evt.importance} />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                          {evt.descriptionSq}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0 min-w-[70px]">
                        {evt.previousValue !== '-' && (
                          <div className="flex flex-col">
                            <span className="text-[8px] text-muted-foreground">E mëparshme</span>
                            <span className="text-[10px] font-medium tabular-nums">{evt.previousValue}</span>
                          </div>
                        )}
                        {evt.forecastValue !== '-' && (
                          <div className="flex flex-col mt-1">
                            <span className="text-[8px] text-muted-foreground">Parashikimi</span>
                            <span className="text-[10px] font-bold text-blue-600 tabular-nums">{evt.forecastValue}</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Weekly Timeline */}
      <AnimatePresence mode="popLayout">
        {filteredWeeks.map((week, weekIdx) => (
          <motion.div
            key={week.weekStart}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: weekIdx * 0.06, duration: 0.3 }}
          >
            <Card className="border-border/50">
              <CardContent className="pt-4">
                {/* Week Header */}
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-xs font-semibold">
                    {formatWeekRange(week.weekStart, week.weekEnd)}
                  </span>
                  <Badge className="text-[9px] bg-blue-500/10 text-blue-600 border-blue-500/20 ml-auto">
                    {week.events.length} ngjarje
                  </Badge>
                </div>

                {/* Events List */}
                <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
                  {week.events.map((evt, i) => {
                    const config = CATEGORY_CONFIG[evt.category] || DEFAULT_CATEGORY;
                    const Icon = config.icon;
                    return (
                      <motion.div
                        key={evt.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className={`flex items-start gap-3 p-2.5 rounded-lg border transition-all hover:shadow-sm ${
                          evt.importance === 'HIGH'
                            ? 'border-red-500/15 bg-red-500/[0.02] hover:border-red-500/30'
                            : evt.importance === 'MEDIUM'
                              ? 'border-amber-500/10 hover:border-amber-500/20'
                              : 'border-border/50 hover:border-border bg-card/50'
                        }`}
                      >
                        {/* Icon + Date/Time */}
                        <div className="flex items-center gap-2 min-w-[90px] flex-shrink-0">
                          <div className={`w-8 h-8 rounded-lg ${config.bgColor} border ${config.borderColor} flex items-center justify-center flex-shrink-0`}>
                            <Icon className={`w-3.5 h-3.5 ${config.textColor}`} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-medium text-muted-foreground">
                              {formatDateShort(evt.date)}
                            </span>
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {evt.time} ET
                            </span>
                          </div>
                        </div>

                        {/* Event Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-semibold">{evt.nameSq}</span>
                            <ImportanceDots importance={evt.importance} />
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                            {evt.descriptionSq}
                          </p>
                        </div>

                        {/* Values */}
                        <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                          {evt.previousValue !== '-' && (
                            <div className="text-right">
                              <span className="text-[8px] text-muted-foreground block">E mëparshme</span>
                              <span className="text-[10px] font-medium tabular-nums">{evt.previousValue}</span>
                            </div>
                          )}
                          {evt.forecastValue !== '-' && (
                            <div className="text-right">
                              <span className="text-[8px] text-muted-foreground block">Parashikimi</span>
                              <span className="text-[10px] font-bold text-blue-600 tabular-nums">{evt.forecastValue}</span>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Empty state when no events match filters */}
      {filteredNext7Days.length === 0 && filteredWeeks.length === 0 && (
        <Card className="border-border/50">
          <CardContent className="py-8">
            <div className="text-center">
              <Calendar className="w-10 h-10 mx-auto mb-2 text-muted-foreground/20" />
              <p className="text-xs text-muted-foreground">
                Nuk ka ngjarje që përputhen me filtrot e zgjedhur
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActiveCategories(new Set(ALL_CATEGORIES));
                  setImportanceFilter('ALL');
                }}
                className="mt-2 text-[10px]"
              >
                Pastro filtrot
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Disclaimer */}
      <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-amber-600/80 leading-relaxed">
            Kalendar Ekonomik tregon ngjarjet makroekonomike që lëvizin tregjet. Koha është në ora lindore (ET).
            Vlerat janë parashikime dhe mund të ndryshohen. 3 pika = rëndësi e lartë (e kuqe), 2 = mesatare (e verdhë), 1 = e ulët ( gri).
          </p>
        </div>
      </div>
    </div>
  );
}
