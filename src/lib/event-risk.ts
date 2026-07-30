// ============================================================
// Event Risk Detector
// Checks for earnings, FOMC, macro events that affect signals
// ============================================================

export type EventSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface EventRiskResult {
  eventType: 'earnings' | 'fed' | 'geopolitical' | 'sector_news' | 'none';
  severity: EventSeverity;
  daysUntil: number | null;
  description: string;
  riskScore: number; // 0 to -100 (penalty)
}

// FOMC meeting dates for 2025-2026 (approximate — 8 per year, typically Wed-Thu)
const FOMC_DATES_2025 = [
  '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18',
  '2025-07-30', '2025-09-17', '2025-11-05', '2025-12-17',
];
const FOMC_DATES_2026 = [
  '2026-01-28', '2026-03-18', '2026-05-06', '2026-06-17',
  '2026-07-29', '2026-09-16', '2026-11-04', '2026-12-16',
];

function getFomcDates(): string[] {
  const year = new Date().getFullYear();
  return year >= 2026 ? FOMC_DATES_2026 : FOMC_DATES_2025;
}

function daysBetween(dateStr: string, refDate: Date): number {
  const target = new Date(dateStr);
  return Math.ceil((target.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));
}

function daysToNextThursday(): number {
  const now = new Date();
  const day = now.getDay();
  const daysUntil = (4 - day + 7) % 7 || 7; // 4 = Thursday
  return daysUntil;
}

/**
 * Check for event risks around a given date.
 * @param ticker - stock symbol (used for potential earnings lookup)
 * @param knownEarningsDate - optional known earnings date string (YYYY-MM-DD)
 */
export function checkEventRisk(
  ticker: string,
  knownEarningsDate?: string,
): EventRiskResult {
  const now = new Date();
  const results: EventRiskResult[] = [];

  // 1. Check earnings
  if (knownEarningsDate) {
    const daysUntilEarnings = daysBetween(knownEarningsDate, now);
    if (daysUntilEarnings >= -1 && daysUntilEarnings <= 3) {
      const severity: EventSeverity = Math.abs(daysUntilEarnings) <= 1 ? 'CRITICAL' : 'HIGH';
      results.push({
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
    const month = now.getMonth(); // 0-indexed
    const weekOfMonth = Math.ceil(now.getDate() / 7);
    const earningsMonths = [0, 3, 6, 9]; // Jan, Apr, Jul, Oct
    if (earningsMonths.includes(month) && weekOfMonth <= 3) {
      // More likely in earnings season — low confidence
      const daysToThurs = daysToNextThursday();
      if (daysToThurs <= 2) {
        results.push({
          eventType: 'earnings',
          severity: 'MEDIUM',
          daysUntil: daysToThurs,
          description: `Mund të jetë sezoni i fitimeve — ${ticker} mund të raportojë së shpejti`,
          riskScore: -25,
        });
      }
    }
  }

  // 2. Check FOMC
  const fomcDates = getFomcDates();
  for (const fomcDate of fomcDates) {
    const daysUntil = daysBetween(fomcDate, now);
    if (daysUntil >= -1 && daysUntil <= 2) {
      const severity: EventSeverity = Math.abs(daysUntil) <= 0 ? 'CRITICAL' : 'HIGH';
      results.push({
        eventType: 'fed',
        severity,
        daysUntil: Math.max(0, daysUntil),
        description: `FOMC vendim në ${Math.abs(daysUntil) === 0 ? 'sot' : `${daysUntil} ditë`}`,
        riskScore: severity === 'CRITICAL' ? -70 : -40,
      });
      break; // Only report the nearest FOMC
    }
  }

  // Pick the worst (most negative) risk
  if (results.length > 0) {
    results.sort((a, b) => a.riskScore - b.riskScore);
    return results[0];
  }

  return {
    eventType: 'none',
    severity: 'LOW',
    daysUntil: null,
    description: 'Asnjë ngjarje me rrezik të lartë nuk u zbulua',
    riskScore: 0,
  };
}
