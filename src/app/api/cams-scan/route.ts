import { NextResponse } from 'next/server';
import { fetchHistoricalData, HistoricalDataPoint } from '@/lib/alpha-vantage';
import { calculateSMA, calculateRSI, calculateADX } from '@/lib/indicators';
import { checkMultiEventRisk } from '@/lib/event-risk';
import { getScanUniverse } from '@/lib/scanner/universe-400';
import { SECTOR_MAP } from '@/app/api/ibkr-scan/route';
import {
  computeCams,
  type CamsPriceFeatures,
  type CamsCatalystFeatures,
  type CamsRegimeFeatures,
  type CamsGapEvent,
  type CamsResult,
} from '@/lib/cams/cams-engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// ── Helpers teknikë (të njëjtat me ibkr-scan) ──

const ETF_SET = new Set(['SPY','QQQ','SMH','XLF','XLE','XLK','XLV','XLY','XLP','XLI','XLB','XLU','XLRE','XLC','GLD','TLT','IWM','VTI','ARKK','SCHD']);

const SECTOR_ETF_MAP: Record<string, string> = {
  Tech: 'XLK', Consumer: 'XLY', Staples: 'XLP', Healthcare: 'XLV',
  Finance: 'XLF', Energy: 'XLE', Industrial: 'XLI', REITs: 'XLRE',
  Utilities: 'XLU', Communication: 'XLC', Materials: 'XLB',
};
const SECTOR_ETFS = [...new Set(Object.values(SECTOR_ETF_MAP))];

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

// ── Detektimi i gap-eve (katalizator proxy nga çmimi) ──
// Gap-u më i madh pozitiv (≥3%) me volum ≥1.5x në 45 ditët e fundit
// dhe gap-u negativ i sapo (10 ditë) për penalty.

function detectGaps(data: HistoricalDataPoint[]): { gapUp: CamsGapEvent | null; gapDown: CamsGapEvent | null } {
  let gapUp: CamsGapEvent | null = null;
  let gapDown: CamsGapEvent | null = null;
  const n = data.length;

  for (let i = Math.max(1, n - 60); i < n; i++) {
    const prevClose = data[i - 1].close;
    const gapPct = prevClose > 0 ? ((data[i].open - prevClose) / prevClose) * 100 : 0;
    if (Math.abs(gapPct) < 3) continue;

    // Volumi i ditës së gap vs mesatarja 20d PARA asaj dite
    const volWindow = data.slice(Math.max(0, i - 20), i);
    const avgVol = volWindow.length > 0 ? volWindow.reduce((s, d) => s + d.volume, 0) / volWindow.length : 0;
    if (avgVol <= 0) continue;
    const rvolOnGap = data[i].volume / avgVol;
    const daysAgo = n - 1 - i;
    const date = data[i].date;

    if (gapPct > 0 && daysAgo <= 45 && rvolOnGap >= 1.5) {
      if (!gapUp || gapPct > gapUp.gapPct) {
        gapUp = { daysAgo, gapPct, rvolOnGap, closeOnGap: data[i].close, date };
      }
    }
    if (gapPct < 0 && daysAgo <= 10 && rvolOnGap >= 1.5) {
      if (!gapDown || gapPct < gapDown.gapPct) {
        gapDown = { daysAgo, gapPct, rvolOnGap, closeOnGap: data[i].close, date };
      }
    }
  }
  return { gapUp, gapDown };
}

// ── Konsolidim: ditë me range ditor < 1.5 ATR ──

function detectConsolidation(data: HistoricalDataPoint[], atr: number): { days: number; high: number } {
  const n = data.length;
  let days = 0;
  let high = 0;
  for (let i = n - 1; i >= Math.max(0, n - 12); i--) {
    const range = data[i].high - data[i].low;
    if (atr > 0 && range < 1.5 * atr) {
      days++;
      high = Math.max(high, data[i].high);
    } else if (days >= 3) {
      break; // konsolidimi përfundoi — mos vazhdo pas një dite të gjerë
    } else {
      days = 0; high = 0;
    }
  }
  return { days: Math.min(days, 10), high };
}

