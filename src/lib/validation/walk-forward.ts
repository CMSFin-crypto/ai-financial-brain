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
