// ═══════════════════════════════════════════════════════════════════
// DITARI I SINJALEVE (Gjurmuesi) — CTC & REV, të ndara
// ═══════════════════════════════════════════════════════════════════
// Qëllimi: çdo ditë ruhen sinjalet që nxjerrin strategjitë (Job A) dhe
// pas 1–5 ditëve tregtare sistemi tregon për çdo sinjal a arriti
// target-in, a goditi stop-in, ku është çmimi, dhe llogarit statistika
// (Job B). Ky ditar është DESKRIPTIV — mat çfarë ndodhi. NUK përdoret
// për të tunuar parametrat e strategjisë (shiko CTC_v2_strategy_spec.md,
// Seksioni 8 — rregullat e leximit).
//
// Rregullat e vlerësimit (të njëjta me Validation Lab — src/lib/validation/
// execution-model.ts — NUK janë ndryshuar):
//   • CTC hyn në OPEN të ditës pas konfirmimit; REV hyn në T+1 (close e
//     ditës së konfirmimit), vetëm nëse konfirmimi kaloi.
//   • Target hit: high ≥ target.  Stop hit: low ≤ stop.
//   • E njëjta qiri prek edhe stop edhe target → numërohet STOP
//     (supozim konservativ — si checkPositionBar).
//   • Gap: hapja përtej stop-it → humbja te çmimi i hapjes (GAP_STOP),
//     jo te stop-i. Hapja mbi target → TARGET te çmimi i hapjes.
//   • Time stop: CTC dita 5 (d1 = dita e hyrjes), REV dita 3 (d1 = dita
//     pas hyrjes; dita 5 = fundi i fortë). Dalje te close i asaj dite.
//   • Pasi statusi kyçet (target/stop/time_stop), NUK ndryshon më —
//     Job B nuk e prek më rreshtin.
//   • Dita tregtare = pa fundjava e pa festat (kalendari derivohet nga
//     qiratë SPY — festa janë automatikisht jashtë).
// ═══════════════════════════════════════════════════════════════════

import { Prisma } from "@prisma/client";
import { prisma, isDbAvailable } from "@/lib/prisma";
import { fetchHistoricalData } from "@/lib/alpha-vantage";

// ── Konstante ──

/** Kosto C — % e round-trip (komision + spread + slippage), kalibruar me
 *  DEFAULT_COSTS të Validation Lab: ~0.05% komision + ~0.08% spread +
 *  ~0.08% slippage ≈ 0.20% i vlerës së pozicionit. Deskriptiv — jo parameter
 *  i optimizuar. */
export const JOURNAL_COST_PCT = 0.2;

/** Koha-maksimale e mbajtjes në ditë tregtare të checkpoint-it. */
export const CTC_MAX_DAY_N = 5; // time stop dita 5 (d1 = dita e hyrjes)
export const REV_TIME_STOP_DAY_N = 3; // time stop dita 3 (d1 = dita pas hyrjes)
export const REV_HARD_END_DAY_N = 5; // fundi i fortë — si MAX_HOLD i backtest-it

export type JournalStrategy = "CTC" | "REV";
export type JournalFinalStatus =
  | "target"
  | "stop"
  | "gap_stop"
  | "time_stop"
  | "no_entry"
  | "open";

export interface JournalCheckpoint {
  date: string;
  close: number;
  highSoFar: number; // kumulative nga d1
  lowSoFar: number; // kumulative nga d1
  rAtClose: number;
  mfeR: number; // kumulative
  maeR: number; // kumulative
  status: JournalFinalStatus | null; // plotësohet ditën e kyçjes
}

export type CheckpointsMap = Partial<
  Record<"d1" | "d2" | "d3" | "d4" | "d5", JournalCheckpoint>
>;

export interface SimpleBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

// ── Kalendari i ditëve tregtare (nga qiratë SPY — festa automatikisht jashtë) ──

/** Indeksi i datës në kalendar (parashtesë: kalendar i renditur). -1 nëse s'gjendet. */
export function calendarIndex(calendar: string[], date: string): number {
  return calendar.indexOf(date);
}

/** Snappo datën mbrapa në ditën e fundit tregtare ≤ datës së dhënë. */
export function snapToTradingDay(date: string, calendar: string[]): string {
  if (calendar.includes(date)) return date;
  const later = calendar.filter((d) => d <= date);
  return later.length ? later[later.length - 1] : date;
}

