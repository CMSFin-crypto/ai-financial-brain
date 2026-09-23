// ═══════════════════════════════════════════════════════════════
// Task 27 — IBKR VALIDATION / validation-lab.ts (orkestruesi)
// Fetch OHLCV 5vjeçar ditor (Yahoo) për universin + benchmark-et,
// ekzekuton backtest In-Sample / Out-of-Sample / Walk-Forward dhe
// ndërton raportin final me gates + auto-pause.
// ═══════════════════════════════════════════════════════════════
import { fetchHistoricalData, HistoricalDataPoint } from '@/lib/alpha-vantage';
import { getScanUniverse } from '@/lib/scanner/universe-400';
import { SECTOR_MAP } from '@/app/api/ibkr-scan/route';
import {
  BacktestContext, PreparedSymbol, runBacktest, prepareSymbol,
} from './backtest-engine';
import { splitWindows } from './walk-forward';
import {
  BacktestTrade, computeMetrics, scoreBuckets, sectorStats, setupSplit,
} from './metrics';
import { DEFAULT_COSTS, CostAssumptions } from './cost-model';
import { filterUniverseAsOf, survivorshipReport } from './universe-history';
import {
  ValidationReport, buildGateChecks, buildAutoPause,
} from './report-builder';

const SECTOR_ETF_MAP: Record<string, string> = {
  Tech: 'XLK', Consumer: 'XLY', Staples: 'XLP', Healthcare: 'XLV',
  Finance: 'XLF', Energy: 'XLE', Industrial: 'XLI', REITs: 'XLRE',
  Utilities: 'XLU', Communication: 'XLC', Materials: 'XLB',
};

const START_EQUITY = 25000;
const CACHE_TTL_MS = 6 * 3600 * 1000; // 6 orë

let cache: { at: number; report: ValidationReport } | null = null;

export interface LabParams {
  universeSize?: number;
  years?: number; // 3 ose 5
  force?: boolean;
}

