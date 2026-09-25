// ═══════════════════════════════════════════════════════════════
// Task 27 — IBKR VALIDATION / point-in-time.ts
// Parandalon LOOK-AHEAD BIAS: çdo vendim në ditën t përdor VETËM
// të dhëna që ekzistonin në mbylljen e ditës t (para hapjes së t+1).
//
//   Earnings published: 2024-05-08 16:05
//   Signal allowed:     after  2024-05-08 16:05
// ═══════════════════════════════════════════════════════════════
import { HistoricalDataPoint } from '@/lib/alpha-vantage';

export interface AsOfSeries {
  symbol: string;
  /** Bare ditorë deri në ditën t (përfshirë) — t+1 e padukshme */
  bars: HistoricalDataPoint[];
  /** Indeksi i ditës së sinjalit */
  t: number;
  date: string;
}

/** Ndërton serinë as-of: prerje e historikut në ditën e sinjalit */
export function sliceAsOf(
  symbol: string,
  history: HistoricalDataPoint[],
  t: number,
): AsOfSeries | null {
  if (t < 0 || t >= history.length) return null;
  return {
    symbol,
    bars: history.slice(0, t + 1),
    t,
    date: history[t].date,
  };
}

/**
 * Event risk as-of: sistemi nuk përdor earnings-in para se të publikohet.
 * Në backtest nuk kemi kalendar historik earnings — prandaj score-i i
 * event-riskut mbahet NEUTRAL (0/1, nuk penalizon, nuk bonuson) dhe
 * dokumentohet si kufizim. Nëse në të ardhmen shtohet kalendar historik,
 * kjo funksion e vlerëson atë në mënyrë point-in-time.
 */
export interface PointInTimeEventState {
  /** A ka informacion të vërtetë eventi për datën e sinjalit? */
  hasHistoricalEventData: boolean;
  /** 0 = neutral (pa data), 1 = pa rrezik, -1 = me rrezik */
  eventScore: -1 | 0 | 1;
  note: string;
}

export function eventRiskAsOf(signalDate: string): PointInTimeEventState {
  // Pa kalendar historik earnings → neutral. Rregulli live mbetet:
  // një sinjal para earnings nuk lejohet (në live e kap Catalyst Gate).
  return {
    hasHistoricalEventData: false,
    eventScore: 0,
    note: `Pa kalendar historik eventesh për ${signalDate}: Event Score neutral (0/1) — në live, Catalyst Gate bllokon hyrjet pranë earnings-it`,
  };
}

/**
 * Verifikon se një seri indikatorësh të parakalkuluar është e sigurtë
 * për përdorim as-of: vlera në indeksin t nuk duhet të varet nga > t.
 * Kthim: true → kalojeni; false → ndaloje (audit).
 */
export function auditNoLeakage<T>(
  series: T[],
  t: number,
  computedFrom: (idx: number) => number,
): { ok: boolean; lastIdxUsed: number } {
  const lastIdxUsed = computedFrom(t);
  return { ok: lastIdxUsed <= t, lastIdxUsed };
}
