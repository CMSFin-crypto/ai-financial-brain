// ═══════════════════════════════════════════════════════════════
// Task 27 — IBKR VALIDATION / validation-lab.ts (orkestruesi)
// Task 28 — Universe 300 default + kalendar earnings EDGAR + A/B/C/D
// Task 29 — VERIFIKIMI ME UNIVERSIN 400:
//   • të dhëna 10-vjeçare (2016–2025)
//   • Walk-Forward KALENDARIKE: 2016–2020→2021 … 2020–2024→2025
//   • krahasimi Universe 120 vs 400 (të njëjtat rregulla, vetëm universi)
//   • paper trading me event real (journal Top10 + event score EDGAR as-of)
//   • verdikti automatik APPROVE / HOLD / REJECT
// Mos ndrysho rregullat e strategjisë — ndrysho vetëm universin.
// ═══════════════════════════════════════════════════════════════
import { fetchHistoricalData, HistoricalDataPoint } from '@/lib/alpha-vantage';
import { getScanUniverse } from '@/lib/scanner/universe-400';
import { SECTOR_MAP } from '@/app/api/ibkr-scan/route';
import {
  BacktestContext, PreparedSymbol, runBacktest, prepareSymbol, BacktestVariant,
} from './backtest-engine';
import { splitWindows, calendarWalkForward } from './walk-forward';
import {
  BacktestTrade, computeMetrics, scoreBuckets, sectorStats, setupSplit, MetricSet,
} from './metrics';
import { DEFAULT_COSTS, CostAssumptions } from './cost-model';
import { filterUniverseAsOf, survivorshipReport } from './universe-history';
import {
  ValidationReport, buildGateChecks, buildAutoPause, VariantComparison, EventScoreVerdict,
  buildFinalVerdict, WfCalendarWindow, UniverseComparison, PaperSignalRecord, PaperVsOos,
} from './report-builder';
import { fetchEarningsTimelines, EarningsTimeline, eventStateAsOf, eventScorePoints } from './earnings-history';

const SECTOR_ETF_MAP: Record<string, string> = {
  Tech: 'XLK', Consumer: 'XLY', Staples: 'XLP', Healthcare: 'XLV',
  Finance: 'XLF', Energy: 'XLE', Industrial: 'XLI', REITs: 'XLRE',
  Utilities: 'XLU', Communication: 'XLC', Materials: 'XLB',
};

const START_EQUITY = 25000;
const CACHE_TTL_MS = 6 * 3600 * 1000; // 6 orë

// Cache me key univers/vit — lista e fundit përmban deri 6 raporte
const cacheMap = new Map<string, { at: number; report: ValidationReport }>();

export interface LabParams {
  universeSize?: number;
  years?: number; // 3, 5 ose 10
  force?: boolean;
}

