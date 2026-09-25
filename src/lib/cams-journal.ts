// ═══════════════════════════════════════════════════════════════
// DITARI JAVOR TOP 10 — CAMS + IBKR (Task 19)
// ═══════════════════════════════════════════════════════════════
// "Çdo javë të mbajë shënime që të mësoj nga gabimet":
//   1. Ingest: Top 10 CAMS ruhet në Top10JournalEntry (strategy="CAMS")
//      me kontekst të plotë JSON (sub-score-t, setup-i, gap-u, nivelet).
//   2. Review javor: për çdo javë — a u rritën? sa % (5d/10d/20d)?
//      ÇFARË ndikoi të rriteshin ose jo (gap-u u mbajt? breakout u krye?
//      volumi u forcua? regjimi?) — analizë automatike në shqip.
//   3. Mësime automatike të javës: krahasimi fitues vs humbës sipas
//      faktorëve, që përdoruesi të parashikojë më mirë në të ardhmen.
//   4. Shënime të përdoruesit: WeeklyReviewNote (javë + ticker).
// ═══════════════════════════════════════════════════════════════

import { prisma, isDbAvailable } from "@/lib/prisma";
import { fetchHistoricalData, HistoricalDataPoint } from "@/lib/alpha-vantage";

// ── Data e hënës së javës (ISO) ──

export function getWeekStartStr(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=e dielë
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split("T")[0];
}

// ── Ingestimi: thirret nga /api/cams-scan pas çdo skanimi ──

export interface CamsIngestRow {
  ticker: string;
  rank: number;
  price: number;
  sector: string;
  score: number;
  tier: string;
  setup: string;
  entry: number;
  stop: number;
  target3R: number;
  rvol: number;
  atrPct: number;
  rsi14: number;
  adx14: number;
  extensionAtr: number;
  extensionFiltered: boolean;
  daysToEarnings: number | null;
  gapUp: { daysAgo: number; gapPct: number; rvolOnGap: number; closeOnGap: number; date: string } | null;
  sub: { catalyst: number; acceleration: number; structure: number; revision: number; regime: number; penalty: number };
  catalystEvidence: string[];
  warnings: string[];
  regime: { spyAbove50: boolean; spyAbove200: boolean; qqqAbove50: boolean; qqqAbove200: boolean; sectorAbove50: boolean; sectorVsSpy20d: number };
  high20: number;
  consolidationHigh: number;
}

export function getEtDateStr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export async function ingestCamsJournal(rows: CamsIngestRow[]): Promise<{ saved: number; updated: number; error?: string }> {
  const out = { saved: 0, updated: 0, error: undefined as string | undefined };
  if (!isDbAvailable()) return out;
  try {
    const scanDate = getEtDateStr();
    const existing = await prisma.top10JournalEntry.findMany({
      where: { scanDate, strategy: "CAMS" },
    });
    const currentTickers = new Set(rows.map((r) => r.ticker));

    for (const r of rows) {
      const prev = existing.find((e: any) => e.ticker === r.ticker);
      const tags: string[] = [
        `SETUP_${r.setup}`,
        `TIER_${r.tier}`,
        ...(r.rvol < 1.5 ? ["NO_RVOL"] : []),
        ...(r.extensionFiltered ? ["EXTENDED"] : []),
        ...(r.daysToEarnings != null && r.daysToEarnings <= 3 ? ["EARNINGS_SOON"] : []),
      ];
      const regimeOk = r.regime.spyAbove50 && r.regime.spyAbove200 && r.regime.qqqAbove50 && r.regime.qqqAbove200;
      if (!regimeOk) tags.push("REGIME");

      const data: any = {
        active: true,
        rank: r.rank,
        score: r.score,
        status: r.tier,
        price: r.price,
        entry: r.entry,
        stop: r.stop,
        target: r.target3R,
        rvol: r.rvol,
        rvolStatus: r.rvol >= 1.5 ? "HIGH" : r.rvol >= 0.8 ? "NORMAL" : "LOW",
        atrPct: r.atrPct,
        atrStatus: r.atrPct > 5 ? "TOO_VOLATILE" : r.atrPct < 1.5 ? "TOO_SLOW" : "OK",
        sector: r.sector,
        regimeLevel: regimeOk ? "OK" : "CAUTION",
        tags,
        // Konteksti i plotë CAMS për analizën javore "çfarë ndikoi"
        context: {
          sub: r.sub,
          setup: r.setup,
          tier: r.tier,
          gapUp: r.gapUp,
          catalystEvidence: r.catalystEvidence.slice(0, 6),
          warnings: r.warnings.slice(0, 6),
          extensionAtr: r.extensionAtr,
          daysToEarnings: r.daysToEarnings,
          rsi14: r.rsi14,
          adx14: r.adx14,
          high20: r.high20,
          consolidationHigh: r.consolidationHigh,
          regime: r.regime,
        } as any,
      };

      if (!prev) {
        await prisma.top10JournalEntry.create({
          data: {
            scanDate,
            strategy: "CAMS",
            ticker: r.ticker,
            enterReason: r.catalystEvidence.slice(0, 3).join(" · ") || `CAMS ${r.score} — ${r.setup}`,
            ...data,
          },
        });
        out.saved++;
      } else {
        await prisma.top10JournalEntry.update({
          where: { id: (prev as any).id },
          data,
        });
        out.updated++;
      }
    }

    // Dil ata që s'janë më në Top 10 të ditës
    for (const e of existing as any[]) {
      if (e.active && !currentTickers.has(e.ticker)) {
        await prisma.top10JournalEntry.update({
          where: { id: e.id },
          data: { active: false, exitedAt: new Date(), changeReason: "Doli nga Top 10 CAMS i ditës" },
        });
      }
    }
    return out;
  } catch (e: any) {
    out.error = e?.message || String(e);
    return out;
  }
}

