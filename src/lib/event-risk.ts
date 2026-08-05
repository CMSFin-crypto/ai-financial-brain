// ============================================================
// Event Risk Detector v2
// Checks for earnings, FOMC, CPI, NFP, geopolitical events
// Returns multiple events (not just the worst) for full attribution
// ============================================================

export type EventSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface EventRiskResult {
  eventType: 'earnings' | 'fed' | 'cpi' | 'nfp' | 'geopolitical' | 'sector_news' | 'company_catalyst' | 'none';
  severity: EventSeverity;
  daysUntil: number | null;
  description: string;
  riskScore: number; // 0 to -100 (penalty)
}

export interface MultiEventRiskResult {
  events: EventRiskResult[];
  worstEvent: EventRiskResult;
  compositeRiskScore: number; // worst riskScore (most negative)
  hasCriticalEvent: boolean;
  summary: string; // Albanian summary for dashboard
}

// ─── Event calendars ───────────────────────────────────────

// FOMC meeting dates (8 per year, typically Wed-Thu)
const FOMC_DATES_2025 = [
  '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18',
  '2025-07-30', '2025-09-17', '2025-11-05', '2025-12-17',
];
const FOMC_DATES_2026 = [
  '2026-01-28', '2026-03-18', '2026-05-06', '2026-06-17',
  '2026-07-29', '2026-09-16', '2026-11-04', '2026-12-16',
];

// CPI release dates (BLS, typically Tuesday 8:30am ET, monthly)
const CPI_DATES_2025 = [
  '2025-01-15', '2025-02-13', '2025-03-12', '2025-04-10',
  '2025-05-13', '2025-06-11', '2025-07-11', '2025-08-13',
  '2025-09-10', '2025-10-15', '2025-11-13', '2025-12-11',
];
const CPI_DATES_2026 = [
  '2026-01-14', '2026-02-12', '2026-03-11', '2026-04-14',
  '2026-05-13', '2026-06-10', '2026-07-14', '2026-08-12',
  '2026-09-10', '2026-10-14', '2026-11-11', '2026-12-10',
];

// NFP (Non-Farm Payrolls) release dates (first Friday of each month)
function getNfpDates(year: number): string[] {
  const dates: string[] = [];
  for (let month = 0; month < 12; month++) {
    // First Friday of the month
    const firstDay = new Date(year, month, 1);
    const dayOfWeek = firstDay.getDay();
    const firstFridayOffset = dayOfWeek <= 5 ? (5 - dayOfWeek) : (12 - dayOfWeek);
    const firstFriday = new Date(year, month, 1 + firstFridayOffset);
    dates.push(firstFriday.toISOString().split('T')[0]);
  }
  return dates;
}

// ─── Helpers ────────────────────────────────────────────────

function getFomcDates(): string[] {
  const year = new Date().getFullYear();
  return year >= 2026 ? FOMC_DATES_2026 : FOMC_DATES_2025;
}

function getCpiDates(): string[] {
  const year = new Date().getFullYear();
  return year >= 2026 ? CPI_DATES_2026 : CPI_DATES_2025;
}

function daysBetween(dateStr: string, refDate: Date): number {
  const target = new Date(dateStr + 'T12:00:00Z');
  return Math.ceil((target.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));
}

function daysToNextThursday(): number {
  const now = new Date();
  const day = now.getDay();
  return (4 - day + 7) % 7 || 7;
}

function findNearest(dates: string[], refDate: Date, windowDays: number): { daysUntil: number; dateStr: string } | null {
  let nearest: { daysUntil: number; dateStr: string } | null = null;
  for (const d of dates) {
    const daysUntil = daysBetween(d, refDate);
    if (daysUntil >= -1 && daysUntil <= windowDays) {
      if (!nearest || Math.abs(daysUntil) < Math.abs(nearest.daysUntil)) {
        nearest = { daysUntil: Math.max(0, daysUntil), dateStr: d };
      }
    }
  }
  return nearest;
}

// ─── Single-event checker (backward compat) ───────────────

/**
 * @deprecated Use checkMultiEventRisk() instead for full attribution.
 */
export function checkEventRisk(
  ticker: string,
  knownEarningsDate?: string,
): EventRiskResult {
  const multi = checkMultiEventRisk(ticker, knownEarningsDate);
  return multi.worstEvent;
}

// ─── Multi-event checker ───────────────────────────────────

/**
 * Check for all event risks around the current date.
 * Returns multiple events for full attribution in prediction factors.
 */
