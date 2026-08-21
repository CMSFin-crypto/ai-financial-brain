import { NextResponse } from 'next/server';
import { fetchHistoricalData, HistoricalDataPoint } from '@/lib/alpha-vantage';
import { calculateSMA, calculateRSI } from '@/lib/indicators';

// ═══════════════════════════════════════════════════════════════
// IBKR FUNNEL SCANNER — 200 → Liquidity → Trend → Technical → Risk → 5-10
// ═══════════════════════════════════════════════════════════════

const UNIVERSE = [
  // Tech / AI / Semiconductors (50)
  'NVDA','AMD','MSFT','AAPL','AMZN','META','GOOGL','AVGO','TSLA','NFLX',
  'CRM','ORCL','ADBE','NOW','INTU','SNOW','PLTR','DDOG','CRWD','PANW',
  'NET','ZS','FTNT','MRVL','QCOM','TXN','MU','LRCX','AMAT','ADI',
  'KLAC','ON','DELL','HPQ','IBM','CTSH','WDAY','VEEV','HUBS','ANSS',
  'PAYX','CDNS','MANH','STX','AKAM','EQIX','FSLR','ENPH',
  // Communication / Media (15)
  'DIS','CMCSA','WBD','EA','TTWO','UBER','ABNB','BKNG','EXPE','ROKU',
  'PARA','LYV','DASH','RBLX','ANGI',
  // Consumer / Retail / Staples (35)
  'COST','WMT','TGT','HD','LOW','NKE','KO','PEP','MCD','SBUX',
  'YUM','CMG','EL','PM','MO','DEO','STZ','MON','CL','KMB',
  'PG','BUD','KO','PEP','UL','GIS','SJM','HSY',
  // Healthcare / Biotech (25)
  'UNH','LLY','JNJ','MRK','ABBV','PFE','TMO','ABT','DHR','BMY',
  'GILD','VRTX','REGN','BIIB','ISRG','SYK','EW','BSX','MDT','HUM',
  'CI','ELV','CVS','MOH','CNC',
  // Finance (25)
  'JPM','V','MA','BAC','GS','MS','AXP','BLK','SCHW','C',
  'USB','PGR','CB','AON','MET','PRU','COF','SYF','DFS','NTRS',
  'ICE','MKTX','CBOE','PYPL','SOFI',
  // Energy (15)
  'XOM','CVX','COP','SLB','EOG','OXY','MPC','PSX','VLO','WBA',
  'DVN','FANG','PXD','CTRA','HES',
  // Industrial / Manufacturing (25)
  'CAT','GE','HON','UPS','RTX','BA','LMT','NOC','GD','DE',
  'MMM','EMR','ITW','ETN','CMI','ROK','PH','JCI','PCAR','FDX',
  'R','OTIS','CARR','WM','KEYS',
  // Auto / EV (10)
  'GM','RIVN','NIO','STLA','F','TM','HMC','LI','RACE','LCID',
  // Materials / Chemicals / Mining (10)
  'LIN','APD','SHW','ECL','DD','FCX','NEM','GOLD','ALB','CE',
  // Utilities / Infra (10)
  'NEE','DUK','SO','AEP','EXC','SRE','CCI','WR','AGR','XEL',
];

const ETF_SET = new Set(['SPY','QQQ','SMH','XLF','XLE','XLK','XLV','XLY','XLP','XLI','XLB','XLU','XLRE','XLC','GLD','TLT','IWM','VTI','ARKK','SCHD']);
const BENCHMARKS = ['SPY', 'QQQ'];

// ── Helpers ──
function calcEMA(data: number[], period: number): number[] {
  const r: number[] = new Array(data.length).fill(NaN);
  if (data.length < period) return r;
  let s = 0; for (let i = 0; i < period; i++) s += data[i];
  r[period - 1] = s / period;
  const k = 2 / (period + 1);
  for (let i = period; i < data.length; i++) r[i] = data[i] * k + r[i - 1] * (1 - k);
  return r;
}