// ── Llogaritja e rezultatit nga bar-et pas skanimit ──

interface StockOutcome {
  ret5d: number | null;
  ret10d: number | null;
  ret20d: number | null;
  maxRunupPct: number | null;   // max high brenda 10 ditësh
  maxDrawdownPct: number | null; // min low brenda 10 ditësh
  entryHit: boolean | null;
  stopHit: boolean | null;
  targetHit: boolean | null;
  volAfterVsBefore: number | null; // volumi mesatar 5d pas / 20d para skanimit
  brokeHigh20: boolean | null;     // theu high20 brenda 10 ditësh
}

function computeOutcome(
  bars: HistoricalDataPoint[],
  scanDate: string,
  levels: { entry: number | null; stop: number | null; target: number | null },
  refHigh: number | null
): StockOutcome {
  const before = bars.filter((b) => b.date <= scanDate);
  const after = bars.filter((b) => b.date > scanDate);
  const base = before.length > 0 ? before[before.length - 1].close : null;

  const o: StockOutcome = {
    ret5d: null, ret10d: null, ret20d: null,
    maxRunupPct: null, maxDrawdownPct: null,
    entryHit: null, stopHit: null, targetHit: null,
    volAfterVsBefore: null, brokeHigh20: null,
  };
  if (base == null || after.length === 0) return o;

  const ret = (n: number) =>
    after.length >= n && after[n - 1]?.close != null
      ? Math.round(((after[n - 1].close - base) / base) * 1000) / 10
      : null;
  o.ret5d = ret(5);
  o.ret10d = ret(10);
  o.ret20d = ret(20);

  const win = after.slice(0, 10);
  const maxHigh = Math.max(...win.map((b) => b.high));
  const minLow = Math.min(...win.map((b) => b.low));
  o.maxRunupPct = Math.round(((maxHigh - base) / base) * 1000) / 10;
  o.maxDrawdownPct = Math.round(((minLow - base) / base) * 1000) / 10;

  if (refHigh != null && refHigh > 0) o.brokeHigh20 = maxHigh > refHigh;

  // Entry/stop/target brenda 10 ditësh (si computeBarOutcome i IBKR)
  if (levels.entry != null && levels.stop != null && levels.target != null) {
    let entryIdx = -1;
    for (let i = 0; i < win.length; i++) {
      if (win[i].high >= levels.entry) { entryIdx = i; break; }
    }
    if (entryIdx >= 0) {
      o.entryHit = true;
      o.stopHit = win.slice(entryIdx).some((b) => b.low <= levels.stop!);
      o.targetHit = win.slice(entryIdx).some((b) => b.high >= levels.target!);
    } else {
      o.entryHit = false;
    }
  }

  // Volumi: mesatarja 5d pas vs 20d para
  const volAfter = after.slice(0, 5);
  const volBefore = before.slice(-20);
  if (volAfter.length > 0 && volBefore.length > 0) {
    const a = volAfter.reduce((s, b) => s + b.volume, 0) / volAfter.length;
    const b = volBefore.reduce((s, x) => s + x.volume, 0) / volBefore.length;
    o.volAfterVsBefore = b > 0 ? Math.round((a / b) * 100) / 100 : null;
  }
  return o;
}

