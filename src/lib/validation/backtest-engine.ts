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
import { eventRiskAsOf } from './point-in-time';

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
  /** true = zbus sinjalet event-risk (në backtest janë neutral) */
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

    // RS benchmark-e as-of
    const spyClosesAsOf = ctx.spy.bars.slice(0, spyIdx + 1).map(b => b.close);
    const spyRS60 = pctWindow(spyClosesAsOf, 60);
    const spyRS22 = pctWindow(spyClosesAsOf, 22);

    // ── Për çdo simbol: filtra → setup → score → vendim ──
    for (const s of ctx.symbols) {
      const idx = asOfIndex(s, today);
      if (idx < 200) continue;
      const bars = s.bars;
      const bar = bars[idx];
      const price = bar.close;
      const closes = bars.slice(Math.max(0, idx - 260), idx + 1).map(b => b.close);
      const highs = bars.slice(Math.max(0, idx - 260), idx + 1).map(b => b.high);
      const lows = bars.slice(Math.max(0, idx - 260), idx + 1).map(b => b.low);
      const vols = bars.slice(Math.max(0, idx - 260), idx + 1).map(b => b.volume);

      const sec = s.sector;

      // FILTRA MEKANIKË — si scanner-i
      const avgVol20 = vols.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, vols.length);
      const n20 = Math.min(20, closes.length, vols.length);
      let dolVolSum = 0;
      for (let i = closes.length - n20; i < closes.length; i++) dolVolSum += closes[i] * vols[i];
      const avgDolVol = dolVolSum / n20;
      const passedLiq = price >= 10 && avgVol20 >= 1_000_000 && avgDolVol >= 20_000_000;
      if (!passedLiq) continue;

      const sma50V = s.sma50[idx] || 0;
      const sma200V = s.sma200[idx] || 0;
      const above50 = price > sma50V;
      const golden = sma50V > sma200V;
      const rs60 = pctWindow(closes, 60);
      if (!(above50 && golden && rs60 > spyRS60)) continue;

      const ema20V = s.ema20[idx] || 0;
      const ema10V = s.ema10[idx] || 0;
      const stackedMA = price > ema20V && ema20V > sma50V && sma50V > sma200V;
      const adxV = s.adx[idx] || 0;
      if (!stackedMA || adxV <= 25) continue;

      // SEKTOR BREADTH GATE as-of
      const sbLabel = sectorLabels[sec];
      if (sbLabel === 'DEAD') continue;

      // ── SETUP (identik me scanner-in) ──
      const rsiV = s.rsi[idx] || 50;
      const atr = calcATR(bars.slice(0, idx + 1), 14);
      const atrPct = price > 0 ? (atr / price) * 100 : 0;

      const lastLocal = closes.length - 1;
      let highIdx = lastLocal;
      for (let i = lastLocal; i >= Math.max(0, lastLocal - 10); i--) if (closes[i] >= closes[highIdx]) highIdx = i;
      const peakPrice = closes[highIdx];
      const pbPct = peakPrice > 0 ? ((price - peakPrice) / peakPrice) * 100 : 0;
      const swLow = Math.min(...lows.slice(highIdx, lastLocal + 1));
      let pbDays = 0;
      for (let i = highIdx + 1; i <= lastLocal; i++) if (closes[i] < closes[i - 1]) pbDays++;

      const dist10 = ema10V > 0 ? ((price - ema10V) / ema10V) * 100 : 99;
      const dist20 = ema20V > 0 ? ((price - ema20V) / ema20V) * 100 : 99;

      const vol20 = vols.slice(-20);
      const avgVol20L = vol20.length > 0 ? vol20.reduce((a, b) => a + b, 0) / vol20.length : 0;
      const recent3 = vols.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, vols.length);
      const pbVol = vols.slice(-5, -1);
      const priorVol = vols.slice(-10, -5);
      const avgPb = pbVol.length > 0 ? pbVol.reduce((a, b) => a + b, 0) / pbVol.length : 0;
      const avgPrior = priorVol.length > 0 ? priorVol.reduce((a, b) => a + b, 0) / priorVol.length : 0;
      const volDeclining = avgPb < avgPrior * 0.95;
      const lastDaySpike = vols[lastLocal] > avgVol20L * 1.1;
      const volRatio = avgVol20L > 0 ? recent3 / avgVol20L : 1;
      const rvol = avgVol20L > 0 ? vols[lastLocal] / avgVol20L : 1;

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
      const high20 = Math.max(...highs.slice(-20));
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
      const h20a = Math.max(...highs.slice(-40, -20));
      const h20b = Math.max(...highs.slice(-20));
      if (h20b > h20a) tScore += 15;
      if (adxV > 25) tScore += 15;
      tScore = Math.min(100, tScore);

      // RS (0-100)
      const rsSpy22 = pctWindow(closes, 22) - spyRS22;
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
          const stockRet20 = pctWindow(closes, 20);
          const etfCloses = sectorEtfPs.bars.slice(0, etfIdx + 1).map(b => b.close);
          const etfRet20 = pctWindow(etfCloses, 20);
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
      const mom5 = pctWindow(closes, 5), mom10 = pctWindow(closes, 10), mom22 = pctWindow(closes, 22);
      let mScore = 50;
      if (mom5 > -2) mScore += 10; else mScore -= 10;
      if (mom10 > 0) mScore += 15; else mScore -= 10;
      if (mom22 > 0) mScore += 15; else mScore -= 10;
      if (mom5 < 8) mScore += 10; else mScore -= 15;
      const highs252 = highs.slice(-252);
      const high52w = highs252.length > 0 ? Math.max(...highs252) : price;
      const distFrom52wHighPct = high52w > 0 ? ((high52w - price) / high52w) * 100 : 100;
      if (distFrom52wHighPct <= 15) mScore += 10;
      mScore = Math.round(Math.max(0, Math.min(100, mScore)));

      // Volume (0-100)
      let vScore = 50;
      if (volDeclining) vScore += 20;
      if (lastDaySpike) vScore += 15;
      if (volRatio > 0.8 && volRatio < 1.5) vScore += 10;
      if (avgVol20L > 5_000_000) vScore += 5;
      if (rvol >= 1.5) vScore += 10;
      vScore = Math.round(Math.max(0, Math.min(100, vScore)));

      // ── ENTRY / STOP / TARGET — si scanner-i ──
      const isBreakout = setup === 'BREAKOUT';
      const entry = isBreakout ? Math.round(high20 * 1.002 * 100) / 100 : Math.round(price * 100) / 100;
      const stopAtr = entry - atr * 1.5 * stopVolMultiplier;
      const stopSwing = swLow - atr * 0.2 * stopVolMultiplier;
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

      // ATR% tradability gate (1.5-6%)
      if (atrPct > 6 || atrPct < 1.5) continue;

      const totalScore = Math.round(
        tScore * 0.25 + rsScore * 0.20 + mScore * 0.15 + vScore * 0.15 +
        setupScore * 0.10 + 50 * 0.10 + rScore * 0.05,
      );

      // ── VENDIMI — gates identike me scanner-in ──
      const rsiOk = rsiV >= 30 && rsiV <= 75;
      const riskOk = riskPct <= 8;
      const scoreOk = totalScore >= 45;
      const sectorRsOk = !(sectorRsStatus === 'LAGGING' && !sectorAboveSma50);
      const eventState = eventRiskAsOf(today); // neutral në backtest

      if (!(rsiOk && riskOk && scoreOk)) continue;
      if (regimeLevel === 'RISK') continue;
      if (!sectorRsOk) continue;
      if (rsiV > 70 && totalScore >= 55) continue; // EVENT_RISK: RSI i lartë

      // Sector Breadth Gate (Task 15) as-of
      let targetR: number;
      let sizeMult = 1.0;
      if (sbLabel === 'WEAK') {
        if (totalScore < 80) continue; // READY vetëm me score ≥ 80
        targetR = 1;
        sizeMult = 0.5;
      } else {
        targetR = sbLabel === 'STRONG' ? 2 : 1.5;
      }
      if (capTargetsMarketWide && targetR > 1) targetR = 1;

      const riskPctFinal = Math.min(exec.riskPctPerTrade, 1.0) * regimeMultiplier * sizeMult;

      // Spread estimim si scanner-i
      const advM = avgDolVol / 1_000_000;
      const spreadPct = advM > 0 ? Math.min(0.5, 1.5 / Math.sqrt(advM)) : 0.5;

      // Confidence score breakdown (0-10)
      const breakdown = {
        trend: (stackedMA ? 1 : 0) + (adxV > 25 ? 1 : 0), // /2
        pullback: setup === 'PULLBACK' ? 2 : setup === 'BREAKOUT' ? 1 : 1, // /2
        rs: rsSpy60 > 0 ? 1 : 0, // /1
        volume: vScore >= 60 ? 1 : 0, // /1
        market: regimeLevel === 'OK' ? 1 : 0, // /1
        event: eventState.eventScore > 0 ? 1 : 0, // /1 (neutral → 0)
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

/** % ndryshimi mbi 'days' ditët e fundit të serisë */
function pctWindow(data: number[], days: number): number {
  if (data.length < days + 1) return 0;
  const now = data[data.length - 1];
  const then = data[data.length - 1 - days];
  if (!then || then === 0) return 0;
  return ((now - then) / then) * 100;
}
