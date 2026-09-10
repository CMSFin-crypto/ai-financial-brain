// ═══════════════════════════════════════════════════════════════
// DITARI TOP 10 — Ndjekja Live e Çmimeve (Alarme Hyrjeje)
// ═══════════════════════════════════════════════════════════════
// Kontrollon hyrjet e hapura të Ditarit Top 10 ndaj çmimeve live:
//   - HYRJA u kap     → çmimi ≥ niveli i hyrjes        → njoftim Telegram
//   - TARGET i kapur  → çmimi ≥ target (pas hyrjes)     → njoftim Telegram
//   - STOP aktivizuar → çmimi ≤ stop (pas hyrjes)       → njoftim Telegram
//
// Çdo njoftim dërgohet VETËM në tranzicion (false → true) — pa spam.
// Flamujt (entryHit/targetHit/stopHit) ruhen në DB; MFE/MAE/resultR
// dhe diagnoza e plotë llogariten nga cron-i ditor me bar-e ditore.
//
// Thirret nga:
//   - UI (Ditar Top 10): automatikisht çdo 15 min + buton manual
//   - Cron i jashtëm (p.sh. cron-job.org): GET /api/journal/price-watch
// ═══════════════════════════════════════════════════════════════

import { prisma, isDbAvailable } from "@/lib/prisma";
import { getRealPrices } from "@/lib/alpha-vantage";
import { sendTelegramAlert, alertsConfigured } from "@/lib/alerts";

// Ditët kalendarike maksimale që një sinjal mbetet "live" në watch
// (mbulon EXPIRY_BARS = 10 ditë tregtimi)
const MAX_OPEN_DAYS = 14;

export interface WatchEvent {
  ticker: string;
  kind: "ENTRY" | "TARGET" | "STOP";
  price: number;
  level: number;
  scanDate: string;
  rank: number | null;
  alertSent: boolean;
}

export interface WatchResult {
  dbActive: boolean;
  alertsConfigured: boolean;
  marketOpen: boolean;
  checkedAt: string;
  openEntries: number;
  pricedEntries: number;
  events: WatchEvent[];
  errors: string[];
}

function isMarketOpen(): boolean {
  // 9:30–16:00 ET = 13:30–20:00 UTC (thjeshtuesi; DST e zhvendos 1 orë)
  const now = new Date();
  const day = now.getUTCDay(); // 0 = e diel
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const weekday = day >= 1 && day <= 5;
  return weekday && minutes >= 13 * 60 + 30 && minutes < 16 * 60;
}

function fmt(n: number | null | undefined): string {
  return n != null ? n.toFixed(2) : "—";
}

function fmtR(n: number): string {
  const r = Math.round(n * 100) / 100;
  return `${r > 0 ? "+" : ""}${r}R`;
}

// ── Mesazhet Telegram (HTML) ──

function entryAlertMsg(e: any, price: number): string {
  const rr = e.entry && e.stop ? (e.entry - e.stop) > 0 ? Math.round(((e.target - e.entry) / (e.entry - e.stop)) * 10) / 10 : null : null;
  return [
    `<b>🎯 ${e.ticker} — HYRJA U KAP</b>`,
    `Top 10 (#${e.rank ?? "—"} · score ${e.score ?? "—"})`,
    `Çmimi ${price.toFixed(2)} ≥ hyrja ${fmt(e.entry)}`,
    `Stop ${fmt(e.stop)} · Target ${fmt(e.target)}${rr ? ` (${rr}R)` : ""}`,
    `Sinjali: ${e.scanDate} · ${e.sector ?? ""}`.trim(),
    `— Ditar Top 10 · IBKR`,
  ].join("\n");
}

function targetAlertMsg(e: any, price: number): string {
  const risk = e.entry && e.stop ? e.entry - e.stop : 0;
  const r = risk > 0 ? (e.target - e.entry) / risk : null;
  return [
    `<b>✅ ${e.ticker} — TARGET I KAPUR</b>`,
    `Çmimi ${price.toFixed(2)} ≥ target ${fmt(e.target)}`,
    r != null ? `Rezultati: ${fmtR(r)}` : null,
    `Hyrja ishte ${fmt(e.entry)} · stop ${fmt(e.stop)}`,
    `Sinjali: ${e.scanDate}`,
    `— Ditar Top 10 · IBKR`,
  ]
    .filter(Boolean)
    .join("\n");
}