/** Numri i ditëve tregtare midis dy datave (nga → në, ekskluzive → inkluzive). */
export function tradingDaysBetween(calendar: string[], from: string, to: string): number {
  const a = calendarIndex(calendar, from);
  const b = calendarIndex(calendar, to);
  if (a < 0 || b < 0) return 0;
  return Math.max(0, b - a);
}

// ── Klasifikuesi deskriptiv i regjimit (TRENDING / TRANSITIONAL / CHOP) ──
// Vetëm për etiketim — NUK hyn në vendimmarrje të strategjive. Praget janë
// fikse dhe të dokumentuara në spec (Seksioni 8): slope i SMA20-së 5-ditor
// dhe distanca nga SMA50. I para-regjistruar — jo tunim.

export type RegimeLabel = "TRENDING" | "TRANSITIONAL" | "CHOP";

export function classifyRegimeFromSpy(
  spyBars: { date: string; close: number }[] | null | undefined,
  dateStr: string,
): RegimeLabel | null {
  if (!spyBars || spyBars.length < 60) return null;
  const idx = spyBars.findIndex((b) => b.date === dateStr);
  if (idx < 55) return null;
  const closes = spyBars.map((b) => b.close);
  const sma = (arr: number[], end: number, n: number): number => {
    let s = 0;
    for (let i = end - n + 1; i <= end; i++) s += arr[i];
    return s / n;
  };
  const sma20 = sma(closes, idx, 20);
  const sma20prev = sma(closes, idx - 5, 20);
  const sma50 = sma(closes, idx, 50);
  const slope = ((sma20 - sma20prev) / sma20prev) * 100;
  const dist = ((closes[idx] - sma50) / sma50) * 100;
  if (Math.abs(slope) >= 0.6 && Math.abs(dist) >= 1.2 && Math.sign(slope) === Math.sign(dist)) {
    return "TRENDING";
  }
  if (Math.abs(slope) < 0.25 && Math.abs(dist) < 0.8) return "CHOP";
  return "TRANSITIONAL";
}

// ═══════════════════════════════════════════════════════════════════
// EVALUATORI QENDROR (i pastër — i testueshëm, pa DB, pa rrjet)
// ═══════════════════════════════════════════════════════════════════

export interface EvaluateResult {
  checkpoints: CheckpointsMap;
  finalStatus: JournalFinalStatus; // "open" nëse s'është kyçur ende
  finalDate: string | null;
  finalDayN: number | null;
  exitPrice: number | null;
  resultR: number | null;
  mfeR: number;
  maeR: number;
  pnlPctNet: number | null;
}

/**
 * Ec mbi qiratë e simbolit pas hyrjes dhe plotëso checkpoint-et d1..d5 me
 * rregullat e Validation Lab (gap → konservativ stop-i pari → target →
 * time-stop). Për CTC checkpoint-i nis TE bari i hyrjes (d1 = dita e
 * hyrjes, hyrje në open); për REV nis TE bari PASUES (d1 = dita pas
 * hyrjes — pozicioni hapet në close të ditës së konfirmimit).
 * Qiratë mungese (halt) kaloen — dN numëron vetëm ditët me të dhëna
 * (si backtest-et, që iterojnë mbi qiratë).
 */
