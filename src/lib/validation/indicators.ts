// ═══════════════════════════════════════════════════════════════
// Task 27 — IBKR VALIDATION / indicators.ts
// Helperë teknikë me formula IDENTIKE me ibkr-scan/route.ts,
// që backtest-i të replikojë saktësisht scanner-in live.
// ═══════════════════════════════════════════════════════════════
import { HistoricalDataPoint } from '@/lib/alpha-vantage';

/** EMA — e njëjta formulë me calcEMA në ibkr-scan (SMA-seed) */
export function calcEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let prev = 0;
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      // seed: mesatarja e 'period' bareve të para (ose sa ka)
      const seed = data.slice(0, Math.min(period, data.length));
      prev = seed.reduce((a, b) => a + b, 0) / seed.length;
      ema.push(prev);
    } else {
      prev = data[i] * k + prev * (1 - k);
      ema.push(prev);
    }
  }
  return ema;
}

/** ATR Wilder — identik me calcATR në ibkr-scan */
export function calcATR(data: HistoricalDataPoint[], period = 14): number {
  if (data.length < period + 1) return 0;
  let atr = 0;
  for (let i = data.length - period; i < data.length; i++) {
    const tr = Math.max(
      data[i].high - data[i].low,
      Math.abs(data[i].high - data[i - 1].close),
      Math.abs(data[i].low - data[i - 1].close),
    );
    atr += tr;
  }
  return atr / period;
}

/** % ndryshimi për 'days' ditë — identik me pct() në ibkr-scan */
export function pct(data: number[], days: number): number {
  if (data.length < days + 1) return 0;
  const now = data[data.length - 1];
  const then = data[data.length - 1 - days];
  if (then === 0) return 0;
  return ((now - then) / then) * 100;
}

/** % ndryshimi mbi një dritare të zhvendosur (për seri as-of) */
export function pctAt(data: number[], endIndex: number, days: number): number {
  const startIdx = endIndex - days;
  if (startIdx < 0) return 0;
  const now = data[endIndex];
  const then = data[startIdx];
  if (!then || then === 0) return 0;
  return ((now - then) / then) * 100;
}

/** Indeksi i kulmit të fundit 10-ditor — si në ibkr-scan (rreshti ~815) */
export function recentPeakIndex(closes: number[], last: number): number {
  let highIdx = last;
  for (let i = last; i >= Math.max(0, last - 10); i--) {
    if (closes[i] >= closes[highIdx]) highIdx = i;
  }
  return highIdx;
}
