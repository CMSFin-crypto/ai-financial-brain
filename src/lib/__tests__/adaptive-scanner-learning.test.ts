/**
 * Unit tests for Adaptive Scanner Learning Engine
 * Tests pure logic functions: explainRankingChange, calculateOutcome, shouldAllowWeightUpdate
 */

import {
  explainRankingChange,
  calculateOutcome,
  shouldAllowWeightUpdate,
  calculateRelativeVolume,
  calculateClosingStrength,
} from '@/lib/adaptive-scanner-learning';
import {
  RankingChangeAction,
  ScannerDecision,
  SignalOutcomeType,
} from '@prisma/client';

describe('calculateRelativeVolume', () => {
  it('returns null when inputs are missing', () => {
    expect(calculateRelativeVolume(null, null)).toBeNull();
    expect(calculateRelativeVolume(undefined, undefined)).toBeNull();
    expect(calculateRelativeVolume(1000000, null)).toBeNull();
    expect(calculateRelativeVolume(null, 1000000)).toBeNull();
  });

  it('returns null when average is zero or negative', () => {
    expect(calculateRelativeVolume(1000000, 0)).toBeNull();
    expect(calculateRelativeVolume(1000000, -1)).toBeNull();
  });

  it('calculates correct relative volume', () => {
    expect(calculateRelativeVolume(2000000, 1000000)).toBe(2);
    expect(calculateRelativeVolume(500000, 1000000)).toBe(0.5);
    expect(calculateRelativeVolume(1000000, 1000000)).toBe(1);
  });
});

describe('calculateClosingStrength', () => {
  it('returns null when inputs are missing or invalid', () => {
    expect(calculateClosingStrength(null, null, null)).toBeNull();
    expect(calculateClosingStrength(100, 100, 100)).toBeNull();
    expect(calculateClosingStrength(50, 100, 75)).toBeNull();
  });

  it('calculates closing strength correctly', () => {
    expect(calculateClosingStrength(100, 90, 100)).toBe(1);
    expect(calculateClosingStrength(100, 90, 90)).toBe(0);
    expect(calculateClosingStrength(100, 90, 95)).toBe(0.5);
  });
});

describe('explainRankingChange', () => {
  it('returns ENTERED_LIST when no previous snapshot exists', () => {
    const current = {
      ticker: 'AAPL', totalScore: 72, decision: ScannerDecision.READY,
      price: 180, reasons: ['Trend i forte', 'Pullback ne EMA20'],
    };
    const result = explainRankingChange(null, current);
    expect(result.action).toBe(RankingChangeAction.ENTERED_LIST);
    expect(result.oldRank).toBeNull();
    expect(result.newScore).toBe(72);
  });

  it('detects RANK_UP when rank improves', () => {
    const previous = {
      id: 'snap1', snapshotAt: new Date(), ticker: 'AAPL',
      rank: 5, totalScore: 65, decision: ScannerDecision.WATCHLIST, price: 178,
    };
    const current = {
      ticker: 'AAPL', rank: 2, totalScore: 72, decision: ScannerDecision.READY, price: 180,
    };
    const result = explainRankingChange(previous, current);
    expect(result.action).toBe(RankingChangeAction.RANK_UP);
    expect(result.scoreChange).toBe(7);
  });

  it('detects RANK_DOWN when rank deteriorates', () => {
    const previous = {
      id: 'snap1', snapshotAt: new Date(), ticker: 'AAPL',
      rank: 1, totalScore: 75, decision: ScannerDecision.READY, price: 178,
    };
    const current = {
      ticker: 'AAPL', rank: 4, totalScore: 60, decision: ScannerDecision.WATCHLIST, price: 172,
    };
    const result = explainRankingChange(previous, current);
    expect(result.action).toBe(RankingChangeAction.RANK_DOWN);
  });

  it('detects EXITED_LIST when rank becomes null', () => {
    const previous = {
      id: 'snap1', snapshotAt: new Date(), ticker: 'AAPL',
      rank: 3, totalScore: 65, decision: ScannerDecision.WATCHLIST, price: 178,
    };
    const current = {
      ticker: 'AAPL', rank: null, totalScore: 30, decision: ScannerDecision.NO_TRADE, price: 160,
    };
    const result = explainRankingChange(previous, current);
    expect(result.action).toBe(RankingChangeAction.EXITED_LIST);
  });

  it('detects SCORE_UP when score increases', () => {
    const previous = {
      id: 'snap1', snapshotAt: new Date(), ticker: 'AAPL',
      rank: 1, totalScore: 60, decision: ScannerDecision.READY, price: 178,
    };
    const current = {
      ticker: 'AAPL', rank: 1, totalScore: 70, decision: ScannerDecision.READY, price: 180,
    };
    const result = explainRankingChange(previous, current);
    expect(result.action).toBe(RankingChangeAction.SCORE_UP);
    expect(result.scoreChange).toBe(10);
  });

  it('detects VWAP crossover in reasons', () => {
    const previous = {
      id: 'snap1', snapshotAt: new Date(), ticker: 'AAPL',
      rank: 1, totalScore: 70, decision: ScannerDecision.READY, price: 178, aboveVwap: false,
    };
    const current = {
      ticker: 'AAPL', rank: 1, totalScore: 70, decision: ScannerDecision.READY, price: 180, aboveVwap: true,
    };
    const result = explainRankingChange(previous, current);
    expect(result.reasons.some((r: string) => r.includes('VWAP'))).toBe(true);
  });
});

