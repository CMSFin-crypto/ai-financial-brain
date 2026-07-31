// ============================================================
// Event-Risk Engine — converts calendar events into trade restrictions.
//
// The engine takes calendar events and produces concrete actions:
//   - NO_TRADE:            Block all trades for a symbol/time window
//   - NO_NEW_ENTRIES:      Allow exits but no new positions
//   - SIZE_REDUCTION:      Reduce position size by a multiplier
//   - NONE:                No restriction
//
// Rules (configurable):
//   - 24h NO_TRADE before individual earnings
//   - SIZE x0.5 before major macro events (FOMC, CPI, NFP, GDP)
//   - NO_NEW_ENTRIES 30-60 min before and 15 min after macro events
//   - Earnings season generic caution
// ============================================================

import {
  type CalendarEvent,
  type EventWindow,
  type EventImportance,
  type EventCategory,
  getUpcomingEvents,
  isInEarningsSeason,
} from './event-calendar';

// ─── Types ────────────────────────────────────────────────────

export type RestrictionLevel = 'NONE' | 'SIZE_REDUCTION' | 'NO_NEW_ENTRIES' | 'NO_TRADE';

export type TradeRestriction = {
  symbol: string;
  level: RestrictionLevel;
  reason: string;
  affectedEvents: string[];   // event titles causing restriction
  sizeMultiplier: number;     // 1.0 = full, 0.5 = half
  liftTime: Date | null;      // when restriction lifts
  expiresAt: Date;            // absolute expiry
};

export type EventRiskAssessment = {
  symbol: string;
  restriction: TradeRestriction;
  upcomingEvents: CalendarEvent[];
  activeWindows: EventWindow[];
  earningsSeasonCaution: boolean;
  assessedAt: string;
};

export type EventRiskConfig = {
  // Earnings
  earningsNoTradeHoursBefore?: number;    // default 24
  earningsNoTradeHoursAfter?: number;     // default 4

  // Macro events
  macroNoNewEntriesMinutesBefore?: number; // default 60
  macroNoNewEntriesMinutesAfter?: number;  // default 15
  macroSizeReductionHoursBefore?: number;  // default 12
  macroSizeReductionMultiplier?: number;   // default 0.5

  // Categories considered "major macro"
  majorMacroCategories?: EventCategory[];

  // Look-ahead window
  lookAheadDays?: number;  // default 14
};

const DEFAULT_CONFIG: Required<EventRiskConfig> = {
  earningsNoTradeHoursBefore: 24,
  earningsNoTradeHoursAfter: 4,
  macroNoNewEntriesMinutesBefore: 60,
  macroNoNewEntriesMinutesAfter: 15,
  macroSizeReductionHoursBefore: 12,
  macroSizeReductionMultiplier: 0.5,
  majorMacroCategories: ['FOMC', 'CPI', 'EMPLOYMENT', 'GDP'],
  lookAheadDays: 14,
};

// ─── Helpers ──────────────────────────────────────────────────

function hoursToMs(h: number): number { return h * 3600000; }
function minutesToMs(m: number): number { return m * 60000; }

function restrictionPriority(level: RestrictionLevel): number {
  switch (level) {
    case 'NO_TRADE': return 4;
    case 'NO_NEW_ENTRIES': return 3;
    case 'SIZE_REDUCTION': return 2;
    case 'NONE': return 0;
  }
}

function importanceToNumber(imp: EventImportance): number {
  switch (imp) {
    case 'CRITICAL': return 4;
    case 'HIGH': return 3;
    case 'MEDIUM': return 2;
    case 'LOW': return 1;
  }
}

// ─── Core: Compute Event Windows ──────────────────────────────

/**
 * Convert a calendar event into one or more restriction windows.
 */