// ── Pullback: ditë rënuese rresht (max 8) ──

function detectPullback(data: HistoricalDataPoint[]): number {
  const closes = data.map(d => d.close);
  let days = 0;
  for (let i = closes.length - 1; i > Math.max(0, closes.length - 8); i--) {
    if (closes[i] < closes[i - 1]) days++;
    else break;
  }
  return days;
}

// ── Alpha Vantage enrichment (EPS surprise + revisions — vetëm top 12) ──

async function enrichWithEarnings(symbols: string[]): Promise<Map<string, { epsSurprisePct: number | null; revisionScore: number | null; daysSince: number | null }>> {
  const out = new Map<string, { epsSurprisePct: number | null; revisionScore: number | null; daysSince: number | null }>();
  if (!process.env.ALPHA_VANTAGE_API_KEY) return out;

  const { fetchEarnings } = await import('@/lib/pead-engine');
  const { computeAnalystRevisionScore } = await import('@/lib/analyst-revision-engine');

  // Në grupe të vogla — AV ka limit ~25 kërkesa/ditë (cache 4h brenda instancës)
  for (let i = 0; i < symbols.length; i += 6) {
    const batch = symbols.slice(i, i + 6);
    await Promise.allSettled(batch.map(async (sym) => {
      try {
        const reports = await fetchEarnings(sym);
        if (!reports || reports.length === 0) return;
        const latest = reports[0];
        const rev = computeAnalystRevisionScore({ symbol: sym, earningsReports: reports });

        let daysSince: number | null = null;
        if (latest.reportedDate) {
          const d = new Date(latest.reportedDate);
          daysSince = Math.floor((Date.now() - d.getTime()) / 86_400_000);
        }
        out.set(sym, {
          epsSurprisePct: latest.surprisePct,
          revisionScore: rev.revisionScore,
          daysSince,
        });
      } catch { /* tolerant */ }
    }));
    if (i + 6 < symbols.length) await new Promise(r => setTimeout(r, 400));
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// GET /api/cams-scan — CAMS Scanner
// Universi 400 → prefilter → score → enrichment → Top 10 (max 2/sektor)
// ═══════════════════════════════════════════════════════════════

export async function GET() {
  const t0 = Date.now();
  try {
    const universe = getScanUniverse(400).filter(s => !ETF_SET.has(s));
    console.log(`[CAMS] Universi: ${universe.length} aksione`);

    // ── Fetch benchmark-et + ETF-t e sektorëve ──
    const benchmarks = ['SPY', 'QQQ', ...SECTOR_ETFS];
    const benchData: Record<string, HistoricalDataPoint[]> = {};
    await Promise.allSettled(benchmarks.map(async (b) => {
      const d = await fetchHistoricalData(b, '1y');
      if (d && d.length > 0) benchData[b] = d;
    }));

    const spy = benchData['SPY'] || [];
    const qqq = benchData['QQQ'] || [];
    if (spy.length < 210) {
      return NextResponse.json({ error: 'Të dhënat e SPY nuk u morën — provo pas disa minutash' }, { status: 503 });
    }

    const spyC = spy.map(d => d.close);
    const qqqC = qqq.length > 0 ? qqq.map(d => d.close) : spyC;
    const sL = spyC.length - 1;
    const spyS50 = calculateSMA(spyC, 50), spyS200 = calculateSMA(spyC, 200);
    const qqqS50 = calculateSMA(qqqC, 50), qqqS200 = calculateSMA(qqqC, 200);
    const spyAbove50 = spyC[sL] > (spyS50[sL] || 0), spyAbove200 = spyC[sL] > (spyS200[sL] || 0);
    const qqqAbove50 = qqqC[qqqC.length - 1] > (qqqS50[qqqC.length - 1] || 0);
    const qqqAbove200 = qqqC[qqqC.length - 1] > (qqqS200[qqqC.length - 1] || 0);
    const spyRet20d = pct(spyC, 20);

    // ETF sektorit: mbi SMA50? + rendimenti 20d
    const sectorEtfInfo = new Map<string, { above50: boolean; ret20d: number }>();
    for (const [sec, etf] of Object.entries(SECTOR_ETF_MAP)) {
      const d = benchData[etf];
      if (!d || d.length < 50) { sectorEtfInfo.set(sec, { above50: false, ret20d: 0 }); continue; }
      const c = d.map(x => x.close);
      const s50 = calculateSMA(c, 50);
      sectorEtfInfo.set(sec, {
        above50: c[c.length - 1] > (s50[c.length - 1] || 0),
        ret20d: pct(c, 20),
      });
    }

    // ── Fetch universi (grupe me pacing si ibkr-scan) ──
    const hist: Record<string, HistoricalDataPoint[] | null> = {};
    const BATCH = 8;
    for (let i = 0; i < universe.length; i += BATCH) {
      const batch = universe.slice(i, i + BATCH);
      const res = await Promise.allSettled(batch.map(async s => ({ s, d: await fetchHistoricalData(s, '1y') })));
      for (const r of res) if (r.status === 'fulfilled' && r.value.d) hist[r.value.s] = r.value.d;
      if (i + BATCH < universe.length) await new Promise(r => setTimeout(r, 250));
    }
    console.log(`[CAMS] OHLCV: ${Object.keys(hist).length}/${universe.length} në ${((Date.now()-t0)/1000).toFixed(1)}s`);

    // ── Faza 1: Prefilter universi (rregullat e strategjisë) ──
    const sectorReturns = new Map<string, number[]>();
    const staged: Array<{
      symbol: string; price: number; sector: string;
      avgVol20d: number; avgDolVol20d: number;
      pf: Omit<CamsPriceFeatures, 'sectorRankPct'>;
      cat: CamsCatalystFeatures; regime: CamsRegimeFeatures;
    }> = [];
    let passLiquidity = 0;

    for (const sym of universe) {
      const data = hist[sym];
      if (!data || data.length < 210) continue;

      const closes = data.map(d => d.close);
      const vols = data.map(d => d.volume);
      const last = closes.length - 1;
      const price = closes[last];

      // Prefilter: çmimi > $5, volumi > 1M, dollar-volumi > $20M
      const avgVol20 = vols.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const n20 = Math.min(20, closes.length, vols.length);
      let dolVol = 0;
      for (let i = closes.length - n20; i < closes.length; i++) dolVol += closes[i] * vols[i];
      const avgDolVol = dolVol / n20;
      if (!(price >= 5 && avgVol20 >= 1_000_000 && avgDolVol >= 20_000_000)) continue;
      passLiquidity++;

      const sector = SECTOR_MAP[sym] || 'Other';
      const ema10 = calcEMA(closes, 10), ema20 = calcEMA(closes, 20),
            ema50 = calcEMA(closes, 50), ema200 = calcEMA(closes, 200);
      const atr = calcATR(data, 14);
      const atrPct = price > 0 ? (atr / price) * 100 : 0;
      const rsiArr = calculateRSI(closes, 14);
      const adxArr = calculateADX(data.map(d => d.high), data.map(d => d.low), closes, 14);

      const recent3 = vols.slice(-3).reduce((a, b) => a + b, 0) / 3;
      const rvol = avgVol20 > 0 ? recent3 / avgVol20 : 1;

      const today = data[last];
      const dayRange = today.high - today.low;
      const closeLocation = dayRange > 0 ? (today.close - today.low) / dayRange : 0.5;

      const ret5d = pct(closes, 5), ret20d = pct(closes, 20);

      const high20arr = data.slice(-21, -1).map(d => d.high); // 20d PARA ditës së sotme
      const high20 = high20arr.length > 0 ? Math.max(...high20arr) : price;

      const swingLow = Math.min(...data.slice(-10).map(d => d.low));

      const { gapUp, gapDown } = detectGaps(data);
      const cons = detectConsolidation(data, atr);
      const pullbackDays = detectPullback(data);

      // Event risk (8K materiale, earnings dates)
      const ev = checkMultiEventRisk(sym);

      const etfInfo = sectorEtfInfo.get(sector) || { above50: false, ret20d: 0 };

      const pf: Omit<CamsPriceFeatures, 'sectorRankPct'> = {
        symbol: sym,
        price,
        ema10: ema10[last] || price,
        ema20: ema20[last] || price,
        ema50: ema50[last] || price,
        ema200: ema200[last] || price,
        ema20Slope: ema20[last] && ema20[last - 10] ? ((ema20[last] - ema20[last - 10]) / ema20[last - 10]) * 100 : 0,
        ema50Slope: ema50[last] && ema50[last - 10] ? ((ema50[last] - ema50[last - 10]) / ema50[last - 10]) * 100 : 0,
        rsi14: rsiArr[last] || 50,
        atr14: atr,
        atrPct,
        adx14: adxArr[last] || 0,
        rvol,
        closeLocation,
        ret5d,
        ret20d,
        sectorRet20d: etfInfo.ret20d,
        high20,
        pullbackDays,
        consolidationDays: cons.days,
        consolidationHigh: cons.high,
        swingLow,
        gapUp,
        gapDown,
      };

      const cat: CamsCatalystFeatures = {
        epsSurprisePct: null,
        revenueSurprisePct: null,
        material8KSentiment: ev.material8KSentiment || 'none',
        analystRevisionScore: null,
        daysToEarnings: ev.daysToEarnings,
        daysSinceEarnings: null,
      };

      const regime: CamsRegimeFeatures = {
        spyAbove50, spyAbove200, qqqAbove50, qqqAbove200,
        sectorAbove50: etfInfo.above50,
        sectorVsSpy20d: etfInfo.ret20d - spyRet20d,
      };

      if (!sectorReturns.has(sector)) sectorReturns.set(sector, []);
      sectorReturns.get(sector)!.push(ret20d);

      staged.push({ symbol: sym, price, sector, avgVol20d: avgVol20, avgDolVol20d: avgDolVol, pf, cat, regime });
    }

    console.log(`[CAMS] Prefilter kaluan: ${passLiquidity}`);

    // Percentili sektorial për secilin (rendimenti 20d brenda sektorit)
    for (const s of staged) {
      const rets = sectorReturns.get(s.sector) || [];
      const below = rets.filter(r => r < s.pf.ret20d).length;
      (s.pf as CamsPriceFeatures).sectorRankPct = rets.length > 0 ? Math.round((below / rets.length) * 100) : 50;
    }

    // ── Faza 2: score paraprak (pa EPS real — R neutral 50) ──
    const prelim = staged.map(s => ({
      ...s,
      pf: s.pf as CamsPriceFeatures,
      result: computeCams(s.pf as CamsPriceFeatures, s.cat, s.regime, s.avgDolVol20d),
    }));
    prelim.sort((a, b) => b.result.camsScore - a.result.camsScore);

    // ── Faza 3: enrichment me EPS real për top 12 (kufiri AV ~25/ditë) ──
    const topForEnrich = prelim.slice(0, 12).map(s => s.symbol);
    const earningsData = await enrichWithEarnings(topForEnrich);
    let enrichedCount = 0;
    for (const row of prelim.slice(0, 12)) {
      const e = earningsData.get(row.symbol);
      if (!e) continue;
      row.cat.epsSurprisePct = e.epsSurprisePct;
      row.cat.analystRevisionScore = e.revisionScore;
      row.cat.daysSinceEarnings = e.daysSince;
      row.result = computeCams(row.pf, row.cat, row.regime, row.avgDolVol20d);
      enrichedCount++;
    }
    prelim.sort((a, b) => b.result.camsScore - a.result.camsScore);
    console.log(`[CAMS] Enrichment EPS: ${enrichedCount}/12 kandidatë me të dhëna reale`);

    // ── Faza 4: Top 10 me max 2 aksione për sektor ──
    const sectorCount = new Map<string, number>();
    const top10: typeof prelim = [];
    for (const row of prelim) {
      const c = sectorCount.get(row.sector) || 0;
      if (c >= 2) continue;
      sectorCount.set(row.sector, c + 1);
      top10.push(row);
      if (top10.length >= 10) break;
    }

    const scored60 = prelim.filter(p => p.result.camsScore >= 60).length;
    const withCatalyst = prelim.filter(p => p.result.catalystScore >= 40).length;

    // ── Ruaj snapshot-et në Learning Engine si CATALYST_MOMENTUM (non-blocking) ──
    try {
      const { saveStrategySnapshots } = await import('@/lib/scanner-snapshot-service');
      const { ScannerStrategy, ScannerDecision } = await import('@prisma/client');

      const mapTier = (t: string) => {
        const map: Record<string, any> = {
          A_KANDIDAT: ScannerDecision.READY,
          WATCHLIST: ScannerDecision.WATCHLIST,
          MONITOR: ScannerDecision.NEW_CANDIDATE,
          NO_TRADE: ScannerDecision.NO_TRADE,
        };
        return map[t] || ScannerDecision.NO_TRADE;
      };

      await saveStrategySnapshots(
        ScannerStrategy.CATALYST_MOMENTUM,
        top10.map((row) => ({
          ticker: row.symbol,
          rank: top10.indexOf(row) + 1,
          totalScore: row.result.camsScore,
          decision: mapTier(row.result.tier),
          price: row.price,
          volume: row.avgVol20d,
          averageVolume20D: row.avgVol20d,
          avgDollarVolume20D: row.avgDolVol20d,
          spreadPct: 0,
          liquidityScore: row.avgDolVol20d > 100_000_000 ? 100 : row.avgDolVol20d > 50_000_000 ? 85 : 70,
          ema20: row.pf.ema20,
          sma50: row.pf.ema50,
          atr14: row.pf.atr14,
          rsi14: row.pf.rsi14,
          adx14: row.pf.adx14,
          trendScore: row.result.structureScore,
          volumeScore: row.result.accelerationScore,
          sector: row.sector,
          marketRegime: (spyAbove50 && spyAbove200 && qqqAbove50 && qqqAbove200) ? 'BULL' : 'BEAR',
          reasons: row.result.reasons.slice(0, 6),
          riskFlags: row.result.warnings,
        }))
      );
      console.log(`[CAMS] Saved ${top10.length} snapshots (CATALYST_MOMENTUM)`);
    } catch (e: any) {
      console.error('[CAMS] Snapshot save failed (non-blocking):', e?.message || e);
    }

    // ── Task 19: Ditari Javor — ruaj Top 10 në journal (non-blocking) ──
    try {
      const { ingestCamsJournal } = await import('@/lib/cams-journal');
      const res = await ingestCamsJournal(
        top10.map((row) => ({
          ticker: row.symbol,
          rank: top10.indexOf(row) + 1,
          price: row.price,
          sector: row.sector,
          score: row.result.camsScore,
          tier: row.result.tier,
          setup: row.result.setup,
          entry: row.result.entry,
          stop: row.result.stop,
          target3R: row.result.target3R,
          rvol: row.pf.rvol,
          atrPct: row.pf.atrPct,
          rsi14: row.pf.rsi14,
          adx14: row.pf.adx14,
          extensionAtr: row.result.extensionAtr,
          extensionFiltered: row.result.extensionFiltered,
          daysToEarnings: row.cat.daysToEarnings,
          gapUp: row.pf.gapUp,
          sub: {
            catalyst: row.result.catalystScore,
            acceleration: row.result.accelerationScore,
            structure: row.result.structureScore,
            revision: row.result.revisionScore,
            regime: row.result.regimeScore,
            penalty: row.result.penalty,
          },
          catalystEvidence: row.result.catalystEvidence,
          warnings: row.result.warnings,
          regime: {
            spyAbove50, spyAbove200, qqqAbove50, qqqAbove200,
            sectorAbove50: row.regime.sectorAbove50,
            sectorVsSpy20d: row.regime.sectorVsSpy20d,
          },
          high20: row.pf.high20,
          consolidationHigh: row.pf.consolidationHigh,
        }))
      );
      if (res.error) console.error('[CAMS] Journal ingest error:', res.error);
      else console.log(`[CAMS] Journal: ${res.saved} re + ${res.updated} rifreskuar`);
    } catch (e: any) {
      console.error('[CAMS] Journal ingest failed (non-blocking):', e?.message || e);
    }

    // ── Response ──
    const results = top10.map((row, i) => ({
      rank: i + 1,
      ...row.result,
      sector: row.sector,
      sectorEtf: SECTOR_ETF_MAP[row.sector] || '',
      price: row.price,
      avgDolVol20d: Math.round(row.avgDolVol20d),
      avgVol20d: Math.round(row.avgVol20d),
      ema20: Math.round(row.pf.ema20 * 100) / 100,
      ema50: Math.round(row.pf.ema50 * 100) / 100,
      rsi14: Math.round(row.pf.rsi14 * 10) / 10,
      adx14: Math.round(row.pf.adx14 * 10) / 10,
      atrPct: Math.round(row.pf.atrPct * 100) / 100,
      rvol: Math.round(row.pf.rvol * 100) / 100,
      ret20d: Math.round(row.pf.ret20d * 100) / 100,
      sectorRankPct: row.pf.sectorRankPct,
      daysToEarnings: row.cat.daysToEarnings,
      gapUp: row.pf.gapUp,
      // Task 19: diagnostika për zbërthimin konkret të sub-score-ve në UI
      diag: {
        ema10: Math.round(row.pf.ema10 * 100) / 100,
        ema200: Math.round(row.pf.ema200 * 100) / 100,
        ema20Slope: Math.round(row.pf.ema20Slope * 100) / 100,
        ema50Slope: Math.round(row.pf.ema50Slope * 100) / 100,
        closeLocation: Math.round(row.pf.closeLocation * 100) / 100,
        ret5d: Math.round(row.pf.ret5d * 100) / 100,
        high20: Math.round(row.pf.high20 * 100) / 100,
        consolidationDays: row.pf.consolidationDays,
        consolidationHigh: Math.round(row.pf.consolidationHigh * 100) / 100,
        pullbackDays: row.pf.pullbackDays,
        swingLow: Math.round(row.pf.swingLow * 100) / 100,
        epsSurprisePct: row.cat.epsSurprisePct,
        analystRevisionScore: row.cat.analystRevisionScore,
        daysSinceEarnings: row.cat.daysSinceEarnings,
        material8KSentiment: row.cat.material8KSentiment,
        spyAbove50, spyAbove200, qqqAbove50, qqqAbove200,
        sectorAbove50: row.regime.sectorAbove50,
        sectorVsSpy20d: Math.round(row.regime.sectorVsSpy20d * 100) / 100,
      },
    }));

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      durationSec: Math.round((Date.now() - t0) / 100) / 10,
      regime: {
        ok: spyAbove50 && spyAbove200 && qqqAbove50 && qqqAbove200,
        spy: { above50: spyAbove50, above200: spyAbove200 },
        qqq: { above50: qqqAbove50, above200: qqqAbove200 },
      },
      funnel: {
        universe: universe.length,
        withData: Object.keys(hist).length,
        passedLiquidity: passLiquidity,
        withCatalyst,
        scored60plus: scored60,
        displayed: top10.length,
      },
      enrichment: {
        alphaVantage: !!process.env.ALPHA_VANTAGE_API_KEY,
        enriched: enrichedCount,
        note: enrichedCount > 0
          ? `EPS real + revisionsh për ${enrichedCount}/12 top kandidatë`
          : 'Pa EPS real — katalizatori bazohet në reagimin e tregut (gap+volum) dhe 8-K',
      },
      results,
    });
  } catch (err: any) {
    console.error('[CAMS] Scan error:', err?.message || err, err?.stack);
    return NextResponse.json({ error: err?.message || 'Gabim në skanimin CAMS' }, { status: 500 });
  }
}