// ── Analiza "çfarë ndikoi" (shqip) ──

function buildAnalysis(
  ctx: any,            // context JSON i CAMS (mund të jetë null për IBKR)
  entry: any,          // rreshti i ditarit
  o: StockOutcome,
  lastClose: number | null
): string[] {
  const A: string[] = [];
  const t = entry.ticker;

  // 1. Rezultati kryesor
  if (o.ret10d != null) {
    if (o.ret10d >= 2) A.push(`U rrit +${o.ret10d}% brenda 10 ditësh${o.maxRunupPct != null ? ` (maksimumi +${o.maxRunupPct}%)` : ""}.`);
    else if (o.ret10d <= -2) A.push(`Ra ${o.ret10d}% brenda 10 ditësh${o.maxDrawdownPct != null ? ` (rënia maksimale ${o.maxDrawdownPct}%)` : ""}.`);
    else A.push(`Lëvizje e vogël (${o.ret10d > 0 ? "+" : ""}${o.ret10d}%) — as ngritje as rënie e qartë.`);
  } else {
    A.push("Ende pa 10 ditë tregtimi që nga skanimi — rezultati i pjesshëm.");
  }

  // 2. Gap-u i katalizatorit — u mbajt apo u mbush?
  if (ctx?.gapUp?.date && lastClose != null) {
    const g = ctx.gapUp as { date: string; gapPct: number; closeOnGap: number };
    if (lastClose > g.closeOnGap * 1.02) A.push(`Katalizatori funksionoi: gap-u i ${g.date} (+${g.gapPct.toFixed(1)}%) u mbajt dhe u zgjerua — drift PEAD i vërtetë.`);
    else if (lastClose > g.closeOnGap * 0.98) A.push(`Gap-u i ${g.date} (+${g.gapPct.toFixed(1)}%) po mbahet kryesisht — drift neutral.`);
    else A.push(`Gap-u i ${g.date} (+${g.gapPct.toFixed(1)}%) U MBUSH plotësisht — katalizatori nuk i mbijetoi testit, drift-i dështoi.`);
  }

  // 3. Breakout-i
  if (o.brokeHigh20 === true) A.push(`Theu majën 20-ditore — breakout u krye brenda dritares.`);
  else if (o.brokeHigh20 === false) A.push(`Nuk theu majën 20-ditore — breakout-i s'u krye, çmimi mbeti nën zonën e thyerjes.`);

  // 4. Volumi pas skanimit
  if (o.volAfterVsBefore != null) {
    if (o.volAfterVsBefore >= 1.3) A.push(`Volumi u forcua në ${o.volAfterVsBefore}x pas skanimit — interes real blerës e shoqëroi lëvizjen.`);
    else if (o.volAfterVsBefore < 0.75) A.push(`Volumi ra në ${o.volAfterVsBefore}x — interesi u fik, lëvizja s'kishte ndjekës.`);
  }

  // 5. Ekzekutimi i planit
  if (o.entryHit === false) A.push("Hyrja e planifikuar nuk u aktivizua kurrë — sinjali mbeti i pafilluar (NO_FILL).");
  if (o.entryHit === true) {
    if (o.targetHit) A.push(`Plani funksionoi: hyrja u aktivizua dhe targeti 3R ($${entry.target?.toFixed(2)}) u kap.`);
    else if (o.stopHit) A.push(`Hyrja u aktivizua por goditi stop-in ($${entry.stop?.toFixed(2)}) — kjo është humbja e kontrolluar 1R.`);
    else A.push("Hyrja u aktivizua — ende hapur brenda dritares.");
  }

  // 6. Regjimi në momentin e sinjalit
  if (ctx?.regime) {
    const ok = ctx.regime.spyAbove50 && ctx.regime.spyAbove200 && ctx.regime.qqqAbove50 && ctx.regime.qqqAbove200;
    if (!ok) A.push("Regjimi i tregut në skanim ishte JO OK (SPY/QQQ nën mesatare) — erë kundër për të gjithë kandidatët.");
  } else if (entry.regimeLevel && entry.regimeLevel !== "OK") {
    A.push(`Regjimi në skanim: ${entry.regimeLevel} — kushte kundërshtare.`);
  }

  // 7. Lidhja me sub-score-t (vetëm CAMS)
  if (ctx?.sub) {
    const s = ctx.sub;
    if (o.ret10d != null && o.ret10d >= 2 && s.catalyst >= 55) A.push(`Katalizatori i fortë (${s.catalyst}) parapriu rritjen — ky është kombinimi që kërkojmë.`);
    if (o.ret10d != null && o.ret10d <= -2) {
      if (s.catalyst < 40) A.push(`Katalizatori ishte i dobët (${s.catalyst}) — rënia e konfirmon: pa katalizator, score-i tjetër s'mjafton.`);
      if (s.acceleration < 40) A.push(`Accelerimi ishte i dobët (${s.acceleration}) — tregu s'kishte konfirmuar ende.`);
      if ((entry.tags || []).includes("NO_RVOL")) A.push("Në skanim kishte RVol nën 1.5x — pa volum, sinjalet janë të pabesueshme.");
      if ((entry.tags || []).includes("EXTENDED")) A.push(`Ish i zgjatur ${ctx.extensionAtr} ATR mbi EMA20 — blerje në majë, korrigjimi ishte i pritshëm.`);
    }
    if (o.ret10d != null && o.ret10d >= 2 && s.structure >= 60) A.push(`Struktura e mirë (${s.structure}) dha pikën e hyrjes së saktë.`);
  }

  return A;
}

