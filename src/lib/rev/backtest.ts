// ═══════════════════════════════════════════════════════════════════
// REV v1 — Motori i Backtest-it & Validimit (IS / OOS / Walk-Forward)
// ═══════════════════════════════════════════════════════════════════
// E VEÇANTË nga validation-lab-i i CTC (src/lib/validation/*) — s'e
// prek, s'e importon, rendet me logjikën REV. Metrikat e REV s'përzier
// kurrë me metrikat e CTC (spec Seksioni 9).
//
// Zbaton: zonën e likuiditetit 20-80pct point-in-time, sinjalin
// (ret3 ≤ -8% OSE RSI2 < 10, idiosinkratik vs SPY), circuit-breaker
// SPY -3%, konfirmimin kundër falling-knife, exit-et (stop 1.3×ATR14,
// target 1.2R, time-stop 3d, max 5d), kostot (slippage+spread+komision)
// dhe falling-knife rate.
// ═══════════════════════════════════════════════════════════════════

import {
  REV_HYPOTHESIS as H,
  type WalkForwardWindowResult,
} from './hypothesis';
import {
  revRsi,
  revAtr,
  revDollarVol20,
  revLiquidityZoneAt,
  revSectorOf,
  revSignalCheck,
  revConfirmationCheck,
  revHasRecentMaterial8k,
  type RevBar,
  type RevFiling8k,
  type RevSeries,
} from './signal';

// ── Tregtia ───────────────────────────────────────────────────────────

export interface RevTrade {
  symbol: string;
  sector: string;
  signalDate: string;
  entryDate: string;
  exitDate: string;
  entry: number;
  stop: number;
  target: number;
  exitPrice: number;
  exitReason: 'STOP' | 'TARGET' | 'TIME_STOP' | 'MAX_HOLD';
  rGross: number;
  rNet: number;
  rNetPlus10bp: number;
  madeNewLowAfterEntry: boolean;
}

export interface RevBacktestFunnel {
  symbolsRequested: number;
  symbolsWithData: number;
  tradingDays: number;
  signalsExamined: number;
  blockedBy8k: number;
  blockedBySpyCrash: number;
  blockedByNewLow: number;
  blockedByConfirmFail: number;
  blockedByCooldown: number;
  tradesTaken: number;
}

export interface RevMetricsOut {
  trades: number;
  profitFactor: number;
  winRate: number;
  maxDrawdownPct: number;
  totalR: number;
}

export interface RevBacktestResult {
  trades: RevTrade[];
  is: RevMetricsOut;
  oos: RevMetricsOut;
  wf: WalkForwardWindowResult[];
  knifeRate: number;
  symbolConcentrationPct: number;
  costSensitivity: Record<string, number>;
  funnel: RevBacktestFunnel;
  dataCoverage: { from: string; to: string };
}

// ── Ndihmës ───────────────────────────────────────────────────────────

function metricsFromTrades(trades: RevTrade[]): RevMetricsOut {
  const n = trades.length;
  if (!n) return { trades: 0, profitFactor: 0, winRate: 0, maxDrawdownPct: 0, totalR: 0 };
  let grossProfit = 0;
  let grossLoss = 0;
  let wins = 0;
  for (const t of trades) {
    if (t.rNet > 0) {
      grossProfit += t.rNet;
      wins++;
    } else {
      grossLoss += -t.rNet;
    }
  }
  const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  // Equity curve e përbërë: 1R = riskPerTradePct i kapitalit
  let equity = 1;
  let peak = 1;
  let maxDd = 0;
  for (const t of trades) {
    equity *= 1 + t.rNet * H.riskPerTradePct;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, (peak - equity) / peak);
  }
  return {
    trades: n,
    profitFactor: pf,
    winRate: wins / n,
    maxDrawdownPct: maxDd * 100,
    totalR: trades.reduce((s, t) => s + t.rNet, 0),
  };
}

