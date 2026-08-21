import { NextResponse } from 'next/server';
import { fetchHistoricalData, HistoricalDataPoint } from '@/lib/alpha-vantage';
import { calculateSMA, calculateRSI } from '@/lib/indicators';

// ═══════════════════════════════════════════════════════════════
// IBKR TREND PULLBACK SCANNER
// Scans large-cap universe for Trend Pullback Swing setups
// ═══════════════════════════════════════════════════════════════

const UNIVERSE = [
  // Tech / AI / Semiconductors
  'NVDA', 'AMD', 'MSFT', 'AAPL', 'AMZN', 'META', 'GOOGL', 'AVGO', 'TSLA', 'NFLX',
  'CRM', 'ORCL', 'ADBE', 'NOW', 'INTU', 'SNOW', 'PLTR', 'DDOG', 'CRWD', 'PANW',
  'NET', 'ZS', 'FTNT', 'PANW', 'MRVL', 'QCOM', 'TXN', 'MU', 'LRCX', 'AMAT',
  'ADI', 'KLAC', 'ON', 'DELL', 'HPQ', 'IBM', 'CTSH', 'WDAY', 'VEEV', 'HUBS',
  // Communication / Media
  'DIS', 'CMCSA', 'WBD', 'NFLX', 'EA', 'TTWO', 'UBER', 'ABNB', 'BKNG', 'EXPE',
  // Consumer / Retail
  'COST', 'WMT', 'TGT', 'HD', 'LOW', 'NKE', 'KO', 'PEP', 'MCD', 'SBUX',
  'YUM', 'CMG', 'EL', 'PM', 'MO', 'DEO', 'STZ', 'MON', 'CL', 'KMB',
  'PG', 'JNJ', 'UNH', 'LLY', 'MRK', 'ABBV', 'PFE', 'TMO', 'ABT', 'DHR',
  'BMY', 'GILD', 'VRTX', 'REGN', 'BIIB', 'ISRG', 'SYK', 'EW', 'BSX', 'MDT',
  // Finance
  'JPM', 'V', 'MA', 'BAC', 'GS', 'MS', 'AXP', 'BLK', 'SCHW', 'C',
  'USB', 'PGR', 'CB', 'AON', 'MET', 'PRU', 'COF', 'SYF', 'DFS', 'NTRS',
  // Energy
  'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'OXY', 'MPC', 'PSX', 'VLO', 'WBA',
  // Industrial / Manufacturing
  'CAT', 'GE', 'HON', 'UPS', 'RTX', 'BA', 'LMT', 'NOC', 'GD', 'DE',
  'MMM', 'EMR', 'ITW', 'ETN', 'CMI', 'ROK', 'PH', 'JCI', 'PCAR', 'FDX',
  // Automative / Transport
  'GM', 'F', 'RIVN', 'LCID', 'NIO', 'F', 'STLA',
  // Materials / Chemicals
  'LIN', 'APD', 'SHW', 'ECL', 'DD', 'FCX', 'NEM', 'GOLD',
  // Utilities / Infrastructure
  'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE', 'AMT', 'CCI', 'EQIX',
  // Real Estate / REITs
  'PLD', 'AMT', 'PSA', 'O', 'WELL', 'VICI', 'CBRE',
  // ETFs (for reference, filtered out of scan)
  'SPY', 'QQQ', 'SMH', 'XLF', 'XLE', 'XLK', 'XLV', 'XLY', 'XLP', 'XLI', 'XLB', 'XLU', 'XLRE', 'XLC', 'XLI', 'GLD', 'TLT', 'IWM', 'IWM', 'VTI', 'ARKK', 'SCHD',
];

const ETF_SET = new Set(['SPY','QQQ','SMH','XLF','XLE','XLK','XLV','XLY','XLP','XLI','XLB','XLU','XLRE','XLC','GLD','TLT','IWM','VTI','ARKK','SCHD']);

const BENCHMARKS = ['SPY', 'QQQ'];