// ── Mësimet automatike të javës ──

function buildWeekLessons(stocks: any[]): string[] {
  const L: string[] = [];
  const done = stocks.filter((s) => s.verdict === "ROSE" || s.verdict === "FELL");
  const risers = done.filter((s) => s.verdict === "ROSE");
  const fallers = done.filter((s) => s.verdict === "FELL");

  if (done.length < 3) {
    L.push("Akoma s'ka mjaftueshëm data të përfunduara këtë javë — mësimet vijnë pas 10 ditësh tregtimi.");
    return L;
  }

  // Faktorët CAMS: krahaso mesataret fitues vs humbës
  const avg = (arr: any[], pick: (c: any) => number | null | undefined): number | null => {
    const vals = arr.map((s) => (s.context?.sub ? pick(s.context.sub) : null)).filter((v): v is number => typeof v === "number");
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };
  const pairs: Array<[string, (c: any) => number]> = [
    ["Katalizatorin", (c) => c.catalyst],
    ["Accelerimin", (c) => c.acceleration],
    ["Strukturën", (c) => c.structure],
  ];
  for (const [name, pick] of pairs) {
    const r = avg(risers, pick);
    const f = avg(fallers, pick);
    if (r != null && f != null && Math.abs(r - f) >= 10) {
      L.push(`${name} e dalloi: u rritën me mesatare ${r} vs ${f} te të rënët — ${r > f ? "peshoje më shumë" : "ky faktor s'parashikoi këtë javë"}.`);
    }
  }

  const regimeLosers = fallers.filter((s) => (s.context?.regime?.spyAbove50 ?? true) === false).length;
  if (regimeLosers >= 2) L.push(`${regimeLosers} nga humbësit ishin me regjim JO OK — kur SPY/QQQ janë nën mesatare, ul pritjet ose mos tregto.`);

  const noRvol = fallers.filter((s) => (s.tags || []).includes("NO_RVOL")).length;
  if (noRvol >= 2) L.push(`${noRvol} humbës kishin RVol nën 1.5x në skanim — kërko volum konfirmimi PARA hyrjes.`);

  const extLosers = fallers.filter((s) => (s.tags || []).includes("EXTENDED")).length;
  if (extLosers >= 1) L.push(`${extLosers} humbës ishin të zgjatur mbi 2 ATR — mos i ndjek lart, prit konsolidimin.`);

  const gapFill = fallers.filter((s) => (s.analysis || []).some((a: string) => a.includes("U MBUSH"))).length;
  if (gapFill >= 1) L.push(`${gapFill} humbës mbushën gap-un e katalizatorit — hyr vetëm kur drift-i konfirmohet, jo vetëm me gap.`);

  if (risers.length > 0 && risers.length > fallers.length) L.push(`Java pozitive: ${risers.length}/${done.length} u rritën — kushtet e përzgjedhjes po funksionojnë, vazhdo të njëjtën disiplinë.`);

  if (L.length === 0) L.push("Asnjë model i dukshëm këtë javë — mostra e vogël. Vazhdo ditarin, modelet dalin me 30+ raste.");
  return L.slice(0, 6);
}