function computeEventWindows(
  event: CalendarEvent,
  config: Required<EventRiskConfig>,
): EventWindow[] {
  const now = new Date();
  const windows: EventWindow[] = [];
  const evtTime = event.eventTime === 'TBD'
    ? new Date(event.eventDate.getTime() + hoursToMs(4)) // assume pre-market
    : (() => {
        const [h, m] = event.eventTime.split(':').map(Number);
        const d = new Date(event.eventDate);
        d.setHours(h, m, 0, 0);
        return d;
      })();

  if (event.category === 'EARNINGS' && event.symbol) {
    // Individual earnings: NO_TRADE window
    const noTradeStart = new Date(evtTime.getTime() - hoursToMs(config.earningsNoTradeHoursBefore));
    const noTradeEnd = new Date(evtTime.getTime() + hoursToMs(config.earningsNoTradeHoursAfter));

    // Only include if window overlaps with now or future
    if (noTradeEnd > now) {
      windows.push({
        eventId: event.id,
        event,
        noTradeStart,
        noTradeEnd,
        sizeReductionStart: new Date(noTradeStart.getTime() - hoursToMs(12)),
        sizeReductionEnd: noTradeEnd,
        restrictionLevel: 'NO_TRADE',
      });
    }
  } else if (event.symbol === null && config.majorMacroCategories.includes(event.category)) {
    // Major macro event: NO_NEW_ENTRIES + SIZE_REDUCTION
    const noNewEntriesStart = new Date(evtTime.getTime() - minutesToMs(config.macroNoNewEntriesMinutesBefore));
    const noNewEntriesEnd = new Date(evtTime.getTime() + minutesToMs(config.macroNoNewEntriesMinutesAfter));
    const sizeReductionStart = new Date(evtTime.getTime() - hoursToMs(config.macroSizeReductionHoursBefore));
    const sizeReductionEnd = new Date(evtTime.getTime() + hoursToMs(2)); // 2h after for settling

    if (sizeReductionEnd > now) {
      windows.push({
        eventId: event.id,
        event,
        noTradeStart: new Date(0),    // macro doesn't trigger full NO_TRADE
        noTradeEnd: new Date(0),
        sizeReductionStart,
        sizeReductionEnd,
        restrictionLevel: 'SIZE_REDUCTION',
      });

      // Tighter window around the actual event
      if (noNewEntriesEnd > now) {
        windows.push({
          eventId: event.id,
          event,
          noTradeStart: noNewEntriesStart,
          noTradeEnd: noNewEntriesEnd,
          sizeReductionStart: noNewEntriesStart,
          sizeReductionEnd: noNewEntriesEnd,
          restrictionLevel: 'NO_NEW_ENTRIES',
        });
      }
    }
  } else if (event.symbol === null && importanceToNumber(event.importance) >= 2) {
    // Medium+ macro events: just SIZE_REDUCTION with a smaller window
    const sizeReductionStart = new Date(evtTime.getTime() - hoursToMs(4));
    const sizeReductionEnd = new Date(evtTime.getTime() + hoursToMs(1));

    if (sizeReductionEnd > now) {
      windows.push({
        eventId: event.id,
        event,
        noTradeStart: new Date(0),
        noTradeEnd: new Date(0),
        sizeReductionStart,
        sizeReductionEnd,
        restrictionLevel: 'SIZE_REDUCTION',
      });
    }
  }

  return windows;
}

// ─── Core: Assess Event Risk ─────────────────────────────────

/**
 * Assess event risk for a specific symbol.
 * Returns the most restrictive active restriction + all upcoming events.
 */
