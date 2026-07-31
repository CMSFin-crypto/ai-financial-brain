// ============================================================
// Event Calendar — centralized source of upcoming market events.
//
// Unlike the simple heuristic in event-risk.ts, this module
// provides a structured, queryable calendar of:
//   - Earnings dates (per symbol, when known)
//   - Macro events (FOMC, CPI, NFP, GDP, PPI, PMI, etc.)
//   - Custom risk windows
//
// The calendar is consumed by event-risk-engine.ts to produce
// trade restriction decisions.
// ============================================================

// ─── Types ────────────────────────────────────────────────────

export type EventCategory =
  | 'EARNINGS'
  | 'FOMC'
  | 'CPI'
  | 'EMPLOYMENT'
  | 'GDP'
  | 'PPI'
  | 'PMI'
  | 'RETAIL'
  | 'CONSUMER'
  | 'HOUSING'
  | 'MANUFACTURING'
  | 'TREASURY'
  | 'GEOPOLITICAL'
  | 'OTHER';

export type EventImportance = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type CalendarEvent = {
  id: string;
  title: string;
  category: EventCategory;
  importance: EventImportance;
  eventDate: Date;
  eventTime: string;       // HH:MM in ET, or 'TBD'
  symbol: string | null;    // null = macro, non-null = ticker-specific
  description: string;
  source: string;          // 'system' | 'manual' | 'api'
};

export type EventWindow = {
  eventId: string;
  event: CalendarEvent;
  noTradeStart: Date;      // when NO_TRADE kicks in
  noTradeEnd: Date;        // when NO_TRADE lifts
  sizeReductionStart: Date; // when SIZE_REDUCTION starts (wider window)
  sizeReductionEnd: Date;
  restrictionLevel: 'NONE' | 'SIZE_REDUCTION' | 'NO_NEW_ENTRIES' | 'NO_TRADE';
};

export type CalendarQuery = {
  symbol?: string;         // filter to a specific ticker
  category?: EventCategory;
  importance?: EventImportance;
  from?: Date;
  to?: Date;
  includePast?: boolean;  // default false
};

// ─── FOMC Dates ────────────────────────────────────────────────

const FOMC_DATES: Record<number, string[]> = {
  2025: ['2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18',
         '2025-07-30', '2025-09-17', '2025-11-05', '2025-12-17'],
  2026: ['2026-01-28', '2026-03-18', '2026-05-06', '2026-06-17',
         '2026-07-29', '2026-09-16', '2026-11-04', '2026-12-16'],
  2027: ['2027-01-27', '2027-03-17', '2027-05-05', '2027-06-16',
         '2027-07-28', '2027-09-15', '2027-11-03', '2027-12-15'],
};

function getFomcDates(year: number): string[] {
  return FOMC_DATES[year] || FOMC_DATES[2026];
}

// ─── Recurring Macro Events ───────────────────────────────────
// These are deterministic approximations. In production, you'd
// pull from an economic calendar API. This ensures the system
// always has SOME event awareness even without external APIs.

type RecurringEventTemplate = {
  title: string;
  category: EventCategory;
  importance: EventImportance;
  time: string;
  weekOfMonth: number;   // 1-5, or 0 for 'last'
  dayOfWeek: number;     // 0=Sun, 1=Mon, ..., 6=Sat
  months: number[];      // 0-11
  description: string;
};

