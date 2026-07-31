// ============================================================
// Strategy Health — 4-level kill-switch ladder.
// Pipeline: execution events → metrics → health score → action.
//
// Levels:
//   OK              — normal operations, all checks pass
//   L1_SOFT_PAUSE   — no new entries, let active exits run
//   L2_SESSION_HALT — halt strategy for rest of session/day
//   L3_SYSTEM_HOLD  — block all automation until manual check
//   L4_HARD_KILL    — full stop, require manual approval
//
// Escalation: only goes UP, never down within a single call.
// A higher-severity trigger always wins over a lower one.
// ============================================================

import { DEFAULT_THRESHOLDS, type HealthThresholds } from './health-thresholds';

// ─── Types ────────────────────────────────────────────────────

export type HealthInput = {
  fillRate?: number | null;
  rejectRate?: number | null;
  avgSlippageBps?: number | null;
  p95SlippageBps?: number | null;
  avgLatencyMs?: number | null;
  maxDrawdownPct?: number | null;
  consecutiveLosses?: number;
  stopAttachedRate?: number | null;
  exposurePct?: number | null;
  baselineSlippageBps?: number | null;
  baselineLatencyMs?: number | null;
};

export type HealthLevel =
  | 'OK'
  | 'L1_SOFT_PAUSE'
  | 'L2_SESSION_HALT'
  | 'L3_SYSTEM_HOLD'
  | 'L4_HARD_KILL';

export type HealthAction =
  | 'CONTINUE'
  | 'PAUSE_NEW_ENTRIES'
  | 'HALT_SESSION'
  | 'HOLD_AUTOMATION'
  | 'HARD_KILL';

export type HealthIssue = {
  metric: string;
  severity: HealthLevel;
  value: number;
  threshold: number;
  description: string;
};

export type StrategyHealthResult = {
  level: HealthLevel;
  action: HealthAction;
  issues: HealthIssue[];
  assessedAt: string;
  cooldownMinutes: number;
  requireManualApproval: boolean;
};

// ─── Level ordering (higher = worse) ──────────────────────────

const LEVEL_ORDER: Record<HealthLevel, number> = {
  OK: 0,
  L1_SOFT_PAUSE: 1,
  L2_SESSION_HALT: 2,
  L3_SYSTEM_HOLD: 3,
  L4_HARD_KILL: 4,
};

const ACTION_FOR_LEVEL: Record<HealthLevel, HealthAction> = {
  OK: 'CONTINUE',
  L1_SOFT_PAUSE: 'PAUSE_NEW_ENTRIES',
  L2_SESSION_HALT: 'HALT_SESSION',
  L3_SYSTEM_HOLD: 'HOLD_AUTOMATION',
  L4_HARD_KILL: 'HARD_KILL',
};

const COOLDOWN_MINUTES: Record<HealthLevel, number> = {
  OK: 0,
  L1_SOFT_PAUSE: 15,
  L2_SESSION_HALT: 60,
  L3_SYSTEM_HOLD: 240,
  L4_HARD_KILL: 0, // indefinite — requires manual approval
};

// ─── Escalation helper ────────────────────────────────────────
// Only escalates, never de-escalates.

function escalate(current: HealthLevel, candidate: HealthLevel): HealthLevel {
  return LEVEL_ORDER[candidate] > LEVEL_ORDER[current] ? candidate : current;
}

// ─── Core assessment ──────────────────────────────────────────

