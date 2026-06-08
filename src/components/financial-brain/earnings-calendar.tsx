'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
  Sun,
  Moon,
  Clock,
} from 'lucide-react';

interface EarningEntry {
  ticker: string;
  company: string;
  date: string;
  time: string;
  epsEstimate: number;
  epsActual: number | null;
}

interface EarningsData {
  earnings: EarningEntry[];
  byDate: Record<string, EarningEntry[]>;
  months: string[];
  totalEntries: number;
}

const MONTH_NAMES_SQ = [
  'Janar', 'Shkurt', 'Mars', 'Prill', 'Maj', 'Qershor',
  'Korrik', 'Gusht', 'Shtator', 'Tetor', 'Nëntor', 'Dhjetor',
];

const DAY_NAMES_SQ = ['Diel', 'Hën', 'Mar', 'Mër', 'Enj', 'Pre', 'Sht'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.getDate().toString();
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export function EarningsCalendar() {
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const res = await fetch('/api/earnings');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Gabim');
        return;
      }
      setData(json);
      // Default to first month
      if (json.months.length > 0) {
        setSelectedMonth(json.months[0]);
      }
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

  // Parse selected month
  const monthInfo = useMemo(() => {
    if (!selectedMonth) return null;
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr) - 1;
    return { year, month };
  }, [selectedMonth]);

  // Earnings for selected month
  const monthEarnings = useMemo(() => {
    if (!data || !selectedMonth) return [];
    return data.earnings.filter(e => e.date.startsWith(selectedMonth));
  }, [data, selectedMonth]);

  // Days with earnings in selected month
  const earningsDays = useMemo(() => {
    const days = new Set<number>();
    monthEarnings.forEach(e => {
      const day = parseInt(e.date.split('-')[2]);
      days.add(day);
    });
    return days;
  }, [monthEarnings]);

  // Earnings for selected date
  const selectedDateEarnings = useMemo(() => {
    if (!data || !selectedDate) return [];
    return data.byDate[selectedDate] || [];
  }, [data, selectedDate]);

  // Navigate months
  const navigateMonth = (direction: number) => {
    if (!data) return;
    const idx = data.months.indexOf(selectedMonth);
    const newIdx = idx + direction;
    if (newIdx >= 0 && newIdx < data.months.length) {
      setSelectedMonth(data.months[newIdx]);
      setSelectedDate(null);
    }
  };

  const selectDate = (day: number) => {
    if (!monthInfo) return;
    const dateStr = `${selectedMonth}-${day.toString().padStart(2, '0')}`;
    // Check if this day has earnings
    const dateEarnings = data?.byDate[dateStr];
    if (dateEarnings && dateEarnings.length > 0) {
      setSelectedDate(dateStr);
    } else {
      setSelectedDate(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[60px] rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-[350px] rounded-xl" />
          <Skeleton className="h-[350px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-500/20 bg-red-500/5">
        <CardContent className="flex items-center gap-2 py-4">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-sm text-red-400">{error}</span>
          <button onClick={fetchData} className="ml-auto text-xs text-red-500 hover:underline">Provo përsëri</button>
        </CardContent>
      </Card>
    );
  }

  if (!data || !monthInfo) return null;

  const daysInMonth = getDaysInMonth(monthInfo.year, monthInfo.month);
  const firstDay = getFirstDayOfMonth(monthInfo.year, monthInfo.month);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-blue-500" />
          <span className="text-xs text-muted-foreground">
            {data.totalEntries} raportime fitimesh
          </span>
        </div>
        <button
          onClick={fetchData}
          disabled={isRefreshing}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-blue-500 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          Rifresko
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Calendar Grid */}
        <Card className="border-border/50">
          <CardContent className="pt-4">
            {/* Month Navigator */}
            <div className="flex items-center justify-between mb-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigateMonth(-1)}
                disabled={data.months.indexOf(selectedMonth) === 0}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="text-center">
                <h3 className="text-sm font-bold">
                  {MONTH_NAMES_SQ[monthInfo.month]} {monthInfo.year}
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  {monthEarnings.length} raportime këtë muaj
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigateMonth(1)}
                disabled={data.months.indexOf(selectedMonth) === data.months.length - 1}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Day names */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAY_NAMES_SQ.map(day => (
                <div key={day} className="text-center text-[10px] font-semibold text-muted-foreground py-1">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells for days before month start */}
              {Array.from({ length: firstDay }, (_, i) => (
                <div key={`empty-${i}`} className="h-10" />
              ))}

              {/* Day cells */}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const dateStr = `${selectedMonth}-${day.toString().padStart(2, '0')}`;
                const hasEarnings = earningsDays.has(day);
                const isSelected = selectedDate === dateStr;
                const dateEarnings = data.byDate[dateStr];
                const today = new Date();
                const isToday = today.getFullYear() === monthInfo.year && today.getMonth() === monthInfo.month && today.getDate() === day;

                return (
                  <button
                    key={day}
                    onClick={() => selectDate(day)}
                    className={`h-10 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all text-xs relative ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-md'
                        : isToday
                        ? 'bg-blue-500/10 border border-blue-500/30 text-blue-600 font-bold'
                        : hasEarnings
                        ? 'bg-emerald-500/10 hover:bg-emerald-500/20 cursor-pointer font-medium'
                        : 'text-muted-foreground/50 cursor-default'
                    }`}
                  >
                    {day}
                    {hasEarnings && !isSelected && (
                      <div className="flex gap-0.5">
                        {dateEarnings && dateEarnings.slice(0, 3).map(e => (
                          <div
                            key={e.ticker}
                            className={`w-1 h-1 rounded-full ${
                              e.time === 'BMO' ? 'bg-emerald-500' : 'bg-violet-500'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50">
              <div className="flex items-center gap-1.5">
                <Sun className="w-3 h-3 text-emerald-500" />
                <span className="text-[10px] text-muted-foreground">Përpara hapjes (BMO)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Moon className="w-3 h-3 text-violet-500" />
                <span className="text-[10px] text-muted-foreground">Pas mbylljes (AMC)</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Earnings List */}
        <Card className="border-border/50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-semibold">
                  {selectedDate
                    ? `Fitime: ${selectedDate}`
                    : `Fitime — ${MONTH_NAMES_SQ[monthInfo.month]} ${monthInfo.year}`
                  }
                </h3>
              </div>
              {selectedDate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedDate(null)}
                  className="text-[10px] h-6"
                >
                  Shiko të gjitha
                </Button>
              )}
            </div>

            <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
              <AnimatePresence mode="popLayout">
                {(selectedDate ? selectedDateEarnings : monthEarnings)
                  .sort((a, b) => {
                    // Sort by date, then by time (BMO first)
                    if (a.date !== b.date) return a.date.localeCompare(b.date);
                    return a.time === 'BMO' ? -1 : 1;
                  })
                  .map((entry, i) => (
                    <motion.div
                      key={`${entry.ticker}-${entry.date}`}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className={`flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer hover:shadow-sm ${
                        selectedDate === entry.date
                          ? 'border-blue-500/30 bg-blue-500/5'
                          : 'border-border/50 hover:border-border bg-card/50'
                      }`}
                      onClick={() => setSelectedDate(entry.date)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold">{entry.ticker}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{entry.company}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">
                              {entry.date.slice(5)}
                            </span>
                            <Badge
                              className={`text-[8px] px-1.5 py-0 h-4 ${
                                entry.time === 'BMO'
                                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                  : 'bg-violet-500/10 text-violet-600 border-violet-500/20'
                              }`}
                            >
                              {entry.time === 'BMO' ? (
                                <span className="flex items-center gap-0.5">
                                  <Sun className="w-2.5 h-2.5" />
                                  BMO
                                </span>
                              ) : (
                                <span className="flex items-center gap-0.5">
                                  <Moon className="w-2.5 h-2.5" />
                                  AMC
                                </span>
                              )}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="text-[9px] text-muted-foreground">EPS Est.</p>
                        <p className={`text-xs font-bold tabular-nums ${
                          entry.epsEstimate < 0 ? 'text-red-500' : 'text-foreground'
                        }`}>
                          ${entry.epsEstimate.toFixed(2)}
                        </p>
                      </div>
                    </motion.div>
                  ))}
              </AnimatePresence>
            </div>

            {/* Empty state */}
            {(selectedDate ? selectedDateEarnings : monthEarnings).length === 0 && (
              <div className="text-center py-8">
                <CalendarDays className="w-10 h-10 mx-auto mb-2 text-muted-foreground/20" />
                <p className="text-xs text-muted-foreground">Nuk ka raportime fitimesh</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Disclaimer */}
      <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-amber-600/80 leading-relaxed">
            Kalendar i Fitimeve tregon datat e raportimit të ardhurave për kompanitë kryesore.
            BMO = Before Market Open (para hapjes), AMC = After Market Close (pas mbylljes).
            EPS = Fitimi për aksion. Datat janë parashikime dhe mund të ndryshohen.
          </p>
        </div>
      </div>
    </div>
  );
}
