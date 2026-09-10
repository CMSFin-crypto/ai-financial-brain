// ═══════════════════════════════════════════════════════════════
// DITARI TOP 10 — IBKR Trade Journal
// ═══════════════════════════════════════════════════════════════
// Sistemi mban ditar të detajuar VETËM për kandidatët e tregtimit
// (READY) brenda Top 10. Në ditar NUK futen:
//   - aksionet poshtë Top 10
//   - aksionet WATCHLIST / EVENT_RISK / EXTENDED
//   - aksionet me ATR BLOCK (ato retrogradohen në WATCHLIST)
//   - aksionet që nuk kalojnë risk gate (NO_TRADE)
//   - çdo sinjal i dobët që vetëm shfaqet në listën e skanimit
//
// Raporti i detajuar për një aksion shfaqet VETËM me kërkesë:
//   GET /api/journal/stock/[symbol]
// Pjesa tjetër e universit ruhet si snapshot i vogël (ScanSnapshot /
// SnapshotItem) — pa analizë të detajuar, vetëm për "missed winners".
// ═══════════════════════════════════════════════════════════════

import { prisma, isDbAvailable } from "@/lib/prisma";
import { fetchHistoricalData } from "@/lib/alpha-vantage";

const STRATEGY = "IBKR_PULLBACK";
const TOP_N = 10;

// Cilat vendime konsiderohen kandidatë tregtimi
const TRADE_STATUSES = new Set(["READY", "READY_TRADE", "TRADE"]);

// Ditë tregtimi maksimale para se sinjali të skadojë
const EXPIRY_BARS = 10;

// ── Tipet ──

export interface Top10Candidate {
  symbol: string;
  price: number;
  sector: string;
  totalScore: number;
  decision: string;
  entry: number;
  stop: number;
  target3R: number;
  rvol: number;
  rvolStatus: string;
  distFrom52wHighPct: number;
  atrPct: number;
  atrStatus: string;
  setup: string;
  reasons: string[];
  warnings: string[];
}

export interface JournalRegimeDetail {
  vix: { level: number; status: string };
  breadth: { pct: number; status: string };
  regimeLevel: string;
}

export interface Top10Ref {
  ticker: string;
  score?: number | null;
  status?: string | null;
  regimeLabel?: string | null;
}

// ── Data e sesionit ET ──

export function getEtDateStr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// ── Zgjedhja e Top 10 (vetëm kandidatë tregtimi) ──

export function selectTop10Candidates(rows: Top10Candidate[]): Top10Candidate[] {
  const eligible = rows.filter(
    (r) =>
      TRADE_STATUSES.has(String((r as any).decision || "").toUpperCase()) &&
      String((r as any).gateStatus || "") !== "NO_TRADE"
  );
  return eligible
    .sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
    .slice(0, TOP_N);
}

// ── Arsyja e ndryshimit të anëtarësimit në Top 10 ──

export function top10ChangeReason(
  old: Top10Ref | null,
  newRef: Top10Ref | null
): string {
  if (old === null && newRef !== null) {
    return "Hyri në Top 10: score ose setup u përmirësua";
  }
  if (old !== null && newRef === null) {
    return "Doli nga Top 10: score ra, gate u aktivizua ose u zëvendësua";
  }
  if (old && newRef) {
    const reasons: string[] = [];

    if (old.score !== newRef.score) {
      reasons.push("score ndryshoi");
    }

    const oldStatus = old.status;
    const newStatus = newRef.status;
    if (oldStatus !== newStatus) {
      reasons.push(`status ${oldStatus} → ${newStatus}`);
    }

    const oldRegime = old.regimeLabel;
    const newRegime = newRef.regimeLabel;
    if (oldRegime !== newRegime) {
      reasons.push(`regjim ${oldRegime} → ${newRegime}`);
    }

    if (!reasons.length) {
      reasons.push("u ndryshua ranking-u nga aksione të tjera");
    }

    return reasons.join("; ");
  }

  return "Pa ndryshim";
}

// ── Etiketat statike (në momentin e sinjalit) ──

