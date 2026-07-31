// ============================================================
// GET  /api/leadlag/current
//   ?symbol=<SYMBOL>  — get lead-lag features for a specific symbol
//   ?full=true        — return the full network graph
//   ?paths=true       — return shock propagation paths only
//
// Returns the lead-lag network, node influences, and
// shock propagation paths.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { buildLeadLagNetwork, getNodeEdges } from '@/lib/leadlag-network';
import { computeLeadLagFeatures } from '@/lib/leadlag-features';
import { scoreLeadLag } from '@/lib/leadlag-score';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol')?.toUpperCase().trim();
    const full = searchParams.get('full') === 'true';
    const paths = searchParams.get('paths') === 'true';

    if (paths) {
      const network = await buildLeadLagNetwork();
      return NextResponse.json({
        type: 'shock_propagation_paths',
        pathCount: network.shockPropagationPaths.length,
        paths: network.shockPropagationPaths,
      });
    }

    if (symbol) {
      // Symbol-specific view
      const [features, scoreResult] = await Promise.all([
        computeLeadLagFeatures(symbol),
        scoreLeadLag(symbol),
      ]);

      const network = await buildLeadLagNetwork();
      const { outgoing, incoming, influence } = getNodeEdges(network, symbol);

      return NextResponse.json({
        type: 'leadlag_symbol',
        symbol,
        score: scoreResult.score,
        weight: scoreResult.weight,
        signal: scoreResult.signal,
        features,
        edges: {
          outgoing: outgoing.slice(0, 10),
          incoming: incoming.slice(0, 10),
        },
        influence,
      });
    }

    // Full network view (default)
    const network = await buildLeadLagNetwork();

    // Summary by default, full graph if ?full=true
    if (full) {
      return NextResponse.json({
        type: 'leadlag_full_network',
        ...network,
      });
    }

    // Summary view
    const transmitters = network.nodes.filter(n => n.role === 'NET_TRANSMITTER');
    const receivers = network.nodes.filter(n => n.role === 'NET_RECEIVER');
    const connectors = network.nodes.filter(n => n.role === 'CONNECTOR');

    return NextResponse.json({
      type: 'leadlag_summary',
      computedAt: network.computedAt,
      nodeCount: network.nodes.length,
      edgeCount: network.edgeCount,
      transmitters: transmitters.map(n => ({
        symbol: n.symbol, label: n.label,
        score: n.netTransmitterScore, edges: n.outgoingEdges,
      })),
      receivers: receivers.map(n => ({
        symbol: n.symbol, label: n.label,
        score: n.netReceiverScore, edges: n.incomingEdges,
      })),
      connectors: connectors.map(n => ({
        symbol: n.symbol, label: n.label,
      })),
      topShockPaths: network.shockPropagationPaths.slice(0, 5),
      windowDays: network.windowDays,
      maxLagDays: network.maxLagDays,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[LEADLAG-API]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
