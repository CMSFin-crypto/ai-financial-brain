// ============================================================
// Lead-Lag Features — Extract quantitative features from the
// lead-lag network for use in the prediction pipeline.
//
// These features summarize the cross-market structure around
// a target symbol: who's leading into it, what's the propagation
// delay, and is there an active shock in flight?
// ============================================================

import { buildLeadLagNetwork, getNodeEdges, type LeadLagNetwork, type LeadLagEdge } from './leadlag-network';
import { getDailyHistory, type EnrichedMarketData } from './global-market-data';

// ─── Types ────────────────────────────────────────────────────

export interface LeadLagFeatures {
  // Incoming edges (who leads this symbol)
  incomingCount: number;
  incomingAvgLag: number;        // average lag (trading days) from leaders
  incomingAvgCorr: number;       // average |lagged correlation|
  strongestLeader: string | null;
  strongestLeaderLag: number;
  strongestLeaderCorr: number;

  // Outgoing edges (who this symbol leads to)
  outgoingCount: number;
  outgoingAvgLag: number;
  outgoingAvgCorr: number;
  strongestFollower: string | null;

  // Node role and influence
  nodeRole: string;
  netTransmitterScore: number;
  netReceiverScore: number;

  // Shock detection
  activeShockOrigin: string | null;
  activeShockLagRemaining: number;
  activeShockStrength: string | null;
  shockPropagationRisk: number; // 0-100, how much risk is propagating toward this symbol

  // Composite score for prediction pipeline
  leadLagScore: number;  // -100 to +100
  leadLagSignal: string; // BULLISH / BEARISH / NEUTRAL
  leadLagReason: string;
}

// ─── Cache ─────────────────────────────────────────────────────

let cachedFeatures = new Map<string, { features: LeadLagFeatures; computedAt: number }>();
const FEATURES_CACHE_MS = 30 * 60 * 1000;

// ─── Compute Features for a Symbol ─────────────────────────────

export async function computeLeadLagFeatures(symbol: string): Promise<LeadLagFeatures> {
  // Check cache
  const cached = cachedFeatures.get(symbol);
  if (cached && Date.now() - cached.computedAt < FEATURES_CACHE_MS) {
    return cached.features;
  }

  const network = await buildLeadLagNetwork();
  const { outgoing, incoming, influence } = getNodeEdges(network, symbol);

  // Incoming statistics
  const incomingCount = incoming.length;
  const incomingAvgLag = incoming.length > 0
    ? incoming.reduce((s, e) => s + e.maxLag, 0) / incoming.length
    : 0;
  const incomingAvgCorr = incoming.length > 0
    ? incoming.reduce((s, e) => s + Math.abs(e.laggedCorr), 0) / incoming.length
    : 0;

  const sortedIncoming = [...incoming].sort((a, b) => Math.abs(b.laggedCorr) - Math.abs(a.laggedCorr));
  const strongestLeader = sortedIncoming[0]?.source ?? null;
  const strongestLeaderLag = sortedIncoming[0]?.maxLag ?? 0;
  const strongestLeaderCorr = sortedIncoming[0]?.laggedCorr ?? 0;

  // Outgoing statistics
  const outgoingCount = outgoing.length;
  const outgoingAvgLag = outgoing.length > 0
    ? outgoing.reduce((s, e) => s + e.maxLag, 0) / outgoing.length
    : 0;
  const outgoingAvgCorr = outgoing.length > 0
    ? outgoing.reduce((s, e) => s + Math.abs(e.laggedCorr), 0) / outgoing.length
    : 0;

  const sortedOutgoing = [...outgoing].sort((a, b) => Math.abs(b.laggedCorr) - Math.abs(a.laggedCorr));
  const strongestFollower = sortedOutgoing[0]?.target ?? null;

  // Node role
  const nodeRole = influence?.role ?? 'ISOLATED';
  const netTransmitterScore = influence?.netTransmitterScore ?? 0;
  const netReceiverScore = influence?.netReceiverScore ?? 0;

  // Shock detection: is there a propagation path ending at this symbol?
  const shockPaths = network.shockPropagationPaths.filter(p => p.path[p.path.length - 1] === symbol);
  const activeShock = shockPaths.length > 0 ? shockPaths[0] : null;

  // Check if leader recently had a significant move
  let leaderRecentMove = 0;
  if (strongestLeader && strongestLeaderLag > 0) {
    try {
      const leaderData = await getDailyHistory(strongestLeader, strongestLeaderLag + 5);
      if (leaderData && leaderData.length >= strongestLeaderLag) {
        // The move that happened `lag` days ago
        leaderRecentMove = leaderData[strongestLeaderLag - 1]?.return1d ?? 0;
      }
    } catch {
      // Ignore fetch errors
    }
  }

  // Compute shock propagation risk
  const shockPropagationRisk = computeShockRisk(incoming, leaderRecentMove);

  // Compute composite score and signal
  const { score, signal, reason } = computeLeadLagSignal(
    incoming, leaderRecentMove, nodeRole, shockPropagationRisk, symbol,
  );

  const features: LeadLagFeatures = {
    incomingCount,
    incomingAvgLag: Math.round(incomingAvgLag * 100) / 100,
    incomingAvgCorr: Math.round(incomingAvgCorr * 10000) / 10000,
    strongestLeader,
    strongestLeaderLag,
    strongestLeaderCorr: Math.round(strongestLeaderCorr * 10000) / 10000,
    outgoingCount,
    outgoingAvgLag: Math.round(outgoingAvgLag * 100) / 100,
    outgoingAvgCorr: Math.round(outgoingAvgCorr * 10000) / 10000,
    strongestFollower,
    nodeRole,
    netTransmitterScore,
    netReceiverScore,
    activeShockOrigin: activeShock?.origin ?? null,
    activeShockLagRemaining: activeShock?.totalLagDays ?? 0,
    activeShockStrength: activeShock?.strength ?? null,
    shockPropagationRisk: Math.round(shockPropagationRisk * 100) / 100,
    leadLagScore: score,
    leadLagSignal: signal,
    leadLagReason: reason,
  };

  cachedFeatures.set(symbol, { features, computedAt: Date.now() });
  return features;
}