export function staticTags(
  c: Top10Candidate,
  regimeLevel: string | null | undefined
): string[] {
  const tags: string[] = [];
  if ((c.rvol || 0) < 1.5) tags.push("NO_RVOL");
  if (regimeLevel && regimeLevel !== "OK") tags.push("REGIME");
  return tags;
}

// ── Pse hyri në Top 10 ──

function buildEnterReason(c: Top10Candidate): string {
  const bits: string[] = [];
  bits.push(`score ${Math.round(c.totalScore || 0)}`);
  if (c.setup && c.setup !== "NONE") bits.push(`setup ${c.setup}`);
  const topReasons = (c.reasons || []).slice(0, 2).map((r) => r.toLowerCase());
  if (topReasons.length) bits.push(topReasons.join("; "));
  return bits.join(" — ") || "kandidat tregtimi READY";
}

// ── Ingestimi: thirret nga /api/ibkr-scan pas çdo skanimi ──

export interface JournalIngestResult {
  dbActive: boolean;
  tablesReady: boolean;
  scanDate: string;
  saved: number;
  updated: number;
  reentered: number;
  exits: number;
  error?: string;
}

export async function ingestTop10Journal(params: {
  topStocks: Top10Candidate[];
  regimeDetail: JournalRegimeDetail;
}): Promise<JournalIngestResult> {
  const out: JournalIngestResult = {
    dbActive: false,
    tablesReady: false,
    scanDate: getEtDateStr(),
    saved: 0,
    updated: 0,
    reentered: 0,
    exits: 0,
  };
  if (!isDbAvailable()) return out;

  try {
    const scanDate = out.scanDate;
    const candidates = selectTop10Candidates(params.topStocks || []);
    const currentTickers = new Set(candidates.map((c) => c.symbol));

    const existing = await prisma.top10JournalEntry.findMany({
      where: { scanDate, strategy: STRATEGY },
    });
    out.tablesReady = true;

    const regime = params.regimeDetail || ({} as any);

    // Upsert kandidatët aktualë
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const prev = existing.find((e: any) => e.ticker === c.symbol);

      const data: any = {
        active: true,
        rank: i + 1,
        score: c.totalScore ?? null,
        status: String(c.decision || "READY").toUpperCase(),
        price: c.price ?? null,
        entry: c.entry ?? null,
        stop: c.stop ?? null,
        target: c.target3R ?? null,
        vixLevel: regime?.vix?.level ?? null,
        vixStatus: regime?.vix?.status ?? null,
        breadthPct: regime?.breadth?.pct ?? null,
        breadthStatus: regime?.breadth?.status ?? null,
        regimeLevel: regime?.regimeLevel ?? null,
        rvol: c.rvol ?? null,
        rvolStatus: c.rvolStatus ?? null,
        dist52wHighPct: c.distFrom52wHighPct ?? null,
        atrPct: c.atrPct ?? null,
        atrStatus: c.atrStatus ?? null,
        sector: c.sector ?? null,
        tags: staticTags(c, regime?.regimeLevel),
      };

      if (!prev) {
        await prisma.top10JournalEntry.create({
          data: {
            scanDate,
            strategy: STRATEGY,
            ticker: c.symbol,
            enterReason: buildEnterReason(c),
            ...data,
          },
        });
        out.saved++;
      } else {
        // Rifresko kontekstin pa prekur fushat e vlerësimit
        const patch: any = { ...data };
        if (!(prev as any).active) {
          patch.exitedAt = null;
          patch.changeReason = "Rikthyer në Top 10: score ose setup u përmirësua";
          out.reentered++;
        } else {
          patch.changeReason = top10ChangeReason(
            { ticker: c.symbol, score: (prev as any).score, status: (prev as any).status },
            { ticker: c.symbol, score: c.totalScore, status: String(c.decision || "READY").toUpperCase() }
          );
          out.updated++;
        }
        await prisma.top10JournalEntry.update({
          where: { id: (prev as any).id },
          data: patch,
        });
      }
    }

    // Shëno daljet nga Top 10 gjatë ditës
    for (const e of existing) {
      if ((e as any).active && !currentTickers.has((e as any).ticker)) {
        await prisma.top10JournalEntry.update({
          where: { id: (e as any).id },
          data: {
            active: false,
            exitedAt: new Date(),
            changeReason: top10ChangeReason(
              { ticker: (e as any).ticker, score: (e as any).score, status: (e as any).status },
              null
            ),
          },
        });
        out.exits++;
      }
    }

    return out;
  } catch (e: any) {
    out.error = e?.message || String(e);
    return out;
  }
}

