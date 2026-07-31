// ============================================================
// Execution Log — records order lifecycle events to DB.
// Call sequence: logSubmitted → logAck → logFilled
// Or use logExecutionEvent for a single-shot record.
// ============================================================

import prisma from './prisma';

// ─── Types ────────────────────────────────────────────────────

export type ExecutionLogInput = {
  predictionId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: string;
  quantity: number;
  intendedPrice?: number;
  submittedPrice?: number;
  filledPrice?: number;
  spreadAtDecision?: number;
  spreadAtFill?: number;
  submittedAt: Date;
  ackAt?: Date;
  filledAt?: Date;
  status: string;
  rejectReason?: string;
  stopAttached?: boolean;
  venue?: string;
};

// ─── Single-shot log ──────────────────────────────────────────

export async function logExecutionEvent(input: ExecutionLogInput) {
  // Compute latency: submittedAt → ackAt
  const latencyMs =
    input.ackAt && input.submittedAt
      ? input.ackAt.getTime() - input.submittedAt.getTime()
      : null;

  // Compute slippage in basis points
  // BUY slippage: positive = worse (paid more than intended)
  // SELL slippage: positive = worse (received less than intended)
  let slippageBps: number | null = null;
  if (input.intendedPrice && input.filledPrice && input.intendedPrice > 0) {
    const raw = ((input.filledPrice - input.intendedPrice) / input.intendedPrice) * 10000;
    slippageBps = input.side === 'BUY' ? raw : -raw;
  }

  // Partial fill % (100 if filled, 0 otherwise — can be enriched later)
  const partialFillPct =
    input.status === 'PARTIAL' && input.quantity > 0
      ? 50 // simplified; real partial would track filledQty
      : input.status === 'FILLED'
        ? 100
        : 0;

  return prisma.executionEvent.create({
    data: {
      predictionId: input.predictionId,
      symbol: input.symbol,
      side: input.side,
      orderType: input.orderType,
      quantity: input.quantity,
      intendedPrice: input.intendedPrice,
      submittedPrice: input.submittedPrice,
      filledPrice: input.filledPrice,
      spreadAtDecision: input.spreadAtDecision,
      spreadAtFill: input.spreadAtFill,
      submittedAt: input.submittedAt,
      ackAt: input.ackAt,
      filledAt: input.filledAt,
      status: input.status,
      rejectReason: input.rejectReason,
      latencyMs,
      slippageBps: slippageBps !== null ? Math.round(slippageBps * 100) / 100 : null,
      partialFillPct,
      stopAttached: input.stopAttached ?? false,
      venue: input.venue,
    },
  });
}

// ─── Multi-step: log submit, then update on ACK ──────────────

export async function logSubmitted(input: {
  predictionId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: string;
  quantity: number;
  intendedPrice?: number;
  submittedPrice?: number;
  spreadAtDecision?: number;
  stopAttached?: boolean;
  venue?: string;
}) {
  return prisma.executionEvent.create({
    data: {
      predictionId: input.predictionId,
      symbol: input.symbol,
      side: input.side,
      orderType: input.orderType,
      quantity: input.quantity,
      intendedPrice: input.intendedPrice,
      submittedPrice: input.submittedPrice,
      spreadAtDecision: input.spreadAtDecision,
      submittedAt: new Date(),
      status: 'SUBMITTED',
      stopAttached: input.stopAttached ?? false,
      venue: input.venue,
    },
  });
}

export async function logAck(eventId: string, ackPrice?: number) {
  const event = await prisma.executionEvent.findUnique({ where: { id: eventId } });
  if (!event) return null;

  const latencyMs = Math.round(Date.now() - event.submittedAt.getTime());

  return prisma.executionEvent.update({
    where: { id: eventId },
    data: {
      status: 'ACKED',
      ackAt: new Date(),
      latencyMs,
      submittedPrice: ackPrice ?? event.submittedPrice,
    },
  });
}

export async function logFilled(
  eventId: string,
  filledPrice: number,
  filledAt?: Date,
  spreadAtFill?: number,
) {
  const event = await prisma.executionEvent.findUnique({ where: { id: eventId } });
  if (!event) return null;

  // Compute slippage
  let slippageBps: number | null = null;
  if (event.intendedPrice && event.intendedPrice > 0) {
    const raw = ((filledPrice - event.intendedPrice) / event.intendedPrice) * 10000;
    slippageBps = event.side === 'BUY' ? raw : -raw;
  }

  // Full round-trip latency
  const fullLatencyMs = event.latencyMs
    ? Math.round((filledAt?.getTime() ?? Date.now()) - event.submittedAt.getTime())
    : null;

  return prisma.executionEvent.update({
    where: { id: eventId },
    data: {
      status: 'FILLED',
      filledPrice,
      filledAt: filledAt ?? new Date(),
      spreadAtFill,
      slippageBps: slippageBps !== null ? Math.round(slippageBps * 100) / 100 : null,
      latencyMs: fullLatencyMs ?? event.latencyMs,
      partialFillPct: 100,
    },
  });
}

export async function logRejected(eventId: string, reason: string) {
  const event = await prisma.executionEvent.findUnique({ where: { id: eventId } });
  if (!event) return null;

  return prisma.executionEvent.update({
    where: { id: eventId },
    data: {
      status: 'REJECTED',
      rejectReason: reason,
      ackAt: new Date(),
      latencyMs: Math.round(Date.now() - event.submittedAt.getTime()),
    },
  });
}
