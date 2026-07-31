// ============================================================
// Health Thresholds — configurable kill-switch ladder parameters.
// These can be overridden per-strategy or per-regime later.
// ============================================================

export type HealthThresholds = {
  // Fill / Reject
  fillRateMin: number;           // below this → L1
  rejectRateMax: number;          // above this → L1
  rejectRateCritical: number;     // above this → L4

  // Slippage (in basis points)
  baselineSlippageBps: number;    // reference baseline
  avgSlippageMaxFactor: number;   // avgSlippage > baseline * factor → L1
  p95SlippageMaxFactor: number;   // p95Slippage > baseline * factor → L2
  p95SlippageCriticalBps: number; // p95 above this absolute → L4

  // Latency (ms)
  baselineLatencyMs: number;      // reference baseline
  latencyMaxFactor: number;       // avgLatency > baseline * factor → L1
  latencyCriticalMs: number;      // above this absolute → L4

  // Drawdown
  maxDrawdownPct: number;         // above this → L2
  drawdownCriticalPct: number;    // above this → L4

  // Streak
  consecutiveLossesL1: number;    // ≥ this → L1
  consecutiveLossesL2: number;    // ≥ this → L2

  // Stops
  stopAttachedMin: number;        // below this → L2 (for strategies requiring stops)

  // Exposure
  maxExposurePct: number;         // above this → L2
  exposureCriticalPct: number;    // above this → L4
};

// ─── Defaults (conservative for a bot in verification phase) ──

export const DEFAULT_THRESHOLDS: HealthThresholds = {
  fillRateMin: 0.95,
  rejectRateMax: 0.02,
  rejectRateCritical: 0.10,

  baselineSlippageBps: 5,
  avgSlippageMaxFactor: 1.2,
  p95SlippageMaxFactor: 2.0,
  p95SlippageCriticalBps: 50,

  baselineLatencyMs: 250,
  latencyMaxFactor: 2.0,
  latencyCriticalMs: 10000,

  maxDrawdownPct: 5,
  drawdownCriticalPct: 10,

  consecutiveLossesL1: 3,
  consecutiveLossesL2: 5,

  stopAttachedMin: 1.0,

  maxExposurePct: 0.35,
  exposureCriticalPct: 0.60,
};

// ─── Named presets ─────────────────────────────────────────────

export const PRESETS: Record<string, Partial<HealthThresholds>> = {
  aggressive: {
    fillRateMin: 0.90,
    rejectRateMax: 0.05,
    rejectRateCritical: 0.15,
    maxDrawdownPct: 8,
    drawdownCriticalPct: 15,
    consecutiveLossesL1: 5,
    consecutiveLossesL2: 8,
    maxExposurePct: 0.50,
  },
  conservative: {
    fillRateMin: 0.98,
    rejectRateMax: 0.01,
    rejectRateCritical: 0.05,
    maxDrawdownPct: 3,
    drawdownCriticalPct: 6,
    consecutiveLossesL1: 2,
    consecutiveLossesL2: 3,
    maxExposurePct: 0.20,
  },
};

export function mergeThresholds(
  base: HealthThresholds,
  overrides: Partial<HealthThresholds>,
): HealthThresholds {
  return { ...base, ...overrides };
}
