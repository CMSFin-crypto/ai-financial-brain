// ============================================================
// Lead-Lag Network — Cross-market temporal dependency graph
//
// Constructs a directed weighted graph where nodes are instruments
// (KOSPI, Nikkei, HSI, QQQ, SMH, SPY, VIX, sector ETFs, key stocks)
// and edges represent lead-lag relationships.
//
// Key concepts:
//   - Leader: moves first, information transmitter
//   - Follower: moves later, information receiver
//   - Rolling correlation: contemporaneous correlation over a window
//   - Lagged cross-correlation: corr(X[t], Y[t-lag]) to detect directionality
//   - Directionality score: degree to which A leads B vs B leads A
//   - Net transmitter/receiver score: aggregate influence metric
//
// This is institutional-grade infrastructure. Lead-lag detection
// and temporal graph learning capture dynamic risk propagation
// better than static linear feature sets.
// ============================================================

import { getDailyHistory, type EnrichedMarketData, SPILLOVER_CORE, SEMI_TICKERS } from './global-market-data';

// ─── Types ────────────────────────────────────────────────────

export interface LeadLagEdge {
  source: string;      // the leader (moves first)
  target: string;      // the follower (moves later)
  maxLag: number;      // optimal lag in trading days
  laggedCorr: number;  // corr(source[t-lag], target[t])
  rollingCorr: number; // contemporaneous corr over window
  directionality: number; // -1 to +1 (positive = source leads target)
  strength: 'STRONG' | 'MODERATE' | 'WEAK';
  decay: number;       // how quickly the signal decays (0-1, lower = faster decay)
}

export interface NodeInfluence {
  symbol: string;
  label: string;
  netTransmitterScore: number;   // positive = net transmitter
  netReceiverScore: number;     // negative component of transmitter
  outgoingEdges: number;
  incomingEdges: number;
  strongestOutgoing: { target: string; lag: number; corr: number } | null;
  strongestIncoming: { source: string; lag: number; corr: number } | null;
  role: 'NET_TRANSMITTER' | 'NET_RECEIVER' | 'CONNECTOR' | 'ISOLATED';
}

export interface LeadLagNetwork {
  computedAt: string;
  windowDays: number;
  maxLagDays: number;
  minCorrelation: number;
  nodes: NodeInfluence[];
  edges: LeadLagEdge[];
  edgeCount: number;
  shockPropagationPaths: ShockPath[];
}

export interface ShockPath {
  origin: string;
  path: string[];
  totalLagDays: number;
  compoundedCorr: number;
  strength: 'STRONG' | 'MODERATE' | 'WEAK';
}

export interface LeadLagConfig {
  windowDays: number;     // rolling window for correlation (default 60)
  maxLagDays: number;     // max lag to test (default 5)
  minCorrelation: number; // minimum |corr| to include edge (default 0.15)
  minLaggedGain: number;  // lagged corr must exceed rolling corr by this much (default 0.03)
}

// ─── Defaults ──────────────────────────────────────────────────

const DEFAULT_CONFIG: LeadLagConfig = {
  windowDays: 60,
  maxLagDays: 5,
  minCorrelation: 0.15,
  minLaggedGain: 0.03,
};

// Extended node list for the graph
const GRAPH_NODES = [
  { symbol: '^KS11', label: 'KOSPI' },
  { symbol: '^N225', label: 'Nikkei 225' },
  { symbol: '^HSI', label: 'Hang Seng' },
  { symbol: 'SPY', label: 'S&P 500' },
  { symbol: 'QQQ', label: 'Nasdaq 100' },
  { symbol: 'SMH', label: 'Semiconductor ETF' },
  { symbol: 'VIX', label: 'VIX' },
  { symbol: 'XLF', label: 'Financials ETF' },
  { symbol: 'XLK', label: 'Technology ETF' },
  { symbol: 'XLE', label: 'Energy ETF' },
  { symbol: 'NVDA', label: 'NVIDIA' },
  { symbol: 'AMD', label: 'AMD' },
  { symbol: 'MU', label: 'Micron' },
  { symbol: 'TSM', label: 'TSMC' },
  { symbol: 'INTC', label: 'Intel' },
];

// ─── Cache ─────────────────────────────────────────────────────

let cachedNetwork: LeadLagNetwork | null = null;
let cachedAt = 0;
const NETWORK_CACHE_MS = 30 * 60 * 1000; // 30 min

// ─── Math Utilities ────────────────────────────────────────────

