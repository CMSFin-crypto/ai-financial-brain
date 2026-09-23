// ═══════════════════════════════════════════════════════════════
// Task 27 — IBKR VALIDATION / backtest-engine.ts
// Përdor të NJËJTËN logjikë të ibkr-strategy që përdor scanner-i
// live (filtra → score → vendim → entry/stop/target), por mbi
// të dhëna historike point-in-time:
//
//   Historical OHLCV → indikatorët → filtrat IBKR Pullback → score
//   → hyrje (qiri pasues) → stop/target → rezultat (me kostot reale)
// ═══════════════════════════════════════════════════════════════
import { HistoricalDataPoint } from '@/lib/alpha-vantage';
import { calculateSMA, calculateRSI, calculateADX } from '@/lib/indicators';
import { calcEMA, calcATR } from './indicators';
import { computeTradeCosts } from './cost-model';
import {
  ExecutionConfig, DEFAULT_EXECUTION,
  checkEntryFill, checkPositionBar, calcShares,
} from './execution-model';
import { BacktestTrade } from './metrics';
import {
  EarningsTimeline, eventStateAsOf, proximityPoints, surprisePoints,
} from './earnings-history';

// ── Variantet e testimit A/B/C/D (Task 28) ──
//   baseline     = Trend + Pullback bërthama, pa event logic, pa filtrat IBKR të avancuara
//   event-filter  = baseline + blloko/penalizo earnings e afërta (spec: -3/-1)
//   event-score   = event-filter + surprise/PEAD (+1/+2/-2)
//   full          = event-score + të gjithë filtrat IBKR (breadth, RS, regime, RSI>70, VIX stop)
export type BacktestVariant = 'baseline' | 'event-filter' | 'event-score' | 'full';

// ── Konstante — IDENTIKE me ibkr-scan/route.ts ──
const SECTOR_DEAD_PCT = 20, SECTOR_WEAK_PCT = 40, SECTOR_STRONG_PCT = 55;
type SectorLabel = 'DEAD' | 'WEAK' | 'OK' | 'STRONG';
const sectorLabel = (p: number): SectorLabel =>
  p < SECTOR_DEAD_PCT ? 'DEAD' : p < SECTOR_WEAK_PCT ? 'WEAK' : p >= SECTOR_STRONG_PCT ? 'STRONG' : 'OK';

export interface PreparedSymbol {
  symbol: string;
  sector: string;
  bars: HistoricalDataPoint[];
  sma50: number[];
  sma200: number[];
  ema10: number[];
  ema20: number[];
  rsi: number[];
  adx: number[];
  /** date → index për kërkim as-of */
  dateIdx: Map<string, number>;
  /** kalendar historik earnings (EDGAR 8-K Item 2.02) — point-in-time */
  earnings?: EarningsTimeline;
}

export interface BacktestContext {
  /** kalendari i tregtimit (datat e SPY) */
  calendar: string[];
  symbols: PreparedSymbol[];
  spy: PreparedSymbol;
  qqq: PreparedSymbol;
  vix: PreparedSymbol;
  /** sektor → ETF i gatshëm (parapërgatitur) */
  sectorEtfs: Record<string, PreparedSymbol>;
  universeSize: number;
  equity: number;
}

/** Parapërgatit një simbol: indikatorë kauzalë (as-of i sigurt) */
export function prepareSymbol(
  symbol: string,
  sector: string,
  bars: HistoricalDataPoint[],
): PreparedSymbol {
  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const dateIdx = new Map<string, number>();
  bars.forEach((b, i) => dateIdx.set(b.date, i));
  return {
    symbol, sector, bars,
    sma50: calculateSMA(closes, 50),
    sma200: calculateSMA(closes, 200),
    ema10: calcEMA(closes, 10),
    ema20: calcEMA(closes, 20),
    rsi: calculateRSI(closes, 14),
    adx: calculateADX(highs, lows, closes, 14),
    dateIdx,
  };
}

/** Indeksi as-of: bari i fundit me date <= target (kauzal) */
function asOfIndex(ps: PreparedSymbol, dateKey: string): number {
  const exact = ps.dateIdx.get(dateKey);
  if (exact !== undefined) return exact;
  // kërkim binar: i fundit <= dateKey
  let lo = 0, hi = ps.bars.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ps.bars[mid].date <= dateKey) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}