export async function runValidationLab(params: LabParams = {}): Promise<ValidationReport> {
  const universeSize = Math.min(Math.max(params.universeSize ?? 400, 20), 400);
  const yearsReq = params.years ?? 10;
  const years = yearsReq === 3 || yearsReq === 5 || yearsReq === 10 ? yearsReq : 10;
  const cacheKey = `u${universeSize}_y${years}`;
  const cached = cacheMap.get(cacheKey);
  if (!params.force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.report;
  }

  const range = years === 3 ? '3y' : years === 5 ? '5y' : '10y';

  // ── Universi kryesor + krahasuesi (Task 29: 400 kundrejt 120) ──
  // Të njëjtat të dhëna fetched NJË herë — vetëm lista e simboleve ndryshon.
  const compareSize = universeSize === 400 ? 120 : universeSize === 120 ? 400 : 0;
  const fetchSize = Math.max(universeSize, compareSize);

  const rawUniverse = [...new Set(getScanUniverse(fetchSize))];
  const etfs = [...new Set(Object.values(SECTOR_ETF_MAP))];

  const fetchList: { symbol: string; kind: 'stock' }[] =
    rawUniverse.map(s => ({ symbol: s, kind: 'stock' as const }));

  const BATCH = 10;
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
    if (i + BATCH < fetchList.length) await new Promise(r => setTimeout(r, 120));
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

  // ── KALENDARI HISTORIK I EARNINGS (EDGAR 8-K Item 2.02) ──
  const { timelines, withEvents } = await fetchEarningsTimelines(kept, hist);
  const totalEvents = Object.values(timelines).reduce((a, t) => a + t.events.length, 0);

  const symbolsAll: PreparedSymbol[] = [];
  for (const sym of kept) {
    const d = hist[sym];
    if (!d || d.length < 210) continue;
    const ps = prepareSymbol(sym, SECTOR_MAP[sym] || 'Other', d);
    const tl: EarningsTimeline | undefined = timelines[sym];
    if (tl && tl.events.length > 0) ps.earnings = tl;
    symbolsAll.push(ps);
  }

  // Task 29: primari = VETËM universi i kërkuar (jo i gjithë fetch-i).
  // Të dhënat fetched një herë për unionin (max e primary/baseline), por
  // çdo raport teston vetëm listën e vet — krahasimi është i drejtë.
  const primarySet = new Set(getScanUniverse(universeSize));
  const symbols = symbolsAll.filter(s => primarySet.has(s.symbol));

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

  // ── 3. Ndarja statike IS/OOS (70/30) + dritaret ──
  const totalDays = calendar.length;
  const split = splitWindows(totalDays, { isPct: 0.70, wfWindows: 4 });
  const wfCal = years === 10 ? calendarWalkForward(calendar) : [];

  // ── Testi A/B/C/D: të njëjtat të dhëna, të njëjtat rregulla ──
  const variantDefs: { key: BacktestVariant; label: string; description: string }[] = [
    { key: 'baseline', label: 'A — Baseline', description: 'Trend + pullback pa Event Score (bërthama teknike)' },
    { key: 'event-filter', label: 'B — Event Filter', description: 'Shmang earnings e afërta: -3 pikë (≤2 ditë), -1 (3-7 ditë), bllokim ditën e hyrjes' },
    { key: 'event-score', label: 'C — Event Score', description: 'B + surprise/PEAD: +2 (surprise pozitiv + drift), +1 (pa drift), -2 (surprise negativ)' },
    { key: 'full', label: 'D — Full Strategy', description: 'C + gjithë filtrat IBKR: breadth, RS sektori, regjimi, RSI>70, VIX stop, targetR sipas breadth' },
  ];
  const variants: VariantComparison[] = [];
  const variantRes: Record<string, { isM: MetricSet; oosM: MetricSet; isRes: ReturnType<typeof runBacktest>; oosRes: ReturnType<typeof runBacktest> }> = {};
  for (const vd of variantDefs) {
    const isResV = runBacktest(ctx, {
      startIndex: split.static.isStart, endIndex: split.static.isEnd, variant: vd.key,
    });
    const oosResV = runBacktest(ctx, {
      startIndex: split.static.oosStart, endIndex: split.static.oosEnd, variant: vd.key,
    });
    variantRes[vd.key] = {
      isM: computeMetrics(isResV.trades, START_EQUITY),
      oosM: computeMetrics(oosResV.trades, START_EQUITY),
      isRes: isResV, oosRes: oosResV,
    };
    variants.push({ key: vd.key, label: vd.label, description: vd.description, is: variantRes[vd.key].isM, oos: variantRes[vd.key].oosM });
  }

  // Kolonat kryesore = strategjia FULL (D)
  const isRes = variantRes['full'].isRes;
  const oosRes = variantRes['full'].oosRes;

  // ── WALK-FORWARD: kalendarike (10v) ose anchored 4 dritare (3v/5v) ──
  const wfTrades: BacktestTrade[] = [];
  const wfWindows: ValidationReport['walkForwardWindows'] = [];
  const wfCalendarWindows: WfCalendarWindow[] = [];

  if (wfCal.length > 0) {
    // Task 29: 2016–2020→2021 … 2020–2024→2025 (train 5v → test 1v)
    for (const w of wfCal) {
      const trainRes = runBacktest(ctx, { startIndex: w.trainStart, endIndex: w.trainEnd, variant: 'full' });
      const testRes = runBacktest(ctx, { startIndex: w.testStart, endIndex: w.testEnd, variant: 'full' });
      wfTrades.push(...testRes.trades);
      const trainM = computeMetrics(trainRes.trades, START_EQUITY);
      const testM = computeMetrics(testRes.trades, START_EQUITY);
      wfCalendarWindows.push({
        window: w.window, label: w.label,
        trainFrom: w.trainFrom, trainTo: w.trainTo,
        testFrom: w.testFrom, testTo: w.testTo,
        train: {
          trades: trainM.trades, winRatePct: trainM.winRatePct,
          profitFactor: trainM.profitFactor, netProfit: trainM.netProfit,
        },
        test: {
          trades: testM.trades, winRatePct: testM.winRatePct,
          profitFactor: testM.profitFactor, expectancy: testM.expectancy,
          maxDrawdownPct: testM.maxDrawdownPct, netProfit: testM.netProfit, avgR: testM.avgR,
        },
      });
      wfWindows.push({
        window: w.window,
        from: w.testFrom, to: w.testTo,
        trades: testM.trades, winRatePct: testM.winRatePct, avgR: testM.avgR, netProfit: testM.netProfit,
      });
    }
  } else {
    for (const w of split.walkForward) {
      const res = runBacktest(ctx, { startIndex: w.oosStart, endIndex: w.oosEnd, variant: 'full' });
      wfTrades.push(...res.trades);
      const m = computeMetrics(res.trades, START_EQUITY);
      wfWindows.push({
        window: w.window,
        from: calendar[w.oosStart], to: calendar[w.oosEnd],
        trades: m.trades, winRatePct: m.winRatePct, avgR: m.avgR, netProfit: m.netProfit,
      });
    }
  }

  const allTrades = [...isRes.trades, ...oosRes.trades];
  const isM = computeMetrics(isRes.trades, START_EQUITY);
  const oosM = computeMetrics(oosRes.trades, START_EQUITY);
  const wfM = computeMetrics(wfTrades, START_EQUITY);

  // ── KRAHASIMI I UNIVERSIT (Task 29): 400 kundrejt 120 ──
  // Vetëm strategjia FULL (D). Të njëjtat të dhëna, të njëjtat rregulla,
  // të njëjtat dritere — ndryshon VETËM lista e simboleve të skanimit.
  let universeComparison: UniverseComparison | null = null;
  if (compareSize > 0) {
    const compareSet = new Set(getScanUniverse(compareSize));
    const subSymbols = symbolsAll.filter(s => compareSet.has(s.symbol));
    if (subSymbols.length >= 20 && subSymbols.length !== symbols.length) {
      const ctxC: BacktestContext = {
        ...ctx, symbols: subSymbols, universeSize: subSymbols.length,
      };
      const cIs = runBacktest(ctxC, { startIndex: split.static.isStart, endIndex: split.static.isEnd, variant: 'full' });
      const cOos = runBacktest(ctxC, { startIndex: split.static.oosStart, endIndex: split.static.oosEnd, variant: 'full' });
      const cWfTrades: BacktestTrade[] = [];
      for (const w of wfCal.length > 0 ? wfCal : []) {
        const r = runBacktest(ctxC, { startIndex: w.testStart, endIndex: w.testEnd, variant: 'full' });
        cWfTrades.push(...r.trades);
      }
      const cWfM = cWfTrades.length > 0
        ? computeMetrics(cWfTrades, START_EQUITY)
        : computeMetrics([], START_EQUITY);
      universeComparison = {
        primaryLabel: `Universi ${symbols.length}`,
        baselineLabel: `Universi ${subSymbols.length}`,
        primary: {
          size: symbols.length,
          signals: isRes.signalsGenerated + oosRes.signalsGenerated,
          signalsScore80Plus: [...isRes.signalScores, ...oosRes.signalScores].filter(s => s >= 80).length,
          oos: oosM,
          wfTest: wfM,
        },
        baseline: {
          size: subSymbols.length,
          signals: cIs.signalsGenerated + cOos.signalsGenerated,
          signalsScore80Plus: [...cIs.signalScores, ...cOos.signalScores].filter(s => s >= 80).length,
          oos: computeMetrics(cOos.trades, START_EQUITY),
          wfTest: cWfM,
        },
        note: 'Të njëjtat indikatorë, score, Event Score, PEAD, regjim, sector cap, korrelacion, stop/target, risk/tregti, komisione/slippage dhe dritaret train/test — ndryshon VETËM universi i skanimit. Universi i gjerë shton statistikë pa shtuar pozicione (funnel: 400 skanohen → 3-5 tregtohen).',
      };
    }
  }

  // ── Verdikti i Event Score: C kundrejt A (OOS) ──
  const aOos = variantRes['baseline'].oosM;
  const cOos = variantRes['event-score'].oosM;
  const oosTradesDelta = cOos.trades - aOos.trades;
  const oosExpDelta = Math.round((cOos.expectancy - aOos.expectancy) * 100) / 100;
  const oosWrDelta = Math.round((cOos.winRatePct - aOos.winRatePct) * 10) / 10;
  const oosDdDelta = Math.round((aOos.maxDrawdownPct - cOos.maxDrawdownPct) * 10) / 10; // pozitiv = më mirë
  const keep = cOos.trades >= 20 && (oosExpDelta > 0 || oosDdDelta > 0);
  const eventScoreVerdict: EventScoreVerdict = {
    oosTradesDelta, oosExpectancyDelta: oosExpDelta, oosWinRateDelta: oosWrDelta,
    oosDrawdownDelta: oosDdDelta, keep,
    note: keep
      ? `Event Score IA VLEN: ${oosTradesDelta === 0 ? 'të njëjtin numër' : `${oosTradesDelta} tregti më pak/pak`}, expectancy ${oosExpDelta >= 0 ? '+' : ''}${oosExpDelta}$/tregti, drawdown ${oosDdDelta >= 0 ? '-' : '+'}${Math.abs(oosDdDelta)}pk në OOS — cilësia mbi sasinë.`
      : `Event Score NUK e justifikohet në këto të dhëna: ${oosTradesDelta} tregti më pak në OOS pa përmirësim të expectancy (${oosExpDelta >= 0 ? '+' : ''}${oosExpDelta}$/tregti) ose drawdown — rishiko pragjet e pikëve.`,
  };

  // ── 4. PAPER TRADING me event real (journal Top10 + EDGAR as-of) ──
  let paperM: ValidationReport['table']['paper'] = null;
  let paperCount = 0;
  let paperNote = '';
  let paperSignals: PaperSignalRecord[] = [];
  let paperVsOos: PaperVsOos | null = null;
  let paperClosedCount = 0;
  let paperWR: number | null = null;
  let paperExpR: number | null = null;
  try {
    const { buildWeeklyReport, getRecentJournalEntries } = await import('@/lib/top10-journal');
    const rep = await buildWeeklyReport(90);
    if (rep.dbActive && rep.totals.closed + rep.totals.expired > 0) {
      const closedN = rep.totals.closed + rep.totals.expired;
      paperCount = closedN;
      paperClosedCount = closedN;
      paperWR = rep.directionAccuracy ?? rep.hitRate ?? 0;
      paperExpR = rep.expectancyR ?? null;
      const wr = paperWR;
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

    // Task 29: rreshtat individualë me event score REAL (EDGAR as-of ditën e sinjalit)
    const entries = await getRecentJournalEntries(90, 300);
    if (entries && entries.length > 0) {
      let eventSignalsNear = 0;
      let eventSignalsWithScore = 0;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const tl = timelines[e.ticker];
        const st = eventStateAsOf(tl, e.scanDate, calendar);
        const evScore = st.hasData ? eventScorePoints(st) : null;
        if (evScore !== null) eventSignalsWithScore++;
        if (st.earningsWithin2d) eventSignalsNear++;
        if (i < 14) {
          const atrPct = e.atrPct ?? null;
          paperSignals.push({
            signalDate: e.scanDate,
            dataAvailableAt: `${e.scanDate} (EOD — Yahoo + EDGAR 8-K)`,
            ticker: e.ticker,
            score: e.score ?? null,
            eventScore: evScore,
            daysToEarnings: st.daysUntilNext,
            entry: e.entry ?? null,
            stop: e.stop ?? null,
            target: e.target ?? null,
            fillStatus: e.entryHit
              ? 'FILL'
              : e.exitStatus === 'NO_FILL' ? 'NO_FILL' : e.exitStatus ? 'PENDING' : 'OPEN',
            exitStatus: e.exitStatus ?? null,
            resultR: e.resultR ?? null,
            slippageEstPct: atrPct != null
              ? Math.round((0.04 + 0.012 * atrPct) * 10000) / 10000
              : null,
          });
        }
      }
      const wrDev = paperWR != null ? Math.round((paperWR - oosM.winRatePct) * 10) / 10 : null;
      const rDev = paperExpR != null ? Math.round((paperExpR - oosM.avgR) * 100) / 100 : null;
      paperVsOos = {
        paperTradesClosed: paperClosedCount,
        paperWinRatePct: paperWR,
        paperExpectancyR: paperExpR,
        oosWinRatePct: oosM.winRatePct,
        oosAvgR: oosM.avgR,
        winRateDeviationPct: wrDev,
        avgRDeviation: rDev,
        eventSignalsNear,
        eventSignalsWithScore,
        enoughSample: paperClosedCount >= 50,
        note: paperClosedCount >= 20
          ? `Paper (${paperWR}% WR, ${paperExpR}R expectancy) kundrejt OOS (${oosM.winRatePct}%, ${oosM.avgR}R) — devijim ${wrDev} pk. Çmimet janë reale, ekzekutimet të simuluara (fills sipas top-of-book); ${eventSignalsNear}/${entries.length} sinjale kishin earnings brenda 2 ditësh.`
          : `Paper ka ${paperClosedCount} rezultate të mbyllura — duhen ≥ 20 për krahasim statistikor (50+ për gate). ${eventSignalsNear}/${entries.length} sinjale kishin earnings brenda 2 ditësh (event score real EDGAR).`,
      };
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

  // ── 6. Gates + auto-pause + VERDIKTI (Task 29) ──
  const gates = buildGateChecks({
    is: isM, oos: oosM, wf: wfM,
    paperTradesCount: paperCount,
    slippageEstimatePct: Math.round(avgCostPct * 1000) / 1000,
    oosWinRate: oosM.winRatePct, isWinRate: isM.winRatePct,
  });
  const autoPause = buildAutoPause({ is: isM, oos: oosM });

  const finalVerdict = buildFinalVerdict({
    oos: oosM,
    wfCalendarWindows,
    trades: oosRes.trades, // koncentrimi matet në OOS (jo në IS)
    paper: paperVsOos,
    oosTradesCount: oosM.trades,
  });

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
    wfCalendarWindows,
    universeComparison,
    finalVerdict,
    paperSignals,
    paperVsOos,
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
    variants,
    eventScoreVerdict,
    earningsData: {
      symbolsWithTimeline: withEvents,
      totalEvents,
      coveragePct: symbols.length > 0 ? Math.round((withEvents / symbols.length) * 1000) / 10 : 0,
      source: 'SEC EDGAR — 8-K Item 2.02 (data e publikimit, 100% point-in-time)',
    },
    limitations: [
      paperNote || 'Kolona Paper mbushet nga journal-i Top10 i scanner-it (kërkon DB aktiv).',
      `Kalendar historik earnings: ${withEvents}/${symbols.length} simbole me timeline EDGAR (${totalEvents} events 8-K Item 2.02). Simbolet pa timeline mbeten event-neutral (kryesisht ADR-t e huaja BABA/TM/HMC etj. qe publikojne 6-K, jo 8-K 2.02). Surprise/PEAD është proxy nga reagimi i çmimit (±2%, 2-ditor) + drift 5-ditor — jo estimate reale (ato kërkojnë burim me pagesë).`,
      `Survivorship: universi vjen nga lista e sotme; ${removedDelisted.length} emra të delistuar përjashtohen sipas datës. Haircut i rekomanduar: ${survivorshipReport(symbols.length, removedDelisted.length).recommendedHaircutPct}% mbi fitimin.`,
      `Të dhënat: Yahoo Finance ditor ${years}-vjeçar; ${removedNoHistory.length} emra të përjashtuar për historik të pamjaftueshëm (IPO të vona).`,
      years === 10
        ? 'Dritarja e parë WF (2016–2020) fillon sinjalet nga ~gusht 2016 — motori kërkon 210 ditë ngrohjeje nga fillimi i të dhënave (shtator 2015). Testi 2025 mbulon janar–shtator 2025 (viti në vazhdim).'
        : 'Parametrat NUK janë optimizuar në IS — kështu IS/OOS testojnë stabilitetin në kohë, jo kurvën e optimizimit.',
      'Parametrat NUK ndryshohen pasi shihen rezultatet e testit — nëse ndryshojnë, duhet nisur dritare e re train/test.',
      'Learning Engine është neutral (peshat 1.0) në backtest — versioni live i mëson nga rezultatet reale.',
      'Paper trading: çmimet janë reale por ekzekutimet të simuluara — fills sipas top-of-book; urdhrat kompleks stop/target mund të sillen ndryshe në llogari reale.',
    ],
  };

  if (cacheMap.size > 5) cacheMap.clear();
  cacheMap.set(cacheKey, { at: Date.now(), report });
  return report;
}