// ─── Shock Risk Computation ────────────────────────────────────
// If leaders recently had big moves and there's a lag, risk is
// propagating toward this symbol.

function computeShockRisk(incoming: LeadLagEdge[], leaderRecentMove: number): number {
  if (incoming.length === 0) return 0;

  let risk = 0;
  for (const edge of incoming) {
    const absCorr = Math.abs(edge.laggedCorr);
    const lagWeight = 1 / (1 + edge.maxLag); // Closer lags = more immediate risk
    risk += absCorr * lagWeight * 50; // Scale to 0-100 range
  }

  // Amplify if leader actually moved
  if (Math.abs(leaderRecentMove) > 1.5) {
    risk *= 1 + Math.abs(leaderRecentMove) / 5;
  }

  return Math.min(100, risk);
}

// ─── Compute Lead-Lag Signal ────────────────────────────────────
// Uses the leader's recent direction, lag, and correlation strength
// to generate a directional signal.

function computeLeadLagSignal(
  incoming: LeadLagEdge[],
  leaderRecentMove: number,
  nodeRole: string,
  shockRisk: number,
  symbol: string,
): { score: number; signal: string; reason: string } {
  if (incoming.length === 0 || strongestLeaderNotAvailable(incoming)) {
    return {
      score: 0,
      signal: 'NEUTRAL',
      reason: `${symbol}: no significant lead-lag edges detected. Cross-market structure not informative.`,
    };
  }

  const sortedIncoming = [...incoming].sort((a, b) => Math.abs(b.laggedCorr) - Math.abs(a.laggedCorr));
  const topEdge = sortedIncoming[0];
  const topLeader = topEdge.source;

  // Direction from leader's recent move
  // If leader went up and correlation is positive → follower expected to go up
  const expectedDirection = (leaderRecentMove > 0 ? 1 : leaderRecentMove < 0 ? -1 : 0) * Math.sign(topEdge.laggedCorr);

  // Score based on: direction, correlation strength, and number of confirming edges
  const corrStrength = Math.abs(topEdge.laggedCorr);
  const confirmingEdges = sortedIncoming.filter(e =>
    Math.sign(e.laggedCorr) * Math.sign(leaderRecentMove) === expectedDirection
  ).length;
  const confirmationBonus = Math.min(confirmingEdges - 1, 3) * 5;

  // Role bonus
  const roleBonus = nodeRole === 'NET_RECEIVER' ? 10 : 0; // Receivers are more predictable

  const rawScore = expectedDirection * corrStrength * 60 + confirmationBonus + roleBonus;
  const clampedScore = Math.max(-100, Math.min(100, Math.round(rawScore)));

  const signal = clampedScore > 15 ? 'BULLISH' : clampedScore < -15 ? 'BEARISH' : 'NEUTRAL';

  const leaderLabel = getLabel(topLeader);
  const reason = `${leaderLabel} leads ${symbol} by ${topEdge.maxLag}d (corr=${topEdge.laggedCorr.toFixed(3)}). ` +
    `Leader moved ${leaderRecentMove > 0 ? '+' : ''}${leaderRecentMove.toFixed(2)}% recently. ` +
    `${confirmingEdges} confirming edges. Shock risk: ${shockRisk.toFixed(0)}.`;

  return { score: clampedScore, signal, reason };
}

function strongestLeaderNotAvailable(incoming: LeadLagEdge[]): boolean {
  return incoming.length === 0 || incoming.every(e => Math.abs(e.laggedCorr) < 0.1);
}

function getLabel(symbol: string): string {
  const labels: Record<string, string> = {
    '^KS11': 'KOSPI', '^N225': 'Nikkei', '^HSI': 'Hang Seng',
    'SPY': 'S&P 500', 'QQQ': 'Nasdaq', 'SMH': 'Semis ETF',
    'VIX': 'VIX', 'XLK': 'Tech ETF', 'XLF': 'Finance ETF',
    'XLE': 'Energy ETF',
  };
  return labels[symbol] ?? symbol;
}

// ─── Invalidate Cache ──────────────────────────────────────────

export function invalidateLeadLagFeaturesCache(): void {
  cachedFeatures.clear();
}