// ── Vlerësimi i rezultateve (cron ditor, pas mbylljes) ──

interface BarOutcome {
  entryIdx: number;
  stopIdx: number | null;
  targetIdx: number | null;
  mfeR: number | null;
  maeR: number | null;
  resultR: number | null;
  exitStatus: string;
  barsSinceSignal: number;
}

function computeBarOutcome(
  bars: { date: string; high: number; low: number; close: number }[],
  scanDate: string,
  entry: number,
  stop: number,
  target: number
): BarOutcome {
  const after = bars.filter((b) => b.date > scanDate); // string compare ISO
  const risk = entry - stop;
  const res: BarOutcome = {
    entryIdx: -1,
    stopIdx: null,
    targetIdx: null,
    mfeR: null,
    maeR: null,
    resultR: null,
    exitStatus: "OPEN",
    barsSinceSignal: after.length,
  };

  // Ku u aktivizua hyrja (high >= entry)
  for (let i = 0; i < after.length; i++) {
    if (after[i].high >= entry) {
      res.entryIdx = i;
      break;
    }
  }

  if (res.entryIdx < 0) {
    // Hyrja nuk u kapa kurrë
    if (after.length >= EXPIRY_BARS) res.exitStatus = "NO_FILL";
    return res;
  }

  // MFE / MAE nga dita e hyrjes në fund
  let maxHigh = -Infinity;
  let minLow = Infinity;
  for (let i = res.entryIdx; i < after.length; i++) {
    if (after[i].high > maxHigh) maxHigh = after[i].high;
    if (after[i].low < minLow) minLow = after[i].low;
  }
  if (risk > 0) {
    res.mfeR = Math.round(((maxHigh - entry) / risk) * 100) / 100;
    res.maeR = Math.round(((entry - minLow) / risk) * 100) / 100;
  }

  // Stop / target që nga dita e hyrjes
  for (let i = res.entryIdx; i < after.length; i++) {
    if (after[i].low <= stop) {
      res.stopIdx = i;
      break;
    }
  }
  for (let i = res.entryIdx; i < after.length; i++) {
    if (after[i].high >= target) {
      res.targetIdx = i;
      break;
    }
  }

  const barsSinceEntry = after.length - res.entryIdx;

  if (res.stopIdx !== null && res.targetIdx !== null) {
    // Të dyja — konservativisht stop-i i parë (nëse bie në të njëjtën ditë)
    res.exitStatus = res.stopIdx <= res.targetIdx ? "HIT_STOP" : "HIT_TARGET";
  } else if (res.stopIdx !== null) {
    res.exitStatus = "HIT_STOP";
  } else if (res.targetIdx !== null) {
    res.exitStatus = "HIT_TARGET";
  } else if (barsSinceEntry >= EXPIRY_BARS) {
    res.exitStatus = "EXPIRED";
  }

  if (res.exitStatus === "HIT_TARGET") {
    res.resultR = risk > 0 ? Math.round(((target - entry) / risk) * 100) / 100 : null;
  } else if (res.exitStatus === "HIT_STOP") {
    res.resultR = -1;
  } else if (res.exitStatus === "EXPIRED") {
    const lastClose = after[after.length - 1].close;
    res.resultR = risk > 0 ? Math.round(((lastClose - entry) / risk) * 100) / 100 : null;
  } else if (res.exitStatus === "OPEN") {
    const lastClose = after[after.length - 1].close;
    res.resultR = risk > 0 ? Math.round(((lastClose - entry) / risk) * 100) / 100 : null; // i parealizuar
  }

  return res;
}

