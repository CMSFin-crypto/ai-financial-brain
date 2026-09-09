// ═══════════════════════════════════════════════════════════════
// ADAPTIVE SCANNER LEARNING ENGINE — IBKR Pullback
// ═══════════════════════════════════════════════════════════════
// Statuses:
//   DAY_1_WATCH           — new mover, watch only (NOT entry)
//   MOMENTUM_PULLBACK_READY — pullback to EMA20 + trend + RS + persist (ENTRY)
//   FADE_RISK              — day move ≥5% + low volume + persist ≤1 (avoid)
//   NO_TRADE               — gated (spread/event/setup weak)
//
// Funnel: 400 → 80–150 → 20–40 → 5–10 READY
// Snapshots: 5x/day during RTH (OPEN_15M, MID_AM, LUNCH, MID_PM, CLOSE)

import { prisma } from "@/lib/prisma";
import { getScanUniverse } from "@/lib/scanner/universe-400";
import { buildVolumeProfile, type OhlcvBar, type VolumeProfile } from "@/lib/scanner/volume-profile";

export type ScanStatus =
  | "DAY_1_WATCH"
  | "MOMENTUM_PULLBACK_READY"
  | "FADE_RISK"
  | "NO_TRADE";

export type ScanCandidate = {
  symbol: string;
  score: number;
  lastPrice: number;
  bars: OhlcvBar[];
  rsSpy: number;
  rsSector: number;
  distEma20: number;
  atrPct: number;
  volVs20d: number;
  spreadBps: number;
  persistenceD: number;
  eventRisk: string;
  dayMovePct: number;
  aboveSma50: boolean;
  aboveSma200: boolean;
  vp?: VolumeProfile | null;
};

// ═══ Enrich candidate with Volume Profile ═══
// Uses last 20 daily bars (swing VP) — not tick-by-tick (IBKR pacing).
export function withVolumeProfile(c: ScanCandidate): ScanCandidate {
  const vp = buildVolumeProfile(c.bars.slice(-20), c.lastPrice);
  return { ...c, vp };
}

// ═══ Time slots (ET) ═══
const SLOT_BY_ET_HOUR: Array<[number, string]> = [
  [10, "OPEN_15M"],   // before 10:00 = OPEN_15M
  [11, "MID_AM"],    // 10:00–11:00 = MID_AM
  [13, "LUNCH"],     // 11:00–13:00 = LUNCH
  [15, "MID_PM"],    // 13:00–15:00 = MID_PM
  [16, "CLOSE"],     // 15:00–16:00 = CLOSE
];

export function currentSlot(now: Date = new Date()): string {
  const etHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(now)
  );
  return SLOT_BY_ET_HOUR.find(([h]) => etHour < h)?.[1] ?? "CLOSE";
}