function stopAlertMsg(e: any, price: number): string {
  return [
    `<b>🛑 ${e.ticker} — STOP I AKTIVIZUAR</b>`,
    `Çmimi ${price.toFixed(2)} ≤ stop ${fmt(e.stop)}`,
    `Rezultati: -1.00R`,
    `Hyrja ishte ${fmt(e.entry)} · target ${fmt(e.target)}`,
    `Sinjali: ${e.scanDate}`,
    `— Ditar Top 10 · IBKR`,
  ].join("\n");
}

// ── Vëzhguesi kryesor ──

export async function watchTop10Prices(): Promise<WatchResult> {
  const base: WatchResult = {
    dbActive: false,
    alertsConfigured: alertsConfigured(),
    marketOpen: isMarketOpen(),
    checkedAt: new Date().toISOString(),
    openEntries: 0,
    pricedEntries: 0,
    events: [],
    errors: [],
  };
  if (!isDbAvailable()) return base;

  try {
    const fromDate = new Date(Date.now() - MAX_OPEN_DAYS * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const open = await prisma.top10JournalEntry.findMany({
      where: {
        scanDate: { gte: fromDate },
        entry: { not: null },
        stop: { not: null },
        target: { not: null },
        OR: [{ exitStatus: null }, { exitStatus: "OPEN" }],
      },
      orderBy: { scanDate: "asc" },
      take: 30,
    });
    base.dbActive = true;
    base.openEntries = open.length;
    if (!open.length) return base;

    // Çmimet live (me cache + batch)
    const tickers = [...new Set((open as any[]).map((e) => e.ticker))];
    const prices = await getRealPrices(tickers, { forceRefresh: true });
    if (!Object.keys(prices).length) {
      base.errors.push("Asnjë çmim live nuk u mor (rate limit ose API jashtë funksioni).");
      return base;
    }

    for (const row of open) {
      const e: any = row;
      const live = prices[e.ticker];
      if (!live || !live.price) continue;
      base.pricedEntries++;
      const price = live.price as number;

      const entryHitNow = (e.entry as number) != null && price >= (e.entry as number);
      const targetHitNow = price >= (e.target as number);
      const stopHitNow = price <= (e.stop as number);

      // ── Tranzicionet (false → true) ──
      const data: any = {};
      const msgs: string[] = [];

      if (!e.entryHit && entryHitNow) {
        data.entryHit = true;
        data.entryHitAt = new Date();
        msgs.push(entryAlertMsg(e, price));
        base.events.push({ ticker: e.ticker, kind: "ENTRY", price, level: e.entry, scanDate: e.scanDate, rank: e.rank, alertSent: false });
      }

      // Target/stop kanë kuptim vetëm PASi hyrja është kapur
      if (entryHitNow) {
        // Konservativisht: nëse të dyja në të njëjtin moment → stop-i i parë
        if (!e.stopHit && !e.targetHit && stopHitNow) {
          data.stopHit = true;
          data.exitStatus = "HIT_STOP";
          msgs.push(stopAlertMsg(e, price));
          base.events.push({ ticker: e.ticker, kind: "STOP", price, level: e.stop, scanDate: e.scanDate, rank: e.rank, alertSent: false });
        } else if (!e.targetHit && !e.stopHit && targetHitNow && !stopHitNow) {
          data.targetHit = true;
          data.exitStatus = "HIT_TARGET";
          msgs.push(targetAlertMsg(e, price));
          base.events.push({ ticker: e.ticker, kind: "TARGET", price, level: e.target, scanDate: e.scanDate, rank: e.rank, alertSent: false });
        }
      }

      if (Object.keys(data).length) {
        try {
          await prisma.top10JournalEntry.update({ where: { id: e.id }, data });
          // Dërgo njoftimet (vetëm në tranzicion — një herë për nivel)
          if (msgs.length) {
            const ok = await sendTelegramAlert(msgs.join("\n\n"));
            for (const ev of base.events) {
              if (ev.ticker === e.ticker && !ev.alertSent) ev.alertSent = ok;
            }
          }
        } catch (err: any) {
          base.errors.push(`${e.ticker}: ${err?.message || err}`);
        }
      }
    }
  } catch (err: any) {
    base.errors.push(err?.message || String(err));
  }
  return base;
}
