// ═══════════════════════════════════════════════════════════════
// Task 27 — IBKR VALIDATION / walk-forward.ts
// Out-of-Sample + Walk-Forward:
//
//   ┌──────────── IS ────────────┤ OOS │
//
//   IS  = 70% e parë (zhvillimi)   OOS = 30% e fundit
//   Walk-forward: OOS ndahet në 4 dritare njëra pas tjetrë,
//   secila testohet me modelin "anchored" (IS = gjithë periudha para saj).
//   Parametrat NUK ndryshohen gjatë OOS — ashtu si kërkohet.
// ═══════════════════════════════════════════════════════════════

export interface WindowSplit {
  /** ndarja statike IS/OOS e gjithë periudhës */
  static: { isStart: number; isEnd: number; oosStart: number; oosEnd: number };
  /** dritaret walk-forward (anchored) */
  walkForward: {
    window: number;
    isStart: number;
    isEnd: number;
    oosStart: number;
    oosEnd: number;
  }[];
}

export function splitWindows(totalDays: number, opts?: { isPct?: number; wfWindows?: number }): WindowSplit {
  const isPct = opts?.isPct ?? 0.70;
  const wfWindows = opts?.wfWindows ?? 4;

  const isEnd = Math.floor(totalDays * isPct);
  const oosStart = isEnd;
  const oosLen = totalDays - oosStart;
  const wf = Math.max(1, wfWindows);
  const per = Math.floor(oosLen / wf);

  const windows: { window: number; isStart: number; isEnd: number; oosStart: number; oosEnd: number }[] = [];
  for (let k = 0; k < wf; k++) {
    const start = oosStart + k * per;
    let end = k === wf - 1 ? totalDays - 1 : start + per - 1;
    if (end <= start) end = Math.min(start + 2, totalDays - 1);
    windows.push({ window: k + 1, isStart: 0, isEnd: start - 1, oosStart: start, oosEnd: end });
  }

  return {
    static: { isStart: 0, isEnd: isEnd - 1, oosStart, oosEnd: totalDays - 1 },
    walkForward: windows,
  };
}

// ═══════════════════════════════════════════════════════════════
// Task 29 — WALK-FORWARD KALENDARIKE (universi 400)
// Dritaret e specifikuara nga përdoruesi — 5 vjet train → 1 vit test:
//   2016–2020 → 2021 · 2017–2021 → 2022 · 2018–2022 → 2023 ·
//   2019–2023 → 2024 · 2020–2024 → 2025
// Parametrat NUK ndryshohen pasi shihen rezultatet e testit.
// ═══════════════════════════════════════════════════════════════

export interface CalendarWfSpec {
  trainFrom: string;
  trainTo: string;
  testFrom: string;
  testTo: string;
  label: string;
}

export const CALENDAR_WF_SPECS: CalendarWfSpec[] = [
  { trainFrom: '2016-01-01', trainTo: '2020-12-31', testFrom: '2021-01-01', testTo: '2021-12-31', label: '2016–2020 → 2021' },
  { trainFrom: '2017-01-01', trainTo: '2021-12-31', testFrom: '2022-01-01', testTo: '2022-12-31', label: '2017–2021 → 2022' },
  { trainFrom: '2018-01-01', trainTo: '2022-12-31', testFrom: '2023-01-01', testTo: '2023-12-31', label: '2018–2022 → 2023' },
  { trainFrom: '2019-01-01', trainTo: '2023-12-31', testFrom: '2024-01-01', testTo: '2024-12-31', label: '2019–2023 → 2024' },
  { trainFrom: '2020-01-01', trainTo: '2024-12-31', testFrom: '2025-01-01', testTo: '2025-12-31', label: '2020–2024 → 2025' },
];

export interface CalendarWfWindow {
  window: number;
  label: string;
  trainStart: number;
  trainEnd: number;
  testStart: number;
  testEnd: number;
  trainFrom: string;
  trainTo: string;
  testFrom: string;
  testTo: string;
}

/** Indeksi i parit me date >= key (binary search mbi kalendar të renditur) */
function lowerBound(calendar: string[], key: string): number {
  let lo = 0, hi = calendar.length - 1, ans = calendar.length;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (calendar[mid] >= key) { ans = mid; hi = mid - 1; }
    else lo = mid + 1;
  }
  return ans;
}

/** Indeksi i fundit me date <= key */
function upperBound(calendar: string[], key: string): number {
  let lo = 0, hi = calendar.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (calendar[mid] <= key) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}

/**
 * Ndërton dritaret kalendarike mbi kalendarin real të tregtimit.
 * Dritaret që nuk kanë të dhëna (testi fillon pas fundit të kalendarit,
 * ose train-i mbaron para fillimit) kihen — p.sh. në run-et 3v/5v.
 */
export function calendarWalkForward(calendar: string[]): CalendarWfWindow[] {
  if (calendar.length === 0) return [];
  const first = calendar[0];
  const last = calendar[calendar.length - 1];
  const out: CalendarWfWindow[] = [];

  for (let k = 0; k < CALENDAR_WF_SPECS.length; k++) {
    const s = CALENDAR_WF_SPECS[k];
    // Duhet: së paku ca train brenda të dhënave + së paku 20 ditë test
    if (s.trainTo < first || s.testFrom > last) continue;
    const trainStart = Math.max(0, lowerBound(calendar, s.trainFrom));
    const trainEnd = Math.min(calendar.length - 1, upperBound(calendar, s.trainTo));
    const testStart = lowerBound(calendar, s.testFrom);
    const testEnd = Math.min(calendar.length - 1, upperBound(calendar, s.testTo));
    if (trainEnd < trainStart || testEnd < testStart) continue;
    // test-i duhet të ketë të dhëna reale (jo vetëm 1-2 ditë)
    if (testEnd - testStart < 20) continue;
    // train-i duhet së paku 6 muaj brenda range-it të fetched
    if (trainEnd - trainStart < 120) continue;
    out.push({
      window: out.length + 1,
      label: s.label,
      trainStart, trainEnd, testStart, testEnd,
      trainFrom: calendar[trainStart], trainTo: calendar[trainEnd],
      testFrom: calendar[testStart], testTo: calendar[testEnd],
    });
  }
  return out;
}
