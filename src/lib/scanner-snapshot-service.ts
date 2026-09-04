import { prisma } from "@/lib/prisma";
import { ScannerStrategy } from "@prisma/client";
import {
  SnapshotInput,
  PriorSnapshot,
  explainRankingChange,
} from "@/lib/adaptive-scanner-learning";

// ═══════════════════════════════════════════════════════════════
// Save a single scanner snapshot + detect + record ranking change
// ═══════════════════════════════════════════════════════════════

export async function saveScannerSnapshot(
  strategy: ScannerStrategy,
  input: SnapshotInput
) {
  // Find previous snapshot for same ticker+strategy
  const previous = await prisma.scannerSnapshot.findFirst({
    where: {
      ticker: input.ticker,
      strategy,
    },
    orderBy: {
      snapshotAt: "desc",
    },
  });

  // Create new snapshot
  const snapshot = await prisma.scannerSnapshot.create({
    data: {
      ticker: input.ticker,
      strategy,
      rank: input.rank ?? null,
      totalScore: input.totalScore,
      confidence: input.confidence ?? null,
      decision: input.decision,

      price: input.price,
      priorClose: input.priorClose ?? null,
      dayChangePct: input.dayChangePct ?? null,
      premarketGapPct: input.premarketGapPct ?? null,

      volume: input.volume ?? null,
      averageVolume20D: input.averageVolume20D ?? null,
      relativeVolume: input.relativeVolume ?? null,
      avgDollarVolume20D: input.avgDollarVolume20D ?? null,
      spreadPct: input.spreadPct ?? null,
      liquidityScore: input.liquidityScore ?? null,

      vwap: input.vwap ?? null,
      aboveVwap: input.aboveVwap ?? null,
      vwapDistancePct: input.vwapDistancePct ?? null,

      ema20: input.ema20 ?? null,
      sma50: input.sma50 ?? null,
      sma200: input.sma200 ?? null,
      atr14: input.atr14 ?? null,
      rsi14: input.rsi14 ?? null,
      adx14: input.adx14 ?? null,

      trendScore: input.trendScore ?? null,
      pullbackScore: input.pullbackScore ?? null,
      catalystScore: input.catalystScore ?? null,
      volumeScore: input.volumeScore ?? null,
      sectorScore: input.sectorScore ?? null,
      marketRegimeScore: input.marketRegimeScore ?? null,
      liquidityMapScore: input.liquidityMapScore ?? null,
      fadeRiskScore: input.fadeRiskScore ?? null,

      closingStrength: input.closingStrength ?? null,
      marketRegime: input.marketRegime ?? null,
      sector: input.sector ?? null,
      sectorStrength: input.sectorStrength ?? null,

      poc: input.poc ?? null,
      nearestBelowHvn: input.nearestBelowHvn ?? null,
      nearestAboveHvn: input.nearestAboveHvn ?? null,
      bidWallPrice: input.bidWallPrice ?? null,
      askWallPrice: input.askWallPrice ?? null,

      newsCatalyst: input.newsCatalyst ?? null,
      catalystPublishedAt: input.catalystPublishedAt ?? null,
      secEvent: input.secEvent ?? null,

      reasons: input.reasons ?? [],
      riskFlags: input.riskFlags ?? [],
      scoreBreakdown: input.scoreBreakdown ?? {},
    },
  });

  // Calculate change vs previous
  const priorSnapshot: PriorSnapshot | null = previous
    ? {
        id: previous.id,
        snapshotAt: previous.snapshotAt,
        ticker: previous.ticker,
        rank: previous.rank,
        totalScore: previous.totalScore,
        confidence: previous.confidence,
        decision: previous.decision as any,
        price: previous.price,
        priorClose: previous.priorClose,
        dayChangePct: previous.dayChangePct,
        premarketGapPct: previous.premarketGapPct,
        volume: previous.volume,
        averageVolume20D: previous.averageVolume20D,
        relativeVolume: previous.relativeVolume,
        avgDollarVolume20D: previous.avgDollarVolume20D,
        spreadPct: previous.spreadPct,
        liquidityScore: previous.liquidityScore,
        vwap: previous.vwap,
        aboveVwap: previous.aboveVwap,
        vwapDistancePct: previous.vwapDistancePct,
        ema20: previous.ema20,
        sma50: previous.sma50,
        sma200: previous.sma200,
        atr14: previous.atr14,
        rsi14: previous.rsi14,
        adx14: previous.adx14,
        trendScore: previous.trendScore,
        pullbackScore: previous.pullbackScore,
        catalystScore: previous.catalystScore,
        volumeScore: previous.volumeScore,
        sectorScore: previous.sectorScore,
        marketRegimeScore: previous.marketRegimeScore,
        liquidityMapScore: previous.liquidityMapScore,
        fadeRiskScore: previous.fadeRiskScore,
        closingStrength: previous.closingStrength,
        marketRegime: previous.marketRegime,
        sector: previous.sector,
        sectorStrength: previous.sectorStrength,
        poc: previous.poc,
        nearestBelowHvn: previous.nearestBelowHvn,
        nearestAboveHvn: previous.nearestAboveHvn,
        bidWallPrice: previous.bidWallPrice,
        askWallPrice: previous.askWallPrice,
        newsCatalyst: previous.newsCatalyst,
        catalystPublishedAt: previous.catalystPublishedAt,
        secEvent: previous.secEvent,
        reasons: Array.isArray(previous.reasons) ? (previous.reasons as string[]) : [],
        riskFlags: Array.isArray(previous.riskFlags) ? (previous.riskFlags as string[]) : [],
        scoreBreakdown: (previous.scoreBreakdown as Record<string, number>) ?? {},
      }
    : null;

  const change = explainRankingChange(priorSnapshot, input);

  // Save RankingChange record
  await prisma.rankingChange.create({
    data: {
      ticker: input.ticker,
      strategy,
      fromSnapshotId: previous?.id ?? null,
      toSnapshotId: snapshot.id,
      oldRank: change.oldRank,
      newRank: change.newRank,
      oldScore: change.oldScore,
      newScore: change.newScore,
      scoreChange: change.scoreChange,
      oldDecision: change.oldDecision,
      newDecision: change.newDecision,
      action: change.action,
      reasons: change.reasons,
    },
  });

  // Create a PENDING SignalOutcome for this snapshot (to be evaluated later)
  await prisma.signalOutcome.create({
    data: {
      snapshotId: snapshot.id,
      ticker: input.ticker,
      strategy,
      entryPrice: input.price,
    },
  });

  return { snapshot, change };
}

// ═══════════════════════════════════════════════════════════════
// Save all candidates from a strategy scan
// ═══════════════════════════════════════════════════════════════

export async function saveStrategySnapshots(
  strategy: ScannerStrategy,
  candidates: SnapshotInput[]
) {
  // Process sequentially to avoid DB contention
  const results = [];
  for (const candidate of candidates) {
    try {
      const result = await saveScannerSnapshot(strategy, candidate);
      results.push(result);
    } catch (e) {
      console.error(`[SNAPSHOT] Failed to save ${candidate.ticker}:`, e);
    }
  }
  return results;
}