// ── Ndërtimi i diagnozës + mësimi (shqip) ──

export function buildEvalNote(entry: any, calc: BarOutcome): string {
  const L: string[] = [];

  const t = entry.ticker;
  if (calc.exitStatus === "HIT_TARGET") {
    L.push(`${t} e kapi target-in dhe mbylli në fitim.`);
  } else if (calc.exitStatus === "HIT_STOP") {
    L.push(`${t} nuk e kapi target-in — goditi stop-in.`);
  } else if (calc.exitStatus === "NO_FILL") {
    L.push(`${t} nuk e kapi hyrjen — sinjali mbeti i pafilluar.`);
  } else if (calc.exitStatus === "EXPIRED") {
    L.push(`${t} skadoi pa goditur as target-in as stop-in.`);
  } else {
    L.push(`${t} është ende hapur.`);
  }

  L.push(`- Status: ${calc.exitStatus}`);
  if (calc.resultR !== null && calc.resultR !== undefined) {
    L.push(`- Rezultati: ${calc.resultR > 0 ? "+" : ""}${calc.resultR.toFixed(2)}R`);
  }
  if (calc.mfeR !== null) L.push(`- MFE: +${calc.mfeR.toFixed(2)}R`);
  if (calc.maeR !== null) L.push(`- MAE: -${Math.abs(calc.maeR).toFixed(2)}R`);
  if (entry.rvol != null) {
    L.push(
      `- RVOL: ${entry.rvol.toFixed(2)}x${entry.rvol < 1.5 ? ", nën 1.5x" : ""}`
    );
  }
  if (entry.atrPct != null) {
    L.push(`- ATR%: ${entry.atrPct.toFixed(1)}%${entry.atrStatus ? ` (${entry.atrStatus})` : ""}`);
  }
  if (entry.regimeLevel) L.push(`- Regjimi: ${entry.regimeLevel}`);

  // Etiketat e arsyes
  const outcomeTags: string[] = [];
  if (calc.exitStatus === "HIT_TARGET") outcomeTags.push("CONTINUATION");
  if (calc.exitStatus === "HIT_STOP") outcomeTags.push("FADE");
  if (calc.mfeR !== null && calc.mfeR >= 1 && (calc.resultR ?? 0) < 0.5) outcomeTags.push("GAVE_BACK");
  if (calc.exitStatus === "NO_FILL") outcomeTags.push("NO_FILL");
  const allTags = [...new Set([...(entry.tags || []), ...outcomeTags])];
  if (allTags.length) L.push(`- Arsye: ${allTags.join(" + ")}`);

  // Diagnoza
  const diag: string[] = [];
  if (calc.exitStatus === "HIT_STOP") {
    if ((entry.rvol || 0) < 1.5 && (entry.tags || []).includes("NO_RVOL")) {
      diag.push("Sinjali ishte teknikisht READY, por nuk pati follow-through — hyrja pa konfirmim volumi (RVOL nën 1.5x).");
    } else {
      diag.push("Setup-i teknikisht i vlefshëm, por tregu nuk e ndoqi drejtimin — sinjali u kthye (fade).");
    }
    if ((entry.regimeLevel || "OK") !== "OK") {
      diag.push(`Hyrja u bë gjatë regjimit ${entry.regimeLevel} — kushte kundërshtare për swing long.`);
    }
  } else if (calc.exitStatus === "HIT_TARGET") {
    diag.push("Setup-i u konfirmua plotësisht — faktorët pozitivë në momentin e sinjalit funksionuan.");
  } else if (calc.exitStatus === "GAVE_BACK" || outcomeTags.includes("GAVE_BACK")) {
    diag.push(`Fitimi maksimal arriti +${(calc.mfeR || 0).toFixed(2)}R por u kthye mbrapa — fitting-u nuk u mbrojt.`);
  } else if (calc.exitStatus === "NO_FILL") {
    diag.push("Çmimi nuk e kapi nivelin e hyrjes — sinjali ishte i saktë në drejtim por jo në ekzekutim.");
  } else if (calc.exitStatus === "EXPIRED") {
    diag.push("Asnjë nga nivelet nuk u godit brenda dritares së 10 ditëve — momentum i mangët.");
  }
  if (diag.length) L.push(`\nDiagnoza: ${diag.join(" ")}`);

  // Mësimi
  const lesson: string[] = [];
  if (outcomeTags.includes("FADE") && (entry.tags || []).includes("NO_RVOL")) {
    lesson.push("Në kushte të ngjashme, kërko RVOL ≥ 1.5 ose zvogëlo madhësinë e pozicionit.");
  }
  if ((entry.tags || []).includes("REGIME") && calc.exitStatus === "HIT_STOP") {
    lesson.push("Gjatë CAUTION/RISK, hyr vetëm me pozicion të reduktuar ose prit konfirmim breadth-i.");
  }
  if (outcomeTags.includes("GAVE_BACK")) {
    lesson.push("Mbyll 25-50% në 1R dhe ngre stop-in në breakeven për të mbrojtur fitimin.");
  }
  if (calc.exitStatus === "HIT_TARGET") {
    lesson.push("Ky kombinim faktorësh ka funksionuar — peshoje pozitivisht në raste analoge.");
  }
  if (!lesson.length) {
    lesson.push("Vazhdo monitorimin — ende pa rezultat final.");
  }
  L.push(`\nMësimi: ${lesson.join(" ")}`);

  return L.join("\n");
}

