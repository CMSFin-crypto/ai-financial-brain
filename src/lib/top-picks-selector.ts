// ============================================================
// Top Picks Selector — diversified, non-stale, non-repetitive pick
// selection. Replaces the naive "sort by score, take top N" with
// a system that penalizes freshness, novelty, and concentration.
//
// Ranking formula:
//   finalRank = score*0.50 + delta1d*0.20 + delta3d*0.10
//              + volumeDelta*0.10 - freshnessPen - noveltyPen
//
// If deltas are undefined (no previous scan data), a small random
// jitter is added to break ties and introduce variety.
// ============================================================

import {
  freshnessPenalty,
  noveltyPenalty,
  concentrationPenalty,
} from '@/lib/ranking-adjustments';
import {
  readScanPickHistory,
  getRepeatCount,
  appendScanPickHistory,
  type ScanPickRecord,
} from '@/lib/scan-picks-history';

// ─── Types ────────────────────────────────────────────────────

export type RankedCandidate = {
  symbol: string;
  sector?: string;
  score: number;
  scoreDelta1d?: number;
  scoreDelta3d?: number;
  volumeDelta?: number;          // % volume change vs 20d avg (e.g. 1.5 = 150%)
  quoteTimestamp?: number;        // epoch ms
  priceChangePct?: number;        // intraday % change from previous close
};

export type EnrichedCandidate = RankedCandidate & {
  ageSec: number;
  bullishRank: number;
  bearishRank: number;
  topRepeat: number;
  bottomRepeat: number;
  freshnessPen: number;
  noveltyPenTop: number;
  noveltyPenBottom: number;
};

export type TopBottomResult = {
  top: EnrichedCandidate[];
  bottom: EnrichedCandidate[];
};

// ─── Helpers ───────────────────────────────────────────────────

function getAgeSec(ts?: number): number {
  if (!ts) return 9999;
  return Math.max(0, (Date.now() - ts) / 1000);
}

/**
 * Small deterministic jitter based on symbol hash + current hour.
 * Breaks ties when scores are identical without introducing noise.
 * Range: -0.5 to +0.5
 */
function symbolJitter(symbol: string): number {
  const hour = Math.floor(Date.now() / (1000 * 60 * 60)); // changes hourly
  let hash = 0;
  const str = `${symbol}-${hour}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return ((hash % 1000) / 1000 - 0.5); // -0.5 to +0.5
}

/**
 * Whether we have meaningful delta data (not just undefined/zero defaults).
 */
function hasDeltaData(c: RankedCandidate): boolean {
  return (c.scoreDelta1d !== undefined && c.scoreDelta1d !== 0) ||
         (c.scoreDelta3d !== undefined && c.scoreDelta3d !== 0) ||
         (c.volumeDelta !== undefined && c.volumeDelta !== 0);
}

// ─── Core: Build Top/Bottom Picks ─────────────────────────────

export async function buildTopBottomPicks(
  candidates: RankedCandidate[],
  topN = 5,
  bottomN = 5,
): Promise<TopBottomResult> {
  // Load history for novelty penalties (from DB or fallback file)
  const history = await readScanPickHistory().catch(() => [] as ScanPickRecord[]);

  const now = Date.now();

  // Enrich each candidate with ranking scores and metadata
  const enriched: EnrichedCandidate[] = candidates.map((c) => {
    const ageSec = getAgeSec(c.quoteTimestamp);
    const topRepeat = getRepeatCount(history, c.symbol, 'TOP', 3);
    const bottomRepeat = getRepeatCount(history, c.symbol, 'BOTTOM', 3);
    const fPen = freshnessPenalty(ageSec);
    const nPenTop = noveltyPenalty(topRepeat);
    const nPenBottom = noveltyPenalty(bottomRepeat);

    const jitter = hasDeltaData(c) ? 0 : symbolJitter(c.symbol);
    const volDelta = (c.volumeDelta ?? 0) * 0.10; // 10% weight

    // Bullish ranking: positive score + momentum delta + volume - penalties
    const bullishRank =
      c.score * 0.50 +
      (c.scoreDelta1d ?? 0) * 0.20 +
      (c.scoreDelta3d ?? 0) * 0.10 +
      volDelta +
      (c.priceChangePct ?? 0) * 0.10 + // intraday momentum
      jitter -
      fPen -
      nPenTop;

    // Bearish ranking: flip score sign, same structure
    const bearishRank =
      (-c.score) * 0.50 +
      (-(c.scoreDelta1d ?? 0)) * 0.20 +
      (-(c.scoreDelta3d ?? 0)) * 0.10 +
      (-volDelta) +
      (-(c.priceChangePct ?? 0)) * 0.10 +
      (-jitter) - // flip jitter too
      fPen -
      nPenBottom;

    return {
      ...c,
      ageSec,
      bullishRank: Math.round(bullishRank * 100) / 100,
      bearishRank: Math.round(bearishRank * 100) / 100,
      topRepeat,
      bottomRepeat,
      freshnessPen: fPen,
      noveltyPenTop: nPenTop,
      noveltyPenBottom: nPenBottom,
    };
  });

  // Sort descending by respective rank
  const topSorted = [...enriched].sort((a, b) => b.bullishRank - a.bullishRank);
  const bottomSorted = [...enriched].sort((a, b) => b.bearishRank - a.bearishRank);

  // Greedy selection with sector cap (max 2 per sector)
  const SECTOR_CAP = 2;
  const top: EnrichedCandidate[] = [];
  const bottom: EnrichedCandidate[] = [];
  const topSectorCounts = new Map<string, number>();
  const bottomSectorCounts = new Map<string, number>();

  for (const row of topSorted) {
    if (top.length >= topN) break;
    if (row.ageSec > 300) continue; // skip stale data
    const sector = row.sector ?? 'UNKNOWN';
    const count = topSectorCounts.get(sector) ?? 0;
    if (concentrationPenalty(count, SECTOR_CAP) >= 999) continue;
    top.push(row);
    topSectorCounts.set(sector, count + 1);
  }

  for (const row of bottomSorted) {
    if (bottom.length >= bottomN) break;
    if (row.ageSec > 300) continue;
    const sector = row.sector ?? 'UNKNOWN';
    const count = bottomSectorCounts.get(sector) ?? 0;
    if (concentrationPenalty(count, SECTOR_CAP) >= 999) continue;
    bottom.push(row);
    bottomSectorCounts.set(sector, count + 1);
  }

  // Persist picks for future novelty checks (fire and forget)
  const scanNow = new Date().toISOString();
  const historyRecords: ScanPickRecord[] = [
    ...top.map((x, i) => ({
      date: scanNow, symbol: x.symbol, bucket: 'TOP' as const,
      rank: i + 1, score: x.bullishRank, sector: x.sector,
    })),
    ...bottom.map((x, i) => ({
      date: scanNow, symbol: x.symbol, bucket: 'BOTTOM' as const,
      rank: i + 1, score: x.bearishRank, sector: x.sector,
    })),
  ];
  appendScanPickHistory(historyRecords).catch(() => {});

  return { top, bottom };
}
