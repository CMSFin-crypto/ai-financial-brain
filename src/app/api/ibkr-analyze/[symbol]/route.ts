import { NextRequest, NextResponse } from 'next/server';
import { fetchHistoricalData, HistoricalDataPoint } from '@/lib/alpha-vantage';
import { calculateSMA, calculateRSI } from '@/lib/indicators';

// ── Helpers (same as ibkr-scan) ──
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
  for (let i = 1; i < data.length; i++) trs.push(Math.max(data[i].high - data[i].low, Math.abs(data[i].high - data[i-1].close), Math.abs(data[i].low - data[i-1].close)));
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}
function pct(data: number[], days: number): number {
  if (data.length < days + 1) return 0;
  const c = data[data.length - 1], p = data[data.length - 1 - days];
  return p > 0 ? ((c - p) / p) * 100 : 0;
}

type Decision = 'READY' | 'WATCHLIST' | 'NO_TRADE' | 'EVENT_RISK' | 'EXTENDED';

interface AnalyzeResponse {
  symbol: string;
  regimeOk: boolean;
  regimeDetail: { spy: { above50: boolean; above200: boolean }; qqq: { above50: boolean; above200: boolean } };
  stock: {
    symbol: string; price: number; avgVol20d: number; avgDolVol20d: number;
    passedLiquidity: boolean; passedTrend: boolean;
    trendScore: number; rsScore: number; momentumScore: number; volConfScore: number; setupScore: number; riskScore: number; totalScore: number;
    setup: 'PULLBACK' | 'BREAKOUT' | 'TREND_CONT' | 'NONE'; horizon: string;
    rsi: number; atr: number; atrPct: number; volRatio: number; volDeclining: boolean; lastDaySpike: boolean;
    pullbackDays: number; pullbackPct: number; distFromEMA10: number; distFromEMA20: number;
    aboveSMA50: boolean; aboveSMA200: boolean; sma50Above200: boolean;
    rsVsSPY: number; rsVsQQQ: number; rsVsSPY60d: number;
    entry: number; stop: number; target1R: number; target2R: number; riskPct: number; rewardRiskRatio: number; swingLow: number;
    decision: Decision; reasons: string[]; warnings: string[];
  } | null;
  error?: string;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const sym = symbol.toUpperCase().trim();