function calcATR(data: HistoricalDataPoint[], period = 14): number {
  if (data.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < data.length; i++) {
    trs.push(Math.max(data[i].high - data[i].low, Math.abs(data[i].high - data[i-1].close), Math.abs(data[i].low - data[i-1].close)));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function pct(data: number[], days: number): number {
  if (data.length < days + 1) return 0;
  const c = data[data.length - 1], p = data[data.length - 1 - days];
  return p > 0 ? ((c - p) / p) * 100 : 0;
}

// ── Types ──
type Decision = 'READY' | 'WATCHLIST' | 'NO_TRADE' | 'EVENT_RISK' | 'EXTENDED';

interface FunnelStock {
  symbol: string;
  price: number;
  // Phase 1: mechanical
  avgVol20d: number;
  avgDolVol20d: number;
  passedLiquidity: boolean;
  passedTrend: boolean;
  // Phase 2: technical
  trendScore: number;       // 0-100
  rsScore: number;          // 0-100
  momentumScore: number;    // 0-100
  volConfScore: number;     // 0-100
  setupScore: number;       // 0-100
  // Phase 3: risk
  riskScore: number;        // 0-100
  totalScore: number;       // 0-100
  // Setup detail
  setup: 'PULLBACK' | 'BREAKOUT' | 'TREND_CONT' | 'NONE';
  horizon: string;
  // Indicators
  rsi: number;
  atr: number;
  atrPct: number;
  volRatio: number;
  volDeclining: boolean;
  lastDaySpike: boolean;
  pullbackDays: number;
  pullbackPct: number;
  distFromEMA10: number;
  distFromEMA20: number;
  // Trend
  aboveSMA50: boolean;
  aboveSMA200: boolean;
  sma50Above200: boolean;
  // RS
  rsVsSPY: number;
  rsVsQQQ: number;
  rsVsSPY60d: number;
  // Entry levels
  entry: number;
  stop: number;
  target1R: number;
  target2R: number;
  riskPct: number;
  rewardRiskRatio: number;
  swingLow: number;
  // Verdict
  decision: Decision;
  reasons: string[];
  warnings: string[];
}

interface FunnelResponse {
  scannedAt: string;
  regimeOk: boolean;
  regimeDetail: { spy: { above50: boolean; above200: boolean }; qqq: { above50: boolean; above200: boolean } };
  funnel: { universe: number; passedLiquidity: number; passedTrend: number; passedSetup: number; passedRisk: number; displayed: number; };
  results: FunnelStock[];
}

// ═══════════════════════════════════════════════════════════════
// MAIN GET HANDLER
// ═══════════════════════════════════════════════════════════════
export async function GET() {
  const t0 = Date.now();

  try {
    // ── 0. Fetch benchmarks ──
    const [spyData, qqqData] = await Promise.all([
      fetchHistoricalData('SPY', '6mo'),
      fetchHistoricalData('QQQ', '6mo'),
    ]);
    if (!spyData || !qqqData) return NextResponse.json({ error: 'Te dhena SPY/QQQ mungojne' }, { status: 500 });

    const spyC = spyData.map(d => d.close), qqqC = qqqData.map(d => d.close);
    const spyS50 = calculateSMA(spyC, 50), spyS200 = calculateSMA(spyC, 200);
    const qqqS50 = calculateSMA(qqqC, 50), qqqS200 = calculateSMA(qqqC, 200);
    const sL = spyC.length - 1, qL = qqqC.length - 1;
    const spyA50 = spyC[sL] > (spyS50[sL]||0), spyA200 = spyC[sL] > (spyS200[sL]||0);
    const qqqA50 = qqqC[qL] > (qqqS50[qL]||0), qqqA200 = qqqC[qL] > (qqqS200[qL]||0);
    const regimeOk = spyA50 && spyA200 && qqqA50 && qqqA200;
    const spyRS60 = pct(spyC, 60);

    // ── 1. Fetch all universe OHLCV ──
    const syms = UNIVERSE.filter(s => !ETF_SET.has(s));
    const hist: Record<string, HistoricalDataPoint[] | null> = {};

    const BATCH = 10;
    for (let i = 0; i < syms.length; i += BATCH) {
      const batch = syms.slice(i, i + BATCH);
      const res = await Promise.allSettled(batch.map(async s => ({ s, d: await fetchHistoricalData(s, '6mo') })));
      for (const r of res) if (r.status === 'fulfilled' && r.value.d) hist[r.value.s] = r.value.d;
      if (i + BATCH < syms.length) await new Promise(r => setTimeout(r, 120));
    }

    console.log(`[IBKR FUNNEL] Fetched ${Object.keys(hist).length}/${syms.length} stocks in ${((Date.now()-t0)/1000).toFixed(1)}s`);

    // ── 2. PHASE 1 — Mechanical filter (liquidity + trend) ──
    const phase1: FunnelStock[] = [];

    for (const sym of syms) {
      const data = hist[sym];
      if (!data || data.length < 200) continue;

      const closes = data.map(d => d.close);
      const highs = data.map(d => d.high);
      const lows = data.map(d => d.low);
      const vols = data.map(d => d.volume);
      const last = closes.length - 1;
      const price = closes[last];

      // Liquidity checks
      const avgVol20 = vols.slice(-20).reduce((a,b) => a+b, 0) / 20;
      const avgDolVol = price * avgVol20;
      const passedLiq = price >= 10 && avgVol20 >= 1_000_000 && avgDolVol >= 20_000_000;

      // Trend checks
      const sma50 = calculateSMA(closes, 50);
      const sma200 = calculateSMA(closes, 200);
      const above50 = price > (sma50[last] || 0);
      const above200 = price > (sma200[last] || 0);
      const golden = (sma50[last] || 0) > (sma200[last] || 0);
      const rs60 = pct(closes, 60);
      const passedTrend = above50 && golden && rs60 > spyRS60;

      // Store basic info for all stocks (we need it for funnel counts)
      phase1.push({
        symbol: sym, price, avgVol20d: avgVol20, avgDolVol20d: avgDolVol,
        passedLiquidity: passedLiq, passedTrend,
        trendScore: 0, rsScore: 0, momentumScore: 0, volConfScore: 0, setupScore: 0,
        riskScore: 0, totalScore: 0,
        setup: 'NONE', horizon: '',
        rsi: 0, atr: 0, atrPct: 0, volRatio: 0, volDeclining: false, lastDaySpike: false,
        pullbackDays: 0, pullbackPct: 0, distFromEMA10: 0, distFromEMA20: 0,
        aboveSMA50: above50, aboveSMA200: above200, sma50Above200: golden,
        rsVsSPY: 0, rsVsQQQ: 0, rsVsSPY60d: rs60 - spyRS60,
        entry: 0, stop: 0, target1R: 0, target2R: 0, riskPct: 0, rewardRiskRatio: 0, swingLow: 0,
        decision: 'NO_TRADE', reasons: [], warnings: [],
      });
    }

    const passedLiquidity = phase1.filter(s => s.passedLiquidity).length;
    const passedTrend = phase1.filter(s => s.passedTrend).length;

    // ── 3. PHASE 2 — Technical analysis on trend-passed stocks ──
    const phase2: FunnelStock[] = [];

    for (const stock of phase1) {
      if (!stock.passedTrend) continue;

      const data = hist[stock.symbol];
      if (!data) continue;
      const closes = data.map(d => d.close), highs = data.map(d => d.high), lows = data.map(d => d.low);
      const vols = data.map(d => d.volume);
      const last = closes.length - 1;
      const price = closes[last];

      const ema10 = calcEMA(closes, 10);
      const ema20 = calcEMA(closes, 20);
      const rsiArr = calculateRSI(closes, 14);
      const rsi = rsiArr[last] || 50;
      const atr = calcATR(data, 14);
      const atrPct = price > 0 ? (atr / price) * 100 : 0;

      // ── A) Trend Quality (0-100) — 25% weight ──
      const sma50 = calculateSMA(closes, 50);
      const sma200 = calculateSMA(closes, 200);
      let tScore = 0;
      if (price > (sma50[last]||0)) tScore += 25;
      if (price > (sma200[last]||0)) tScore += 25;
      if ((sma50[last]||0) > (sma200[last]||0)) tScore += 25;
      // Higher-high structure: last 20d high > prior 20d high
      const h20a = Math.max(...highs.slice(-40, -20));
      const h20b = Math.max(...highs.slice(-20));
      if (h20b > h20a) tScore += 25;
      stock.trendScore = tScore;

      // ── B) Relative Strength (0-100) — 20% weight ──
      const rsSpy22 = pct(closes, 22) - pct(spyC, 22);
      const rsQqq22 = pct(closes, 22) - pct(qqqC, 22);
      const rsSpy60 = pct(closes, 60) - pct(spyC, 60);
      let rsScore = 50;
      if (rsSpy22 > 0) rsScore += Math.min(25, rsSpy22 * 3);
      else rsScore -= Math.min(25, Math.abs(rsSpy22) * 3);
      if (rsSpy60 > 0) rsScore += Math.min(25, rsSpy60 * 2);
      else rsScore -= Math.min(25, Math.abs(rsSpy60) * 2);
      stock.rsScore = Math.round(Math.max(0, Math.min(100, rsScore)));
      stock.rsVsSPY = Math.round(rsSpy22 * 100) / 100;
      stock.rsVsQQQ = Math.round(rsQqq22 * 100) / 100;
      stock.rsVsSPY60d = Math.round(rsSpy60 * 100) / 100;

      // ── C) Momentum (0-100) — 15% weight ──
      const mom5 = pct(closes, 5), mom10 = pct(closes, 10), mom22 = pct(closes, 22);
      let mScore = 50;
      if (mom5 > -2) mScore += 10; else mScore -= 10;
      if (mom10 > 0) mScore += 15; else mScore -= 10;
      if (mom22 > 0) mScore += 15; else mScore -= 10;
      // Not overextended
      if (mom5 < 8) mScore += 10; else mScore -= 15;
      stock.momentumScore = Math.round(Math.max(0, Math.min(100, mScore)));

      // ── D) Volume Confirmation (0-100) — 15% weight ──
      const avgVol20 = vols.slice(-20).reduce((a,b) => a+b, 0) / 20;
      const recent3 = vols.slice(-3).reduce((a,b) => a+b, 0) / 3;
      const pbVol = vols.slice(-5, -1);
      const priorVol = vols.slice(-10, -5);
      const avgPb = pbVol.length > 0 ? pbVol.reduce((a,b) => a+b, 0)/pbVol.length : 0;
      const avgPrior = priorVol.length > 0 ? priorVol.reduce((a,b) => a+b, 0)/priorVol.length : 0;
      const volDeclining = avgPb < avgPrior * 0.95;
      const lastDaySpike = vols[last] > avgVol20 * 1.1;
      const volRatio = avgVol20 > 0 ? recent3 / avgVol20 : 1;
      let vScore = 50;
      if (volDeclining) vScore += 20;
      if (lastDaySpike) vScore += 15;
      if (volRatio > 0.8 && volRatio < 1.5) vScore += 10;
      if (avgVol20 > 5_000_000) vScore += 5;
      stock.volConfScore = Math.round(Math.max(0, Math.min(100, vScore)));
      stock.volRatio = Math.round(volRatio * 100) / 100;
      stock.volDeclining = volDeclining;
      stock.lastDaySpike = lastDaySpike;

      // ── E) Setup Quality (0-100) — 10% weight ──
      const ema10Val = ema10[last], ema20Val = ema20[last];
      const dist10 = !isNaN(ema10Val) ? ((price - ema10Val) / ema10Val) * 100 : 99;
      const dist20 = !isNaN(ema20Val) ? ((price - ema20Val) / ema20Val) * 100 : 99;
      stock.distFromEMA10 = Math.round(dist10 * 100) / 100;
      stock.distFromEMA20 = Math.round(dist20 * 100) / 100;

      // Find pullback: high in last 10d, decline since
      let highIdx = last;
      for (let i = last; i >= Math.max(0, last - 10); i--) if (closes[i] >= closes[highIdx]) highIdx = i;
      const peakPrice = closes[highIdx];
      const pbPct = peakPrice > 0 ? ((price - peakPrice) / peakPrice) * 100 : 0;
      const swLow = Math.min(...lows.slice(highIdx, last + 1));
      let pbDays = 0;
      for (let i = highIdx + 1; i <= last; i++) if (closes[i] < closes[i-1]) pbDays++;

      stock.pullbackDays = pbDays;
      stock.pullbackPct = Math.round(pbPct * 100) / 100;
      stock.swingLow = Math.round(swLow * 100) / 100;

      let setup: 'PULLBACK' | 'BREAKOUT' | 'TREND_CONT' | 'NONE' = 'NONE';
      let sScore = 0;
      const reasons: string[] = [];

      // Pullback
      if (pbDays >= 2 && pbDays <= 8 && pbPct >= -8 && pbPct <= -0.5) {
        setup = 'PULLBACK';
        sScore += 30;
        if (pbDays >= 3 && pbDays <= 6) { sScore += 20; reasons.push(`Pullback ${pbDays}d (ideal)`); }
        else { sScore += 10; reasons.push(`Pullback ${pbDays}d`); }
        if (Math.abs(dist10) < 3 || Math.abs(dist20) < 3) { sScore += 20; reasons.push('Afer EMA 10/20'); }
        if (volDeclining) { sScore += 15; reasons.push('Volumi ne renie (i mire)'); }
        if (lastDaySpike) { sScore += 15; reasons.push('Volum konfirmim'); }
        if (rsi >= 40 && rsi <= 65) { sScore += 10; reasons.push(`RSI ${rsi.toFixed(0)}`); }
      }

      // Breakout
      if (setup === 'NONE') {
        const high20 = Math.max(...highs.slice(-20));
        if (price >= high20 * 0.98 && lastDaySpike && rsi >= 45 && rsi <= 70) {
          setup = 'BREAKOUT'; sScore = 55;
          reasons.push('Breakout 20d + volum');
          if (rsi >= 45 && rsi <= 65) { sScore += 15; reasons.push(`RSI ${rsi.toFixed(0)}`); }
        }
      }

      // Trend continuation (consolidation near highs)
      if (setup === 'NONE' && pbPct > -0.5 && pbPct < 2 && price > (sma50[last]||0)) {
        setup = 'TREND_CONT'; sScore = 40;
        reasons.push('Trend continuation');
        if (rsi >= 50 && rsi <= 65) { sScore += 15; reasons.push(`RSI ${rsi.toFixed(0)}`); }
        if (lastDaySpike) { sScore += 10; reasons.push('Volum konfirmim'); }
      }

      stock.setup = setup;
      stock.setupScore = Math.min(100, sScore);
      stock.rsi = Math.round(rsi * 10) / 10;
      stock.atr = Math.round(atr * 100) / 100;
      stock.atrPct = Math.round(atrPct * 100) / 100;
      stock.reasons = reasons;

      // Entry / Stop / Target
      const entry = Math.round((price * 1.005) * 100) / 100;
      const stop = Math.round((swLow - atr * 0.2) * 100) / 100;
      const riskPerShare = entry - stop;
      const riskPct = entry > 0 ? (riskPerShare / entry) * 100 : 0;
      const target1R = Math.round((entry + riskPerShare) * 100) / 100;
      const target2R = Math.round((entry + riskPerShare * 2) * 100) / 100;
      const rr = riskPerShare > 0 ? (riskPerShare * 2) / riskPerShare : 0;
      stock.entry = entry;
      stock.stop = stop;
      stock.target1R = target1R;
      stock.target2R = target2R;
      stock.riskPct = Math.round(riskPct * 100) / 100;
      stock.rewardRiskRatio = Math.round(rr * 10) / 10;

      // Horizon based on ATR
      if (atrPct < 1.5) stock.horizon = '10D';
      else if (atrPct < 3) stock.horizon = '5D';
      else stock.horizon = '5D';

      // ── F) Risk Quality (0-100) — 5% weight ──
      let rScore = 50;
      if (riskPct <= 3) rScore += 20;
      else if (riskPct <= 5) rScore += 10;
      else if (riskPct > 7) rScore -= 20;
      if (rr >= 2) rScore += 15;
      else if (rr >= 1.5) rScore += 5;
      else rScore -= 15;
      if (atrPct < 2) rScore += 10;
      else if (atrPct > 4) rScore -= 10;
      stock.riskScore = Math.round(Math.max(0, Math.min(100, rScore)));

      // ── Total Score ──
      stock.totalScore = Math.round(
        tScore * 0.25 +
        stock.rsScore * 0.20 +
        stock.momentumScore * 0.15 +
        stock.volConfScore * 0.15 +
        sScore * 0.10 +
        50 * 0.10 + // fundamentals placeholder (neutral)
        stock.riskScore * 0.05
      );

      // Only keep stocks with valid setups
      if (setup !== 'NONE') phase2.push(stock);
    }

    const passedSetup = phase2.length;

    // ── 4. PHASE 3 — Risk gate + Decision ──
    const phase3: FunnelStock[] = [];

    for (const stock of phase2) {
      const warnings: string[] = [...stock.warnings];
      let decision: Decision = 'NO_TRADE';

      // R:R gate
      if (stock.rewardRiskRatio < 1.5) {
        warnings.push(`R:R ${stock.rewardRiskRatio} — shume i ulet (duhet 1:2+)`);
      }

      // RSI gate
      if (stock.rsi > 75) {
        warnings.push(`RSI ${stock.rsi} — i mbivleresuar`);
      }

      // Risk % gate
      if (stock.riskPct > 8) {
        warnings.push(`Rreziku ${stock.riskPct}% — shume i larte`);
      }

      // Regime gate
      if (!regimeOk) {
        warnings.push('REGJIMI jo OK — vetem watcher');
      }

      // Extended (chasing)
      if (stock.pullbackPct > -0.5 && stock.setup === 'PULLBACK') {
        warnings.push('Jo te vertete nje pullback — extended');
      }

      // Determine decision
      const hasRR = stock.rewardRiskRatio >= 1.5;
      const rsiOk = stock.rsi >= 30 && stock.rsi <= 75;
      const riskOk = stock.riskPct <= 8;
      const scoreOk = stock.totalScore >= 45;

      if (hasRR && rsiOk && riskOk && scoreOk && regimeOk) {
        decision = 'READY';
      } else if (hasRR && rsiOk && riskOk && scoreOk && !regimeOk) {
        decision = 'WATCHLIST';
        warnings.push('WATCHLIST: Regjimi i tregut nuk lejon long tani');
      } else if (!hasRR || stock.riskPct > 6) {
        if (stock.setupScore >= 50) decision = 'WATCHLIST';
        else decision = 'NO_TRADE';
      } else if (stock.rsi > 72 || stock.pullbackPct > -0.3) {
        decision = 'EXTENDED';
      } else {
        decision = 'WATCHLIST';
      }

      // Event risk: if RSI > 70 or overextended, mark EVENT_RISK
      if (stock.rsi > 70 && stock.totalScore >= 55) {
        decision = 'EVENT_RISK';
        warnings.push('EVENT_RISK: RSI i larte, rrezik kthimi');
      }

      stock.decision = decision;
      stock.warnings = warnings;

      if (decision === 'READY' || decision === 'WATCHLIST' || decision === 'EVENT_RISK') {
        phase3.push(stock);
      }
    }

    const passedRisk = phase3.length;

    // ── 5. PHASE 4 — Top 5-10 final ──
    phase3.sort((a, b) => b.totalScore - a.totalScore);
    const topStocks = phase3.slice(0, 10);
    // READY first, then WATCHLIST, then others
    topStocks.sort((a, b) => {
      const order: Record<Decision, number> = { READY: 0, WATCHLIST: 1, EVENT_RISK: 2, EXTENDED: 3, NO_TRADE: 4 };
      const diff = (order[a.decision] || 5) - (order[b.decision] || 5);
      return diff !== 0 ? diff : b.totalScore - a.totalScore;
    });

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[IBKR FUNNEL] ${syms.length} → ${passedLiquidity} → ${passedTrend} → ${passedSetup} → ${passedRisk} → ${topStocks.length} displayed (${elapsed}s)`);

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      regimeOk,
      regimeDetail: {
        spy: { above50: spyA50, above200: spyA200 },
        qqq: { above50: qqqA50, above200: qqqA200 },
      },
      funnel: {
        universe: syms.length,
        passedLiquidity,
        passedTrend,
        passedSetup,
        passedRisk,
        displayed: topStocks.length,
      },
      results: topStocks,
    } satisfies FunnelResponse);
  } catch (err: any) {
    console.error('[IBKR FUNNEL] Error:', err);
    return NextResponse.json({ error: err?.message || 'Gabim skaneri' }, { status: 500 });
  }
}