export function evaluateCheckpoints(inp: {
  strategy: JournalStrategy;
  entry: number;
  stop: number;
  target: number;
  entryDate: string;
  bars: SimpleBar[]; // të renditura kronologjikisht
  costPct?: number;
}): EvaluateResult | null {
  const { strategy, entry, stop, target, entryDate, bars } = inp;
  const costPct = inp.costPct ?? JOURNAL_COST_PCT;
  const risk = entry - stop;
  if (!(risk > 0) || !(entry > 0)) return null;

  const startIdx = bars.findIndex((b) =>
    strategy === "CTC" ? b.date >= entryDate : b.date > entryDate,
  );
  if (startIdx < 0) {
    // Pa qira pas hyrjes — ende pa ditë tregtare të vlerësueshme — open
    return {
      checkpoints: {},
      finalStatus: "open",
      finalDate: null,
      finalDayN: null,
      exitPrice: null,
      resultR: null,
      mfeR: 0,
      maeR: 0,
      pnlPctNet: null,
    };
  }

  const checkpoints: CheckpointsMap = {};
  const dayKeys = ["d1", "d2", "d3", "d4", "d5"] as const;
  let highSoFar = -Infinity;
  let lowSoFar = Infinity;
  let finalStatus: JournalFinalStatus = "open";
  let finalDate: string | null = null;
  let finalDayN: number | null = null;
  let exitPrice: number | null = null;

  let dayN = 0;
  for (let i = startIdx; i < bars.length && dayN < 5; i++) {
    const b = bars[i];
    dayN += 1;
    highSoFar = Math.max(highSoFar, b.high);
    lowSoFar = Math.min(lowSoFar, b.low);

    // ── Rregullat e ekzekutimit ( rendi i checkPositionBar — Validation Lab) ──
    let locked: JournalFinalStatus | null = null;
    let price: number | null = null;
    if (b.open <= stop) {
      locked = "gap_stop";
      price = b.open; // hapur nën stop → ekzekutohet në open
    } else if (b.open >= target) {
      locked = "target"; // GAP_TARGET — fitim i plotë në open
      price = b.open;
    } else if (b.low <= stop && b.high >= target) {
      locked = "stop"; // të dyja nivelet në të njëjtën qiri → KONSERVATIV
      price = stop;
    } else if (b.low <= stop) {
      locked = "stop";
      price = stop;
    } else if (b.high >= target) {
      locked = "target";
      price = target;
    } else if (strategy === "CTC" && dayN >= CTC_MAX_DAY_N) {
      locked = "time_stop";
      price = b.close;
    } else if (strategy === "REV" && dayN >= REV_TIME_STOP_DAY_N) {
      locked = "time_stop";
      price = b.close;
    } else if (strategy === "REV" && dayN >= REV_HARD_END_DAY_N) {
      locked = "time_stop"; // MAX_HOLD — praktikisht e paarritshme (d3 e mbyll)
      price = b.close;
    }

    const cp: JournalCheckpoint = {
      date: b.date,
      close: b.close,
      highSoFar,
      lowSoFar,
      rAtClose: (b.close - entry) / risk,
      mfeR: (highSoFar - entry) / risk,
      maeR: (lowSoFar - entry) / risk,
      status: locked,
    };
    checkpoints[dayKeys[dayN - 1]] = cp;

    if (locked && price !== null) {
      finalStatus = locked;
      finalDate = b.date;
      finalDayN = dayN;
      exitPrice = price;
      break; // pasi statusi kyçet, s'ndryshon më — checkpoint-et e mëpasshme mbeten null
    }
  }

  const mfeR = highSoFar === -Infinity ? 0 : (highSoFar - entry) / risk;
  const maeR = lowSoFar === Infinity ? 0 : (lowSoFar - entry) / risk;
  const resultR =
    exitPrice !== null ? (exitPrice - entry) / risk : null;
  const pnlPctNet =
    exitPrice !== null ? ((exitPrice - entry) / entry) * 100 - costPct : null;

  return {
    checkpoints,
    finalStatus,
    finalDate,
    finalDayN,
    exitPrice,
    resultR,
    mfeR,
    maeR,
    pnlPctNet,
  };
}

// ═══════════════════════════════════════════════════════════════════
// JOB A — REGJISTRIMI (idempotent, çelës unik: strategji+simbol+datë)
// ═══════════════════════════════════════════════════════════════════
// Ruaj ÇDO sinjal që plotëson rregullat — jo vetëm Top 10 — edhe kur
// s'ka slot të lirë (flag "pa_slot"), që statistikat të mos varen nga
// rendi i hapjes. Ekzekutohet: (a) piggyback brenda skaneve ibkr-scan /
// rev-scan, (b) nga /api/signal-journal/register (cron 22:00 UTC).

export interface JournalCtcCandidate {
  symbol: string;
  companyName?: string | null;
  sector?: string | null;
  totalScore: number;
  decision: string; // duhet "READY"
  setup: string; // duhet "TREND_CONT" (CTC v2 — Delivery)
  entry: number; // çmimi referues i skanimit (hyrja reale = open e ditës pasuese — plotësohet nga Job B)
  stop: number;
  target3R: number; // targeti i bracket-it 3R (konventa e ditarit Top 10)
}

export interface JournalRevCandidate {
  symbol: string;
  companyName?: string | null;
  sector?: string | null;
  status: string; // duhet "HYRJE_TANI"
  signalDate: string; // dita e rënies (T)
  price: number; // close e ditës së konfirmimit = hyrja reale
  stop: number;
  target: number;
  slot?: string | null; // "MAX_POZICIONE" → pa_slot (skanimi e llogarit vetë: max 3, 1/sektor)
  warnings?: string[];
}