  try {
    // Fetch benchmarks + requested symbol
    const [spyData, qqqData, stockData] = await Promise.all([
      fetchHistoricalData('SPY', '1y'),
      fetchHistoricalData('QQQ', '1y'),
      fetchHistoricalData(sym, '1y'),
    ]);

    if (!spyData || !qqqData) return NextResponse.json({ symbol: sym, regimeOk: false, regimeDetail: { spy: { above50: false, above200: false }, qqq: { above50: false, above200: false } }, stock: null, error: 'Te dhena SPY/QQQ mungojne' } satisfies AnalyzeResponse, { status: 500 });

    if (!stockData) return NextResponse.json({ symbol: sym, regimeOk: false, regimeDetail: { spy: { above50: false, above200: false }, qqq: { above50: false, above200: false } }, stock: null, error: `Nuk u gjeten te dhena per ${sym}. Kontrollo nese tickeri eshte i sakte.` } satisfies AnalyzeResponse, { status: 404 });

    if (stockData.length < 200) return NextResponse.json({ symbol: sym, regimeOk: false, regimeDetail: { spy: { above50: false, above200: false }, qqq: { above50: false, above200: false } }, stock: null, error: `Te dhena te pamjaftueshme per ${sym} (${stockData.length} pika, nevoiten 200+).` } satisfies AnalyzeResponse);

    // Regime
    const spyC = spyData.map(d => d.close), qqqC = qqqData.map(d => d.close);
    const spyS50 = calculateSMA(spyC, 50), spyS200 = calculateSMA(spyC, 200);
    const qqqS50 = calculateSMA(qqqC, 50), qqqS200 = calculateSMA(qqqC, 200);
    const sL = spyC.length - 1, qL = qqqC.length - 1;
    const spyA50 = spyC[sL] > (spyS50[sL]||0), spyA200 = spyC[sL] > (spyS200[sL]||0);
    const qqqA50 = qqqC[qL] > (qqqS50[qL]||0), qqqA200 = qqqC[qL] > (qqqS200[qL]||0);
    const regimeOk = spyA50 && spyA200 && qqqA50 && qqqA200;
    const spyRS60 = pct(spyC, 60);
    const regimeDetail = {
      spy: { above50: spyA50, above200: spyA200 },
      qqq: { above50: qqqA50, above200: qqqA200 },
    };

    // Analyze the stock (same logic as ibkr-scan)
    const closes = stockData.map(d => d.close), highs = stockData.map(d => d.high), lows = stockData.map(d => d.low);
    const vols = stockData.map(d => d.volume);
    const last = closes.length - 1;
    const price = closes[last];

    // Liquidity
    const avgVol20 = vols.slice(-20).reduce((a,b) => a+b, 0) / 20;
    const avgDolVol = price * avgVol20;
    const passedLiq = price >= 10 && avgVol20 >= 1_000_000 && avgDolVol >= 20_000_000;

    // Trend
    const sma50 = calculateSMA(closes, 50), sma200 = calculateSMA(closes, 200);
    const above50 = price > (sma50[last] || 0), above200 = price > (sma200[last] || 0);
    const golden = (sma50[last] || 0) > (sma200[last] || 0);
    const rs60 = pct(closes, 60);
    const passedTrend = above50 && golden && rs60 > spyRS60;

    // Technical analysis
    const ema10 = calcEMA(closes, 10), ema20 = calcEMA(closes, 20);
    const rsiArr = calculateRSI(closes, 14);
    const rsi = rsiArr[last] || 50;
    const atr = calcATR(stockData, 14);
    const atrPct = price > 0 ? (atr / price) * 100 : 0;

    // Trend Score
    let tScore = 0;
    if (above50) tScore += 25; if (above200) tScore += 25; if (golden) tScore += 25;
    const h20a = Math.max(...highs.slice(-40, -20)), h20b = Math.max(...highs.slice(-20));
    if (h20b > h20a) tScore += 25;

    // RS Score
    const rsSpy22 = pct(closes, 22) - pct(spyC, 22);
    const rsQqq22 = pct(closes, 22) - pct(qqqC, 22);
    const rsSpy60 = pct(closes, 60) - pct(spyC, 60);
    let rsScore = 50;
    if (rsSpy22 > 0) rsScore += Math.min(25, rsSpy22 * 3); else rsScore -= Math.min(25, Math.abs(rsSpy22) * 3);
    if (rsSpy60 > 0) rsScore += Math.min(25, rsSpy60 * 2); else rsScore -= Math.min(25, Math.abs(rsSpy60) * 2);
    rsScore = Math.round(Math.max(0, Math.min(100, rsScore)));

    // Momentum Score
    const mom5 = pct(closes, 5), mom10 = pct(closes, 10), mom22 = pct(closes, 22);
    let mScore = 50;
    if (mom5 > -2) mScore += 10; else mScore -= 10;
    if (mom10 > 0) mScore += 15; else mScore -= 10;
    if (mom22 > 0) mScore += 15; else mScore -= 10;
    if (mom5 < 8) mScore += 10; else mScore -= 15;
    mScore = Math.round(Math.max(0, Math.min(100, mScore)));

    // Volume Score
    const recent3 = vols.slice(-3).reduce((a,b) => a+b, 0) / 3;
    const pbVol = vols.slice(-5, -1), priorVol = vols.slice(-10, -5);
    const avgPb = pbVol.length > 0 ? pbVol.reduce((a,b) => a+b, 0)/pbVol.length : 0;
    const avgPrior = priorVol.length > 0 ? priorVol.reduce((a,b) => a+b, 0)/priorVol.length : 0;
    const volDeclining = avgPb < avgPrior * 0.95;
    const lastDaySpike = vols[last] > avgVol20 * 1.1;
    const volRatio = avgVol20 > 0 ? recent3 / avgVol20 : 1;
    let vScore = 50;
    if (volDeclining) vScore += 20; if (lastDaySpike) vScore += 15;
    if (volRatio > 0.8 && volRatio < 1.5) vScore += 10;
    if (avgVol20 > 5_000_000) vScore += 5;
    vScore = Math.round(Math.max(0, Math.min(100, vScore)));

    // Setup
    const ema10Val = ema10[last], ema20Val = ema20[last];
    const dist10 = !isNaN(ema10Val) ? ((price - ema10Val) / ema10Val) * 100 : 99;
    const dist20 = !isNaN(ema20Val) ? ((price - ema20Val) / ema20Val) * 100 : 99;
    let highIdx = last;
    for (let i = last; i >= Math.max(0, last - 10); i--) if (closes[i] >= closes[highIdx]) highIdx = i;
    const peakPrice = closes[highIdx];
    const pbPct = peakPrice > 0 ? ((price - peakPrice) / peakPrice) * 100 : 0;
    const swLow = Math.min(...lows.slice(highIdx, last + 1));
    let pbDays = 0;
    for (let i = highIdx + 1; i <= last; i++) if (closes[i] < closes[i-1]) pbDays++;

    let setup: 'PULLBACK' | 'BREAKOUT' | 'TREND_CONT' | 'NONE' = 'NONE';
    let sScore = 0;
    const reasons: string[] = [];

    if (pbDays >= 2 && pbDays <= 8 && pbPct >= -8 && pbPct <= -0.5) {
      setup = 'PULLBACK'; sScore += 30;
      if (pbDays >= 3 && pbDays <= 6) { sScore += 20; reasons.push(`Pullback ${pbDays}d (ideal)`); }
      else { sScore += 10; reasons.push(`Pullback ${pbDays}d`); }
      if (Math.abs(dist10) < 3 || Math.abs(dist20) < 3) { sScore += 20; reasons.push('Afer EMA 10/20'); }
      if (volDeclining) { sScore += 15; reasons.push('Volumi ne renie (i mire)'); }
      if (lastDaySpike) { sScore += 15; reasons.push('Volum konfirmim'); }
      if (rsi >= 40 && rsi <= 65) { sScore += 10; reasons.push(`RSI ${rsi.toFixed(0)}`); }
    }
    if (setup === 'NONE') {
      const high20 = Math.max(...highs.slice(-20));
      if (price >= high20 * 0.98 && lastDaySpike && rsi >= 45 && rsi <= 70) {
        setup = 'BREAKOUT'; sScore = 55; reasons.push('Breakout 20d + volum');
        if (rsi >= 45 && rsi <= 65) { sScore += 15; reasons.push(`RSI ${rsi.toFixed(0)}`); }
      }
    }
    if (setup === 'NONE' && pbPct > -0.5 && pbPct < 2 && price > (sma50[last]||0)) {
      setup = 'TREND_CONT'; sScore = 40; reasons.push('Trend continuation');
      if (rsi >= 50 && rsi <= 65) { sScore += 15; reasons.push(`RSI ${rsi.toFixed(0)}`); }
      if (lastDaySpike) { sScore += 10; reasons.push('Volum konfirmim'); }
    }
    sScore = Math.min(100, sScore);

    // Entry / Stop / Target
    const entry = Math.round((price * 1.005) * 100) / 100;
    const stop = Math.round((swLow - atr * 0.2) * 100) / 100;
    const riskPerShare = entry - stop;
    const riskPct = entry > 0 ? (riskPerShare / entry) * 100 : 0;
    const target1R = Math.round((entry + riskPerShare) * 100) / 100;
    const target2R = Math.round((entry + riskPerShare * 2) * 100) / 100;
    const rr = riskPerShare > 0 ? (riskPerShare * 2) / riskPerShare : 0;

    const horizon = atrPct < 1.5 ? '10D' : atrPct < 3 ? '5D' : '5D';

    // Risk Score
    let rScore = 50;
    if (riskPct <= 3) rScore += 20; else if (riskPct <= 5) rScore += 10; else if (riskPct > 7) rScore -= 20;
    if (rr >= 2) rScore += 15; else if (rr >= 1.5) rScore += 5; else rScore -= 15;
    if (atrPct < 2) rScore += 10; else if (atrPct > 4) rScore -= 10;
    rScore = Math.round(Math.max(0, Math.min(100, rScore)));

    // Total Score
    const totalScore = Math.round(tScore * 0.25 + rsScore * 0.20 + mScore * 0.15 + vScore * 0.15 + sScore * 0.10 + 50 * 0.10 + rScore * 0.05);

    // Decision
    const warnings: string[] = [];
    let decision: Decision = 'NO_TRADE';
    if (rr < 1.5) warnings.push(`R:R ${rr.toFixed(1)} — shume i ulet (duhet 1:2+)`);
    if (rsi > 75) warnings.push(`RSI ${rsi.toFixed(0)} — i mbivleresuar`);
    if (riskPct > 8) warnings.push(`Rreziku ${riskPct.toFixed(1)}% — shume i larte`);
    if (!regimeOk) warnings.push('REGJIMI jo OK — vetem watcher');
    if (pbPct > -0.5 && setup === 'PULLBACK') warnings.push('Jo te vertete nje pullback — extended');

    const hasRR = rr >= 1.5, rsiOk = rsi >= 30 && rsi <= 75, riskOk = riskPct <= 8, scoreOk = totalScore >= 45;
    if (hasRR && rsiOk && riskOk && scoreOk && regimeOk) decision = 'READY';
    else if (hasRR && rsiOk && riskOk && scoreOk && !regimeOk) { decision = 'WATCHLIST'; warnings.push('WATCHLIST: Regjimi i tregut nuk lejon long tani'); }
    else if (!hasRR || riskPct > 6) { if (sScore >= 50) decision = 'WATCHLIST'; else decision = 'NO_TRADE'; }
    else if (rsi > 72 || pbPct > -0.3) decision = 'EXTENDED';
    else decision = 'WATCHLIST';
    if (rsi > 70 && totalScore >= 55) { decision = 'EVENT_RISK'; warnings.push('EVENT_RISK: RSI i larte, rrezik kthimi'); }

    // Funnel phase results for diagnostic
    const passedLiquidity = passedLiq ? 1 : 0;
    const passedTrendPhase = passedTrend ? 1 : 0;
    const passedSetupPhase = (setup !== 'NONE') ? 1 : 0;
    const passedRiskPhase = (decision === 'READY' || decision === 'WATCHLIST' || decision === 'EVENT_RISK') ? 1 : 0;

    return NextResponse.json({
      symbol: sym,
      regimeOk,
      regimeDetail,
      stock: {
        symbol: sym, price, avgVol20d: avgVol20, avgDolVol20d: avgDolVol,
        passedLiquidity: passedLiq, passedTrend,
        trendScore: tScore, rsScore, momentumScore: mScore, volConfScore: vScore, setupScore: sScore, riskScore: rScore, totalScore,
        setup, horizon, rsi: Math.round(rsi * 10) / 10, atr: Math.round(atr * 100) / 100, atrPct: Math.round(atrPct * 100) / 100,
        volRatio: Math.round(volRatio * 100) / 100, volDeclining, lastDaySpike,
        pullbackDays: pbDays, pullbackPct: Math.round(pbPct * 100) / 100,
        distFromEMA10: Math.round(dist10 * 100) / 100, distFromEMA20: Math.round(dist20 * 100) / 100,
        aboveSMA50: above50, aboveSMA200: above200, sma50Above200: golden,
        rsVsSPY: Math.round(rsSpy22 * 100) / 100, rsVsQQQ: Math.round(rsQqq22 * 100) / 100, rsVsSPY60d: Math.round(rsSpy60 * 100) / 100,
        entry, stop, target1R, target2R, riskPct: Math.round(riskPct * 100) / 100,
        rewardRiskRatio: Math.round(rr * 10) / 10, swingLow: Math.round(swLow * 100) / 100,
        decision, reasons, warnings,
      },
      funnel: { passedLiquidity, passedTrend: passedTrendPhase, passedSetup: passedSetupPhase, passedRisk: passedRiskPhase },
    });
  } catch (err: any) {
    console.error(`[IBKR ANALYZE] Error for ${sym}:`, err);
    return NextResponse.json({ symbol: sym, regimeOk: false, regimeDetail: { spy: { above50: false, above200: false }, qqq: { above50: false, above200: false } }, stock: null, error: err?.message || 'Gabim analize' }, { status: 500 });
  }
}