export function checkMultiEventRisk(
  ticker: string,
  knownEarningsDate?: string,
): MultiEventRiskResult {
  const now = new Date();
  const events: EventRiskResult[] = [];

  // ── 1. Earnings ──
  if (knownEarningsDate) {
    const daysUntilEarnings = daysBetween(knownEarningsDate, now);
    if (daysUntilEarnings >= -1 && daysUntilEarnings <= 3) {
      const severity: EventSeverity = Math.abs(daysUntilEarnings) <= 1 ? 'CRITICAL' : 'HIGH';
      events.push({
        eventType: 'earnings',
        severity,
        daysUntil: Math.max(0, daysUntilEarnings),
        description: daysUntilEarnings <= 0
          ? `Fitimet për ${ticker} janë sot ose kaluan`
          : `Fitimet për ${ticker} në ${daysUntilEarnings} ditë`,
        riskScore: severity === 'CRITICAL' ? -80 : -50,
      });
    }
  } else {
    // Heuristic: earnings season is roughly weeks 1-3 of Jan, Apr, Jul, Oct
    const month = now.getMonth();
    const weekOfMonth = Math.ceil(now.getDate() / 7);
    const earningsMonths = [0, 3, 6, 9];
    if (earningsMonths.includes(month) && weekOfMonth <= 3) {
      const daysToThurs = daysToNextThursday();
      if (daysToThurs <= 2) {
        events.push({
          eventType: 'earnings',
          severity: 'MEDIUM',
          daysUntil: daysToThurs,
          description: `Mund të jetë sezoni i fitimeve — ${ticker} mund të raportojë së shpejti`,
          riskScore: -25,
        });
      }
    }
  }

  // ── 2. FOMC / Fed ──
  const fomcNearest = findNearest(getFomcDates(), now, 2);
  if (fomcNearest) {
    const severity: EventSeverity = fomcNearest.daysUntil === 0 ? 'CRITICAL' : 'HIGH';
    events.push({
      eventType: 'fed',
      severity,
      daysUntil: fomcNearest.daysUntil,
      description: fomcNearest.daysUntil === 0
        ? 'FOMC vendim sot — ul besimin ose jep NO_TRADE'
        : `FOMC vendim në ${fomcNearest.daysUntil} ditë`,
      riskScore: severity === 'CRITICAL' ? -70 : -40,
    });
  }

  // ── 3. CPI ──
  const cpiNearest = findNearest(getCpiDates(), now, 2);
  if (cpiNearest) {
    const severity: EventSeverity = cpiNearest.daysUntil === 0 ? 'HIGH' : 'MEDIUM';
    events.push({
      eventType: 'cpi',
      severity,
      daysUntil: cpiNearest.daysUntil,
      description: cpiNearest.daysUntil === 0
        ? 'CPI lëshohet sot — vullneti i lartë'
        : `CPI në ${cpiNearest.daysUntil} ditë`,
      riskScore: severity === 'HIGH' ? -45 : -20,
    });
  }

  // ── 4. NFP (Non-Farm Payrolls) ──
  const nfpDates = getNfpDates(now.getFullYear());
  const nfpNearest = findNearest(nfpDates, now, 2);
  if (nfpNearest) {
    const severity: EventSeverity = nfpNearest.daysUntil === 0 ? 'HIGH' : 'MEDIUM';
    events.push({
      eventType: 'nfp',
      severity,
      daysUntil: nfpNearest.daysUntil,
      description: nfpNearest.daysUntil === 0
        ? 'NFP lëshohet sot — rrezik volatiliteti'
        : `NFP në ${nfpNearest.daysUntil} ditë`,
      riskScore: severity === 'HIGH' ? -35 : -15,
    });
  }

  // ── 5. Geopolitical (heuristic — no external feed, check for known patterns) ──
  // Weekend risk: Friday afternoon → Monday open gap risk
  const dayOfWeek = now.getDay();
  const hour = now.getUTCHours();
  if (dayOfWeek === 5 && hour >= 16) { // Friday after US close
    events.push({
      eventType: 'geopolitical',
      severity: 'MEDIUM',
      daysUntil: 0,
      description: 'Rrezik fundjavë — hapje e hënë me gap të mundshëm',
      riskScore: -15,
    });
  }

  // ── Build result ──
  if (events.length === 0) {
    return {
      events: [],
      worstEvent: {
        eventType: 'none', severity: 'LOW', daysUntil: null,
        description: 'Asnjë ngjarje me rrezik të lartë', riskScore: 0,
      },
      compositeRiskScore: 0,
      hasCriticalEvent: false,
      summary: 'Asnjë ngjarje me rrezik të lartë nuk u zbulua',
    };
  }

  // Sort by riskScore (most negative = worst)
  events.sort((a, b) => a.riskScore - b.riskScore);
  const worstEvent = events[0];
  const compositeRiskScore = worstEvent.riskScore;
  const hasCriticalEvent = events.some(e => e.severity === 'CRITICAL');

  // Build Albanian summary
  const parts = events.map(e => {
    const sev = e.severity === 'CRITICAL' ? 'KRITIK' : e.severity === 'HIGH' ? 'I LARTË' : e.severity === 'MEDIUM' ? 'MESATAR' : 'I ULTË';
    return `${e.eventType.toUpperCase()}(${sev}, ${e.daysUntil}d)`;
  });
  const summary = `Rrezik ngjarjesh: ${parts.join(', ')}`;

  return { events, worstEvent, compositeRiskScore, hasCriticalEvent, summary };
}