export interface IngestResult {
  saved: number;
  updated: number;
  skipped: number;
  error?: string;
}

function upsertEntryData(c: {
  strategy: JournalStrategy;
  symbol: string;
  companyName?: string | null;
  sector?: string | null;
  signalDate: string;
  entryDate: string | null;
  entry: number | null;
  stop: number;
  target: number;
  score: number | null;
  regime: string | null;
  noSlot: boolean;
  slotNote: string | null;
}) {
  return prisma.signalJournalEntry.upsert({
    where: {
      strategy_symbol_signalDate: {
        strategy: c.strategy,
        symbol: c.symbol,
        signalDate: c.signalDate,
      },
    },
    create: {
      strategy: c.strategy,
      symbol: c.symbol,
      companyName: c.companyName ?? null,
      sector: c.sector ?? null,
      signalDate: c.signalDate,
      entryDate: c.entryDate,
      entry: c.entry,
      stop: c.stop,
      target: c.target,
      score: c.score,
      regime: c.regime,
      noSlot: c.noSlot,
      slotNote: c.slotNote,
      finalStatus: "open",
      source: "live",
    },
    // Rifresko VETËM fushat e nivelit të sinjalit — s'prek asnjëherë
    // finalStatus / checkpoints (Job B i zotëron ato).
    update: {
      companyName: c.companyName ?? null,
      sector: c.sector ?? null,
      stop: c.stop,
      target: c.target,
      score: c.score,
      regime: c.regime,
      noSlot: c.noSlot,
      slotNote: c.slotNote,
    },
  });
}

/**_JOB A (CTC) — regjistron kandidatët delivery-eligible: decision READY +
 *  setup TREND_CONT (rregulli i spec-it CTC v2, Seksioni 6). Simulon
 *  slot-et: max 3 pozicione · 1/sektor · cooldown 10 ditë/simbol — duke
 *  përdorur gjendjen e ditarit (jo të skanit), që flag-u pa_slot të jetë
 *  determinist. */
export async function ingestSignalJournalCTC(params: {
  stocks: JournalCtcCandidate[];
  sessionDate: string; // data ET e sesionit të skanimit
  spyBars: { date: string; close: number }[] | null;
}): Promise<IngestResult> {
  const res: IngestResult = { saved: 0, updated: 0, skipped: 0 };
  if (!isDbAvailable()) return { ...res, error: "DB i pavlefshëm" };
  try {
    const calendar = params.spyBars ? params.spyBars.map((b) => b.date) : [];
    const signalDate = params.spyBars?.length
      ? snapToTradingDay(params.sessionDate, calendar)
      : params.sessionDate;
    const regime = classifyRegimeFromSpy(params.spyBars, signalDate);

    // Vetëm kandidatët delivery: READY + TREND_CONT, nivele të vlefshme
    const cands = params.stocks
      .filter(
        (s) =>
          s.decision === "READY" &&
          s.setup === "TREND_CONT" &&
          s.entry > 0 &&
          s.stop > 0 &&
          s.entry > s.stop &&
          s.target3R > 0,
      )
      .sort((a, b) => b.totalScore - a.totalScore);
    if (!cands.length) return res;

    // Gjendja e ditarit për slot-e (20 ditë kalendarike mjafton)
    const since = new Date(Date.now() - 20 * 86400_000).toISOString().slice(0, 10);
    const recent = await prisma.signalJournalEntry.findMany({
      where: { strategy: "CTC", signalDate: { gte: since } },
      select: {
        symbol: true,
        sector: true,
        noSlot: true,
        finalStatus: true,
        entryDate: true,
        finalDate: true,
      },
    });
    const openSymbols = new Set(
      recent
        .filter((r) => !r.noSlot && (r.finalStatus === null || r.finalStatus === "open"))
        .map((r) => r.symbol),
    );
    // Cooldown: simboli ka pasur hyrje (jo-pa_slot) brenda 10 ditëve të fundit tregtare
    const cooldownSymbols = new Set<string>();
    for (const r of recent) {
      if (r.noSlot) continue;
      const refDate = r.finalDate && r.finalStatus !== "open" ? r.finalDate : r.entryDate;
      if (!refDate) continue;
      if (calendar.length >= 2) {
        if (calendar.includes(refDate) && tradingDaysBetween(calendar, refDate, signalDate) < 10) {
          cooldownSymbols.add(r.symbol);
        }
      } else {
        const dd = (Date.parse(signalDate) - Date.parse(refDate)) / 86400_000;
        if (dd >= 0 && dd < 14) cooldownSymbols.add(r.symbol);
      }
    }

    // Simulimi i slot-eve (max 3 · 1/sektor) — rendi: score desc (determinist)
    const usedSectors = new Set<string>();
    let slotsLeft = 3;
    for (const s of cands) {
      let noSlot = false;
      let slotNote: string | null = null;
      if (openSymbols.has(s.symbol)) {
        noSlot = true;
        slotNote = "pozicion i hapur për këtë simbol";
      } else if (cooldownSymbols.has(s.symbol)) {
        noSlot = true;
        slotNote = "cooldown 10 ditë/simbol";
      } else if (slotsLeft <= 0) {
        noSlot = true;
        slotNote = "max 3 pozicione";
      } else if (usedSectors.has(s.sector || "?")) {
        noSlot = true;
        slotNote = "max 1/sektor";
      } else {
        slotsLeft -= 1;
        usedSectors.add(s.sector || "?");
      }
      const existing = await prisma.signalJournalEntry.findUnique({
        where: {
          strategy_symbol_signalDate: {
            strategy: "CTC",
            symbol: s.symbol,
            signalDate,
          },
        },
        select: { id: true },
      });
      await upsertEntryData({
        strategy: "CTC",
        symbol: s.symbol,
        companyName: s.companyName,
        sector: s.sector,
        signalDate,
        entryDate: null, // hyrja reale (open e ditës pasuese) plotësohet nga Job B
        entry: null,
        stop: s.stop,
        target: s.target3R,
        score: s.totalScore,
        regime,
        noSlot,
        slotNote,
      });
      if (existing) res.updated += 1;
      else res.saved += 1;
    }
    return res;
  } catch (e: unknown) {
    return { ...res, error: e instanceof Error ? e.message : String(e) };
  }
}