export function assessEventRisk(
  symbol: string,
  config?: EventRiskConfig,
  knownEarningsDate?: string,
): EventRiskAssessment {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const now = new Date();

  // 1. Get upcoming events
  const upcoming = getUpcomingEvents(symbol, cfg.lookAheadDays, knownEarningsDate);

  // 2. Compute restriction windows for all events
  const allWindows: EventWindow[] = [];
  for (const evt of upcoming) {
    allWindows.push(...computeEventWindows(evt, cfg));
  }

  // 3. Find active restrictions (windows that contain NOW)
  const activeWindows = allWindows.filter(w => {
    if (w.restrictionLevel === 'SIZE_REDUCTION') {
      return now >= w.sizeReductionStart && now <= w.sizeReductionEnd;
    }
    if (w.restrictionLevel === 'NO_NEW_ENTRIES') {
      return now >= w.noTradeStart && now <= w.noTradeEnd;
    }
    if (w.restrictionLevel === 'NO_TRADE') {
      return now >= w.noTradeStart && now <= w.noTradeEnd;
    }
    return false;
  });

  // 4. Determine the most restrictive level
  let bestLevel: RestrictionLevel = 'NONE';
  let bestReason = 'No active event restrictions';
  let affectedEvents: string[] = [];
  let sizeMultiplier = 1.0;
  let liftTime: Date | null = null;

  for (const w of activeWindows) {
    const rp = restrictionPriority(w.restrictionLevel);
    if (rp > restrictionPriority(bestLevel)) {
      bestLevel = w.restrictionLevel;
      bestReason = `${w.event.title} (${w.restrictionLevel})`;
      affectedEvents = [w.event.title];

      if (w.restrictionLevel === 'NO_TRADE') {
        sizeMultiplier = 0;
        liftTime = w.noTradeEnd;
      } else if (w.restrictionLevel === 'NO_NEW_ENTRIES') {
        sizeMultiplier = 0;
        liftTime = w.noTradeEnd;
      } else if (w.restrictionLevel === 'SIZE_REDUCTION') {
        sizeMultiplier = Math.min(sizeMultiplier, cfg.macroSizeReductionMultiplier);
        liftTime = liftTime
          ? (w.sizeReductionEnd.getTime() < liftTime.getTime() ? w.sizeReductionEnd : liftTime)
          : w.sizeReductionEnd;
      }
    } else if (rp === restrictionPriority(bestLevel) && rp > 0) {
      affectedEvents.push(w.event.title);
      if (w.restrictionLevel === 'SIZE_REDUCTION') {
        sizeMultiplier = Math.min(sizeMultiplier, cfg.macroSizeReductionMultiplier);
      }
    }
  }

  // 5. Earnings season caution (reduces multiplier by 0.1)
  const earningsSeason = isInEarningsSeason();
  if (earningsSeason && sizeMultiplier > 0) {
    sizeMultiplier = Math.max(0.5, sizeMultiplier - 0.1);
  }

  // Build expiry: max of all window end times, or 1 hour from now
  const allEnds = allWindows.map(w => {
    if (w.restrictionLevel === 'NO_TRADE' || w.restrictionLevel === 'NO_NEW_ENTRIES') return w.noTradeEnd;
    return w.sizeReductionEnd;
  }).filter(d => d > now);

  const expiresAt = allEnds.length > 0
    ? new Date(Math.max(...allEnds.map(d => d.getTime())))
    : new Date(now.getTime() + 3600000);

  return {
    symbol,
    restriction: {
      symbol,
      level: bestLevel,
      reason: bestReason,
      affectedEvents,
      sizeMultiplier: Math.round(sizeMultiplier * 100) / 100,
      liftTime,
      expiresAt,
    },
    upcomingEvents: upcoming.slice(0, 20), // limit for response size
    activeWindows: activeWindows.slice(0, 10),
    earningsSeasonCaution: earningsSeason,
    assessedAt: now.toISOString(),
  };
}

/**
 * Batch assess event risk for multiple symbols.
 */
export function batchAssessEventRisk(
  symbols: string[],
  earningsDates?: Record<string, string>,
  config?: EventRiskConfig,
): EventRiskAssessment[] {
  return symbols.map(s =>
    assessEventRisk(s, config, earningsDates?.[s])
  );
}

/**
 * Quick check: can we enter a new trade for this symbol?
 */
export function canEnterTrade(
  symbol: string,
  config?: EventRiskConfig,
  knownEarningsDate?: string,
): { allowed: boolean; reason: string; sizeMultiplier: number } {
  const assessment = assessEventRisk(symbol, config, knownEarningsDate);
  const r = assessment.restriction;

  if (r.level === 'NO_TRADE') {
    return { allowed: false, reason: r.reason, sizeMultiplier: 0 };
  }
  if (r.level === 'NO_NEW_ENTRIES') {
    return { allowed: false, reason: r.reason, sizeMultiplier: 0 };
  }
  if (r.level === 'SIZE_REDUCTION') {
    return {
      allowed: true,
      reason: `Size reduced to ${(r.sizeMultiplier * 100).toFixed(0)}% due to: ${r.affectedEvents.join(', ')}`,
      sizeMultiplier: r.sizeMultiplier,
    };
  }
  return { allowed: true, reason: 'No event restrictions', sizeMultiplier: 1.0 };
}