function costInR(entry: number, riskPerShare: number, extraBpsPerSide: number): number {
  // Per krah: slippage + gjysma e spread-it; 2 krahe (hyrje+dalje) + komision $0.005/aksion × 2.
  const sideFrac = (H.slippageBps + H.spreadBpsEstimate / 2 + extraBpsPerSide) / 10_000;
  const priceCostR = (sideFrac * 2 * entry) / riskPerShare;
  const commissionR = (H.commissionPerShare * 2) / riskPerShare;
  return priceCostR + commissionR;
}

// ── Backtest-i kryesor ────────────────────────────────────────────────

export interface RevBacktestInput {
  series: RevSeries[]; // aksionet me ditare ditor
  spyBars: RevBar[];
  filings8k?: Record<string, RevFiling8k[]>; // opsionale (EDGAR recent)
  isSplitPct?: number; // default 70
  wfWindowCount?: number; // default 5
}

export function runRevBacktest(input: RevBacktestInput): RevBacktestResult {
  const { series, spyBars, filings8k = {}, isSplitPct = 0.7, wfWindowCount = 5 } = input;

  const funnel: RevBacktestFunnel = {
    symbolsRequested: series.length,
    symbolsWithData: 0,
    tradingDays: 0,
    signalsExamined: 0,
    blockedBy8k: 0,
    blockedBySpyCrash: 0,
    blockedByNewLow: 0,
    blockedByConfirmFail: 0,
    blockedByCooldown: 0,
    tradesTaken: 0,
  };

  // Indekset e ditareve
  const spyDates = spyBars.map((b) => b.date);
  const spyDateIdx = new Map<string, number>();
  spyDates.forEach((d, i) => spyDateIdx.set(d, i));

  const spyClose = spyBars.map((b) => b.close);
  const spyRet3: number[] = spyClose.map((c, i) =>
    i >= 3 ? (c / spyClose[i - 3] - 1) * 100 : NaN,
  );
  const spyDaily: number[] = spyClose.map((c, i) =>
    i >= 1 ? (c / spyClose[i - 1] - 1) * 100 : NaN,
  );

  // Përgatitja për simbol: treguesit e para-llogaritur
  const per = series.map((s) => {
    const closes = s.bars.map((b) => b.close);
    const rsi2 = revRsi(closes, 2);
    const atr14 = revAtr(s.bars, 14);
    const dateIdx = new Map<string, number>();
    s.bars.forEach((b, i) => dateIdx.set(b.date, i));
    return { s, closes, rsi2, atr14, dateIdx };
  });
  funnel.symbolsWithData = per.filter((p) => p.s.bars.length > 30).length;

  // Gjendja e pozicioneve / cooldown
  const lastExitDateBySymbol = new Map<string, string>();
  const openUntilBySymbol = new Map<string, string>(); // symbol → exitDate (skip sinjalet deri atëherë)

  const trades: RevTrade[] = [];

  // Iterim kronologjik mbi ditat e SPY
  for (let di = 30; di < spyBars.length - 1; di++) {
    const date = spyDates[di];
    const spyRet3Here = spyRet3[di];
    const spyDailyHere = spyDaily[di];
    if (!Number.isFinite(spyRet3Here)) continue;

    // Circuit-breaker sistemik: SPY ≤ -3% ditën e sinjalit → pa sinjale të reja
    const spyCrashToday = spyDailyHere <= H.blockIfSpyDailyMovePctBelow;

    // Snapshot point-in-time i dollar-volume për zonën 20-80pct
    const snapshot: { symbol: string; dollarVol20: number; price: number }[] = [];
    const idxHere = new Map<string, number>();
    for (const p of per) {
      const i = p.dateIdx.get(date);
      if (i === undefined || i < 25) continue;
      const b = p.s.bars[i];
      snapshot.push({ symbol: p.s.symbol, dollarVol20: revDollarVol20(p.s.bars, i), price: b.close });
      idxHere.set(p.s.symbol, i);
    }
    if (!snapshot.length) continue;
    funnel.tradingDays = Math.max(funnel.tradingDays, di);
    const { inZone } = revLiquidityZoneAt(snapshot);

    for (const p of per) {
      const i = idxHere.get(p.s.symbol);
      if (i === undefined || i < 25) continue;
      if (!inZone.has(p.s.symbol)) continue;

      const bars = p.s.bars;
      const bar = bars[i];
      const confirmBar = bars[i + 1];
      if (!confirmBar) continue;

      // Cooldown / tregti e hapur për këtë simbol
      const openUntil = openUntilBySymbol.get(p.s.symbol);
      if (openUntil && date <= openUntil) {
        funnel.blockedByCooldown++;
        continue;
      }
      const lastExit = lastExitDateBySymbol.get(p.s.symbol);
      if (lastExit) {
        const dDays = (new Date(date).getTime() - new Date(lastExit).getTime()) / 86400_000;
        if (dDays < H.symbolCooldownDays) {
          funnel.blockedByCooldown++;
          continue;
        }
      }

      const ret3 = (bar.close / bars[i - 3].close - 1) * 100;
      const r2 = p.rsi2[i];
      if (!Number.isFinite(r2)) continue;

      const sig = revSignalCheck({ ret3Pct: ret3, rsi2: r2, spyRet3Pct: spyRet3Here, spyDailyMovePct: spyDailyHere });
      if (!sig.dropTriggered) continue;
      funnel.signalsExamined++;

      if (spyCrashToday || sig.spyCrash) {
        funnel.blockedBySpyCrash++;
        continue;
      }
      if (!sig.idiosyncratic) continue;

      // Event-gate real: 8-K material brenda 2 ditëve PARA ditës së sinjalit
      const filings = filings8k[p.s.symbol];
      if (filings && filings.length) {
        const gate = revHasRecentMaterial8k(filings, date);
        if (gate.blocked) {
          funnel.blockedBy8k++;
          continue;
        }
      }

      // Konfirmimi ditën t+1
      const conf = revConfirmationCheck({ signalBar: bar, confirmBar: confirmBar, confirmVolume: confirmBar.volume });
      if (conf.newLow) {
        funnel.blockedByNewLow++;
        continue;
      }
      if (!conf.stabilizing || !conf.volumeDeclining) {
        funnel.blockedByConfirmFail++;
        continue;
      }

      // Hyrja në mbylljen e ditës së konfirmimit
      const entry = confirmBar.close;
      const atrHere = p.atr14[i + 1];
      if (!Number.isFinite(atrHere) || atrHere <= 0) continue;
      const stop = entry - H.stopAtrMultiple * atrHere;
      if (stop >= entry) continue;
      const riskPerShare = entry - stop;
      const target = entry + H.targetRMultiple * riskPerShare;

      // Simulimi i exit-it
      let exitPrice = NaN;
      let exitDate = '';
      let exitReason: RevTrade['exitReason'] = 'TIME_STOP';
      let knife = false;
      const signalLow = Math.min(bar.low, confirmBar.low);
      const lastJ = Math.min(bars.length - 1, i + 1 + H.maxHoldingDays);
      for (let j = i + 2; j <= lastJ; j++) {
        const bj = bars[j];
        if (bj.low < signalLow) knife = true;
        if (bj.low <= stop) {
          exitPrice = stop;
          exitDate = bj.date;
          exitReason = 'STOP';
          break;
        }
        if (bj.high >= target) {
          exitPrice = target;
          exitDate = bj.date;
          exitReason = 'TARGET';
          break;
        }
        const heldDays = j - (i + 1);
        if (heldDays === H.timeStopDays) {
          exitPrice = bj.close;
          exitDate = bj.date;
          exitReason = 'TIME_STOP';
          break;
        }
        if (j === lastJ) {
          exitPrice = bj.close;
          exitDate = bj.date;
          exitReason = 'MAX_HOLD';
        }
      }
      if (!Number.isFinite(exitPrice)) continue;

      const rGross = (exitPrice - entry) / riskPerShare;
      const rNet = rGross - costInR(entry, riskPerShare, 0);
      const rNetPlus = rGross - costInR(entry, riskPerShare, 10);

      trades.push({
        symbol: p.s.symbol,
        sector: revSectorOf(p.s.symbol),
        signalDate: date,
        entryDate: confirmBar.date,
        exitDate,
        entry,
        stop,
        target,
        exitPrice,
        exitReason,
        rGross,
        rNet,
        rNetPlus10bp: rNetPlus,
        madeNewLowAfterEntry: knife,
      });

      openUntilBySymbol.set(p.s.symbol, exitDate);
      lastExitDateBySymbol.set(p.s.symbol, exitDate);
      funnel.tradesTaken++;
    }
  }

  // ── IS / OOS ndarje kronologjike ──
  const sortedDates = [...new Set(trades.map((t) => t.entryDate))].sort();
  const splitIdx = Math.floor(sortedDates.length * isSplitPct);
  const splitDate = sortedDates[Math.min(splitIdx, sortedDates.length - 1)] ?? '';
  const isTrades = trades.filter((t) => t.entryDate <= splitDate);
  const oosTrades = trades.filter((t) => t.entryDate > splitDate);

  const is = metricsFromTrades(isTrades);
  const oos = metricsFromTrades(oosTrades);

  // ── Walk-forward: dritare kalendarike të barabarta ──
  const wf: WalkForwardWindowResult[] = [];
  const allEntryDates = sortedDates;
  if (allEntryDates.length >= 2) {
    const from = new Date(allEntryDates[0]).getTime();
    const to = new Date(allEntryDates[allEntryDates.length - 1]).getTime();
    const step = (to - from) / wfWindowCount;
    for (let w = 0; w < wfWindowCount; w++) {
      const wFrom = new Date(from + step * w).toISOString().split('T')[0];
      const wTo = new Date(from + step * (w + 1) - 1).toISOString().split('T')[0];
      const wt = trades.filter((t) => t.entryDate >= wFrom && t.entryDate <= wTo);
      wf.push({
        label: `WF-${w + 1} (${wFrom} → ${wTo})`,
        trades: wt.length,
        netProfit: wt.reduce((s, t) => s + t.rNet, 0),
        winRate: wt.length ? wt.filter((t) => t.rNet > 0).length / wt.length : 0,
      });
    }
  }

  // ── Falling-knife rate ──
  const knifeRate = trades.length
    ? trades.filter((t) => t.madeNewLowAfterEntry).length / trades.length
    : 0;

  // ── Koncentrimi top-3 simbole (nga R pozitive) ──
  const rBySymbol = new Map<string, number>();
  for (const t of trades) {
    if (t.rNet > 0) rBySymbol.set(t.symbol, (rBySymbol.get(t.symbol) ?? 0) + t.rNet);
  }
  const totalPosR = [...rBySymbol.values()].reduce((s, v) => s + v, 0);
  const top3 = [...rBySymbol.values()].sort((a, b) => b - a).slice(0, 3);
  const symbolConcentrationPct = totalPosR > 0 ? (top3.reduce((s, v) => s + v, 0) / totalPosR) * 100 : 100;

  // ── Cost sensitivity (+10bp për krah) ──
  const pfAt = (key: string, sel: (t: RevTrade) => number) => {
    let gp = 0;
    let gl = 0;
    for (const t of trades) {
      const r = sel(t);
      if (r > 0) gp += r;
      else gl += -r;
    }
    const pf = gl > 0 ? gp / gl : gp > 0 ? 99 : 0;
    return [key, pf] as const;
  };
  const costSensitivity: Record<string, number> = {};
  const [, pfBase] = pfAt('0', (t) => t.rNet);
  costSensitivity['0'] = pfBase;
  const [, pf10] = pfAt('10', (t) => t.rNetPlus10bp);
  costSensitivity['10'] = pf10;

  return {
    trades,
    is,
    oos,
    wf,
    knifeRate,
    symbolConcentrationPct,
    costSensitivity,
    funnel,
    dataCoverage: {
      from: spyBars[0]?.date ?? '',
      to: spyBars[spyBars.length - 1]?.date ?? '',
    },
  };
}