export async function runValidationLab(params: LabParams = {}): Promise<ValidationReport> {
  if (!params.force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.report;
  }

  const universeSize = Math.min(Math.max(params.universeSize ?? 60, 20), 120);
  const years = params.years === 3 ? 3 : 5;
  const range = years === 3 ? '3y' : '5y';

  // ── 1. Universe + benchmark-et ──
  const rawUniverse = [...new Set(getScanUniverse(universeSize))];
  const etfs = [...new Set(Object.values(SECTOR_ETF_MAP))];

  const fetchList: { symbol: string; kind: 'stock' }[] =
    rawUniverse.map(s => ({ symbol: s, kind: 'stock' as const }));

  const BATCH = 8;
  const hist: Record<string, HistoricalDataPoint[] | null> = {};

  const fetchOne = async (sym: string) => {
    const d = await fetchHistoricalData(sym, range, { interval: '1d' });
    hist[sym] = d;
  };

  // Fetch me batch: SPY, QQQ, VIX, ETF-të, pastaj aksionet
  const critical = ['SPY', 'QQQ', '^VIX', ...etfs];
  for (let i = 0; i < critical.length; i += BATCH) {
    const batch = critical.slice(i, i + BATCH);
    await Promise.allSettled(batch.map(fetchOne));
  }
  if (!hist['SPY'] || !hist['QQQ'] || !hist['^VIX']) {
    throw new Error('Te dhenat SPY/QQQ/VIX mungojne — provo perseri');
  }

  for (let i = 0; i < fetchList.length; i += BATCH) {
    const batch = fetchList.slice(i, i + BATCH);
    await Promise.allSettled(batch.map(f => fetchOne(f.symbol)));
    if (i + BATCH < fetchList.length) await new Promise(r => setTimeout(r, 150));
  }

  // ── 2. Kalendari i unifikuar (ditët e tregtimit të SPY) ──
  const calendar = hist['SPY']!.map(b => b.date);
  const firstBarDate: Record<string, string> = {};
  for (const [sym, d] of Object.entries(hist)) {
    if (d && d.length > 0) firstBarDate[sym] = d[0].date;
  }

  // Universe as-of: heq të delistuar para periudhës dhe emrat pa data fare.
  // IPO-t e vona i lë — motori i përjashton natyrshëm (idx >= 210).
  const asOfStart = calendar[0];
  const asOfEnd = calendar[calendar.length - 1];
  const { kept, removedDelisted, removedNoHistory } =
    filterUniverseAsOf(rawUniverse, asOfStart, asOfEnd, firstBarDate);

  const symbols: PreparedSymbol[] = [];
  for (const sym of kept) {
    const d = hist[sym];
    if (!d || d.length < 210) continue;
    symbols.push(prepareSymbol(sym, SECTOR_MAP[sym] || 'Other', d));
  }

  const spy = prepareSymbol('SPY', 'Index', hist['SPY']!);
  const qqq = prepareSymbol('QQQ', 'Index', hist['QQQ']!);
  const vix = prepareSymbol('^VIX', 'Volatility', hist['^VIX']!);
  const sectorEtfs: Record<string, PreparedSymbol> = {};
  for (const etf of etfs) {
    const d = hist[etf];
    if (d && d.length > 210) sectorEtfs[etf] = prepareSymbol(etf, 'ETF', d);
  }

  const ctx: BacktestContext = {
    calendar, symbols, spy, qqq, vix, sectorEtfs,
    universeSize: symbols.length, equity: START_EQUITY,
  };

  // ── 3. Ndarja IS / OOS / Walk-Forward ──
  const totalDays = calendar.length;
  const split = splitWindows(totalDays, { isPct: 0.70, wfWindows: 4 });

  const isRes = runBacktest(ctx, { startIndex: split.static.isStart, endIndex: split.static.isEnd });
  const oosRes = runBacktest(ctx, { startIndex: split.static.oosStart, endIndex: split.static.oosEnd });

  const wfTrades: BacktestTrade[] = [];
  const wfWindows: ValidationReport['walkForwardWindows'] = [];
  for (const w of split.walkForward) {
    const res = runBacktest(ctx, { startIndex: w.oosStart, endIndex: w.oosEnd });
    wfTrades.push(...res.trades);
    const m = computeMetrics(res.trades, START_EQUITY);
    wfWindows.push({
      window: w.window,
      from: calendar[w.oosStart], to: calendar[w.oosEnd],
      trades: m.trades, winRatePct: m.winRatePct, avgR: m.avgR, netProfit: m.netProfit,
    });
  }

  const allTrades = [...isRes.trades, ...oosRes.trades];
  const isM = computeMetrics(isRes.trades, START_EQUITY);
  const oosM = computeMetrics(oosRes.trades, START_EQUITY);
  const wfM = computeMetrics(wfTrades, START_EQUITY);

  // ── 4. Kolona PAPER: journal-i real i scanner-it (Top10) ──
  let paperM: ValidationReport['table']['paper'] = null;
  let paperCount = 0;
  let paperNote = '';
  try {
    const { buildWeeklyReport } = await import('@/lib/top10-journal');
    const rep = await buildWeeklyReport(90);
    if (rep.dbActive && rep.totals.closed + rep.totals.expired > 0) {
      const closedN = rep.totals.closed + rep.totals.expired;
      paperCount = closedN;
      const wr = rep.directionAccuracy ?? rep.hitRate ?? 0;
      paperM = {
        trades: closedN,
        wins: Math.round((wr / 100) * closedN),
        losses: closedN - Math.round((wr / 100) * closedN),
        winRatePct: wr,
        profitFactor: 0,
        expectancy: 0,
        avgR: rep.expectancyR ?? 0,
        netProfit: 0,
        grossProfit: 0,
        totalCosts: 0,
        maxDrawdownPct: 0,
        maxDrawdownDollars: 0,
        avgHoldDays: 0,
        returnPct: 0,
        costDragPct: 0,
      };
      paperNote = `Journal Top10 (90 ditë): ${rep.totals.entries} hyrje, ${closedN} të mbyllura`;
    } else {
      paperNote = 'Journal-i Top10 nuk është aktiv në këtë ambient (DB) — kolona Paper mbushet kur ka 50+ rezultate reale të gjurmuara.';
    }
  } catch {
    paperNote = 'Journal-i Top10 nuk u lexua.';
  }

  // ── 5. Kostot e përgjithshme (dekompozim real nga çdo tregti) ──
  let commissionTotal = 0, spreadTotal = 0, slippageTotal = 0, impactTotal = 0;
  let costPctSum = 0, costPctN = 0;
  const exitReasons: Record<string, number> = {};
  for (const t of allTrades) {
    exitReasons[t.exitReason] = (exitReasons[t.exitReason] || 0) + 1;
    commissionTotal += t.costsBreakdown.commission;
    spreadTotal += t.costsBreakdown.spread;
    slippageTotal += t.costsBreakdown.slippage;
    impactTotal += t.costsBreakdown.impact;
    const posVal = t.shares * t.entryPrice;
    if (posVal > 0) {
      costPctSum += (t.costs / posVal) * 100;
      costPctN++;
    }
  }
  const totalCosts = allTrades.reduce((a, t) => a + t.costs, 0);
  const gross = allTrades.reduce((a, t) => a + t.pnlGross, 0);
  const avgCostPct = costPctN > 0 ? costPctSum / costPctN : 0;
  commissionTotal = Math.round(commissionTotal * 100) / 100;
  spreadTotal = Math.round(spreadTotal * 100) / 100;
  slippageTotal = Math.round(slippageTotal * 100) / 100;
  impactTotal = Math.round(impactTotal * 100) / 100;

  // Merge i arsyeve të refuzimit IS + OOS
  const rejectReasons: Record<string, number> = {};
  for (const src of [isRes.rejectReasons, oosRes.rejectReasons]) {
    for (const [k, v] of Object.entries(src)) {
      rejectReasons[k] = (rejectReasons[k] || 0) + v;
    }
  }

  // ── 6. Gates + auto-pause ──
  const gates = buildGateChecks({
    is: isM, oos: oosM, wf: wfM,
    paperTradesCount: paperCount,
    slippageEstimatePct: Math.round(avgCostPct * 1000) / 1000,
    oosWinRate: oosM.winRatePct, isWinRate: isM.winRatePct,
  });
  const autoPause = buildAutoPause({ is: isM, oos: oosM });

  const finalEquity = START_EQUITY + isM.netProfit + oosM.netProfit;

  const sortedByPnl = [...allTrades].sort((a, b) => b.pnlNet - a.pnlNet);
  const costs: CostAssumptions = DEFAULT_COSTS;

  const report: ValidationReport = {
    generatedAt: new Date().toISOString(),
    period: {
      from: calendar[Math.max(0, split.static.isStart)],
      to: calendar[calendar.length - 1],
      days: calendar.length,
      isDays: split.static.isEnd - split.static.isStart + 1,
      oosDays: split.static.oosEnd - split.static.oosStart + 1,
    },
    universe: {
      size: symbols.length,
      symbols: symbols.map(s => s.symbol),
      survivorship: survivorshipReport(symbols.length, removedDelisted.length),
    },
    equity: { startEquity: START_EQUITY, finalEquity: Math.round(finalEquity * 100) / 100 },
    table: { inSample: isM, outOfSample: oosM, walkForward: wfM, paper: paperM, live: null },
    walkForwardWindows: wfWindows,
    scoreBuckets: scoreBuckets(allTrades),
    sectorStats: sectorStats(allTrades),
    setupSplit: setupSplit(allTrades),
    costs: {
      assumptions: costs,
      totalCosts: Math.round(totalCosts * 100) / 100,
      commissionTotal, spreadTotal, slippageTotal, impactTotal,
      costDragPct: gross !== 0 ? Math.round((totalCosts / Math.abs(gross)) * 1000) / 10 : 0,
    },
    execution: {
      signalsGenerated: isRes.signalsGenerated + oosRes.signalsGenerated,
      entryOrdersRejected: isRes.entryOrdersRejected + oosRes.entryOrdersRejected,
      rejectReasons,
      exitReasons,
    },
    gates,
    autoPause,
    topTrades: sortedByPnl.slice(0, 5),
    worstTrades: sortedByPnl.slice(-5).reverse(),
    limitations: [
      paperNote || 'Kolona Paper mbushet nga journal-i Top10 i scanner-it (kërkon DB aktiv).',
      'Event risk (earnings/8K) është NEUTRAL në backtest — pa kalendar historik. Në live, Catalyst Gate bllokon hyrjet pranë earnings.',
      `Survivorship: universi vjen nga lista e sotme; ${removedDelisted.length} emra të delistuar përjashtohen sipas datës. Haircut i rekomanduar: ${survivorshipReport(symbols.length, removedDelisted.length).recommendedHaircutPct}% mbi fitimin.`,
      `Të dhënat: Yahoo Finance ditor ${years}-vjeçar; ${removedNoHistory.length} emra të përjashtuar për historik të pamjaftueshëm (IPO të vona).`,
      'Parametrat NUK janë optimizuar në IS — kështu IS/OOS testojnë stabilitetin në kohë, jo kurvën e optimizimit.',
      'Learning Engine është neutral (peshat 1.0) në backtest — versioni live i mëson nga rezultatet reale.',
    ],
  };

  cache = { at: Date.now(), report };
  return report;
}