export function assessStrategyHealth(
  input: HealthInput,
  thresholds: HealthThresholds = DEFAULT_THRESHOLDS,
): StrategyHealthResult {
  const issues: HealthIssue[] = [];
  let level: HealthLevel = 'OK';

  // Resolve inputs with safe defaults
  const fillRate = input.fillRate ?? 1;
  const rejectRate = input.rejectRate ?? 0;
  const avgSlippage = input.avgSlippageBps ?? 0;
  const p95Slippage = input.p95SlippageBps ?? 0;
  const latency = input.avgLatencyMs ?? 0;
  const drawdown = input.maxDrawdownPct ?? 0;
  const losses = input.consecutiveLosses ?? 0;
  const stopRate = input.stopAttachedRate ?? 1;
  const exposure = input.exposurePct ?? 0;

  // Baselines from thresholds (can be overridden by input)
  const baseSlippage = input.baselineSlippageBps ?? thresholds.baselineSlippageBps;
  const baseLatency = input.baselineLatencyMs ?? thresholds.baselineLatencyMs;

  // ── L1 triggers ──

  if (fillRate < thresholds.fillRateMin) {
    issues.push({
      metric: 'fillRate', severity: 'L1_SOFT_PAUSE',
      value: fillRate, threshold: thresholds.fillRateMin,
      description: `Fill rate ${(fillRate * 100).toFixed(1)}% below ${(thresholds.fillRateMin * 100).toFixed(0)}%`,
    });
    level = escalate(level, 'L1_SOFT_PAUSE');
  }

  if (rejectRate > thresholds.rejectRateMax) {
    issues.push({
      metric: 'rejectRate', severity: 'L1_SOFT_PAUSE',
      value: rejectRate, threshold: thresholds.rejectRateMax,
      description: `Reject rate ${(rejectRate * 100).toFixed(1)}% above ${(thresholds.rejectRateMax * 100).toFixed(0)}%`,
    });
    level = escalate(level, 'L1_SOFT_PAUSE');
  }

  if (avgSlippage > baseSlippage * thresholds.avgSlippageMaxFactor) {
    issues.push({
      metric: 'avgSlippage', severity: 'L1_SOFT_PAUSE',
      value: avgSlippage, threshold: baseSlippage * thresholds.avgSlippageMaxFactor,
      description: `Avg slippage ${avgSlippage.toFixed(1)} bps > ${thresholds.avgSlippageMaxFactor}x baseline (${baseSlippage} bps)`,
    });
    level = escalate(level, 'L1_SOFT_PAUSE');
  }

  if (latency > baseLatency * thresholds.latencyMaxFactor) {
    issues.push({
      metric: 'latency', severity: 'L1_SOFT_PAUSE',
      value: latency, threshold: baseLatency * thresholds.latencyMaxFactor,
      description: `Avg latency ${latency}ms > ${thresholds.latencyMaxFactor}x baseline (${baseLatency}ms)`,
    });
    level = escalate(level, 'L1_SOFT_PAUSE');
  }

  if (losses >= thresholds.consecutiveLossesL1 && level === 'OK') {
    issues.push({
      metric: 'consecutiveLosses', severity: 'L1_SOFT_PAUSE',
      value: losses, threshold: thresholds.consecutiveLossesL1,
      description: `${losses} consecutive losses (≥${thresholds.consecutiveLossesL1})`,
    });
    level = escalate(level, 'L1_SOFT_PAUSE');
  }

  // ── L2 triggers ──

  if (p95Slippage > baseSlippage * thresholds.p95SlippageMaxFactor) {
    issues.push({
      metric: 'p95Slippage', severity: 'L2_SESSION_HALT',
      value: p95Slippage, threshold: baseSlippage * thresholds.p95SlippageMaxFactor,
      description: `P95 slippage ${p95Slippage.toFixed(1)} bps > ${thresholds.p95SlippageMaxFactor}x baseline`,
    });
    level = escalate(level, 'L2_SESSION_HALT');
  }

  if (drawdown > thresholds.maxDrawdownPct) {
    issues.push({
      metric: 'maxDrawdown', severity: 'L2_SESSION_HALT',
      value: drawdown, threshold: thresholds.maxDrawdownPct,
      description: `Max drawdown ${drawdown.toFixed(1)}% exceeds ${thresholds.maxDrawdownPct}%`,
    });
    level = escalate(level, 'L2_SESSION_HALT');
  }

  if (losses >= thresholds.consecutiveLossesL2) {
    issues.push({
      metric: 'consecutiveLosses', severity: 'L2_SESSION_HALT',
      value: losses, threshold: thresholds.consecutiveLossesL2,
      description: `${losses} consecutive losses (≥${thresholds.consecutiveLossesL2})`,
    });
    level = escalate(level, 'L2_SESSION_HALT');
  }

  if (stopRate < thresholds.stopAttachedMin && stopRate > 0) {
    issues.push({
      metric: 'stopAttachedRate', severity: 'L2_SESSION_HALT',
      value: stopRate, threshold: thresholds.stopAttachedMin,
      description: `Stop attached rate ${(stopRate * 100).toFixed(0)}% < 100%`,
    });
    level = escalate(level, 'L2_SESSION_HALT');
  }

  if (exposure > thresholds.maxExposurePct) {
    issues.push({
      metric: 'exposure', severity: 'L2_SESSION_HALT',
      value: exposure, threshold: thresholds.maxExposurePct,
      description: `Exposure ${(exposure * 100).toFixed(1)}% exceeds ${(thresholds.maxExposurePct * 100).toFixed(0)}%`,
    });
    level = escalate(level, 'L2_SESSION_HALT');
  }

  // ── L4 triggers (critical) ──

  if (rejectRate > thresholds.rejectRateCritical) {
    issues.push({
      metric: 'rejectRate', severity: 'L4_HARD_KILL',
      value: rejectRate, threshold: thresholds.rejectRateCritical,
      description: `Reject rate ${(rejectRate * 100).toFixed(1)}% critically high (> ${(thresholds.rejectRateCritical * 100).toFixed(0)}%)`,
    });
    level = escalate(level, 'L4_HARD_KILL');
  }

  if (drawdown > thresholds.drawdownCriticalPct) {
    issues.push({
      metric: 'maxDrawdown', severity: 'L4_HARD_KILL',
      value: drawdown, threshold: thresholds.drawdownCriticalPct,
      description: `Max drawdown ${drawdown.toFixed(1)}% critically high (> ${thresholds.drawdownCriticalPct}%)`,
    });
    level = escalate(level, 'L4_HARD_KILL');
  }

  if (p95Slippage > thresholds.p95SlippageCriticalBps) {
    issues.push({
      metric: 'p95Slippage', severity: 'L4_HARD_KILL',
      value: p95Slippage, threshold: thresholds.p95SlippageCriticalBps,
      description: `P95 slippage ${p95Slippage.toFixed(1)} bps critical (> ${thresholds.p95SlippageCriticalBps} bps)`,
    });
    level = escalate(level, 'L4_HARD_KILL');
  }

  if (latency > thresholds.latencyCriticalMs) {
    issues.push({
      metric: 'latency', severity: 'L4_HARD_KILL',
      value: latency, threshold: thresholds.latencyCriticalMs,
      description: `Avg latency ${latency}ms critical (> ${thresholds.latencyCriticalMs}ms)`,
    });
    level = escalate(level, 'L4_HARD_KILL');
  }

  if (exposure > thresholds.exposureCriticalPct) {
    issues.push({
      metric: 'exposure', severity: 'L4_HARD_KILL',
      value: exposure, threshold: thresholds.exposureCriticalPct,
      description: `Exposure ${(exposure * 100).toFixed(1)}% critically concentrated (> ${(thresholds.exposureCriticalPct * 100).toFixed(0)}%)`,
    });
    level = escalate(level, 'L4_HARD_KILL');
  }

  return {
    level,
    action: ACTION_FOR_LEVEL[level],
    issues,
    assessedAt: new Date().toISOString(),
    cooldownMinutes: COOLDOWN_MINUTES[level],
    requireManualApproval: level === 'L4_HARD_KILL' || level === 'L3_SYSTEM_HOLD',
  };
}

// ─── Quick gate for use in trade entry flow ───────────────────
// Returns true if the system is healthy enough for new entries.

export function canEnterTrades(health: StrategyHealthResult): boolean {
  return health.level === 'OK';
}

// ─── Quick gate for exits (always allowed unless L4) ──────────

export function canExitTrades(health: StrategyHealthResult): boolean {
  return health.level !== 'L4_HARD_KILL';
}