function pearsonCorr(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 10) return 0;

  const xSlice = x.slice(-n);
  const ySlice = y.slice(-n);

  const meanX = xSlice.reduce((a, b) => a + b, 0) / n;
  const meanY = ySlice.reduce((a, b) => a + b, 0) / n;

  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xSlice[i] - meanX;
    const dy = ySlice[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  return den > 0 ? num / den : 0;
}

// ─── Compute Returns from Enriched Data ───────────────────────

function toReturns(data: EnrichedMarketData[]): number[] {
  // data is sorted newest first, but we need chronological order for correlation
  return [...data].reverse().map(d => d.return1d);
}

// ─── Rolling Correlation ───────────────────────────────────────

function rollingCorrelation(x: number[], y: number[], window: number): number {
  if (x.length < window + 1 || y.length < window + 1) return 0;
  // Use last `window` days
  return pearsonCorr(x.slice(-window), y.slice(-window));
}

// ─── Lagged Cross-Correlation ──────────────────────────────────
// corr(x[t-lag], y[t]) for lag = 1..maxLag
// Returns the lag with highest absolute correlation.

function findBestLag(
  xReturns: number[],
  yReturns: number[],
  maxLag: number,
  window: number,
): { lag: number; corr: number; decay: number } {
  // Align and use only the overlapping window
  const minX = xReturns.length;
  const minY = yReturns.length;
  const usableLen = Math.min(minX, minY) - maxLag;
  if (usableLen < window) return { lag: 0, corr: 0, decay: 0 };

  // Work with the last `usableLen + maxLag` points
  const xSlice = xReturns.slice(-(usableLen + maxLag));
  const ySlice = yReturns.slice(-(usableLen + maxLag));

  let bestLag = 0;
  let bestCorr = 0;
  const corrsByLag: number[] = [];

  for (let lag = 1; lag <= maxLag; lag++) {
    const xLagged: number[] = [];
    const yCurrent: number[] = [];

    for (let t = lag; t < xSlice.length; t++) {
      xLagged.push(xSlice[t - lag]);
      yCurrent.push(ySlice[t]);
    }

    // Use only the last `window` overlapping points
    const useLen = Math.min(xLagged.length, window);
    if (useLen < 10) continue;

    const corr = pearsonCorr(
      xLagged.slice(-useLen),
      yCurrent.slice(-useLen),
    );
    corrsByLag.push(corr);

    if (Math.abs(corr) > Math.abs(bestCorr)) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  // Decay: ratio of corr at best lag to corr at lag+1
  const bestIdx = corrsByLag.findIndex((_, i) => i + 1 === bestLag);
  let decay = 0;
  if (bestIdx >= 0 && bestIdx < corrsByLag.length - 1) {
    const nextCorr = Math.abs(corrsByLag[bestIdx + 1]);
    decay = nextCorr > 0 ? Math.abs(bestCorr) / nextCorr : 1;
    decay = Math.min(decay, 1); // Cap at 1
  }

  return { lag: bestLag, corr: bestCorr, decay: 1 - (1 - decay) * 0.5 };
}

// ─── Build Directionality Score ────────────────────────────────
// directionality = (corr(A leads B) - corr(B leads A)) / 2
// Positive means A leads B. Range: [-1, +1]

function computeDirectionality(
  aReturns: number[],
  bReturns: number[],
  maxLag: number,
  window: number,
): { directionality: number; aLeadsB: { lag: number; corr: number; decay: number }; bLeadsA: { lag: number; corr: number; decay: number } } {
  const aLeadsB = findBestLag(aReturns, bReturns, maxLag, window);
  const bLeadsA = findBestLag(bReturns, aReturns, maxLag, window);

  const directionality = (aLeadsB.corr - bLeadsA.corr) / 2;

  return { directionality, aLeadsB, bLeadsA };
}

// ─── Build the Full Network ────────────────────────────────────

export async function buildLeadLagNetwork(
  config?: Partial<LeadLagConfig>,
): Promise<LeadLagNetwork> {
  if (cachedNetwork && Date.now() - cachedAt < NETWORK_CACHE_MS) {
    return cachedNetwork;
  }

  const cfg = { ...DEFAULT_CONFIG, ...config };
  const nodeCount = GRAPH_NODES.length;

  console.log(`[LEADLAG] Building network with ${nodeCount} nodes, fetching data...`);

  // Fetch data for all nodes in parallel
  const dataMap = new Map<string, EnrichedMarketData[]>();
  const fetchPromises = GRAPH_NODES.map(async (node) => {
    try {
      const data = await getDailyHistory(node.symbol, cfg.windowDays + cfg.maxLagDays + 20);
      if (data && data.length >= cfg.windowDays) {
        dataMap.set(node.symbol, data);
      }
    } catch (err) {
      console.warn(`[LEADLAG] Failed to fetch ${node.symbol}:`, err);
    }
  });

  await Promise.all(fetchPromises);

  const availableSymbols = Array.from(dataMap.keys());
  console.log(`[LEADLAG] Data available for ${availableSymbols.length}/${nodeCount} nodes`);

  // Compute all pairwise edges
  const edges: LeadLagEdge[] = [];
  const pairs = Math.min(availableSymbols.length, 8); // Limit to avoid O(n^2) explosion
  const topSymbols = availableSymbols.slice(0, pairs);

  for (let i = 0; i < topSymbols.length; i++) {
    for (let j = i + 1; j < topSymbols.length; j++) {
      const symA = topSymbols[i];
      const symB = topSymbols[j];
      const retA = toReturns(dataMap.get(symA)!);
      const retB = toReturns(dataMap.get(symB)!);

      if (retA.length < cfg.windowDays + cfg.maxLagDays || retB.length < cfg.windowDays + cfg.maxLagDays) continue;

      const rCorr = rollingCorrelation(retA, retB, cfg.windowDays);

      // Skip if contemporaneous correlation is too low
      if (Math.abs(rCorr) < cfg.minCorrelation) continue;

      const { directionality, aLeadsB, bLeadsA } = computeDirectionality(
        retA, retB, cfg.maxLagDays, cfg.windowDays,
      );

      // Determine who leads whom
      let source: string, target: string, maxLag: number, laggedCorr: number, decay: number;

      if (directionality > 0) {
        // A leads B
        source = symA;
        target = symB;
        maxLag = aLeadsB.lag;
        laggedCorr = aLeadsB.corr;
        decay = aLeadsB.decay;
      } else {
        // B leads A
        source = symB;
        target = symA;
        maxLag = bLeadsA.lag;
        laggedCorr = bLeadsA.corr;
        decay = bLeadsA.decay;
      }

      // Lagged correlation must be meaningfully better than rolling
      const laggedGain = Math.abs(laggedCorr) - Math.abs(rCorr);
      if (laggedGain < cfg.minLaggedGain && Math.abs(directionality) < 0.05) continue;

      const absLaggedCorr = Math.abs(laggedCorr);
      const strength: LeadLagEdge['strength'] = absLaggedCorr > 0.4 ? 'STRONG' : absLaggedCorr > 0.25 ? 'MODERATE' : 'WEAK';

      edges.push({
        source,
        target,
        maxLag,
        laggedCorr: Math.round(laggedCorr * 10000) / 10000,
        rollingCorr: Math.round(rCorr * 10000) / 10000,
        directionality: Math.round(directionality * 10000) / 10000,
        strength,
        decay: Math.round(decay * 10000) / 10000,
      });
    }
  }

  // Compute node influence scores
  const nodeInfluences = computeNodeInfluences(availableSymbols, edges);

  // Find shock propagation paths (BFS from high-degree transmitters)
  const shockPaths = findShockPropagationPaths(nodeInfluences, edges);

  const network: LeadLagNetwork = {
    computedAt: new Date().toISOString(),
    windowDays: cfg.windowDays,
    maxLagDays: cfg.maxLagDays,
    minCorrelation: cfg.minCorrelation,
    nodes: nodeInfluences,
    edges,
    edgeCount: edges.length,
    shockPropagationPaths: shockPaths,
  };

  cachedNetwork = network;
  cachedAt = Date.now();

  console.log(`[LEADLAG] Network built: ${edges.length} edges, ${nodeInfluences.filter(n => n.role === 'NET_TRANSMITTER').length} transmitters, ${nodeInfluences.filter(n => n.role === 'NET_RECEIVER').length} receivers`);

  return network;
}

// ─── Node Influence Computation ────────────────────────────────

function computeNodeInfluences(
  symbols: string[],
  edges: LeadLagEdge[],
): NodeInfluence[] {
  return symbols.map(sym => {
    const outEdges = edges.filter(e => e.source === sym);
    const inEdges = edges.filter(e => e.target === sym);

    // Net transmitter score: sum of outgoing directionality * |corr|
    const transmitterScore = outEdges.reduce((s, e) => s + Math.abs(e.directionality) * Math.abs(e.laggedCorr), 0);
    // Net receiver score: sum of incoming directionality * |corr|
    const receiverScore = inEdges.reduce((s, e) => s + Math.abs(e.directionality) * Math.abs(e.laggedCorr), 0);

    const netScore = transmitterScore - receiverScore;

    let role: NodeInfluence['role'];
    if (transmitterScore > 0.3 && transmitterScore > receiverScore * 1.5) {
      role = 'NET_TRANSMITTER';
    } else if (receiverScore > 0.3 && receiverScore > transmitterScore * 1.5) {
      role = 'NET_RECEIVER';
    } else if (outEdges.length >= 2 && inEdges.length >= 2) {
      role = 'CONNECTOR';
    } else {
      role = 'ISOLATED';
    }

    // Find strongest connections
    const sortedOut = [...outEdges].sort((a, b) => Math.abs(b.laggedCorr) - Math.abs(a.laggedCorr));
    const sortedIn = [...inEdges].sort((a, b) => Math.abs(b.laggedCorr) - Math.abs(a.laggedCorr));

    const nodeLabel = GRAPH_NODES.find(n => n.symbol === sym)?.label ?? sym;

    return {
      symbol: sym,
      label: nodeLabel,
      netTransmitterScore: Math.round(transmitterScore * 1000) / 1000,
      netReceiverScore: Math.round(receiverScore * 1000) / 1000,
      outgoingEdges: outEdges.length,
      incomingEdges: inEdges.length,
      strongestOutgoing: sortedOut[0]
        ? { target: sortedOut[0].target, lag: sortedOut[0].maxLag, corr: sortedOut[0].laggedCorr }
        : null,
      strongestIncoming: sortedIn[0]
        ? { source: sortedIn[0].source, lag: sortedIn[0].maxLag, corr: sortedIn[0].laggedCorr }
        : null,
      role,
    };
  });
}

// ─── Shock Propagation Paths ───────────────────────────────────
// BFS from each NET_TRANSMITTER, follow edges to find propagation chains.

function findShockPropagationPaths(
  nodes: NodeInfluence[],
  edges: LeadLagEdge[],
  maxDepth: number = 4,
): ShockPath[] {
  const transmitters = nodes.filter(n => n.role === 'NET_TRANSMITTER' || n.role === 'CONNECTOR');
  const paths: ShockPath[] = [];

  // Build adjacency list
  const adj = new Map<string, { target: string; lag: number; corr: number; strength: LeadLagEdge['strength'] }[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push({ target: e.target, lag: e.maxLag, corr: e.laggedCorr, strength: e.strength });
  }

  for (const tx of transmitters) {
    // BFS
    const queue: { node: string; path: string[]; totalLag: number; compoundedCorr: number }[] = [
      { node: tx.symbol, path: [tx.symbol], totalLag: 0, compoundedCorr: 1 },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = adj.get(current.node) ?? [];

      for (const edge of neighbors) {
        if (current.path.includes(edge.target)) continue; // No cycles
        if (current.path.length >= maxDepth) continue;

        const newPath = [...current.path, edge.target];
        const newLag = current.totalLag + edge.lag;
        const newCorr = current.compoundedCorr * Math.abs(edge.corr);

        if (newPath.length >= 2 && Math.abs(edge.corr) > DEFAULT_CONFIG.minCorrelation) {
          const strength: ShockPath['strength'] = newCorr > 0.3 ? 'STRONG' : newCorr > 0.15 ? 'MODERATE' : 'WEAK';
          paths.push({
            origin: tx.symbol,
            path: newPath,
            totalLagDays: newLag,
            compoundedCorr: Math.round(newCorr * 10000) / 10000,
            strength,
          });
        }

        queue.push({ node: edge.target, path: newPath, totalLag: newLag, compoundedCorr: newCorr });
      }
    }
  }

  // Sort by compounded correlation and return top paths
  return paths
    .sort((a, b) => b.compoundedCorr - a.compoundedCorr)
    .slice(0, 20);
}

// ─── Get Edges for a Specific Node ─────────────────────────────

export function getNodeEdges(network: LeadLagNetwork, symbol: string): {
  outgoing: LeadLagEdge[];
  incoming: LeadLagEdge[];
  influence: NodeInfluence | undefined;
} {
  return {
    outgoing: network.edges.filter(e => e.source === symbol),
    incoming: network.edges.filter(e => e.target === symbol),
    influence: network.nodes.find(n => n.symbol === symbol),
  };
}

// ─── Invalidate Cache ──────────────────────────────────────────

export function invalidateLeadLagCache(): void {
  cachedNetwork = null;
  cachedAt = 0;
}