const RECURRING_EVENTS: RecurringEventTemplate[] = [
  {
    title: 'Non-Farm Payrolls',
    category: 'EMPLOYMENT',
    importance: 'CRITICAL',
    time: '08:30',
    weekOfMonth: 1,
    dayOfWeek: 5, // Friday
    months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    description: 'NFP — the single most market-moving regular event',
  },
  {
    title: 'CPI Report',
    category: 'CPI',
    importance: 'CRITICAL',
    time: '08:30',
    weekOfMonth: 2,
    dayOfWeek: 3, // Wednesday
    months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    description: 'Consumer Price Index — primary inflation gauge',
  },
  {
    title: 'PPI Report',
    category: 'PPI',
    importance: 'HIGH',
    time: '08:30',
    weekOfMonth: 2,
    dayOfWeek: 5, // Friday
    months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    description: 'Producer Price Index — wholesale inflation',
  },
  {
    title: 'GDP (Advance)',
    category: 'GDP',
    importance: 'CRITICAL',
    time: '08:30',
    weekOfMonth: 4,
    dayOfWeek: 4, // Thursday
    months: [0, 3, 6, 9], // quarterly
    description: 'Advance GDP estimate — broadest economic measure',
  },
  {
    title: 'Retail Sales',
    category: 'RETAIL',
    importance: 'HIGH',
    time: '08:30',
    weekOfMonth: 2,
    dayOfWeek: 1, // Monday
    months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    description: 'Consumer spending — 70% of GDP',
  },
  {
    title: 'ISM Manufacturing PMI',
    category: 'PMI',
    importance: 'HIGH',
    time: '10:00',
    weekOfMonth: 1,
    dayOfWeek: 1, // Monday
    months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    description: 'Manufacturing PMI — industrial health gauge',
  },
  {
    title: 'ISM Services PMI',
    category: 'PMI',
    importance: 'HIGH',
    time: '10:00',
    weekOfMonth: 2,
    dayOfWeek: 1, // Monday
    months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    description: 'Services PMI — 70% of economy',
  },
  {
    title: 'Consumer Confidence',
    category: 'CONSUMER',
    importance: 'MEDIUM',
    time: '10:00',
    weekOfMonth: 0, // last
    dayOfWeek: 2, // Tuesday
    months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    description: 'Conference Board consumer confidence',
  },
  {
    title: 'Jobless Claims',
    category: 'EMPLOYMENT',
    importance: 'MEDIUM',
    time: '08:30',
    weekOfMonth: 1,
    dayOfWeek: 4, // Thursday
    months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    description: 'Weekly initial jobless claims',
  },
];

// ─── Helpers ──────────────────────────────────────────────────

function getNthWeekdayOfMonth(year: number, month: number, week: number, day: number): Date {
  const first = new Date(year, month, 1);
  const firstDay = first.getDay();
  if (week === 0) {
    // Last occurrence
    const last = new Date(year, month + 1, 0);
    const lastDay = last.getDay();
    const d = last.getDate() - ((lastDay - day + 7) % 7);
    return new Date(year, month, d);
  }
  const d = 1 + ((day - firstDay + 7) % 7) + (week - 1) * 7;
  return new Date(year, month, d);
}

function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function makeEventId(category: string, date: string, suffix?: string): string {
  return `evt-${category}-${date}${suffix ? `-${suffix}` : ''}`;
}

// ─── Core: Build Calendar ────────────────────────────────────

/**
 * Build the event calendar for a date range.
 * Returns all events (macro + symbol-specific earnings if provided).
 */