export interface JournalEvalResult {
  dbActive: boolean;
  checked: number;
  finalized: number;
  updated: number;
  errors: string[];
}

export async function evaluateTop10Journal(
  limit = 30
): Promise<JournalEvalResult> {
  const out: JournalEvalResult = {
    dbActive: false,
    checked: 0,
    finalized: 0,
    updated: 0,
    errors: [],
  };
  if (!isDbAvailable()) return out;

  try {
    const today = getEtDateStr();
    const pending = await prisma.top10JournalEntry.findMany({
      where: {
        scanDate: { lt: today },
        OR: [
          { exitStatus: null },
          { exitStatus: "OPEN" },
          // Hyrje të shënuara nga vëzhguesi intraday (price-watch) pa metrika
          // të plota — ripërpunohen me bar-e ditore (MFE/MAE/resultR/diagnozë)
          { AND: [{ exitStatus: { in: ["HIT_TARGET", "HIT_STOP"] } }, { resultR: null }] },
        ],
      },
      orderBy: { scanDate: "asc" },
      take: limit,
    });
    out.dbActive = true;
    out.checked = pending.length;

    for (const entry of pending) {
      try {
        const e: any = entry;
        if (e.entry == null || e.stop == null || e.target == null) {
          await prisma.top10JournalEntry.update({
            where: { id: e.id },
            data: { exitStatus: "EXPIRED", evalNote: "Nivelet e hyrjes mungonin në momentin e sinjalit." },
          });
          continue;
        }

        const bars = await fetchHistoricalData(e.ticker, "1mo");
        if (!bars || bars.length < 2) {
          out.errors.push(`${e.ticker}: pa të dhëna çmimi`);
          continue;
        }

        const calc = computeBarOutcome(
          bars as any[],
          e.scanDate,
          e.entry,
          e.stop,
          e.target
        );

        const outcomeTags: string[] = [];
        if (calc.exitStatus === "HIT_TARGET") outcomeTags.push("CONTINUATION");
        if (calc.exitStatus === "HIT_STOP") outcomeTags.push("FADE");
        if (calc.exitStatus === "NO_FILL") outcomeTags.push("NO_FILL");
        if (calc.mfeR !== null && calc.mfeR >= 1 && (calc.resultR ?? 0) < 0.5) outcomeTags.push("GAVE_BACK");
        const tags = [...new Set([...(e.tags || []), ...outcomeTags])];

        const finalized =
          calc.exitStatus === "HIT_TARGET" ||
          calc.exitStatus === "HIT_STOP" ||
          calc.exitStatus === "EXPIRED" ||
          calc.exitStatus === "NO_FILL";

        await prisma.top10JournalEntry.update({
          where: { id: e.id },
          data: {
            entryHit: calc.entryIdx >= 0,
            entryHitAt:
              calc.entryIdx >= 0
                ? new Date((bars as any[]).filter((b: any) => b.date > e.scanDate)[calc.entryIdx]?.date || Date.now())
                : null,
            targetHit: calc.exitStatus === "HIT_TARGET",
            stopHit: calc.exitStatus === "HIT_STOP",
            mfeR: calc.mfeR,
            maeR: calc.maeR,
            resultR: calc.resultR,
            exitStatus: calc.exitStatus,
            tags,
            evalNote: buildEvalNote(e, calc),
          },
        });
        out.updated++;
        if (finalized) out.finalized++;
      } catch (err: any) {
        out.errors.push(`${(entry as any).ticker}: ${err?.message || err}`);
      }
    }
  } catch (err: any) {
    out.errors.push(err?.message || String(err));
  }
  return out;
}