export function sessionDateET(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${parts}T00:00:00.000Z`);
}

// ═══ Status classification ═══
// ENTRY only via MOMENTUM_PULLBACK_READY with controlled pullback + persistent volume.
export function classifyStatus(c: ScanCandidate): {
  status: ScanStatus;
  gated: boolean;
  gateReason?: string;
} {
  // Hard gates: spread too wide or critical event
  if (c.spreadBps > 25 || c.eventRisk === "CRITICAL") {
    return {
      status: "NO_TRADE",
      gated: true,
      gateReason: c.eventRisk === "CRITICAL" ? "EVENT_GATE" : "SPREAD_WIDE",
    };
  }

  // Day-1 spike: large move but no persistence yet → watch, don't enter
  if (c.dayMovePct >= 8 && c.persistenceD <= 1) {
    return { status: "DAY_1_WATCH", gated: true, gateReason: "DAY_1_SPIKE" };
  }

  // Fade risk: moved ≥5% but volume fading + low persistence
  if (c.dayMovePct >= 5 && c.volVs20d < 1.1 && c.persistenceD <= 1) {
    return { status: "FADE_RISK", gated: true, gateReason: "FADE_RISK" };
  }

  // Full setup: trend + pullback to EMA20 + persistence + volume confirmation
  // VP GATE: Long READY only if VP confirms support below + no resistance above
  const pullback = c.distEma20 <= 0 && c.distEma20 >= -2.5;
  const trend = c.aboveSma50 && c.aboveSma200 && c.rsSpy > 0 && c.rsSector > 0;
  const vp = c.vp;
  const vpOk = !!vp && vp.supportBelow && !vp.resistanceAbove && vp.roomUpPct >= 2;
  const vpBlock = !!vp && vp.resistanceAbove && vp.roomUpPct < 1.2;

  // VP resistance above → block entry
  if (vpBlock) {
    return { status: "NO_TRADE", gated: true, gateReason: "HVN_RESIST_ABOVE" };
  }

  // READY: trend + pullback + persist + volume + VP support confirmed
  if (trend && pullback && c.persistenceD >= 2 && c.volVs20d >= 1.2 && vpOk) {
    return { status: "MOMENTUM_PULLBACK_READY", gated: false };
  }

  // Trend + pullback + persist but VP not confirmed → watch (wait for support)
  if (trend && pullback && c.persistenceD >= 2 && (!vp || vp.vpScore >= 40)) {
    return { status: "DAY_1_WATCH", gated: true, gateReason: "WAIT_VP_SUPPORT" };
  }
  if (trend && c.persistenceD >= 1) {
    return { status: "DAY_1_WATCH", gated: true, gateReason: "WAIT_PULLBACK" };
  }

  return { status: "NO_TRADE", gated: true, gateReason: "SETUP_WEAK" };
}

// ═══ Reason codes for ADD/REMOVE events ═══
function reasonForAdd(c: ScanCandidate, status: ScanStatus): { code: string; text: string } {
  if (status === "MOMENTUM_PULLBACK_READY") {
    return {
      code: "PULLBACK_ZONE",
      text: `${c.symbol} trend+RS+pullback EMA20, persist ${c.persistenceD}d`,
    };
  }
  if (status === "DAY_1_WATCH") {
    return { code: "VOL_PERSIST", text: `${c.symbol} lëvizje e re, watch jo entry` };
  }
  return { code: "TREND_OK", text: `${c.symbol} hyri në universin e filtruar` };
}

function reasonForRemove(prevStatus: string, next?: ScanCandidate): { code: string; text: string } {
  if (!next) return { code: "RANK_DROP", text: "doli nga top lista e skanimit" };
  if (next.eventRisk === "CRITICAL") return { code: "EVENT_GATE", text: "event risk" };
  if (next.rsSpy < 0) return { code: "RS_WEAK", text: "humb relative strength vs SPY" };
  if (next.spreadBps > 25) return { code: "SPREAD_WIDE", text: "spread shumë i gjerë për IBKR" };
  return {
    code: prevStatus === "FADE_RISK" ? "FADE_RISK" : "SETUP_WEAK",
    text: "nuk i plotëson më filtrat",
  };
}

// ═══ Persist scan snapshot with diff events ═══
export async function persistScanSnapshot(params: {
  candidates: ScanCandidate[];
  regime: string;
  spyTrend: string;
  topN?: number;
}) {
  const topN = params.topN ?? 80;
  const now = new Date();
  const slot = currentSlot(now);
  const sessionDate = sessionDateET(now);

  // Enrich candidates with Volume Profile before ranking
  const enriched = params.candidates.map(withVolumeProfile);

  // Rank by score, take top N, classify each
  const ranked = [...enriched]
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((c, i) => {
      const cls = classifyStatus(c);
      return { ...c, rank: i + 1, ...cls };
    });

  // Load previous snapshot for this session to compute diff events
  const prev = await prisma.scanSnapshot.findFirst({
    where: { sessionDate, strategy: "IBKR_PULLBACK" },
    orderBy: { scannedAt: "desc" },
    include: { items: true },
  });

  const prevMap = new Map(prev?.items.map((i) => [i.symbol, i]) ?? []);
  const nextMap = new Map(ranked.map((i) => [i.symbol, i]));

  const events: Array<{
    symbol: string;
    action: string;
    fromStatus?: string;
    toStatus?: string;
    reasonCode: string;
    reasonText: string;
  }> = [];

  // ADD / STATUS_CHANGE / KEEP
  for (const row of ranked) {
    const old = prevMap.get(row.symbol);
    if (!old) {
      const r = reasonForAdd(row, row.status);
      events.push({
        symbol: row.symbol,
        action: "ADD",
        toStatus: row.status,
        reasonCode: r.code,
        reasonText: r.text,
      });
    } else if (old.status !== row.status) {
      events.push({
        symbol: row.symbol,
        action: "STATUS_CHANGE",
        fromStatus: old.status,
        toStatus: row.status,
        reasonCode: row.gateReason ?? "STATUS_CHANGE",
        reasonText: `${old.status} → ${row.status}`,
      });
    } else {
      events.push({
        symbol: row.symbol,
        action: "KEEP",
        fromStatus: old.status,
        toStatus: row.status,
        reasonCode: "KEEP",
        reasonText: "mbeti në listë",
      });
    }
  }

  // REMOVE
  for (const old of prev?.items ?? []) {
    if (!nextMap.has(old.symbol)) {
      const nxt = params.candidates.find((c) => c.symbol === old.symbol);
      const r = reasonForRemove(old.status, nxt);
      events.push({
        symbol: old.symbol,
        action: "REMOVE",
        fromStatus: old.status,
        reasonCode: r.code,
        reasonText: r.text,
      });
    }
  }

  // Create snapshot with items + events (filter out KEEP to reduce noise)
  const snapshot = await prisma.scanSnapshot.create({
    data: {
      scannedAt: now,
      sessionDate,
      slot,
      strategy: "IBKR_PULLBACK",
      regime: params.regime,
      spyTrend: params.spyTrend,
      tickerCount: ranked.length,
      items: {
        create: ranked.map((r) => ({
          symbol: r.symbol,
          rank: r.rank,
          status: r.status,
          score: r.score,
          rsSpy: r.rsSpy,
          rsSector: r.rsSector,
          distEma20: r.distEma20,
          atrPct: r.atrPct,
          volVs20d: r.volVs20d,
          spreadBps: r.spreadBps,
          persistenceD: r.persistenceD,
          eventRisk: r.eventRisk,
          gated: r.gated,
          gateReason: r.gateReason,
          // Volume Profile fields
          poc: r.vp?.poc,
          vah: r.vp?.vah,
          val: r.vp?.val,
          hvnBelow: r.vp?.nearestHvnBelow,
          hvnAbove: r.vp?.nearestHvnAbove,
          vpLocation: r.vp?.location,
          vpScore: r.vp?.vpScore,
          supportBelow: r.vp?.supportBelow ?? false,
          resistanceAbove: r.vp?.resistanceAbove ?? false,
        })),
      },
      events: {
        create: events
          .filter((e) => e.action !== "KEEP")
          .map((e) => ({
            symbol: e.symbol,
            action: e.action,
            fromStatus: e.fromStatus,
            toStatus: e.toStatus,
            reasonCode: e.reasonCode,
            reasonText: e.reasonText,
          })),
      },
    },
    include: { items: true, events: true },
  });

  return snapshot;
}

// ═══ Extract READY candidates (max ~10) ═══
export function ibkrPullbackReady<T extends { status: string; gated: boolean }>(rows: T[]): T[] {
  return rows.filter((r) => r.status === "MOMENTUM_PULLBACK_READY" && !r.gated).slice(0, 10);
}

export { getScanUniverse };
