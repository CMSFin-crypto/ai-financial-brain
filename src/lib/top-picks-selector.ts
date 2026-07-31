// ============================================================
// Top Picks Selector — diversified, non-stale, non-repetitive pick
// selection. Replaces the naive "sort by score, take top N" with
// a system that penalizes freshness, novelty, and concentration.
//
// Inputs: ranked candidates with score, scoreDelta, timestamp, sector
// Outputs: top N bullish + bottom N bearish picks with adjustments
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
  quoteTimestamp?: number;  // epoch ms
};

export type EnrichedCandidate = RankedCandidate & {
  ageSec: number;
  bullishRank: number;
  bearishRank: number;
  topRepeat: number;
  bottomRepeat: number;
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

// ─── Core: Build Top/Bottom Picks ─────────────────────────────

export async function buildTopBottomPicks(
  candidates: RankedCandidate[],
  topN = 5,
  bottomN = 5,
): Promise<TopBottomResult> {
  // Load history for novelty penalties
  const history = await readScanPickHistory().catch(() => [] as ScanPickRecord[]);

  // Enrich each candidate with ranking scores and metadata
  const enriched: EnrichedCandidate[] = candidates.map((c) => {
    const ageSec = getAgeSec(c.quoteTimestamp);
    const topRepeat = getRepeatCount(history, c.symbol, 'TOP', 3);
    const bottomRepeat = getRepeatCount(history, c.symbol, 'BOTTOM', 3);

    // Bullish ranking: positive score + momentum delta - penalties
    const bullishRank =
      c.score * 0.55 +
      (c.scoreDelta1d ?? 0) * 0.20 +
      (c.scoreDelta3d ?? 0) * 0.10 -
      freshnessPenalty(ageSec) -
      noveltyPenalty(topRepeat);

    // Bearish ranking: flip score sign, same structure
    const bearishRank =
      (-c.score) * 0.55 +
      (-(c.scoreDelta1d ?? 0)) * 0.20 +
      (-(c.scoreDelta3d ?? 0)) * 0.10 -
      freshnessPenalty(ageSec) -
      noveltyPenalty(bottomRepeat);

    return {
      ...c,
      ageSec,
      bullishRank: Math.round(bullishRank * 100) / 100,
      bearishRank: Math.round(bearishRank * 100) / 100,
      topRepeat,
      bottomRepeat,
    };
  });

  // Sort descending by respective rank
  const topSorted = [...enriched].sort((a, b) => b.bullishRank - a.bullishRank);
  const bottomSorted = [...enriched].sort((a, b) => b.bearishRank - a.bearishRank);

  // Greedy selection with sector cap
  const top: EnrichedCandidate[] = [];
  const bottom: EnrichedCandidate[] = [];
  const topSectorCounts = new Map<string, number>();
  const bottomSectorCounts = new Map<string, number>();

  for (const row of topSorted) {
    if (top.length >= topN) break;
    if (row.ageSec > 300) continue; // skip stale
    const sector = row.sector ?? 'UNKNOWN';
    const count = topSectorCounts.get(sector) ?? 0;
    if (concentrationPenalty(count, 2) >= 999) continue;
    top.push(row);
    topSectorCounts.set(sector, count + 1);
  }

  for (const row of bottomSorted) {
    if (bottom.length >= bottomN) break;
    if (row.ageSec > 300) continue;
    const sector = row.sector ?? 'UNKNOWN';
    const count = bottomSectorCounts.get(sector) ?? 0;
    if (concentrationPenalty(count, 2) >= 999) continue;
    bottom.push(row);
    bottomSectorCounts.set(sector, count + 1);
  }

  // Persist picks for future novelty checks (fire and forget)
  const today = new Date().toISOString();
  const historyRecords: ScanPickRecord[] = [
    ...top.map((x, i) => ({
      date: today, symbol: x.symbol, bucket: 'TOP' as const,
      rank: i + 1, score: x.bullishRank, sector: x.sector,
    })),
    ...bottom.map((x, i) => ({
      date: today, symbol: x.symbol, bucket: 'BOTTOM' as const,
      rank: i + 1, score: x.bearishRank, sector: x.sector,
    })),
  ];
  appendScanPickHistory(historyRecords).catch(() => {});

  return { top, bottom };
}