export function buildCalendar(
  from: Date,
  to: Date,
  options?: {
    earningsDates?: Record<string, string>; // symbol -> YYYY-MM-DD
  } ,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const now = new Date();

  // 1. FOMC meetings
  for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
    for (const dateStr of getFomcDates(y)) {
      const evtDate = new Date(dateStr + 'T14:00:00');
      if (evtDate >= from && evtDate <= to) {
        events.push({
          id: makeEventId('fomc', dateStr),
          title: 'FOMC Interest Rate Decision',
          category: 'FOMC',
          importance: 'CRITICAL',
          eventDate: evtDate,
          eventTime: '14:00',
          symbol: null,
          description: 'Federal Reserve rate decision + press conference',
          source: 'system',
        });
        // Press conference 30 min later
        events.push({
          id: makeEventId('fomc', dateStr, 'press'),
          title: 'FOMC Press Conference',
          category: 'FOMC',
          importance: 'HIGH',
          eventDate: evtDate,
          eventTime: '14:30',
          symbol: null,
          description: 'Fed Chair press conference',
          source: 'system',
        });
      }
    }
  }

  // 2. Recurring macro events
  for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
    const maxMonth = y === to.getFullYear() ? to.getMonth() : 11;
    const minMonth = y === from.getFullYear() ? from.getMonth() : 0;

    for (const tmpl of RECURRING_EVENTS) {
      for (const m of tmpl.months) {
        if (y === from.getFullYear() && m < minMonth) continue;
        if (y === to.getFullYear() && m > maxMonth) continue;

        const evtDate = getNthWeekdayOfMonth(y, m, tmpl.weekOfMonth, tmpl.dayOfWeek);
        evtDate.setHours(8, 0, 0, 0);

        // Parse time
        const [hh, mm] = tmpl.time.split(':').map(Number);
        evtDate.setHours(hh, mm, 0, 0);

        events.push({
          id: makeEventId(tmpl.category.toLowerCase(), fmtDate(evtDate)),
          title: tmpl.title,
          category: tmpl.category,
          importance: tmpl.importance,
          eventDate: evtDate,
          eventTime: tmpl.time,
          symbol: null,
          description: tmpl.description,
          source: 'system',
        });
      }
    }
  }

  // 3. Symbol-specific earnings
  if (options?.earningsDates) {
    for (const [symbol, dateStr] of Object.entries(options.earningsDates)) {
      const evtDate = new Date(dateStr + 'T09:30:00');
      if (evtDate >= from && evtDate <= to) {
        events.push({
          id: makeEventId('earnings', dateStr, symbol.toLowerCase()),
          title: `${symbol} Earnings`,
          category: 'EARNINGS',
          importance: 'HIGH',
          eventDate: evtDate,
          eventTime: 'TBD',
          symbol,
          description: `Quarterly earnings report for ${symbol}`,
          source: 'manual',
        });
      }
    }
  }

  // 4. Earnings season heuristic (if no specific dates)
  // Earnings seasons: mid-Jan to mid-Feb, mid-Apr to mid-May,
  //                   mid-Jul to mid-Aug, mid-Oct to mid-Nov
  if (!options?.earningsDates) {
    const earningsSeasons = [
      { startMonth: 0, startDay: 10, endMonth: 1, endDay: 15 },
      { startMonth: 3, startDay: 10, endMonth: 4, endDay: 15 },
      { startMonth: 6, startDay: 10, endMonth: 7, endDay: 15 },
      { startMonth: 9, startDay: 10, endMonth: 10, endDay: 15 },
    ];

    for (const season of earningsSeasons) {
      const sStart = new Date(now.getFullYear(), season.startMonth, season.startDay);
      const sEnd = new Date(now.getFullYear(), season.endMonth, season.endDay);

      if (sStart <= to && sEnd >= from) {
        // Don't add a specific event, but this info is used by
        // the event-risk-engine for generic caution
      }
    }
  }

  // Sort by date, then time
  events.sort((a, b) => {
    const dc = a.eventDate.getTime() - b.eventDate.getTime();
    if (dc !== 0) return dc;
    return a.eventTime.localeCompare(b.eventTime);
  });

  // Deduplicate by id
  const seen = new Set<string>();
  return events.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

/**
 * Query the calendar with filters.
 */
export function queryCalendar(
  events: CalendarEvent[],
  query: CalendarQuery,
): CalendarEvent[] {
  const now = new Date();

  return events.filter(e => {
    // Symbol filter
    if (query.symbol && e.symbol && e.symbol !== query.symbol) return false;
    if (query.symbol && !e.symbol && e.category !== 'EARNINGS') {
      // Macro events apply to all symbols — include them
    }

    // Category filter
    if (query.category && e.category !== query.category) return false;

    // Importance filter
    if (query.importance) {
      const levels: EventImportance[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      if (levels.indexOf(e.importance) < levels.indexOf(query.importance)) return false;
    }

    // Date range
    if (query.from && e.eventDate < query.from) return false;
    if (query.to && e.eventDate > query.to) return false;

    // Exclude past events unless requested
    if (!query.includePast && e.eventDate < now) return false;

    return true;
  });
}

/**
 * Get upcoming events for a specific symbol (earnings) + all macro.
 */
export function getUpcomingEvents(
  symbol: string,
  daysAhead = 14,
  knownEarningsDate?: string,
): CalendarEvent[] {
  const from = new Date();
  const to = new Date(Date.now() + daysAhead * 86400000);

  const earningsDates: Record<string, string> = {};
  if (knownEarningsDate) {
    earningsDates[symbol] = knownEarningsDate;
  }

  const all = buildCalendar(from, to, { earningsDates });
  return queryCalendar(all, { symbol, from, to });
}

/**
 * Check if we're currently in earnings season.
 */
export function isInEarningsSeason(): boolean {
  const now = new Date();
  const m = now.getMonth();
  const d = now.getDate();
  const seasons = [
    { sm: 0, sd: 10, em: 1, ed: 15 },
    { sm: 3, sd: 10, em: 4, ed: 15 },
    { sm: 6, sd: 10, em: 7, ed: 15 },
    { sm: 9, sd: 10, em: 10, ed: 15 },
  ];
  return seasons.some(s => {
    const start = new Date(now.getFullYear(), s.sm, s.sd);
    const end = new Date(now.getFullYear(), s.em, s.ed);
    return now >= start && now <= end;
  });
}