describe('calculateOutcome', () => {
  it('returns PENDING when no price data is available', () => {
    const result = calculateOutcome({ entryPrice: 100 });
    expect(result.outcome).toBe(SignalOutcomeType.PENDING);
  });

  it('returns STOPPED_OUT when day one low is broken', () => {
    const result = calculateOutcome({
      entryPrice: 100, nextDayHighPrice: 103, nextDayClosePrice: 95, heldDayOneLow: false,
    });
    expect(result.outcome).toBe(SignalOutcomeType.STOPPED_OUT);
  });

  it('returns CONTINUATION when target hit and close positive', () => {
    const result = calculateOutcome({
      entryPrice: 100, nextDayHighPrice: 106, nextDayClosePrice: 104, heldVwapToClose: true,
    });
    expect(result.outcome).toBe(SignalOutcomeType.CONTINUATION);
    expect(result.hitTarget5Pct).toBe(true);
  });

  it('returns PULLBACK_SUCCESS when close positive and held VWAP', () => {
    const result = calculateOutcome({
      entryPrice: 100, nextDayHighPrice: 103, nextDayClosePrice: 102, closePrice: 101, heldVwapToClose: true,
    });
    expect(result.outcome).toBe(SignalOutcomeType.PULLBACK_SUCCESS);
  });

  it('returns FADE when VWAP broken and close negative', () => {
    const result = calculateOutcome({
      entryPrice: 100, closePrice: 95, nextDayHighPrice: 101, nextDayClosePrice: 96, heldVwapToClose: false,
    });
    expect(result.outcome).toBe(SignalOutcomeType.FADE);
  });

  it('calculates return percentages correctly', () => {
    const result = calculateOutcome({
      entryPrice: 100, priceAfter1Hour: 101, closePrice: 102,
      nextDayOpenPrice: 100.5, nextDayHighPrice: 105, nextDayClosePrice: 103, threeDayClosePrice: 107,
    });
    expect(result.return1HourPct).toBe(1);
    expect(result.returnToClosePct).toBe(2);
    expect(result.nextDayCloseReturnPct).toBe(3);
    expect(result.threeDayReturnPct).toBe(7);
  });
});

describe('shouldAllowWeightUpdate', () => {
  it('rejects update when sample size < 50', () => {
    const result = shouldAllowWeightUpdate({
      sampleSize: 30, currentWeight: 0.2, hitRate: 0.7, averageReturnPct: 2, averageDrawdownPct: -3,
    });
    expect(result.shouldUpdate).toBe(false);
    expect(result.proposedWeight).toBe(0.2);
  });

  it('increases weight when hitRate >= 0.6 and positive return', () => {
    const result = shouldAllowWeightUpdate({
      sampleSize: 100, currentWeight: 0.2, hitRate: 0.65, averageReturnPct: 1.5, averageDrawdownPct: -3,
    });
    expect(result.shouldUpdate).toBe(true);
    expect(result.proposedWeight).toBeGreaterThan(0.2);
  });

  it('decreases weight when hitRate <= 0.4', () => {
    const result = shouldAllowWeightUpdate({
      sampleSize: 100, currentWeight: 0.2, hitRate: 0.35, averageReturnPct: -0.5, averageDrawdownPct: -5,
    });
    expect(result.shouldUpdate).toBe(true);
    expect(result.proposedWeight).toBeLessThan(0.2);
  });

  it('no change when performance is neutral', () => {
    const result = shouldAllowWeightUpdate({
      sampleSize: 100, currentWeight: 0.2, hitRate: 0.5, averageReturnPct: 0, averageDrawdownPct: -3,
    });
    expect(result.shouldUpdate).toBe(false);
    expect(result.proposedWeight).toBe(0.2);
  });
});