// ── Statusi + lista e ditës (për UI) ──

export interface JournalToday {
  dbActive: boolean;
  tablesReady: boolean;
  scanDate: string;
  entries: any[];
  recent: any[];
  totals?: { entries: number; hits: number; stops: number; open: number };
  error?: string;
}

export async function getJournalToday(): Promise<JournalToday> {
  const scanDate = getEtDateStr();
  const base: JournalToday = {
    dbActive: false,
    tablesReady: false,
    scanDate,
    entries: [],
    recent: [],
  };
  if (!isDbAvailable()) return base;

  try {
    const entries = await prisma.top10JournalEntry.findMany({
      where: { scanDate, strategy: STRATEGY },
      orderBy: { rank: "asc" },
    });
    const recent = await prisma.top10JournalEntry.findMany({
      where: {
        scanDate: { lt: scanDate },
        exitStatus: { in: ["HIT_TARGET", "HIT_STOP", "EXPIRED", "NO_FILL"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    });
    const stats = await prisma.top10JournalEntry.aggregate({
      where: { exitStatus: { not: null } },
      _count: { _all: true },
    });
    const hits = await prisma.top10JournalEntry.count({
      where: { exitStatus: "HIT_TARGET" },
    });
    const stops = await prisma.top10JournalEntry.count({
      where: { exitStatus: "HIT_STOP" },
    });

    return {
      dbActive: true,
      tablesReady: true,
      scanDate,
      entries: entries as any[],
      recent: recent as any[],
      totals: { entries: stats._count._all, hits, stops, open: 0 },
    };
  } catch (e: any) {
    return { ...base, dbActive: true, error: e?.message || String(e) };
  }
}

// ── Raporti i detajuar për një aksion (vetëm me kërkesë) ──

export interface StockJournalReport {
  symbol: string;
  message?: string;
  entries?: any[];
  stats?: {
    total: number;
    targetHits: number;
    stopHits: number;
    hitRate: number | null;
    avgResultR: number | null;
    tags: { tag: string; count: number }[];
  };
  evalNote?: string | null;
}

export async function buildStockReport(
  symbol: string,
  days = 30
): Promise<StockJournalReport> {
  const ticker = symbol.toUpperCase().trim();
  if (!isDbAvailable()) {
    return { symbol: ticker, message: "Databaza nuk është aktive (mungon DATABASE_URL)." };
  }

  const fromDate = getEtDateStr(
    new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  );

  const entries = await prisma.top10JournalEntry.findMany({
    where: { ticker, scanDate: { gte: fromDate } },
    orderBy: { scanDate: "desc" },
  });

  if (!entries.length) {
    return {
      symbol: ticker,
      message: "Ky aksion nuk ka raport të ruajtur në Top 10.",
    };
  }

  const closed = (entries as any[]).filter(
    (e) => e.exitStatus === "HIT_TARGET" || e.exitStatus === "HIT_STOP"
  );
  const targetHits = closed.filter((e) => e.exitStatus === "HIT_TARGET").length;
  const stopHits = closed.filter((e) => e.exitStatus === "HIT_STOP").length;
  const withR = (entries as any[]).filter((e) => e.resultR != null);
  const avgResultR = withR.length
    ? Math.round((withR.reduce((s, e) => s + (e.resultR || 0), 0) / withR.length) * 100) / 100
    : null;

  const tagCount = new Map<string, number>();
  for (const e of entries as any[]) {
    for (const t of e.tags || []) tagCount.set(t, (tagCount.get(t) || 0) + 1);
  }
  const tags = [...tagCount.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  return {
    symbol: ticker,
    entries: entries as any[],
    stats: {
      total: entries.length,
      targetHits,
      stopHits,
      hitRate: closed.length ? Math.round((targetHits / closed.length) * 100) : null,
      avgResultR,
      tags,
    },
    evalNote: (entries[0] as any)?.evalNote || null,
  };
}

// ── Raporti javor (i shkurtër automatikisht) ──

export interface WeeklyReport {
  dbActive: boolean;
  window: { days: number; from: string; to: string };
  totals: {
    entries: number;
    closed: number;
    targetHits: number;
    stopHits: number;
    expired: number;
    open: number;
  };
  hitRate: number | null;
  directionAccuracy: number | null;
  expectancyR: number | null;
  avgMfeR: number | null;
  avgMaeR: number | null;
  mistakes: { tag: string; count: number }[];
  winningFactors: { tag: string; count: number }[];
  topTrades: any[];
  worstTrades: any[];
  missedWinners: {
    symbol: string;
    scanDate: string;
    score: number | null;
    ret5dPct: number | null;
    verdict: string;
  }[];
  error?: string;
}

export async function buildWeeklyReport(days = 7): Promise<WeeklyReport> {
  const to = getEtDateStr();
  const from = getEtDateStr(new Date(Date.now() - days * 24 * 60 * 60 * 1000));

  const base: WeeklyReport = {
    dbActive: false,
    window: { days, from, to },
    totals: { entries: 0, closed: 0, targetHits: 0, stopHits: 0, expired: 0, open: 0 },
    hitRate: null,
    directionAccuracy: null,
    expectancyR: null,
    avgMfeR: null,
    avgMaeR: null,
    mistakes: [],
    winningFactors: [],
    topTrades: [],
    worstTrades: [],
    missedWinners: [],
  };
  if (!isDbAvailable()) return base;

  try {
    const entries = await prisma.top10JournalEntry.findMany({
      where: { scanDate: { gte: from, lte: to } },
      orderBy: { scanDate: "desc" },
    });
    base.dbActive = true;

    const list = entries as any[];
    const closed = list.filter(
      (e) => e.exitStatus === "HIT_TARGET" || e.exitStatus === "HIT_STOP"
    );
    const targetHits = list.filter((e) => e.exitStatus === "HIT_TARGET").length;
    const stopHits = list.filter((e) => e.exitStatus === "HIT_STOP").length;
    const expired = list.filter(
      (e) => e.exitStatus === "EXPIRED" || e.exitStatus === "NO_FILL"
    ).length;
    const open = list.filter((e) => e.exitStatus === "OPEN" || e.exitStatus == null).length;
    const withR = list.filter((e) => e.resultR != null);
    const winners = withR.filter((e) => (e.resultR || 0) > 0);
    const losers = withR.filter((e) => (e.resultR || 0) <= 0);

    base.totals = {
      entries: list.length,
      closed: closed.length,
      targetHits,
      stopHits,
      expired,
      open,
    };
    base.hitRate = closed.length ? Math.round((targetHits / closed.length) * 100) : null;
    base.directionAccuracy = withR.length
      ? Math.round((winners.length / withR.length) * 100)
      : null;
    base.expectancyR = withR.length
      ? Math.round((withR.reduce((s, e) => s + (e.resultR || 0), 0) / withR.length) * 100) / 100
      : null;
    const mfes = list.filter((e) => e.mfeR != null);
    const maes = list.filter((e) => e.maeR != null);
    base.avgMfeR = mfes.length
      ? Math.round((mfes.reduce((s, e) => s + (e.mfeR || 0), 0) / mfes.length) * 100) / 100
      : null;
    base.avgMaeR = maes.length
      ? Math.round((maes.reduce((s, e) => s + (e.maeR || 0), 0) / maes.length) * 100) / 100
      : null;

    const tagCount = (src: any[]) => {
      const m = new Map<string, number>();
      for (const e of src) for (const t of e.tags || []) m.set(t, (m.get(t) || 0) + 1);
      return [...m.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count);
    };
    base.mistakes = tagCount(losers).slice(0, 3);
    base.winningFactors = tagCount(winners).slice(0, 3);

    const sorted = [...withR].sort((a, b) => (b.resultR || 0) - (a.resultR || 0));
    base.topTrades = sorted.slice(0, 3).map(pickTrade);
    base.worstTrades = sorted.slice(-3).reverse().map(pickTrade);

    // Missed winners — aksionet jashtë Top 10 që ecën mirë
    base.missedWinners = await computeMissedWinners(
      from,
      new Set(list.map((e) => e.ticker))
    );
  } catch (e: any) {
    base.error = e?.message || String(e);
  }
  return base;
}

function pickTrade(e: any) {
  return {
    ticker: e.ticker,
    scanDate: e.scanDate,
    exitStatus: e.exitStatus,
    resultR: e.resultR,
    mfeR: e.mfeR,
    score: e.score,
    tags: e.tags,
  };
}

// ── Missed winners: snapshot i vogël i universit (SnapshotItem) ──

async function computeMissedWinners(
  fromDate: string,
  journalTickers: Set<string>
): Promise<WeeklyReport["missedWinners"]> {
  const out: WeeklyReport["missedWinners"] = [];
  try {
    const from = new Date(`${fromDate}T00:00:00Z`);
    const snapshots = await prisma.scanSnapshot.findMany({
      where: { sessionDate: { gte: from } },
      orderBy: { scannedAt: "desc" },
      include: { items: true },
      take: 40,
    });

    // Snapshot-i i fundit për çdo datë sesioni
    const byDate = new Map<string, any>();
    for (const s of snapshots) {
      const key = getEtDateStr(new Date((s as any).sessionDate));
      if (!byDate.has(key)) byDate.set(key, s);
    }

    // Kandidatët jashtë ditarit me score të lartë
    const seen = new Map<string, { symbol: string; scanDate: string; score: number }>();
    for (const [date, s] of byDate) {
      const items = ((s as any).items || []) as any[];
      for (const it of items) {
        if (journalTickers.has(it.symbol)) continue; // ishte në ditar
        if (it.gated) continue; // NO_TRADE gate
        if ((it.score || 0) < 55) continue;
        const prev = seen.get(it.symbol);
        if (!prev || it.score > prev.score) {
          seen.set(it.symbol, { symbol: it.symbol, scanDate: date, score: it.score });
        }
      }
    }

    const candidates = [...seen.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    for (const c of candidates) {
      try {
        const bars = (await fetchHistoricalData(c.symbol, "1mo")) as any[] | null;
        if (!bars) continue;
        const after = bars.filter((b) => b.date > c.scanDate);
        if (after.length < 3) continue;
        const startClose =
          bars.filter((b) => b.date <= c.scanDate).slice(-1)[0]?.close ?? null;
        if (startClose == null) continue;
        const window = after.slice(0, 5);
        const endClose = window[window.length - 1].close;
        const ret5d = Math.round(((endClose - startClose) / startClose) * 1000) / 10;
        if (ret5d >= 3) {
          out.push({
            symbol: c.symbol,
            scanDate: c.scanDate,
            score: c.score,
            ret5dPct: ret5d,
            verdict: `+${ret5d}% brenda 5 ditësh pa qenë në Top 10`,
          });
        }
      } catch { /* kap individualisht */ }
    }

    out.sort((a, b) => (b.ret5dPct || 0) - (a.ret5dPct || 0));
  } catch { /* jo kritike */ }
  return out.slice(0, 5);
}