/** JOB A (REV) — regjistron sinjalet e konfirmuara (HYRJE_TANI): hyrja
 *  reale = close e ditës së konfirmimit (dita e skanimit), sipas rregullit
 *  të strategjisë REV (hyn në T+1 vetëm me konfirmim të kaluar). Sinjalet
 *  PRIT_KONFIRMIM NUK regjistrohen — nuk hynë kurrë (rregulli i hyrjes).
 *  Flag-u pa_slot vjen nga skanimi REV (max 3 pozicione, 1/sektor). */
export async function ingestSignalJournalREV(params: {
  candidates: JournalRevCandidate[];
  sessionDate: string; // dita e skanimit = dita e konfirmimit (T+1)
  spyBars: { date: string; close: number }[] | null;
}): Promise<IngestResult> {
  const res: IngestResult = { saved: 0, updated: 0, skipped: 0 };
  if (!isDbAvailable()) return { ...res, error: "DB i pavlefshëm" };
  try {
    const calendar = params.spyBars ? params.spyBars.map((b) => b.date) : [];
    const entryDate = params.spyBars?.length
      ? snapToTradingDay(params.sessionDate, calendar)
      : params.sessionDate;

    const cands = params.candidates.filter(
      (c) =>
        c.status === "HYRJE_TANI" &&
        c.price > 0 &&
        c.stop > 0 &&
        c.price > c.stop &&
        c.target > 0,
    );
    if (!cands.length) return res;

    for (const c of cands) {
      const signalDate = params.spyBars?.length
        ? snapToTradingDay(c.signalDate, calendar)
        : c.signalDate;
      const regime = classifyRegimeFromSpy(params.spyBars, signalDate);
      const noSlot = c.slot === "MAX_POZICIONE";
      const existing = await prisma.signalJournalEntry.findUnique({
        where: {
          strategy_symbol_signalDate: {
            strategy: "REV",
            symbol: c.symbol,
            signalDate,
          },
        },
        select: { id: true },
      });
      await upsertEntryData({
        strategy: "REV",
        symbol: c.symbol,
        companyName: c.companyName,
        sector: c.sector,
        signalDate,
        entryDate, // dita e konfirmimit — hyrja në close të saj
        entry: c.price,
        stop: c.stop,
        target: c.target,
        score: null, // REV renditet me idioSpread — pa score të vetës
        regime,
        noSlot,
        slotNote: noSlot ? c.warnings?.[0] ?? "max 3 pozicione" : null,
      });
      if (existing) res.updated += 1;
      else res.saved += 1;
    }
    return res;
  } catch (e: unknown) {
    return { ...res, error: e instanceof Error ? e.message : String(e) };
  }
}