interface OpenPosition {
  symbol: string;
  sector: string;
  entryDate: string;
  entry: number;
  stop: number;
  target: number;
  shares: number;
  entryIdx: number; // indeksi i barit të hyrjes
  riskPerShare: number;
  setupType: 'PULLBACK' | 'BREAKOUT' | 'TREND_CONT';
  score: number;
  scoreBreakdown: BacktestTrade['scoreBreakdown'];
  atrPct: number;
  avgDolVol: number;
  spreadPct: number;
  holdDays: number;
}

interface PendingSignal {
  symbol: string;
  sector: string;
  orderPrice: number;
  orderType: 'LIMIT' | 'STOP';
  stop: number;
  targetR: number;
  riskPct: number;
  score: number;
  scoreBreakdown: BacktestTrade['scoreBreakdown'];
  setupType: 'PULLBACK' | 'BREAKOUT' | 'TREND_CONT';
  atrPct: number;
  avgDolVol: number;
  spreadPct: number;
  signalDate: string;
}

export interface BacktestOptions {
  startIndex: number;
  endIndex: number;
  execution?: Partial<ExecutionConfig>;
  /** Varianti i testimit — default 'full' (komportimi i plotë IBKR) */
  variant?: BacktestVariant;
}

export interface BacktestResult {
  trades: BacktestTrade[];
  signalsGenerated: number;
  entryOrdersRejected: number;
  rejectReasons: Record<string, number>;
  /** breadth + regime të regjistruara ditë pas dite (për audit) */
  regimeDays: { date: string; regimeLevel: string; vix: number; breadthPct: number }[];
}

/**
 * MOTORI — ekzekuton strategjinë mbi [startIndex, endIndex] të kalendarit.
 * Çdo ditë t:
 *   1. menaxhon pozicionet e hapura (gap/stop/target/kohë)
 *   2. mbush urdhrat e krijuar dje (hyrje në qirinë pasues)
 *   3. skanon mbi mbylljen e ditës → sinjale për nesër (point-in-time)
 */