// ── Helper: EMA ──
function calcEMA(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  if (data.length < period) return result;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  result[period - 1] = sum / period;
  const k = 2 / (period + 1);
  for (let i = period; i < data.length; i++) {
    result[i] = data[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

// ── Helper: ATR ──
function calcATR(data: HistoricalDataPoint[], period = 14): number {
  if (data.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const tr = Math.max(
      data[i].high - data[i].low,
      Math.abs(data[i].high - data[i - 1].close),
      Math.abs(data[i].low - data[i - 1].close),
    );
    trs.push(tr);
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// ── Helper: % change over N days ──
function pctChange(data: number[], days: number): number {
  if (data.length < days + 1) return 0;
  const current = data[data.length - 1];
  const past = data[data.length - 1 - days];
  return past > 0 ? ((current - past) / past) * 100 : 0;
}

// ── Helper: pullback detection ──
function detectPullback(closes: number[], highs: number[], lows: number[], ema10: number[], ema20: number[]): {
  pullbackDays: number;
  pullbackPct: number;
  distFromEMA10: number;
  distFromEMA20: number;
  swingLow: number;
  isPullback: boolean;
} {
  const last = closes.length - 1;
  if (last < 5) return { pullbackDays: 0, pullbackPct: 0, distFromEMA10: 0, distFromEMA20: 0, swingLow: 0, isPullback: false };

  const ema10Val = ema10[last];
  const ema20Val = ema20[last];
  if (isNaN(ema10Val) || isNaN(ema20Val)) return { pullbackDays: 0, pullbackPct: 0, distFromEMA10: 0, distFromEMA20: 0, swingLow: 0, isPullback: false };

  const currentPrice = closes[last];
  const dist10 = ((currentPrice - ema10Val) / ema10Val) * 100;
  const dist20 = ((currentPrice - ema20Val) / ema20Val) * 100;

  // Count consecutive down days (max 10)
  let pbDays = 0;
  let peak = closes[last];
  for (let i = last; i >= Math.max(0, last - 10); i--) {
    if (closes[i] < peak) {
      pbDays++;
      peak = closes[i];
    } else {
      break;
    }
  }
  // If still going down, count from the actual high
  if (pbDays === 0) {
    let highIdx = last;
    for (let i = last; i >= Math.max(0, last - 10); i--) {
      if (closes[i] >= closes[highIdx]) highIdx = i;
    }
    // Count down days from that high
    for (let i = highIdx + 1; i <= last; i++) {
      if (closes[i] < closes[i - 1]) pbDays++;
    }
    // Recalculate pullback as decline from high to current
    const highPrice = closes[highIdx];
    const pbPct = highPrice > 0 ? ((currentPrice - highPrice) / highPrice) * 100 : 0;
    const swLow = Math.min(...lows.slice(highIdx, last + 1));
    const isPB = pbDays >= 2 && pbDays <= 8 && pbPct >= -8 && pbPct <= -1;
    return { pullbackDays: pbDays, pullbackPct: pbPct, distFromEMA10: dist10, distFromEMA20: dist20, swingLow: swLow, isPullback: isPB };
  }

  const recentHigh = Math.max(...closes.slice(Math.max(0, last - 10), last));
  const pbPct = recentHigh > 0 ? ((currentPrice - recentHigh) / recentHigh) * 100 : 0;
  const swLow = Math.min(...lows.slice(Math.max(0, last - 10), last + 1));

  const isPB = pbDays >= 2 && pbDays <= 8 && pbPct >= -8 && pbPct <= -1;
  return { pullbackDays: pbDays, pullbackPct: pbPct, distFromEMA10: dist10, distFromEMA20: dist20, swingLow: swLow, isPullback: isPB };
}

// ── Helper: volume pattern ──
function volumePattern(data: HistoricalDataPoint[]): {
  avgVol20: number;
  recentVolRatio: number;
  volDeclining: boolean;
  lastDaySpike: boolean;
} {
  if (data.length < 20) return { avgVol20: 0, recentVolRatio: 1, volDeclining: false, lastDaySpike: false };

  const last = data.length - 1;
  const vols = data.map(d => d.volume);
  const avg20 = vols.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const recent3 = vols.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const ratio = avg20 > 0 ? recent3 / avg20 : 1;

  // Check if pullback volume is declining (last 3-5 days vs prior)
  const pbVol = vols.slice(-5, -1);
  const priorVol = vols.slice(-10, -5);
  const avgPb = pbVol.length > 0 ? pbVol.reduce((a, b) => a + b, 0) / pbVol.length : 0;
  const avgPrior = priorVol.length > 0 ? priorVol.reduce((a, b) => a + b, 0) / priorVol.length : 0;
  const volDeclining = avgPb < avgPrior * 0.95;

  // Last day spike (confirmation candle)
  const lastDaySpike = vols[last] > avg20 * 1.1;

  return { avgVol20: avg20, recentVolRatio: Math.round(ratio * 100) / 100, volDeclining, lastDaySpike };
}

// ── Types ──
interface ScanResult {
  symbol: string;
  price: number;
  setup: 'PULLBACK' | 'BREAKOUT' | 'NONE';
  setupScore: number; // 0-100

  // Trend
  aboveSMA50: boolean;
  aboveSMA200: boolean;
  sma50Above200: boolean;
  trendScore: number; // 0-100

  // Pullback
  pullbackDays: number;
  pullbackPct: number;
  distFromEMA10: number;
  distFromEMA20: number;

  // Indicators
  rsi: number;
  atr: number;
  volRatio: number;
  volDeclining: boolean;
  lastDaySpike: boolean;

  // Relative Strength
  rsVsSPY: number; // % outperformance 1M
  rsVsQQQ: number;

  // Entry levels
  entry: number;
  stop: number;
  target1R: number;
  target2R: number;
  riskPct: number;
  rewardRiskRatio: number;
  swingLow: number;

  // Regime
  spyAbove50: boolean;
  spyAbove200: boolean;
  qqqAbove50: boolean;
  qqqAbove200: boolean;
  regimeOk: boolean;

  // Verdict
  passed: boolean;
  reasons: string[];
  warnings: string[];
}

interface IBKRScanResponse {
  scannedAt: string;
  regimeOk: boolean;
  regimeDetail: { spy: { above50: boolean; above200: boolean }; qqq: { above50: boolean; above200: boolean } };
  results: ScanResult[];
  summary: { total: number; passed: number; rejected: number };
}

export async function GET() {
  const t0 = Date.now();

  try {
    // ── Step 1: Fetch benchmark data (SPY, QQQ) ──
    const benchmarkData: Record<string, HistoricalDataPoint[]> = {};
    for (const sym of BENCHMARKS) {
      const d = await fetchHistoricalData(sym, '6mo', { forceRefresh: false });
      if (d) benchmarkData[sym] = d;
    }

    // ── Step 2: Check regime ──
    const spyData = benchmarkData['SPY'];
    const qqqData = benchmarkData['QQQ'];

    if (!spyData || !qqqData) {
      return NextResponse.json({ error: 'Nuk u gjeten te dhena per SPY/QQQ' }, { status: 500 });
    }

    const spyCloses = spyData.map(d => d.close);
    const qqqCloses = qqqData.map(d => d.close);
    const spySMA50 = calculateSMA(spyCloses, 50);
    const spySMA200 = calculateSMA(spyCloses, 200);
    const qqqSMA50 = calculateSMA(qqqCloses, 50);
    const qqqSMA200 = calculateSMA(qqqCloses, 200);

    const spyLast = spyCloses.length - 1;
    const qqqLast = qqqCloses.length - 1;

    const spyAbove50 = spyCloses[spyLast] > (spySMA50[spyLast] || 0);
    const spyAbove200 = spyCloses[spyLast] > (spySMA200[spyLast] || 0);
    const qqqAbove50 = qqqCloses[qqqLast] > (qqqSMA50[qqqLast] || 0);
    const qqqAbove200 = qqqCloses[qqqLast] > (qqqSMA200[qqqLast] || 0);
    const regimeOk = spyAbove50 && spyAbove200 && qqqAbove50 && qqqAbove200;

    // ── Step 3: Fetch all universe stocks in parallel (batches) ──
    const stockSymbols = UNIVERSE.filter(s => !ETF_SET.has(s));
    const allData: Record<string, HistoricalDataPoint[] | null> = {};

    // Fetch in batches of 8 to balance speed and rate limits
    const BATCH = 8;
    for (let i = 0; i < stockSymbols.length; i += BATCH) {
      const batch = stockSymbols.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (sym) => {
          const d = await fetchHistoricalData(sym, '6mo', { forceRefresh: false });
          return { sym, data: d };
        })
      );
      for (const r of results) {
        if (r.status === 'fulfilled') allData[r.value.sym] = r.value.data;
      }
      // Small delay between batches
      if (i + BATCH < stockSymbols.length) {
        await new Promise(res => setTimeout(res, 150));
      }
    }

    // ── Step 4: Analyze each stock ──
    const results: ScanResult[] = [];

    for (const sym of stockSymbols) {
      const data = allData[sym];
      if (!data || data.length < 50) continue;

      const closes = data.map(d => d.close);
      const highs = data.map(d => d.high);
      const lows = data.map(d => d.low);
      const last = closes.length - 1;
      const price = closes[last];

      // ── Trend Analysis ──
      const sma50 = calculateSMA(closes, 50);
      const sma200 = calculateSMA(closes, 200);
      const ema10 = calcEMA(closes, 10);
      const ema20 = calcEMA(closes, 20);

      const above50 = price > (sma50[last] || 0);
      const above200 = price > (sma200[last] || 0);
      const sma50Val = sma50[last] || 0;
      const sma200Val = sma200[last] || 0;
      const goldenCross = sma50Val > sma200Val;

      let trendScore = 0;
      if (above50) trendScore += 35;
      if (above200) trendScore += 35;
      if (goldenCross) trendScore += 30;

      // ── RSI ──
      const rsiArr = calculateRSI(closes, 14);
      const rsi = rsiArr[last] || 50;

      // ── ATR ──
      const atr = calcATR(data, 14);
      const atrPct = price > 0 ? (atr / price) * 100 : 0;

      // ── Pullback Detection ──
      const pb = detectPullback(closes, highs, lows, ema10, ema20);

      // ── Volume ──
      const vol = volumePattern(data);

      // ── Relative Strength ──
      const rsSpy = pctChange(closes, 22) - pctChange(spyCloses, 22);
      const rsQqq = pctChange(closes, 22) - pctChange(qqqCloses, 22);

      // ── Determine Setup Type ──
      let setup: 'PULLBACK' | 'BREAKOUT' | 'NONE' = 'NONE';
      let setupScore = 0;
      const reasons: string[] = [];
      const warnings: string[] = [];

      // PULLBACK setup
      if (pb.isPullback && trendScore >= 50) {
        setup = 'PULLBACK';
        setupScore += 25; // base for valid pullback

        if (pb.pullbackDays >= 3 && pb.pullbackDays <= 6) {
          setupScore += 20;
          reasons.push(`Pullback ${pb.pullbackDays} dite (ideal 3-6)`);
        } else {
          setupScore += 10;
          reasons.push(`Pullback ${pb.pullbackDays} dite`);
        }

        // Near EMA 10 or 20
        if (Math.abs(pb.distFromEMA10) < 3 || Math.abs(pb.distFromEMA20) < 3) {
          setupScore += 15;
          reasons.push('Cmimi afer EMA 10/20');
        }

        // Volume declining during pullback (good)
        if (vol.volDeclining) {
          setupScore += 15;
          reasons.push('Volumi ne renie gjate pullback (i mire)');
        }

        // Last day spike (confirmation)
        if (vol.lastDaySpike) {
          setupScore += 15;
          reasons.push('Volumi konfirmim ne diten e fundit');
        }

        // RSI in sweet spot
        if (rsi >= 40 && rsi <= 65) {
          setupScore += 10;
          reasons.push(`RSI ${rsi.toFixed(0)} ne zone 40-65`);
        } else if (rsi >= 30 && rsi < 40) {
          setupScore += 5;
          warnings.push(`RSI ${rsi.toFixed(0)} pak i ulet`);
        } else if (rsi > 65) {
          warnings.push(`RSI ${rsi.toFixed(0)} — jo i ekstremit por kujdes`);
        }
      }

      // BREAKOUT setup (price near 20-day high with volume)
      if (setup === 'NONE' && trendScore >= 70) {
        const high20 = Math.max(...highs.slice(-20));
        const nearHigh = price >= high20 * 0.98;
        if (nearHigh && vol.lastDaySpike && rsi >= 45 && rsi <= 70) {
          setup = 'BREAKOUT';
          setupScore = 50;
          reasons.push('Breakout prane rezistences 20-ditore');
          reasons.push('Volum konfirmim');
          if (rsi >= 45 && rsi <= 65) {
            setupScore += 15;
            reasons.push(`RSI ${rsi.toFixed(0)} i pershtatshem`);
          }
        }
      }

      if (setup === 'NONE') continue;

      // ── Relative strength bonus ──
      if (rsSpy > 0) {
        setupScore += Math.min(10, rsSpy);
        reasons.push(`Outperformon SPY me ${rsSpy.toFixed(1)}% (1M)`);
      } else {
        warnings.push(`Nuk outperformon SPY (${rsSpy.toFixed(1)}% 1M)`);
      }

      if (rsQqq > 0) {
        setupScore += Math.min(5, rsQqq / 2);
      }

      // ── Entry/Stop/Target ──
      const entry = Math.round((price * 1.005) * 100) / 100; // slight buffer above current
      const stop = Math.round((pb.swingLow - atr * 0.2) * 100) / 100;
      const riskPerShare = entry - stop;
      const riskPct = entry > 0 ? (riskPerShare / entry) * 100 : 0;
      const target2R = Math.round((entry + riskPerShare * 2) * 100) / 100;
      const target1R = Math.round((entry + riskPerShare) * 100) / 100;
      const rr = riskPerShare > 0 ? (riskPerShare * 2) / riskPerShare : 0;

      // ── Gate checks ──
      const passed = setupScore >= 50 && trendScore >= 50 && rsi >= 30 && rsi <= 75 && riskPct <= 8;

      if (!regimeOk) {
        warnings.push('REGJIMI: SPY ose QQQ nen 50/200 SMA — vetem watcher');
      }
      if (riskPct > 6) {
        warnings.push(`Rreziku per aksion ${riskPct.toFixed(1)}% — i larte`);
      }

      results.push({
        symbol: sym,
        price,
        setup,
        setupScore: Math.min(100, setupScore),
        aboveSMA50: above50,
        aboveSMA200: above200,
        sma50Above200: goldenCross,
        trendScore,
        pullbackDays: pb.pullbackDays,
        pullbackPct: Math.round(pb.pullbackPct * 100) / 100,
        distFromEMA10: Math.round(pb.distFromEMA10 * 100) / 100,
        distFromEMA20: Math.round(pb.distFromEMA20 * 100) / 100,
        rsi: Math.round(rsi * 10) / 10,
        atr: Math.round(atr * 100) / 100,
        volRatio: vol.recentVolRatio,
        volDeclining: vol.volDeclining,
        lastDaySpike: vol.lastDaySpike,
        rsVsSPY: Math.round(rsSpy * 100) / 100,
        rsVsQQQ: Math.round(rsQqq * 100) / 100,
        entry,
        stop,
        target1R,
        target2R,
        riskPct: Math.round(riskPct * 100) / 100,
        rewardRiskRatio: 2,
        swingLow: Math.round(pb.swingLow * 100) / 100,
        spyAbove50,
        spyAbove200,
        qqqAbove50,
        qqqAbove200,
        regimeOk,
        passed,
        reasons,
        warnings,
      });
    }

    // Sort by setupScore desc
    results.sort((a, b) => b.setupScore - a.setupScore);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[IBKR SCAN] Done in ${elapsed}s — ${results.length} setups found`);

    const response: IBKRScanResponse = {
      scannedAt: new Date().toISOString(),
      regimeOk,
      regimeDetail: {
        spy: { above50: spyAbove50, above200: spyAbove200 },
        qqq: { above50: qqqAbove50, above200: qqqAbove200 },
      },
      results,
      summary: {
        total: stockSymbols.length,
        passed: results.filter(r => r.passed).length,
        rejected: results.filter(r => !r.passed).length,
      },
    };

    return NextResponse.json(response);
  } catch (err: any) {
    console.error('[IBKR SCAN] Error:', err);
    return NextResponse.json({ error: err?.message || 'Gabim skaneri' }, { status: 500 });
  }
}