// ═══════════════════════════════════════════════════════════════════
// JOB B — VLERËSIMI DITOR (idempotent; rreshtat e kyçur s'preken)
// ═══════════════════════════════════════════════════════════════════
// Për çdo sinjal të pakyçur me moshë ≤ 5 ditë tregtare: merr OHLC ditor,
// plotëso checkpoint-in e ditës N, kyç statusin final kur ndodh e para.

export interface EvaluateJobResult {
  evaluated: number;
  locked: number;
  skippedNoData: number;
  error?: string;
}

export async function evaluateSignalJournal(maxEntries = 80): Promise<EvaluateJobResult> {
  const res: EvaluateJobResult = { evaluated: 0, locked: 0, skippedNoData: 0 };
  if (!isDbAvailable()) return { ...res, error: "DB i pavlefshëm" };
  try {
    const open = await prisma.signalJournalEntry.findMany({
      where: { OR: [{ finalStatus: null }, { finalStatus: "open" }] },
      orderBy: { signalDate: "desc" },
      take: maxEntries,
    });
    if (!open.length) return res;

    // Mbledh simbolet që duhen qira (vlerësimi punon mbi qiratë e simbolit —
    // njësoj si backtest-et; kalendari SPY shërben vetëm për regjistrimin)
    const symbols = [...new Set(open.map((e) => e.symbol))];
    const barsBySymbol = new Map<string, SimpleBar[]>();
    const BATCH = 8;
    for (let i = 0; i < symbols.length; i += BATCH) {
      const batch = symbols.slice(i, i + BATCH);
      const settled = await Promise.allSettled(
        batch.map(async (s) => ({
          s,
          bars: (await fetchHistoricalData(s, "3mo", { interval: "1d" })) as
            | { date: string; open: number; high: number; low: number; close: number }[]
            | null,
        })),
      );
      for (const r of settled) {
        if (r.status === "fulfilled" && r.value.bars && r.value.bars.length) {
          barsBySymbol.set(
            r.value.s,
            r.value.bars.map((b) => ({
              date: b.date,
              open: b.open,
              high: b.high,
              low: b.low,
              close: b.close,
            })),
          );
        }
      }
    }

    for (const e of open) {
      // Mos e vlerëso nëse sinjali është i ardhshëm (asnjë ditë tregtare pas sinjalit)
      const entry = e as {
        id: string;
        strategy: string;
        symbol: string;
        signalDate: string;
        entryDate: string | null;
        entry: number | null;
        stop: number | null;
        target: number | null;
      };
      const bars = barsBySymbol.get(entry.symbol) ?? null;
      if (!bars || bars.length < 2) {
        res.skippedNoData += 1;
        continue;
      }

      const strat = entry.strategy as JournalStrategy;
      if (strat !== "CTC" && strat !== "REV") continue;
      let entryDate = entry.entryDate;
      let entryPrice = entry.entry;

      // CTC: hyrja reale = open e ditës së PARË tregtare PAS datës së sinjalit
      if (strat === "CTC" && (entryPrice === null || entryDate === null)) {
        const firstBar = bars.find((b) => b.date > entry.signalDate);
        if (!firstBar) continue; // dita e hyrjes ende s'ka ndodhur — prit Job B tjetër
        entryPrice = firstBar.open;
        entryDate = firstBar.date;
      }
      if (entryPrice === null || entryDate === null) {
        res.skippedNoData += 1;
        continue;
      }
      const stop = entry.stop;
      const target = entry.target;
      if (stop === null || target === null) {
        res.skippedNoData += 1;
        continue;
      }

      // CTC: hapja e ditës së hyrjes nën stop → hyrje e pavlefshme (risk ≤ 0)
      if (strat === "CTC" && entryPrice <= stop) {
        await prisma.signalJournalEntry.update({
          where: { id: entry.id },
          data: {
            entry: entryPrice,
            entryDate,
            finalStatus: "no_entry",
            finalDate: entryDate,
          },
        });
        res.evaluated += 1;
        res.locked += 1;
        continue;
      }

      const out = evaluateCheckpoints({
        strategy: strat,
        entry: entryPrice,
        stop,
        target,
        entryDate,
        bars,
      });
      if (!out) {
        res.skippedNoData += 1;
        continue;
      }

      // Mos shkruaj asgjë nëse s'ka asnjë checkpoint të ri (idempotencë e pastër)
      const existing = (e as unknown as { checkpoints?: CheckpointsMap | null }).checkpoints ?? {};
      const lastNew = (() => {
        const keys = ["d1", "d2", "d3", "d4", "d5"] as const;
        for (let i = keys.length - 1; i >= 0; i--) {
          if (out.checkpoints[keys[i]]) return keys[i];
        }
        return null;
      })();
      const lastOld = (() => {
        const keys = ["d1", "d2", "d3", "d4", "d5"] as const;
        for (let i = keys.length - 1; i >= 0; i--) {
          if (existing[keys[i]]) return keys[i];
        }
        return null;
      })();
      const unchanged =
        !lastNew ||
        (lastOld === lastNew &&
          existing[lastNew!]?.date === out.checkpoints[lastNew!]?.date &&
          (e as unknown as { finalStatus?: string }).finalStatus === out.finalStatus);
      if (unchanged) continue;

      await prisma.signalJournalEntry.update({
        where: { id: entry.id },
        data: {
          entry: entryPrice,
          entryDate,
          checkpoints: out.checkpoints as unknown as Prisma.InputJsonValue,
          finalStatus: out.finalStatus,
          finalDate: out.finalDate,
          finalDayN: out.finalDayN,
          exitPrice: out.exitPrice,
          resultR: out.resultR,
          mfeR: out.mfeR === 0 ? 0 : out.mfeR,
          maeR: out.maeR === 0 ? 0 : out.maeR,
          pnlPctNet: out.pnlPctNet,
        },
      });
      res.evaluated += 1;
      if (
        out.finalStatus !== "open" &&
        (e as unknown as { finalStatus?: string }).finalStatus !== out.finalStatus
      ) {
        res.locked += 1;
      }
    }
    return res;
  } catch (e: unknown) {
    return { ...res, error: e instanceof Error ? e.message : String(e) };
  }
}