// ── Rishikimi javor i plotë ──

export interface WeeklyStockReview {
  ticker: string;
  scanDate: string;
  rank: number;
  tier: string;
  score: number | null;
  priceAtScan: number | null;
  lastClose: number | null;
  ret5d: number | null;
  ret10d: number | null;
  ret20d: number | null;
  maxRunupPct: number | null;
  maxDrawdownPct: number | null;
  verdict: "ROSE" | "FELL" | "FLAT" | "PENDING";
  analysis: string[];
  tags: string[];
  entryHit: boolean | null;
  stopHit: boolean | null;
  targetHit: boolean | null;
  userNote?: string;
  context?: any;
}

export interface WeeklyGroup {
  weekStart: string;
  label: string;
  stocks: WeeklyStockReview[];
  stats: {
    total: number;
    rose: number;
    fell: number;
    pending: number;
    avgRet10d: number | null;
    best?: { ticker: string; ret: number };
    worst?: { ticker: string; ret: number };
  };
  lessons: string[];
  weekNote?: string;
}

const MONTHS_SQ = ["Jan", "Shk", "Mar", "Pri", "Maj", "Qer", "Kor", "Gsh", "Sht", "Okt", "Nën", "Dhj"];

function weekLabel(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS_SQ[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export async function buildWeeklyReview(
  strategy: "CAMS" | "IBKR_PULLBACK" = "CAMS",
  weeks = 8
): Promise<{ dbActive: boolean; weeks: WeeklyGroup[]; error?: string }> {
  const out: { dbActive: boolean; weeks: WeeklyGroup[]; error?: string } = { dbActive: false, weeks: [] };
  if (!isDbAvailable()) return out;
  try {
    const dbStrategy = strategy === "CAMS" ? "CAMS" : "IBKR_PULLBACK";
    const from = getEtDateStr(new Date(Date.now() - (weeks * 7 + 10) * 86_400_000));
    const entries = (await prisma.top10JournalEntry.findMany({
      where: { scanDate: { gte: from }, strategy: dbStrategy },
      orderBy: { scanDate: "asc" },
    })) as any[];

    out.dbActive = true;
    if (entries.length === 0) return out;

    // Grupimi sipas javës; për (ticker, javë) merret skanimi i FUNDIT
    const byWeek = new Map<string, Map<string, any>>();
    for (const e of entries) {
      const wk = getWeekStartStr(e.scanDate);
      if (!byWeek.has(wk)) byWeek.set(wk, new Map());
      byWeek.get(wk)!.set(e.ticker, e); // i fundit fiton (renditur asc)
    }

    // Notat e përdoruesit
    const weekStarts = [...byWeek.keys()];
    const notes = await prisma.weeklyReviewNote.findMany({
      where: { strategy: dbStrategy, weekStart: { in: weekStarts } },
    });
    const noteMap = new Map<string, string>();
    for (const n of notes as any[]) noteMap.set(`${n.weekStart}|${n.ticker || ""}`, n.note);

    // Fetch bar-et për të gjithë ticker-at unikë
    const tickers = [...new Set(entries.map((e) => e.ticker))];
    const bars = new Map<string, HistoricalDataPoint[]>();
    for (let i = 0; i < tickers.length; i += 6) {
      const batch = tickers.slice(i, i + 6);
      await Promise.allSettled(batch.map(async (t) => {
        const d = await fetchHistoricalData(t, "6mo");
        if (d && d.length > 2) bars.set(t, d as HistoricalDataPoint[]);
      }));
      if (i + 6 < tickers.length) await new Promise((r) => setTimeout(r, 150));
    }

    // Ndërto javët
    const groups: WeeklyGroup[] = [];
    for (const [wk, tickerMap] of byWeek) {
      const stocks: WeeklyStockReview[] = [];
      for (const [ticker, e] of tickerMap) {
        const b = bars.get(ticker);
        const ctx = e.context ?? null;
        const o = b
          ? computeOutcome(
              b,
              e.scanDate,
              { entry: e.entry, stop: e.stop, target: e.target },
              ctx?.high20 ?? null
            )
          : {
              ret5d: null, ret10d: null, ret20d: null,
              maxRunupPct: null, maxDrawdownPct: null,
              entryHit: null, stopHit: null, targetHit: null,
              volAfterVsBefore: null, brokeHigh20: null,
            };
        const before = b ? b.filter((x) => x.date <= e.scanDate) : [];
        const after = b ? b.filter((x) => x.date > e.scanDate) : [];
        const lastClose = after.length > 0 ? after[after.length - 1].close : before.length > 0 ? before[before.length - 1].close : null;

        const verdict: WeeklyStockReview["verdict"] =
          o.ret10d == null ? "PENDING" : o.ret10d >= 2 ? "ROSE" : o.ret10d <= -2 ? "FELL" : "FLAT";

        stocks.push({
          ticker,
          scanDate: e.scanDate,
          rank: e.rank,
          tier: e.status || "",
          score: e.score,
          priceAtScan: e.price,
          lastClose,
          ret5d: o.ret5d,
          ret10d: o.ret10d,
          ret20d: o.ret20d,
          maxRunupPct: o.maxRunupPct,
          maxDrawdownPct: o.maxDrawdownPct,
          verdict,
          analysis: buildAnalysis(ctx, e, o, lastClose),
          tags: e.tags || [],
          entryHit: o.entryHit,
          stopHit: o.stopHit,
          targetHit: o.targetHit,
          userNote: noteMap.get(`${wk}|${ticker}`),
          context: ctx,
        });
      }
      stocks.sort((a, b) => a.rank - b.rank);

      const done = stocks.filter((s) => s.ret10d != null);
      const rets = done.map((s) => s.ret10d!);
      const sorted = [...done].sort((a, b) => b.ret10d! - a.ret10d!);
      groups.push({
        weekStart: wk,
        label: weekLabel(wk),
        stocks,
        stats: {
          total: stocks.length,
          rose: stocks.filter((s) => s.verdict === "ROSE").length,
          fell: stocks.filter((s) => s.verdict === "FELL").length,
          pending: stocks.filter((s) => s.verdict === "PENDING").length,
          avgRet10d: rets.length ? Math.round((rets.reduce((a, b) => a + b, 0) / rets.length) * 10) / 10 : null,
          best: sorted[0] ? { ticker: sorted[0].ticker, ret: sorted[0].ret10d! } : undefined,
          worst: sorted.length > 1 ? { ticker: sorted[sorted.length - 1].ticker, ret: sorted[sorted.length - 1].ret10d! } : undefined,
        },
        lessons: buildWeekLessons(stocks),
        weekNote: noteMap.get(`${wk}|`),
      });
    }

    groups.sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
    out.weeks = groups;
    return out;
  } catch (e: any) {
    out.dbActive = true;
    out.error = e?.message || String(e);
    return out;
  }
}

// ── Ruajtja e shënimit të përdoruesit ──

export async function saveWeeklyNote(params: {
  weekStart: string;
  strategy: string;
  ticker?: string;
  note: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isDbAvailable()) return { ok: false, error: "Databaza nuk është aktive." };
  try {
    const ticker = (params.ticker || "").toUpperCase().trim();
    await prisma.weeklyReviewNote.upsert({
      where: {
        weekStart_strategy_ticker: {
          weekStart: params.weekStart,
          strategy: params.strategy,
          ticker,
        },
      },
      create: {
        weekStart: params.weekStart,
        strategy: params.strategy,
        ticker,
        note: params.note,
      },
      update: { note: params.note },
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