export function runBacktest(ctx: BacktestContext, opts: BacktestOptions): BacktestResult {
  const exec: ExecutionConfig = { ...DEFAULT_EXECUTION, ...opts.execution };
  const variant: BacktestVariant = opts.variant || 'full';
  const useEventBlock = variant !== 'baseline';   // B, C, D
  const useEventScore = variant === 'event-score' || variant === 'full'; // C, D
  const useIbkrFilters = variant === 'full';       // vetëm D
  const trades: BacktestTrade[] = [];
  const open: OpenPosition[] = [];
  const pending: PendingSignal[] = [];
  let equity = ctx.equity;
  let signalsGenerated = 0;
  let entryOrdersRejected = 0;
  const rejectReasons: Record<string, number> = {};
  const regimeDays: BacktestResult['regimeDays'] = [];
  const symMap = new Map(ctx.symbols.map(s => [s.symbol, s]));

  const reject = (r: string) => { entryOrdersRejected++; rejectReasons[r] = (rejectReasons[r] || 0) + 1; };

  for (let day = opts.startIndex; day <= opts.endIndex; day++) {
    const today = ctx.calendar[day];

    // ═══ 1) MENAXHIMI I POZICIONEVE TË HAPURA ═══
    for (let i = open.length - 1; i >= 0; i--) {
      const pos = open[i];
      const ps = symMap.get(pos.symbol)!;
      const barIdx = asOfIndex(ps, today);
      if (barIdx < 0) continue;
      const bar = ps.bars[barIdx];
      if (bar.date !== today) continue; // simboli nuk tregtoi sot → mbaj
      pos.holdDays++;

      const exit = checkPositionBar({
        bar, entry: pos.entry, stop: pos.stop, target: pos.target,
        holdDaysSoFar: pos.holdDays, maxHoldDays: exec.maxHoldDays,
      });
      if (!exit) continue;

      // Kostot reale + PnL neto
      const costs = computeTradeCosts({
        shares: pos.shares, entryPrice: pos.entry, exitPrice: exit.exitPrice,
        spreadPct: pos.spreadPct, atrPct: pos.atrPct, avgDolVol: pos.avgDolVol,
      });
      const pnlGross = pos.shares * (exit.exitPrice - pos.entry);
      const pnlNet = pnlGross - costs.totalCost;
      equity += pnlNet;
      trades.push({
        symbol: pos.symbol, sector: pos.sector,
        entryDate: pos.entryDate, exitDate: exit.exitDate,
        entryPrice: pos.entry, exitPrice: exit.exitPrice,
        stop: pos.stop, target: pos.target, shares: pos.shares,
        exitReason: exit.exitReason,
        r: pos.riskPerShare > 0 ? (exit.exitPrice - pos.entry) / pos.riskPerShare : 0,
        pnlNet: Math.round(pnlNet * 100) / 100,
        pnlGross: Math.round(pnlGross * 100) / 100,
        costs: Math.round(costs.totalCost * 100) / 100,
        costsBreakdown: {
          commission: Math.round((costs.commissionEntry + costs.commissionExit) * 100) / 100,
          spread: Math.round(costs.spreadCost * 100) / 100,
          slippage: Math.round(costs.slippageCost * 100) / 100,
          impact: Math.round(costs.marketImpact * 100) / 100,
        },
        score: pos.score, scoreBreakdown: pos.scoreBreakdown,
        setupType: pos.setupType,
        equityAfter: Math.round(equity * 100) / 100,
      });
      open.splice(i, 1);
    }

    // ═══ 2) MBUSHJA E URDHRAVE TË DJESHME (hyrje në qirinë pasues) ═══
    const todaySignals = pending.splice(0, pending.length);
    // rend: score më i lartë i pari (si Top 10 e scanner-it)
    todaySignals.sort((a, b) => b.score - a.score);
    for (const sig of todaySignals) {
      if (open.length >= exec.maxOpenPositions) { reject('POSITION_LIMIT'); continue; }
      const openInSector = open.filter(p => p.sector === sig.sector).length;
      if (openInSector >= exec.maxPerSector) { reject('SECTOR_LIMIT'); continue; }

      const ps = symMap.get(sig.symbol)!;
      const barIdx = asOfIndex(ps, today);
      if (barIdx < 0) { reject('NO_BAR'); continue; }
      const bar = ps.bars[barIdx];
      if (bar.date !== today) { reject('NO_BAR'); continue; }

      const fill = checkEntryFill({
        bar, orderPrice: sig.orderPrice, orderType: sig.orderType,
        maxEntryGapPct: exec.maxEntryGapPct,
      });
      if (!fill.filled) { reject(fill.rejectReason || 'UNFILLED'); continue; }

      const riskPerShare = fill.entryPrice - sig.stop;
      if (riskPerShare <= 0) { reject('BAD_RISK'); continue; }
      // ── MBROJTJE NGA LEVERAGE I PAKUFIZUAR ──
      // 1) Stop-i duhet të mbetet të paktën 0.3% nën hyrjen e EKZEKTUAR:
      //    nëse gap-down e ngushtoi distancën, sinjali nuk vlen më.
      if (riskPerShare < fill.entryPrice * 0.003) { reject('BAD_RISK'); continue; }
      // 2) Sasia maksimale pa leverage: pozicioni ≤ ekuilibri (cash) aktual.
      const maxSharesByCash = Math.floor(equity / fill.entryPrice);
      if (maxSharesByCash <= 0) { reject('NO_CASH'); continue; }

      // Buzheti i rrezikut mbi ekuilibrin e SOTËM (kompaundim realist)
      const sizeRes = calcShares({
        entry: fill.entryPrice, stop: sig.stop,
        riskPct: sig.riskPct, equity,
      });
      const shares = Math.min(sizeRes.shares, maxSharesByCash);
      if (shares <= 0) { reject('NO_CASH'); continue; }

      open.push({
        symbol: sig.symbol, sector: sig.sector,
        entryDate: bar.date, entry: fill.entryPrice,
        stop: sig.stop, target: fill.entryPrice + sig.targetR * riskPerShare,
        shares, entryIdx: barIdx,
        riskPerShare, setupType: sig.setupType,
        score: sig.score, scoreBreakdown: sig.scoreBreakdown,
        atrPct: sig.atrPct, avgDolVol: sig.avgDolVol, spreadPct: sig.spreadPct,
        holdDays: 0,
      });
    }

    // ═══ 3) SKANIMI NË MBYLLJE TË SOTME → sinjale për NESËR ═══
    // (nuk skanimim ditën e fundit — s'ka qiri pasues)
    if (day >= opts.endIndex) continue;

    // Regjimi + breadth as-of SOTME (mbyllja e plotë e ditës)
    const spyIdx = asOfIndex(ctx.spy, today);
    const qqqIdx = asOfIndex(ctx.qqq, today);
    const vixIdx = asOfIndex(ctx.vix, today);
    if (spyIdx < 200 || qqqIdx < 200) continue;

    const spyClose = ctx.spy.bars[spyIdx].close;
    const spyA50 = spyClose > (ctx.spy.sma50[spyIdx] || 0);
    const spyA200 = spyClose > (ctx.spy.sma200[spyIdx] || 0);
    const qqqClose = ctx.qqq.bars[qqqIdx].close;
    const qqqA50 = qqqClose > (ctx.qqq.sma50[qqqIdx] || 0);
    const qqqA200 = qqqClose > (ctx.qqq.sma200[qqqIdx] || 0);
    const regimeOk = spyA50 && spyA200 && qqqA50 && qqqA200;

    const vixLevel = vixIdx >= 0 ? ctx.vix.bars[vixIdx].close : 0;
    const vixStatus = vixLevel === 0 ? 'N/A' : vixLevel > 25 ? 'HIGH' : vixLevel >= 20 ? 'ELEVATED' : 'CALM';

    // Breadth as-of: sa % e universit është mbi SMA50 SOT
    let above50Count = 0, breadthTotal = 0;
    const sectorAbove: Record<string, number> = {};
    const sectorTotal: Record<string, number> = {};
    for (const s of ctx.symbols) {
      const idx = asOfIndex(s, today);
      if (idx < 200) continue;
      breadthTotal++;
      sectorTotal[s.sector] = (sectorTotal[s.sector] || 0) + 1;
      if (s.bars[idx].close > (s.sma50[idx] || 0)) {
        above50Count++;
        sectorAbove[s.sector] = (sectorAbove[s.sector] || 0) + 1;
      }
    }
    const breadthPct = breadthTotal > 0 ? (above50Count / breadthTotal) * 100 : 50;
    const breadthStatus = breadthPct >= 55 ? 'HEALTHY' : breadthPct >= 40 ? 'MIXED' : 'WEAK';

    const sectorLabels: Record<string, SectorLabel> = {};
    for (const sec of Object.keys(sectorTotal)) {
      const p = sectorTotal[sec] > 0 ? (sectorAbove[sec] / sectorTotal[sec]) * 100 : 0;
      sectorLabels[sec] = sectorLabel(p);
    }

    let regimeLevel: 'OK' | 'CAUTION' | 'RISK' = 'OK';
    if (!regimeOk || breadthPct < 35) regimeLevel = 'RISK';
    else if (vixStatus === 'HIGH' || vixStatus === 'ELEVATED' || breadthStatus !== 'HEALTHY') regimeLevel = 'CAUTION';
    const regimeMultiplier = regimeLevel === 'RISK' ? 0.5 : regimeLevel === 'CAUTION' ? 0.75 : 1.0;
    const stopVolMultiplier = vixStatus === 'HIGH' ? 1.5 : vixStatus === 'ELEVATED' ? 1.2 : 1.0;

    if (regimeDays.length === 0 || regimeDays[regimeDays.length - 1].date !== today) {
      regimeDays.push({
        date: today, regimeLevel,
        vix: Math.round(vixLevel * 10) / 10,
        breadthPct: Math.round(breadthPct * 10) / 10,
      });
    }

    // Market-wide cap: 8+/11 sektorë WEAK/DEAD → targetat kapohen në 1R
    const sectors = Object.keys(sectorLabels);
    const weakDead = sectors.filter(sec => sectorLabels[sec] === 'WEAK' || sectorLabels[sec] === 'DEAD').length;
    const capTargetsMarketWide = sectors.length >= 8 && weakDead >= 8;

    // RS benchmark-e as-of (index math — pa slices)
    const spyRS60 = spyIdx >= 60 ? pctAtIdx(ctx.spy.bars, spyIdx, 60) : 0;
    const spyRS22 = spyIdx >= 22 ? pctAtIdx(ctx.spy.bars, spyIdx, 22) : 0;

    // ── Për çdo simbol: filtra → setup → score → vendim ──
    for (const s of ctx.symbols) {
      const idx = asOfIndex(s, today);
      if (idx < 200) continue;
      const bars = s.bars;
      const bar = bars[idx];
      const price = bar.close;
      const sec = s.sector;

      // FILTRA MEKANIKË — si scanner-i (index math, pa alokim arrays)
      const n20 = Math.min(20, idx + 1);
      let volSum20 = 0, dolVolSum = 0;
      for (let i = idx - n20 + 1; i <= idx; i++) {
        volSum20 += bars[i].volume;
        dolVolSum += bars[i].close * bars[i].volume;
      }
      const avgVol20 = volSum20 / n20;
      const avgDolVol = dolVolSum / n20;
      const passedLiq = price >= 10 && avgVol20 >= 1_000_000 && avgDolVol >= 20_000_000;
      if (!passedLiq) continue;

      const sma50V = s.sma50[idx] || 0;
      const sma200V = s.sma200[idx] || 0;
      const above50 = price > sma50V;
      const golden = sma50V > sma200V;
      const rs60 = pctAtIdx(bars, idx, 60);
      if (!(above50 && golden && rs60 > spyRS60)) continue;

      const ema20V = s.ema20[idx] || 0;
      const ema10V = s.ema10[idx] || 0;
      const stackedMA = price > ema20V && ema20V > sma50V && sma50V > sma200V;
      const adxV = s.adx[idx] || 0;
      if (!stackedMA || adxV <= 25) continue;

      // SEKTOR BREADTH GATE as-of — vetëm me filtrat IBKR (D)
      const sbLabel = sectorLabels[sec];
      if (useIbkrFilters && sbLabel === 'DEAD') continue;

      // ── EVENT STATE as-of (kalendar real EDGAR 8-K 2.02) ──
      const evState = eventStateAsOf(s.earnings, today, ctx.calendar);
      // Nesër është dita e hyrjes — earnings atë ditë = kumar i drejtpërdrejtë.
      if (useEventBlock && evState.earningsTomorrow) { reject('EVENT_EARNINGS'); continue; }
      // Full strategy: blloko edhe brenda 2 ditëve (si Catalyst Gate i scanner-it live)
      if (useIbkrFilters && evState.earningsWithin2d) { reject('EVENT_EARNINGS'); continue; }
      // Pikët: B+ vetëm afërsia (-3/-1); C+ edhe surprise/PEAD (+1/+2/-2)
      const evPts = useEventScore
        ? proximityPoints(evState) + surprisePoints(evState)
        : useEventBlock ? proximityPoints(evState)
        : 0;

      // ── SETUP (identik me scanner-in — index math) ──
      const rsiV = s.rsi[idx] || 50;
      const atr = atrAtIndex(bars, idx, 14);
      const atrPct = price > 0 ? (atr / price) * 100 : 0;

      // kulmi i fundit 11-ditor i mbylljeve
      let highIdx = idx;
      for (let i = idx; i >= Math.max(0, idx - 10); i--) {
        if (bars[i].close >= bars[highIdx].close) highIdx = i;
      }
      const peakPrice = bars[highIdx].close;
      const pbPct = peakPrice > 0 ? ((price - peakPrice) / peakPrice) * 100 : 0;
      let swLow = Infinity;
      for (let i = highIdx; i <= idx; i++) swLow = Math.min(swLow, bars[i].low);
      let pbDays = 0;
      for (let i = highIdx + 1; i <= idx; i++) if (bars[i].close < bars[i - 1].close) pbDays++;

      const dist10 = ema10V > 0 ? ((price - ema10V) / ema10V) * 100 : 99;
      const dist20 = ema20V > 0 ? ((price - ema20V) / ema20V) * 100 : 99;

      // volumet e pullback-it (4 ditë) kundrejt atyre paraardhëse (5 ditë)
      let pbVolSum = 0, priorVolSum = 0;
      for (let i = idx - 4; i <= idx - 1; i++) pbVolSum += bars[i].volume;
      for (let i = idx - 9; i <= idx - 5; i++) priorVolSum += bars[i].volume;
      const avgPb = pbVolSum / 4;
      const avgPrior = priorVolSum / 5;
      const volDeclining = avgPb < avgPrior * 0.95;
      const lastDaySpike = bars[idx].volume > avgVol20 * 1.1;
      let recent3Sum = 0;
      for (let i = Math.max(0, idx - 2); i <= idx; i++) recent3Sum += bars[i].volume;
      const recent3 = recent3Sum / Math.min(3, idx + 1);
      const volRatio = avgVol20 > 0 ? recent3 / avgVol20 : 1;
      const rvol = avgVol20 > 0 ? bars[idx].volume / avgVol20 : 1;

      let setup: 'PULLBACK' | 'BREAKOUT' | 'TREND_CONT' | 'NONE' = 'NONE';
      let setupScore = 0;
      if (pbDays >= 2 && pbDays <= 8 && pbPct >= -8 && pbPct <= -0.5) {
        setup = 'PULLBACK'; setupScore = 30;
        if (pbDays >= 3 && pbDays <= 6) setupScore += 20;
        else setupScore += 10;
        if (Math.abs(dist10) < 3 || Math.abs(dist20) < 3) setupScore += 20;
        if (volDeclining) setupScore += 15;
        if (lastDaySpike) setupScore += 15;
        if (rsiV >= 40 && rsiV <= 65) setupScore += 10;
      }
      // high20 i fundit
      let high20 = 0;
      for (let i = Math.max(0, idx - 19); i <= idx; i++) high20 = Math.max(high20, bars[i].high);
      if (setup === 'NONE' && price >= high20 * 0.98 && lastDaySpike && rsiV >= 45 && rsiV <= 70) {
        setup = 'BREAKOUT'; setupScore = 55;
        if (rsiV >= 45 && rsiV <= 65) setupScore += 15;
      }
      if (setup === 'NONE' && pbPct > -0.5 && pbPct < 2 && price > sma50V) {
        setup = 'TREND_CONT'; setupScore = 40;
        if (rsiV >= 50 && rsiV <= 65) setupScore += 15;
        if (lastDaySpike) setupScore += 10;
      }
      if (setup === 'NONE') continue;
      setupScore = Math.min(100, setupScore);

      // ── SCORE — pesha bazë (Learning Engine neutral në backtest) ──
      // Trend (0-100)
      let tScore = 0;
      if (price > sma50V) tScore += 20;
      if (price > sma200V) tScore += 20;
      if (golden) tScore += 15;
      if (stackedMA) tScore += 15;
      let h20a = 0, h20b = 0;
      for (let i = Math.max(0, idx - 39); i <= idx - 20; i++) h20a = Math.max(h20a, bars[i].high);
      for (let i = Math.max(0, idx - 19); i <= idx; i++) h20b = Math.max(h20b, bars[i].high);
      if (h20b > h20a) tScore += 15;
      if (adxV > 25) tScore += 15;
      tScore = Math.min(100, tScore);

      // RS (0-100)
      const rsSpy22 = pctAtIdx(bars, idx, 22) - spyRS22;
      const rsSpy60 = rs60 - spyRS60;
      let rsScore = 50;
      if (rsSpy22 > 0) rsScore += Math.min(25, rsSpy22 * 3);
      else rsScore -= Math.min(25, Math.abs(rsSpy22) * 3);
      if (rsSpy60 > 0) rsScore += Math.min(25, rsSpy60 * 2);
      else rsScore -= Math.min(25, Math.abs(rsSpy60) * 2);

      // RS vs Sector ETF (20D) — as-of
      const sectorEtfPs = ctx.sectorEtfs[sec];
      let sectorAboveSma50 = false;
      let sectorRsStatus = 'INLINE';
      if (sectorEtfPs) {
        const etfIdx = asOfIndex(sectorEtfPs, today);
        if (etfIdx >= 21) {
          const stockRet20 = pctAtIdx(bars, idx, 20);
          const etfRet20 = pctAtIdx(sectorEtfPs.bars, etfIdx, 20);
          const rsVsSector = stockRet20 - etfRet20;
          sectorAboveSma50 = sectorEtfPs.bars[etfIdx].close > (sectorEtfPs.sma50[etfIdx] || 0);
          if (rsVsSector >= 3) sectorRsStatus = 'LEADING';
          else if (rsVsSector <= -3) sectorRsStatus = 'LAGGING';
          if (sectorRsStatus === 'LEADING' && sectorAboveSma50) rsScore = Math.min(100, rsScore + 8);
          else if (sectorRsStatus === 'LAGGING' && !sectorAboveSma50) rsScore = Math.max(0, rsScore - 8);
        }
      }
      rsScore = Math.round(Math.max(0, Math.min(100, rsScore)));

      // Momentum (0-100)
      const mom5 = pctAtIdx(bars, idx, 5), mom10 = pctAtIdx(bars, idx, 10), mom22 = pctAtIdx(bars, idx, 22);
      let mScore = 50;
      if (mom5 > -2) mScore += 10; else mScore -= 10;
      if (mom10 > 0) mScore += 15; else mScore -= 10;
      if (mom22 > 0) mScore += 15; else mScore -= 10;
      if (mom5 < 8) mScore += 10; else mScore -= 15;
      let high52w = 0;
      for (let i = Math.max(0, idx - 251); i <= idx; i++) high52w = Math.max(high52w, bars[i].high);
      const distFrom52wHighPct = high52w > 0 ? ((high52w - price) / high52w) * 100 : 100;
      if (distFrom52wHighPct <= 15) mScore += 10;
      mScore = Math.round(Math.max(0, Math.min(100, mScore)));

      // Volume (0-100)
      let vScore = 50;
      if (volDeclining) vScore += 20;
      if (lastDaySpike) vScore += 15;
      if (volRatio > 0.8 && volRatio < 1.5) vScore += 10;
      if (avgVol20 > 5_000_000) vScore += 5;
      if (rvol >= 1.5) vScore += 10;
      vScore = Math.round(Math.max(0, Math.min(100, vScore)));

      // ── ENTRY / STOP / TARGET — si scanner-i ──
      const isBreakout = setup === 'BREAKOUT';
      const entry = isBreakout ? Math.round(high20 * 1.002 * 100) / 100 : Math.round(price * 100) / 100;
      const stopVol = useIbkrFilters ? stopVolMultiplier : 1.0;
      const stopAtr = entry - atr * 1.5 * stopVol;
      const stopSwing = swLow - atr * 0.2 * stopVol;
      const stop = Math.round(Math.max(stopAtr, stopSwing) * 100) / 100;
      const riskPerShare = entry - stop;
      if (riskPerShare <= 0) continue;
      const riskPct = (riskPerShare / entry) * 100;

      // Risk (0-100)
      let rScore = 50;
      if (riskPct <= 3) rScore += 20;
      else if (riskPct <= 5) rScore += 10;
      else if (riskPct > 7) rScore -= 20;
      rScore += 15; // rr = 3R si në scanner
      if (atrPct < 2) rScore += 10;
      else if (atrPct > 4) rScore -= 10;
      rScore = Math.round(Math.max(0, Math.min(100, rScore)));

      // ATR% tradability gate (1.5-6%) — bërthama e tradability
      if (atrPct > 6 || atrPct < 1.5) continue;

      const totalScoreRaw = Math.round(
        tScore * 0.25 + rsScore * 0.20 + mScore * 0.15 + vScore * 0.15 +
        setupScore * 0.10 + 50 * 0.10 + rScore * 0.05,
      );
      // EVENT SCORE: pikët e specifikimit (-3/-1/+1/+2/-2) mbi score-in bazë
      const totalScore = Math.max(0, Math.min(100, totalScoreRaw + evPts));

      // ── VENDIMI — gates sipas variantit ──
      const rsiOk = rsiV >= 30 && rsiV <= 75;   // bërthama e setup-it (të gjithë variantet)
      const riskOk = riskPct <= 8;               // menaxhimi bazë i rrezikut
      const scoreOk = totalScore >= 45;          // me pikët e event-it
      const sectorRsOk = !(sectorRsStatus === 'LAGGING' && !sectorAboveSma50);

      if (!(rsiOk && riskOk && scoreOk)) continue;
      if (useIbkrFilters) {
        if (regimeLevel === 'RISK') continue;
        if (!sectorRsOk) continue;
        if (rsiV > 70 && totalScoreRaw >= 55) continue; // EVENT_RISK: RSI i lartë
      }

      // Sector Breadth Gate (Task 15) as-of — vetëm me filtra IBKR
      let targetR: number;
      let sizeMult = 1.0;
      if (useIbkrFilters) {
        if (sbLabel === 'WEAK') {
          if (totalScoreRaw < 80) continue; // READY vetëm me score ≥ 80 (si scanner-i live)
          targetR = 1;
          sizeMult = 0.5;
        } else {
          targetR = sbLabel === 'STRONG' ? 2 : 1.5;
        }
        if (capTargetsMarketWide && targetR > 1) targetR = 1;
      } else {
        targetR = 1.5; // target standard pa gate-in e breadth
      }

      const regimeMult = useIbkrFilters ? regimeMultiplier : 1.0;
      const riskPctFinal = Math.min(exec.riskPctPerTrade, 1.0) * regimeMult * sizeMult;

      // Spread estimim si scanner-i
      const advM = avgDolVol / 1_000_000;
      const spreadPct = advM > 0 ? Math.min(0.5, 1.5 / Math.sqrt(advM)) : 0.5;

      // Confidence score breakdown (0-10) — event me kalendar real
      const lastReactPct = evState.lastReactionKnown?.reaction2dPct ?? null;
      const eventRisky = evState.earningsWithin2d || (lastReactPct !== null && lastReactPct <= -2);
      const breakdown = {
        trend: (stackedMA ? 1 : 0) + (adxV > 25 ? 1 : 0), // /2
        pullback: setup === 'PULLBACK' ? 2 : setup === 'BREAKOUT' ? 1 : 1, // /2
        rs: rsSpy60 > 0 ? 1 : 0, // /1
        volume: vScore >= 60 ? 1 : 0, // /1
        market: regimeLevel === 'OK' ? 1 : 0, // /1
        event: evState.hasData && !eventRisky ? 1 : 0, // /1 (real me kalendar EDGAR)
        risk: riskPct <= 5 ? 1 : 0, // /1
        final: 0, max: 10,
      };
      breakdown.final =
        breakdown.trend + breakdown.pullback + breakdown.rs +
        breakdown.volume + breakdown.market + breakdown.event + breakdown.risk;

      signalsGenerated++;
      pending.push({
        symbol: s.symbol, sector: sec,
        orderPrice: entry,
        orderType: isBreakout ? 'STOP' : 'LIMIT',
        stop, targetR, riskPct: riskPctFinal,
        score: totalScore, scoreBreakdown: breakdown,
        setupType: setup,
        atrPct: Math.round(atrPct * 100) / 100,
        avgDolVol, spreadPct,
        signalDate: today,
      });
    }

    // ── FUND PERIUDHE: mbyll pozicionet e mbetura në close të ditës së fundit ──
    if (day === opts.endIndex) {
      for (const pos of open) {
        const ps = symMap.get(pos.symbol)!;
        const barIdx = asOfIndex(ps, today);
        if (barIdx < 0) continue;
        const exitBar = ps.bars[barIdx];
        const costs = computeTradeCosts({
          shares: pos.shares, entryPrice: pos.entry, exitPrice: exitBar.close,
          spreadPct: pos.spreadPct, atrPct: pos.atrPct, avgDolVol: pos.avgDolVol,
        });
        const pnlGross = pos.shares * (exitBar.close - pos.entry);
        const pnlNet = pnlGross - costs.totalCost;
        equity += pnlNet;
        trades.push({
          symbol: pos.symbol, sector: pos.sector,
          entryDate: pos.entryDate, exitDate: exitBar.date,
          entryPrice: pos.entry, exitPrice: exitBar.close,
          stop: pos.stop, target: pos.target, shares: pos.shares,
          exitReason: 'TIME_STOP',
          r: pos.riskPerShare > 0 ? (exitBar.close - pos.entry) / pos.riskPerShare : 0,
          pnlNet: Math.round(pnlNet * 100) / 100,
          pnlGross: Math.round(pnlGross * 100) / 100,
          costs: Math.round(costs.totalCost * 100) / 100,
          costsBreakdown: {
            commission: Math.round((costs.commissionEntry + costs.commissionExit) * 100) / 100,
            spread: Math.round(costs.spreadCost * 100) / 100,
            slippage: Math.round(costs.slippageCost * 100) / 100,
            impact: Math.round(costs.marketImpact * 100) / 100,
          },
          score: pos.score, scoreBreakdown: pos.scoreBreakdown,
          setupType: pos.setupType,
          equityAfter: Math.round(equity * 100) / 100,
        });
      }
      open.length = 0;
    }
  }

  return { trades, signalsGenerated, entryOrdersRejected, rejectReasons, regimeDays };
}

/** % ndryshimi mbi 'days' ditët e fundit — version me indekse (pa slice) */
function pctAtIdx(bars: HistoricalDataPoint[], idx: number, days: number): number {
  const startIdx = idx - days;
  if (startIdx < 0) return 0;
  const now = bars[idx]?.close;
  const then = bars[startIdx]?.close;
  if (!then || then === 0 || now === undefined) return 0;
  return ((now - then) / then) * 100;
}

/** ATR në indeksin idx — IDENTIK me calcATR(bars.slice(0, idx+1), 14): mesatarja e TR mbi 14 ditët e fundit */
function atrAtIndex(bars: HistoricalDataPoint[], idx: number, period = 14): number {
  if (idx < period) return 0;
  let atr = 0;
  for (let i = idx - period + 1; i <= idx; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close),
    );
    atr += tr;
  }
  return atr / period;
}