// ═══════════════════════════════════════════════════════════════════
// STATISTIKAT (4B & 4C) — për horizont d1..d5, CTC/REV të ndara
// ═══════════════════════════════════════════════════════════════════

export interface StatRow {
  n: number; // sinjale me të paktën N ditë moshë (me dN të vlerësueshëm)
  targetPct: number; // kumulative — arritën target deri në ditën N
  stopPct: number; // kumulative — goditën stop (përfshi gap_stop) deri në ditën N
  openPct: number; // ende open
  meanR: number | null; // R mesatar në close të ditës N
  medianR: number | null;
  meanMfe: number | null;
  meanMae: number | null;
  meanPnlNet: number | null; // fitimi mesatar % pas kostos C
  smallSample: boolean; // n < 30 → "kampion i vogël, mos nxirr përfundime"
}

export type StatTable = Record<"d1" | "d2" | "d3" | "d4" | "d5", StatRow>;

const EMPTY_ROW: StatRow = {
  n: 0,
  targetPct: 0,
  stopPct: 0,
  openPct: 0,
  meanR: null,
  medianR: null,
  meanMfe: null,
  meanMae: null,
  meanPnlNet: null,
  smallSample: true,
};

function median(arr: number[]): number {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

interface JournalRowLike {
  strategy: string;
  sector: string | null;
  regime: string | null;
  entry: number | null;
  entryDate: string | null;
  stop: number | null;
  target: number | null;
  noSlot: boolean;
  finalStatus: string | null;
  finalDayN: number | null;
  resultR: number | null;
  mfeR: number | null;
  maeR: number | null;
  pnlPctNet: number | null;
  checkpoints: CheckpointsMap | null;
}

function rowForDn(rows: JournalRowLike[], dayN: number): StatRow {
  const keys = ["d1", "d2", "d3", "d4", "d5"] as const;
  const key = keys[dayN - 1];
  const eligible = rows.filter(
    (r) =>
      r.entry !== null &&
      r.entryDate !== null &&
      r.stop !== null &&
      r.target !== null &&
      r.finalStatus !== "no_entry" &&
      (r.checkpoints?.[key] != null ||
        (r.finalStatus !== "open" &&
          r.finalStatus !== null &&
          r.finalDayN !== null &&
          r.finalDayN <= dayN)),
  );
  const n = eligible.length;
  if (!n) return { ...EMPTY_ROW };
  let targets = 0;
  let stops = 0;
  let openCnt = 0;
  const rs: number[] = [];
  const mfes: number[] = [];
  const maes: number[] = [];
  const pnls: number[] = [];
  for (const r of eligible) {
    const lockedEarly =
      r.finalStatus !== "open" &&
      r.finalStatus !== null &&
      r.finalDayN !== null &&
      r.finalDayN <= dayN;
    if (r.finalStatus === "target") targets += 1;
    else if (r.finalStatus === "stop" || r.finalStatus === "gap_stop") stops += 1;
    else if (r.finalStatus === "open" || r.finalStatus === null) openCnt += 1;

    if (lockedEarly) {
      if (r.resultR !== null) rs.push(r.resultR);
      if (r.mfeR !== null) mfes.push(r.mfeR);
      if (r.maeR !== null) maes.push(r.maeR);
      if (r.pnlPctNet !== null) pnls.push(r.pnlPctNet);
    } else {
      const cp = r.checkpoints?.[key];
      if (cp) {
        rs.push(cp.rAtClose);
        mfes.push(cp.mfeR);
        maes.push(cp.maeR);
        pnls.push(((cp.close - r.entry!) / r.entry!) * 100 - JOURNAL_COST_PCT);
      }
    }
  }
  const avg = (a: number[]) =>
    a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
  return {
    n,
    targetPct: (targets / n) * 100,
    stopPct: (stops / n) * 100,
    openPct: (openCnt / n) * 100,
    meanR: avg(rs),
    medianR: rs.length ? median(rs) : null,
    meanMfe: avg(mfes),
    meanMae: avg(maes),
    meanPnlNet: avg(pnls),
    smallSample: n < 30,
  };
}

export interface SignalStats {
  byStrategy: { CTC: StatTable; REV: StatTable };
  bySector: Record<string, { CTC: StatTable; REV: StatTable }>;
  byRegime: Record<string, { CTC: StatTable; REV: StatTable }>;
}

export function computeSignalStats(rows: JournalRowLike[]): SignalStats {
  const emptyTable = (): StatTable => ({
    d1: { ...EMPTY_ROW },
    d2: { ...EMPTY_ROW },
    d3: { ...EMPTY_ROW },
    d4: { ...EMPTY_ROW },
    d5: { ...EMPTY_ROW },
  });
  const tableFor = (subset: JournalRowLike[]): StatTable => {
    const t = emptyTable();
    for (let d = 1; d <= 5; d++) t[`d${d}` as keyof StatTable] = rowForDn(subset, d);
    return t;
  };
  const group = (keyOf: (r: JournalRowLike) => string | null) => {
    const out: Record<string, { CTC: StatTable; REV: StatTable }> = {};
    for (const r of rows) {
      const k = keyOf(r);
      if (!k) continue;
      if (!out[k]) out[k] = { CTC: emptyTable(), REV: emptyTable() };
    }
    return out;
  };
  const stats: SignalStats = {
    byStrategy: {
      CTC: tableFor(rows.filter((r) => r.strategy === "CTC")),
      REV: tableFor(rows.filter((r) => r.strategy === "REV")),
    },
    bySector: group((r) => r.sector),
    byRegime: group((r) => r.regime),
  };
  for (const k of Object.keys(stats.bySector)) {
    stats.bySector[k].CTC = tableFor(rows.filter((r) => r.strategy === "CTC" && r.sector === k));
    stats.bySector[k].REV = tableFor(rows.filter((r) => r.strategy === "REV" && r.sector === k));
  }
  for (const k of Object.keys(stats.byRegime)) {
    stats.byRegime[k].CTC = tableFor(rows.filter((r) => r.strategy === "CTC" && r.regime === k));
    stats.byRegime[k].REV = tableFor(rows.filter((r) => r.strategy === "REV" && r.regime === k));
  }
  return stats;
}

// ── Data e sesionit ET (korrigjim para hapjes 09:30 → dita e mëparshme) ──
export function currentEtSessionDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = parseInt(get("hour"), 10);
  if (hour < 9) {
    const prev = new Date(Date.parse(`${date}T12:00:00Z`) - 86400_000);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(prev);
  }
  return date;
}
